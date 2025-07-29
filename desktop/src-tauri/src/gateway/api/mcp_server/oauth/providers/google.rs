use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::debug;
use url::Url;

use crate::gateway::api::mcp_server::oauth::utils::write_oauth_credentials_file;
use crate::models::mcp_server::{MCPServerDefinition, Model as MCPServerModel};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleCredentials {
    #[serde(rename = "type")]
    pub credential_type: String,
    pub client_id: String,
    pub client_secret: String,
    pub refresh_token: String,
    pub token_uri: String,
}

pub async fn handle_google_oauth_callback(
    app_handle: tauri::AppHandle,
    db: DatabaseConnection,
    url: String,
) -> Result<(), String> {
    debug!("Received Google OAuth callback: {url}");

    let parsed_url =
        Url::parse(&url).map_err(|e| format!("Invalid Google OAuth callback URL: {e}"))?;

    let query_params: HashMap<String, String> = parsed_url
        .query_pairs()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();

    // Extract required parameters
    let mcp_server_catalog_id = query_params
        .get("service")
        .ok_or("Missing service parameter")?
        .clone();

    let refresh_token = query_params
        .get("refresh_token")
        .ok_or("Missing refresh_token parameter")?
        .clone();

    let token_uri = query_params
        .get("token_uri")
        .ok_or("Missing token_uri parameter")?
        .clone();

    let client_id = query_params
        .get("client_id")
        .ok_or("Missing client_id parameter")?
        .clone();

    let client_secret = query_params
        .get("client_secret")
        .ok_or("Missing client_secret parameter")?
        .clone();

    // Create Google credentials structure matching the expected format
    let credentials = GoogleCredentials {
        credential_type: "authorized_user".to_string(),
        client_id,
        client_secret,
        refresh_token,
        token_uri,
    };

    // Write credentials to file
    let credential_path =
        write_oauth_credentials_file(&app_handle, &mcp_server_catalog_id, &credentials)?;

    // Load the catalog to get the server definition
    let catalog = MCPServerModel::get_mcp_connector_catalog()
        .await
        .map_err(|e| format!("Failed to load MCP connector catalog: {e}"))?;

    // Find the connector by ID
    let connector = catalog
        .iter()
        .find(|c| c.id == mcp_server_catalog_id)
        .ok_or_else(|| format!("Connector '{}' not found in catalog", mcp_server_catalog_id))?;

    // Update the server config with the credential file path
    let mut server_config = connector.server_config.clone();
    server_config
        .env
        .insert("GOOGLE_CLIENT_SECRET_PATH".to_string(), credential_path);

    let definition = MCPServerDefinition {
        name: connector.title.clone(),
        server_config,
    };

    // Save the MCP server to the database (this will also start the server)
    MCPServerModel::save_server(&db, &definition)
        .await
        .map_err(|e| format!("Failed to save Google MCP server: {e}"))?;

    debug!("Successfully saved Google MCP server: {}", connector.title);
    Ok(())
}
