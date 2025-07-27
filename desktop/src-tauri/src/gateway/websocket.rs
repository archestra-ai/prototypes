use axum::{
    extract::{ws::WebSocket, State, WebSocketUpgrade},
    response::IntoResponse,
    Router,
};
use futures_util::{stream::SplitSink, SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tracing::{debug, error, info};
use utoipa::ToSchema;

// Payload types
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ChatTitleUpdatedWebSocketPayload {
    pub chat_id: i32,
    pub title: String,
}

// Enum for all possible WebSocket messages
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "type", content = "payload")]
pub enum WebSocketMessage {
    #[serde(rename = "chat-title-updated")]
    ChatTitleUpdated(ChatTitleUpdatedWebSocketPayload),
}

type Clients = Arc<Mutex<Vec<SplitSink<WebSocket, axum::extract::ws::Message>>>>;

#[derive(Clone)]
pub struct Service {
    pub broadcast_tx: broadcast::Sender<WebSocketMessage>,
    clients: Clients,
}

impl Default for Service {
    fn default() -> Self {
        Self::new()
    }
}

impl Service {
    pub fn new() -> Self {
        let (broadcast_tx, _) = broadcast::channel(100);
        Self {
            broadcast_tx,
            clients: Arc::new(Mutex::new(Vec::new())),
        }
    }

    async fn remove_client(&self, index: usize) {
        let _ = self.clients.lock().await.remove(index);
    }

    pub async fn broadcast(&self, message: WebSocketMessage) {
        let msg_str = match serde_json::to_string(&message) {
            Ok(s) => s,
            Err(e) => {
                error!("Failed to serialize WebSocket message: {}", e);
                return;
            }
        };

        let mut clients = self.clients.lock().await;
        let mut indices_to_remove = Vec::new();

        for (i, client) in clients.iter_mut().enumerate() {
            if let Err(e) = client
                .send(axum::extract::ws::Message::Text(msg_str.clone().into()))
                .await
            {
                debug!("Failed to send to client {}: {}", i, e);
                indices_to_remove.push(i);
            }
        }

        // Remove disconnected clients
        for &i in indices_to_remove.iter().rev() {
            let _ = clients.remove(i);
        }
    }
}

async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(service): State<Arc<Service>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, service))
}

async fn handle_socket(socket: WebSocket, service: Arc<Service>) {
    let (sender, mut receiver) = socket.split();
    let client_index = {
        let mut clients = service.clients.lock().await;
        let index = clients.len();
        clients.push(sender);
        index
    };

    info!("New WebSocket client connected: {}", client_index);

    // Subscribe to broadcast channel
    let mut broadcast_rx = service.broadcast_tx.subscribe();

    // Spawn task to handle broadcast messages
    let service_clone = service.clone();
    let broadcast_task = tokio::spawn(async move {
        while let Ok(message) = broadcast_rx.recv().await {
            let msg_str = match serde_json::to_string(&message) {
                Ok(s) => s,
                Err(e) => {
                    error!("Failed to serialize broadcast message: {}", e);
                    continue;
                }
            };

            let mut clients = service_clone.clients.lock().await;
            if client_index < clients.len() {
                if let Err(e) = clients[client_index]
                    .send(axum::extract::ws::Message::Text(msg_str.into()))
                    .await
                {
                    debug!("Failed to send broadcast to client {}: {}", client_index, e);
                    break;
                }
            }
        }
    });

    // Handle incoming messages (for future use)
    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(axum::extract::ws::Message::Text(text)) => {
                debug!("Received text message: {}", text);
                // Handle incoming messages if needed in the future
            }
            Ok(axum::extract::ws::Message::Close(_)) => {
                info!("Client {} disconnected", client_index);
                break;
            }
            Err(e) => {
                error!("WebSocket error for client {}: {}", client_index, e);
                break;
            }
            _ => {}
        }
    }

    // Clean up
    broadcast_task.abort();
    service.remove_client(client_index).await;
    info!("Client {} removed", client_index);
}

