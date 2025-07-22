use super::connection::{get_database_connection_with_app, get_database_path};
use sea_orm::{DatabaseConnection, DbErr};
use sea_orm_migration::prelude::*;

pub async fn init_database(app: tauri::AppHandle) -> Result<(), String> {
    println!("🏁 Initializing database...");

    let db_path = get_database_path(&app)?;
    println!("🗄️  Database path: {}", db_path.display());

    let db = get_database_connection_with_app(&app)
        .await
        .map_err(|e| format!("Failed to get database connection: {e}"))?;

    // Run SeaORM migrations using the migration crate we created
    run_migrations(&db)
        .await
        .map_err(|e| format!("Failed to run database migrations: {e}"))?;

    println!("✅ Database initialized successfully with SeaORM migrations");

    Ok(())
}

async fn run_migrations(db: &DatabaseConnection) -> Result<(), DbErr> {
    use crate::database::migration::Migrator;
    use sea_orm_migration::MigratorTrait;

    // Run all migrations
    Migrator::up(db, None).await?;

    Ok(())
}
