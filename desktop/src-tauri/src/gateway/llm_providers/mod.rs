use axum::routing::Router;
use sea_orm::DatabaseConnection;
use std::sync::Arc;

use crate::gateway::websocket::Service as WebSocketService;

pub mod ollama;

pub fn create_router(db: DatabaseConnection, ws_service: Arc<WebSocketService>) -> Router {
    Router::new().nest_service("/ollama", ollama::create_router(db, ws_service))
}
