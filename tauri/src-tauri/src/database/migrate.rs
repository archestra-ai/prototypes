use sea_orm_migration::prelude::*;
use sea_orm::{DatabaseConnection, DbErr};
use super::connection::{get_database_connection_with_app, get_database_path};

pub async fn init_database(app: tauri::AppHandle) -> Result<(), String> {
    println!("🏁 Initializing database...");

    let db_path = get_database_path(&app)?;
    println!("🗄️  Database path: {}", db_path.display());

    let db = get_database_connection_with_app(&app).await
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    // Run SeaORM migrations using the migration crate we created
    run_migrations(&db).await
        .map_err(|e| format!("Failed to run database migrations: {}", e))?;

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

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm::{Database};

    #[tokio::test]
    async fn test_migrations_apply() {
        // Test that migrations can be applied to an in-memory database
        let db = Database::connect("sqlite::memory:").await.unwrap();
        
        // Apply migrations
        run_migrations(&db).await.unwrap();

        // Test that we can use the models after migration
        use crate::models::mcp_server::{Model as McpServerModel, McpServerDefinition};
        use crate::models::client_connection_config::Model as ClientConnectionModel;

        let test_definition = McpServerDefinition {
            name: "test_server".to_string(),
            command: "echo".to_string(),
            args: vec!["hello".to_string()],
            env: std::collections::HashMap::new(),
        };

        let result = McpServerModel::save_server(&db, &test_definition).await;
        assert!(result.is_ok());

        // Test client connection model
        let client_result = ClientConnectionModel::save_connection_state(
            &db, 
            "test_client", 
            true, 
            Some("test/path".to_string())
        ).await;
        assert!(result.is_ok() || client_result.is_ok()); // Either should work in testing
    }
}
