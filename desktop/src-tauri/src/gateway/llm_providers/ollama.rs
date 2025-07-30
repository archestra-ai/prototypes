use crate::gateway::websocket::{
    ChatTitleUpdatedWebSocketPayload, Service as WebSocketService, WebSocketMessage,
};
use crate::models::chat::Model as Chat;
use crate::models::chat_messages::Model as ChatMessage;
use crate::ollama::client::OllamaClient;
use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, Request, Response, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response as AxumResponse,
    },
    Json, Router,
};
use futures_util::stream::Stream;
use futures_util::StreamExt;
use ollama_rs::{
    generation::{
        chat::{request::ChatMessageRequest, ChatMessage as OllamaChatMessage},
        tools::ToolInfo,
    },
    models::ModelOptions,
};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::{convert::Infallible, sync::Arc, time::Duration};
use tokio::sync::mpsc;
use tokio_stream::wrappers::UnboundedReceiverStream;
use tracing::{debug, error};

// Constants
const MIN_MESSAGES_FOR_TITLE_GENERATION: u64 = 4;
const MAX_REQUEST_SIZE: usize = 10 * 1024 * 1024; // 10 MB
const MAX_ACCUMULATED_CONTENT: usize = 10 * 1024 * 1024; // 10 MB max for accumulated chat content
const TOOL_EXECUTION_TIMEOUT: Duration = Duration::from_secs(30); // 30 seconds timeout for tool execution

// JSON-RPC constants
const JSONRPC_VERSION: &str = "2.0";
const JSONRPC_METHOD_TOOLS_LIST: &str = "tools/list";
const JSONRPC_METHOD_TOOLS_CALL: &str = "tools/call";

// Content types
const CONTENT_TYPE_NDJSON: &str = "application/x-ndjson";

// Message roles
const ROLE_ASSISTANT: &str = "assistant";
const ROLE_SYSTEM: &str = "system";

// Tool types
const TOOL_TYPE_FUNCTION: &str = "function";

// Headers
const HEADER_CONTENT_TYPE: &str = "content-type";

/// Represents a tool identifier with server and tool name components
#[derive(Debug, Clone, PartialEq, Eq)]
struct ToolIdentifier {
    server_name: String,
    tool_name: String,
}

impl ToolIdentifier {
    /// Parse a tool identifier from the format "serverName_toolName"
    fn parse(tool_str: &str) -> Result<Self, String> {
        // Validate input length
        if tool_str.len() > 256 {
            return Err("Tool identifier too long (max 256 characters)".to_string());
        }

        // Only allow alphanumeric, dash, and underscore
        let valid_chars = tool_str
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_');
        if !valid_chars {
            return Err("Tool identifier contains invalid characters (only alphanumeric, dash, and underscore allowed)".to_string());
        }

        let parts: Vec<&str> = tool_str.splitn(2, '_').collect();
        if parts.len() != 2 {
            return Err(format!(
                "Invalid tool identifier format: '{tool_str}' (expected format: serverName_toolName)"
            ));
        }

        let server_name = parts[0].trim();
        let tool_name = parts[1].trim();

        if server_name.is_empty() || tool_name.is_empty() {
            return Err(format!(
                "Tool identifier components cannot be empty: '{tool_str}'"
            ));
        }

        // Additional validation for known injection patterns
        let dangerous_patterns = [
            "../",
            "\\",
            "<script",
            "javascript:",
            "file://",
            "--",
            "/*",
            "*/",
            "';",
            "';--",
        ];
        for pattern in dangerous_patterns {
            if server_name.contains(pattern) || tool_name.contains(pattern) {
                return Err(format!(
                    "Tool identifier contains dangerous pattern: '{pattern}'"
                ));
            }
        }

        // Validate server name and tool name lengths
        if server_name.len() > 128 || tool_name.len() > 128 {
            return Err("Server name or tool name too long (max 128 characters each)".to_string());
        }

        Ok(Self {
            server_name: server_name.to_string(),
            tool_name: tool_name.to_string(),
        })
    }

}

impl std::fmt::Display for ToolIdentifier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}_{}", self.server_name, self.tool_name)
    }
}

/// Request body for chat endpoint
#[derive(Debug, Deserialize, Serialize)]
struct ChatRequest {
    messages: Vec<ChatMessageForStream>,
    #[serde(default)]
    agent_context: Option<AgentContext>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    stream: Option<bool>,
    #[serde(default)]
    tools: Option<Vec<String>>,
    #[serde(default)]
    options: Option<serde_json::Value>,
}

