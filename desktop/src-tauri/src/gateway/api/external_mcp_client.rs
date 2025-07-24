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
use utoipa::ToSchema;

use crate::models::external_mcp_client::Model as ExternalMCPClient;

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[schema(as = ConnectExternalMCPClientRequest)]
pub struct ConnectRequest {
    pub client_name: String,
}

pub struct Service {
    db: Arc<DatabaseConnection>,
}

impl Service {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db: Arc::new(db) }
    }

    async fn get_connected_external_mcp_clients(&self) -> Result<Vec<ExternalMCPClient>, String> {
        ExternalMCPClient::get_connected_external_mcp_clients(&self.db)
            .await
            .map_err(|e| format!("Failed to get connected external MCP clients: {e}"))
    }

    async fn get_supported_external_mcp_clients(&self) -> Result<Vec<String>, String> {
        Ok(ExternalMCPClient::SUPPORTED_CLIENT_NAMES
            .into_iter()
            .map(|s| s.to_string())
            .collect())
    }

    async fn connect_external_mcp_client(&self, client_name: String) -> Result<(), String> {
        ExternalMCPClient::connect_external_mcp_client(&self.db, &client_name).await
    }

    async fn disconnect_external_mcp_client(&self, client_name: String) -> Result<(), String> {
        ExternalMCPClient::disconnect_external_mcp_client(&self.db, &client_name).await
    }
}

#[utoipa::path(
    get,
    path = "/api/external_mcp_client",
    tag = "external_mcp_client",
    responses(
        (status = 200, description = "List of connected external MCP clients", body = Vec<ExternalMCPClient>),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_connected_external_mcp_clients(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<ExternalMCPClient>>, StatusCode> {
    service
        .get_connected_external_mcp_clients()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    get,
    path = "/api/external_mcp_client/supported",
    tag = "external_mcp_client",
    responses(
        (status = 200, description = "List of supported external MCP client names", body = Vec<String>),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_supported_external_mcp_clients(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<String>>, StatusCode> {
    service
        .get_supported_external_mcp_clients()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    post,
    path = "/api/external_mcp_client/connect",
    tag = "external_mcp_client",
    request_body = ConnectRequest,
    responses(
        (status = 200, description = "External MCP client connected successfully"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn connect_external_mcp_client(
    State(service): State<Arc<Service>>,
    Json(payload): Json<ConnectRequest>,
) -> Result<StatusCode, StatusCode> {
    service
        .connect_external_mcp_client(payload.client_name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    delete,
    path = "/api/external_mcp_client/{client_name}/disconnect",
    tag = "external_mcp_client",
    params(
        ("client_name" = String, Path, description = "Name of the external MCP client to disconnect")
    ),
    responses(
        (status = 200, description = "External MCP client disconnected successfully"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn disconnect_external_mcp_client(
    State(service): State<Arc<Service>>,
    Path(client_name): Path<String>,
) -> Result<StatusCode, StatusCode> {
    service
        .disconnect_external_mcp_client(client_name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn create_router(db: DatabaseConnection) -> Router {
    let service = Arc::new(Service::new(db));

    Router::new()
        .route("/", get(get_connected_external_mcp_clients))
        .route("/supported", get(get_supported_external_mcp_clients))
        .route("/connect", post(connect_external_mcp_client))
        .route(
            "/{client_name}/disconnect",
            delete(disconnect_external_mcp_client),
        )
        .with_state(service)
}
