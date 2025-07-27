use crate::database::migration::Migrator;
use sea_orm::{Database, DatabaseConnection, DbErr};
use sea_orm_migration::MigratorTrait;
use std::path::PathBuf;
use tauri::Manager;

pub fn get_database_path(app: &tauri::AppHandle) -> std::result::Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?;

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data directory: {e}"))?;

    Ok(data_dir.join("archestra.db"))
}

pub async fn get_database_connection_with_app(
    app: &tauri::AppHandle,
) -> Result<DatabaseConnection, DbErr> {
    let db_path = get_database_path(app)
        .map_err(|e| DbErr::Custom(format!("Failed to get database path: {e}")))?;

    let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());
    Database::connect(&db_url).await
}

/// Initialize and get a SeaORM database connection with migrations
pub async fn get_database_connection(app: &tauri::AppHandle) -> Result<DatabaseConnection, String> {
    let db_path = get_database_path(app)?;
    let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

    println!("🗄️  Connecting to database: {db_url}");

    let db = Database::connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to database: {e}"))?;

    // Run migrations
    println!("📊 Running database migrations...");
    Migrator::up(&db, None)
        .await
        .map_err(|e| format!("Failed to run migrations: {e}"))?;

    println!("✅ Database connection established and migrations completed");

    Ok(db)
}

/// Initialize the database (for use in app setup)
pub async fn init_database(app: &tauri::AppHandle) -> Result<DatabaseConnection, String> {
    println!("🏁 Initializing SeaORM database...");

    let db = get_database_connection(app).await?;

    println!("✅ SeaORM database initialized successfully");

    Ok(db)
}