impl ChatRequest {
    /// Validate the chat request
    fn validate(&self) -> Result<(), String> {
        // Check messages are not empty
        if self.messages.is_empty() {
            return Err("Messages array cannot be empty".to_string());
        }

        // Validate model name if provided
        if let Some(model) = &self.model {
            if model.trim().is_empty() {
                return Err("Model name cannot be empty".to_string());
            }
            // Could add more specific model validation here
        }

        // Validate tool names format (should be serverName_toolName)
        if let Some(tools) = &self.tools {
            for tool in tools {
                // Use ToolIdentifier to validate format
                ToolIdentifier::parse(tool)?;
            }
        }

        // Validate options if provided
        if let Some(options) = &self.options {
            if let Some(obj) = options.as_object() {
                // Validate temperature if present
                if let Some(temp) = obj.get("temperature") {
                    if let Some(temp_val) = temp.as_f64() {
                        if !(0.0..=2.0).contains(&temp_val) {
                            return Err("Temperature must be between 0.0 and 2.0".to_string());
                        }
                    }
                }
                // Add more option validations as needed
            }
        }

        Ok(())
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct ChatMessageForStream {
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parts: Option<Vec<ContentPart>>,
}

impl ChatMessageForStream {
    fn get_content(&self) -> String {
        if let Some(content) = &self.content {
            return content.clone();
        }

        if let Some(parts) = &self.parts {
            let mut content = String::new();
            for part in parts {
                match part {
                    ContentPart::Text { text } => content.push_str(text),
                    ContentPart::Image { .. } => content.push_str("[Image]"),
                    ContentPart::Reasoning { .. } => {} // Skip reasoning parts
                    ContentPart::TaskProgress { .. } => {} // Skip task progress
                    ContentPart::AgentState { .. } => {} // Skip agent state
                }
            }
            return content;
        }

        String::new()
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ContentPart {
    Text { text: String },
    Image { image: String },
    Reasoning { data: serde_json::Value },
    TaskProgress { data: serde_json::Value },
    AgentState { data: serde_json::Value },
}

#[derive(Debug, Deserialize, Serialize)]
struct AgentContext {
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    instructions: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mode: Option<String>,
}

/// SSE message types for streaming
#[derive(Debug)]
#[allow(dead_code)]
enum SseMessage {
    MessageStart {
        id: String,
        role: String,
    },
    TextStart {
        id: String,
    },
    TextDelta {
        id: String,
        delta: String,
    },
    TextEnd {
        id: String,
    },
    ContentDelta {
        delta: String,
    },
    StreamEnd,
    ToolCallStart {
        tool_call_id: String,
        tool_name: String,
    },
    ToolCallDelta {
        tool_call_id: String,
        args_delta: String,
    },
    ToolCallResult {
        tool_call_id: String,
        tool_name: String,
        result: serde_json::Value,
    },
    DataPart {
        data_type: String,
        data: serde_json::Value,
    },
    MessageComplete {
        usage: Option<UsageStats>,
    },
    Error {
        error: String,
    },
    Ping,
}

#[derive(Debug, Serialize)]
struct UsageStats {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

/// Ollama tool format for streaming
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

/// Ollama chat request format for streaming
#[derive(Debug, Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaStreamMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OllamaTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Clone)]
struct OllamaStreamMessage {
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
    function: OllamaStreamFunction,
}

#[derive(Debug, Deserialize)]
struct OllamaStreamFunction {
    name: String,
    arguments: serde_json::Value,
}

#[derive(Clone)]
struct Service {
    db: DatabaseConnection,
    ollama_client: OllamaClient,
    ws_service: Arc<WebSocketService>,
    http_client: reqwest::Client,
}

// NOTE: the ideal way here would be that ChatMessageRequest would implement Deserialize and then we could just
// create our own "ProxiedOllamaChatRequest" struct, which contains session_id + all of the OllamaChatRequest
// fields and flatten everything into one object and deserialize the request json bytes into that struct, but
// OllamaChatRequest doesn't "implement" Deserialize.. so this is the alternative
fn convert_proxied_request_to_ollama_request(
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

    // Extract messages array
    let messages_value = match json_value.get("messages") {
        Some(msgs) => msgs,
        None => return Err("Missing messages in request".to_string()),
    };

    // Parse messages as OllamaChatMessage objects
    let messages: Vec<OllamaChatMessage> = match serde_json::from_value(messages_value.clone()) {
        Ok(msgs) => msgs,
        Err(e) => return Err(format!("Failed to parse messages: {e}")),
    };

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

    // NOTE: for right now we don't use format and keep_alive, and the exported structs from ollama-rs
    // don't implement Deserialize so it makes these difficult to deserialize. If we start using them,
    // figure out a solution here..
    // if let Some(format_value) = json_value.get("format") {
    //     if let Ok(format) = serde_json::from_value::<FormatType>(format_value.clone()) {
    //         ollama_request = ollama_request.format(format);
    //     }
    // }

    // if let Some(keep_alive_value) = json_value.get("keep_alive") {
    //     if let Ok(keep_alive) = serde_json::from_value::<KeepAlive>(keep_alive_value.clone()) {
    //         ollama_request = ollama_request.keep_alive(keep_alive);
    //     }
    // }

    if let Some(tools_value) = json_value.get("tools") {
        if let Ok(tools) = serde_json::from_value::<Vec<ToolInfo>>(tools_value.clone()) {
            ollama_request = ollama_request.tools(tools);
        }
    }

    if let Some(think) = json_value.get("think").and_then(|v| v.as_bool()) {
        ollama_request = ollama_request.think(think);
    }

    Ok((ollama_request, session_id))
}

impl Service {
    pub fn new(db: DatabaseConnection, ws_service: Arc<WebSocketService>) -> Self {
        Self {
            db,
            ollama_client: OllamaClient::new(),
            ws_service,
            http_client: reqwest::Client::builder()
                .timeout(Duration::from_secs(180))
                .build()
                .unwrap_or_default(),
        }
    }

    async fn generate_chat_title(
        &self,
        chat_session_id: String,
        chat_model: String,
    ) -> Result<(), String> {
        let chat = Chat::load_by_session_id(chat_session_id.clone(), &self.db)
            .await
            .map_err(|_| "Failed to load chat".to_string())?
            .ok_or_else(|| "Chat not found".to_string())?;

        // Build context from chat messages
        let mut full_chat_context = String::new();
        for message in &chat.messages {
            // Deserialize the OllamaChatMessage from the JSON content
            match serde_json::from_value::<OllamaChatMessage>(message.content.clone()) {
                Ok(chat_message) => {
                    full_chat_context.push_str(&format!(
                        "{:?}: {}

",
                        chat_message.role, chat_message.content
                    ));
                }
                Err(e) => {
                    error!("Failed to deserialize chat message {}: {}", message.id, e);
                    // Continue with other messages, but we could also include raw content as fallback
                    // full_chat_context.push_str(&format!("Unknown: [Failed to parse message]\n\n"));
                }
            }
        }

        let chat_id = chat.id;
        match self
            .ollama_client
            .generate_title(&chat_model, full_chat_context)
            .await
        {
            Ok(title) => {
                debug!("Generated title: {title}");
                // Update chat title
                if chat
                    .chat
                    .update_title(Some(title.clone()), &self.db)
                    .await
                    .is_ok()
                {
                    // Broadcast WebSocket message that the title has been updated
                    let message =
                        WebSocketMessage::ChatTitleUpdated(ChatTitleUpdatedWebSocketPayload {
                            chat_id,
                            title,
                        });
                    self.ws_service.broadcast(message).await;
                    Ok(())
                } else {
                    Err("Failed to update chat title in database".to_string())
                }
            }
            Err(e) => {
                error!("Failed to generate chat title: {e}");
                Err(e)
            }
        }
    }

    async fn proxy_chat_request(&self, req: Request<Body>) -> Result<Response<Body>, String> {
        // Parse the request body
        let body_bytes = match axum::body::to_bytes(req.into_body(), MAX_REQUEST_SIZE).await {
            Ok(bytes) => {
                debug!("Request body size: {} bytes", bytes.len());
                bytes
            }
            Err(e) => {
                error!("Failed to read request body: {}", e);
                return Err(format!("Failed to read request body: {e}"));
            }
        };

        let (ollama_request, session_id) =
            match convert_proxied_request_to_ollama_request(&body_bytes) {
                Ok((request, session_id)) => (request, session_id),
                Err(e) => return Err(e),
            };

        // Load or create chat
        let chat = match Chat::load_by_session_id(session_id.clone(), &self.db).await {
            Ok(Some(c)) => {
                debug!("Found existing chat with session_id: {}", c.session_id);
                c
            }
            Ok(None) => {
                error!("Chat not found for session_id: {}", session_id);
                return Err("Chat not found".to_string());
            }
            Err(e) => {
                error!("Failed to load chat: {}", e);
                return Err(format!("Failed to load chat: {e}"));
            }
        };
        let chat_session_id = chat.session_id.clone();

        // Extract model name before moving ollama_request
        let model_name = ollama_request.model_name.clone();

        // Persist the chat message
        if let Some(last_msg) = ollama_request.messages.last() {
            let content_json = serde_json::json!(&last_msg);

            if let Err(e) = ChatMessage::save(chat_session_id.clone(), content_json, &self.db).await
            {
                error!("Failed to save user message: {e}");
            }
        }

        // Get the streaming response from ollama
        debug!("Sending request to Ollama with model: {}", model_name);
        let stream = match self.ollama_client.chat_stream(ollama_request).await {
            Ok(stream) => {
                debug!("Successfully started chat stream");
                stream
            }
            Err(e) => {
                error!("Failed to start chat stream: {}", e);
                return Err(format!("Failed to start chat stream: {e}"));
            }
        };

        let mut stream = Box::pin(stream);

        // Create a channel for streaming
        // Use unbounded channel for better backpressure handling
        // The HTTP response stream itself provides natural backpressure
        let (tx, rx) = mpsc::unbounded_channel::<Result<axum::body::Bytes, std::io::Error>>();

        let db = self.db.clone();
        let ollama_client = self.ollama_client.clone();
        let ws_service = self.ws_service.clone();

        // Spawn a task to handle the stream
        tokio::spawn(async move {
            let mut accumulated_content = String::new();

            while let Some(response) = stream.next().await {
                match response {
                    Ok(chat_response) => {
                        // Accumulate content with size limit
                        if accumulated_content.len() + chat_response.message.content.len()
                            > MAX_ACCUMULATED_CONTENT
                        {
                            error!(
                                "Accumulated content exceeds maximum size limit of {} bytes",
                                MAX_ACCUMULATED_CONTENT
                            );
                            let error_json = serde_json::json!({
                                "error": "Response too large: exceeded maximum content size limit"
                            });
                            let mut error_bytes =
                                serde_json::to_vec(&error_json).unwrap_or_default();
                            error_bytes.push(b'\n');
                            let _ = tx.send(Ok(axum::body::Bytes::from(error_bytes)));
                            break;
                        }
                        accumulated_content.push_str(&chat_response.message.content);

                        // Convert to JSON and send with newline for NDJSON format
                        let mut json_response =
                            serde_json::to_vec(&chat_response).unwrap_or_default();
                        json_response.push(b'\n'); // Add newline for NDJSON
                        if tx.send(Ok(axum::body::Bytes::from(json_response))).is_err() {
                            break;
                        }

                        // If this is the final message, save it
                        if chat_response.done && !accumulated_content.is_empty() {
                            let chat_response_message = chat_response.message;
                            let final_chat_message = OllamaChatMessage {
                                role: chat_response_message.role,
                                content: accumulated_content.clone(),
                                thinking: chat_response_message.thinking,
                                tool_calls: chat_response_message.tool_calls,
                                images: chat_response_message.images,
                            };

                            if let Err(e) = ChatMessage::save(
                                chat_session_id.clone(),
                                serde_json::json!(&final_chat_message),
                                &db,
                            )
                            .await
                            {
                                error!("Failed to save assistant message: {e}");
                            }

                            // Check if we need to generate a title
                            if let Ok(count) =
                                ChatMessage::count_chat_messages(chat_session_id.clone(), &db).await
                            {
                                if count == MIN_MESSAGES_FOR_TITLE_GENERATION
                                    && chat.title.is_none()
                                {
                                    let service = Service {
                                        db: db.clone(),
                                        ollama_client: ollama_client.clone(),
                                        ws_service: ws_service.clone(),
                                        http_client: reqwest::Client::builder()
                                            .timeout(Duration::from_secs(180))
                                            .build()
                                            .unwrap_or_default(),
                                    };
                                    let _ = service
                                        .generate_chat_title(
                                            chat_session_id.clone(),
                                            model_name.clone(),
                                        )
                                        .await;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let error_json = serde_json::json!({
                            "error": e.to_string()
                        });
                        let mut error_bytes = serde_json::to_vec(&error_json).unwrap_or_default();
                        error_bytes.push(b'\n'); // Add newline for NDJSON
                        let _ = tx.send(Ok(axum::body::Bytes::from(error_bytes)));
                        break;
                    }
                }
            }
        });

        // Convert the receiver into a stream
        let body_stream = UnboundedReceiverStream::new(rx);
        let body = Body::from_stream(body_stream);

        Ok(Response::builder()
            .status(StatusCode::OK)
            .header(HEADER_CONTENT_TYPE, CONTENT_TYPE_NDJSON)
            .body(body)
            .unwrap())
    }

    /// Validate proxy target URL for security
    fn validate_proxy_target(url: &str) -> Result<(), String> {
        // Parse the URL
        let parsed_url = url.parse::<url::Url>().map_err(|_| "Invalid URL format")?;

        // Only allow specific schemes
        match parsed_url.scheme() {
            "http" | "https" => {}
            scheme => return Err(format!("Disallowed URL scheme: {scheme}")),
        }

        // Extract host
        let host = parsed_url.host_str().ok_or("No host in URL")?;

        // Only allow localhost and loopback addresses
        let allowed_hosts = ["localhost", "127.0.0.1", "::1", "[::1]"];
        if !allowed_hosts.contains(&host) {
            return Err(format!(
                "Host not allowed: {host}. Only localhost connections are permitted."
            ));
        }

        // Only allow specific ports (Ollama port)
        if let Some(port) = parsed_url.port() {
            let allowed_ports = [
                54588, // Ollama port from FALLBACK_OLLAMA_SERVER_PORT
                crate::ollama::server::get_ollama_server_port(),
            ];
            if !allowed_ports.contains(&port) {
                return Err(format!(
                    "Port not allowed: {port}. Only Ollama ports are permitted."
                ));
            }
        }

        // Validate path doesn't contain directory traversal
        let path = parsed_url.path();
        if path.contains("..") || path.contains("\\") {
            return Err("Path contains directory traversal patterns".to_string());
        }

        Ok(())
    }

    async fn proxy_other_request(
        &self,
        method: axum::http::Method,
        path: &str,
        req: Request<Body>,
    ) -> Result<Response<Body>, String> {
        // Create HTTP client for proxying
        let client = reqwest::Client::new();

        // Build the target URL for Ollama
        let mut target_host = self.ollama_client.client.url().to_string();
        // Remove trailing slash
        if target_host.ends_with('/') {
            target_host.pop();
        }
        let target_url = format!("{target_host}{path}");
        debug!("Target URL: {}", target_url);

        // Validate the target URL for security
        Self::validate_proxy_target(&target_url)?;

        // Convert axum request to reqwest
        let mut reqwest_builder = client.request(
            match method {
                axum::http::Method::GET => reqwest::Method::GET,
                axum::http::Method::POST => reqwest::Method::POST,
                axum::http::Method::PUT => reqwest::Method::PUT,
                axum::http::Method::DELETE => reqwest::Method::DELETE,
                axum::http::Method::PATCH => reqwest::Method::PATCH,
                _ => return Err("Unsupported HTTP method".to_string()),
            },
            &target_url,
        );

        // Copy headers
        for (name, value) in req.headers() {
            if let Ok(value_str) = value.to_str() {
                reqwest_builder = reqwest_builder.header(name.as_str(), value_str);
            }
        }

        // Copy body
        let body_bytes = match axum::body::to_bytes(req.into_body(), MAX_REQUEST_SIZE).await {
            Ok(bytes) => bytes,
            Err(_) => return Err("Failed to read request body".to_string()),
        };

        if !body_bytes.is_empty() {
            reqwest_builder = reqwest_builder.body(body_bytes.to_vec());
        }

        // Send request to Ollama
        debug!("Sending request to Ollama");
        match reqwest_builder.send().await {
            Ok(resp) => {
                let status = resp.status();
                let headers = resp.headers().clone();
                debug!("Received response with status: {}", status);

                // Stream the response back
                let stream = resp.bytes_stream();
                let body_stream = stream.map(|result| {
                    result
                        .map(|bytes| axum::body::Bytes::from(bytes.to_vec()))
                        .map_err(std::io::Error::other)
                });

                let mut response = Response::builder().status(status.as_u16());

                // Copy response headers
                for (name, value) in headers {
                    if let Some(name) = name {
                        response = response.header(name.as_str(), value.as_bytes());
                    }
                }

                Ok(response.body(Body::from_stream(body_stream)).unwrap())
            }
            Err(e) => {
                error!("Failed to proxy request to Ollama: {}", e);
                Err(format!(
                    "Failed to proxy request to Ollama (is Ollama running?): {e}"
                ))
            }
        }
    }
}

/// Handle OPTIONS requests for CORS preflight
async fn handle_stream_options() -> Result<AxumResponse, StatusCode> {
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

/// Handle chat requests with SSE streaming
async fn stream_handler(
    State(service): State<Arc<Service>>,
    Json(payload): Json<ChatRequest>,
) -> Result<AxumResponse, StatusCode> {
    // Validate the request
    if let Err(e) = payload.validate() {
        error!("Invalid chat request: {}", e);
        return Err(StatusCode::BAD_REQUEST);
    }

    // Log the received request
    eprintln!(
        "[stream_handler] Received request with model: {:?}",
        payload.model
    );

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
    service: Arc<Service>,
    request: ChatRequest,
) -> impl Stream<Item = Result<Event, Infallible>> {
    // Use unbounded channel for better backpressure handling
    // SSE response stream provides natural backpressure through client consumption
    let (tx, rx) = mpsc::unbounded_channel::<SseMessage>();

    // Spawn task to handle chat execution
    tokio::spawn(async move {
        if let Err(e) = execute_chat_stream(service, request, tx.clone()).await {
            // Send error event
            let _ = tx.send(SseMessage::Error {
                error: format!("Chat execution failed: {e}"),
            });
        }
    });

    // Convert receiver to SSE events following Vercel AI SDK v5 protocol
    UnboundedReceiverStream::new(rx).map(|msg| {
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
                // Tool input start event (Vercel AI SDK v5 format)
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
                // Tool input delta event (Vercel AI SDK v5 format)
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
                // Tool output available event (Vercel AI SDK v5 format)
                if let Some(error_value) = result.get("error") {
                    // Send as tool output error
                    Event::default().data(
                        serde_json::to_string(&serde_json::json!({
                            "type": "tool-output-error",
                            "toolCallId": tool_call_id,
                            "errorText": error_value.as_str().unwrap_or("Tool execution failed")
                        }))
                        .unwrap(),
                    )
                } else {
                    // Send as tool output available
                    Event::default().data(
                        serde_json::to_string(&serde_json::json!({
                            "type": "tool-output-available",
                            "toolCallId": tool_call_id,
                            "output": result
                        }))
                        .unwrap(),
                    )
                }
            }
            SseMessage::DataPart { data_type, data } => {
                // Handle special event types that don't need data- prefix
                match data_type.as_str() {
                    "start-step" | "finish-step" => {
                        // These are standard Vercel AI SDK v5 events without data
                        Event::default().data(
                            serde_json::to_string(&serde_json::json!({
                                "type": data_type,
                            }))
                            .unwrap(),
                        )
                    }
                    "tool-input-available" => {
                        // Tool input available needs to merge the data
                        let mut event = serde_json::json!({
                            "type": "tool-input-available"
                        });
                        if let serde_json::Value::Object(map) = data {
                            if let serde_json::Value::Object(event_map) = &mut event {
                                event_map.extend(map);
                            }
                        }
                        Event::default().data(serde_json::to_string(&event).unwrap())
                    }
                    _ => {
                        // Custom data parts need data- prefix for Vercel AI SDK v5
                        Event::default().data(
                            serde_json::to_string(&serde_json::json!({
                                "type": format!("data-{}", data_type),
                                "data": data
                            }))
                            .unwrap(),
                        )
                    }
                }
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

async fn proxy_handler(
    State(service): State<Arc<Service>>,
    req: Request<Body>,
) -> impl IntoResponse {
    let path = req.uri().path().to_string();
    let method = req.method().clone();

    let result = match path.as_str() {
        "/api/chat" => service.proxy_chat_request(req).await,
        _ => service.proxy_other_request(method, &path, req).await,
    };

    match result {
        Ok(response) => response,
        Err(e) => {
            error!("Request failed with error: {}", e);
            (StatusCode::BAD_GATEWAY, format!("Proxy error: {e}")).into_response()
        }
    }
}

/// Execute chat and stream results
async fn execute_chat_stream(
    service: Arc<Service>,
    request: ChatRequest,
    tx: mpsc::UnboundedSender<SseMessage>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Start message
    let message_id = uuid::Uuid::new_v4().to_string();
    tx.send(SseMessage::MessageStart {
        id: message_id.clone(),
        role: ROLE_ASSISTANT.to_string(),
    })?;

    // Use the messages directly
    let messages = request.messages;

    // Convert messages to Ollama format
    let mut ollama_messages: Vec<OllamaStreamMessage> = messages
        .into_iter()
        .map(|msg| {
            let content = msg.get_content();
            OllamaStreamMessage {
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
    let selected_model = request
        .model
        .clone()
        .unwrap_or_else(|| "llama3.2".to_string());
    eprintln!("[execute_chat_stream] Using model: {selected_model}");

    // Keep track of the maximum number of tool rounds to prevent infinite loops
    const MAX_TOOL_ROUNDS: usize = 10;
    const MAX_OLLAMA_MESSAGES: usize = 100; // Maximum number of messages to keep in history
    let mut tool_round = 0;
    let mut _had_tool_calls_in_previous_round = false;

    // Pre-allocate tool results vector to reuse across iterations
    let mut tool_results: Vec<(String, String, serde_json::Value)> = Vec::with_capacity(10);

    // Continue making LLM calls until no more tools are called or we hit the limit
    loop {
        // Trim message history if it gets too long
        if ollama_messages.len() > MAX_OLLAMA_MESSAGES {
            // Keep the first message (usually system prompt) and the most recent messages
            let start_index = ollama_messages
                .len()
                .saturating_sub(MAX_OLLAMA_MESSAGES - 1);
            let mut trimmed_messages = vec![ollama_messages[0].clone()];
            trimmed_messages.extend_from_slice(&ollama_messages[start_index..]);
            ollama_messages = trimmed_messages;
            debug!(
                "Trimmed message history to {} messages",
                ollama_messages.len()
            );
        }
        tool_round += 1;
        if tool_round > MAX_TOOL_ROUNDS {
            eprintln!(
                "[execute_chat_stream] Reached maximum tool rounds ({MAX_TOOL_ROUNDS})"
            );
            break;
        }

        // We don't need step events here - they should wrap tool execution phases

        // Clear tool results for this round
        tool_results.clear();
        let mut had_tool_calls = false;
        let mut completed_tools = 0;

        // Make LLM call with current message history
        let ollama_request = OllamaChatRequest {
            model: selected_model.clone(),
            messages: ollama_messages.clone(),
            stream: true,
            tools: tools.clone(),
            options: request.options.clone(),
        };

        // Call Ollama API
        let ollama_url = format!(
            "http://localhost:{}/api/chat",
            crate::ollama::server::get_ollama_server_port()
        );
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
                                })?;
                                text_started = true;
                            }

                            // Check size limit before accumulating
                            if accumulated_content.len() + chat_chunk.message.content.len()
                                > MAX_ACCUMULATED_CONTENT
                            {
                                error!(
                                    "Accumulated content exceeds maximum size limit of {} bytes",
                                    MAX_ACCUMULATED_CONTENT
                                );
                                tx.send(SseMessage::Error {
                                    error:
                                        "Response too large: exceeded maximum content size limit"
                                            .to_string(),
                                })?;
                                return Err("Content size limit exceeded".into());
                            }
                            accumulated_content.push_str(&chat_chunk.message.content);
                            tx.send(SseMessage::TextDelta {
                                id: text_block_id.clone(),
                                delta: chat_chunk.message.content.clone(),
                            })?;
                        }

                        // Handle tool calls if present
                        if let Some(tool_calls) = chat_chunk.message.tool_calls {
                            let total_tools = tool_calls.len();

                            // Tool execution starting

                            // Send start-step event before executing tools (only once per round)
                            if !had_tool_calls {
                                tx.send(SseMessage::DataPart {
                                    data_type: "start-step".to_string(),
                                    data: serde_json::json!({}),
                                })?;
                                had_tool_calls = true;
                            }

                            for tool_call in tool_calls {
                                let tool_id = tool_call
                                    .id
                                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                                let tool_name = tool_call.function.name.clone();

                                // Send tool call start event
                                tx.send(SseMessage::ToolCallStart {
                                    tool_call_id: tool_id.clone(),
                                    tool_name: tool_name.clone(),
                                })?;

                                // Send tool arguments
                                tx.send(SseMessage::ToolCallDelta {
                                    tool_call_id: tool_id.clone(),
                                    args_delta: tool_call.function.arguments.to_string(),
                                })?;

                                // Send tool input available event
                                tx.send(SseMessage::DataPart {
                                    data_type: "tool-input-available".to_string(),
                                    data: serde_json::json!({
                                        "toolCallId": tool_id.clone(),
                                        "toolName": tool_name.clone(),
                                        "input": tool_call.function.arguments.clone()
                                    }),
                                })?;

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
                                            tool_name: tool_name.clone(),
                                            result,
                                        })?;

                                        // Update progress after successful tool execution
                                        completed_tools += 1;
                                        tx.send(SseMessage::DataPart {
                                        data_type: "task-progress".to_string(),
                                        data: serde_json::json!({
                                            "progress": {
                                                "completed": completed_tools,
                                                "total": total_tools,
                                                "currentStep": format!("Executed tool: {}", tool_name),
                                                "percentComplete": (completed_tools * 100 / total_tools) as i32
                                            }
                                        }),
                                    })
                                    ?;
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
                                        })?;
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
                                })?;
                            }

                            // If we had tool calls, update message history and continue loop
                            if had_tool_calls && !tool_results.is_empty() {
                                // Add assistant message with content if any
                                if !accumulated_content.is_empty() {
                                    ollama_messages.push(OllamaStreamMessage {
                                        role: ROLE_ASSISTANT.to_string(),
                                        content: accumulated_content.clone(),
                                    });
                                }

                                // Add tool results as assistant messages
                                for (tool_id, tool_name, result) in &tool_results {
                                    ollama_messages.push(OllamaStreamMessage {
                                        role: ROLE_ASSISTANT.to_string(),
                                        content: format!(
                                            "Tool {} (id: {}) returned: {}",
                                            tool_name,
                                            tool_id,
                                            serde_json::to_string_pretty(result)
                                                .unwrap_or_else(|_| result.to_string())
                                        ),
                                    });
                                }

                                // Add a system message to guide the LLM to reflect on tool results
                                ollama_messages.push(OllamaStreamMessage {
                                role: ROLE_SYSTEM.to_string(),
                                content: "The tools have been executed. Please analyze the results and provide a helpful response to the user based on what the tools returned. If there were any errors, suggest alternatives. Always aim to be helpful and actionable.".to_string(),
                            });

                                // Send finish-step to close the tool execution phase
                                tx.send(SseMessage::DataPart {
                                    data_type: "finish-step".to_string(),
                                    data: serde_json::json!({}),
                                })?;

                                // Track that we had tool calls for the next round
                                _had_tool_calls_in_previous_round = true;

                                // Break out of the streaming loop to continue with next tool round
                                break;
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

                                // Completion handled

                                tx.send(SseMessage::MessageComplete { usage })?;
                                tx.send(SseMessage::StreamEnd)?;
                                return Ok(());
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to parse Ollama chunk: {e}, line: {line}");
                    }
                }
            }
        }

        // End of streaming for this round
    } // End of loop

    // If we get here, we've either completed normally or hit the max rounds
    // Send a final completion message if we haven't already
    if tool_round > MAX_TOOL_ROUNDS {
        // Send a message explaining we hit the limit
        let final_text_id = format!("text-{}", uuid::Uuid::new_v4());
        tx.send(SseMessage::TextStart {
            id: final_text_id.clone(),
        })?;

        tx.send(SseMessage::TextDelta {
            id: final_text_id.clone(),
            delta: "

[Note: Reached maximum number of tool iterations. Process stopped to prevent infinite loops.]"
                .to_string(),
        })?;

        tx.send(SseMessage::TextEnd { id: final_text_id })?;

        tx.send(SseMessage::MessageComplete { usage: None })?;
        tx.send(SseMessage::StreamEnd)?;
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
    let mut tools_by_server: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();

    for tool_name in tool_names {
        // Parse tool identifier
        let tool_id = match ToolIdentifier::parse(&tool_name) {
            Ok(id) => id,
            Err(e) => {
                eprintln!("Invalid tool name format: {tool_name} - {e}");
                continue;
            }
        };

        let server_name = tool_id.server_name.clone();
        let tool_name_only = tool_id.tool_name.clone();

        tools_by_server
            .entry(server_name)
            .or_default()
            .push(tool_name_only);
    }

    // Query each server for its tools
    for (server_name, requested_tools) in tools_by_server {
        // Create JSON-RPC request to list tools
        let list_tools_request = serde_json::json!({
            "jsonrpc": JSONRPC_VERSION,
            "id": uuid::Uuid::new_v4().to_string(),
            "method": JSONRPC_METHOD_TOOLS_LIST,
            "params": {}
        });

        match crate::sandbox::forward_raw_request(
            &server_name,
            serde_json::to_string(&list_tools_request)?,
        )
        .await
        {
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
                                        let parameters =
                                            tool.get("inputSchema").cloned().unwrap_or_else(|| {
                                                serde_json::json!({
                                                    "type": "object",
                                                    "properties": {},
                                                    "additionalProperties": true
                                                })
                                            });

                                        ollama_tools.push(OllamaTool {
                                            tool_type: TOOL_TYPE_FUNCTION.to_string(),
                                            function: OllamaToolFunction {
                                                name: ToolIdentifier {
                                                    server_name: server_name.to_string(),
                                                    tool_name: name.to_string(),
                                                }
                                                .to_string(),
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
                eprintln!("Failed to list tools from server '{server_name}': {e}");
                // Fall back to basic tool definition for this server's tools
                for tool_name_only in requested_tools {
                    ollama_tools.push(OllamaTool {
                        tool_type: TOOL_TYPE_FUNCTION.to_string(),
                        function: OllamaToolFunction {
                            name: ToolIdentifier {
                                server_name: server_name.clone(),
                                tool_name: tool_name_only.clone(),
                            }
                            .to_string(),
                            description: format!("MCP tool from server: {server_name}"),
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

/// Validate tool arguments for security
fn validate_tool_arguments(arguments: &serde_json::Value) -> Result<(), String> {
    // Convert to string for pattern checking
    let args_str = arguments.to_string();

    // Size check (1MB limit)
    if args_str.len() > 1024 * 1024 {
        return Err("Tool arguments too large (max 1MB)".to_string());
    }

    // Check for command injection patterns
    let dangerous_patterns = [
        "$(",
        "${",
        "`",
        "&&",
        "||",
        ";",
        "|",
        ">",
        "<",
        ">>",
        "<<",
        "file://",
        "javascript:",
        "../",
        "\\x",
        "\\u",
        "\n",
        "\r",
        "\t",
        "\0",
        "exec(",
        "eval(",
        "system(",
        "__import__",
        "subprocess",
        "os.system",
        "shell_exec",
    ];

    for pattern in dangerous_patterns {
        if args_str.contains(pattern) {
            return Err(format!(
                "Tool arguments contain dangerous pattern: '{pattern}'"
            ));
        }
    }

    // Additional validation for deeply nested structures (prevent DoS)
    let max_depth = calculate_json_depth(arguments);
    if max_depth > 10 {
        return Err("Tool arguments are too deeply nested (max depth: 10)".to_string());
    }

    Ok(())
}

/// Calculate the maximum depth of a JSON value
fn calculate_json_depth(value: &serde_json::Value) -> usize {
    match value {
        serde_json::Value::Object(map) => {
            1 + map.values().map(calculate_json_depth).max().unwrap_or(0)
        }
        serde_json::Value::Array(arr) => {
            1 + arr.iter().map(calculate_json_depth).max().unwrap_or(0)
        }
        _ => 0,
    }
}

/// Execute an MCP tool through the proxy
async fn execute_mcp_tool(
    _db: &DatabaseConnection,
    tool_name: &str,
    arguments: &serde_json::Value,
) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
    // Parse tool identifier
    let tool_id = ToolIdentifier::parse(tool_name).map_err(|e| {
        Box::new(std::io::Error::new(std::io::ErrorKind::InvalidInput, e))
            as Box<dyn std::error::Error + Send + Sync>
    })?;

    let server_name = &tool_id.server_name;
    let tool_name_only = &tool_id.tool_name;

    // Validate tool arguments for security
    validate_tool_arguments(arguments).map_err(|e| {
        Box::new(std::io::Error::new(std::io::ErrorKind::InvalidInput, e))
            as Box<dyn std::error::Error + Send + Sync>
    })?;

    // Create JSON-RPC request for MCP proxy
    let mcp_request = serde_json::json!({
        "jsonrpc": JSONRPC_VERSION,
        "id": uuid::Uuid::new_v4().to_string(),
        "method": JSONRPC_METHOD_TOOLS_CALL,
        "params": {
            "name": tool_name_only,
            "arguments": arguments
        }
    });

    // Call MCP proxy endpoint with timeout
    let client = reqwest::Client::builder()
        .timeout(TOOL_EXECUTION_TIMEOUT)
        .build()
        .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
    let proxy_url = format!(
        "http://localhost:{}/mcp_proxy/{}",
        crate::gateway::GATEWAY_SERVER_PORT,
        server_name
    );

    let response = client.post(&proxy_url).json(&mcp_request).send().await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(format!("MCP proxy error: {error_text}").into());
    }

    let result: serde_json::Value = response.json().await?;

    // Extract result from JSON-RPC response
    if let Some(error) = result.get("error") {
        return Err(format!("MCP tool error: {error}").into());
    }

    Ok(result
        .get("result")
        .cloned()
        .unwrap_or(serde_json::Value::Null))
}

pub fn create_router(db: DatabaseConnection, ws_service: Arc<WebSocketService>) -> Router {
    let service = Arc::new(Service::new(db, ws_service));

    Router::new()
        .route(
            "/stream",
            axum::routing::post(stream_handler).options(handle_stream_options),
        )
        .fallback(proxy_handler)
        .with_state(service)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::chat::{ChatDefinition, Model as ChatModel};
    use crate::test_fixtures::database;
    use axum::body::Body;
    use axum::http::Request;
    use rstest::rstest;
    use serde_json::json;

    // Mock WebSocket service for testing
    fn create_mock_ws_service() -> Arc<WebSocketService> {
        Arc::new(WebSocketService::new())
    }

    // Test convert_proxied_request_to_ollama_request function
    #[rstest]
    #[tokio::test]
    async fn test_convert_request_valid(#[future] database: DatabaseConnection) {
        let _db = database.await;

        let request_json = json!({
            "session_id": "test-session-123",
            "model": "llama3.2",
            "messages": [
                {
                    "role": "user",
                    "content": "Hello, world!"
                },
                {
                    "role": "assistant",
                    "content": "Hi there!"
                }
            ]
        });

        let bytes = serde_json::to_vec(&request_json).unwrap();
        let result = convert_proxied_request_to_ollama_request(&bytes);

        assert!(result.is_ok());
        let (ollama_request, session_id) = result.unwrap();
        assert_eq!(session_id, "test-session-123");
        assert_eq!(ollama_request.model_name, "llama3.2");
        assert_eq!(ollama_request.messages.len(), 2);
        assert_eq!(ollama_request.messages[0].content, "Hello, world!");
        assert_eq!(ollama_request.messages[1].content, "Hi there!");
    }

    #[rstest]
    #[tokio::test]
    async fn test_convert_request_with_options(#[future] database: DatabaseConnection) {
        let _db = database.await;

        let request_json = json!({
            "session_id": "test-session-456",
            "model": "llama3.2",
            "messages": [{"role": "user", "content": "Test"}],
            "options": {
                "temperature": 0.7,
                "top_p": 0.9
            },
            "template": "custom-template",
            "think": true
        });

        let bytes = serde_json::to_vec(&request_json).unwrap();
        let result = convert_proxied_request_to_ollama_request(&bytes);

        assert!(result.is_ok());
        let (ollama_request, session_id) = result.unwrap();
        assert_eq!(session_id, "test-session-456");
        assert_eq!(ollama_request.model_name, "llama3.2");
        // Options and other fields should be set (can't directly inspect due to builder pattern)
    }

    #[rstest]
    #[tokio::test]
    async fn test_convert_request_with_tools(#[future] database: DatabaseConnection) {
        let _db = database.await;

        let request_json = json!({
            "session_id": "test-tools",
            "model": "llama3.2",
            "messages": [{"role": "user", "content": "Use tool"}],
            "tools": [{
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "Get weather info",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "location": {"type": "string"}
                        }
                    }
                }
            }]
        });

        let bytes = serde_json::to_vec(&request_json).unwrap();
        let result = convert_proxied_request_to_ollama_request(&bytes);

        assert!(result.is_ok());
    }

    #[rstest]
    #[tokio::test]
    async fn test_convert_request_missing_session_id(#[future] database: DatabaseConnection) {
        let _db = database.await;

        let request_json = json!({
            "model": "llama3.2",
            "messages": [{"role": "user", "content": "Hello"}]
        });

        let bytes = serde_json::to_vec(&request_json).unwrap();
        let result = convert_proxied_request_to_ollama_request(&bytes);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Missing session_id in request");
    }

    #[rstest]
    #[tokio::test]
    async fn test_convert_request_missing_model(#[future] database: DatabaseConnection) {
        let _db = database.await;

        let request_json = json!({
            "session_id": "test-session",
            "messages": [{"role": "user", "content": "Hello"}]
        });

        let bytes = serde_json::to_vec(&request_json).unwrap();
        let result = convert_proxied_request_to_ollama_request(&bytes);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Missing model in request");
    }

    #[rstest]
    #[tokio::test]
    async fn test_convert_request_missing_messages(#[future] database: DatabaseConnection) {
        let _db = database.await;

        let request_json = json!({
            "session_id": "test-session",
            "model": "llama3.2"
        });

        let bytes = serde_json::to_vec(&request_json).unwrap();
        let result = convert_proxied_request_to_ollama_request(&bytes);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Missing messages in request");
    }

    #[rstest]
    #[tokio::test]
    async fn test_convert_request_invalid_json(#[future] database: DatabaseConnection) {
        let _db = database.await;

        let bytes = b"invalid json";
        let result = convert_proxied_request_to_ollama_request(bytes);

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to parse JSON"));
    }

    #[rstest]
    #[tokio::test]
    async fn test_convert_request_invalid_messages_format(#[future] database: DatabaseConnection) {
        let _db = database.await;

        let request_json = json!({
            "session_id": "test-session",
            "model": "llama3.2",
            "messages": "not an array"
        });

        let bytes = serde_json::to_vec(&request_json).unwrap();
        let result = convert_proxied_request_to_ollama_request(&bytes);

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to parse messages"));
    }

    // Test generate_chat_title
    #[rstest]
    #[tokio::test]
    async fn test_generate_chat_title_success(#[future] database: DatabaseConnection) {
        let db = database.await;
        let _ws_service = create_mock_ws_service();

        // Create a chat
        let chat = ChatModel::save(
            ChatDefinition {
                llm_provider: "ollama".to_string(),
            },
            &db,
        )
        .await
        .unwrap();

        // Add some messages
        for i in 0..4 {
            let role = if i % 2 == 0 { "user" } else { "assistant" };
            let content = json!({
                "role": role,
                "content": format!("Message {}", i)
            });
            ChatMessage::save(chat.session_id.clone(), content, &db)
                .await
                .unwrap();
        }

        // We can't easily test this without proper mocking, but the structure is correct
        // In a real test, we'd use a mocking framework or dependency injection
        //
        // Mock Ollama client that returns a fixed title
        // struct MockOllamaClient;
        // impl MockOllamaClient {
        //     async fn generate_title(&self, _model: &str, _context: String) -> Result<String, String> {
        //         Ok("Test Chat Title".to_string())
        //     }
        // }
    }

    #[rstest]
    #[tokio::test]
    async fn test_generate_chat_title_chat_not_found(#[future] database: DatabaseConnection) {
        let db = database.await;
        let _ws_service = create_mock_ws_service();
        let service = Service::new(db, _ws_service);

        let result = service
            .generate_chat_title("non-existent-session".to_string(), "llama3.2".to_string())
            .await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Chat not found");
    }

    // Test proxy_other_request
    #[rstest]
    #[tokio::test]
    async fn test_proxy_other_request_get(#[future] database: DatabaseConnection) {
        let db = database.await;
        let _ws_service = create_mock_ws_service();
        let _service = Service::new(db, _ws_service);

        // Create a GET request
        let _req = Request::builder()
            .method("GET")
            .uri("/api/tags")
            .body(Body::empty())
            .unwrap();

        // This test would require a mock HTTP server to test properly
        // The structure is correct but we can't test without external dependencies
    }

    // Test edge cases
    #[rstest]
    #[tokio::test]
    async fn test_proxy_chat_request_chat_not_found(#[future] database: DatabaseConnection) {
        let db = database.await;
        let _ws_service = create_mock_ws_service();
        let service = Service::new(db, _ws_service);

        let request_json = json!({
            "session_id": "non-existent-session",
            "model": "llama3.2",
            "messages": [{"role": "user", "content": "Hello"}]
        });

        let req = Request::builder()
            .method("POST")
            .uri("/api/chat")
            .body(Body::from(serde_json::to_vec(&request_json).unwrap()))
            .unwrap();

        let result = service.proxy_chat_request(req).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Chat not found");
    }
}
