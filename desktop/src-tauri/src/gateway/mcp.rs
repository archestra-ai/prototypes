use crate::models::mcp_server::Model as MCPServerModel;
use rmcp::{
    handler::server::{router::tool::ToolRouter, tool::Parameters},
    model::{
        CallToolResult, Content, GetPromptRequestParam, GetPromptResult, ListPromptsResult,
        ListResourcesResult, PaginatedRequestParam, Prompt, PromptArgument, PromptMessage,
        PromptMessageContent, PromptMessageRole, ProtocolVersion, RawResource,
        ReadResourceRequestParam, ReadResourceResult, Resource, ResourceContents,
        ServerCapabilities, ServerInfo,
    },
    schemars,
    service::RequestContext,
    tool, tool_handler, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
    },
    ErrorData as MCPError, RoleServer, ServerHandler,
};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::future::Future;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ArchestraContext {
    pub user_id: String,
    pub session_id: String,
    pub project_context: HashMap<String, String>,
    pub active_models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ArchestraResource {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub resource_type: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct UpdateContextRequest {
    pub key: String,
    pub value: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct SetActiveModelsRequest {
    pub models: Vec<String>,
}

#[derive(Clone)]
pub struct Service {
    resources: Arc<Mutex<HashMap<String, ArchestraResource>>>,
    context: Arc<Mutex<ArchestraContext>>,
    tool_router: ToolRouter<Self>,
    db: Arc<DatabaseConnection>,
}

#[tool_router]
impl Service {
    pub fn new(user_id: String, db: DatabaseConnection) -> Self {
        let mut resources = HashMap::new();

        resources.insert(
            "system_info".to_string(),
            ArchestraResource {
                id: "system_info".to_string(),
                name: "System Information".to_string(),
                description: "Current system and application state".to_string(),
                content: "Archestra AI Desktop Application - Context Manager".to_string(),
                resource_type: "system".to_string(),
            },
        );

        resources.insert(
            "user_preferences".to_string(),
            ArchestraResource {
                id: "user_preferences".to_string(),
                name: "User Preferences".to_string(),
                description: "User configuration and preferences".to_string(),
                content: "{}".to_string(),
                resource_type: "config".to_string(),
            },
        );

        Self {
            resources: Arc::new(Mutex::new(resources)),
            context: Arc::new(Mutex::new(ArchestraContext {
                user_id,
                session_id: Uuid::new_v4().to_string(),
                project_context: HashMap::new(),
                active_models: vec![],
            })),
            tool_router: Self::tool_router(),
            db: Arc::new(db),
        }
    }

    #[tool(description = "Get the current Archestra context")]
    async fn get_context(&self) -> Result<CallToolResult, MCPError> {
        println!("Getting context");

        let context = self.context.lock().await;
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&*context).unwrap_or_else(|_| "{}".to_string()),
        )]))
    }

    #[tool(description = "Update the Archestra context")]
    async fn update_context(
        &self,
        Parameters(UpdateContextRequest { key, value }): Parameters<UpdateContextRequest>,
    ) -> Result<CallToolResult, MCPError> {
        println!("Updating context: {key} = {value}");

        let mut context = self.context.lock().await;
        context.project_context.insert(key.clone(), value.clone());
        Ok(CallToolResult::success(vec![Content::text(format!(
            "Context updated: {key} = {value}"
        ))]))
    }

    #[tool(description = "Set active models for the session")]
    async fn set_active_models(
        &self,
        Parameters(SetActiveModelsRequest { models }): Parameters<SetActiveModelsRequest>,
    ) -> Result<CallToolResult, MCPError> {
        println!("Setting active models: {models:?}");

        let mut context = self.context.lock().await;
        context.active_models = models.clone();
        Ok(CallToolResult::success(vec![Content::text(format!(
            "Active models set to: {models:?}"
        ))]))
    }

    #[tool(description = "List all installed MCP servers that can be proxied")]
    async fn list_installed_mcp_servers(&self) -> Result<CallToolResult, MCPError> {
        println!("Listing installed MCP servers");

        match MCPServerModel::load_installed_mcp_servers(&self.db).await {
            Ok(servers) => {
                let server_list: Vec<_> = servers
                    .into_iter()
                    .filter_map(|model| {
                        let name = model.name.clone();
                        match model.to_definition() {
                            Ok(definition) => Some(serde_json::json!({
                                "name": name,
                                "transport": definition.server_config.transport,
                                "command": definition.server_config.command,
                                "args": definition.server_config.args,
                                "env_count": definition.server_config.env.len(),
                                "has_meta": definition.meta.is_some()
                            })),
                            Err(e) => {
                                eprintln!("Failed to convert model to definition: {e}");
                                None
                            }
                        }
                    })
                    .collect();

                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&serde_json::json!({
                        "servers": server_list,
                        "total_count": server_list.len()
                    }))
                    .unwrap_or_else(|_| "{}".to_string()),
                )]))
            }
            Err(e) => {
                println!("Failed to load installed MCP servers: {e}");
                Err(MCPError::internal_error(
                    format!("Failed to load installed MCP servers: {e}"),
                    None,
                ))
            }
        }
    }
}

