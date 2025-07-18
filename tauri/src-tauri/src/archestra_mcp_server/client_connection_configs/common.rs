use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::Manager;
use rusqlite::params;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientMcpConfig {
    #[serde(rename = "mcpServers")]
    pub mcp_servers: HashMap<String, McpServerConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeDesktopConfig {
    #[serde(rename = "mcpServers")]
    pub mcp_servers: HashMap<String, McpServerConfig>,
    // Claude Desktop config may have other fields
    #[serde(flatten)]
    pub other: Map<String, Value>,
}

pub fn read_config_file(path: &PathBuf) -> Result<Value, String> {
    if !path.exists() {
        // Return empty config if file doesn't exist
        return Ok(serde_json::json!({
            "mcpServers": {}
        }));
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read config file {}: {}", path.display(), e))?;
    
    if content.trim().is_empty() {
        return Ok(serde_json::json!({
            "mcpServers": {}
        }));
    }

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON in {}: {}", path.display(), e))
}

pub fn write_config_file(path: &PathBuf, config: &Value) -> Result<(), String> {
    println!("📝 Attempting to write config file to: {}", path.display());
    
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        println!("📁 Creating parent directory: {}", parent.display());
        std::fs::create_dir_all(parent)
            .map_err(|e| {
                let err_msg = format!("Failed to create config directory {}: {}", parent.display(), e);
                println!("❌ {}", err_msg);
                err_msg
            })?;
    }

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| {
            let err_msg = format!("Failed to serialize config: {}", e);
            println!("❌ {}", err_msg);
            err_msg
        })?;
    
    println!("📄 Writing {} bytes to file", content.len());
    std::fs::write(path, &content)
        .map_err(|e| {
            let err_msg = format!("Failed to write config file {}: {}", path.display(), e);
            println!("❌ {}", err_msg);
            err_msg
        })?;
    
    // Verify the file was written correctly
    if let Ok(written_content) = std::fs::read_to_string(path) {
        if written_content == content {
            println!("✅ Config file written and verified successfully");
        } else {
            println!("⚠️  Config file written but content doesn't match");
        }
    } else {
        println!("⚠️  Config file written but couldn't verify content");
    }
    
    Ok(())
}

pub async fn get_available_mcp_tools(app_handle: &tauri::AppHandle) -> Result<Vec<String>, String> {
    // Get all available MCP tools from the bridge
    use crate::mcp_bridge::McpBridgeState;
    
    println!("🔍 Getting available MCP tools from bridge...");
    let bridge_state = app_handle.state::<McpBridgeState>();
    let all_tools = bridge_state.0.get_all_tools();
    
    println!("🛠️  Found {} tools from MCP bridge", all_tools.len());
    for (server_name, tool) in &all_tools {
        println!("  📦 Server: '{}' -> Tool: '{}'", server_name, tool.name);
    }
    
    // Extract unique tool names
    let tool_names: Vec<String> = all_tools.into_iter()
        .map(|(_, tool)| tool.name)
        .collect();
    
    println!("🎯 Extracted {} unique tool names: {:?}", tool_names.len(), tool_names);
    Ok(tool_names)
}

pub fn create_archestra_tool_config(tool_name: &str) -> McpServerConfig {
    McpServerConfig {
        command: "curl".to_string(),
        args: vec![
            "-X".to_string(),
            "POST".to_string(),
            format!("http://localhost:54587/mcp/{}", tool_name),
            "-H".to_string(),
            "Content-Type: application/json".to_string(),
            "-d".to_string(),
            "@-".to_string(), // Read JSON from stdin
        ],
    }
}

