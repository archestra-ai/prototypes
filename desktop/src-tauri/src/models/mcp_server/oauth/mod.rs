use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tauri_plugin_opener::OpenerExt;

pub mod gmail;

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub auth_url: String,
}

#[tauri::command]
pub async fn start_oauth_auth(
    app: tauri::AppHandle,
    service: String,
) -> Result<AuthResponse, String> {
    // Call the OAuth proxy service with dynamic service parameter
    let client = reqwest::Client::new();
    let response = client
        // TODO: update this URL to the real one once we figure out what it is..
        .get(format!("https://oauth-proxy.archestra.ai/auth/{service}"))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to OAuth proxy: {e}"))?;

    let auth_data: AuthResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse auth response: {e}"))?;

    // Open the auth URL in the system browser
    app.opener()
        .open_url(auth_data.auth_url.as_str(), None::<&str>)
        .map_err(|e| format!("Failed to open auth URL: {e}"))?;

    Ok(auth_data)
}

pub async fn handle_oauth_callback(app: tauri::AppHandle, url: String) {
    use url::Url;

    println!("Received OAuth callback: {url}");

    if let Ok(parsed_url) = Url::parse(&url) {
        let query_params: std::collections::HashMap<String, String> = parsed_url
            .query_pairs()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();

        // Get the service from the query parameters
        let service = query_params
            .get("service")
            .unwrap_or(&"unknown".to_string())
            .clone();

        if let Some(error) = query_params.get("error") {
            eprintln!("OAuth error for {service}: {error}");
            // Emit error to frontend
            let _ = app.emit("oauth-error", format!("OAuth error: {error}"));
            return;
        }

        // Route to service-specific handler
        match service.as_str() {
            "gmail" => {
                gmail::handle_gmail_oauth_callback(app, url).await;
            }
            _ => {
                eprintln!("Unsupported OAuth service: {service}");
                let _ = app.emit("oauth-error", format!("Unsupported service: {service}"));
            }
        }
    }
}
