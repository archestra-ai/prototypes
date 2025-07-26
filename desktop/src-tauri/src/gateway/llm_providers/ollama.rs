use crate::models::chat::Model as Chat;
use crate::models::chat_interactions::Model as ChatInteraction;
use crate::ollama::client::OllamaClient;
use axum::{
    body::{Body, Bytes},
    extract::State,
    http::{Request, Response, StatusCode},
    response::IntoResponse,
    Router,
};
use futures_util::StreamExt;
use ollama_rs::generation::{
    chat::{request::ChatMessageRequest, ChatMessage, MessageRole},
    images::Image,
    tools::{ToolCall, ToolCallFunction},
};
use sea_orm::DatabaseConnection;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

// Constants
const MIN_INTERACTIONS_FOR_TITLE_GENERATION: u64 = 4;

// Minimal wrapper that adds session_id to ollama requests
#[derive(Deserialize)]
struct ArchestraProxiedOllamaChatRequest {
    session_id: String,
    #[serde(flatten)]
    ollama_fields: Value, // Capture all other fields
}

#[derive(Clone)]
struct Service {
    app_handle: AppHandle,
    db: Arc<DatabaseConnection>,
    ollama_client: OllamaClient,
}

impl Service {
    pub fn new(app_handle: AppHandle, db: DatabaseConnection) -> Self {
        Self {
            app_handle,
            db: Arc::new(db),
            ollama_client: OllamaClient::new(),
        }
    }

    async fn generate_chat_title(&self, chat_session_id: String) -> Result<(), String> {
        let chat = Chat::load_by_session_id(chat_session_id.clone(), &self.db)
            .await
            .map_err(|_| "Failed to load chat".to_string())?
            .ok_or_else(|| "Chat not found".to_string())?;

        let chat_model = chat.llm_model.clone();

        // Load chat with interactions
        let chat_with_interactions = match chat.load_with_interactions(&self.db).await {
            Ok(Some(cwi)) => cwi,
            _ => return Err("Failed to load chat with interactions".to_string()),
        };

        // Build context from chat interactions
        let mut full_chat_context = String::new();
        for interaction in &chat_with_interactions.interactions {
            full_chat_context.push_str(&interaction.content.to_string());
            full_chat_context.push_str("\n\n");
        }

        let chat = chat_with_interactions.chat;
        match self
            .ollama_client
            .generate_title(&chat_model, full_chat_context)
            .await
        {
            Ok(title) => {
                println!("Generated title: {title}");
                // Update chat title
                if chat
                    .update_title(Some(title.clone()), &self.db)
                    .await
                    .is_ok()
                {
                    // Emit event to frontend that the title has been updated
                    let _ = self.app_handle.emit(
                        "chat-title-updated",
                        serde_json::json!({
                            "chatSessionId": chat_session_id,
                            "title": title
                        }),
                    );
                    Ok(())
                } else {
                    Err("Failed to update chat title in database".to_string())
                }
            }
            Err(e) => {
                eprintln!("Failed to generate chat title: {e}");
                Err(e)
            }
        }
    }

