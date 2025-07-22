use crate::database::connection::get_database_connection_with_app;
use sea_orm::entity::prelude::*;
use sea_orm::{DeleteResult, Set};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub mod oauth;
pub mod sandbox;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub transport: String, // "stdio" or "http"
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
}

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq)]
#[sea_orm(table_name = "mcp_servers")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique)]
    pub name: String,
    pub server_config: String, // JSON string containing ServerConfig
    pub meta: Option<String>,  // JSON string containing additional metadata
    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServerDefinition {
    pub name: String,
    pub server_config: ServerConfig,
    pub meta: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorCatalogEntryOauth {
    pub provider: String,
    pub required: bool,
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
    pub oauth: Option<ConnectorCatalogEntryOauth>,
    pub server_config: ServerConfig,
}

impl Model {
    /// Save an MCP server definition to the database (without starting it)
    pub async fn save_server_without_lifecycle(
        db: &DatabaseConnection,
        definition: &MCPServerDefinition,
    ) -> Result<Model, DbErr> {
        let server_config_json = serde_json::to_string(&definition.server_config)
            .map_err(|e| DbErr::Custom(format!("Failed to serialize server_config: {e}")))?;

        let meta_json = if let Some(meta) = &definition.meta {
            Some(
                serde_json::to_string(meta)
                    .map_err(|e| DbErr::Custom(format!("Failed to serialize meta: {e}")))?,
            )
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
        definition: &MCPServerDefinition,
    ) -> Result<Model, DbErr> {
        // Check if server exists to determine if this is an update
        let existing_server = Self::find_by_name(db, &definition.name).await?;
        let is_update = existing_server.is_some();

        // If updating, stop the existing server first
        if is_update {
            if let Err(e) = sandbox::stop_mcp_server(&definition.name).await {
                eprintln!("Warning: Failed to stop server before update: {e}");
            }
        }

        // Save to database
        let result = Self::save_server_without_lifecycle(db, definition).await?;

        // Start the server after saving
        if let Err(e) = sandbox::start_mcp_server(definition).await {
            eprintln!("Warning: Failed to start server after save: {e}");
            // Don't fail the save operation, but log the error
        }

        Ok(result)
    }

    /// Load installed MCP servers from the database
    pub async fn load_installed_mcp_servers(db: &DatabaseConnection) -> Result<Vec<Model>, DbErr> {
        Entity::find().all(db).await
    }

    /// Uninstall an MCP server - stop its process running in the sandbox and delete it from the database
    pub async fn uninstall_mcp_server(
        db: &DatabaseConnection,
        server_name: &str,
    ) -> Result<DeleteResult, DbErr> {
        // Stop the server before deleting.. if there's an error stopping the server
        // that's fine, we don't want to block the uninstallation
        let _ = sandbox::stop_mcp_server(server_name).await;

        Entity::delete_many()
            .filter(Column::Name.eq(server_name))
            .exec(db)
            .await
    }

    /// Find an MCP server by name
    pub async fn find_by_name(
        db: &DatabaseConnection,
        server_name: &str,
    ) -> Result<Option<MCPServerDefinition>, DbErr> {
        let model = Entity::find()
            .filter(Column::Name.eq(server_name))
            .one(db)
            .await?;

        if let Some(model) = model {
            let server_config: ServerConfig = serde_json::from_str(&model.server_config)
                .map_err(|e| DbErr::Custom(format!("Failed to parse server_config: {e}")))?;

            let meta = if let Some(meta_json) = &model.meta {
                Some(
                    serde_json::from_str(meta_json)
                        .map_err(|e| DbErr::Custom(format!("Failed to parse meta: {e}")))?,
                )
            } else {
                None
            };

            Ok(Some(MCPServerDefinition {
                name: model.name,
                server_config,
                meta,
            }))
        } else {
            Ok(None)
        }
    }

    /// Convert a Model to MCPServerDefinition
    pub fn to_definition(self) -> Result<MCPServerDefinition, String> {
        let server_config: ServerConfig = serde_json::from_str(&self.server_config)
            .map_err(|e| format!("Failed to parse server_config: {e}"))?;

        let meta = if let Some(meta_json) = &self.meta {
            Some(
                serde_json::from_str(meta_json)
                    .map_err(|e| format!("Failed to parse meta: {e}"))?,
            )
        } else {
            None
        };

        Ok(MCPServerDefinition {
            name: self.name,
            server_config,
            meta,
        })
    }
}

impl From<MCPServerDefinition> for ActiveModel {
    fn from(definition: MCPServerDefinition) -> Self {
        let meta_json = definition
            .meta
            .map(|meta| serde_json::to_string(&meta).unwrap_or_default());

        ActiveModel {
            name: Set(definition.name),
            server_config: Set(serde_json::to_string(&definition.server_config).unwrap_or_default()),
            meta: Set(meta_json),
            created_at: Set(chrono::Utc::now()),
            ..Default::default()
        }
    }
}

#[tauri::command]
pub async fn save_mcp_server_from_catalog(
    app: tauri::AppHandle,
    connector_id: String,
) -> Result<MCPServerDefinition, String> {
    // Load the catalog
    let catalog = get_mcp_connector_catalog().await?;

    // Find the connector by ID
    let connector = catalog
        .iter()
        .find(|c| c.id == connector_id)
        .ok_or_else(|| format!("Connector with ID '{connector_id}' not found in catalog"))?;

    let db = get_database_connection_with_app(&app)
        .await
        .map_err(|e| format!("Failed to connect to database: {e}"))?;

    let definition = MCPServerDefinition {
        name: connector.title.clone(),
        server_config: connector.server_config.clone(),
        meta: None,
    };

    let result = Model::save_server(&db, &definition)
        .await
        .map_err(|e| format!("Failed to save MCP server: {e}"))?;

    Ok(result.to_definition().unwrap())
}

#[tauri::command]
pub async fn load_installed_mcp_servers(
    app: tauri::AppHandle,
) -> Result<Vec<MCPServerDefinition>, String> {
    let db = get_database_connection_with_app(&app)
        .await
        .map_err(|e| format!("Failed to connect to database: {e}"))?;

    let models = Model::load_installed_mcp_servers(&db)
        .await
        .map_err(|e| format!("Failed to load MCP servers: {e}"))?;

    let definitions = models
        .into_iter()
        .map(|m| m.to_definition().unwrap())
        .collect();

    Ok(definitions)
}

#[tauri::command]
pub async fn uninstall_mcp_server(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let db = get_database_connection_with_app(&app)
        .await
        .map_err(|e| format!("Failed to connect to database: {e}"))?;

    Model::uninstall_mcp_server(&db, &name)
        .await
        .map_err(|e| format!("Failed to uninstall MCP server: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn get_mcp_connector_catalog() -> Result<Vec<ConnectorCatalogEntry>, String> {
    let catalog_json = include_str!("catalog.json");
    serde_json::from_str(catalog_json).map_err(|e| format!("Failed to parse catalog: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_fixtures::database;
    use rstest::*;

    #[rstest]
    #[tokio::test]
    async fn test_save_server(#[future] database: DatabaseConnection) {
        let db = database.await;

        let server_config = ServerConfig {
            transport: "stdio".to_string(),
            command: "echo".to_string(),
            args: vec!["hello".to_string()],
            env: HashMap::new(),
        };

        let definition = MCPServerDefinition {
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
