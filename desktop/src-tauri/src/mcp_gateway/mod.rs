use crate::models::mcp_request_log::ClientInfo;
use crate::models::mcp_server::{sandbox::forward_raw_request, Model as MCPServerModel};
use crate::models::{CreateLogRequest, MCPRequestLog};
use axum::{
    body::Body,
    extract::{Extension, Path},
    routing::post,
    Router,
};
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
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use uuid::Uuid;

// Fixed port for MCP server
pub const MCP_SERVER_PORT: u16 = 54587;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchestraContext {
    pub user_id: String,
    pub session_id: String,
    pub project_context: HashMap<String, String>,
    pub active_models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchestraResource {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub resource_type: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct UpdateContextRequest {
    pub key: String,
    pub value: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct SetActiveModelsRequest {
    pub models: Vec<String>,
}

#[derive(Clone)]
pub struct MCPGateway {
    context: Arc<Mutex<ArchestraContext>>,
    resources: Arc<Mutex<HashMap<String, ArchestraResource>>>,
    tool_router: ToolRouter<MCPGateway>,
    db: Arc<DatabaseConnection>,
}

// Extract client info from request headers
fn extract_client_info(headers: &axum::http::HeaderMap) -> ClientInfo {
    ClientInfo {
        user_agent: headers
            .get("user-agent")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string()),
        client_name: headers
            .get("x-client-name")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string()),
        client_version: headers
            .get("x-client-version")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string()),
        client_platform: headers
            .get("x-client-platform")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string()),
    }
}

