use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use crate::utils::get_free_port;
use tauri_plugin_opener::OpenerExt;
use tauri::Emitter;

pub mod gmail;

// Global state for OAuth proxy
static OAUTH_PROXY_PORT: OnceLock<u16> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GmailTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expiry_date: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub auth_url: String,
}

#[tauri::command]
pub async fn start_gmail_auth(app: tauri::AppHandle) -> Result<AuthResponse, String> {
    // Start OAuth proxy if not already running
    let port = get_oauth_proxy_port().ok_or("OAuth proxy not started")?;

    // Call the OAuth proxy service
    let client = reqwest::Client::new();
    let response = client
        .get(format!("http://localhost:{}/auth/gmail", port))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to OAuth proxy: {}", e))?;

    let auth_data: AuthResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse auth response: {}", e))?;

    // Open the auth URL in the system browser
    app.opener().open_url(auth_data.auth_url.as_str(), None::<&str>)
        .map_err(|e| format!("Failed to open auth URL: {}", e))?;

    Ok(auth_data)
}

#[tauri::command]
pub async fn save_gmail_tokens(app: tauri::AppHandle, tokens: GmailTokens) -> Result<(), String> {
    use crate::models::mcp_server::{Model as McpServerModel, McpServerDefinition};
    use crate::database::connection::get_database_connection_with_app;
    
    let conn = get_database_connection_with_app(&app).await.map_err(|e| format!("Failed to get database connection: {}", e))?;

    // Save tokens as JSON in the args field of the MCP server record
    let tokens_json = serde_json::to_string(&tokens)
        .map_err(|e| format!("Failed to serialize tokens: {}", e))?;

    // Create MCP server definition for Gmail
    let definition = McpServerDefinition {
        name: "Gmail MCP Server".to_string(),
        command: "npx".to_string(),
        args: vec![tokens_json],
        env: std::collections::HashMap::new(),
    };

    McpServerModel::save_server(&conn, &definition).await
        .map_err(|e| format!("Failed to save Gmail MCP server: {}", e))?;

    Ok(())
}

pub async fn save_gmail_tokens_to_db(app: tauri::AppHandle, tokens: GmailTokens) -> Result<(), String> {
    use crate::models::mcp_server::{Model as McpServerModel, McpServerDefinition};
    use crate::database::connection::get_database_connection_with_app;

    let conn = get_database_connection_with_app(&app).await
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    // Create the MCP server args with proper formatting
    let args = vec![
        "@gongrzhe/server-gmail-autoauth-mcp".to_string(),
        format!("--access-token={}", tokens.access_token),
        format!("--refresh-token={}", tokens.refresh_token)
    ];

    let definition = McpServerDefinition {
        name: "Gmail MCP Server".to_string(),
        command: "npx".to_string(),
        args,
        env: std::collections::HashMap::new(),
    };

    McpServerModel::save_server(&conn, &definition).await
        .map_err(|e| format!("Failed to save Gmail MCP server: {}", e))?;

    println!("Successfully saved Gmail MCP server to database");

    Ok(())
}

#[tauri::command]
pub async fn load_gmail_tokens(app: tauri::AppHandle) -> Result<Option<GmailTokens>, String> {
    use crate::models::mcp_server::Model as McpServerModel;
    use crate::database::connection::get_database_connection_with_app;

    let conn = get_database_connection_with_app(&app).await.map_err(|e| format!("Failed to get database connection: {}", e))?;

    let server = McpServerModel::find_by_name(&conn, "Gmail MCP Server").await
        .map_err(|e| format!("Failed to query Gmail MCP server: {}", e))?;

    if let Some(server) = server {
        // Try to parse tokens from args (first approach)
        if let Some(tokens_json) = server.args.first() {
            if let Ok(tokens) = serde_json::from_str::<GmailTokens>(tokens_json) {
                return Ok(Some(tokens));
            }
        }
    }
    
    Ok(None)
}

pub fn start_oauth_proxy(app: tauri::AppHandle) -> Result<u16, String> {
    println!("Initializing Gmail OAuth proxy...");

    // Get a free port and store it in global state
    let port = get_free_port()?;
    OAUTH_PROXY_PORT.set(port).map_err(|_| "Failed to store port")?;

    println!("Starting OAuth proxy on port: {}", port);

    // Start the OAuth proxy process
    let sidecar_result = app.shell()
        .sidecar("gmail-oauth-proxy")
        .map_err(|e| format!("Failed to get sidecar: {:?}", e))?
        .env("PORT", port.to_string())
        .spawn();

    match sidecar_result {
        Ok((mut rx, _child)) => {
            println!("OAuth proxy process started successfully on port: {}", port);

            // Handle output in background
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line_bytes) => {
                            let line = String::from_utf8_lossy(&line_bytes);
                            print!("[OAuth Proxy stdout] {}", line);
                        }
                        CommandEvent::Stderr(line_bytes) => {
                            let line = String::from_utf8_lossy(&line_bytes);
                            eprint!("[OAuth Proxy stderr] {}", line);
                        }
                        _ => {}
                    }
                }
            });

            Ok(port)
        }
        Err(e) => {
            let error_msg = format!("Failed to start OAuth proxy: {:?}", e);
            eprintln!("{}", error_msg);
            Err(error_msg)
        }
    }
}

pub fn get_oauth_proxy_port() -> Option<u16> {
    OAUTH_PROXY_PORT.get().copied()
}

#[tauri::command]
pub fn check_oauth_proxy_health() -> Result<bool, String> {
    // Get the port from global state
    let port = get_oauth_proxy_port().ok_or("OAuth proxy not started")?;

    let client = reqwest::blocking::Client::new();
    let response = client
        .get(format!("http://localhost:{}/health", port))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .map_err(|e| format!("OAuth proxy not available: {}", e))?;

    Ok(response.status().is_success())
}

pub async fn handle_oauth_callback(app: tauri::AppHandle, url: String) {
    use url::Url;

    println!("Received OAuth callback: {}", url);

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
            eprintln!("OAuth error: {}", error);
            // Emit error to frontend
            let _ = app.emit("oauth-error", format!("OAuth error: {}", error));
        }
    }
}