pub mod providers;
pub mod utils;
pub mod websocket;

pub use providers::OAuthService;

use sea_orm::DatabaseConnection;
use std::sync::Arc;
use tracing::{debug, error};
use url::Url;

use crate::gateway::websocket::Service as WebSocketService;

/// Handle OAuth callback URLs from deep links
pub async fn handle_oauth_callback(
    app_handle: tauri::AppHandle,
    db: Arc<DatabaseConnection>,
    websocket_service: Arc<WebSocketService>,
    url: String,
) {
    debug!("Received OAuth callback: {url}");

    let parsed_url = match Url::parse(&url) {
        Ok(url) => url,
        Err(e) => {
            let error_message = format!("Invalid OAuth callback URL: {e}");
            error!(error_message);
            let _ = websocket::emit_oauth_error(
                websocket_service,
                "unknown".to_string(),
                error_message,
            )
            .await;
            return;
        }
    };

    let query_params: std::collections::HashMap<String, String> = parsed_url
        .query_pairs()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();

    // Get the service from the query parameters
    let mcp_server_catalog_id = query_params
        .get("service")
        .unwrap_or(&"unknown".to_string())
        .clone();

    // Check for error parameter
    if let Some(error) = query_params.get("error") {
        let error_message = format!("OAuth error for {mcp_server_catalog_id}: {error}");
        error!(error_message);
        let _ =
            websocket::emit_oauth_error(websocket_service, mcp_server_catalog_id, error_message)
                .await;
        return;
    }

    // Route to service-specific handler
    match mcp_server_catalog_id.parse::<OAuthService>() {
        Ok(service) if service.is_google_service() => {
            match providers::google::handle_google_oauth_callback(
                app_handle,
                db.as_ref().clone(),
                url,
            )
            .await
            {
                Ok(()) => {
                    debug!("OAuth success for {mcp_server_catalog_id}");
                    let _ = websocket::emit_oauth_success(websocket_service, mcp_server_catalog_id)
                        .await;
                }
                Err(e) => {
                    error!("OAuth error for {mcp_server_catalog_id}: {e}");
                    let _ =
                        websocket::emit_oauth_error(websocket_service, mcp_server_catalog_id, e)
                            .await;
                }
            }
        }
        _ => {
            let error_message = format!("Unsupported OAuth service: {mcp_server_catalog_id}");
            error!(error_message);
            let _ = websocket::emit_oauth_error(
                websocket_service,
                mcp_server_catalog_id,
                error_message,
            )
            .await;
        }
    }
}
