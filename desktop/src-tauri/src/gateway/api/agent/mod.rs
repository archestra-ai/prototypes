use axum::{
    extract::State,
    http::{HeaderMap, StatusCode, Method, header},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::post,
    Json, Router,
};
use tower_http::cors::{CorsLayer, Any};
use futures_util::stream::{Stream, StreamExt};
use reqwest::Client;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};

use std::{convert::Infallible, time::Duration};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

mod types;
use types::*;

use crate::ollama::OLLAMA_SERVER_PORT;
use std::sync::Arc;

/// Ollama chat request format
#[derive(Debug, Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OllamaTool>>,
}

/// Ollama tool format
#[derive(Debug, Serialize, Deserialize)]
struct OllamaTool {
    #[serde(rename = "type")]
    tool_type: String,
    function: OllamaToolFunction,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaToolFunction {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct OllamaMessage {
    role: String,
    content: String,
}

/// Ollama streaming response chunk
#[derive(Debug, Deserialize)]
struct OllamaChatChunk {
    #[allow(dead_code)]
    model: String,
    #[allow(dead_code)]
    created_at: String,
    message: OllamaMessageChunk,
    done: bool,
    #[serde(default)]
    #[allow(dead_code)]
    total_duration: Option<u64>,
    #[serde(default)]
    prompt_eval_count: Option<u32>,
    #[serde(default)]
    eval_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct OllamaMessageChunk {
    #[allow(dead_code)]
    role: String,
    content: String,
    #[serde(default)]
    tool_calls: Option<Vec<OllamaToolCall>>,
}

#[derive(Debug, Deserialize)]
struct OllamaToolCall {
    id: Option<String>,
    #[serde(rename = "type")]
    #[allow(dead_code)]
    tool_type: Option<String>,
    function: OllamaFunction,
}

#[derive(Debug, Deserialize)]
struct OllamaFunction {
    name: String,
    arguments: serde_json::Value,
}

/// Service for handling agent requests
struct AgentService {
    db: Arc<DatabaseConnection>,
    http_client: Client,
}

impl AgentService {
    fn new(db: DatabaseConnection) -> Self {
        Self {
            db: Arc::new(db),
            http_client: Client::builder()
                .timeout(Duration::from_secs(180))
                .build()
                .unwrap_or_default(),
        }
    }
}

/// Create the agent router with SSE endpoints
pub fn create_router(db: DatabaseConnection) -> Router {
    let service = Arc::new(AgentService::new(db));
    
    // Configure CORS to handle all responses including errors
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .max_age(std::time::Duration::from_secs(3600));
    
    Router::new()
        .route("/chat", post(handle_agent_chat).options(handle_options))
        .with_state(service)
        .layer(cors)
}

/// Handle OPTIONS requests for CORS preflight
async fn handle_options() -> Result<Response, StatusCode> {
    let mut headers = HeaderMap::new();
    headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    headers.insert("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS".parse().unwrap());
    headers.insert("Access-Control-Allow-Headers", "Content-Type, Authorization".parse().unwrap());
    headers.insert("Access-Control-Max-Age", "3600".parse().unwrap());
    
    Ok((headers, "").into_response())
}

/// Request body for agent chat endpoint
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AgentChatRequest {
    messages: Vec<ChatMessage>,
    #[serde(default)]
    agent_context: Option<AgentContext>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    stream: Option<bool>,
    #[serde(default)]
    tools: Option<Vec<String>>,
}

/// Handle agent chat requests with SSE streaming
async fn handle_agent_chat(
    State(service): State<Arc<AgentService>>,
    Json(payload): Json<AgentChatRequest>,
) -> Result<Response, StatusCode> {
    // Default to streaming unless explicitly set to false
    let should_stream = payload.stream.unwrap_or(true);
    
    if !should_stream {
        // Non-streaming response (not implemented yet)
        return Err(StatusCode::NOT_IMPLEMENTED);
    }
    
    // Create SSE stream
    let stream = create_agent_stream(service, payload).await;
    
    // Build response with CORS headers
    let mut headers = HeaderMap::new();
    headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    headers.insert("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS".parse().unwrap());
    headers.insert("Access-Control-Allow-Headers", "Content-Type, Authorization".parse().unwrap());
    headers.insert("Cache-Control", "no-cache".parse().unwrap());
    
    let sse = Sse::new(stream)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(30)));
    
    Ok((headers, sse).into_response())
}

/// Create the SSE stream for agent responses
async fn create_agent_stream(
    service: Arc<AgentService>,
    request: AgentChatRequest,
) -> impl Stream<Item = Result<Event, Infallible>> {
    let (tx, rx) = mpsc::channel::<SseMessage>(100);
    
    // Spawn task to handle agent execution
    tokio::spawn(async move {
        if let Err(e) = execute_agent_stream(service, request, tx.clone()).await {
            // Send error event
            let _ = tx.send(SseMessage::Error {
                error: format!("Agent execution failed: {}", e),
            }).await;
        }
    });
    
    // Convert receiver to SSE events
    ReceiverStream::new(rx).map(|msg| {
        Ok(match msg {
            SseMessage::MessageStart { id, role } => {
                Event::default()
                    .event("message_start")
                    .data(serde_json::to_string(&MessageStartEvent { id, role }).unwrap())
            }
            SseMessage::ContentDelta { delta } => {
                Event::default()
                    .event("content_delta")
                    .data(serde_json::to_string(&ContentDeltaEvent { delta }).unwrap())
            }
            SseMessage::ToolCallStart { tool_call_id, tool_name } => {
                Event::default()
                    .event("tool_call_start")
                    .data(serde_json::to_string(&ToolCallStartEvent {
                        tool_call_id,
                        tool_name,
                    }).unwrap())
            }
            SseMessage::ToolCallDelta { tool_call_id, args_delta } => {
                Event::default()
                    .event("tool_call_delta")
                    .data(serde_json::to_string(&ToolCallDeltaEvent {
                        tool_call_id,
                        args_delta,
                    }).unwrap())
            }
            SseMessage::ToolCallResult { tool_call_id, tool_name, result } => {
                Event::default()
                    .event("tool_call_result")
                    .data(serde_json::to_string(&ToolCallResultEvent {
                        tool_call_id,
                        tool_name,
                        result,
                    }).unwrap())
            }
            SseMessage::DataPart { data_type, data } => {
                Event::default()
                    .event("data_part")
                    .data(serde_json::to_string(&DataPartEvent {
                        data_type,
                        data,
                    }).unwrap())
            }
            SseMessage::MessageComplete { usage } => {
                Event::default()
                    .event("message_complete")
                    .data(serde_json::to_string(&MessageCompleteEvent { usage }).unwrap())
            }
            SseMessage::Error { error } => {
                Event::default()
                    .event("error")
                    .data(serde_json::to_string(&ErrorEvent { error }).unwrap())
            }
            SseMessage::Ping => {
                Event::default()
                    .event("ping")
                    .data("{}")
            }
        })
    })
}

/// Execute agent and stream results
async fn execute_agent_stream(
    service: Arc<AgentService>,
    request: AgentChatRequest,
    tx: mpsc::Sender<SseMessage>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Start message
    let message_id = uuid::Uuid::new_v4().to_string();
    tx.send(SseMessage::MessageStart {
        id: message_id.clone(),
        role: "assistant".to_string(),
    }).await?;
    
    // Check if this is an agent activation or agent message
    let mut messages = request.messages;
    if let Some(agent_context) = &request.agent_context {
        if agent_context.mode.as_deref() == Some("autonomous") {
            // Send agent state update
            tx.send(SseMessage::DataPart {
                data_type: "agent-state".to_string(),
                data: serde_json::json!({
                    "mode": "planning",
                    "objective": agent_context.objective,
                }),
            }).await?;
            
            // If this is an activation, prepend system prompt
            if agent_context.activate.unwrap_or(false) {
                if let Some(objective) = &agent_context.objective {
                    // Add system prompt for agent behavior
                    messages.insert(0, ChatMessage {
                        role: "system".to_string(),
                        content: format!(
                            "You are an autonomous AI agent. Your objective is: {}\n\n\
                            You should:\n\
                            1. Break down the objective into clear tasks\n\
                            2. Execute tasks using available tools\n\
                            3. Provide reasoning for your actions\n\
                            4. Report progress and results\n\n\
                            Think step by step and use tools when needed.",
                            objective
                        ),
                    });
                    
                    // Send initial reasoning
                    tx.send(SseMessage::DataPart {
                        data_type: "reasoning".to_string(),
                        data: serde_json::json!({
                            "type": "planning",
                            "content": format!("Analyzing objective: {}", objective),
                        }),
                    }).await?;
                }
            }
        } else if agent_context.mode.as_deref() == Some("stop") {
            // Handle stop command
            tx.send(SseMessage::ContentDelta {
                delta: "Agent execution stopped.".to_string(),
            }).await?;
            tx.send(SseMessage::MessageComplete { usage: None }).await?;
            return Ok(());
        }
    }
    
    // Convert messages to Ollama format
    let ollama_messages: Vec<OllamaMessage> = messages.into_iter()
        .map(|msg| OllamaMessage {
            role: msg.role,
            content: msg.content,
        })
        .collect();
    
    // Convert tool names to Ollama tool format if provided
    let tools = if let Some(tool_names) = request.tools {
        Some(convert_tools_to_ollama_format(&service.db, tool_names).await?)
    } else {
        None
    };
    
    // Build Ollama request
    let ollama_request = OllamaChatRequest {
        model: request.model.unwrap_or_else(|| "llama3.2".to_string()),
        messages: ollama_messages,
        stream: true,
        tools,
    };
    
    // Call Ollama API
    let ollama_url = format!("http://localhost:{}/api/chat", OLLAMA_SERVER_PORT);
    let response = service.http_client
        .post(&ollama_url)
        .json(&ollama_request)
        .send()
        .await?;
    
    if !response.status().is_success() {
        return Err(format!("Ollama API error: {}", response.status()).into());
    }
    
    // Stream response chunks
    let mut stream = response.bytes_stream();
    let mut accumulated_content = String::new();
    
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        let text = String::from_utf8_lossy(&chunk);
        
        // Parse each line as a JSON object (Ollama sends newline-delimited JSON)
        for line in text.lines() {
            if line.trim().is_empty() {
                continue;
            }
            
            match serde_json::from_str::<OllamaChatChunk>(line) {
                Ok(chat_chunk) => {
                    // Send content delta
                    if !chat_chunk.message.content.is_empty() {
                        accumulated_content.push_str(&chat_chunk.message.content);
                        tx.send(SseMessage::ContentDelta {
                            delta: chat_chunk.message.content.clone(),
                        }).await?;
                    }
                    
                    // Handle tool calls if present
                    if let Some(tool_calls) = chat_chunk.message.tool_calls {
                        for tool_call in tool_calls {
                            let tool_id = tool_call.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                            let tool_name = tool_call.function.name.clone();
                            
                            // Send tool call start event
                            tx.send(SseMessage::ToolCallStart {
                                tool_call_id: tool_id.clone(),
                                tool_name: tool_name.clone(),
                            }).await?;
                            
                            // Send tool arguments
                            tx.send(SseMessage::ToolCallDelta {
                                tool_call_id: tool_id.clone(),
                                args_delta: tool_call.function.arguments.to_string(),
                            }).await?;
                            
                            // Execute tool server-side
                            match execute_mcp_tool(&service.db, &tool_name, &tool_call.function.arguments).await {
                                Ok(result) => {
                                    tx.send(SseMessage::ToolCallResult {
                                        tool_call_id: tool_id,
                                        tool_name,
                                        result,
                                    }).await?;
                                }
                                Err(e) => {
                                    tx.send(SseMessage::ToolCallResult {
                                        tool_call_id: tool_id,
                                        tool_name,
                                        result: serde_json::json!({
                                            "error": format!("Tool execution failed: {}", e)
                                        }),
                                    }).await?;
                                }
                            }
                        }
                    }
                    
                    // If done, send usage stats
                    if chat_chunk.done {
                        if let (Some(prompt_tokens), Some(completion_tokens)) = 
                            (chat_chunk.prompt_eval_count, chat_chunk.eval_count) {
                            tx.send(SseMessage::MessageComplete {
                                usage: Some(UsageStats {
                                    prompt_tokens,
                                    completion_tokens,
                                    total_tokens: prompt_tokens + completion_tokens,
                                }),
                            }).await?;
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Failed to parse Ollama chunk: {}, line: {}", e, line);
                }
            }
        }
    }
    
    // If no usage stats were sent (in case of early termination), send completion
    if accumulated_content.is_empty() {
        tx.send(SseMessage::MessageComplete {
            usage: None,
        }).await?;
    }
    
    Ok(())
}

/// Convert tool names (serverName_toolName) to Ollama tool format
/// For now, we create basic tool definitions based on the tool names
/// In the future, this could query the actual tool schemas from MCP servers
async fn convert_tools_to_ollama_format(
    _db: &DatabaseConnection,
    tool_names: Vec<String>,
) -> Result<Vec<OllamaTool>, Box<dyn std::error::Error + Send + Sync>> {
    let mut ollama_tools = Vec::new();
    
    for tool_name in tool_names {
        // For now, create a basic tool definition
        // The actual tool execution will happen through the MCP proxy
        ollama_tools.push(OllamaTool {
            tool_type: "function".to_string(),
            function: OllamaToolFunction {
                name: tool_name.clone(),
                description: format!("MCP tool: {}", tool_name),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {},
                    "additionalProperties": true
                }),
            },
        });
    }
    
