use sea_orm::entity::prelude::*;
use sea_orm::{DeleteResult, Set};
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
    pub server_config: String, // JSON string containing ServerConfig
    pub meta: Option<String>, // JSON string containing additional metadata
    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub transport: String, // "stdio" or "http"
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerDefinition {
    pub name: String,
    pub server_config: ServerConfig,
    pub meta: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorCatalogEntry {
    pub id: String,
    pub title: String,
    pub description: String,
    pub image: Option<String>,
    pub category: String,
    pub tags: Vec<String>,
    pub author: String,
    pub version: String,
    pub homepage: String,
    pub repository: String,
    pub server_config: ServerConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorCatalog {
    pub connectors: Vec<ConnectorCatalogEntry>,
}

impl Model {
    /// Save an MCP server definition to the database (without starting it)
    pub async fn save_server_without_lifecycle(
        db: &DatabaseConnection,
        definition: &McpServerDefinition,
    ) -> Result<Model, DbErr> {
        let server_config_json = serde_json::to_string(&definition.server_config)
            .map_err(|e| DbErr::Custom(format!("Failed to serialize server_config: {}", e)))?;

        let meta_json = if let Some(meta) = &definition.meta {
            Some(serde_json::to_string(meta)
                .map_err(|e| DbErr::Custom(format!("Failed to serialize meta: {}", e)))?)
        } else {
            None
        };

        let active_model = ActiveModel {
            name: Set(definition.name.clone()),
            server_config: Set(server_config_json),
            meta: Set(meta_json),
            created_at: Set(chrono::Utc::now()),
            ..Default::default()
        };

        // Use on_conflict to handle upsert by name
        Entity::insert(active_model)
            .on_conflict(
                sea_orm::sea_query::OnConflict::column(Column::Name)
                    .update_columns([Column::ServerConfig, Column::Meta])
                    .to_owned(),
            )
            .exec_with_returning(db)
            .await
    }

    /// Save an MCP server definition to the database and start it
    pub async fn save_server(
        db: &DatabaseConnection,
        app_handle: &tauri::AppHandle,
        definition: &McpServerDefinition,
    ) -> Result<Model, DbErr> {
        // Check if server exists to determine if this is an update
        let existing_server = Self::find_by_name(db, &definition.name).await?;
        let is_update = existing_server.is_some();
        
        // If updating, stop the existing server first
        if is_update {
            if let Err(e) = sandbox::stop_mcp_server(app_handle, &definition.name).await {
                eprintln!("Warning: Failed to stop server before update: {}", e);
            }
        }
        
        // Save to database
        let result = Self::save_server_without_lifecycle(db, definition).await?;

        // Start the server after saving
        if let Err(e) = sandbox::start_mcp_server(app_handle, definition).await {
            eprintln!("Warning: Failed to start server after save: {}", e);
            // Don't fail the save operation, but log the error
        }

        Ok(result)
    }

    /// Load all MCP servers from the database
    pub async fn load_all_servers(
        db: &DatabaseConnection,
    ) -> Result<HashMap<String, McpServerDefinition>, DbErr> {
        let models = Entity::find().all(db).await?;
        let mut servers = HashMap::new();

        for model in models {
            let server_config: ServerConfig =
                serde_json::from_str(&model.server_config).map_err(|e| {
                    DbErr::Custom(format!(
                        "Failed to parse server_config for {}: {}",
                        model.name, e
                    ))
                })?;

            let meta = if let Some(meta_json) = &model.meta {
                Some(serde_json::from_str(meta_json).map_err(|e| {
                    DbErr::Custom(format!(
                        "Failed to parse meta for {}: {}",
                        model.name, e
                    ))
                })?)
            } else {
                None
            };

            let definition = McpServerDefinition {
                name: model.name.clone(),
                server_config,
                meta,
            };

            servers.insert(model.name, definition);
        }

        Ok(servers)
    }

    /// Delete an MCP server by name and stop it
    pub async fn delete_by_name(
        db: &DatabaseConnection,
        app_handle: &tauri::AppHandle,
        server_name: &str,
    ) -> Result<DeleteResult, DbErr> {
        // Stop the server before deleting
        if let Err(e) = sandbox::stop_mcp_server(app_handle, server_name).await {
            eprintln!("Warning: Failed to stop server before deletion: {}", e);
        }
        
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
            let server_config: ServerConfig = serde_json::from_str(&model.server_config)
                .map_err(|e| DbErr::Custom(format!("Failed to parse server_config: {}", e)))?;

            let meta = if let Some(meta_json) = &model.meta {
                Some(serde_json::from_str(meta_json)
                    .map_err(|e| DbErr::Custom(format!("Failed to parse meta: {}", e)))?)
            } else {
                None
            };

            Ok(Some(McpServerDefinition {
                name: model.name,
                server_config,
                meta,
            }))
        } else {
            Ok(None)
        }
    }

    /// Convert a Model to McpServerDefinition
    pub fn to_definition(self) -> Result<McpServerDefinition, String> {
        let server_config: ServerConfig = serde_json::from_str(&self.server_config)
            .map_err(|e| format!("Failed to parse server_config: {}", e))?;

        let meta = if let Some(meta_json) = &self.meta {
            Some(serde_json::from_str(meta_json)
                .map_err(|e| format!("Failed to parse meta: {}", e))?)
        } else {
            None
        };

        Ok(McpServerDefinition {
            name: self.name,
            server_config,
            meta,
        })
    }
}

impl From<McpServerDefinition> for ActiveModel {
    fn from(definition: McpServerDefinition) -> Self {
        let meta_json = definition.meta.map(|meta| 
            serde_json::to_string(&meta).unwrap_or_default()
        );
        
        ActiveModel {
            name: Set(definition.name),
            server_config: Set(serde_json::to_string(&definition.server_config).unwrap_or_default()),
            meta: Set(meta_json),
            created_at: Set(chrono::Utc::now()),
            ..Default::default()
        }
    }
}

// Tauri commands for MCP server management
#[tauri::command]
pub async fn save_mcp_server(
    app: tauri::AppHandle,
    name: String,
    command: String,
    args: Vec<String>,
    env: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    use crate::database::connection::get_database_connection_with_app;

    let db = get_database_connection_with_app(&app)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let server_config = ServerConfig {
        transport: "stdio".to_string(),
        command,
        args,
        env,
    };

    let definition = McpServerDefinition {
        name,
        server_config,
        meta: None,
    };

    Model::save_server(&db, &app, &definition)
        .await
        .map_err(|e| format!("Failed to save MCP server: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn save_mcp_server_from_catalog(
    app: tauri::AppHandle,
    connector_id: String,
) -> Result<(), String> {
    use crate::database::connection::get_database_connection_with_app;

    // Load the catalog
    let catalog = get_mcp_connector_catalog().await?;

    // Find the connector by ID
    let connector = catalog
        .connectors
        .iter()
        .find(|c| c.id == connector_id)
        .ok_or_else(|| format!("Connector with ID '{}' not found in catalog", connector_id))?;

    let db = get_database_connection_with_app(&app)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let definition = McpServerDefinition {
        name: connector.title.clone(),
        server_config: connector.server_config.clone(),
        meta: None,
    };

    Model::save_server(&db, &app, &definition)
        .await
        .map_err(|e| format!("Failed to save MCP server: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn load_mcp_servers(
    app: tauri::AppHandle,
) -> Result<std::collections::HashMap<String, McpServerDefinition>, String> {
    use crate::database::connection::get_database_connection_with_app;

    let db = get_database_connection_with_app(&app)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    Model::load_all_servers(&db)
        .await
        .map_err(|e| format!("Failed to load MCP servers: {}", e))
}

#[tauri::command]
pub async fn delete_mcp_server(app: tauri::AppHandle, name: String) -> Result<(), String> {
    use crate::database::connection::get_database_connection_with_app;

    let db = get_database_connection_with_app(&app)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    Model::delete_by_name(&db, &app, &name)
        .await
        .map_err(|e| format!("Failed to delete MCP server: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_mcp_connector_catalog() -> Result<ConnectorCatalog, String> {
    let catalog_json = include_str!("catalog.json");
    serde_json::from_str(catalog_json).map_err(|e| format!("Failed to parse catalog: {}", e))
}

pub async fn start_all_mcp_servers(app: tauri::AppHandle) -> Result<(), String> {
    use crate::database::connection::get_database_connection_with_app;

    println!("Starting all persisted MCP servers...");

    let db = get_database_connection_with_app(&app)
        .await
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    let servers = Model::load_all_servers(&db)
        .await
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
                println!(
                    "⏳ Waiting {}ms before starting MCP server '{}'",
                    startup_delay, server_name
                );
                tokio::time::sleep(tokio::time::Duration::from_millis(startup_delay)).await;
            }

            println!(
                "🚀 Starting MCP server '{}' (server #{} of total)",
                server_name, server_count
            );
            match sandbox::start_mcp_server(&app_clone, &config).await {
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

        let server_config = ServerConfig {
            transport: "stdio".to_string(),
            command: "echo".to_string(),
            args: vec!["hello".to_string()],
            env: HashMap::new(),
        };

        let definition = McpServerDefinition {
            name: "test_server".to_string(),
            server_config,
            meta: None,
        };

        let result = Model::save_server_without_lifecycle(&db, &definition).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_to_definition() {
        let server_config_json =
            r#"{"transport":"stdio","command":"echo","args":["hello"],"env":{}}"#;
        let model = Model {
            id: 1,
            name: "test_server".to_string(),
            server_config: server_config_json.to_string(),
            meta: None,
            created_at: chrono::Utc::now(),
        };

        let definition = model.to_definition().unwrap();
        assert_eq!(definition.name, "test_server");
        assert_eq!(definition.server_config.command, "echo");
        assert_eq!(definition.server_config.args, vec!["hello"]);
        assert!(definition.server_config.env.is_empty());
    }
}
