use crate::database::migration::Migrator;
use rstest::*;
use sea_orm::{Database, DatabaseConnection};
use sea_orm_migration::MigratorTrait;

/// Creates an in-memory SQLite database with migrations applied
#[fixture]
pub async fn database() -> DatabaseConnection {
    // Test SeaORM with in-memory SQLite as recommended in the docs
    let db = Database::connect("sqlite::memory:")
        .await
        .expect("Failed to create in-memory database");

    // Run migrations on in-memory database
    Migrator::up(&db, None)
        .await
        .expect("Failed to run migrations");

    db
}
