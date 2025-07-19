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

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub auth_url: String,
}

#[tauri::command]
pub async fn start_oauth_auth(app: tauri::AppHandle, service: String) -> Result<AuthResponse, String> {
    // Start OAuth proxy if not already running
    let port = get_oauth_proxy_port().ok_or("OAuth proxy not started")?;

    // Call the OAuth proxy service with dynamic service parameter
    let client = reqwest::Client::new();
    let response = client
        .get(format!("http://localhost:{}/auth/{}", port, service))
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


pub fn start_oauth_proxy(app: tauri::AppHandle) -> Result<u16, String> {
    println!("Initializing OAuth proxy...");

    // Get a free port and store it in global state
    let port = get_free_port()?;
    OAUTH_PROXY_PORT.set(port).map_err(|_| "Failed to store port")?;

    println!("Starting OAuth proxy on port: {}", port);

    // Start the OAuth proxy process
    let sidecar_result = app.shell()
        .sidecar("oauth-proxy")
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

        // Get the service from the query parameters
        let service = query_params.get("service").unwrap_or(&"unknown".to_string()).clone();

        if let Some(error) = query_params.get("error") {
            eprintln!("OAuth error for {}: {}", service, error);
            // Emit error to frontend
            let _ = app.emit("oauth-error", format!("OAuth error: {}", error));
            return;
        }

        // Route to service-specific handler
        match service.as_str() {
            "gmail" => {
                gmail::handle_gmail_oauth_callback(app, url).await;
            }
            _ => {
                eprintln!("Unsupported OAuth service: {}", service);
                let _ = app.emit("oauth-error", format!("Unsupported service: {}", service));
            }
        }
    }
}