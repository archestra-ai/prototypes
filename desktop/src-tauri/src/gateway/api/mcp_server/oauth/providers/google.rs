use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use url::Url;

use crate::gateway::api::mcp_server::oauth::utils::write_oauth_credentials_file;
use crate::models::mcp_server::{MCPServerDefinition, Model as MCPServerModel};


// TODO: once we have environment variables setup, pull this from there
const CLIENT_ID: &str = "354887056155-5b4rlcofccknibd4fv3ldud9vvac3rdf.apps.googleusercontent.com";

// TODO:  conver this from javascript to rust
// const baseGoogleScopes = ['https://www.googleapis.com/auth/userinfo.email', 'openid'];
//  switch (mcpCatalogConnectorId) {
//     case 'gmail':
//       return [
//         ...baseGoogleScopes,
//         'https://www.googleapis.com/auth/gmail.readonly',
//         'https://www.googleapis.com/auth/gmail.send',
//         'https://www.googleapis.com/auth/gmail.compose',
//         'https://www.googleapis.com/auth/gmail.modify',
//         'https://www.googleapis.com/auth/gmail.labels',
//       ];
//     case 'google-drive':
//       return [
//         ...baseGoogleScopes,
//         'https://www.googleapis.com/auth/drive.readonly',
//         'https://www.googleapis.com/auth/drive.file',
//       ];
//     case 'google-calendar':
//       return [
//         ...baseGoogleScopes,
//         'https://www.googleapis.com/auth/calendar.readonly',
//         'https://www.googleapis.com/auth/calendar.events',
//       ];
//     case 'google-docs':
//       return [
//         ...baseGoogleScopes,
//         'https://www.googleapis.com/auth/documents.readonly',
//         'https://www.googleapis.com/auth/documents',
//       ];
//     case 'google-sheets':
//       return [
//         ...baseGoogleScopes,
//         'https://www.googleapis.com/auth/spreadsheets.readonly',
//         'https://www.googleapis.com/auth/spreadsheets',
//       ];
//     case 'google-slides':
//       return [
//         ...baseGoogleScopes,
//         'https://www.googleapis.com/auth/presentations.readonly',
//         'https://www.googleapis.com/auth/presentations',
//       ];
//     case 'google-forms':
//       return [
//         ...baseGoogleScopes,
//         'https://www.googleapis.com/auth/forms.body',
//         'https://www.googleapis.com/auth/forms.body.readonly',
//         'https://www.googleapis.com/auth/forms.responses.readonly',
//       ];
//     case 'google-tasks':
//       return [
//         ...baseGoogleScopes,
//         'https://www.googleapis.com/auth/tasks.readonly',
//         'https://www.googleapis.com/auth/tasks',
//       ];
//     case 'google-chat':
//       return [
//         ...baseGoogleScopes,
//         'https://www.googleapis.com/auth/chat.messages.readonly',
//         'https://www.googleapis.com/auth/chat.messages',
//         'https://www.googleapis.com/auth/chat.spaces',
//       ];
//     default:
//       throw new Error(`Unknown mcpCatalogConnectorId for scopes: ${mcpCatalogConnectorId}`);
//   }


// Check out https://googleapis.dev/python/google-auth/latest/reference/google.oauth2.credentials.html for
// more details about what these various fields mean
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleCredentials {
    pub client_id: String,
    pub token: String,
    pub refresh_token: String,
    pub token_uri: String,
    pub scopes: Vec<String>,
}

