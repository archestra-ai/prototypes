use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post},
    Router,
};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::models::external_mcp_client::Model as ExternalMCPClient;

#[derive(Debug, Serialize, Deserialize)]
struct ConnectRequest {
    client_name: String,
}

struct Service {
    db: Arc<DatabaseConnection>,
}

impl Service {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db: Arc::new(db) }
    }

    async fn get_all(&self) -> Result<Vec<ExternalMCPClient>, String> {
        ExternalMCPClient::get_connected_external_mcp_clients(&self.db)
            .await
            .map_err(|e| format!("Failed to get connected external MCP clients: {e}"))
    }

    async fn get_supported(&self) -> Result<Vec<String>, String> {
        Ok(ExternalMCPClient::SUPPORTED_CLIENT_NAMES
            .into_iter()
            .map(|s| s.to_string())
            .collect())
    }

    async fn connect(&self, client_name: String) -> Result<(), String> {
        ExternalMCPClient::connect_external_mcp_client(&self.db, &client_name).await
    }

    async fn disconnect(&self, client_name: String) -> Result<(), String> {
        ExternalMCPClient::disconnect_external_mcp_client(&self.db, &client_name).await
    }
}

async fn get_all_handler(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<ExternalMCPClient>>, StatusCode> {
    service
        .get_all()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn get_supported_handler(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<String>>, StatusCode> {
    service
        .get_supported()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn connect_handler(
    State(service): State<Arc<Service>>,
    Json(payload): Json<ConnectRequest>,
) -> Result<StatusCode, StatusCode> {
    service
        .connect(payload.client_name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn disconnect_handler(
    State(service): State<Arc<Service>>,
    Path(client_name): Path<String>,
) -> Result<StatusCode, StatusCode> {
    service
        .disconnect(client_name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn create_router(db: DatabaseConnection) -> Router {
    let service = Arc::new(Service::new(db));

    Router::new()
        .route("/", get(get_all_handler))
        .route("/supported", get(get_supported_handler))
        .route("/connect", post(connect_handler))
        .route("/:client_name/disconnect", delete(disconnect_handler))
        .with_state(service)
}