pub fn save_client_connection_state(app_handle: &tauri::AppHandle, client_name: &str, is_connected: bool) -> Result<(), String> {
    use crate::database::connection::get_database_connection_with_app;
    
    println!("💾 Saving client connection state: {} = {}", client_name, is_connected);
    let conn = get_database_connection_with_app(app_handle)
        .map_err(|e| format!("Failed to get database connection: {}", e))?;
    
    let config_path = match client_name {
        "cursor" => crate::archestra_mcp_server::client_connection_configs::cursor::get_config_path()?.to_string_lossy().to_string(),
        "claude" => crate::archestra_mcp_server::client_connection_configs::claude::get_config_path()?.to_string_lossy().to_string(),
        "vscode" => crate::archestra_mcp_server::client_connection_configs::vscode::get_config_path()?.to_string_lossy().to_string(),
        _ => return Err(format!("Unknown client: {}", client_name)),
    };
    
    let last_connected = if is_connected { 
        Some(chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()) 
    } else { 
        None 
    };
    
    conn.execute(
        "INSERT OR REPLACE INTO client_connections (client_name, is_connected, last_connected, config_path, updated_at)
         VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)",
        params![client_name, is_connected, last_connected, config_path],
    ).map_err(|e| format!("Failed to save client connection state: {}", e))?;
    
    Ok(())
}

pub fn get_client_connection_state(app_handle: &tauri::AppHandle, client_name: &str) -> Result<bool, String> {
    use crate::database::connection::get_database_connection_with_app;
    
    let conn = get_database_connection_with_app(app_handle)
        .map_err(|e| format!("Failed to get database connection: {}", e))?;
    
    let mut stmt = conn.prepare("SELECT is_connected FROM client_connections WHERE client_name = ?1")
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;
    
    let result = stmt.query_row(params![client_name], |row| {
        Ok(row.get::<_, bool>(0)?)
    });
    
    match result {
        Ok(is_connected) => Ok(is_connected),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false), // Default to disconnected
        Err(e) => Err(format!("Failed to query client connection state: {}", e)),
    }
}

pub fn get_connected_clients(app_handle: &tauri::AppHandle) -> Result<Vec<String>, String> {
    use crate::database::connection::get_database_connection_with_app;
    
    let conn = get_database_connection_with_app(app_handle)
        .map_err(|e| format!("Failed to get database connection: {}", e))?;
    
    let mut stmt = conn.prepare("SELECT client_name FROM client_connections WHERE is_connected = 1")
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;
    
    let client_iter = stmt.query_map([], |row| {
        Ok(row.get::<_, String>(0)?)
    }).map_err(|e| format!("Failed to query connected clients: {}", e))?;
    
    let mut clients = Vec::new();
    for client in client_iter {
        clients.push(client.map_err(|e| format!("Failed to parse client name: {}", e))?);
    }
    
    Ok(clients)
}

