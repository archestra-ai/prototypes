use sea_orm::entity::prelude::*;
use sea_orm::{Set, DeleteResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub mod oauth;
pub mod sandbox;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "mcp_servers")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique)]
    pub name: String,
    pub command: String,
    pub args: String, // JSON string containing Vec<String>
    pub env: String, // JSON string containing HashMap<String, String>
    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerDefinition {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
}

impl Model {
    /// Save an MCP server definition to the database
    pub async fn save_server(
        db: &DatabaseConnection,
        definition: &McpServerDefinition,
    ) -> Result<Model, DbErr> {
        let args_json = serde_json::to_string(&definition.args)
            .map_err(|e| DbErr::Custom(format!("Failed to serialize args: {}", e)))?;
        
        let env_json = serde_json::to_string(&definition.env)
            .map_err(|e| DbErr::Custom(format!("Failed to serialize env: {}", e)))?;

        let active_model = ActiveModel {
            name: Set(definition.name.clone()),
            command: Set(definition.command.clone()),
            args: Set(args_json),
            env: Set(env_json),
            created_at: Set(chrono::Utc::now()),
            ..Default::default()
        };

        // Use on_conflict to handle upsert by name
        let result = Entity::insert(active_model)
            .on_conflict(
                sea_orm::sea_query::OnConflict::column(Column::Name)
                    .update_columns([
                        Column::Command,
                        Column::Args,
                        Column::Env,
                    ])
                    .to_owned(),
            )
            .exec_with_returning(db)
            .await?;

        Ok(result)
    }

    /// Load all MCP servers from the database
    pub async fn load_all_servers(
        db: &DatabaseConnection,
    ) -> Result<HashMap<String, McpServerDefinition>, DbErr> {
        let models = Entity::find().all(db).await?;
        let mut servers = HashMap::new();

        for model in models {
            let args: Vec<String> = serde_json::from_str(&model.args)
                .map_err(|e| DbErr::Custom(format!("Failed to parse args for {}: {}", model.name, e)))?;
            
            let env: HashMap<String, String> = serde_json::from_str(&model.env)
                .map_err(|e| DbErr::Custom(format!("Failed to parse env for {}: {}", model.name, e)))?;

            let definition = McpServerDefinition {
                name: model.name.clone(),
                command: model.command,
                args,
                env,
            };

            servers.insert(model.name, definition);
        }

        Ok(servers)
    }

    /// Delete an MCP server by name
    pub async fn delete_by_name(db: &DatabaseConnection, server_name: &str) -> Result<DeleteResult, DbErr> {
        Entity::delete_many()
            .filter(Column::Name.eq(server_name))
            .exec(db)
            .await
    }

    /// Find an MCP server by name
    pub async fn find_by_name(
        db: &DatabaseConnection,
        server_name: &str,
    ) -> Result<Option<McpServerDefinition>, DbErr> {
        let model = Entity::find()
            .filter(Column::Name.eq(server_name))
            .one(db)
            .await?;

        if let Some(model) = model {
            let args: Vec<String> = serde_json::from_str(&model.args)
                .map_err(|e| DbErr::Custom(format!("Failed to parse args: {}", e)))?;
            
            let env: HashMap<String, String> = serde_json::from_str(&model.env)
                .map_err(|e| DbErr::Custom(format!("Failed to parse env: {}", e)))?;

            Ok(Some(McpServerDefinition {
                name: model.name,
                command: model.command,
                args,
                env,
            }))
        } else {
            Ok(None)
        }
    }

    /// Convert a Model to McpServerDefinition
    pub fn to_definition(self) -> Result<McpServerDefinition, String> {
        let args: Vec<String> = serde_json::from_str(&self.args)
            .map_err(|e| format!("Failed to parse args: {}", e))?;
        
        let env: HashMap<String, String> = serde_json::from_str(&self.env)
            .map_err(|e| format!("Failed to parse env: {}", e))?;

        Ok(McpServerDefinition {
            name: self.name,
            command: self.command,
            args,
            env,
        })
    }
}

impl From<McpServerDefinition> for ActiveModel {
    fn from(definition: McpServerDefinition) -> Self {
        ActiveModel {
            name: Set(definition.name),
            command: Set(definition.command),
            args: Set(serde_json::to_string(&definition.args).unwrap_or_default()),
            env: Set(serde_json::to_string(&definition.env).unwrap_or_default()),
            created_at: Set(chrono::Utc::now()),
            ..Default::default()
        }
    }
}

