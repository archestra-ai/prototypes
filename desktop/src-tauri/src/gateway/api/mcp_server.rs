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

use crate::models::mcp_server::{oauth::AuthResponse, ConnectorCatalogEntry, Model as MCPServer};

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[schema(as = InstallMCPServerRequest)]
pub struct InstallRequest {
    mcp_connector_id: String,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[schema(as = StartMCPServerOAuthRequest)]
pub struct StartOAuthRequest {
    mcp_connector_id: String,
}

pub struct Service {
    db: Arc<DatabaseConnection>,
}

impl Service {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db: Arc::new(db) }
    }

    async fn get_installed_mcp_servers(&self) -> Result<Vec<MCPServer>, String> {
        MCPServer::load_installed_mcp_servers(&self.db)
            .await
            .map_err(|e| format!("Failed to load installed MCP servers: {e}"))
    }

    async fn get_mcp_connector_catalog(&self) -> Result<Vec<ConnectorCatalogEntry>, String> {
        MCPServer::get_mcp_connector_catalog()
            .await
            .map_err(|e| format!("Failed to get MCP connector catalog: {e}"))
    }

    async fn install_mcp_server_from_catalog(
        &self,
        mcp_connector_id: String,
    ) -> Result<(), String> {
        MCPServer::save_mcp_server_from_catalog(&self.db, mcp_connector_id)
            .await
            .map_err(|e| format!("Failed to save server: {e}"))?;

        Ok(())
    }

    async fn uninstall_mcp_server(&self, mcp_server_name: String) -> Result<(), String> {
        MCPServer::uninstall_mcp_server(&self.db, &mcp_server_name)
            .await
            .map_err(|e| format!("Failed to uninstall server: {e}"))?;

        Ok(())
    }
}

#[utoipa::path(
    get,
    path = "/api/mcp_server",
    tag = "mcp_server",
    responses(
        (status = 200, description = "List of installed MCP servers", body = Vec<MCPServer>),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_installed_mcp_servers(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<MCPServer>>, StatusCode> {
    service
        .get_installed_mcp_servers()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    get,
    path = "/api/mcp_server/catalog",
    tag = "mcp_server",
    responses(
        (status = 200, description = "MCP connector catalog", body = Vec<ConnectorCatalogEntry>),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_mcp_connector_catalog(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<ConnectorCatalogEntry>>, StatusCode> {
    service
        .get_mcp_connector_catalog()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    post,
    path = "/api/mcp_server/catalog/install",
    tag = "mcp_server",
    request_body = InstallRequest,
    responses(
        (status = 200, description = "MCP server installed successfully"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn install_mcp_server_from_catalog(
    State(service): State<Arc<Service>>,
    Json(payload): Json<InstallRequest>,
) -> Result<StatusCode, StatusCode> {
    service
        .install_mcp_server_from_catalog(payload.mcp_connector_id)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    post,
    path = "/api/mcp_server/start_oauth",
    tag = "mcp_server",
    request_body = StartOAuthRequest,
    responses(
        (status = 200, description = "OAuth authorization URL", body = AuthResponse),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn start_mcp_server_oauth(
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

#[utoipa::path(
    delete,
    path = "/api/mcp_server/{mcp_server_name}",
    tag = "mcp_server",
    params(
        ("mcp_server_name" = String, Path, description = "Name of the MCP server to uninstall")
    ),
    responses(
        (status = 200, description = "MCP server uninstalled successfully"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn uninstall_mcp_server(
    State(service): State<Arc<Service>>,
    Path(mcp_server_name): Path<String>,
) -> Result<StatusCode, StatusCode> {
    service
        .uninstall_mcp_server(mcp_server_name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn create_router(db: DatabaseConnection) -> Router {
    let service = Arc::new(Service::new(db));

    Router::new()
        .route("/", get(get_installed_mcp_servers))
        .route("/catalog", get(get_mcp_connector_catalog))
        .route("/catalog/install", post(install_mcp_server_from_catalog))
        .route("/start_oauth", post(start_mcp_server_oauth))
        .route("/:mcp_server_name", delete(uninstall_mcp_server))
        .with_state(service)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_fixtures::database;
    use rstest::*;

    #[fixture]
    async fn service_and_db(
        #[future] database: DatabaseConnection,
    ) -> (Service, DatabaseConnection) {
        let db = database.await;
        let service = Service::new(db.clone());
        (service, db)
    }
}
