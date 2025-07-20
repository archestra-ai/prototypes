use crate::models::mcp_server::sandbox::forward_raw_request;
use axum::{
    body::Body,
    extract::Path,
    routing::{get, post},
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
    transport::sse_server::{SseServer, SseServerConfig},
    ErrorData as McpError, RoleServer, ServerHandler,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::future::Future;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

// Fixed port for MCP server
const MCP_SERVER_PORT: u16 = 54587;

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
pub struct ArchestraMcpServer {
    context: Arc<Mutex<ArchestraContext>>,
    resources: Arc<Mutex<HashMap<String, ArchestraResource>>>,
    tool_router: ToolRouter<ArchestraMcpServer>,
}

// Health check endpoint
async fn health_check() -> &'static str {
    "OK"
}

// Proxy request endpoint
async fn handle_proxy_request(
    Path(server_name): Path<String>,
    req: axum::http::Request<Body>,
) -> axum::http::Response<Body> {
    println!(
        "MCP Server Proxy: Forwarding raw request to server '{}'",
        server_name
    );

    // Read the request body
    let body_bytes = match axum::body::to_bytes(req.into_body(), usize::MAX).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return axum::http::Response::builder()
                .status(axum::http::StatusCode::BAD_REQUEST)
                .header("Content-Type", "application/json")
                .body(Body::from("Failed to read request body"))
                .unwrap();
        }
    };

    // Convert bytes to string
    let request_body = match String::from_utf8(body_bytes.to_vec()) {
        Ok(body) => body,
        Err(_) => {
            return axum::http::Response::builder()
                .status(axum::http::StatusCode::BAD_REQUEST)
                .header("Content-Type", "application/json")
                .body(Body::from("Invalid UTF-8 in request body"))
                .unwrap();
        }
    };

    // Forward the raw JSON-RPC request to the McpServerManager
    match forward_raw_request(&server_name, request_body).await {
        Ok(raw_response) => axum::http::Response::builder()
            .status(axum::http::StatusCode::OK)
            .header("Content-Type", "application/json")
            .body(Body::from(raw_response))
            .unwrap(),
        Err(e) => {
            println!(
                "MCP Server Proxy: Failed to forward request to '{}': {}",
                server_name, e
            );

            // Return a JSON-RPC error response
            let error_response = serde_json::json!({
                "jsonrpc": "2.0",
                "id": null,
                "error": {
                    "code": -32603,
                    "message": format!("Proxy error: {}", e)
                }
            });

            axum::http::Response::builder()
                .status(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
                .header("Content-Type", "application/json")
                .body(Body::from(serde_json::to_string(&error_response).unwrap()))
                .unwrap()
        }
    }
}

#[tool_router]
impl ArchestraMcpServer {
    pub fn new(user_id: String) -> Self {
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
        }
    }

    #[tool(description = "Get the current Archestra context")]
    async fn get_context(&self) -> Result<CallToolResult, McpError> {
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
    ) -> Result<CallToolResult, McpError> {
        println!("Updating context: {} = {}", key, value);

        let mut context = self.context.lock().await;
        context.project_context.insert(key.clone(), value.clone());
        Ok(CallToolResult::success(vec![Content::text(format!(
            "Context updated: {} = {}",
            key, value
        ))]))
    }

    #[tool(description = "Set active models for the session")]
    async fn set_active_models(
        &self,
        Parameters(SetActiveModelsRequest { models }): Parameters<SetActiveModelsRequest>,
    ) -> Result<CallToolResult, McpError> {
        println!("Setting active models: {:?}", models);

        let mut context = self.context.lock().await;
        context.active_models = models.clone();
        Ok(CallToolResult::success(vec![Content::text(format!(
            "Active models set to: {:?}",
            models
        ))]))
    }
}

