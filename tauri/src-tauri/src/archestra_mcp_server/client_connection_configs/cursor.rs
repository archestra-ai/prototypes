use std::path::PathBuf;
use super::common::*;

// TODO: Add support for Linux and Windows file paths
pub fn get_config_path() -> Result<PathBuf, String> {
    let home_dir = std::env::var("HOME")
        .map_err(|_| "Could not determine home directory")?;
    
    Ok(PathBuf::from(home_dir).join(".cursor").join("mcp.json"))
}

#[tauri::command]
pub async fn connect_cursor_client(app_handle: tauri::AppHandle) -> Result<(), String> {
    println!("🔌 Connecting Cursor client...");
    let config_path = get_config_path()?;
    println!("📍 Cursor config path: {}", config_path.display());
    let mut config = read_config_file(&config_path)?;
    
    // Get available MCP tools
    let tools = get_available_mcp_tools(&app_handle).await?;
    println!("🔧 Available MCP tools: {:?}", tools);
    
    // Ensure mcpServers object exists
    if !config.is_object() {
        config = serde_json::json!({});
    }
    if !config.get("mcpServers").is_some() {
        config["mcpServers"] = serde_json::json!({});
    }
    
    let mcp_servers = config["mcpServers"].as_object_mut()
        .ok_or("mcpServers is not an object")?;
    
    // Add each tool with archestra.ai suffix
    println!("➕ Adding {} tools to Cursor config", tools.len());
    for tool in &tools {
        let tool_key = format!("{} (archestra.ai)", tool);
        let tool_config = create_archestra_tool_config(&tool);
        mcp_servers.insert(tool_key.clone(), serde_json::to_value(tool_config).unwrap());
        println!("  ✅ Added tool: {}", tool_key);
    }
    
    println!("📝 Writing config to: {}", config_path.display());
    write_config_file(&config_path, &config)?;
    
    // Save connection state to database
    save_client_connection_state(&app_handle, "cursor", true)?;
    
    println!("Updated Cursor MCP config at {}", config_path.display());
    
    Ok(())
}

#[tauri::command]
pub async fn disconnect_cursor_client(app_handle: tauri::AppHandle) -> Result<(), String> {
    let config_path = get_config_path()?;
    let mut config = read_config_file(&config_path)?;
    
    if let Some(mcp_servers) = config["mcpServers"].as_object_mut() {
        // Remove all entries with "(archestra.ai)" suffix
        mcp_servers.retain(|key, _| !key.ends_with(" (archestra.ai)"));
    }
    
    write_config_file(&config_path, &config)?;
    
    // Save disconnection state to database
    save_client_connection_state(&app_handle, "cursor", false)?;
    
    println!("Removed Archestra tools from Cursor MCP config");
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_cursor_config_path() {
        let result = get_config_path();
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(path.to_string_lossy().contains(".cursor"));
        assert!(path.to_string_lossy().ends_with("mcp.json"));
    }
}