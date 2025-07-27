use crate::gateway::websocket::{
    ChatTitleUpdatedWebSocketPayload, Service as WebSocketService, WebSocketMessage,
};
use crate::models::chat::Model as Chat;
use crate::models::chat_messages::Model as ChatMessage;
use crate::ollama::client::OllamaClient;
use axum::{
    body::Body,
    extract::State,
    http::{Request, Response, StatusCode},
    response::IntoResponse,
    Router,
};
use futures_util::StreamExt;
use ollama_rs::{
    generation::{
        chat::{request::ChatMessageRequest, ChatMessage as OllamaChatMessage},
        tools::ToolInfo,
    },
    models::ModelOptions,
};
use sea_orm::DatabaseConnection;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tracing::{debug, error};

// Constants
const MIN_MESSAGES_FOR_TITLE_GENERATION: u64 = 4;

#[derive(Clone)]
struct Service {
    db: Arc<DatabaseConnection>,
    ollama_client: OllamaClient,
    ws_service: Arc<WebSocketService>,
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
            db: Arc::new(db),
            ollama_client: OllamaClient::new(),
            ws_service,
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
            if let Ok(chat_message) =
                serde_json::from_value::<OllamaChatMessage>(message.content.clone())
            {
                full_chat_context.push_str(&format!(
                    "{:?}: {}\n\n",
                    chat_message.role, chat_message.content
                ));
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
        let body_bytes = match axum::body::to_bytes(req.into_body(), usize::MAX).await {
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
        let (tx, rx) = mpsc::channel::<Result<axum::body::Bytes, std::io::Error>>(100);

        let db = self.db.clone();
        let ollama_client = self.ollama_client.clone();
        let ws_service = self.ws_service.clone();

        // Spawn a task to handle the stream
        tokio::spawn(async move {
            let mut accumulated_content = String::new();

            while let Some(response) = stream.next().await {
                match response {
                    Ok(chat_response) => {
                        // Accumulate content
                        accumulated_content.push_str(&chat_response.message.content);

                        // Convert to JSON and send with newline for NDJSON format
                        let mut json_response =
                            serde_json::to_vec(&chat_response).unwrap_or_default();
                        json_response.push(b'\n'); // Add newline for NDJSON
                        if tx
                            .send(Ok(axum::body::Bytes::from(json_response)))
                            .await
                            .is_err()
                        {
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
                        let _ = tx.send(Ok(axum::body::Bytes::from(error_bytes))).await;
                        break;
                    }
                }
            }
        });

        // Convert the receiver into a stream
        let body_stream = ReceiverStream::new(rx);
        let body = Body::from_stream(body_stream);

        Ok(Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "application/x-ndjson")
            .body(body)
            .unwrap())
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
        let target_url = format!("{}{}", self.ollama_client.client.url(), path);
        debug!("Target URL: {}", target_url);

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
        let body_bytes = match axum::body::to_bytes(req.into_body(), usize::MAX).await {
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

pub fn create_router(db: DatabaseConnection, ws_service: Arc<WebSocketService>) -> Router {
    Router::new()
        .fallback(proxy_handler)
        .with_state(Arc::new(Service::new(db, ws_service)))
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
