use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;

/// Get the file path for OAuth credentials for a given MCP server
/// Returns the actual file path on disk
pub fn get_oauth_credentials_file_path(
    app_handle: &tauri::AppHandle,
    mcp_server_catalog_id: &str,
) -> Result<PathBuf, String> {
    // Use Tauri's app data directory for cross-platform compatibility
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?;

    // Create the mcp_servers subdirectory
    let mcp_servers_dir = app_dir.join("mcp_servers");

    // Use a consistent naming pattern for the credential files
    let file_name = format!("oauth-credentials-{mcp_server_catalog_id}.json");
    Ok(mcp_servers_dir.join(file_name))
}

/// Write OAuth credentials to a file
/// Returns the templated path string that should be used in environment variables
pub fn write_oauth_credentials_file<T: Serialize>(
    app_handle: &tauri::AppHandle,
    mcp_server_catalog_id: &str,
    credentials: &T,
) -> Result<String, String> {
    let file_path = get_oauth_credentials_file_path(app_handle, mcp_server_catalog_id)?;

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

/// Replace template variables in a path string with actual values
/// Currently supports: {{ .app_data_dir }}
pub fn resolve_templated_path(
    app_handle: &tauri::AppHandle,
    templated_path: &str,
) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?;

    let app_dir_str = app_dir
        .to_str()
        .ok_or("Failed to convert app directory path to string")?;

    Ok(templated_path.replace("{{ .app_data_dir }}", app_dir_str))
}
