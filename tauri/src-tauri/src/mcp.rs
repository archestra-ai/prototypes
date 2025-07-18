use crate::database::connection::get_database_connection_with_app;
use std::collections::HashMap;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct McpServerDefinition {
    pub command: String,
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct McpServersConfig {
    pub mcp_servers: std::collections::HashMap<String, McpServerDefinition>,
}

#[tauri::command]
pub async fn save_mcp_server(app: tauri::AppHandle, name: String, command: String, args: Vec<String>, env: HashMap<String, String>) -> Result<(), String> {
    let conn = get_database_connection_with_app(&app).map_err(|e| format!("Failed to get database connection: {}", e))?;

    let args_json = serde_json::to_string(&args).map_err(|e| format!("Failed to serialize args: {}", e))?;
    let env_json = serde_json::to_string(&env).map_err(|e| format!("Failed to serialize env: {}", e))?;

    conn.execute(
        "INSERT OR REPLACE INTO mcp_servers (name, command, args, env) VALUES (?1, ?2, ?3, ?4)",
        [&name, &command, &args_json, &env_json],
    ).map_err(|e| format!("Failed to save MCP server: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn load_mcp_servers(app: tauri::AppHandle) -> Result<std::collections::HashMap<String, McpServerDefinition>, String> {
    let conn = get_database_connection_with_app(&app).map_err(|e| format!("Failed to get database connection: {}", e))?;

    let mut stmt = conn.prepare("SELECT name, command, args, env FROM mcp_servers").map_err(|e| format!("Failed to prepare statement: {}", e))?;
    let rows = stmt.query_map([], |row| {
        let args_json: String = row.get(2)?;
        let args: Vec<String> = serde_json::from_str(&args_json).map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;

        let env_json: String = row.get(3)?;
        let env: HashMap<String, String> = serde_json::from_str(&env_json).unwrap_or_default();

        Ok((
            row.get::<_, String>(0)?,
            McpServerDefinition {
                command: row.get(1)?,
                args,
                env,
            }
        ))
    }).map_err(|e| format!("Failed to query MCP servers: {}", e))?;

    let mut servers = std::collections::HashMap::new();
    for row in rows {
        let (name, config) = row.map_err(|e| format!("Failed to read row: {}", e))?;
        servers.insert(name, config);
    }

    Ok(servers)
}

#[tauri::command]
pub async fn delete_mcp_server(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let conn = get_database_connection_with_app(&app).map_err(|e| format!("Failed to get database connection: {}", e))?;

    conn.execute(
        "DELETE FROM mcp_servers WHERE name = ?1",
        [&name],
    ).map_err(|e| format!("Failed to delete MCP server: {}", e))?;

    Ok(())
}

pub async fn start_all_mcp_servers(app: tauri::AppHandle) -> Result<(), String> {
    println!("Starting all persisted MCP servers...");

    // Load all persisted MCP servers
    let conn = get_database_connection_with_app(&app).map_err(|e| format!("Failed to get database connection: {}", e))?;
    let mut stmt = conn.prepare("SELECT name, command, args, env FROM mcp_servers").map_err(|e| format!("Failed to prepare statement: {}", e))?;
    let rows = stmt.query_map([], |row| {
        let args_json: String = row.get(2)?;
        let args: Vec<String> = serde_json::from_str(&args_json).map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;

        let env_json: String = row.get(3)?;
        let env: HashMap<String, String> = serde_json::from_str(&env_json).unwrap_or_default();
        
        Ok((row.get::<_, String>(0)?, McpServerDefinition {
            command: row.get(1)?,
            args,
            env,
        }))
    }).map_err(|e| format!("Failed to query MCP servers: {}", e))?;

    let mut servers = std::collections::HashMap::new();
    for row in rows {
        let (name, definition) = row.map_err(|e| format!("Failed to parse row: {}", e))?;
        servers.insert(name, definition);
    }

    if servers.is_empty() {
        println!("No persisted MCP servers found to start.");
        return Ok(());
    }

    println!("Found {} MCP servers to start", servers.len());

    // Start each server using the new MCP bridge
    for (server_name, config) in servers {
        let app_clone = app.clone();

        tauri::async_runtime::spawn(async move {
            match crate::mcp_bridge::start_persistent_mcp_server(
                app_clone,
                server_name.clone(),
                config.command,
                config.args,
                Some(config.env)
            ).await {
                Ok(_) => println!("MCP server '{}' started successfully", server_name),
                Err(e) => eprintln!("Failed to start MCP server '{}': {}", server_name, e),
            }
        });
    }

    println!("All MCP servers have been queued for startup.");
    Ok(())
}