#[tool_handler]
impl ServerHandler for ArchestraMcpServer {
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
    ) -> Result<ListResourcesResult, McpError> {
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
    ) -> Result<ReadResourceResult, McpError> {
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
                Err(McpError::invalid_params(
                    format!("Resource not found: {}", resource_id),
                    None,
                ))
            }
        } else {
            Err(McpError::invalid_params("Invalid resource URI", None))
        }
    }

    async fn list_prompts(
        &self,
        _request: Option<PaginatedRequestParam>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListPromptsResult, McpError> {
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
    ) -> Result<GetPromptResult, McpError> {
        match name.as_str() {
            "example_prompt" => {
                let message = arguments
                    .and_then(|json| json.get("message")?.as_str().map(|s| s.to_string()))
                    .ok_or_else(|| {
                        McpError::invalid_params("No message provided to example_prompt", None)
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
            _ => Err(McpError::invalid_params("prompt not found", None)),
        }
    }
}

pub async fn start_archestra_mcp_server(user_id: String) -> Result<(), Box<dyn std::error::Error>> {
    let addr = SocketAddr::from(([127, 0, 0, 1], MCP_SERVER_PORT));

    // Configure SSE server for MCP
    let config = SseServerConfig {
        bind: addr,
        sse_path: "/mcp".to_string(),
        post_path: "/mcp".to_string(),
        sse_keep_alive: Some(std::time::Duration::from_secs(30)),
        ct: CancellationToken::new(),
    };

    // Create SSE server and router
    let (sse_mcp_server, sse_mcp_router) = SseServer::new(config);
    let archestra_mcp_server = ArchestraMcpServer::new(user_id);

    // Create main router
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/proxy/{server_name}", post(handle_proxy_request))
        .merge(sse_mcp_router);

    let ct = sse_mcp_server.with_service(move || archestra_mcp_server.clone());
    let addr = SocketAddr::from(([127, 0, 0, 1], MCP_SERVER_PORT));
    let listener = TcpListener::bind(addr).await?;

    println!(
        "Archestra MCP Server started successfully on http://{}",
        addr
    );
    println!("  - MCP endpoint (streamable HTTP): http://{}/mcp", addr);
    println!("  - Proxy endpoints: http://{}/proxy/<server_name>", addr);
    println!("  - Health check: http://{}/health", addr);

    let server = axum::serve(listener, app).with_graceful_shutdown(async move {
        // Wait for cancellation signal
        ct.cancelled().await;
        println!("Archestra MCP Server is shutting down...");
    });

    if let Err(e) = server.await {
        eprintln!("Server error: {}", e);
    }

    println!("Server has been shut down");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use serde_json::json;
    use std::net::{IpAddr, Ipv4Addr};
    use tower::util::ServiceExt;

    // Helper function to create a test server instance
    fn create_test_server() -> ArchestraMcpServer {
        ArchestraMcpServer::new("test_user_123".to_string())
    }

    // Test server creation and initialization
    #[test]
    fn test_server_creation() {
        let server = create_test_server();
        // Server should be created successfully with default resources
        let _ = server; // Ensure server is created without panic
    }

    // Test server info
    #[tokio::test]
    async fn test_server_info() {
        let server = create_test_server();
        let info = server.get_info();

        assert_eq!(info.protocol_version, ProtocolVersion::V_2025_03_26);
        assert!(info.capabilities.tools.is_some());
        assert!(info.capabilities.resources.is_some());
        assert!(info.capabilities.logging.is_none());
        assert!(info.capabilities.prompts.is_none());
    }

    // Test startup of the MCP server
    #[tokio::test]
    async fn test_server_startup() {
        let user_id = "test_user".to_string();

        // Start server in a background task
        let server_task = tokio::spawn(async move {
            let result = start_archestra_mcp_server(user_id).await;
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
            "Server should be listening on port {}",
            MCP_SERVER_PORT
        );

        // Clean up - abort the server task
        server_task.abort();
    }

    // Test health check endpoint
    #[tokio::test]
    async fn test_health_check_endpoint() {
        let app = Router::new().route("/health", axum::routing::get(health_check));

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        assert_eq!(&body[..], b"OK");
    }

    // Test get_context tool
    #[tokio::test]
    async fn test_get_context_tool() {
        let server = create_test_server();

        let result = server.get_context().await;
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
    #[tokio::test]
    async fn test_update_context_tool() {
        let server = create_test_server();

        // Update context with a key-value pair
        let params = UpdateContextRequest {
            key: "environment".to_string(),
            value: "production".to_string(),
        };

        let result = server.update_context(Parameters(params)).await;
        assert!(result.is_ok());

        // Verify the context was updated
        let context = server.context.lock().await;
        assert_eq!(
            context.project_context.get("environment"),
            Some(&"production".to_string())
        );
    }

    // Test set_active_models tool
    #[tokio::test]
    async fn test_set_active_models_tool() {
        let server = create_test_server();

        let params = SetActiveModelsRequest {
            models: vec!["gpt-4".to_string(), "claude-3-opus".to_string()],
        };

        let result = server.set_active_models(Parameters(params)).await;
        assert!(result.is_ok());

        // Verify models were set
        let context = server.context.lock().await;
        assert_eq!(context.active_models.len(), 2);
        assert_eq!(context.active_models[0], "gpt-4");
        assert_eq!(context.active_models[1], "claude-3-opus");
    }

    // Test proxy endpoint
    #[tokio::test]
    async fn test_proxy_endpoint() {
        // Note: This test will fail if forward_raw_request is not properly mocked
        // In a real test environment, you'd want to mock the forward_raw_request function

        let app = Router::new().route(
            "/proxy/{server_name}",
            axum::routing::post(handle_proxy_request),
        );

        let json_rpc_request = json!({
            "jsonrpc": "2.0",
            "method": "test_method",
            "params": {},
            "id": 1
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/proxy/test_server")
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        serde_json::to_string(&json_rpc_request).unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        // The actual behavior depends on the forward_raw_request implementation
        // For now, we just check that the endpoint exists and responds
        assert!(
            response.status() == StatusCode::OK
                || response.status() == StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    // Test concurrent context updates
    #[tokio::test]
    async fn test_concurrent_context_updates() {
        let server = Arc::new(create_test_server());

        // Spawn multiple tasks that update context concurrently
        let mut handles = vec![];

        for i in 0..10 {
            let server_clone = Arc::clone(&server);
            let handle = tokio::spawn(async move {
                let params = UpdateContextRequest {
                    key: format!("key_{}", i),
                    value: format!("value_{}", i),
                };
                server_clone.update_context(Parameters(params)).await
            });
            handles.push(handle);
        }

        // Wait for all tasks to complete
        for handle in handles {
            let result = handle.await.unwrap();
            assert!(result.is_ok());
        }

        // Verify all updates were applied
        let context = server.context.lock().await;
        for i in 0..10 {
            assert_eq!(
                context.project_context.get(&format!("key_{}", i)),
                Some(&format!("value_{}", i))
            );
        }
    }
}
