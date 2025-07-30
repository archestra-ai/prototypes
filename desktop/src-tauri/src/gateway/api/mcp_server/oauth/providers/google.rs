use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{debug, error, info};
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
    info!("Processing Google OAuth callback");
    debug!("Callback URL: {url}");

    let parsed_url = Url::parse(&url).map_err(|e| {
        error!("Failed to parse OAuth callback URL: {}", e);
        format!("Invalid Google OAuth callback URL: {e}")
    })?;

    let query_params: HashMap<String, String> = parsed_url
        .query_pairs()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();

    // Extract required parameters
    let mcp_server_catalog_id = query_params
        .get("mcpCatalogConnectorId")
        .ok_or_else(|| {
            error!("Missing 'mcpCatalogConnectorId' parameter in OAuth callback");
            "Missing mcpCatalogConnectorId parameter"
        })?
        .clone();

    info!("OAuth callback for MCP server: {}", mcp_server_catalog_id);

    let refresh_token = query_params
        .get("refresh_token")
        .ok_or_else(|| {
            error!("Missing 'refresh_token' parameter in OAuth callback");
            "Missing refresh_token parameter"
        })?
        .clone();

    let token_uri = query_params
        .get("token_uri")
        .ok_or_else(|| {
            error!("Missing 'token_uri' parameter in OAuth callback");
            "Missing token_uri parameter"
        })?
        .clone();

    let client_id = query_params
        .get("client_id")
        .ok_or_else(|| {
            error!("Missing 'client_id' parameter in OAuth callback");
            "Missing client_id parameter"
        })?
        .clone();

    let client_secret = query_params
        .get("client_secret")
        .ok_or_else(|| {
            error!("Missing 'client_secret' parameter in OAuth callback");
            "Missing client_secret parameter"
        })?
        .clone();

    debug!("Successfully extracted all OAuth parameters");

    // Create Google credentials structure matching the expected format
    let credentials = GoogleCredentials {
        credential_type: "authorized_user".to_string(),
        client_id,
        client_secret,
        refresh_token,
        token_uri,
    };

    // Write credentials to file
    info!(
        "Writing OAuth credentials to file for {}",
        mcp_server_catalog_id
    );
    let credential_path =
        write_oauth_credentials_file(&app_handle, &mcp_server_catalog_id, &credentials).map_err(
            |e| {
                error!("Failed to write OAuth credentials to file: {}", e);
                e
            },
        )?;
    debug!("Credentials written to: {}", credential_path);

    // Load the catalog to get the server definition
    debug!("Loading MCP connector catalog");
    let catalog = MCPServerModel::get_mcp_connector_catalog()
        .await
        .map_err(|e| {
            error!("Failed to load MCP connector catalog: {}", e);
            format!("Failed to load MCP connector catalog: {e}")
        })?;

    // Find the connector by ID
    let connector = catalog
        .iter()
        .find(|c| c.id == mcp_server_catalog_id)
        .ok_or_else(|| {
            error!("Connector '{}' not found in catalog", mcp_server_catalog_id);
            format!("Connector '{mcp_server_catalog_id}' not found in catalog")
        })?;
    debug!("Found connector in catalog: {}", connector.title);

    // Update the server config with the credential file path
    info!("Updating server config with credential path");
    let mut server_config = connector.server_config.clone();
    server_config.env.insert(
        "GOOGLE_CLIENT_SECRET_PATH".to_string(),
        credential_path.clone(),
    );
    debug!("Added GOOGLE_CLIENT_SECRET_PATH: {}", credential_path);

    let definition = MCPServerDefinition {
        name: connector.title.clone(),
        server_config,
    };

    // Save the MCP server to the database (this will also start the server)
    info!("Saving MCP server '{}' to database", connector.title);
    MCPServerModel::save_server(&db, &definition)
        .await
        .map_err(|e| {
            error!(
                "Failed to save Google MCP server '{}': {}",
                connector.title, e
            );
            format!("Failed to save Google MCP server: {e}")
        })?;

    info!(
        "Successfully completed OAuth setup for Google MCP server: {}",
        connector.title
    );
    Ok(())
}
