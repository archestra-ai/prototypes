use crate::database::migration::Migrator;
use sea_orm::{ConnectOptions, Database, DatabaseConnection, DbErr};
use sea_orm_migration::MigratorTrait;
use std::path::PathBuf;
use tauri::Manager;

pub mod migration;

pub fn get_database_path(app: &tauri::AppHandle) -> std::result::Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?;

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data directory: {e}"))?;

    Ok(data_dir.join("archestra.db"))
}

pub async fn get_database_connection(
    app: &tauri::AppHandle,
) -> Result<DatabaseConnection, DbErr> {
    let db_path = get_database_path(app)
        .map_err(|e| DbErr::Custom(format!("Failed to get database path: {e}")))?;

    let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

    // Disable SQLx logging - https://www.sea-ql.org/SeaORM/docs/next/install-and-config/debug-log/#sqlx-logging
    let mut opt = ConnectOptions::new(db_url);
    opt.sqlx_logging(false);

    Database::connect(opt).await
}

/// Initialize the database (for use in app setup)
pub async fn init_database(app: &tauri::AppHandle) -> Result<DatabaseConnection, String> {
    debug!("🏁 Initializing database...");

    let db = get_database_connection(app)
        .await
        .map_err(|e| format!("Failed to initialize database: {e}"))?;

    // Run migrations
    debug!("📊 Running database migrations...");
    Migrator::up(&db, None)
        .await
        .map_err(|e| format!("Failed to run migrations: {e}"))?;

    debug!("✅ Database connection established and migrations completed");

    Ok(db)
}
