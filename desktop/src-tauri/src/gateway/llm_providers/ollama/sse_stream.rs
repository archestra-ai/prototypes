use crate::gateway::websocket::{
    ChatTitleUpdatedWebSocketPayload, Service as WebSocketService, WebSocketMessage,
};
use crate::models::chat::{Model as ChatModel, Model, ChatWithMessages};
use crate::models::chat_messages::Model as ChatMessage;
use crate::sandbox;
use crate::ollama::client::OllamaClient;
use axum::{
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response as AxumResponse,
    },
    Json,
};
use futures_util::stream::Stream;
use futures_util::StreamExt;
use ollama_rs::{
    generation::{
        chat::{request::ChatMessageRequest, ChatMessage as OllamaChatMessage, MessageRole},
        tools::{ToolInfo, ToolType, ToolFunctionInfo, ToolCall},
    },
    models::ModelOptions,
};
use sea_orm::DatabaseConnection;
use std::{convert::Infallible, sync::Arc, time::Duration};
use tokio::sync::{mpsc, Semaphore};
use tokio_stream::wrappers::UnboundedReceiverStream;
use tracing::debug;
use tracing::error;

// Constants
const MIN_MESSAGES_FOR_TITLE_GENERATION: u64 = 4;
const MAX_MESSAGE_SIZE: usize = 1024 * 1024; // 1MB limit
const MAX_CONCURRENT_CHATS: usize = 10; // Limit concurrent chat streams

// Global semaphore to limit concurrent chat requests
static CHAT_SEMAPHORE: once_cell::sync::Lazy<Arc<Semaphore>> = 
    once_cell::sync::Lazy::new(|| Arc::new(Semaphore::new(MAX_CONCURRENT_CHATS)));

/// Filter out thinking content from the response
fn filter_thinking_content(content: &str) -> String {
    let mut result = String::new();
    let mut in_thinking = false;
    let mut chars = content.chars().peekable();
    
    while let Some(ch) = chars.next() {
        if ch == '<' && chars.peek() == Some(&'t') {
            // Check if this is a <think> tag
            let mut tag = String::from(ch);
            for _ in 0..6 {
                if let Some(c) = chars.next() {
                    tag.push(c);
                }
            }
            if tag == "<think>" {
                in_thinking = true;
                continue;
            } else {
                // Not a think tag, add the consumed characters
                result.push_str(&tag);
            }
        } else if ch == '<' && chars.peek() == Some(&'/') {
            // Check if this is a </think> tag
            let mut tag = String::from(ch);
            for _ in 0..7 {
                if let Some(c) = chars.next() {
                    tag.push(c);
                }
            }
            if tag == "</think>" {
                in_thinking = false;
                continue;
            } else {
                // Not a close think tag, add the consumed characters
                if !in_thinking {
                    result.push_str(&tag);
                }
            }
        } else if !in_thinking {
            result.push(ch);
        }
    }
    
    result
}

// Tool execution result
#[derive(Debug)]
struct ToolResult {
    content: String,
    is_error: bool,
}