#[tool_handler]
impl ServerHandler for Service {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::V_2025_03_26,
            capabilities: ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .build(),
            instructions: None,
            ..Default::default()
        }
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParam>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, MCPError> {
        let resources = self.resources.lock().await;
        let resource_list: Vec<Resource> = resources
            .values()
            .map(|r| Resource {
                raw: RawResource {
                    uri: format!("archestra://{}", r.id),
                    name: r.name.clone(),
                    description: Some(r.description.clone()),
                    mime_type: Some("application/json".to_string()),
                    size: None,
                },
                annotations: None,
            })
            .collect();

        Ok(ListResourcesResult {
            resources: resource_list,
            next_cursor: None,
        })
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParam,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResult, MCPError> {
        if let Some(resource_id) = request.uri.strip_prefix("archestra://") {
            let resources = self.resources.lock().await;
            if let Some(resource) = resources.get(resource_id) {
                Ok(ReadResourceResult {
                    contents: vec![ResourceContents::TextResourceContents {
                        uri: request.uri,
                        mime_type: Some("application/json".to_string()),
                        text: resource.content.clone(),
                    }],
                })
            } else {
                Err(MCPError::invalid_params(
                    format!("Resource not found: {resource_id}"),
                    None,
                ))
            }
        } else {
            Err(MCPError::invalid_params("Invalid resource URI", None))
        }
    }

    async fn list_prompts(
        &self,
        _request: Option<PaginatedRequestParam>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListPromptsResult, MCPError> {
        Ok(ListPromptsResult {
            next_cursor: None,
            prompts: vec![Prompt::new(
                "example_prompt",
                Some("This is an example prompt that takes one required argument, message"),
                Some(vec![PromptArgument {
                    name: "message".to_string(),
                    description: Some("A message to put in the prompt".to_string()),
                    required: Some(true),
                }]),
            )],
        })
    }

    async fn get_prompt(
        &self,
        GetPromptRequestParam { name, arguments }: GetPromptRequestParam,
        _: RequestContext<RoleServer>,
    ) -> Result<GetPromptResult, MCPError> {
        match name.as_str() {
            "example_prompt" => {
                let message = arguments
                    .and_then(|json| json.get("message")?.as_str().map(|s| s.to_string()))
                    .ok_or_else(|| {
                        MCPError::invalid_params("No message provided to example_prompt", None)
                    })?;

                let prompt =
                    format!("This is an example prompt with your message here: '{message}'");
                Ok(GetPromptResult {
                    description: None,
                    messages: vec![PromptMessage {
                        role: PromptMessageRole::User,
                        content: PromptMessageContent::text(prompt),
                    }],
                })
            }
            _ => Err(MCPError::invalid_params("prompt not found", None)),
        }
    }
}

pub async fn create_streamable_http_service(
    user_id: String,
    db: DatabaseConnection,
) -> StreamableHttpService<Service> {
    let db_for_closure = Arc::new(db.clone());
    StreamableHttpService::new(
        move || Ok(Service::new(user_id.clone(), (*db_for_closure).clone())),
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig {
            sse_keep_alive: Some(std::time::Duration::from_secs(30)),
            stateful_mode: false,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_fixtures::database;
    use rstest::*;

    #[fixture]
    async fn service_and_db(
        #[future] database: DatabaseConnection,
    ) -> (Service, DatabaseConnection) {
        let db = database.await;
        let service = Service::new("test_user_123".to_string(), db.clone());
        (service, db)
    }

    #[rstest]
    #[tokio::test]
    async fn test_server_info(#[future] service_and_db: (Service, DatabaseConnection)) {
        let (service, _) = service_and_db.await;
        let info = <Service as ServerHandler>::get_info(&service);

        assert_eq!(info.protocol_version, ProtocolVersion::V_2025_03_26);
        assert!(info.capabilities.tools.is_some());
        assert!(info.capabilities.resources.is_some());
        assert!(info.capabilities.logging.is_none());
        assert!(info.capabilities.prompts.is_none());
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_context_tool(#[future] service_and_db: (Service, DatabaseConnection)) {
        let (service, _) = service_and_db.await;

        let result = service.get_context().await;
        assert!(result.is_ok());

        let tool_result = result.unwrap();
        assert!(!tool_result.content.is_empty());

        let first_content = tool_result.content.first().unwrap();
        match &first_content.raw {
            rmcp::model::RawContent::Text(text) => {
                let context: serde_json::Value = serde_json::from_str(&text.text).unwrap();
                assert_eq!(context["user_id"], "test_user_123");
                assert!(context["session_id"].is_string());
                assert!(context["project_context"].is_object());
                assert!(context["active_models"].is_array());
            }
            _ => panic!("Expected text content"),
        }
    }

    #[rstest]
    #[tokio::test]
    async fn test_update_context_tool(#[future] service_and_db: (Service, DatabaseConnection)) {
        let (service, _) = service_and_db.await;

        let params = UpdateContextRequest {
            key: "environment".to_string(),
            value: "production".to_string(),
        };

        let result = service.update_context(Parameters(params)).await;
        assert!(result.is_ok());

        let context = service.context.lock().await;
        assert_eq!(
            context.project_context.get("environment"),
            Some(&"production".to_string())
        );
    }

    #[rstest]
    #[tokio::test]
    async fn test_set_active_models_tool(#[future] service_and_db: (Service, DatabaseConnection)) {
        let (service, _) = service_and_db.await;

        let params = SetActiveModelsRequest {
            models: vec!["gpt-4".to_string(), "claude-3-opus".to_string()],
        };

        let result = service.set_active_models(Parameters(params)).await;
        assert!(result.is_ok());

        let context = service.context.lock().await;
        assert_eq!(context.active_models.len(), 2);
        assert_eq!(context.active_models[0], "gpt-4");
        assert_eq!(context.active_models[1], "claude-3-opus");
    }

    #[rstest]
    #[tokio::test]
    async fn test_concurrent_context_updates(
        #[future] service_and_db: (Service, DatabaseConnection),
    ) {
        let (service, _) = service_and_db.await;

        let mut handles = vec![];

        for i in 0..10 {
            let service_clone = service.clone();
            let handle = tokio::spawn(async move {
                let params = UpdateContextRequest {
                    key: format!("key_{i}"),
                    value: format!("value_{i}"),
                };
                service_clone.update_context(Parameters(params)).await
            });
            handles.push(handle);
        }

        for handle in handles {
            let result = handle.await.unwrap();
            assert!(result.is_ok());
        }

        let context = service.context.lock().await;
        for i in 0..10 {
            assert_eq!(
                context.project_context.get(&format!("key_{i}")),
                Some(&format!("value_{i}"))
            );
        }
    }

    #[rstest]
    #[tokio::test]
    async fn test_list_installed_mcp_servers_tool(
        #[future] service_and_db: (Service, DatabaseConnection),
    ) {
        let (service, _) = service_and_db.await;

        let result = service.list_installed_mcp_servers().await;
        assert!(result.is_ok());

        let tool_result = result.unwrap();
        assert!(!tool_result.content.is_empty());

        let first_content = tool_result.content.first().unwrap();
        match &first_content.raw {
            rmcp::model::RawContent::Text(text) => {
                let servers_response: serde_json::Value = serde_json::from_str(&text.text).unwrap();
                assert!(servers_response["servers"].is_array());
                assert!(servers_response["total_count"].is_number());
                // Empty database should have 0 servers
                assert_eq!(servers_response["total_count"], 0);
            }
            _ => panic!("Expected text content"),
        }
    }
}
