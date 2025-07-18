use rusqlite::{Connection, Result};
use std::path::PathBuf;
use tauri::Manager;

pub fn get_database_path(app: &tauri::AppHandle) -> std::result::Result<PathBuf, String> {
    let data_dir = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data directory: {}", e))?;

    Ok(data_dir.join("mcp_servers.db"))
}

pub fn get_database_connection_with_app(app: &tauri::AppHandle) -> Result<Connection> {
    let db_path = get_database_path(app)
        .map_err(|e| rusqlite::Error::InvalidPath(e.into()))?;

    let conn = Connection::open(&db_path)?;
    Ok(conn)
}