// Extract session IDs from headers
fn extract_session_ids(headers: &axum::http::HeaderMap) -> (Option<String>, Option<String>) {
    let session_id = headers
        .get("x-session-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let mcp_session_id = headers
        .get("mcp-session-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    (session_id, mcp_session_id)
}

// Convert HeaderMap to HashMap for JSON serialization
fn headers_to_hashmap(headers: &axum::http::HeaderMap) -> HashMap<String, String> {
    headers
        .iter()
        .filter_map(|(key, value)| {
            value
                .to_str()
                .ok()
                .map(|v| (key.to_string(), v.to_string()))
        })
        .collect()
}

// Extract JSON-RPC method from request body
fn extract_method_from_request(request_body: &str) -> Option<String> {
    match serde_json::from_str::<serde_json::Value>(request_body) {
        Ok(json) => json
            .get("method")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        Err(_) => None,
    }
}

// Proxy request endpoint with comprehensive logging
async fn handle_proxy_request(
    Path(server_name): Path<String>,
    Extension(db): Extension<Arc<DatabaseConnection>>,
    req: axum::http::Request<Body>,
) -> axum::http::Response<Body> {
    let start_time = Instant::now();
    let request_id = Uuid::new_v4().to_string();

    println!("🚀 MCP Server Proxy: Starting request to server '{server_name}' (ID: {request_id})");

    // Extract headers and session info before consuming the request
    let headers = req.headers().clone();
    let (session_id, mcp_session_id) = extract_session_ids(&headers);
    let client_info = extract_client_info(&headers);
    let request_headers = headers_to_hashmap(&headers);

    // Generate session_id if not provided
    let session_id = session_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    // Read the request body
    let body_bytes = match axum::body::to_bytes(req.into_body(), usize::MAX).await {
        Ok(bytes) => {
            println!("📥 Successfully read request body ({} bytes)", bytes.len());
            bytes
        }
        Err(e) => {
            println!("❌ Failed to read request body: {e}");

            // Log the failed request
            let log_data = CreateLogRequest {
                request_id,
                session_id: Some(session_id),
                mcp_session_id,
                server_name,
                client_info: Some(client_info),
                method: None,
                request_headers: Some(request_headers),
                request_body: None,
                response_body: None,
                response_headers: None,
                status_code: 400,
                error_message: Some(format!("Failed to read request body: {e}")),
                duration_ms: Some(start_time.elapsed().as_millis() as i32),
            };

            // Log asynchronously (don't block on database errors)
            let db_clone = Arc::clone(&db);
            tokio::spawn(async move {
                if let Err(e) = MCPRequestLog::create_request_log(&db_clone, log_data).await {
                    eprintln!("Failed to log request: {e}");
                }
            });

            return axum::http::Response::builder()
                .status(axum::http::StatusCode::BAD_REQUEST)
                .header("Content-Type", "application/json")
                .body(Body::from("Failed to read request body"))
                .unwrap();
        }
    };

    // Convert bytes to string
    let request_body = match String::from_utf8(body_bytes.to_vec()) {
        Ok(body) => {
            println!("📝 Request body: {body}");
            body
        }
        Err(e) => {
            println!("❌ Invalid UTF-8 in request body: {e}");

            // Log the failed request
            let log_data = CreateLogRequest {
                request_id,
                session_id: Some(session_id),
                mcp_session_id,
                server_name,
                client_info: Some(client_info),
                method: None,
                request_headers: Some(request_headers),
                request_body: None,
                response_body: None,
                response_headers: None,
                status_code: 400,
                error_message: Some(format!("Invalid UTF-8 in request body: {e}")),
                duration_ms: Some(start_time.elapsed().as_millis() as i32),
            };

            // Log asynchronously
            let db_clone = Arc::clone(&db);
            tokio::spawn(async move {
                if let Err(e) = MCPRequestLog::create_request_log(&db_clone, log_data).await {
                    eprintln!("Failed to log request: {e}");
                }
            });

            return axum::http::Response::builder()
                .status(axum::http::StatusCode::BAD_REQUEST)
                .header("Content-Type", "application/json")
                .body(Body::from("Invalid UTF-8 in request body"))
                .unwrap();
        }
    };

    // Extract method from request body
    let method = extract_method_from_request(&request_body);

    println!("🔄 Forwarding request to forward_raw_request function...");
    // Forward the raw JSON-RPC request to the MCPServerManager
    match forward_raw_request(&server_name, request_body.clone()).await {
        Ok(raw_response) => {
            println!("✅ Successfully received response from server '{server_name}'");
            println!("📤 Response: {raw_response}");

            let duration_ms = start_time.elapsed().as_millis() as i32;

            // Log successful request
            let mut response_headers = HashMap::new();
            response_headers.insert("Content-Type".to_string(), "application/json".to_string());

            let log_data = CreateLogRequest {
                request_id,
                session_id: Some(session_id),
                mcp_session_id,
                server_name,
                client_info: Some(client_info),
                method,
                request_headers: Some(request_headers),
                request_body: Some(request_body),
                response_body: Some(raw_response.clone()),
                response_headers: Some(response_headers),
                status_code: 200,
                error_message: None,
                duration_ms: Some(duration_ms),
            };

            // Log asynchronously
            let db_clone = Arc::clone(&db);
            tokio::spawn(async move {
                if let Err(e) = MCPRequestLog::create_request_log(&db_clone, log_data).await {
                    eprintln!("Failed to log request: {e}");
                }
            });

            axum::http::Response::builder()
                .status(axum::http::StatusCode::OK)
                .header("Content-Type", "application/json")
                .body(Body::from(raw_response))
                .unwrap()
        }
        Err(e) => {
            println!("❌ MCP Server Proxy: Failed to forward request to '{server_name}': {e}");

            let duration_ms = start_time.elapsed().as_millis() as i32;

            // Return a JSON-RPC error response
            let error_response = serde_json::json!({
                "jsonrpc": "2.0",
                "id": null,
                "error": {
                    "code": -32603,
                    "message": format!("Proxy error: {}", e)
                }
            });

            let error_response_str = serde_json::to_string(&error_response).unwrap();

            // Log failed request
            let mut response_headers = HashMap::new();
            response_headers.insert("Content-Type".to_string(), "application/json".to_string());

            let log_data = CreateLogRequest {
                request_id,
                session_id: Some(session_id),
                mcp_session_id,
                server_name,
                client_info: Some(client_info),
                method,
                request_headers: Some(request_headers),
                request_body: Some(request_body),
                response_body: Some(error_response_str.clone()),
                response_headers: Some(response_headers),
                status_code: 500,
                error_message: Some(e),
                duration_ms: Some(duration_ms),
            };

            // Log asynchronously
            let db_clone = Arc::clone(&db);
            tokio::spawn(async move {
                if let Err(e) = MCPRequestLog::create_request_log(&db_clone, log_data).await {
                    eprintln!("Failed to log request: {e}");
                }
            });

            axum::http::Response::builder()
                .status(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
                .header("Content-Type", "application/json")
                .body(Body::from(error_response_str))
                .unwrap()
        }
    }
}

#[tool_router]
impl MCPGateway {
    pub fn new(user_id: String, db: DatabaseConnection) -> Self {
        let mut resources = HashMap::new();

        // Add default resources
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
            context: Arc::new(Mutex::new(ArchestraContext {
                user_id,
                session_id: Uuid::new_v4().to_string(),
                project_context: HashMap::new(),
                active_models: vec![],
            })),
            resources: Arc::new(Mutex::new(resources)),
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
                println!("Failed to load MCP servers: {e}");
                Err(MCPError::internal_error(
                    format!("Failed to load MCP servers: {e}"),
                    None,
                ))
            }
        }
    }

    pub async fn start_mcp_gateway(
        user_id: String,
        db: DatabaseConnection,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let addr = SocketAddr::from(([127, 0, 0, 1], MCP_SERVER_PORT));

        // Configure StreamableHTTP server for MCP
        let config = StreamableHttpServerConfig {
            sse_keep_alive: Some(std::time::Duration::from_secs(30)),
            stateful_mode: true, // Enable stateful mode for session management
        };

        // Create StreamableHTTP service with a factory closure
        let db_for_closure = Arc::new(db.clone());
        let streamable_service = StreamableHttpService::new(
            move || Ok(MCPGateway::new(user_id.clone(), (*db_for_closure).clone())),
            Arc::new(LocalSessionManager::default()),
            config,
        );

        // Convert to axum service
        let mcp_service = axum::routing::any_service(streamable_service);

        // Create main router with database extension for proxy routes
        let db_extension = Arc::new(db);
        let app = Router::new()
            .route("/proxy/{server_name}", post(handle_proxy_request))
            .route("/mcp", mcp_service)
            .layer(axum::extract::Extension(db_extension));

        let listener = TcpListener::bind(addr).await?;

        println!("MCP Gateway started successfully on http://{addr}");
        println!("  - MCP endpoint (streamable HTTP): http://{addr}/mcp");
        println!("  - Proxy endpoints: http://{addr}/proxy/<server_name>");

        let server = axum::serve(listener, app);

        if let Err(e) = server.await {
            eprintln!("Server error: {e}");
        }

        println!("Server has been shut down");
        Ok(())
    }
}

#[tool_handler]
impl ServerHandler for MCPGateway {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_fixtures::database;
    use rstest::*;
    use std::net::{IpAddr, Ipv4Addr};

    #[fixture]
    async fn mcp_gateway_and_db(
        #[future] database: DatabaseConnection,
    ) -> (MCPGateway, DatabaseConnection) {
        let db = database.await;
        let gateway = MCPGateway::new("test_user_123".to_string(), db.clone());
        (gateway, db)
    }

    // Test server info
    #[rstest]
    #[tokio::test]
    async fn test_server_info(#[future] mcp_gateway_and_db: (MCPGateway, DatabaseConnection)) {
        let (mcp_gateway, _) = mcp_gateway_and_db.await;
        let info = <MCPGateway as ServerHandler>::get_info(&mcp_gateway);

        assert_eq!(info.protocol_version, ProtocolVersion::V_2025_03_26);
        assert!(info.capabilities.tools.is_some());
        assert!(info.capabilities.resources.is_some());
        assert!(info.capabilities.logging.is_none());
        assert!(info.capabilities.prompts.is_none());
    }

    // Test startup of the MCP server
    #[rstest]
    #[tokio::test]
    async fn test_server_startup(#[future] mcp_gateway_and_db: (MCPGateway, DatabaseConnection)) {
        let (_mcp_gateway, db) = mcp_gateway_and_db.await;
        let user_id = "test_user".to_string();

        // Start server in a background task
        let server_task = tokio::spawn(async move {
            let result = MCPGateway::start_mcp_gateway(user_id, db).await;
            // Server should run until cancelled
            assert!(result.is_ok() || result.is_err());
        });

        // Give server time to start
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Test that server is listening on the expected port
        let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), MCP_SERVER_PORT);
        let connection_result = tokio::net::TcpStream::connect(addr).await;
        assert!(
            connection_result.is_ok(),
            "Server should be listening on port {MCP_SERVER_PORT}"
        );

        // Clean up - abort the server task
        server_task.abort();
    }

    // Test get_context tool
    #[rstest]
    #[tokio::test]
    async fn test_get_context_tool(#[future] mcp_gateway_and_db: (MCPGateway, DatabaseConnection)) {
        let (gateway, _) = mcp_gateway_and_db.await;

        let result = gateway.get_context().await;
        assert!(result.is_ok());

        let tool_result = result.unwrap();
        assert!(!tool_result.content.is_empty());

        // Verify the context contains expected fields
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

    // Test update_context tool
    #[rstest]
    #[tokio::test]
    async fn test_update_context_tool(
        #[future] mcp_gateway_and_db: (MCPGateway, DatabaseConnection),
    ) {
        let (gateway, _) = mcp_gateway_and_db.await;

        // Update context with a key-value pair
        let params = UpdateContextRequest {
            key: "environment".to_string(),
            value: "production".to_string(),
        };

        let result = gateway.update_context(Parameters(params)).await;
        assert!(result.is_ok());

        // Verify the context was updated
        let context = gateway.context.lock().await;
        assert_eq!(
            context.project_context.get("environment"),
            Some(&"production".to_string())
        );
    }

    // Test set_active_models tool
    #[rstest]
    #[tokio::test]
    async fn test_set_active_models_tool(
        #[future] mcp_gateway_and_db: (MCPGateway, DatabaseConnection),
    ) {
        let (gateway, _) = mcp_gateway_and_db.await;

        let params = SetActiveModelsRequest {
            models: vec!["gpt-4".to_string(), "claude-3-opus".to_string()],
        };

        let result = gateway.set_active_models(Parameters(params)).await;
        assert!(result.is_ok());

        // Verify models were set
        let context = gateway.context.lock().await;
        assert_eq!(context.active_models.len(), 2);
        assert_eq!(context.active_models[0], "gpt-4");
        assert_eq!(context.active_models[1], "claude-3-opus");
    }

    // Test concurrent context updates
    #[rstest]
    #[tokio::test]
    async fn test_concurrent_context_updates(
        #[future] mcp_gateway_and_db: (MCPGateway, DatabaseConnection),
    ) {
        let (gateway, _) = mcp_gateway_and_db.await;

        // Spawn multiple tasks that update context concurrently
        let mut handles = vec![];

        for i in 0..10 {
            let gateway_clone = gateway.clone();
            let handle = tokio::spawn(async move {
                let params = UpdateContextRequest {
                    key: format!("key_{i}"),
                    value: format!("value_{i}"),
                };
                gateway_clone.update_context(Parameters(params)).await
            });
            handles.push(handle);
        }

        // Wait for all tasks to complete
        for handle in handles {
            let result = handle.await.unwrap();
            assert!(result.is_ok());
        }

        // Verify all updates were applied
        let context = gateway.context.lock().await;
        for i in 0..10 {
            assert_eq!(
                context.project_context.get(&format!("key_{i}")),
                Some(&format!("value_{i}"))
            );
        }
    }

    // Test list_installed_mcp_servers tool
    #[rstest]
    #[tokio::test]
    async fn test_list_installed_mcp_servers_tool(
        #[future] mcp_gateway_and_db: (MCPGateway, DatabaseConnection),
    ) {
        let (gateway, _) = mcp_gateway_and_db.await;

        let result = gateway.list_installed_mcp_servers().await;
        assert!(result.is_ok());

        let tool_result = result.unwrap();
        assert!(!tool_result.content.is_empty());

        // Verify the response contains expected fields
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
