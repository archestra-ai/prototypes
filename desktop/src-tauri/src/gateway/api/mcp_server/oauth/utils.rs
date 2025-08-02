use serde::Serialize;
use std::path::PathBuf;

/// Get the file path for OAuth credentials for a given MCP server
/// Returns the actual file path on disk
pub fn get_oauth_credentials_file_path(
    app_data_dir: &PathBuf,
    mcp_server_catalog_id: &str,
) -> Result<PathBuf, String> {
    // Create the mcp_servers subdirectory
    let mcp_servers_dir = app_data_dir.join("mcp_servers");

    // Use a consistent naming pattern for the credential files
    let file_name = format!("oauth-credentials-{mcp_server_catalog_id}.json");
    Ok(mcp_servers_dir.join(file_name))
}

/// Write OAuth credentials to a file
/// Returns the templated path string that should be used in environment variables
pub fn write_oauth_credentials_file<T: Serialize>(
    app_data_dir: &PathBuf,
    mcp_server_catalog_id: &str,
    credentials: &T,
) -> Result<String, String> {
    let file_path = get_oauth_credentials_file_path(app_data_dir, mcp_server_catalog_id)?;

    // Create parent directory if it doesn't exist
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }

    let file_content = serde_json::to_string_pretty(&credentials)
        .map_err(|e| format!("Failed to serialize credentials: {e}"))?;

    std::fs::write(&file_path, file_content)
        .map_err(|e| format!("Failed to write credentials to file: {e}"))?;

    // Return the templated path that will be used in catalog.json
    // This format will be replaced by MCPServerManager::start_server
    Ok(format!(
        "{{{{ .app_data_dir }}}}/mcp_servers/oauth-credentials-{mcp_server_catalog_id}.json"
    ))
}
