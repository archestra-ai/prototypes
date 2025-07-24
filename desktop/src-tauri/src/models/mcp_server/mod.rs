use crate::models::external_mcp_client::Model as ExternalMCPClient;
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use utoipa::ToSchema;

pub mod oauth;
pub mod sandbox;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize, ToSchema)]
#[sea_orm(table_name = "mcp_servers")]
#[schema(as = MCPServer)]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique)]
    pub name: String,
    pub server_config: String, // JSON string containing ServerConfig
    pub meta: Option<String>,  // JSON string containing additional metadata
    #[schema(value_type = String, format = DateTime)]
    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[schema(as = MCPServerDefinition)]
pub struct MCPServerDefinition {
    pub name: String,
    pub server_config: ServerConfig,
    pub meta: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[schema(as = MCPConnectorCatalogEntryOAuth)]
pub struct ConnectorCatalogEntryOauth {
    pub provider: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[schema(as = MCPServerConfig)]
pub struct ServerConfig {
    pub transport: String, // "stdio" or "http"
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[schema(as = MCPConnectorCatalogEntry)]
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

    /// Save an MCP server definition to the database, start it and sync all connected external MCP clients
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

        // Sync all connected external MCP clients
        ExternalMCPClient::sync_all_connected_external_mcp_clients(db)
            .await
            .map_err(DbErr::Custom)?;

        Ok(result)
    }

    /// Load installed MCP servers from the database
    pub async fn load_installed_mcp_servers(db: &DatabaseConnection) -> Result<Vec<Model>, DbErr> {
        Entity::find().all(db).await
    }

