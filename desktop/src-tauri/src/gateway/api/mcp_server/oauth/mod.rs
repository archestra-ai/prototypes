use sea_orm::DatabaseConnection;
use std::path::PathBuf;
use url::Url;

use crate::gateway::websocket::Service as WebSocketService;
use crate::sandbox;

pub mod providers;
pub mod utils;
pub mod websocket;

/// Handle OAuth callback URLs from deep links
pub async fn handle_oauth_callback(
    app_data_dir: &PathBuf,
    db: DatabaseConnection,
    websocket_service: WebSocketService,
    mcp_server_sandbox_service: sandbox::MCPServerManager,
    url: String,
) {
    debug!("Received OAuth callback: {url}");

    let parsed_url = match Url::parse(&url) {
        Ok(url) => url,
        Err(e) => {
            let error_message = format!("Invalid OAuth callback URL: {e}");
            error!("{error_message}");
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

    // Get the mcp catalog connector id from the query parameters
    let mcp_server_catalog_id = query_params
        .get("mcp_catalog_connector_id")
        .unwrap_or(&"unknown".to_string())
        .clone();

    debug!(
        "OAuth callback for mcp catalog connector id: {}",
        mcp_server_catalog_id
    );
    debug!("Query parameters: {:?}", query_params);

    // Check for error parameter
    if let Some(error) = query_params.get("error") {
        let error_message = format!("OAuth error for {mcp_server_catalog_id}: {error}");
        error!("{error_message}");
        let _ =
            websocket::emit_oauth_error(websocket_service, mcp_server_catalog_id, error_message)
                .await;
        return;
    }

    // Route to provider-specific handler
    match mcp_server_catalog_id.parse::<providers::SupportedMCPCatalogConnectorId>() {
        Ok(mcp_catalog_connector_id) if mcp_catalog_connector_id.is_google_connector() => {
            match providers::google::handle_google_oauth_callback(
                app_data_dir,
                db,
                mcp_server_sandbox_service,
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
            let error_message = format!("Unsupported OAuth provider: {mcp_server_catalog_id}");
            error!("{error_message}");
            let _ = websocket::emit_oauth_error(
                websocket_service,
                mcp_server_catalog_id,
                error_message,
            )
            .await;
        }
    }
}
