use crate::database::connection::get_database_connection_with_app;
use crate::models::mcp_server::{MCPServerDefinition, Model as MCPServerModel, ServerConfig};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tracing::{debug, error};
use url::Url;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GmailTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expiry_date: Option<u64>,
}

pub async fn handle_gmail_oauth_callback(app: tauri::AppHandle, url: String) {
    debug!("Received Gmail OAuth callback: {url}");

    if let Ok(parsed_url) = Url::parse(&url) {
        let query_params: std::collections::HashMap<String, String> = parsed_url
            .query_pairs()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();

        if let (Some(access_token), Some(refresh_token)) = (
            query_params.get("access_token"),
            query_params.get("refresh_token"),
        ) {
            let tokens = GmailTokens {
                access_token: access_token.clone(),
                refresh_token: refresh_token.clone(),
                expiry_date: query_params
                    .get("expiry_date")
                    .and_then(|d| d.parse::<u64>().ok()),
            };

            // Save MCP server with tokens in meta field
            let server_config = ServerConfig {
                transport: "stdio".to_string(),
                command: "npx".to_string(),
                args: vec![
                    "@gongrzhe/server-gmail-autoauth-mcp".to_string(),
                    format!("--access-token={}", tokens.access_token),
                    format!("--refresh-token={}", tokens.refresh_token),
                ],
                env: std::collections::HashMap::new(),
            };

            let meta = serde_json::json!({
                "tokens": tokens
            });

            let definition = MCPServerDefinition {
                name: "Gmail".to_string(),
                server_config,
                meta: meta,
            };

            // Save to database (this will also start the server)
            match get_database_connection_with_app(&app).await {
                Ok(db) => {
                    if let Err(e) = MCPServerModel::save_server(&db, &definition).await {
                        error!("Failed to save Gmail MCP server: {e}");
                        let _ = app.emit("oauth-error", format!("Failed to save server: {e}"));
                        return;
                    }
                }
                Err(e) => {
                    error!("Failed to get database connection: {e}");
                    let _ = app.emit("oauth-error", format!("Database error: {e}"));
                    return;
                }
            }

            // Emit success event to frontend with tokens
            let _ = app.emit(
                "oauth-success",
                serde_json::json!({
                    "tokens": tokens,
                    "provider": "gmail"
                }),
            );

            debug!("Gmail authentication completed successfully!");
        } else if let Some(error) = query_params.get("error") {
            error!("Gmail OAuth error: {error}");
            // Emit error to frontend
            let _ = app.emit("oauth-error", format!("OAuth error: {error}"));
        }
    }
}
