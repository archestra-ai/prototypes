mod proxy;
mod sse_stream;

use crate::gateway::websocket::Service as WebSocketService;
use crate::ollama::client::OllamaClient;
use axum::Router;
use sea_orm::DatabaseConnection;
use std::sync::Arc;

pub use proxy::Service;
pub use sse_stream::{handle_stream_options, stream_handler, SseStreamService};

pub fn create_router(db: DatabaseConnection, ws_service: Arc<WebSocketService>) -> Router {
    let db = Arc::new(db);
    let ollama_client = OllamaClient::new();

    // Create services
    let proxy_service = Arc::new(Service::new(
        Arc::clone(&db),
        ollama_client.clone(),
        Arc::clone(&ws_service),
    ));
    let sse_service = Arc::new(SseStreamService::new(
        Arc::clone(&db),
        ollama_client,
        Arc::clone(&ws_service),
    ));

    // Create SSE router with its own state
    let sse_router = Router::new()
        .route(
            "/stream",
            axum::routing::post(stream_handler).options(handle_stream_options),
        )
        .with_state(sse_service);

    // Create proxy router with its own state
    let proxy_router = Router::new()
        .fallback(proxy::proxy_handler)
        .with_state(proxy_service);

    // Merge the routers
    sse_router.merge(proxy_router)
}
