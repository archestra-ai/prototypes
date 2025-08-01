use std::path::PathBuf;
use std::sync::Arc;

use rstest::*;
use sea_orm::{Database, DatabaseConnection};
use sea_orm_migration::MigratorTrait;

use crate::database::migration::Migrator;
use crate::sandbox;

/// Creates an in-memory SQLite database with migrations applied
#[fixture]
pub async fn database() -> Arc<DatabaseConnection> {
    // Test SeaORM with in-memory SQLite as recommended in the docs
    let db = Database::connect("sqlite::memory:")
        .await
        .expect("Failed to create in-memory database");

    // Run migrations on in-memory database
    Migrator::up(&db, None)
        .await
        .expect("Failed to run migrations");

    Arc::new(db)
}

#[fixture]
pub fn app_data_dir() -> PathBuf {
    PathBuf::from("/tmp/archestra-test")
}

#[fixture]
pub async fn mcp_server_sandbox_service(
    app_data_dir: PathBuf,
    #[future] database: Arc<DatabaseConnection>,
) -> sandbox::MCPServerManager {
    sandbox::MCPServerManager::new(app_data_dir, database.await)
}
