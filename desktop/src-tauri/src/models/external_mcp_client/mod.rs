use crate::models::mcp_server::Model as MCPServer;
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use utoipa::ToSchema;

const ARCHESTRA_MCP_SERVER_KEY: &str = "archestra.ai";
const ARCHESTRA_SERVER_BASE_URL: &str = "http://localhost:54587";
const INSTALLED_MCP_SERVER_KEY_SUFFIX: &str = "(archestra.ai)";

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize, ToSchema)]
#[sea_orm(table_name = "external_mcp_clients")]
#[schema(as = ExternalMCPClient)]
pub struct Model {
    #[sea_orm(unique, primary_key)]
    pub client_name: String,
    #[schema(value_type = String, format = DateTime)]
    pub created_at: DateTimeUtc,
    #[schema(value_type = String, format = DateTime)]
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServerConfig {
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalMCPClientDefinition {
    pub client_name: String,
}

impl Model {
    const CLAUDE_DESKTOP_CLIENT_NAME: &'static str = "claude";
    const CURSOR_CLIENT_NAME: &'static str = "cursor";
    const VSCODE_CLIENT_NAME: &'static str = "vscode";

    pub const SUPPORTED_CLIENT_NAMES: [&'static str; 3] = [
        Self::CLAUDE_DESKTOP_CLIENT_NAME,
        Self::CURSOR_CLIENT_NAME,
        Self::VSCODE_CLIENT_NAME,
    ];

    /// Save the external MCP client to the database using definition
    pub async fn save_external_mcp_client(
        db: &DatabaseConnection,
        definition: &ExternalMCPClientDefinition,
    ) -> Result<Model, DbErr> {
        let now = chrono::Utc::now();

        let active_model = ActiveModel {
            client_name: Set(definition.client_name.clone()),
            created_at: Set(now),
            updated_at: Set(now),
        };

        // Use on_conflict to handle upsert by client_name
        Entity::insert(active_model)
            .on_conflict(
                sea_orm::sea_query::OnConflict::column(Column::ClientName)
                    .update_columns([Column::UpdatedAt])
                    .to_owned(),
            )
            .exec(db)
            .await?;

        // Fetch the record after insert/update
        let result = Entity::find()
            .filter(Column::ClientName.eq(&definition.client_name))
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound(
                "Failed to find inserted item".to_string(),
            ))?;

        Ok(result)
    }

    /// Delete an external MCP client from the database
    pub async fn delete_external_mcp_client(
        db: &DatabaseConnection,
        client_name: &str,
    ) -> Result<(), String> {
        Entity::delete_by_id(client_name)
            .exec(db)
            .await
            .map_err(|e| {
                let err_msg = format!("Failed to delete external MCP client: {e}");
                println!("❌ {err_msg}");
                err_msg
            })?;
        Ok(())
    }

    /// Get all connected external MCP clients
    pub async fn get_connected_external_mcp_clients(
        db: &DatabaseConnection,
    ) -> Result<Vec<Model>, DbErr> {
        let models = Entity::find().all(db).await?;

        Ok(models)
    }

    /// Get the config path for a specific client
    fn get_home_directory() -> Result<PathBuf, String> {
        #[cfg(target_os = "windows")]
        {
            std::env::var("USERPROFILE")
                .or_else(|_| {
                    std::env::var("HOMEDRIVE").and_then(|drive| {
                        std::env::var("HOMEPATH").map(|path| format!("{drive}{path}"))
                    })
                })
                .map(PathBuf::from)
                .map_err(|_| "Could not determine home directory".to_string())
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::env::var("HOME")
                .map(PathBuf::from)
                .map_err(|_| "Could not determine home directory".to_string())
        }
    }

    pub fn get_config_path_for_external_mcp_client(client_name: &str) -> Result<PathBuf, String> {
        let home_dir = Self::get_home_directory()?;

        match client_name {
            Self::CURSOR_CLIENT_NAME => Ok(home_dir.join(".cursor").join("mcp.json")),
            Self::CLAUDE_DESKTOP_CLIENT_NAME => {
                #[cfg(target_os = "macos")]
                {
                    Ok(home_dir
                        .join("Library")
                        .join("Application Support")
                        .join("Claude")
                        .join("claude_desktop_config.json"))
                }
                #[cfg(target_os = "windows")]
                {
                    Ok(home_dir
                        .join("AppData")
                        .join("Roaming")
                        .join("Claude")
                        .join("claude_desktop_config.json"))
                }
                #[cfg(target_os = "linux")]
                {
                    Ok(home_dir
                        .join(".config")
                        .join("Claude")
                        .join("claude_desktop_config.json"))
                }
            }
            Self::VSCODE_CLIENT_NAME => Ok(home_dir.join(".vscode").join("mcp.json")),
            _ => Err(format!("Unknown client: {client_name}")),
        }
    }

    pub async fn update_external_mcp_client_config(
        db: &DatabaseConnection,
        client_name: &str,
    ) -> Result<(), String> {
        let config_path = Self::get_config_path_for_external_mcp_client(client_name)?;

        println!("🔌 Connecting {client_name} client...");
        println!("📍 Config path: {}", config_path.display());

        let mut config = Self::read_config_file(&config_path)?;

        // Ensure mcpServers object exists
        if !config.is_object() {
            config = serde_json::json!({});
        }
        if config.get("mcpServers").is_none() {
            config["mcpServers"] = serde_json::json!({});
        }

        let external_client_mcp_servers_config = config["mcpServers"]
            .as_object_mut()
            .ok_or("mcpServers is not an object")?;

        // Add archestra.ai MCP server to the config
        if !external_client_mcp_servers_config.contains_key(ARCHESTRA_MCP_SERVER_KEY) {
            external_client_mcp_servers_config.insert(
                ARCHESTRA_MCP_SERVER_KEY.to_string(),
                serde_json::to_value(MCPServerConfig {
                    url: format!("{ARCHESTRA_SERVER_BASE_URL}/mcp"),
                })
                .unwrap(),
            );
        }

        // Now add each installed MCP server with archestra.ai suffix
        let installed_mcp_servers = MCPServer::load_installed_mcp_servers(db)
            .await
            .map_err(|e| e.to_string())?;
        println!("🔧 Available MCP servers: {installed_mcp_servers:?}");

        println!(
            "➕ Adding {} MCP servers to {} config",
            installed_mcp_servers.len(),
            client_name
        );
        for installed_mcp_server in &installed_mcp_servers {
            let server_name = installed_mcp_server.name.clone();
            let server_key = format!("{server_name} {INSTALLED_MCP_SERVER_KEY_SUFFIX}");
            let server_config = MCPServerConfig {
                url: format!("{ARCHESTRA_SERVER_BASE_URL}/proxy/{server_name}"),
            };

            if !external_client_mcp_servers_config.contains_key(&server_key) {
                external_client_mcp_servers_config.insert(
                    server_key.clone(),
                    serde_json::to_value(server_config).unwrap(),
                );
            }
            println!("  ✅ Added MCP server: {server_key}");
        }

        // remove all entries with that're suffixed with "(archestra.ai)" that aren't in the installed_mcp_servers list
        let installed_names: std::collections::HashSet<_> = installed_mcp_servers
            .iter()
            .map(|s| s.name.as_str())
            .collect();
        let keys_to_remove: Vec<String> = external_client_mcp_servers_config
            .keys()
            .filter_map(|key| {
                if let Some(stripped) =
                    key.strip_suffix(&format!(" {INSTALLED_MCP_SERVER_KEY_SUFFIX}"))
                {
                    if !installed_names.contains(stripped) {
                        return Some(key.clone());
                    }
                }
                None
            })
            .collect();

        for key in keys_to_remove {
            external_client_mcp_servers_config.remove(&key);
            println!("  ❌ Removed MCP server: {key}");
        }

        println!("📝 Writing config to: {}", config_path.display());
        Self::write_config_file(&config_path, &config)?;

        println!(
            "✅ Updated {} MCP config at {}",
            client_name,
            config_path.display()
        );

        Ok(())
    }

    /// Connect an external MCP client to Archestra MCP servers
    pub async fn connect_external_mcp_client(
        db: &DatabaseConnection,
        client_name: &str,
    ) -> Result<(), String> {
        // Update the externalMCP client's config with the installed Archestra MCP servers
        Self::update_external_mcp_client_config(db, client_name).await?;

        // Save external MCP client to database
        let definition = ExternalMCPClientDefinition {
            client_name: client_name.to_string(),
        };
        Self::save_external_mcp_client(db, &definition)
            .await
            .map_err(|e| format!("Failed to save external MCP client: {e}"))?;

        Ok(())
    }

    /// Disconnect an external MCP client from Archestra MCP servers
    pub async fn disconnect_external_mcp_client(
        db: &DatabaseConnection,
        client_name: &str,
    ) -> Result<(), String> {
        let config_path = Self::get_config_path_for_external_mcp_client(client_name)?;

        println!("🔌 Disconnecting {client_name} client...");
        let mut config = Self::read_config_file(&config_path)?;

        if let Some(mcp_servers) = config["mcpServers"].as_object_mut() {
            // Remove all entries with "(archestra.ai)" suffix
            let keys_to_remove: Vec<String> = mcp_servers
                .keys()
                .filter(|key| key.ends_with(" (archestra.ai)"))
                .cloned()
                .collect();

            // Remove the archestra.ai server
            mcp_servers.remove(ARCHESTRA_MCP_SERVER_KEY);

            for key in keys_to_remove {
                mcp_servers.remove(&key);
                println!("  ❌ Removed MCP server: {key}");
            }
        }

        Self::write_config_file(&config_path, &config)?;

        // Delete external MCP client from database
        Self::delete_external_mcp_client(db, client_name)
            .await
            .map_err(|e| format!("Failed to delete external MCP client: {e}"))?;

        println!("✅ Removed Archestra tools from {client_name} MCP config");

        Ok(())
    }

    pub fn read_config_file(path: &PathBuf) -> Result<Value, String> {
        if !path.exists() {
            // Return empty config if file doesn't exist
            return Ok(serde_json::json!({
                "mcpServers": {}
            }));
        }

        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read config file {}: {}", path.display(), e))?;

        if content.trim().is_empty() {
            return Ok(serde_json::json!({
                "mcpServers": {}
            }));
        }

        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse JSON in {}: {}", path.display(), e))
    }

    pub fn write_config_file(path: &PathBuf, config: &Value) -> Result<(), String> {
        println!("📝 Attempting to write config file to: {}", path.display());

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            println!("📁 Creating parent directory: {}", parent.display());
            std::fs::create_dir_all(parent).map_err(|e| {
                let err_msg = format!(
                    "Failed to create config directory {}: {}",
                    parent.display(),
                    e
                );
                println!("❌ {err_msg}");
                err_msg
            })?;
        }

        let content = serde_json::to_string_pretty(config).map_err(|e| {
            let err_msg = format!("Failed to serialize config: {e}");
            println!("❌ {err_msg}");
            err_msg
        })?;

        println!("📄 Writing {} bytes to file", content.len());
        std::fs::write(path, &content).map_err(|e| {
            let err_msg = format!("Failed to write config file {}: {}", path.display(), e);
            println!("❌ {err_msg}");
            err_msg
        })?;

        // Verify the file was written correctly
        if let Ok(written_content) = std::fs::read_to_string(path) {
            if written_content == content {
                println!("✅ Config file written and verified successfully");
            } else {
                println!("⚠️  Config file written but content doesn't match");
            }
        } else {
            println!("⚠️  Config file written but couldn't verify content");
        }

        Ok(())
    }