/// Get tool information from MCP server
async fn get_mcp_tool_info(server_name: &str, tool_name: &str) -> Option<serde_json::Value> {
    // Construct JSON-RPC request to list tools
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": uuid::Uuid::new_v4().to_string(),
        "method": "tools/list",
        "params": {}
    });
    
    let request_body = match serde_json::to_string(&request) {
        Ok(body) => body,
        Err(e) => {
            error!("Failed to serialize tools/list request: {}", e);
            return None;
        }
    };
    
    // Forward to MCP server
    match sandbox::forward_raw_request(server_name, request_body).await {
        Ok(response) => {
            // Parse the JSON-RPC response
            match serde_json::from_str::<serde_json::Value>(&response) {
                Ok(json) => {
                    if let Some(result) = json.get("result") {
                        if let Some(tools) = result.get("tools").and_then(|t| t.as_array()) {
                            // Find the specific tool
                            for tool in tools {
                                if let Some(name) = tool.get("name").and_then(|n| n.as_str()) {
                                    if name == tool_name {
                                        return Some(tool.clone());
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to parse tools/list response: {}", e);
                }
            }
        }
        Err(e) => {
            error!("Failed to list tools from {}: {}", server_name, e);
        }
    }
    None
}

/// Execute an MCP tool by forwarding the request to the appropriate server
async fn execute_mcp_tool(tool_name: &str, arguments: &serde_json::Value) -> ToolResult {
    // Parse the tool name (format: ServerName_toolName)
    let parts: Vec<&str> = tool_name.splitn(2, '_').collect();
    if parts.len() != 2 {
        return ToolResult {
            content: format!("Invalid tool name format: {}", tool_name),
            is_error: true,
        };
    }
    
    let (server_name, tool_function_name) = (parts[0], parts[1]);
    
    // Construct JSON-RPC request for tool execution
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": uuid::Uuid::new_v4().to_string(),
        "method": "tools/call",
        "params": {
            "name": tool_function_name,
            "arguments": arguments
        }
    });
    
    let request_body = match serde_json::to_string(&request) {
        Ok(body) => body,
        Err(e) => {
            return ToolResult {
                content: format!("Failed to serialize tool request: {}", e),
                is_error: true,
            };
        }
    };
    
    // Forward to MCP server
    match sandbox::forward_raw_request(server_name, request_body).await {
        Ok(response) => {
            // Parse the JSON-RPC response
            match serde_json::from_str::<serde_json::Value>(&response) {
                Ok(json) => {
                    if let Some(error) = json.get("error") {
                        ToolResult {
                            content: format!("Tool execution error: {}", error),
                            is_error: true,
                        }
                    } else if let Some(result) = json.get("result") {
                        // Extract content from result
                        if let Some(content) = result.get("content") {
                            if let Some(text) = content.as_str() {
                                ToolResult {
                                    content: text.to_string(),
                                    is_error: false,
                                }
                            } else if let Some(array) = content.as_array() {
                                // Handle array content (like tool results)
                                let text_content: Vec<String> = array
                                    .iter()
                                    .filter_map(|item| {
                                        item.get("text")
                                            .and_then(|t| t.as_str())
                                            .map(|s| s.to_string())
                                    })
                                    .collect();
                                ToolResult {
                                    content: text_content.join("
"),
                                    is_error: false,
                                }
                            } else {
                                ToolResult {
                                    content: content.to_string(),
                                    is_error: false,
                                }
                            }
                        } else {
                            ToolResult {
                                content: result.to_string(),
                                is_error: false,
                            }
                        }
                    } else {
                        ToolResult {
                            content: "Tool executed successfully but returned no result".to_string(),
                            is_error: false,
                        }
                    }
                }
                Err(e) => ToolResult {
                    content: format!("Failed to parse tool response: {}", e),
                    is_error: true,
                },
            }
        }
        Err(e) => ToolResult {
            content: format!("Failed to execute tool: {}", e),
            is_error: true,
        },
    }
}

/// Validate session ID format (must be a valid UUID)
fn validate_session_id(session_id: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(session_id)
        .map_err(|_| "Invalid session ID format: must be a valid UUID".to_string())?;
    Ok(())
}

// NOTE: the ideal way here would be that ChatMessageRequest would implement Deserialize and then we could just
// create our own "ProxiedOllamaChatRequest" struct, which contains session_id + all of the OllamaChatRequest
// fields and flatten everything into one object and deserialize the request json bytes into that struct, but
// OllamaChatRequest doesn't "implement" Deserialize.. so this is the alternative
async fn convert_proxied_request_to_ollama_request(
    body_bytes: &[u8],
) -> Result<(ChatMessageRequest, String), String> {
    debug!("Converting proxied request to ollama request");

    // First, parse as JSON Value to extract session_id
    let json_value: serde_json::Value = match serde_json::from_slice(body_bytes) {
        Ok(value) => value,
        Err(e) => {
            error!("Failed to parse JSON: {e}");
            return Err(format!("Failed to parse JSON: {e}"));
        }
    };

    // Extract session_id
    let session_id = match json_value.get("session_id").and_then(|v| v.as_str()) {
        Some(id) => {
            debug!("Extracted session_id: {}", id);
            id.to_string()
        }
        None => {
            error!("Missing session_id in request");
            return Err("Missing session_id in request".to_string());
        }
    };

    // Extract required fields to construct ChatMessageRequest
    let model_name = match json_value.get("model").and_then(|v| v.as_str()) {
        Some(model) => model.to_string(),
        None => return Err("Missing model in request".to_string()),
    };

    // Extract single message from request
    let message_content = match json_value.get("message") {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(v) => v.to_string(),
        None => return Err("Missing message in request".to_string()),
    };

    // Create a temporary messages array with just the new message
    // We'll load the full history from the database later
    let messages = vec![OllamaChatMessage {
        role: MessageRole::User,
        content: message_content,
        images: None,
        thinking: None,
        tool_calls: vec![],
    }];

    // Create ChatMessageRequest using the constructor
    let mut ollama_request = ChatMessageRequest::new(model_name.clone(), messages);

    // Set optional fields if they exist
    if let Some(options_value) = json_value.get("options") {
        if let Ok(options) = serde_json::from_value::<ModelOptions>(options_value.clone()) {
            ollama_request = ollama_request.options(options);
        }
    }

    if let Some(template) = json_value.get("template").and_then(|v| v.as_str()) {
        ollama_request = ollama_request.template(template.to_string());
    }

    if let Some(tools_value) = json_value.get("tools") {
        // Try to parse as full ToolInfo objects first (for compatibility)
        if let Ok(tools) = serde_json::from_value::<Vec<ToolInfo>>(tools_value.clone()) {
            if !tools.is_empty() {
                debug!("Setting {} tools on Ollama request (full ToolInfo format)", tools.len());
                for tool in &tools {
                    debug!("Tool: {}", tool.function.name);
                }
                ollama_request = ollama_request.tools(tools);
            }
        } else if let Some(tool_names) = tools_value.as_array() {
            // Fallback: Convert tool names to ToolInfo objects
            // This is for the simplified frontend that sends just tool names
            debug!("Converting tool names to ToolInfo objects");
            
            // Fetch full tool information from MCP servers
            let mut tools: Vec<ToolInfo> = Vec::new();
            
            for tool_name_value in tool_names {
                if let Some(tool_name) = tool_name_value.as_str() {
                    // Parse the tool name (format: ServerName_toolName)
                    let parts: Vec<&str> = tool_name.splitn(2, '_').collect();
                    if parts.len() != 2 {
                        debug!("Skipping invalid tool name format: {}", tool_name);
                        continue;
                    }
                    
                    let (server_name, tool_function_name) = (parts[0], parts[1]);
                    
                    // Try to get full tool info from MCP server
                    if let Some(tool_json) = get_mcp_tool_info(server_name, tool_function_name).await {
                        // Convert MCP tool format to Ollama ToolInfo format
                        let description = tool_json.get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or(&format!("{} from {} server", 
                                tool_function_name.replace('_', " ").replace('-', " "), 
                                server_name
                            ))
                            .to_string();
                        
                        // Get input schema from MCP tool definition
                        let parameters = if let Some(input_schema) = tool_json.get("inputSchema") {
                            // Use the actual schema from the MCP server
                            serde_json::from_value(input_schema.clone())
                                .unwrap_or_else(|e| {
                                    error!("Failed to parse tool input schema: {}", e);
                                    // Fallback to generic schema
                                    serde_json::from_value(serde_json::json!({
                                        "type": "object",
                                        "properties": {},
                                        "additionalProperties": true
                                    })).unwrap()
                                })
                        } else {
                            // No input schema provided, use generic
                            serde_json::from_value(serde_json::json!({
                                "type": "object",
                                "properties": {},
                                "additionalProperties": true
                            })).unwrap()
                        };
                        
                        tools.push(ToolInfo {
                            tool_type: ToolType::Function,
                            function: ToolFunctionInfo {
                                name: tool_name.to_string(),
                                description,
                                parameters,
                            },
                        });
                        
                        debug!("Added tool {} with full schema", tool_name);
                    } else {
                        // Fallback: Create generic tool info if we can't fetch from server
                        debug!("Could not fetch tool info for {}, using generic schema", tool_name);
                        
                        let description = format!("{} from {} server", 
                            tool_function_name.replace('_', " ").replace('-', " "), 
                            server_name
                        );
                        
                        tools.push(ToolInfo {
                            tool_type: ToolType::Function,
                            function: ToolFunctionInfo {
                                name: tool_name.to_string(),
                                description,
                                parameters: serde_json::from_value(
                                    serde_json::json!({
                                        "type": "object",
                                        "properties": {},
                                        "additionalProperties": true
                                    })
                                ).unwrap(),
                            },
                        });
                    }
                }
            }
            
            if !tools.is_empty() {
                debug!("Setting {} tools on Ollama request (converted from names)", tools.len());
                for tool in &tools {
                    debug!("Tool: {} - {}", tool.function.name, tool.function.description);
                }
                ollama_request = ollama_request.tools(tools);
            }
        }
    }

    if let Some(think) = json_value.get("think").and_then(|v| v.as_bool()) {
        ollama_request = ollama_request.think(think);
    }

    Ok((ollama_request, session_id))
}

// SSE message types
#[derive(Debug)]
enum SseMessage {
    MessageStart { _id: String },
    TextStart { id: String },
    TextDelta { id: String, delta: String },
    TextEnd { id: String },
    ToolInputStart { tool_call_id: String, tool_name: String },
    ToolInputAvailable { tool_call_id: String, tool_name: String, input: serde_json::Value },
    ToolOutputAvailable { tool_call_id: String, output: serde_json::Value },
    MessageComplete,
    StreamEnd,
    Error { error: String },
}

pub struct SseStreamService {
    db: Arc<DatabaseConnection>,
    ollama_client: OllamaClient,
    ws_service: Arc<WebSocketService>,
}

impl SseStreamService {
    pub fn new(
        db: Arc<DatabaseConnection>,
        ollama_client: OllamaClient,
        ws_service: Arc<WebSocketService>,
    ) -> Self {
        Self {
            db,
            ollama_client,
            ws_service,
        }
    }

    pub async fn handle_stream(
        &self,
        payload: serde_json::Value,
    ) -> Result<AxumResponse, StatusCode> {
        // Convert request to ollama format
        let body_bytes = serde_json::to_vec(&payload).map_err(|_| StatusCode::BAD_REQUEST)?;
        let (ollama_request, session_id) = convert_proxied_request_to_ollama_request(&body_bytes)
            .await
            .map_err(|_| StatusCode::BAD_REQUEST)?;

        // Validate session ID
        validate_session_id(&session_id).map_err(|_| StatusCode::BAD_REQUEST)?;

        eprintln!(
            "[stream_handler] Received request - session_id: {}, model: {}",
            session_id, ollama_request.model_name
        );

        // Create SSE stream
        let stream = self.create_chat_stream(ollama_request, session_id).await;

        // Build response with CORS headers
        let mut headers = HeaderMap::new();
        headers.insert("Access-Control-Allow-Origin", HeaderValue::from_static("tauri://localhost"));
        headers.insert(
            "Access-Control-Allow-Methods",
            HeaderValue::from_static("GET, POST, PUT, DELETE, OPTIONS"),
        );
        headers.insert(
            "Access-Control-Allow-Headers",
            HeaderValue::from_static("Content-Type, Authorization"),
        );
        headers.insert("Cache-Control", HeaderValue::from_static("no-cache"));
        headers.insert("Connection", HeaderValue::from_static("keep-alive"));

        Ok((headers, Sse::new(stream).keep_alive(KeepAlive::default())).into_response())
    }

    async fn create_chat_stream(
        &self,
        ollama_request: ChatMessageRequest,
        session_id: String,
    ) -> impl Stream<Item = Result<Event, Infallible>> {
        let (tx, rx) = mpsc::unbounded_channel::<SseMessage>();

        let db = Arc::clone(&self.db);
        let ollama_client = self.ollama_client.clone();
        let ws_service = Arc::clone(&self.ws_service);
        let semaphore = Arc::clone(&CHAT_SEMAPHORE);

        tokio::spawn(async move {
            // Acquire permit to limit concurrent chat requests
            let _permit = match semaphore.acquire().await {
                Ok(permit) => permit,
                Err(_) => {
                    let _ = tx.send(SseMessage::Error {
                        error: "Server is too busy, please try again later".to_string(),
                    });
                    return;
                }
            };
            if let Err(e) = Self::execute_chat_stream(
                db,
                ollama_client,
                ws_service,
                ollama_request,
                session_id,
                tx.clone(),
            )
            .await
            {
                let _ = tx.send(SseMessage::Error {
                    error: format!("Chat execution failed: {e}"),
                });
            }
        });

        // Convert to SSE events following Vercel AI SDK v5 protocol
        UnboundedReceiverStream::new(rx).filter_map(|msg| async move {
            match msg {
                SseMessage::MessageStart { _id: _ } => {
                    // Skip - not needed for Vercel AI SDK v5
                    None
                }
                SseMessage::TextStart { id } => {
                    // Text start event (required before text-delta)
                    let data = match serde_json::to_string(&serde_json::json!({
                        "type": "text-start",
                        "id": id
                    })) {
                        Ok(json) => json,
                        Err(e) => format!(r#"{{"type":"error","errorText":"{e}"}}"#),
                    };
                    Some(Ok(Event::default().data(data)))
                }
                SseMessage::TextDelta { id, delta } => {
                    // Text delta event
                    let data = match serde_json::to_string(&serde_json::json!({
                        "type": "text-delta",
                        "id": id,
                        "delta": delta
                    })) {
                        Ok(json) => json,
                        Err(e) => format!(r#"{{"type":"error","errorText":"{e}"}}"#),
                    };
                    Some(Ok(Event::default().data(data)))
                }
                SseMessage::TextEnd { id } => {
                    // Text end event
                    let data = match serde_json::to_string(&serde_json::json!({
                        "type": "text-end",
                        "id": id
                    })) {
                        Ok(json) => json,
                        Err(e) => format!(r#"{{"type":"error","errorText":"{e}"}}"#),
                    };
                    Some(Ok(Event::default().data(data)))
                }
                SseMessage::ToolInputStart { tool_call_id, tool_name } => {
                    let data = match serde_json::to_string(&serde_json::json!({
                        "type": "tool-input-start",
                        "toolCallId": tool_call_id,
                        "toolName": tool_name
                    })) {
                        Ok(json) => json,
                        Err(e) => format!(r#"{{"type":"error","errorText":"{e}"}}"#),
                    };
                    Some(Ok(Event::default().data(data)))
                }
                SseMessage::ToolInputAvailable { tool_call_id, tool_name, input } => {
                    let data = match serde_json::to_string(&serde_json::json!({
                        "type": "tool-input-available",
                        "toolCallId": tool_call_id,
                        "toolName": tool_name,
                        "input": input
                    })) {
                        Ok(json) => json,
                        Err(e) => format!(r#"{{"type":"error","errorText":"{}"}}"#, e),
                    };
                    Some(Ok(Event::default().data(data)))
                }
                SseMessage::ToolOutputAvailable { tool_call_id, output } => {
                    let data = match serde_json::to_string(&serde_json::json!({
                        "type": "tool-output-available",
                        "toolCallId": tool_call_id,
                        "output": output
                    })) {
                        Ok(json) => json,
                        Err(e) => format!(r#"{{"type":"error","errorText":"{}"}}"#, e),
                    };
                    Some(Ok(Event::default().data(data)))
                }
                SseMessage::MessageComplete => {
                    // Skip message complete - not a standard Vercel AI SDK v5 event
                    None
                }
                SseMessage::StreamEnd => Some(Ok(Event::default().data("[DONE]"))),
                SseMessage::Error { error } => {
                    let data = match serde_json::to_string(&serde_json::json!({
                        "type": "error",
                        "errorText": error
                    })) {
                        Ok(json) => json,
                        Err(e) => format!(r#"{{"type":"error","errorText":"{e}"}}"#),
                    };
                    Some(Ok(Event::default().data(data)))
                }
            }
        })
    }

    async fn execute_chat_stream(
        db: Arc<DatabaseConnection>,
        ollama_client: OllamaClient,
        ws_service: Arc<WebSocketService>,
        mut ollama_request: ChatMessageRequest,
        session_id: String,
        tx: mpsc::UnboundedSender<SseMessage>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Extract the new message from the request
        let new_message = ollama_request.messages.last()
            .ok_or("No message in request")?
            .clone();

        // Validate message size
        if new_message.content.len() > MAX_MESSAGE_SIZE {
            return Err(format!(
                "Message too large: {} bytes (max: {} bytes)",
                new_message.content.len(),
                MAX_MESSAGE_SIZE
            )
            .into());
        }

        // Save the user message
        let message_json = serde_json::to_value(&new_message)?;
        ChatMessage::save(session_id.clone(), message_json, &db).await?;

        // Load chat with all messages
        let chat: ChatWithMessages = ChatModel::load_by_session_id(session_id.clone(), &db)
            .await?
            .ok_or("Chat not found")?;

        // Convert database messages to Ollama format
        let all_messages: Vec<OllamaChatMessage> = chat.messages
            .iter()
            .map(|msg| OllamaChatMessage {
                role: match msg.role.as_str() {
                    "assistant" => MessageRole::Assistant,
                    "system" => MessageRole::System,
                    _ => MessageRole::User,
                },
                content: msg.content.clone(),
                images: None,
                thinking: None,
                tool_calls: vec![],
            })
            .collect();

        // Replace the single message in the request with the full history
        ollama_request.messages = all_messages;

        // Get model name and chat_id for title generation
        let model_name = ollama_request.model_name.clone();
        let chat_id = chat.id;
        let chat_session_id = chat.session_id.clone();
        let chat_title = chat.title.clone();

        // Maximum rounds of tool execution to prevent infinite loops
        const MAX_TOOL_ROUNDS: u32 = 10;
        let mut tool_round = 0;

        // Send message start event once at the beginning
        let message_id = uuid::Uuid::new_v4().to_string();
        tx.send(SseMessage::MessageStart {
            _id: message_id.clone(),
        })?;

        let text_id = "text-main".to_string();
        let mut overall_text_started = false;
        let mut overall_accumulated_content = String::new();

        loop {
            debug!("Starting round {} of tool execution", tool_round + 1);
            
            // Use the ollama client to stream
            let stream = ollama_client.chat_stream(ollama_request.clone()).await?;
            let mut stream = Box::pin(stream);

            let mut round_accumulated_content = String::new();
            let mut accumulated_tool_calls: Vec<ToolCall> = Vec::new();
            let mut text_deltas_buffer: Vec<String> = Vec::new();

            // Stream the response
            while let Some(response) = stream.next().await {
                match response {
                    Ok(chat_response) => {
                        if !chat_response.message.content.is_empty() {
                            // Filter out thinking content before buffering
                            let filtered_content = filter_thinking_content(&chat_response.message.content);
                            
                            if !filtered_content.is_empty() {
                                // Buffer text content instead of streaming immediately
                                round_accumulated_content.push_str(&filtered_content);
                                text_deltas_buffer.push(filtered_content);
                            }
                            
                            // Check if adding new content would exceed size limit
                            if overall_accumulated_content.len() + chat_response.message.content.len()
                                > MAX_MESSAGE_SIZE
                            {
                                error!("Response size limit exceeded");
                                tx.send(SseMessage::Error {
                                    error: "Response size limit exceeded".to_string(),
                                })?;
                                break;
                            }
                        }

                        // Check for tool calls
                        if !chat_response.message.tool_calls.is_empty() {
                            accumulated_tool_calls.extend(chat_response.message.tool_calls.clone());
                        }

                        if chat_response.done {
                            break;
                        }
                    }
                    Err(e) => {
                        error!("Stream error: {}", e);
                        tx.send(SseMessage::Error {
                            error: e.to_string(),
                        })?;
                        return Ok(());
                    }
                }
            }

            // Check if we should continue with tool execution
            if !accumulated_tool_calls.is_empty() && tool_round < MAX_TOOL_ROUNDS {
                debug!("Round {} had tool calls, not streaming text", tool_round + 1);
                debug!("Processing {} tool calls in round {}", accumulated_tool_calls.len(), tool_round + 1);

                // Save assistant message with tool calls
                let assistant_message = serde_json::json!({
                    "role": "assistant",
                    "content": round_accumulated_content,
                    "tool_calls": accumulated_tool_calls
                });
                ChatMessage::save(chat_session_id.clone(), assistant_message, &db).await?;
                
                // Add assistant message to ollama request for next round
                let ollama_assistant_message = OllamaChatMessage {
                    role: MessageRole::Assistant,
                    content: round_accumulated_content.clone(),
                    images: None,
                    thinking: None,
                    tool_calls: accumulated_tool_calls.clone(),
                };
                ollama_request.messages.push(ollama_assistant_message);

                // Process each tool call
                let mut tool_results = Vec::new();
                
                for tool_call in &accumulated_tool_calls {
                    let tool_call_id = uuid::Uuid::new_v4().to_string();
                    
                    // Send tool-input-start event
                    tx.send(SseMessage::ToolInputStart {
                        tool_call_id: tool_call_id.clone(),
                        tool_name: tool_call.function.name.clone(),
                    })?;
                    
                    // Send tool-input-available event
                    tx.send(SseMessage::ToolInputAvailable {
                        tool_call_id: tool_call_id.clone(),
                        tool_name: tool_call.function.name.clone(),
                        input: tool_call.function.arguments.clone(),
                    })?;

                    // Execute the tool via MCP
                    let tool_result = execute_mcp_tool(&tool_call.function.name, &tool_call.function.arguments).await;
                    
                    // Send tool-output-available event
                    tx.send(SseMessage::ToolOutputAvailable {
                        tool_call_id: tool_call_id.clone(),
                        output: serde_json::json!({
                            "content": tool_result.content,
                            "isError": tool_result.is_error
                        }),
                    })?;

                    // Collect tool result for next LLM call
                    tool_results.push(tool_result);
                }

                // Add tool results to messages for next round
                for (i, tool_result) in tool_results.iter().enumerate() {
                    let tool_message = OllamaChatMessage {
                        role: MessageRole::Tool,
                        content: tool_result.content.clone(),
                        images: None,
                        thinking: None,
                        tool_calls: vec![],
                    };
                    ollama_request.messages.push(tool_message);

                    // Save tool result message
                    let tool_message_json = serde_json::json!({
                        "role": "tool",
                        "content": tool_result.content,
                        "tool_name": accumulated_tool_calls[i].function.name,
                        "tool_call_id": accumulated_tool_calls[i].function.name.clone() // Using name as ID for now
                    });
                    ChatMessage::save(chat_session_id.clone(), tool_message_json, &db).await?;
                }

                // Continue to next round
                tool_round += 1;
                continue;
            }

            // Check if this is truly the final round
            let is_final_round = accumulated_tool_calls.is_empty() || tool_round >= MAX_TOOL_ROUNDS;
            debug!("Round {} complete. Has tool calls: {}, Is final: {}", 
                   tool_round + 1, !accumulated_tool_calls.is_empty(), is_final_round);
            
            // Stream text only in the final round (no tool calls)
            if is_final_round && accumulated_tool_calls.is_empty() && !text_deltas_buffer.is_empty() {
                // Send text-start event if not already sent
                if !overall_text_started {
                    tx.send(SseMessage::TextStart {
                        id: text_id.clone(),
                    })?;
                    overall_text_started = true;
                }
                
                // Stream all buffered text deltas
                for delta in text_deltas_buffer {
                    overall_accumulated_content.push_str(&delta);
                    tx.send(SseMessage::TextDelta {
                        id: text_id.clone(),
                        delta,
                    })?;
                }
            }
            
            // Save final assistant message
            if !round_accumulated_content.is_empty() || !accumulated_tool_calls.is_empty() {
                let mut assistant_message = serde_json::json!({
                    "role": "assistant",
                    "content": round_accumulated_content
                });
                
                // Add tool calls if present (for the final message)
                if !accumulated_tool_calls.is_empty() {
                    assistant_message["tool_calls"] = serde_json::to_value(&accumulated_tool_calls)?;
                }
                
                ChatMessage::save(chat_session_id.clone(), assistant_message, &db).await?;

                // Check if we need to generate title
                let message_count =
                    ChatMessage::count_chat_messages(chat_session_id.clone(), &db)
                        .await?;
                if message_count == MIN_MESSAGES_FOR_TITLE_GENERATION
                    && chat_title.is_none()
                {
                    let db_clone = Arc::clone(&db);
                    let ws_service_clone = Arc::clone(&ws_service);
                    let ollama_client_clone = ollama_client.clone();
                    tokio::spawn(async move {
                        let _ = Self::generate_chat_title(
                            db_clone,
                            ollama_client_clone,
                            ws_service_clone,
                            chat_session_id.clone(),
                            chat_id,
                            model_name,
                        )
                        .await;
                    });
                }
            }

            // Send text-end event if we sent any text during the entire conversation
            if overall_text_started {
                tx.send(SseMessage::TextEnd {
                    id: text_id.clone(),
                })?;
            }

            // Send message complete event
            tx.send(SseMessage::MessageComplete)?;
            tx.send(SseMessage::StreamEnd)?;
            break;
        }

        Ok(())
    }

    async fn generate_chat_title(
        db: Arc<DatabaseConnection>,
        ollama_client: OllamaClient,
        ws_service: Arc<WebSocketService>,
        chat_session_id: String,
        chat_id: i32,
        chat_model: String,
    ) -> Result<(), String> {
        let chat = ChatModel::load_by_session_id(chat_session_id.clone(), &db)
            .await
            .map_err(|e| format!("Failed to load chat: {e}"))?
            .ok_or("Chat not found")?;

        if chat.title.is_some() {
            return Ok(()); // Title already exists
        }

        // Get first 4 messages for context
        let messages = chat
            .get_first_messages(&db, 4)
            .await
            .map_err(|e| format!("Failed to load messages: {e}"))?;

        if messages.is_empty() {
            return Err("No messages found".to_string());
        }

        // Build conversation context for title generation
        let mut context_parts = Vec::new();
        for msg in messages {
            let prefix = match msg.role.as_str() {
                "user" => "User",
                "assistant" => "Assistant",
                _ => continue,
            };
            context_parts.push(format!("{}: {}", prefix, msg.content));
        }
        let full_context = context_parts.join("\n\n");

        // Generate title using the ollama client's generate_title method
        let title = tokio::time::timeout(
            Duration::from_secs(30),
            ollama_client.generate_title(&chat_model, full_context),
        )
        .await
        .map_err(|_| "Title generation timed out")?
        .map_err(|e| format!("Failed to generate title: {e}"))?;
        if title.is_empty() {
            return Err("Generated title is empty".to_string());
        }

        // Update chat with new title
        let chat_model = Model {
            id: chat.id,
            session_id: chat.session_id.clone(),
            title: chat.title,
            llm_provider: chat.llm_provider,
            created_at: chat.created_at,
        };

        chat_model
            .update_title(Some(title.clone()), &db)
            .await
            .map_err(|e| format!("Failed to save title: {e}"))?;

        // Broadcast title update via WebSocket
        let ws_message = WebSocketMessage::ChatTitleUpdated(ChatTitleUpdatedWebSocketPayload {
            chat_id,
            title,
        });
        ws_service.broadcast(ws_message).await;

        Ok(())
    }
}


/// Handle OPTIONS requests for CORS preflight
pub async fn handle_stream_options() -> Result<AxumResponse, StatusCode> {
    let mut headers = HeaderMap::new();
    headers.insert("Access-Control-Allow-Origin", HeaderValue::from_static("tauri://localhost"));
    headers.insert(
        "Access-Control-Allow-Methods",
        HeaderValue::from_static("GET, POST, PUT, DELETE, OPTIONS"),
    );
    headers.insert(
        "Access-Control-Allow-Headers",
        HeaderValue::from_static("Content-Type, Authorization"),
    );
    headers.insert("Access-Control-Max-Age", HeaderValue::from_static("3600"));

    Ok((headers, "").into_response())
}

/// Handle chat requests with SSE streaming
pub async fn stream_handler(
    State(sse_service): State<Arc<SseStreamService>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<AxumResponse, StatusCode> {
    sse_service.handle_stream(payload).await
}
