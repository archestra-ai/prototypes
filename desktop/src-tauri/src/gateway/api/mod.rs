use axum::Router;
use std::sync::Arc;

use crate::sandbox;
use sea_orm::DatabaseConnection;

pub mod chat;
pub mod external_mcp_client;
pub mod mcp_request_log;
pub mod mcp_server;

pub fn create_router(
    open_oauth_auth_url_fn: fn(&str, Option<&str>) -> Result<(), String>,
    db: Arc<DatabaseConnection>,
    mcp_server_sandbox_service: Arc<sandbox::MCPServerManager>,
) -> Router {
    Router::new()
        .nest(
            "/external_mcp_client",
            external_mcp_client::create_router(db.clone()),
        )
        .nest(
            "/mcp_request_log",
            mcp_request_log::create_router(db.clone()),
        )
        .nest(
            "/mcp_server",
            mcp_server::create_router(
                open_oauth_auth_url_fn,
                db.clone(),
                mcp_server_sandbox_service.clone(),
            ),
        )
        .nest("/chat", chat::create_router(db))
}