// Tauri commands for MCP server management
#[tauri::command]
pub async fn save_mcp_server(app: tauri::AppHandle, name: String, command: String, args: Vec<String>, env: std::collections::HashMap<String, String>) -> Result<(), String> {
    use crate::database::connection::get_database_connection_with_app;
    
    let db = get_database_connection_with_app(&app).await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let definition = McpServerDefinition {
        name: name.clone(),
        command: command.clone(),
        args: args.clone(),
        env: env.clone(),
    };

    Model::save_server(&db, &definition).await
        .map_err(|e| format!("Failed to save MCP server: {}", e))?;

    // Check if Ollama is running and if so, start the MCP server immediately
    if crate::ollama::get_ollama_port().is_ok() {
        println!("Ollama is running, starting MCP server '{}' immediately", name);
        
        // Start the server in the background
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            match crate::mcp_bridge::start_persistent_mcp_server(
                app_clone,
                name.clone(),
                command,
                args,
                Some(env)
            ).await {
                Ok(_) => println!("✅ MCP server '{}' started successfully", name),
                Err(e) => eprintln!("❌ Failed to start MCP server '{}': {}", name, e),
            }
        });
    } else {
        println!("Ollama is not running, MCP server '{}' will start when Ollama starts", name);
    }

    Ok(())
}

#[tauri::command]
pub async fn load_mcp_servers(app: tauri::AppHandle) -> Result<std::collections::HashMap<String, McpServerDefinition>, String> {
    use crate::database::connection::get_database_connection_with_app;
    
    let db = get_database_connection_with_app(&app).await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    Model::load_all_servers(&db).await
        .map_err(|e| format!("Failed to load MCP servers: {}", e))
}

#[tauri::command]
pub async fn delete_mcp_server(app: tauri::AppHandle, name: String) -> Result<(), String> {
    use crate::database::connection::get_database_connection_with_app;
    
    let db = get_database_connection_with_app(&app).await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    Model::delete_by_name(&db, &name).await
        .map_err(|e| format!("Failed to delete MCP server: {}", e))?;

    Ok(())
}

pub async fn start_all_mcp_servers(app: tauri::AppHandle) -> Result<(), String> {
    use crate::database::connection::get_database_connection_with_app;
    
    println!("Starting all persisted MCP servers...");

    let db = get_database_connection_with_app(&app).await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let servers = Model::load_all_servers(&db).await
        .map_err(|e| format!("Failed to load MCP servers: {}", e))?;

    if servers.is_empty() {
        println!("No persisted MCP servers found to start.");
        return Ok(());
    }

    println!("Found {} MCP servers to start", servers.len());

    // Start each server using the new MCP bridge with staggered startup
    let mut server_count = 0;
    for (server_name, config) in servers {
        let app_clone = app.clone();
        let startup_delay = server_count * 2000; // 2 second delay between each server
        server_count += 1;

        tauri::async_runtime::spawn(async move {
            if startup_delay > 0 {
                println!("⏳ Waiting {}ms before starting MCP server '{}'", startup_delay, server_name);
                tokio::time::sleep(tokio::time::Duration::from_millis(startup_delay)).await;
            }
            
            println!("🚀 Starting MCP server '{}' (server #{} of total)", server_name, server_count);
            match crate::mcp_bridge::start_persistent_mcp_server(
                app_clone,
                server_name.clone(),
                config.command,
                config.args,
                Some(config.env)
            ).await {
                Ok(_) => println!("✅ MCP server '{}' started successfully", server_name),
                Err(e) => eprintln!("❌ Failed to start MCP server '{}': {}", server_name, e),
            }
        });
    }

    println!("All MCP servers have been queued for startup.");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    // Tests use in-memory database instead of mocks

    #[tokio::test]
    async fn test_save_server() {
        // Use in-memory database for testing
        let db = sea_orm::Database::connect("sqlite::memory:").await.unwrap();
        
        // Run migrations
        use crate::database::migration::Migrator;
        use sea_orm_migration::MigratorTrait;
        Migrator::up(&db, None).await.unwrap();

        let definition = McpServerDefinition {
            name: "test_server".to_string(),
            command: "echo".to_string(),
            args: vec!["hello".to_string()],
            env: HashMap::new(),
        };

        let result = Model::save_server(&db, &definition).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_to_definition() {
        let model = Model {
            id: 1,
            name: "test_server".to_string(),
            command: "echo".to_string(),
            args: r#"["hello"]"#.to_string(),
            env: r#"{}"#.to_string(),
            created_at: chrono::Utc::now(),
        };

        let definition = model.to_definition().unwrap();
        assert_eq!(definition.name, "test_server");
        assert_eq!(definition.command, "echo");
        assert_eq!(definition.args, vec!["hello"]);
        assert!(definition.env.is_empty());
    }
}