// TODO: get this working https://developers.google.com/identity/protocols/oauth2/native-app#uwp
pub async fn get_google_oauth_auth_url(
    mcp_server_catalog_id: String,
) -> Result<String, String> {
    info!("Starting Google OAuth auth flow");


    // https://accounts.google.com/o/oauth2/v2/auth?
    // scope=email%20profile&
    // response_type=code&
    // state=security_token%3D138r5719ru3e1%26url%3Dhttps%3A%2F%2Foauth2.example.com%2Ftoken&
    // redirect_uri=com.example.app%3A/oauth2redirect&
    // client_id=client_id

    // redirect_uri should be archestra-ai://oauth-callback/google

    // put mcp_server_catalog_id after # in the URL

    // pull scopes from above based on mcp_server_catalog_id

    let auth_url = format!("https://accounts.google.com/o/oauth2/v2/auth?
    scope=email%20profile&
    response_type=code&
    state=security_token%3D138r5719ru3e1%26url%3Dhttps%3A%2F%2Foauth2.example.com%2Ftoken&
    redirect_uri=com.example.app%3A/oauth2redirect&
    client_id=client_id");

    Ok(auth_url)
}

pub async fn handle_google_oauth_callback(
    app_data_dir: &PathBuf,
    db: DatabaseConnection,
    url: String,
) -> Result<(), String> {
    info!("Processing Google OAuth callback");
    debug!("Callback URL: {url}");

    let parsed_url = Url::parse(&url).map_err(|e| {
        error!("Failed to parse OAuth callback URL: {}", e);
        format!("Invalid Google OAuth callback URL: {e}")
    })?;

    // TODO: properly handle things, see here
    // https://developers.google.com/identity/protocols/oauth2/native-app#handlingresponse

    // let query_params: HashMap<String, String> = parsed_url
    //     .query_pairs()
    //     .map(|(k, v)| (k.to_string(), v.to_string()))
    //     .collect();

    // // Extract required parameters
    // let mcp_server_catalog_id = query_params
    //     .get("mcp_catalog_connector_id")
    //     .ok_or_else(|| {
    //         error!("Missing 'mcp_catalog_connector_id' parameter in OAuth callback");
    //         "Missing mcp_catalog_connector_id parameter"
    //     })?
    //     .clone();

    // info!("OAuth callback for MCP server: {}", mcp_server_catalog_id);

    // let access_token = query_params
    //     .get("access_token")
    //     .ok_or_else(|| {
    //         error!("Missing 'access_token' parameter in OAuth callback");
    //         "Missing access_token parameter"
    //     })?
    //     .clone();

    // let refresh_token = query_params
    //     .get("refresh_token")
    //     .ok_or_else(|| {
    //         error!("Missing 'refresh_token' parameter in OAuth callback");
    //         "Missing refresh_token parameter"
    //     })?
    //     .clone();

    // let token_uri = query_params
    //     .get("token_uri")
    //     .ok_or_else(|| {
    //         error!("Missing 'token_uri' parameter in OAuth callback");
    //         "Missing token_uri parameter"
    //     })?
    //     .clone();

    // let client_id = query_params
    //     .get("client_id")
    //     .ok_or_else(|| {
    //         error!("Missing 'client_id' parameter in OAuth callback");
    //         "Missing client_id parameter"
    //     })?
    //     .clone();

    // let scopes = query_params
    //     .get("scopes")
    //     .ok_or_else(|| {
    //         error!("Missing 'scopes' parameter in OAuth callback");
    //         "Missing scopes parameter"
    //     })?
    //     .clone();

    // // NOTE: the oauth-proxy server's callback SHOULDN'T include this..
    // // let client_secret = query_params
    // //     .get("client_secret")
    // //     .ok_or_else(|| {
    // //         error!("Missing 'client_secret' parameter in OAuth callback");
    // //         "Missing client_secret parameter"
    // //     })?
    // //     .clone();

    // debug!("Successfully extracted all OAuth parameters");

    // // Create Google credentials structure matching the expected format
    // let credentials = GoogleCredentials {
    //     token: access_token,
    //     refresh_token,
    //     token_uri,
    //     scopes: scopes.split(',').map(|s| s.to_string()).collect(),
    //     client_id,
    //     // client_secret,
    // };

    // // Write credentials to file
    // info!(
    //     "Writing OAuth credentials to file for {}",
    //     mcp_server_catalog_id
    // );
    // let credential_path =
    //     write_oauth_credentials_file(app_data_dir, &mcp_server_catalog_id, &credentials).map_err(
    //         |e| {
    //             error!("Failed to write OAuth credentials to file: {}", e);
    //             e
    //         },
    //     )?;
    // debug!("Credentials written to: {}", credential_path);

    // // Load the catalog to get the server definition
    // debug!("Loading MCP connector catalog");
    // let catalog = MCPServerModel::get_mcp_connector_catalog()
    //     .await
    //     .map_err(|e| {
    //         error!("Failed to load MCP connector catalog: {}", e);
    //         format!("Failed to load MCP connector catalog: {e}")
    //     })?;

    // // Find the connector by ID
    // let connector = catalog
    //     .iter()
    //     .find(|c| c.id == mcp_server_catalog_id)
    //     .ok_or_else(|| {
    //         error!("Connector '{}' not found in catalog", mcp_server_catalog_id);
    //         format!("Connector '{mcp_server_catalog_id}' not found in catalog")
    //     })?;
    // debug!("Found connector in catalog: {}", connector.title);

    // // Update the server config with the credential file path
    // info!("Updating server config with credential path");
    // let mut server_config = connector.server_config.clone();
    // server_config.env.insert(
    //     "GOOGLE_CLIENT_SECRET_PATH".to_string(),
    //     credential_path.clone(),
    // );
    // debug!("Added GOOGLE_CLIENT_SECRET_PATH: {}", credential_path);

    // let definition = MCPServerDefinition {
    //     name: connector.title.clone(),
    //     server_config,
    // };

    // // Save the MCP server to the database (this will also start the server)
    // info!("Saving MCP server '{}' to database", connector.title);
    // MCPServerModel::save_server(&db, &app_data_dir, &definition)
    //     .await
    //     .map_err(|e| {
    //         error!(
    //             "Failed to save Google MCP server '{}': {}",
    //             connector.title, e
    //         );
    //         format!("Failed to save Google MCP server: {e}")
    //     })?;

    // info!(
    //     "Successfully completed OAuth setup for Google MCP server: {}",
    //     connector.title
    // );
    Ok(())
}