    pub async fn sync_all_connected_external_mcp_clients(
        db: &DatabaseConnection,
    ) -> Result<(), String> {
        let connected_clients = Self::get_connected_external_mcp_clients(db)
            .await
            .map_err(|e| e.to_string())?;
        for client in connected_clients {
            Self::update_external_mcp_client_config(db, &client.client_name).await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_fixtures::database;
    use rstest::*;
    use tempfile::NamedTempFile;

    #[rstest]
    #[tokio::test]
    async fn test_save_external_mcp_client(#[future] database: DatabaseConnection) {
        let db = database.await;

        let definition = ExternalMCPClientDefinition {
            client_name: "test_client".to_string(),
        };

        let result = Model::save_external_mcp_client(&db, &definition).await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_config_path_for_external_mcp_client() {
        // Test cursor config path
        let cursor_path = Model::get_config_path_for_external_mcp_client(Model::CURSOR_CLIENT_NAME);
        assert!(cursor_path.is_ok());
        let path = cursor_path.unwrap();
        assert!(path.to_string_lossy().contains(".cursor"));
        assert!(path.to_string_lossy().ends_with("mcp.json"));

        // Test claude config path
        let claude_path =
            Model::get_config_path_for_external_mcp_client(Model::CLAUDE_DESKTOP_CLIENT_NAME);
        assert!(claude_path.is_ok());
        let path = claude_path.unwrap();
        assert!(path.to_string_lossy().contains("Claude"));
        assert!(path
            .to_string_lossy()
            .ends_with("claude_desktop_config.json"));

        // Test vscode config path
        let vscode_path = Model::get_config_path_for_external_mcp_client(Model::VSCODE_CLIENT_NAME);
        assert!(vscode_path.is_ok());
        let path = vscode_path.unwrap();
        assert!(path.to_string_lossy().contains(".vscode"));
        assert!(path.to_string_lossy().ends_with("mcp.json"));

        // Test unknown client
        let unknown_path = Model::get_config_path_for_external_mcp_client("unknown");
        assert!(unknown_path.is_err());
        assert!(unknown_path.unwrap_err().contains("Unknown client"));
    }

    #[test]
    fn test_read_config_file_nonexistent() {
        let nonexistent_path = PathBuf::from("/tmp/nonexistent_config.json");
        let result = Model::read_config_file(&nonexistent_path);

        assert!(result.is_ok());
        let config = result.unwrap();
        assert!(config.is_object());
        assert!(config["mcpServers"].is_object());
    }

    #[test]
    fn test_write_config_file() {
        // Create a temporary file for the config
        let temp_file = NamedTempFile::new().unwrap();
        let config_path = temp_file.path().to_path_buf();

        // Test writing a config
        let test_config = serde_json::json!({
            "mcpServers": {
                "test-server": {
                    "command": "test",
                    "args": ["arg1", "arg2"]
                }
            }
        });

        let result = Model::write_config_file(&config_path, &test_config);
        assert!(result.is_ok());

        // Verify the file was written
        assert!(config_path.exists());

        // Read it back and verify contents
        let read_config = Model::read_config_file(&config_path).unwrap();
        assert_eq!(read_config, test_config);
    }

    #[tokio::test]
    async fn test_config_file_operations() {
        // Create a temporary file for the config
        let temp_file = NamedTempFile::new().unwrap();
        let config_path = temp_file.path().to_path_buf();

        // Write an initial config
        let initial_config = serde_json::json!({
            "existingField": "value",
            "mcpServers": {
                "existing-server": {
                    "command": "existing",
                    "args": []
                }
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&initial_config).unwrap(),
        )
        .unwrap();

        // Read the config back to verify structure
        let result_config = Model::read_config_file(&config_path).unwrap();

        // Verify the config has the expected structure
        assert!(result_config.is_object());
        assert!(result_config["mcpServers"].is_object());
        assert_eq!(result_config["existingField"], "value");

        // Test that we can add a server config
        let mut config = result_config;
        let mcp_servers = config["mcpServers"].as_object_mut().unwrap();

        // Add a new server
        let server_key = format!("GitHub {INSTALLED_MCP_SERVER_KEY_SUFFIX}");
        let server_config = MCPServerConfig {
            url: format!("{ARCHESTRA_SERVER_BASE_URL}/proxy/GitHub"),
        };
        mcp_servers.insert(
            server_key.to_string(),
            serde_json::to_value(server_config).unwrap(),
        );

        // Verify the new server was added correctly
        assert!(mcp_servers.contains_key("GitHub (archestra.ai)"));
        assert!(mcp_servers.contains_key("existing-server"));

        let github_config = &mcp_servers["GitHub (archestra.ai)"];
        assert_eq!(
            github_config["url"],
            format!("{ARCHESTRA_SERVER_BASE_URL}/proxy/GitHub")
        );
    }

    #[test]
    fn test_disconnect_client_removes_archestra_servers() {
        // Create a temporary file for the config
        let temp_file = NamedTempFile::new().unwrap();
        let config_path = temp_file.path().to_path_buf();

        // Write a config with both archestra and non-archestra servers
        let initial_config = serde_json::json!({
            "mcpServers": {
                "GitHub (archestra.ai)": {
                    "command": "curl",
                    "args": ["-X", "POST", "http://localhost:54587/proxy/GitHub"]
                },
                "Slack (archestra.ai)": {
                    "command": "curl",
                    "args": ["-X", "POST", "http://localhost:54587/proxy/Slack"]
                },
                "archestra.ai": {
                    "command": "curl",
                    "args": ["-X", "POST", "http://localhost:54587/mcp"]
                },
                "other-server": {
                    "command": "other",
                    "args": []
                }
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&initial_config).unwrap(),
        )
        .unwrap();

        // Read and modify the config as disconnect would
        let mut config = Model::read_config_file(&config_path).unwrap();
        let mcp_servers = config["mcpServers"].as_object_mut().unwrap();

        // Remove all entries with "(archestra.ai)" suffix
        let keys_to_remove: Vec<String> = mcp_servers
            .keys()
            .filter(|key| key.ends_with(" (archestra.ai)") || key == &ARCHESTRA_MCP_SERVER_KEY)
            .cloned()
            .collect();

        for key in keys_to_remove {
            mcp_servers.remove(&key);
        }

        // Verify only non-archestra servers remain
        assert_eq!(mcp_servers.len(), 1);
        assert!(mcp_servers.contains_key("other-server"));
        assert!(!mcp_servers.contains_key("GitHub (archestra.ai)"));
        assert!(!mcp_servers.contains_key("Slack (archestra.ai)"));
    }

    #[rstest]
    #[tokio::test]
    async fn test_delete_external_mcp_client(#[future] database: DatabaseConnection) {
        let db = database.await;

        // First, create a client
        let definition = ExternalMCPClientDefinition {
            client_name: "test_delete_client".to_string(),
        };
        Model::save_external_mcp_client(&db, &definition)
            .await
            .unwrap();

        // Verify it exists
        let clients = Model::get_connected_external_mcp_clients(&db)
            .await
            .unwrap();
        assert!(clients
            .iter()
            .any(|c| c.client_name == "test_delete_client"));

        // Delete the client
        let result = Model::delete_external_mcp_client(&db, "test_delete_client").await;
        assert!(result.is_ok());

        // Verify it's deleted
        let clients = Model::get_connected_external_mcp_clients(&db)
            .await
            .unwrap();
        assert!(!clients
            .iter()
            .any(|c| c.client_name == "test_delete_client"));
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_connected_external_mcp_clients(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Initially should be empty
        let clients = Model::get_connected_external_mcp_clients(&db)
            .await
            .unwrap();
        assert_eq!(clients.len(), 0);

        // Add multiple clients
        for i in 1..=3 {
            let definition = ExternalMCPClientDefinition {
                client_name: format!("test_client_{i}"),
            };
            Model::save_external_mcp_client(&db, &definition)
                .await
                .unwrap();
        }

        // Get all clients
        let clients = Model::get_connected_external_mcp_clients(&db)
            .await
            .unwrap();
        assert_eq!(clients.len(), 3);

        // Verify all clients are present
        let client_names: Vec<String> = clients.iter().map(|c| c.client_name.clone()).collect();
        assert!(client_names.contains(&"test_client_1".to_string()));
        assert!(client_names.contains(&"test_client_2".to_string()));
        assert!(client_names.contains(&"test_client_3".to_string()));
    }

    #[rstest]
    #[tokio::test]
    async fn test_save_external_mcp_client_upsert(#[future] database: DatabaseConnection) {
        let db = database.await;

        let definition = ExternalMCPClientDefinition {
            client_name: "upsert_test_client".to_string(),
        };

        // First save
        let first_save = Model::save_external_mcp_client(&db, &definition)
            .await
            .unwrap();
        let first_created_at = first_save.created_at;
        let first_updated_at = first_save.updated_at;

        // Wait a bit to ensure timestamps differ
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

        // Second save (should update)
        let second_save = Model::save_external_mcp_client(&db, &definition)
            .await
            .unwrap();

        // Verify upsert behavior
        assert_eq!(first_save.client_name, second_save.client_name);
        assert_eq!(first_created_at, second_save.created_at); // Created at should not change
        assert!(second_save.updated_at > first_updated_at); // Updated at should be newer
    }

    #[test]
    fn test_read_config_file_empty() {
        // Create a temporary empty file
        let temp_file = NamedTempFile::new().unwrap();
        let config_path = temp_file.path().to_path_buf();
        std::fs::write(&config_path, "").unwrap();

        let result = Model::read_config_file(&config_path);
        assert!(result.is_ok());

        let config = result.unwrap();
        assert!(config.is_object());
        assert!(config["mcpServers"].is_object());
        assert_eq!(config["mcpServers"].as_object().unwrap().len(), 0);
    }

    #[test]
    fn test_read_config_file_invalid_json() {
        // Create a temporary file with invalid JSON
        let temp_file = NamedTempFile::new().unwrap();
        let config_path = temp_file.path().to_path_buf();
        std::fs::write(&config_path, "{ invalid json }").unwrap();

        let result = Model::read_config_file(&config_path);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to parse JSON"));
    }
}
