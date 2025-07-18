use rusqlite::{Connection, Result};
use std::path::Path;
use tauri::Manager;

pub fn get_database_connection() -> Result<Connection> {
    let db_path = Path::new("mcp_servers.db");
    let conn = Connection::open(db_path)?;
    Ok(conn)
}

pub fn get_database_connection_with_app(app: &tauri::AppHandle) -> Result<Connection> {
    let data_dir = app.path()
        .app_data_dir()
        .map_err(|e| rusqlite::Error::InvalidPath(e.to_string().into()))?;

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| rusqlite::Error::InvalidPath(e.to_string().into()))?;

    let db_path = data_dir.join("mcp_servers.db");
    let conn = Connection::open(db_path)?;
    Ok(conn)
}

pub fn init_database(app: tauri::AppHandle) -> Result<(), String> {
    println!("Initializing database...");

    let conn = get_database_connection_with_app(&app)
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS mcp_servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            command TEXT NOT NULL,
            args TEXT NOT NULL,
            env TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    ).map_err(|e| format!("Failed to create table: {}", e))?;

    // Migration: Add env column if it doesn't exist (for existing databases)
    // Check if the column exists first
    let mut has_env_column = false;
    let mut stmt = conn.prepare("PRAGMA table_info(mcp_servers)").map_err(|e| format!("Failed to check table info: {}", e))?;
    let rows = stmt.query_map([], |row| {
        let column_name: String = row.get(1)?;
        Ok(column_name)
    }).map_err(|e| format!("Failed to query table info: {}", e))?;

    for row in rows {
        if let Ok(column_name) = row {
            if column_name == "env" {
                has_env_column = true;
                break;
            }
        }
    }

    // Only add the column if it doesn't exist
    if !has_env_column {
        conn.execute(
            "ALTER TABLE mcp_servers ADD COLUMN env TEXT DEFAULT '{}'",
            [],
        ).map_err(|e| format!("Failed to add env column: {}", e))?;
        println!("Added env column to existing database");
    }

    println!("Database initialized successfully");

    Ok(())
}
