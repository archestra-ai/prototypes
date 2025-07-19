use serde::{Deserialize, Serialize};
use tauri::Emitter;
use crate::models::mcp_server::{Model as McpServerModel, McpServerDefinition, ServerConfig};
use crate::database::connection::get_database_connection_with_app;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GmailTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expiry_date: Option<u64>,
}

#[tauri::command]
pub async fn save_gmail_tokens_to_db(app: tauri::AppHandle, tokens: GmailTokens) -> Result<(), String> {
    let conn = get_database_connection_with_app(&app).await
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    // Create the MCP server args with proper formatting
    let args = vec![
        "@gongrzhe/server-gmail-autoauth-mcp".to_string(),
        format!("--access-token={}", tokens.access_token),
        format!("--refresh-token={}", tokens.refresh_token)
    ];

    let server_config = ServerConfig {
        transport: "stdio".to_string(),
        command: "npx".to_string(),
        args,
        env: std::collections::HashMap::new(),
    };

    let definition = McpServerDefinition {
        name: "Gmail MCP Server".to_string(),
        server_config,
    };

    McpServerModel::save_server(&conn, &definition).await
        .map_err(|e| format!("Failed to save Gmail MCP server: {}", e))?;

    println!("Successfully saved Gmail MCP server to database");

    Ok(())
}

#[tauri::command]
pub async fn load_gmail_tokens(app: tauri::AppHandle) -> Result<Option<GmailTokens>, String> {
    let conn = get_database_connection_with_app(&app).await.map_err(|e| format!("Failed to get database connection: {}", e))?;

    let server = McpServerModel::find_by_name(&conn, "Gmail MCP Server").await
        .map_err(|e| format!("Failed to query Gmail MCP server: {}", e))?;

    if let Some(server) = server {
        // Try to parse tokens from server_config args
        if let Some(tokens_json) = server.server_config.args.first() {
            if let Ok(tokens) = serde_json::from_str::<GmailTokens>(tokens_json) {
                return Ok(Some(tokens));
            }
        }
    }
    
    Ok(None)
}

pub async fn handle_gmail_oauth_callback(app: tauri::AppHandle, url: String) {
    use url::Url;

    println!("Received Gmail OAuth callback: {}", url);

    if let Ok(parsed_url) = Url::parse(&url) {
        let query_params: std::collections::HashMap<String, String> = parsed_url
            .query_pairs()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();

        if let (Some(access_token), Some(refresh_token)) = (
            query_params.get("access_token"),
            query_params.get("refresh_token")
        ) {
            let tokens = GmailTokens {
                access_token: access_token.clone(),
                refresh_token: refresh_token.clone(),
                expiry_date: query_params.get("expiry_date")
                    .and_then(|d| d.parse::<u64>().ok()),
            };

            // Save tokens to database
            if let Err(e) = save_gmail_tokens_to_db(app.clone(), tokens.clone()).await {
                eprintln!("Failed to save Gmail tokens: {}", e);
                // Emit error to frontend
                let _ = app.emit("oauth-error", format!("Failed to save tokens: {}", e));
                return;
            }

            // Start the Gmail MCP server automatically
            let app_clone = app.clone();
            let tokens_clone = tokens.clone();
            tauri::async_runtime::spawn(async move {
                let args = vec![
                    "@gongrzhe/server-gmail-autoauth-mcp".to_string(),
                    format!("--access-token={}", tokens_clone.access_token),
                    format!("--refresh-token={}", tokens_clone.refresh_token)
                ];

                if let Err(e) = crate::mcp_bridge::start_persistent_mcp_server(
                    app_clone.clone(),
                    "Gmail MCP Server".to_string(),
                    "npx".to_string(),
                    args,
                    Some(std::collections::HashMap::new())
                ).await {
                    eprintln!("Failed to start Gmail MCP server: {}", e);
                    let _ = app_clone.emit("oauth-error", format!("Failed to start MCP server: {}", e));
                } else {
                    println!("Gmail MCP server started successfully!");
                }
            });

            // Emit success event to frontend with tokens
            let _ = app.emit("oauth-success", serde_json::json!({
                "tokens": tokens,
                "provider": "gmail"
            }));

            println!("Gmail authentication completed successfully!");
        } else if let Some(error) = query_params.get("error") {
            eprintln!("Gmail OAuth error: {}", error);
            // Emit error to frontend
            let _ = app.emit("oauth-error", format!("OAuth error: {}", error));
        }
    }
}