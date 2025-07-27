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

async fn websocket_handler(ws: WebSocketUpgrade, State(service): State<Arc<Service>>) -> impl IntoResponse {
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
