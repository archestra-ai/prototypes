use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post},
    Router,
};
use sea_orm::DatabaseConnection;
use tauri_plugin_opener::OpenerExt;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

use crate::{
    models::mcp_server::{ConnectorCatalogEntry, Model as MCPServer},
    sandbox,
};

pub mod oauth;

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[schema(as = InstallMCPServerRequest)]
pub struct InstallRequest {
    mcp_server_catalog_id: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct OAuthStartParams {
    mcp_server_catalog_id: String,
    provider: String,
}

#[derive(Debug, Deserialize)]
pub struct OAuthProxyResponse {
    pub auth_url: String,
}

pub struct Service {
    app_handle: tauri::AppHandle,
    db: DatabaseConnection,
    mcp_server_sandbox_service: sandbox::MCPServerManager,
}

impl Service {
    pub fn new(
        app_handle: tauri::AppHandle,
        db: DatabaseConnection,
        mcp_server_sandbox_service: sandbox::MCPServerManager,
    ) -> Self {
        Self {
            app_handle,
            db,
            mcp_server_sandbox_service,
        }
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
        mcp_server_catalog_id: String,
    ) -> Result<(), String> {
        MCPServer::save_mcp_server_from_catalog(&self.db, mcp_server_catalog_id, &self.mcp_server_sandbox_service)
            .await
            .map_err(|e| format!("Failed to save server: {e}"))?;

        Ok(())
    }

    async fn uninstall_mcp_server(&self, mcp_server_name: String) -> Result<(), String> {
        MCPServer::uninstall_mcp_server(&self.db, &mcp_server_name, &self.mcp_server_sandbox_service)
            .await
            .map_err(|e| format!("Failed to uninstall server: {e}"))?;

        Ok(())
    }

    pub async fn start_oauth_auth(
        &self,
        provider: String,
        mcp_server_catalog_id: String,
    ) -> Result<(), String> {
        info!(
            "Starting OAuth auth flow for MCP server: {}",
            mcp_server_catalog_id
        );

        // TODO: once we've properly set-up different environment variable loading for different
        // environments, and once we have a "production" oauth-proxy server, uncomment this out
        // Get OAuth proxy base URL from environment - required
        // let oauth_proxy_base_url = match std::env::var("OAUTH_PROXY_BASE_URL") {
        //     Ok(url) => url,
        //     Err(_) => {
        //         error!("OAUTH_PROXY_BASE_URL environment variable must be set");
        //         return Err(format!("OAUTH_PROXY_BASE_URL environment variable must be set"));
        //     }
        // };
        let oauth_proxy_base_url = String::from("https://oauth.dev.archestra.ai");

        let auth_url = format!("{oauth_proxy_base_url}/v1/auth/{provider}?mcp_catalog_connector_id={mcp_server_catalog_id}", );
        debug!("OAuth proxy URL: {}", auth_url);

        // Call the cloud OAuth proxy service with dynamic "provider" parameter and including
        // the mcp catalog connector id in the query parameters
        let client = reqwest::Client::new();
        let response = client.get(&auth_url).send().await.map_err(|e| {
            error!("Failed to connect to OAuth proxy at {}: {}", auth_url, e);
            format!("Failed to connect to OAuth proxy: {e}")
        })?;

        let status = response.status();
        debug!("OAuth proxy response status: {}", status);

        if !status.is_success() {
            error!("OAuth proxy returned error status: {}", status);
            return Err(format!("OAuth proxy returned error status: {status}"));
        }

        let auth_data: OAuthProxyResponse = response.json().await.map_err(|e| {
            error!("Failed to parse OAuth proxy response: {}", e);
            format!("Failed to parse auth response: {e}")
        })?;

        info!("Received auth URL from OAuth proxy, opening browser");
        debug!("Auth URL: {}", auth_data.auth_url);

        self.app_handle
            .opener()
            .open_url(&auth_data.auth_url, None::<&str>)
            .map_err(|e| {
                error!("Failed to open browser for auth URL: {}", e);
                format!("Failed to open auth URL: {e}")
            })?;

        info!("Successfully opened browser for OAuth authentication");
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
        .install_mcp_server_from_catalog(payload.mcp_server_catalog_id)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    post,
    path = "/api/mcp_server/catalog/start_oauth_installation",
    tag = "mcp_server",
    params(
        ("mcp_server_catalog_id" = String, Query, description = "ID of the MCP server from catalog"),
        ("provider" = String, Query, description = "OAuth provider of the MCP server")
    ),
    responses(
        (status = 200, description = "OAuth authorization URL"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn start_mcp_server_oauth(
    State(service): State<Arc<Service>>,
    Query(params): Query<OAuthStartParams>,
) -> Result<String, StatusCode> {
    service
        .start_oauth_auth(
            params.provider.clone(),
            params.mcp_server_catalog_id.clone(),
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(format!(
        "OAuth flow started for {} with provider {}",
        params.mcp_server_catalog_id, params.provider
    ))
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

pub fn create_router(
    app_handle: tauri::AppHandle,
    db: DatabaseConnection,
    mcp_server_sandbox_service: sandbox::MCPServerManager,
) -> Router {
    let service = Arc::new(Service::new(
        app_handle,
        db,
        mcp_server_sandbox_service,
    ));

    Router::new()
        .route("/", get(get_installed_mcp_servers))
        .route("/catalog", get(get_mcp_connector_catalog))
        .route("/catalog/install", post(install_mcp_server_from_catalog))
        .route(
            "/catalog/start_oauth_installation",
            post(start_mcp_server_oauth),
        )
        .route("/{mcp_server_name}", delete(uninstall_mcp_server))
        .with_state(service)
}