pub async fn update_connected_clients_with_new_tools(app_handle: &tauri::AppHandle, new_tools: &[String]) -> Result<(), String> {
    let connected_clients = get_connected_clients(app_handle)?;
    
    for client in connected_clients {
        println!("Updating {} with new tools: {:?}", client, new_tools);
        
        let config_path = match client.as_str() {
            "cursor" => crate::archestra_mcp_server::client_connection_configs::cursor::get_config_path()?,
            "claude" => crate::archestra_mcp_server::client_connection_configs::claude::get_config_path()?,
            "vscode" => crate::archestra_mcp_server::client_connection_configs::vscode::get_config_path()?,
            _ => {
                println!("Warning: Unknown client '{}' in database", client);
                continue;
            }
        };
        
        let mut config = read_config_file(&config_path)?;
        
        // Ensure mcpServers object exists
        if !config.is_object() {
            config = serde_json::json!({});
        }
        if !config.get("mcpServers").is_some() {
            config["mcpServers"] = serde_json::json!({});
        }
        
        let mcp_servers = config["mcpServers"].as_object_mut()
            .ok_or("mcpServers is not an object")?;
        
        // Add new tools
        for tool in new_tools {
            let tool_key = format!("{} (archestra.ai)", tool);
            if !mcp_servers.contains_key(&tool_key) {
                let tool_config = create_archestra_tool_config(tool);
                mcp_servers.insert(tool_key, serde_json::to_value(tool_config).unwrap());
                println!("Added tool '{}' to {}", tool, client);
            }
        }
        
        write_config_file(&config_path, &config)?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn check_client_connection_status(app_handle: tauri::AppHandle, client: String) -> Result<bool, String> {
    // Check database first, fall back to config file verification
    match get_client_connection_state(&app_handle, &client) {
        Ok(is_connected) => {
            // Double-check by verifying config file has archestra tools
            if is_connected {
                let config_path = match client.as_str() {
                    "cursor" => crate::archestra_mcp_server::client_connection_configs::cursor::get_config_path()?,
                    "claude" => crate::archestra_mcp_server::client_connection_configs::claude::get_config_path()?,
                    "vscode" => crate::archestra_mcp_server::client_connection_configs::vscode::get_config_path()?,
                    _ => return Err(format!("Unknown client: {}", client)),
                };
                
                let config = read_config_file(&config_path)?;
                
                if let Some(mcp_servers) = config["mcpServers"].as_object() {
                    let has_archestra_tools = mcp_servers.keys()
                        .any(|key| key.ends_with(" (archestra.ai)"));
                    
                    // If database says connected but config doesn't have tools, update database
                    if !has_archestra_tools {
                        save_client_connection_state(&app_handle, &client, false)?;
                        return Ok(false);
                    }
                    
                    Ok(has_archestra_tools)
                } else {
                    // No mcpServers section, definitely not connected
                    save_client_connection_state(&app_handle, &client, false)?;
                    Ok(false)
                }
            } else {
                Ok(false)
            }
        }
        Err(_) => {
            // Database error, fall back to config file check
            let config_path = match client.as_str() {
                "cursor" => crate::archestra_mcp_server::client_connection_configs::cursor::get_config_path()?,
                "claude" => crate::archestra_mcp_server::client_connection_configs::claude::get_config_path()?,
                "vscode" => crate::archestra_mcp_server::client_connection_configs::vscode::get_config_path()?,
                _ => return Err(format!("Unknown client: {}", client)),
            };
            
            let config = read_config_file(&config_path)?;
            
            if let Some(mcp_servers) = config["mcpServers"].as_object() {
                let has_archestra_tools = mcp_servers.keys()
                    .any(|key| key.ends_with(" (archestra.ai)"));
                Ok(has_archestra_tools)
            } else {
                Ok(false)
            }
        }
    }
}

// Function to be called when new MCP servers are started
#[tauri::command]
pub async fn notify_new_mcp_tools_available(app_handle: tauri::AppHandle) -> Result<(), String> {
    // Get all available tools
    let tools = get_available_mcp_tools(&app_handle).await?;
    
    // Update connected clients with new tools
    update_connected_clients_with_new_tools(&app_handle, &tools).await?;
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_create_archestra_tool_config() {
        let config = create_archestra_tool_config("test_tool");
        
        assert_eq!(config.command, "curl");
        assert_eq!(config.args[0], "-X");
        assert_eq!(config.args[1], "POST");
        assert_eq!(config.args[2], "http://localhost:54587/mcp/test_tool");
        assert_eq!(config.args[3], "-H");
        assert_eq!(config.args[4], "Content-Type: application/json");
        assert_eq!(config.args[5], "-d");
        assert_eq!(config.args[6], "@-");
    }

    #[test]
    fn test_read_config_file_nonexistent() {
        use std::path::PathBuf;
        let nonexistent_path = PathBuf::from("/tmp/nonexistent_config.json");
        let result = read_config_file(&nonexistent_path);
        
        assert!(result.is_ok());
        let config = result.unwrap();
        assert!(config.is_object());
        assert!(config["mcpServers"].is_object());
    }

    #[test]
    fn test_client_mcp_config_serialization() {
        let mut servers = HashMap::new();
        servers.insert(
            "test_tool (archestra.ai)".to_string(),
            create_archestra_tool_config("test_tool")
        );
        
        let config = ClientMcpConfig {
            mcp_servers: servers
        };
        
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("mcpServers"));
        assert!(json.contains("test_tool (archestra.ai)"));
        assert!(json.contains("curl"));
    }
}