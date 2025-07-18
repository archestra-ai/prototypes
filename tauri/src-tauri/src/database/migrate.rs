use rusqlite_migration::{Migrations, M};
use super::connection::{get_database_connection_with_app, get_database_path};

// Define migrations using the correct syntax from the documentation
const MIGRATIONS_SLICE: &[M<'_>] = &[
    // Migration 1: Create mcp_servers table
    M::up("CREATE TABLE IF NOT EXISTS mcp_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        command TEXT NOT NULL,
        args TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )"),

    // Migration 2: Create client_connections table
    M::up("CREATE TABLE IF NOT EXISTS client_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_name TEXT UNIQUE NOT NULL,
        is_connected BOOLEAN NOT NULL DEFAULT 0,
        last_connected DATETIME,
        config_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )"),

    // Migration 3: Add env column to mcp_servers table
    M::up("ALTER TABLE mcp_servers ADD COLUMN env TEXT DEFAULT '{}'")
];

const MIGRATIONS: Migrations<'_> = Migrations::from_slice(MIGRATIONS_SLICE);

pub fn init_database(app: tauri::AppHandle) -> Result<(), String> {
    println!("🏁 Initializing database...");

    let db_path = get_database_path(&app)?;
    println!("🗄️  Database path: {}", db_path.display());

    let mut conn = get_database_connection_with_app(&app)
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    // Check current migration version
    let current_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap_or(0);
    println!("📊 Current database version: {}", current_version);
    println!("🎯 Target database version: {}", MIGRATIONS_SLICE.len());

    // Run migrations
    MIGRATIONS.to_latest(&mut conn)
        .map_err(|e| format!("Failed to run database migrations: {}", e))?;

    let final_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap_or(0);
    println!("✅ Database initialized successfully. Final version: {}", final_version);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn migrations_test() {
        // Validate that migrations are syntactically correct
        assert!(MIGRATIONS.validate().is_ok());
    }

    #[test]
    fn test_migrations_apply() {
        // Test that migrations can be applied to an in-memory database
        let mut conn = Connection::open_in_memory().unwrap();
        
        // Apply migrations
        MIGRATIONS.to_latest(&mut conn).unwrap();

        // Verify tables were created by checking schema
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").unwrap();
        let table_names: Vec<String> = stmt.query_map([], |row| {
            Ok(row.get::<_, String>(0)?)
        }).unwrap().map(|r| r.unwrap()).collect();

        assert!(table_names.contains(&"mcp_servers".to_string()));
        assert!(table_names.contains(&"client_connections".to_string()));

        // Test that we can insert into the tables (basic structure validation)
        conn.execute(
            "INSERT INTO mcp_servers (name, command, args) VALUES ('test', 'echo', '[]')",
            []
        ).unwrap();

        conn.execute(
            "INSERT INTO client_connections (client_name, is_connected) VALUES ('test_client', 0)",
            []
        ).unwrap();

        // Verify data can be read back
        let count: i32 = conn.query_row("SELECT COUNT(*) FROM mcp_servers", [], |row| {
            row.get(0)
        }).unwrap();
        assert_eq!(count, 1);

        let count: i32 = conn.query_row("SELECT COUNT(*) FROM client_connections", [], |row| {
            row.get(0)
        }).unwrap();
        assert_eq!(count, 1);
    }
}
