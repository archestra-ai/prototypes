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

// Standalone function for converting requests - testable without AppHandle
fn convert_archestra_proxied_chat_request_to_ollama_chat_message(
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

    let stream = archestra_request.ollama_fields["stream"]
        .as_bool()
        .unwrap_or(false);

    let messages = archestra_request.ollama_fields["messages"]
        .as_array()
        .ok_or_else(|| "Messages must be an array".to_string())?;

    let mut chat_messages = Vec::with_capacity(messages.len());
    for msg in messages {
        let role_str = msg["role"]
            .as_str()
            .ok_or_else(|| "Message missing role".to_string())?;
        let role = match role_str {
            "system" => MessageRole::System,
            "user" => MessageRole::User,
            "assistant" => MessageRole::Assistant,
            "tool" => MessageRole::Tool,
            _ => return Err(format!("Unknown message role: {role_str}")),
        };

        let content = msg["content"]
            .as_str()
            .ok_or_else(|| "Message missing content".to_string())?
            .to_string();

        // Handle tool calls if present
        let tool_calls = if let Some(tool_calls_value) = msg.get("tool_calls") {
            let tool_calls_array = tool_calls_value
                .as_array()
                .ok_or_else(|| "tool_calls must be an array".to_string())?;

            let mut parsed_tool_calls = Vec::with_capacity(tool_calls_array.len());
            for tc in tool_calls_array {
                let function = tc
                    .get("function")
                    .ok_or_else(|| "Tool call missing function".to_string())?;

                let tool_call = ToolCall {
                    function: ToolCallFunction {
                        name: function["name"]
                            .as_str()
                            .ok_or_else(|| "Function missing name".to_string())?
                            .to_string(),
                        arguments: function
                            .get("arguments")
                            .ok_or_else(|| "Function missing arguments".to_string())?
                            .clone(),
                    },
                };
                parsed_tool_calls.push(tool_call);
            }
            Some(parsed_tool_calls)
        } else {
            None
        };

        // Handle images if present (only for user messages)
        let images = if role == MessageRole::User {
            if let Some(images_value) = msg.get("images") {
                let images_array = images_value
                    .as_array()
                    .ok_or_else(|| "images must be an array".to_string())?;

                let mut parsed_images = Vec::with_capacity(images_array.len());
                for img in images_array {
                    let image_str = img
                        .as_str()
                        .ok_or_else(|| "Image must be a string".to_string())?;
                    parsed_images.push(Image::from_base64(image_str));
                }
                Some(parsed_images)
            } else {
                None
            }
        } else {
            None
        };

        chat_messages.push(ChatMessage {
            role,
            content,
            images,
            tool_calls,
        });
    }

    let ollama_request = ChatMessageRequest {
        model: model_name,
        messages: chat_messages,
        stream,
        ..Default::default()
    };

    Ok((ollama_request, archestra_request.session_id))
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

    async fn proxy_chat_request(&self, req: Request<Body>) -> Result<Response<Body>, String> {
        let (headers, body_bytes) = self.extract_request_parts(req).await?;
        let (ollama_request, session_id) =
            convert_archestra_proxied_chat_request_to_ollama_chat_message(body_bytes)?;

        // Check if this is a streaming request
        if ollama_request.stream {
            self.handle_streaming_chat(ollama_request, session_id).await
        } else {
            self.handle_non_streaming_chat(ollama_request, session_id, headers)
                .await
        }
    }

    async fn proxy_other_request(
        &self,
        method: axum::http::Method,
        path: &str,
        req: Request<Body>,
    ) -> Result<Response<Body>, String> {
        let (headers, body_bytes) = self.extract_request_parts(req).await?;
        self.ollama_client
            .proxy_request(method, path, headers, body_bytes)
            .await
    }

    async fn extract_request_parts(
        &self,
        req: Request<Body>,
    ) -> Result<(axum::http::HeaderMap, Bytes), String> {
        let headers = req.headers().clone();
        let body_bytes = axum::body::to_bytes(req.into_body(), usize::MAX)
            .await
            .map_err(|e| format!("Failed to read request body: {e}"))?;
        Ok((headers, body_bytes))
    }

    async fn handle_streaming_chat(
        &self,
        mut ollama_request: ChatMessageRequest,
        session_id: String,
    ) -> Result<Response<Body>, String> {
        // Make a copy of session_id for use after ollama_request is moved
        let session_id_for_title = session_id.clone();

        // Set stream to false temporarily to get the full response
        ollama_request.stream = false;

        let response = self
            .ollama_client
            .chat(ollama_request)
            .await
            .map_err(|e| format!("Ollama request failed: {e}"))?;

        let assistant_message = response
            .message
            .ok_or_else(|| "No message in Ollama response".to_string())?;

        // Save the chat interaction
        let chat_interaction = self
            .save_chat_interaction(&session_id, &assistant_message)
            .await?;

        // Emit the full assistant message
        let _ = self.app_handle.emit(
            "chat_interaction",
            serde_json::to_value(&chat_interaction)
                .map_err(|e| format!("Failed to serialize chat interaction: {e}"))?,
        );

        // Check if we should generate a title
        self.maybe_generate_title(&session_id_for_title).await;

        // Create a channel for streaming
        let (tx, rx) = mpsc::channel(10);

        // Spawn a task to send the response
        tokio::spawn(async move {
            let _ = tx
                .send(Ok(Bytes::from(
                    serde_json::to_vec(&response).unwrap_or_default(),
                )))
                .await;
        });

        // Convert to stream
        let stream = ReceiverStream::new(rx);
        let body = Body::from_stream(stream);

        Ok(Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "application/json")
            .body(body)
            .unwrap())
    }

    async fn handle_non_streaming_chat(
        &self,
        ollama_request: ChatMessageRequest,
        session_id: String,
        headers: axum::http::HeaderMap,
    ) -> Result<Response<Body>, String> {
        // Forward the request to Ollama
        let response = self
            .ollama_client
            .proxy_chat_request(ollama_request, headers)
            .await?;

        // Parse the response to extract the assistant message
        let response_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .map_err(|e| format!("Failed to read Ollama response: {e}"))?;

        let ollama_response: serde_json::Value = serde_json::from_slice(&response_bytes)
            .map_err(|e| format!("Failed to parse Ollama response: {e}"))?;

        // Extract the assistant message
        if let Some(message) = ollama_response.get("message") {
            let role = message
                .get("role")
                .and_then(|r| r.as_str())
                .unwrap_or("assistant");
            let content = message
                .get("content")
                .and_then(|c| c.as_str())
                .unwrap_or("");

            let chat_message = ChatMessage {
                role: match role {
                    "system" => MessageRole::System,
                    "user" => MessageRole::User,
                    "assistant" => MessageRole::Assistant,
                    "tool" => MessageRole::Tool,
                    _ => MessageRole::Assistant,
                },
                content: content.to_string(),
                images: None,
                tool_calls: None,
            };

            // Save the chat interaction
            let chat_interaction = self
                .save_chat_interaction(&session_id, &chat_message)
                .await?;

            // Emit the chat interaction
            let _ = self.app_handle.emit(
                "chat_interaction",
                serde_json::to_value(&chat_interaction)
                    .map_err(|e| format!("Failed to serialize chat interaction: {e}"))?,
            );

            // Check if we should generate a title
            self.maybe_generate_title(&session_id).await;
        }

        // Return the original response
        Ok(Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "application/json")
            .body(Body::from(response_bytes))
            .unwrap())
    }

    async fn save_chat_interaction(
        &self,
        session_id: &str,
        message: &ChatMessage,
    ) -> Result<ChatInteraction, String> {
        // Find or create the chat
        let chat = Chat::find_by_session_id(&*self.db, session_id)
            .await
            .map_err(|e| format!("Failed to find chat: {e}"))?
            .ok_or_else(|| format!("Chat not found for session_id: {session_id}"))?;

        // Create the chat interaction
        let chat_interaction = ChatActiveModel {
            chat_id: Set(chat.id),
            role: Set(message.role.to_string()),
            content: Set(serde_json::to_value(message)
                .map_err(|e| format!("Failed to serialize message: {e}"))?),
            ..Default::default()
        };

        let chat_interaction = chat_interaction
            .insert(&*self.db)
            .await
            .map_err(|e| format!("Failed to save chat interaction: {e}"))?;

        Ok(chat_interaction)
    }

    async fn maybe_generate_title(&self, session_id: &str) {
        // Find the chat
        let chat = match Chat::find_by_session_id(&*self.db, session_id).await {
            Ok(Some(chat)) => chat,
            Ok(None) => {
                eprintln!("Chat not found for session_id: {session_id}");
                return;
            }
            Err(e) => {
                eprintln!("Failed to find chat: {e}");
                return;
            }
        };

        // Check if we should generate a title
        if chat.title.is_some() {
            return; // Already has a title
        }

        // Count interactions
        let interaction_count = match chat.count_interactions(&*self.db).await {
            Ok(count) => count,
            Err(e) => {
                eprintln!("Failed to count interactions: {e}");
                return;
            }
        };

        if interaction_count < MIN_INTERACTIONS_FOR_TITLE_GENERATION {
            return; // Not enough interactions yet
        }

        // Get the first few interactions
        let interactions = match chat.get_first_interactions(&*self.db, 3).await {
            Ok(interactions) => interactions,
            Err(e) => {
                eprintln!("Failed to get interactions: {e}");
                return;
            }
        };

        // Build a prompt for title generation
        let mut prompt = String::from(
            "Based on this conversation, generate a short, descriptive title (max 50 chars):\n\n",
        );
        for interaction in interactions {
            if let Ok(message) = serde_json::from_value::<ChatMessage>(interaction.content) {
                prompt.push_str(&format!("{}: {}\n", message.role, message.content));
            }
        }
        prompt.push_str("\nTitle:");

        // Generate title using Ollama
        let title_request = ChatMessageRequest {
            model: "llama3.2".to_string(), // Use a specific model for title generation
            messages: vec![ChatMessage {
                role: MessageRole::User,
                content: prompt,
                images: None,
                tool_calls: None,
            }],
            stream: false,
            ..Default::default()
        };

        match self.ollama_client.chat(title_request).await {
            Ok(response) => {
                if let Some(message) = response.message {
                    let title = message.content.trim().to_string();
                    // Update the chat with the generated title
                    if let Err(e) = chat.update_title(&*self.db, title.clone()).await {
                        eprintln!("Failed to update chat title: {e}");
                    } else {
                        // Emit the title update event
                        let event = crate::types::ChatTitleUpdatedEvent {
                            chat_id: chat.id,
                            title,
                        };
                        let _ = self.app_handle.emit("chat_title_updated", event);
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to generate title: {e}");
            }
        }
    }
}

use crate::models::chat_interactions::ActiveModel as ChatActiveModel;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::chat::{ActiveModel as ChatActiveModel, ChatDefinition};
    use crate::test_fixtures::database;
    use rstest::rstest;
    use sea_orm::{ActiveModelTrait, Set};
    use serde_json::json;

    #[rstest]
    #[tokio::test]
    async fn test_convert_archestra_request_to_ollama_valid(
        #[future] database: DatabaseConnection,
    ) {
        let _db = database.await;

        let request_json = json!({
            "session_id": "test-session-123",
            "model": "llama3.2",
            "messages": [
                {
                    "role": "user",
                    "content": "Hello"
                },
                {
                    "role": "assistant",
                    "content": "Hi there!"
                }
            ],
            "stream": true
        });

        let bytes = Bytes::from(serde_json::to_vec(&request_json).unwrap());

        let result = convert_archestra_proxied_chat_request_to_ollama_chat_message(bytes);
        assert!(result.is_ok());

        let (ollama_request, session_id) = result.unwrap();
        assert_eq!(session_id, "test-session-123");
        assert_eq!(ollama_request.model, "llama3.2");
        assert_eq!(ollama_request.messages.len(), 2);
        assert!(ollama_request.stream);
    }

    #[rstest]
    #[tokio::test]
    async fn test_convert_archestra_request_missing_model(
        #[future] database: DatabaseConnection,
    ) {
        let _db = database.await;

        let request_json = json!({
            "session_id": "test-session-123",
            "messages": []
        });

        let bytes = Bytes::from(serde_json::to_vec(&request_json).unwrap());

        let result = convert_archestra_proxied_chat_request_to_ollama_chat_message(bytes);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing model"));
    }

    #[rstest]
    #[tokio::test]
    async fn test_title_generation_threshold(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create a chat
        let chat = ChatActiveModel {
            session_id: Set("test-session".to_string()),
            definition: Set(ChatDefinition::default()),
            ..Default::default()
        }
        .insert(&db)
        .await
        .unwrap();

        // Count should be 0 initially
        let count = chat.count_interactions(&db).await.unwrap();
        assert_eq!(count, 0);

        // Add interactions
        for i in 0..3 {
            let interaction = ChatActiveModel {
                chat_id: Set(chat.id),
                role: Set("user".to_string()),
                content: Set(json!({
                    "role": "user",
                    "content": format!("Message {}", i)
                })),
                ..Default::default()
            };
            interaction.insert(&db).await.unwrap();
        }

        // Count should be 3 now
        let count = chat.count_interactions(&db).await.unwrap();
        assert_eq!(count, 3);

        // Should not generate title yet (threshold is 4)
        assert!(count < MIN_INTERACTIONS_FOR_TITLE_GENERATION);
    }
}