use axum::{
    extract::State,
    http::{header, HeaderMap, Method, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::post,
    Json, Router,
};
use futures_util::stream::{Stream, StreamExt};
use reqwest::Client;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use tower_http::cors::{Any, CorsLayer};

use std::{convert::Infallible, time::Duration};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

pub mod crud;
mod types;
use types::*;

use crate::ollama::server::get_ollama_server_port;
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
#[derive(Debug, Serialize, Deserialize, Clone)]
struct OllamaTool {
    #[serde(rename = "type")]
    tool_type: String,
    function: OllamaToolFunction,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct OllamaToolFunction {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Serialize, Clone)]
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

/// Service for handling chat requests
struct ChatService {
    db: Arc<DatabaseConnection>,
    http_client: Client,
}

impl ChatService {
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

/// Create the chat router with both CRUD and SSE endpoints
pub fn create_router(db: DatabaseConnection) -> Router {
    let stream_service = Arc::new(ChatService::new(db.clone()));

    // Configure CORS to handle all responses including errors
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .max_age(std::time::Duration::from_secs(3600));

    // Create CRUD router
    let crud_router = crud::create_crud_router(db);

    // Create streaming router
    let stream_router = Router::new()
        .route("/stream", post(handle_chat).options(handle_options))
        .with_state(stream_service);

    // Merge routers
    Router::new()
        .merge(crud_router)
        .merge(stream_router)
        .layer(cors)
}

/// Handle OPTIONS requests for CORS preflight
async fn handle_options() -> Result<Response, StatusCode> {
    let mut headers = HeaderMap::new();
    headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    headers.insert(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS".parse().unwrap(),
    );
    headers.insert(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization".parse().unwrap(),
    );
    headers.insert("Access-Control-Max-Age", "3600".parse().unwrap());

    Ok((headers, "").into_response())
}

/// Request body for chat endpoint
#[derive(Debug, Deserialize, Serialize)]
#[allow(dead_code)]
struct ChatRequest {
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

/// Handle chat requests with SSE streaming
async fn handle_chat(
    State(service): State<Arc<ChatService>>,
    Json(payload): Json<ChatRequest>,
) -> Result<Response, StatusCode> {
    // Log the received request
    eprintln!("[handle_chat] Received request with model: {:?}", payload.model);
    
    // Default to streaming unless explicitly set to false
    let should_stream = payload.stream.unwrap_or(true);

    if !should_stream {
        // Non-streaming response (not implemented yet)
        return Err(StatusCode::NOT_IMPLEMENTED);
    }

    // Create SSE stream
    let stream = create_chat_stream(service, payload).await;

    // Build response with CORS headers
    let mut headers = HeaderMap::new();
    headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    headers.insert(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS".parse().unwrap(),
    );
    headers.insert(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization".parse().unwrap(),
    );
    headers.insert("Cache-Control", "no-cache".parse().unwrap());
    headers.insert("x-vercel-ai-ui-message-stream", "v1".parse().unwrap());

    let sse = Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(30)));

    Ok((headers, sse).into_response())
}

/// Create the SSE stream for chat responses
async fn create_chat_stream(
    service: Arc<ChatService>,
    request: ChatRequest,
) -> impl Stream<Item = Result<Event, Infallible>> {
    let (tx, rx) = mpsc::channel::<SseMessage>(100);

    // Spawn task to handle chat execution
    tokio::spawn(async move {
        if let Err(e) = execute_chat_stream(service, request, tx.clone()).await {
            // Send error event
            let _ = tx
                .send(SseMessage::Error {
                    error: format!("Chat execution failed: {}", e),
                })
                .await;
        }
    });

    // Convert receiver to SSE events following Vercel AI SDK v5 protocol
    ReceiverStream::new(rx).map(|msg| {
        Ok(match msg {
            SseMessage::MessageStart { id, role: _ } => {
                // Start message event
                Event::default().data(
                    serde_json::to_string(&serde_json::json!({
                        "type": "start",
                        "messageId": id
                    }))
                    .unwrap(),
                )
            }
            SseMessage::TextStart { id } => {
                // Text start event
                Event::default().data(
                    serde_json::to_string(&serde_json::json!({
                        "type": "text-start",
                        "id": id
                    }))
                    .unwrap(),
                )
            }
            SseMessage::TextDelta { id, delta } => {
                // Text delta event
                Event::default().data(
                    serde_json::to_string(&serde_json::json!({
                        "type": "text-delta",
                        "id": id,
                        "delta": delta
                    }))
                    .unwrap(),
                )
            }
            SseMessage::TextEnd { id } => {
                // Text end event
                Event::default().data(
                    serde_json::to_string(&serde_json::json!({
                        "type": "text-end",
                        "id": id
                    }))
                    .unwrap(),
                )
            }
            SseMessage::ContentDelta { delta } => {
                // Legacy support - convert to TextDelta with default ID
                Event::default().data(
                    serde_json::to_string(&serde_json::json!({
                        "type": "text-delta",
                        "id": "text-main",
                        "delta": delta
                    }))
                    .unwrap(),
                )
            }
            SseMessage::StreamEnd => {
                // Stream end marker
                Event::default().data("[DONE]")
            }
            SseMessage::ToolCallStart {
                tool_call_id,
                tool_name,
            } => {
                // Tool input start
                Event::default().data(
                    serde_json::to_string(&serde_json::json!({
                        "type": "tool-input-start",
                        "toolCallId": tool_call_id,
                        "toolName": tool_name
                    }))
                    .unwrap(),
                )
            }
            SseMessage::ToolCallDelta {
                tool_call_id,
                args_delta,
            } => {
                // Tool input delta
                Event::default().data(
                    serde_json::to_string(&serde_json::json!({
                        "type": "tool-input-delta",
                        "toolCallId": tool_call_id,
                        "inputTextDelta": args_delta
                    }))
                    .unwrap(),
                )
            }
            SseMessage::ToolCallResult {
                tool_call_id,
                tool_name: _,
                result,
            } => {
                // Tool output available
                Event::default().data(
                    serde_json::to_string(&serde_json::json!({
                        "type": "tool-output-available",
                        "toolCallId": tool_call_id,
                        "output": result
                    }))
                    .unwrap(),
                )
            }
            SseMessage::DataPart { data_type, data } => {
                // Custom data parts in Vercel AI SDK format
                let mut data_obj = serde_json::json!({
                    "type": data_type
                });
                if let Some(obj) = data.as_object() {
                    for (k, v) in obj {
                        data_obj[k] = v.clone();
                    }
                }
                Event::default().data(
                    serde_json::to_string(&serde_json::json!({
                        "type": "data",
                        "data": data_obj
                    }))
                    .unwrap(),
                )
            }
            SseMessage::MessageComplete { usage: _ } => {
                // Finish message event
                Event::default().data(
                    serde_json::to_string(&serde_json::json!({
                        "type": "finish"
                    }))
                    .unwrap(),
                )
            }
            SseMessage::Error { error } => {
                // Error event
                Event::default().data(
                    serde_json::to_string(&serde_json::json!({
                        "type": "error",
                        "errorText": error
                    }))
                    .unwrap(),
                )
            }
            SseMessage::Ping => {
                // Keep-alive ping
                Event::default().event("ping").data("")
            }
        })
    })
}

/// Execute chat and stream results
async fn execute_chat_stream(
    service: Arc<ChatService>,
    request: ChatRequest,
    tx: mpsc::Sender<SseMessage>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Start message
    let message_id = uuid::Uuid::new_v4().to_string();
    tx.send(SseMessage::MessageStart {
        id: message_id.clone(),
        role: "assistant".to_string(),
    })
    .await?;

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
            })
            .await?;

            // If this is an activation, prepend system prompt
            if agent_context.activate.unwrap_or(false) {
                if let Some(objective) = &agent_context.objective {
                    // Add system prompt for agent behavior
                    messages.insert(
                        0,
                        ChatMessage {
                            role: "system".to_string(),
                            content: Some(format!(
                                "You are an autonomous AI agent. Your objective is: {}\n\n\
                            You should:\n\
                            1. Break down the objective into clear tasks\n\
                            2. Execute tasks using available tools\n\
                            3. Provide reasoning for your actions\n\
                            4. Report progress and results\n\n\
                            Think step by step and use tools when needed.",
                                objective
                            )),
                            parts: None,
                        },
                    );

                    // Send initial reasoning
                    tx.send(SseMessage::DataPart {
                        data_type: "reasoning".to_string(),
                        data: serde_json::json!({
                            "type": "planning",
                            "content": format!("Analyzing objective: {}", objective),
                        }),
                    })
                    .await?;
                }
            }
        } else if agent_context.mode.as_deref() == Some("stop") {
            // Handle stop command
            let stop_text_id = format!("text-{}", uuid::Uuid::new_v4());
            tx.send(SseMessage::TextStart {
                id: stop_text_id.clone(),
            })
            .await?;
            tx.send(SseMessage::TextDelta {
                id: stop_text_id.clone(),
                delta: "Agent execution stopped.".to_string(),
            })
            .await?;
            tx.send(SseMessage::TextEnd { id: stop_text_id }).await?;
            tx.send(SseMessage::MessageComplete { usage: None }).await?;
            return Ok(());
        }
    }

    // Convert messages to Ollama format
    let mut ollama_messages: Vec<OllamaMessage> = messages
        .into_iter()
        .map(|msg| {
            let content = msg.get_content();
            OllamaMessage {
                role: msg.role,
                content,
            }
        })
        .collect();

    // Convert tool names to Ollama tool format if provided
    let tools = if let Some(tool_names) = request.tools {
        Some(convert_tools_to_ollama_format(&service.db, tool_names).await?)
    } else {
        None
    };

    // Build Ollama request
    let selected_model = request.model.clone().unwrap_or_else(|| "llama3.2".to_string());
    eprintln!("[execute_chat_stream] Using model: {}", selected_model);
    
    // Keep track of tool results for potential second LLM call
    let mut tool_results: Vec<(String, String, serde_json::Value)> = Vec::new();
    let mut had_tool_calls = false;

    // Make the initial LLM call
    let ollama_request = OllamaChatRequest {
        model: selected_model.clone(),
        messages: ollama_messages.clone(),
        stream: true,
        tools: tools.clone(),
    };

    // Call Ollama API
    let ollama_url = format!("http://localhost:{}/api/chat", get_ollama_server_port());
    let response = service
        .http_client
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
    let text_block_id = format!("text-{}", uuid::Uuid::new_v4());
    let mut text_started = false;

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
                        // Send text-start if this is the first content
                        if !text_started {
                            tx.send(SseMessage::TextStart {
                                id: text_block_id.clone(),
                            })
                            .await?;
                            text_started = true;
                        }

                        accumulated_content.push_str(&chat_chunk.message.content);
                        tx.send(SseMessage::TextDelta {
                            id: text_block_id.clone(),
                            delta: chat_chunk.message.content.clone(),
                        })
                        .await?;
                    }

                    // Handle tool calls if present
                    if let Some(tool_calls) = chat_chunk.message.tool_calls {
                        had_tool_calls = true;
                        for tool_call in tool_calls {
                            let tool_id = tool_call
                                .id
                                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                            let tool_name = tool_call.function.name.clone();

                            // Send tool call start event
                            tx.send(SseMessage::ToolCallStart {
                                tool_call_id: tool_id.clone(),
                                tool_name: tool_name.clone(),
                            })
                            .await?;

                            // Send tool arguments
                            tx.send(SseMessage::ToolCallDelta {
                                tool_call_id: tool_id.clone(),
                                args_delta: tool_call.function.arguments.to_string(),
                            })
                            .await?;

                            // Execute tool server-side
                            match execute_mcp_tool(
                                &service.db,
                                &tool_name,
                                &tool_call.function.arguments,
                            )
                            .await
                            {
                                Ok(result) => {
                                    // Store the result for later use
                                    tool_results.push((
                                        tool_id.clone(),
                                        tool_name.clone(),
                                        result.clone(),
                                    ));
                                    
                                    tx.send(SseMessage::ToolCallResult {
                                        tool_call_id: tool_id,
                                        tool_name,
                                        result,
                                    })
                                    .await?;
                                }
                                Err(e) => {
                                    let error_result = serde_json::json!({
                                        "error": format!("Tool execution failed: {}", e)
                                    });
                                    
                                    tool_results.push((
                                        tool_id.clone(),
                                        tool_name.clone(),
                                        error_result.clone(),
                                    ));
                                    
                                    tx.send(SseMessage::ToolCallResult {
                                        tool_call_id: tool_id,
                                        tool_name,
                                        result: error_result,
                                    })
                                    .await?;
                                }
                            }
                        }
                    }

                    // If done, handle completion
                    if chat_chunk.done {
                        // Send text-end if we sent any text
                        if text_started {
                            tx.send(SseMessage::TextEnd {
                                id: text_block_id.clone(),
                            })
                            .await?;
                        }

                        // If we had tool calls, make another LLM call with the results
                        if had_tool_calls && !tool_results.is_empty() {
                            // Add assistant message with content if any
                            if !accumulated_content.is_empty() {
                                ollama_messages.push(OllamaMessage {
                                    role: "assistant".to_string(),
                                    content: accumulated_content.clone(),
                                });
                            }
                            
                            // Add tool results as assistant messages
                            for (tool_id, tool_name, result) in &tool_results {
                                ollama_messages.push(OllamaMessage {
                                    role: "assistant".to_string(),
                                    content: format!(
                                        "Tool {} (id: {}) returned: {}",
                                        tool_name,
                                        tool_id,
                                        serde_json::to_string_pretty(result).unwrap_or_else(|_| result.to_string())
                                    ),
                                });
                            }

                            // Make another call to the LLM with the tool results
                            let followup_request = OllamaChatRequest {
                                model: selected_model.clone(),
                                messages: ollama_messages.clone(),
                                stream: true,
                                tools: None, // No tools for the summary response
                            };

                            let followup_response = service
                                .http_client
                                .post(&ollama_url)
                                .json(&followup_request)
                                .send()
                                .await?;

                            if followup_response.status().is_success() {
                                // Stream the final response
                                let mut followup_stream = followup_response.bytes_stream();
                                let final_text_id = format!("text-{}", uuid::Uuid::new_v4());
                                let mut final_text_started = false;

                                while let Some(chunk) = followup_stream.next().await {
                                    let chunk = chunk?;
                                    let text = String::from_utf8_lossy(&chunk);

                                    for line in text.lines() {
                                        if line.trim().is_empty() {
                                            continue;
                                        }

                                        if let Ok(chat_chunk) = serde_json::from_str::<OllamaChatChunk>(line) {
                                            if !chat_chunk.message.content.is_empty() {
                                                if !final_text_started {
                                                    tx.send(SseMessage::TextStart {
                                                        id: final_text_id.clone(),
                                                    })
                                                    .await?;
                                                    final_text_started = true;
                                                }

                                                tx.send(SseMessage::TextDelta {
                                                    id: final_text_id.clone(),
                                                    delta: chat_chunk.message.content,
                                                })
                                                .await?;
                                            }

                                            if chat_chunk.done {
                                                if final_text_started {
                                                    tx.send(SseMessage::TextEnd {
                                                        id: final_text_id,
                                                    })
                                                    .await?;
                                                }

                                                // Send completion with usage stats if available
                                                let usage = if let (Some(prompt_tokens), Some(completion_tokens)) =
                                                    (chat_chunk.prompt_eval_count, chat_chunk.eval_count)
                                                {
                                                    Some(UsageStats {
                                                        prompt_tokens,
                                                        completion_tokens,
                                                        total_tokens: prompt_tokens + completion_tokens,
                                                    })
                                                } else {
                                                    None
                                                };

                                                tx.send(SseMessage::MessageComplete { usage }).await?;
                                                tx.send(SseMessage::StreamEnd).await?;
                                                return Ok(());
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            // No tool calls, send completion normally
                            let usage = if let (Some(prompt_tokens), Some(completion_tokens)) =
                                (chat_chunk.prompt_eval_count, chat_chunk.eval_count)
                            {
                                Some(UsageStats {
                                    prompt_tokens,
                                    completion_tokens,
                                    total_tokens: prompt_tokens + completion_tokens,
                                })
                            } else {
                                None
                            };

                            tx.send(SseMessage::MessageComplete { usage }).await?;
                            tx.send(SseMessage::StreamEnd).await?;
                            return Ok(());
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Failed to parse Ollama chunk: {}, line: {}", e, line);
                }
            }
        }
    }

    if text_started {
        tx.send(SseMessage::TextEnd {
            id: text_block_id.clone(),
        })
        .await?;

        tx.send(SseMessage::MessageComplete { usage: None }).await?;

        tx.send(SseMessage::StreamEnd).await?;
    }

    Ok(())
}

/// Convert tool names (serverName_toolName) to Ollama tool format
/// This queries the actual tool schemas from MCP servers via the proxy
async fn convert_tools_to_ollama_format(
    _db: &DatabaseConnection,
    tool_names: Vec<String>,
) -> Result<Vec<OllamaTool>, Box<dyn std::error::Error + Send + Sync>> {
    let mut ollama_tools = Vec::new();
    
    // Group tools by server for efficient querying
    let mut tools_by_server: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    
    for tool_name in tool_names {
        // Split serverName_toolName
        let parts: Vec<&str> = tool_name.splitn(2, '_').collect();
        if parts.len() != 2 {
            eprintln!("Invalid tool name format: {}", tool_name);
            continue;
        }
        
        let server_name = parts[0].to_string();
        let tool_name_only = parts[1].to_string();
        
        tools_by_server
            .entry(server_name)
            .or_insert_with(Vec::new)
            .push(tool_name_only);
    }
    
    // Query each server for its tools
    for (server_name, requested_tools) in tools_by_server {
        // Create JSON-RPC request to list tools
        let list_tools_request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": uuid::Uuid::new_v4().to_string(),
            "method": "tools/list",
            "params": {}
        });
        
        match crate::models::mcp_server::sandbox::forward_raw_request(
            &server_name,
            serde_json::to_string(&list_tools_request)?
        ).await {
            Ok(response_str) => {
                if let Ok(response) = serde_json::from_str::<serde_json::Value>(&response_str) {
                    if let Some(result) = response.get("result") {
                        if let Some(tools) = result.get("tools").and_then(|t| t.as_array()) {
                            // Process each tool from the MCP server
                            for tool in tools {
                                if let Some(name) = tool.get("name").and_then(|n| n.as_str()) {
                                    // Check if this tool was requested
                                    if requested_tools.contains(&name.to_string()) {
                                        let description = tool
                                            .get("description")
                                            .and_then(|d| d.as_str())
                                            .unwrap_or("No description available")
                                            .to_string();
                                        
                                        // Get input schema if available
                                        let parameters = tool
                                            .get("inputSchema")
                                            .cloned()
                                            .unwrap_or_else(|| serde_json::json!({
                                                "type": "object",
                                                "properties": {},
                                                "additionalProperties": true
                                            }));
                                        
                                        ollama_tools.push(OllamaTool {
                                            tool_type: "function".to_string(),
                                            function: OllamaToolFunction {
                                                name: format!("{}_{}", server_name, name),
                                                description,
                                                parameters,
                                            },
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to list tools from server '{}': {}", server_name, e);
                // Fall back to basic tool definition for this server's tools
                for tool_name_only in requested_tools {
                    ollama_tools.push(OllamaTool {
                        tool_type: "function".to_string(),
                        function: OllamaToolFunction {
                            name: format!("{}_{}", server_name, tool_name_only),
                            description: format!("MCP tool from server: {}", server_name),
                            parameters: serde_json::json!({
                                "type": "object",
                                "properties": {},
                                "additionalProperties": true
                            }),
                        },
                    });
                }
            }
        }
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
    let proxy_url = format!(
        "http://localhost:{}/mcp_proxy/{}",
        crate::gateway::GATEWAY_SERVER_PORT,
        server_name
    );

    let response = client.post(&proxy_url).json(&mcp_request).send().await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(format!("MCP proxy error: {}", error_text).into());
    }

    let result: serde_json::Value = response.json().await?;

    // Extract result from JSON-RPC response
    if let Some(error) = result.get("error") {
        return Err(format!("MCP tool error: {}", error).into());
    }

    Ok(result
        .get("result")
        .cloned()
        .unwrap_or(serde_json::Value::Null))
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
    async fn test_chat_endpoint() {
        // Mock database connection
        let db = sea_orm::DatabaseConnection::default();
        let app = create_router(db);

        let request = Request::builder()
            .method("POST")
            .uri("/")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::to_string(&ChatRequest {
                    messages: vec![ChatMessage {
                        role: "user".to_string(),
                        content: Some("Hello, agent!".to_string()),
                        parts: None,
                    }],
                    agent_context: None,
                    model: Some("llama3.2".to_string()),
                    stream: Some(true),
                    tools: None,
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