    fn convert_archestra_proxied_chat_request_to_ollama_chat_message(
        &self,
        request_body_bytes: Bytes,
    ) -> Result<(ChatMessageRequest, String), String> {
        // Parse our wrapper to extract session_id
        let archestra_request: ArchestraProxiedOllamaChatRequest =
            match serde_json::from_slice(&request_body_bytes) {
                Ok(data) => data,
                Err(e) => return Err(format!("Failed to parse chat request: {e}")),
            };

        // Extract fields from the flattened JSON to build ChatMessageRequest
        let model_name = archestra_request.ollama_fields["model"]
            .as_str()
            .ok_or_else(|| "Missing model in request".to_string())?
            .to_string();

        // Parse messages
        let messages_json = archestra_request.ollama_fields["messages"]
            .as_array()
            .ok_or_else(|| "Missing or invalid messages array".to_string())?;

        let mut messages = Vec::new();
        for msg_json in messages_json {
            let role_str = msg_json["role"]
                .as_str()
                .ok_or_else(|| "Missing role in message".to_string())?;

            let role = match role_str {
                "user" => MessageRole::User,
                "assistant" => MessageRole::Assistant,
                "system" => MessageRole::System,
                _ => return Err(format!("Invalid role: {}", role_str)),
            };

            let content = msg_json["content"]
                .as_str()
                .ok_or_else(|| "Missing content in message".to_string())?
                .to_string();

            // Parse optional fields
            let tool_calls = if let Some(tool_calls_json) = msg_json["tool_calls"].as_array() {
                tool_calls_json
                    .iter()
                    .filter_map(|tc| {
                        // Parse tool call JSON structure
                        if let Some(function) = tc["function"].as_object() {
                            let name = function["name"].as_str();
                            let args = function.get("arguments");
                            if let (Some(name), Some(args)) = (name, args) {
                                Some(ToolCall {
                                    function: ToolCallFunction {
                                        name: name.to_string(),
                                        arguments: args.clone(),
                                    },
                                })
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    })
                    .collect()
            } else {
                vec![]
            };

            let images = if let Some(images_json) = msg_json["images"].as_array() {
                Some(
                    images_json
                        .iter()
                        .filter_map(|img| img.as_str().map(|s| Image::from_base64(s)))
                        .collect(),
                )
            } else {
                None
            };

            let thinking = msg_json["thinking"].as_str().map(|s| s.to_string());

            // Construct the message with all fields
            let message = ChatMessage {
                role,
                content,
                tool_calls,
                images,
                thinking,
            };

            messages.push(message);
        }

        // Create the ollama-rs ChatMessageRequest using its constructor
        let ollama_request = ChatMessageRequest::new(model_name.clone(), messages);

        // Apply optional fields using builder pattern
        // Note: We'll apply these fields if ollama-rs adds Deserialize implementations in the future
        // For now, the ChatMessageRequest will use its default values for these fields

        Ok((ollama_request, archestra_request.session_id))
    }

    async fn proxy_chat_request(&self, req: Request<Body>) -> Result<Response<Body>, String> {
        // Parse the request body
        let body_bytes = match axum::body::to_bytes(req.into_body(), usize::MAX).await {
            Ok(bytes) => bytes,
            Err(_) => return Err("Failed to read request body".to_string()),
        };

        let (ollama_request, session_id) =
            match self.convert_archestra_proxied_chat_request_to_ollama_chat_message(body_bytes) {
                Ok(data) => data,
                Err(e) => {
                    return Err(format!(
                    "Failed to convert archestra proxied chat request to ollama chat message: {e}"
                ))
                }
            };

        // Load or create chat
        let chat = match Chat::load_by_session_id(session_id.clone(), &self.db).await {
            Ok(Some(c)) => c,
            Ok(None) => {
                // Create new chat if it doesn't exist
                match Chat::save(
                    crate::models::chat::ChatDefinition {
                        llm_provider: "ollama".to_string(),
                        llm_model: ollama_request.model_name.clone(),
                    },
                    &self.db,
                )
                .await
                {
                    Ok(c) => c,
                    Err(e) => return Err(format!("Failed to create chat: {e}")),
                }
            }
            Err(e) => return Err(format!("Failed to load chat: {e}")),
        };

        let chat_session_id = chat.session_id.clone();

        // Persist the chat interaction
        if let Some(last_msg) = ollama_request.messages.last() {
            let content_json = serde_json::json!(&last_msg.content);

            if let Err(e) =
                ChatInteraction::save(chat_session_id.clone(), content_json.to_string(), &self.db)
                    .await
            {
                eprintln!("Failed to save user message: {e}");
            }
        }

        // Get the streaming response from ollama
        let stream = match self.ollama_client.chat_stream(ollama_request).await {
            Ok(stream) => stream,
            Err(e) => return Err(format!("Failed to start chat stream: {e}")),
        };

        let mut stream = Box::pin(stream);

        // Create a channel for streaming
        let (tx, rx) = mpsc::channel::<Result<axum::body::Bytes, std::io::Error>>(100);

        let db = self.db.clone();
        let app_handle = self.app_handle.clone();
        let ollama_client = self.ollama_client.clone();

        // Spawn a task to handle the stream
        tokio::spawn(async move {
            let mut accumulated_content = String::new();

            while let Some(response) = stream.next().await {
                match response {
                    Ok(chat_response) => {
                        // Accumulate content
                        accumulated_content.push_str(&chat_response.message.content);

                        // Convert to JSON and send
                        let json_response = serde_json::to_vec(&chat_response).unwrap_or_default();
                        if tx
                            .send(Ok(axum::body::Bytes::from(json_response)))
                            .await
                            .is_err()
                        {
                            break;
                        }

                        // If this is the final message, save it
                        if chat_response.done {
                            if !accumulated_content.is_empty() {
                                let content_json = serde_json::json!({
                                    "role": "assistant",
                                    "content": accumulated_content
                                });

                                if let Err(e) = ChatInteraction::save(
                                    chat_session_id.clone(),
                                    content_json.to_string(),
                                    &db,
                                )
                                .await
                                {
                                    eprintln!("Failed to save assistant message: {e}");
                                }

                                // Check if we need to generate a title
                                if let Ok(count) = ChatInteraction::count_chat_interactions(
                                    chat_session_id.clone(),
                                    &db,
                                )
                                .await
                                {
                                    if count == MIN_INTERACTIONS_FOR_TITLE_GENERATION {
                                        let service = Service {
                                            app_handle: app_handle.clone(),
                                            db: db.clone(),
                                            ollama_client: ollama_client.clone(),
                                        };
                                        let _ = service
                                            .generate_chat_title(chat_session_id.clone())
                                            .await;
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let error_json = serde_json::json!({
                            "error": e.to_string()
                        });
                        let _ = tx
                            .send(Ok(axum::body::Bytes::from(
                                serde_json::to_vec(&error_json).unwrap_or_default(),
                            )))
                            .await;
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
        match reqwest_builder.send().await {
            Ok(resp) => {
                let status = resp.status();
                let headers = resp.headers().clone();

                // Stream the response back
                let stream = resp.bytes_stream();
                let body_stream = stream.map(|result| {
                    result
                        .map(|bytes| axum::body::Bytes::from(bytes.to_vec()))
                        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
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
            Err(e) => Err(format!("Failed to proxy request: {e}")),
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
        Err(e) => (StatusCode::BAD_GATEWAY, e).into_response(),
    }
}

pub fn create_router(app_handle: AppHandle, db: DatabaseConnection) -> Router {
    Router::new()
        .fallback(proxy_handler)
        .with_state(Arc::new(Service::new(app_handle, db)))
}