    Ok(ollama_tools)
}

/// Execute an MCP tool through the proxy
async fn execute_mcp_tool(
    _db: &DatabaseConnection,
    tool_name: &str,
    arguments: &serde_json::Value,
) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
    // Split serverName_toolName
    let parts: Vec<&str> = tool_name.splitn(2, '_').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid tool name format: {}", tool_name).into());
    }
    
    let server_name = parts[0];
    let tool_name_only = parts[1];
    
    // Create JSON-RPC request for MCP proxy
    let mcp_request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": uuid::Uuid::new_v4().to_string(),
        "method": "tools/call",
        "params": {
            "name": tool_name_only,
            "arguments": arguments
        }
    });
    
    // Call MCP proxy endpoint
    let client = reqwest::Client::new();
    let proxy_url = format!("http://localhost:{}/mcp_proxy/{}", crate::gateway::GATEWAY_SERVER_PORT, server_name);
    
    let response = client
        .post(&proxy_url)
        .json(&mcp_request)
        .send()
        .await?;
    
    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(format!("MCP proxy error: {}", error_text).into());
    }
    
    let result: serde_json::Value = response.json().await?;
    
    // Extract result from JSON-RPC response
    if let Some(error) = result.get("error") {
        return Err(format!("MCP tool error: {}", error).into());
    }
    
    Ok(result.get("result").cloned().unwrap_or(serde_json::Value::Null))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_agent_chat_endpoint() {
        // Mock database connection
        let db = sea_orm::DatabaseConnection::default();
        let app = create_router(db);

        let request = Request::builder()
            .method("POST")
            .uri("/chat")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::to_string(&AgentChatRequest {
                    messages: vec![ChatMessage {
                        role: "user".to_string(),
                        content: "Hello, agent!".to_string(),
                    }],
                    agent_context: None,
                    model: Some("llama3.2".to_string()),
                    stream: Some(true),
                })
                .unwrap(),
            ))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        
        // Verify it's an SSE response
        let content_type = response.headers().get("content-type").unwrap();
        assert_eq!(content_type, "text/event-stream");
    }
}