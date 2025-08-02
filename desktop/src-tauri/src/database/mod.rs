use crate::database::migration::Migrator;
use sea_orm::{ConnectOptions, Database, DatabaseConnection, DbErr};
use sea_orm_migration::MigratorTrait;
use std::path::PathBuf;

pub mod migration;

pub async fn get_database_connection(
    app_data_dir: &PathBuf,
) -> Result<DatabaseConnection, DbErr> {
    let db_path = app_data_dir.join("archestra.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

    // Disable SQLx logging - https://www.sea-ql.org/SeaORM/docs/next/install-and-config/debug-log/#sqlx-logging
    let mut opt = ConnectOptions::new(db_url);
    opt.sqlx_logging(false);

    Database::connect(opt).await
}

/// Initialize the database
pub async fn init_database(app_data_dir: &PathBuf) -> Result<DatabaseConnection, String> {
    debug!("Initializing database...");

    let db = get_database_connection(app_data_dir)
        .await
        .map_err(|e| format!("Failed to initialize database: {e}"))?;

    // Run migrations
    debug!("Running database migrations...");
    Migrator::up(&db, None)
        .await
        .map_err(|e| format!("Failed to run migrations: {e}"))?;

    debug!("Database connection established and migrations completed");

    Ok(db)
}