pub fn create_router(service: Arc<Service>) -> Router {
    Router::new()
        .route("/", axum::routing::get(websocket_handler))
        .with_state(service)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_websocket_message_serialization() {
        // Test ChatTitleUpdated message
        let msg = WebSocketMessage::ChatTitleUpdated(ChatTitleUpdatedWebSocketPayload {
            chat_id: 123,
            title: "Test Chat".to_string(),
        });

        let serialized = serde_json::to_string(&msg).unwrap();
        let expected = json!({
            "type": "chat-title-updated",
            "payload": {
                "chat_id": 123,
                "title": "Test Chat"
            }
        });

        assert_eq!(serialized, expected.to_string());
    }

    #[tokio::test]
    async fn test_websocket_message_deserialization() {
        let json_str = r#"{
            "type": "chat-title-updated",
            "payload": {
                "chat_id": 456,
                "title": "Another Chat"
            }
        }"#;

        let msg: WebSocketMessage = serde_json::from_str(json_str).unwrap();

        match msg {
            WebSocketMessage::ChatTitleUpdated(payload) => {
                assert_eq!(payload.chat_id, 456);
                assert_eq!(payload.title, "Another Chat");
            }
        }
    }

    #[tokio::test]
    async fn test_broadcast_with_no_clients() {
        let service = Service::new();

        // Broadcasting with no clients should not panic
        let msg = WebSocketMessage::ChatTitleUpdated(ChatTitleUpdatedWebSocketPayload {
            chat_id: 1,
            title: "Test".to_string(),
        });

        service.broadcast(msg).await;

        // Verify no clients are connected
        assert_eq!(service.clients.lock().await.len(), 0);
    }

    #[tokio::test]
    async fn test_broadcast_with_mock_client() {
        let service = Service::new();

        // We can't easily mock WebSocket connections without the actual WebSocket type
        // This test demonstrates the limitation of the current design
        // In production code, we'd want to use a trait for better testability

        // Test that broadcast doesn't panic with no clients
        let msg = WebSocketMessage::ChatTitleUpdated(ChatTitleUpdatedWebSocketPayload {
            chat_id: 99,
            title: "Mock Test".to_string(),
        });

        service.broadcast(msg).await;
    }

    #[tokio::test]
    async fn test_broadcast_channel_capacity() {
        let service = Service::new();

        // The broadcast channel should have capacity of 100
        let _rx1 = service.broadcast_tx.subscribe();
        let _rx2 = service.broadcast_tx.subscribe();

        // Send many messages
        for i in 0..50 {
            let msg = WebSocketMessage::ChatTitleUpdated(ChatTitleUpdatedWebSocketPayload {
                chat_id: i,
                title: format!("Chat {i}"),
            });
            let _ = service.broadcast_tx.send(msg);
        }

        // Receivers should be able to receive messages
        // (though they might lag if processing is slow)
    }

    #[tokio::test]
    async fn test_chat_title_updated_payload() {
        let payload = ChatTitleUpdatedWebSocketPayload {
            chat_id: 999,
            title: "Long Chat Title That Should Be Preserved".to_string(),
        };

        // Test cloning
        let cloned = payload.clone();
        assert_eq!(cloned.chat_id, 999);
        assert_eq!(cloned.title, "Long Chat Title That Should Be Preserved");

        // Test debug formatting
        let debug_str = format!("{payload:?}");
        assert!(debug_str.contains("999"));
        assert!(debug_str.contains("Long Chat Title"));
    }

    #[tokio::test]
    async fn test_create_router() {
        let service = Arc::new(Service::new());
        let _router = create_router(service.clone());

        // Router should be created successfully
        // We can't easily test the routes without running a server
        // but we can verify the router is created

        // Verify the service is still valid after router creation
        assert!(Arc::strong_count(&service) >= 2); // Original + router state
    }

    #[tokio::test]
    async fn test_concurrent_broadcast() {
        let service = Arc::new(Service::new());

        // Spawn multiple tasks that broadcast simultaneously
        let mut handles = vec![];

        for i in 0..10 {
            let service_clone = service.clone();
            let handle = tokio::spawn(async move {
                let msg = WebSocketMessage::ChatTitleUpdated(ChatTitleUpdatedWebSocketPayload {
                    chat_id: i,
                    title: format!("Concurrent {i}"),
                });
                service_clone.broadcast(msg).await;
            });
            handles.push(handle);
        }

        // Wait for all broadcasts to complete
        for handle in handles {
            handle.await.unwrap();
        }

        // All broadcasts should complete without panicking
    }

    #[tokio::test]
    async fn test_json_serialization_edge_cases() {
        // Test with empty title
        let msg = WebSocketMessage::ChatTitleUpdated(ChatTitleUpdatedWebSocketPayload {
            chat_id: 0,
            title: "".to_string(),
        });

        let serialized = serde_json::to_string(&msg).unwrap();
        assert!(serialized.contains(r#""title":"""#));

        // Test with special characters in title
        let msg = WebSocketMessage::ChatTitleUpdated(ChatTitleUpdatedWebSocketPayload {
            chat_id: -1,
            title: "Title with \"quotes\" and \nnewlines".to_string(),
        });

        let serialized = serde_json::to_string(&msg).unwrap();
        let deserialized: WebSocketMessage = serde_json::from_str(&serialized).unwrap();

        match deserialized {
            WebSocketMessage::ChatTitleUpdated(payload) => {
                assert_eq!(payload.title, "Title with \"quotes\" and \nnewlines");
            }
        }
    }
}