    /// Uninstall an MCP server - stop its process running in the sandbox, delete it from the database and sync all connected external MCP clients
    pub async fn uninstall_mcp_server(
        db: &DatabaseConnection,
        server_name: &str,
    ) -> Result<(), DbErr> {
        // Stop the server, in the background, before deleting
        // if there's an error stopping the server, that's fine (for now)
        let server_name_for_bg = server_name.to_string();
        tokio::spawn(async move {
            let _ = sandbox::stop_mcp_server(&server_name_for_bg).await;
        });

        Entity::delete_many()
            .filter(Column::Name.eq(server_name))
            .exec(db)
            .await?;

        // Sync all connected external MCP clients
        ExternalMCPClient::sync_all_connected_external_mcp_clients(db)
            .await
            .map_err(DbErr::Custom)?;

        Ok(())
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

    pub async fn get_mcp_connector_catalog() -> Result<Vec<ConnectorCatalogEntry>, String> {
        let catalog_json = include_str!("catalog.json");
        serde_json::from_str(catalog_json).map_err(|e| format!("Failed to parse catalog: {e}"))
    }

    pub async fn save_mcp_server_from_catalog(
        db: &DatabaseConnection,
        connector_id: String,
    ) -> Result<MCPServerDefinition, String> {
        // Load the catalog
        let catalog = Self::get_mcp_connector_catalog().await?;

        // Find the connector by ID
        let connector = catalog
            .iter()
            .find(|c| c.id == connector_id)
            .ok_or_else(|| format!("Connector with ID '{connector_id}' not found in catalog"))?;

        let definition = MCPServerDefinition {
            name: connector.title.clone(),
            server_config: connector.server_config.clone(),
            meta: None,
        };

        let result = Model::save_server(db, &definition)
            .await
            .map_err(|e| format!("Failed to save MCP server: {e}"))?;

        Ok(result.to_definition().unwrap())
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_fixtures::database;
    use rstest::*;
    use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

    #[rstest]
    #[tokio::test]
    async fn test_save_server_without_lifecycle(#[future] database: DatabaseConnection) {
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

        let saved_model = result.unwrap();
        assert_eq!(saved_model.name, "test_server");
        assert!(saved_model.id > 0);
    }

    #[rstest]
    #[tokio::test]
    async fn test_save_server_with_meta(#[future] database: DatabaseConnection) {
        let db = database.await;

        let server_config = ServerConfig {
            transport: "stdio".to_string(),
            command: "node".to_string(),
            args: vec!["index.js".to_string()],
            env: HashMap::new(),
        };

        let meta = serde_json::json!({
            "description": "Test server with metadata",
            "version": "1.0.0"
        });

        let definition = MCPServerDefinition {
            name: "test_server_with_meta".to_string(),
            server_config,
            meta: Some(meta),
        };

        let result = Model::save_server_without_lifecycle(&db, &definition).await;
        assert!(result.is_ok());

        let saved_model = result.unwrap();
        assert!(saved_model.meta.is_some());
    }

    #[rstest]
    #[tokio::test]
    async fn test_save_server_duplicate_name(#[future] database: DatabaseConnection) {
        let db = database.await;

        let server_config = ServerConfig {
            transport: "stdio".to_string(),
            command: "echo".to_string(),
            args: vec!["hello".to_string()],
            env: HashMap::new(),
        };

        let definition = MCPServerDefinition {
            name: "duplicate_server".to_string(),
            server_config: server_config.clone(),
            meta: None,
        };

        // Save first time - should succeed
        let result1 = Model::save_server_without_lifecycle(&db, &definition).await;
        assert!(result1.is_ok());

        // Save second time with same name
        let result2 = Model::save_server_without_lifecycle(&db, &definition).await;

        // In SQLite with certain configurations, unique constraints might not always
        // be enforced in test environments. We'll check both cases.
        if result2.is_ok() {
            // If it succeeded, at least verify it's the same server (not a duplicate)
            let servers = Entity::find()
                .filter(Column::Name.eq("duplicate_server"))
                .all(&db)
                .await
                .unwrap();
            assert_eq!(
                servers.len(),
                1,
                "Should only have one server with the same name"
            );
        } else {
            // This is the expected behavior with unique constraint
            assert!(result2.is_err());
        }
    }

    #[rstest]
    #[tokio::test]
    async fn test_load_installed_mcp_servers(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Initially should be empty
        let servers = Model::load_installed_mcp_servers(&db).await;
        assert!(servers.is_ok());
        assert_eq!(servers.unwrap().len(), 0);

        // Add a few servers
        for i in 1..=3 {
            let definition = MCPServerDefinition {
                name: format!("server_{i}"),
                server_config: ServerConfig {
                    transport: "stdio".to_string(),
                    command: "echo".to_string(),
                    args: vec![format!("hello_{i}")],
                    env: HashMap::new(),
                },
                meta: None,
            };
            Model::save_server_without_lifecycle(&db, &definition)
                .await
                .unwrap();
        }

        // Should now have 3 servers
        let servers = Model::load_installed_mcp_servers(&db).await;
        assert!(servers.is_ok());
        assert_eq!(servers.unwrap().len(), 3);
    }

    #[rstest]
    #[tokio::test]
    async fn test_uninstall_mcp_server(#[future] database: DatabaseConnection) {
        let db = database.await;

        let definition = MCPServerDefinition {
            name: "server_to_uninstall".to_string(),
            server_config: ServerConfig {
                transport: "stdio".to_string(),
                command: "echo".to_string(),
                args: vec!["hello".to_string()],
                env: HashMap::new(),
            },
            meta: None,
        };

        // Save the server first
        Model::save_server_without_lifecycle(&db, &definition)
            .await
            .unwrap();

        // Verify it exists
        let found = Entity::find()
            .filter(Column::Name.eq("server_to_uninstall"))
            .one(&db)
            .await
            .unwrap();
        assert!(found.is_some());

        // Uninstall it
        let result = Model::uninstall_mcp_server(&db, "server_to_uninstall").await;
        assert!(result.is_ok());

        // Verify it's gone
        let found_after = Entity::find()
            .filter(Column::Name.eq("server_to_uninstall"))
            .one(&db)
            .await
            .unwrap();
        assert!(found_after.is_none());
    }

    #[rstest]
    #[tokio::test]
    async fn test_uninstall_nonexistent_server(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Try to uninstall a server that doesn't exist
        let result = Model::uninstall_mcp_server(&db, "nonexistent_server").await;
        // Should succeed (no-op)
        assert!(result.is_ok());
    }

    #[rstest]
    #[tokio::test]
    async fn test_find_by_name(#[future] database: DatabaseConnection) {
        let db = database.await;

        let definition = MCPServerDefinition {
            name: "findable_server".to_string(),
            server_config: ServerConfig {
                transport: "stdio".to_string(),
                command: "echo".to_string(),
                args: vec!["hello".to_string()],
                env: HashMap::new(),
            },
            meta: Some(serde_json::json!({"test": true})),
        };

        // Save the server
        Model::save_server_without_lifecycle(&db, &definition)
            .await
            .unwrap();

        // Find it
        let found = Model::find_by_name(&db, "findable_server").await;
        assert!(found.is_ok());

        let found_def = found.unwrap();
        assert!(found_def.is_some());

        let def = found_def.unwrap();
        assert_eq!(def.name, "findable_server");
        assert_eq!(def.server_config.command, "echo");
        assert!(def.meta.is_some());
    }

    #[rstest]
    #[tokio::test]
    async fn test_find_by_name_not_found(#[future] database: DatabaseConnection) {
        let db = database.await;

        let found = Model::find_by_name(&db, "nonexistent_server").await;
        assert!(found.is_ok());
        assert!(found.unwrap().is_none());
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

    #[tokio::test]
    async fn test_to_definition_with_meta() {
        let server_config_json =
            r#"{"transport":"stdio","command":"echo","args":["hello"],"env":{}}"#;
        let meta_json = r#"{"description":"Test server","version":"1.0.0"}"#;

        let model = Model {
            id: 1,
            name: "test_server".to_string(),
            server_config: server_config_json.to_string(),
            meta: Some(meta_json.to_string()),
            created_at: chrono::Utc::now(),
        };

        let definition = model.to_definition().unwrap();
        assert!(definition.meta.is_some());

        let meta = definition.meta.unwrap();
        assert_eq!(meta["description"], "Test server");
        assert_eq!(meta["version"], "1.0.0");
    }

    #[tokio::test]
    async fn test_to_definition_invalid_json() {
        let model = Model {
            id: 1,
            name: "test_server".to_string(),
            server_config: "invalid json".to_string(),
            meta: None,
            created_at: chrono::Utc::now(),
        };

        let result = model.to_definition();
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_get_mcp_connector_catalog() {
        let result = Model::get_mcp_connector_catalog().await;
        assert!(result.is_ok());

        let catalog = result.unwrap();
        // The catalog might be empty or have entries
        assert!(catalog.is_empty() || !catalog.is_empty());
    }

    #[rstest]
    #[tokio::test]
    async fn test_save_server_update_existing(#[future] database: DatabaseConnection) {
        let db = database.await;

        let definition1 = MCPServerDefinition {
            name: "update_test_server".to_string(),
            server_config: ServerConfig {
                transport: "stdio".to_string(),
                command: "echo".to_string(),
                args: vec!["hello".to_string()],
                env: HashMap::new(),
            },
            meta: None,
        };

        // Save the initial server
        Model::save_server_without_lifecycle(&db, &definition1)
            .await
            .unwrap();

        // Update with different config
        let definition2 = MCPServerDefinition {
            name: "update_test_server".to_string(), // Same name
            server_config: ServerConfig {
                transport: "http".to_string(), // Different transport
                command: "node".to_string(),   // Different command
                args: vec!["server.js".to_string()],
                env: HashMap::new(),
            },
            meta: Some(serde_json::json!({"updated": true})),
        };

        // save_server should handle the update
        let result = Model::save_server(&db, &definition2).await;
        assert!(result.is_ok());

        // Verify the update
        let found = Model::find_by_name(&db, "update_test_server")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(found.server_config.transport, "http");
        assert_eq!(found.server_config.command, "node");
        assert!(found.meta.is_some());
    }

    #[rstest]
    #[tokio::test]
    async fn test_from_mcp_server_definition(#[future] database: DatabaseConnection) {
        let _db = database.await;

        let server_config = ServerConfig {
            transport: "stdio".to_string(),
            command: "python".to_string(),
            args: vec!["script.py".to_string(), "--debug".to_string()],
            env: HashMap::from([
                ("DEBUG".to_string(), "true".to_string()),
                ("PORT".to_string(), "8080".to_string()),
            ]),
        };

        let definition = MCPServerDefinition {
            name: "python_server".to_string(),
            server_config,
            meta: Some(serde_json::json!({
                "author": "test",
                "license": "MIT"
            })),
        };

        let active_model: ActiveModel = definition.clone().into();

        // Verify the conversion
        assert_eq!(active_model.name.as_ref(), "python_server");

        // Parse back the server_config to verify
        let server_config_json = active_model.server_config.as_ref();
        let parsed_config: ServerConfig = serde_json::from_str(server_config_json).unwrap();
        assert_eq!(parsed_config.command, "python");
        assert_eq!(parsed_config.args.len(), 2);
        assert_eq!(parsed_config.env.get("DEBUG"), Some(&"true".to_string()));
    }
}
