use axum::{
    debug_handler,
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post},
    Router,
};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::models::mcp_server::{
    oauth::AuthResponse, ConnectorCatalogEntry, Model as MCPServer,
};

#[derive(Debug, Serialize, Deserialize)]
struct InstallRequest {
    mcp_connector_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct StartOAuthRequest {
    mcp_connector_id: String,
}

struct Service {
    db: Arc<DatabaseConnection>,
}

impl Service {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db: Arc::new(db) }
    }

    async fn get_all(&self) -> Result<Vec<MCPServer>, String> {
        MCPServer::load_installed_mcp_servers(&self.db)
            .await
            .map_err(|e| format!("Failed to load installed MCP servers: {e}"))
    }

    async fn get_catalog(&self) -> Result<Vec<ConnectorCatalogEntry>, String> {
        MCPServer::get_mcp_connector_catalog()
            .await
            .map_err(|e| format!("Failed to get MCP connector catalog: {e}"))
    }

    async fn install_from_catalog(&self, mcp_connector_id: String) -> Result<(), String> {
        MCPServer::save_mcp_server_from_catalog(&self.db, mcp_connector_id)
            .await
            .map_err(|e| format!("Failed to save server: {e}"))?;

        Ok(())
    }

    async fn uninstall(&self, mcp_server_name: String) -> Result<(), String> {
        MCPServer::uninstall_mcp_server(&self.db, &mcp_server_name)
            .await
            .map_err(|e| format!("Failed to uninstall server: {e}"))?;

        Ok(())
    }
}

#[axum::debug_handler]
async fn get_all_handler(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<MCPServer>>, StatusCode> {
    service
        .get_all()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn get_catalog_handler(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<ConnectorCatalogEntry>>, StatusCode> {
    service
        .get_catalog()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn install_from_catalog_handler(
    State(service): State<Arc<Service>>,
    Json(payload): Json<InstallRequest>,
) -> Result<StatusCode, StatusCode> {
    service
        .install_from_catalog(payload.mcp_connector_id)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn start_oauth_handler(
    State(_service): State<Arc<Service>>,
    Json(payload): Json<StartOAuthRequest>,
) -> Result<Json<AuthResponse>, StatusCode> {
    // TODO: finish setting this up with models::mcp_server::oauth::start_oauth_auth
    // need to get the cloud run service's static URL and plug that in here
    let auth_response = AuthResponse {
        auth_url: format!(
            "https://oauth-proxy.archestra.ai/auth/{}",
            payload.mcp_connector_id
        ),
    };
    Ok(Json(auth_response))
}

async fn uninstall_handler(
    State(service): State<Arc<Service>>,
    Path(mcp_server_name): Path<String>,
) -> Result<StatusCode, StatusCode> {
    service
        .uninstall(mcp_server_name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn create_router(db: DatabaseConnection) -> Router {
    let service = Arc::new(Service::new(db));

    Router::new()
        .route("/", get(get_all_handler))
        .route("/catalog", get(get_catalog_handler))
        .route("/catalog/install", post(install_from_catalog_handler))
        .route("/start_oauth", post(start_oauth_handler))
        .route("/:mcp_server_name", delete(uninstall_handler))
        .with_state(service)
}
