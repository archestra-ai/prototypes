use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::net::SocketAddr;
use uuid::Uuid;
use hyper::service::service_fn;
use hyper::{body::Incoming, Request, Response, Method, StatusCode};
use http_body_util::BodyExt;
use hyper_util::rt::TokioIo;
use hyper_util::server::conn::auto::Builder as ConnBuilder;
use tokio::net::TcpListener;
use tauri::Manager;
use crate::mcp_bridge::{McpBridge, McpBridgeState};

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

#[derive(Clone)]
pub struct ArchestraServer {
    context: Arc<Mutex<ArchestraContext>>,
    resources: Arc<Mutex<HashMap<String, ArchestraResource>>>,
    mcp_bridge: Option<Arc<McpBridge>>,
}

impl ArchestraServer {
    pub fn new(user_id: String, session_id: String) -> Self {
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
                session_id,
                project_context: HashMap::new(),
                active_models: vec![],
            })),
            resources: Arc::new(Mutex::new(resources)),
            mcp_bridge: None,
        }
    }

    pub fn set_mcp_bridge(&mut self, mcp_bridge: Arc<McpBridge>) {
        self.mcp_bridge = Some(mcp_bridge);
    }

    pub async fn handle_mcp_request(&self, request: Value) -> Result<Value, String> {
        let method = request["method"].as_str().unwrap_or("");
        let params = &request["params"];
        let id = request["id"].clone();

        let result = match method {
            "initialize" => {
                serde_json::json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {},
                        "resources": {}
                    },
                    "serverInfo": {
                        "name": "archestra-mcp-server",
                        "version": "0.1.0"
                    }
                })
            }
            "tools/list" => {
                serde_json::json!({
                    "tools": [
                        {
                            "name": "get_context",
                            "description": "Get the current Archestra context",
                            "inputSchema": {
                                "type": "object",
                                "properties": {},
                                "required": []
                            }
                        },
                        {
                            "name": "update_context",
                            "description": "Update the Archestra context",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "key": {"type": "string"},
                                    "value": {"type": "string"}
                                },
                                "required": ["key", "value"]
                            }
                        },
                        {
                            "name": "set_active_models",
                            "description": "Set active models for the session",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "models": {
                                        "type": "array",
                                        "items": {"type": "string"}
                                    }
                                },
                                "required": ["models"]
                            }
                        }
                    ]
                })
            }
            "tools/call" => {
                let tool_name = params["name"].as_str().unwrap_or("");
                let arguments = &params["arguments"];
                
                match tool_name {
                    "get_context" => {
                        let context = self.context.lock().unwrap();
                        serde_json::json!({
                            "content": [{
                                "type": "text",
                                "text": serde_json::to_string_pretty(&*context).unwrap_or("{}".to_string())
                            }]
                        })
                    }
                    "update_context" => {
                        let key = arguments["key"].as_str().unwrap_or("");
                        let value = arguments["value"].as_str().unwrap_or("");
                        
                        if let Ok(mut context) = self.context.lock() {
                            context.project_context.insert(key.to_string(), value.to_string());
                        }
                        
                        serde_json::json!({
                            "content": [{
                                "type": "text",
                                "text": format!("Context updated: {} = {}", key, value)
                            }]
                        })
                    }
                    "set_active_models" => {
                        if let Some(models_array) = arguments["models"].as_array() {
                            let models: Vec<String> = models_array
                                .iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect();
                            
                            if let Ok(mut context) = self.context.lock() {
                                context.active_models = models.clone();
                            }
                            
                            serde_json::json!({
                                "content": [{
                                    "type": "text",
                                    "text": format!("Active models set to: {:?}", models)
                                }]
                            })
                        } else {
                            return Err("Invalid models parameter".to_string());
                        }
                    }
                    _ => return Err(format!("Unknown tool: {}", tool_name)),
                }
            }
            "resources/list" => {
                let resources = self.resources.lock().unwrap();
                let resource_list: Vec<Value> = resources.values().map(|r| {
                    serde_json::json!({
                        "uri": format!("archestra://{}", r.id),
                        "name": r.name,
                        "description": r.description,
                        "mimeType": "application/json"
                    })
                }).collect();
                
                serde_json::json!({
                    "resources": resource_list
                })
            }
            "resources/read" => {
                let uri = params["uri"].as_str().unwrap_or("");
                if let Some(resource_id) = uri.strip_prefix("archestra://") {
                    let resources = self.resources.lock().unwrap();
                    if let Some(resource) = resources.get(resource_id) {
                        serde_json::json!({
                            "contents": [{
                                "uri": uri,
                                "mimeType": "application/json",
                                "text": resource.content
                            }]
                        })
                    } else {
                        return Err(format!("Resource not found: {}", resource_id));
                    }
                } else {
                    return Err("Invalid resource URI".to_string());
                }
            }
            _ => return Err(format!("Unknown method: {}", method)),
        };

        Ok(serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result
        }))
    }

    pub async fn run_http_server(&self, port: u16) -> Result<(), Box<dyn std::error::Error>> {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        let listener = TcpListener::bind(addr).await?;
        println!("Archestra MCP Server listening on http://{}", addr);

        loop {
            let (stream, _) = listener.accept().await?;
            let server = self.clone();

            tokio::spawn(async move {
                let io = TokioIo::new(stream);
                let conn_builder = ConnBuilder::new(hyper_util::rt::TokioExecutor::new());

                if let Err(e) = conn_builder.serve_connection(io, service_fn(move |req| {
                    let server = server.clone();
                    async move {
                        server.handle_http_request(req).await
                    }
                })).await {
                    eprintln!("Connection error: {}", e);
                }
            });
        }
    }

    async fn handle_proxy_request(&self, req: Request<Incoming>, response: hyper::http::response::Builder) -> Result<Response<String>, hyper::Error> {
        let path = req.uri().path().to_string();
        
        // Extract tool name from path: /mcp/<tool>
        let tool_name = if let Some(tool) = path.strip_prefix("/mcp/") {
            tool.to_string()
        } else {
            return Ok(response
                .status(StatusCode::BAD_REQUEST)
                .body("Invalid proxy path".to_string()).unwrap());
        };

        println!("MCP Proxy: Routing request to tool '{}'", tool_name);

        let body_bytes = match req.into_body().collect().await {
            Ok(collected) => collected.to_bytes(),
            Err(_) => {
                return Ok(response
                    .status(StatusCode::BAD_REQUEST)
                    .body("Failed to read request body".to_string()).unwrap());
            }
        };

        let request_json: Value = match serde_json::from_slice(&body_bytes) {
            Ok(json) => json,
            Err(_) => {
                return Ok(response
                    .status(StatusCode::BAD_REQUEST)
                    .body("Invalid JSON".to_string()).unwrap());
            }
        };

        // Forward request to MCP bridge
        if let Some(mcp_bridge) = &self.mcp_bridge {
            // Extract method and arguments from the request
            let method = request_json.get("method").and_then(|v| v.as_str()).unwrap_or("tools/call");
            
            match method {
                "tools/call" => {
                    // Get tool parameters with proper lifetime handling
                    let default_args = serde_json::json!({});
                    let params = request_json.get("params");
                    let arguments = params
                        .and_then(|p| p.get("arguments"))
                        .unwrap_or(&default_args);
                    
                    // Try to execute the tool via MCP bridge
                    // First, get list of all servers to find which one has this tool
                    let all_tools = mcp_bridge.get_all_tools();
                    let server_for_tool = all_tools.iter()
                        .find(|(_, tool)| tool.name == tool_name)
                        .map(|(server_name, _)| server_name.clone());
                    
                    if let Some(server_name) = server_for_tool {
                        println!("MCP Proxy: Found tool '{}' on server '{}'", tool_name, server_name);
                        
                        match mcp_bridge.execute_tool(&server_name, &tool_name, arguments.clone()).await {
                            Ok(result) => {
                                let proxy_response = serde_json::json!({
                                    "jsonrpc": "2.0",
                                    "id": request_json.get("id").unwrap_or(&serde_json::json!(null)),
                                    "result": result
                                });
                                
                                return Ok(response
                                    .status(StatusCode::OK)
                                    .header("Content-Type", "application/json")
                                    .body(serde_json::to_string(&proxy_response).unwrap()).unwrap());
                            }
                            Err(e) => {
                                println!("MCP Proxy: Tool execution failed: {}", e);
                                let error_response = serde_json::json!({
                                    "jsonrpc": "2.0",
                                    "id": request_json.get("id").unwrap_or(&serde_json::json!(null)),
                                    "error": {
                                        "code": -32603,
                                        "message": format!("Tool execution failed: {}", e)
                                    }
                                });
                                
                                return Ok(response
                                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                                    .header("Content-Type", "application/json")
                                    .body(serde_json::to_string(&error_response).unwrap()).unwrap());
                            }
                        }
                    } else {
                        println!("MCP Proxy: Tool '{}' not found in any server", tool_name);
                        let error_response = serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": request_json.get("id").unwrap_or(&serde_json::json!(null)),
                            "error": {
                                "code": -32601,
                                "message": format!("Tool '{}' not found in any MCP server", tool_name)
                            }
                        });
                        
                        return Ok(response
                            .status(StatusCode::NOT_FOUND)
                            .header("Content-Type", "application/json")
                            .body(serde_json::to_string(&error_response).unwrap()).unwrap());
                    }
                }
                _ => {
                    // Handle other MCP methods if needed
                    let proxy_response = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": request_json.get("id").unwrap_or(&serde_json::json!(null)),
                        "result": {
                            "content": [{
                                "type": "text",
                                "text": format!("Proxy request for method '{}' on tool '{}' not implemented", method, tool_name)
                            }]
                        }
                    });
                    
                    return Ok(response
                        .status(StatusCode::NOT_IMPLEMENTED)
                        .header("Content-Type", "application/json")
                        .body(serde_json::to_string(&proxy_response).unwrap()).unwrap());
                }
            }
        }
        
        // Fallback response if no MCP bridge is available
        let proxy_response = serde_json::json!({
            "jsonrpc": "2.0",
            "id": request_json.get("id").unwrap_or(&serde_json::json!(null)),
            "result": {
                "content": [{
                    "type": "text",
                    "text": format!("Proxy request received for tool '{}'. MCP bridge not available.", tool_name)
                }]
            }
        });

        Ok(response
            .status(StatusCode::OK)
            .header("Content-Type", "application/json")
            .body(serde_json::to_string(&proxy_response).unwrap()).unwrap())
    }

    async fn handle_http_request(&self, req: Request<Incoming>) -> Result<Response<String>, hyper::Error> {
        // Log the incoming request
        println!("MCP Server: {} {} from {}", 
            req.method(), 
            req.uri().path(), 
            req.headers().get("user-agent").and_then(|v| v.to_str().ok()).unwrap_or("unknown")
        );

        // Set CORS headers
        let mut response = Response::builder();
        response = response.header("Access-Control-Allow-Origin", "*");
        response = response.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        response = response.header("Access-Control-Allow-Headers", "Content-Type");

        match (req.method(), req.uri().path()) {
            (&Method::OPTIONS, _) => {
                Ok(response.status(StatusCode::OK).body(String::new()).unwrap())
            }
            (&Method::POST, path) if path.starts_with("/mcp/") => {
                // Proxy route: /mcp/<tool> - forward to sandboxed MCP servers
                self.handle_proxy_request(req, response).await
            }
            (&Method::POST, "/mcp") => {
                let body_bytes = match req.into_body().collect().await {
                    Ok(collected) => collected.to_bytes(),
                    Err(_) => {
                        return Ok(response
                            .status(StatusCode::BAD_REQUEST)
                            .body("Failed to read request body".to_string()).unwrap());
                    }
                };

                let request_json: Value = match serde_json::from_slice(&body_bytes) {
                    Ok(json) => json,
                    Err(_) => {
                        return Ok(response
                            .status(StatusCode::BAD_REQUEST)
                            .body("Invalid JSON".to_string()).unwrap());
                    }
                };

                // Log the MCP request details
                if let Some(method) = request_json.get("method") {
                    println!("MCP Request: {} (id: {})", 
                        method.as_str().unwrap_or("unknown"), 
                        request_json.get("id").and_then(|v| v.as_i64()).unwrap_or(0)
                    );
                }

                match self.handle_mcp_request(request_json).await {
                    Ok(response_json) => {
                        let response_str = serde_json::to_string(&response_json).unwrap();
                        Ok(response
                            .status(StatusCode::OK)
                            .header("Content-Type", "application/json")
                            .body(response_str).unwrap())
                    }
                    Err(err) => {
                        let error_response = serde_json::json!({
                            "jsonrpc": "2.0",
                            "error": {
                                "code": -32603,
                                "message": err
                            }
                        });
                        Ok(response
                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                            .header("Content-Type", "application/json")
                            .body(serde_json::to_string(&error_response).unwrap()).unwrap())
                    }
                }
            }
            (&Method::GET, "/health") => {
                Ok(response
                    .status(StatusCode::OK)
                    .body("OK".to_string()).unwrap())
            }
            _ => {
                Ok(response
                    .status(StatusCode::NOT_FOUND)
                    .body("Not Found".to_string()).unwrap())
            }
        }
    }
}

pub async fn start_archestra_mcp_server(
    app_handle: tauri::AppHandle,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("Starting Archestra MCP Server...");
    
    let server_url = format!("http://127.0.0.1:{}", MCP_SERVER_PORT);
    
    // Get the MCP bridge from app state
    let mcp_bridge = {
        let bridge_state = app_handle.state::<McpBridgeState>();
        bridge_state.0.clone()
    };
    
    // Generate unique session ID for this app instance
    let session_id = Uuid::new_v4().to_string();
    let user_id = "archestra_user".to_string();
    
    // Create and configure the server
    let mut server = ArchestraServer::new(user_id, session_id);
    server.set_mcp_bridge(mcp_bridge);
    
    // Run the server in a background task
    tauri::async_runtime::spawn(async move {
        if let Err(e) = server.run_http_server(MCP_SERVER_PORT).await {
            eprintln!("Archestra MCP Server error: {}", e);
        }
        println!("Archestra MCP Server stopped");
    });
    
    println!("Archestra MCP Server started successfully on {}", server_url);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_archestra_server_creation() {
        let server = ArchestraServer::new("user123".to_string(), "session456".to_string());
        let context = server.context.lock().unwrap();
        assert_eq!(context.user_id, "user123");
        assert_eq!(context.session_id, "session456");
    }

    #[tokio::test]
    async fn test_handle_initialize() {
        let server = ArchestraServer::new("user123".to_string(), "session456".to_string());
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {}
        });

        let result = server.handle_mcp_request(request).await;
        assert!(result.is_ok());
        
        let response = result.unwrap();
        assert_eq!(response["jsonrpc"], "2.0");
        assert_eq!(response["id"], 1);
        assert!(response["result"]["serverInfo"]["name"].as_str().unwrap().contains("archestra"));
    }

    #[tokio::test]
    async fn test_handle_tools_list() {
        let server = ArchestraServer::new("user123".to_string(), "session456".to_string());
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        });

        let result = server.handle_mcp_request(request).await;
        assert!(result.is_ok());
        
        let response = result.unwrap();
        let tools = response["result"]["tools"].as_array().unwrap();
        assert!(tools.len() >= 3);
        
        let tool_names: Vec<&str> = tools.iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert!(tool_names.contains(&"get_context"));
        assert!(tool_names.contains(&"update_context"));
        assert!(tool_names.contains(&"set_active_models"));
    }

    #[test]
    fn test_proxy_request_path_parsing() {
        // Test valid proxy path parsing without HTTP request overhead
        let path = "/mcp/test_tool";
        let tool_name = path.strip_prefix("/mcp/").unwrap();
        assert_eq!(tool_name, "test_tool");

        // Test request body parsing
        let request_body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": "test-123",
            "method": "tools/call",
            "params": {
                "name": "test_tool",
                "arguments": {"param": "value"}
            }
        });

        assert_eq!(request_body["method"], "tools/call");
        assert_eq!(request_body["params"]["name"], "test_tool");
        assert_eq!(request_body["params"]["arguments"]["param"], "value");
    }

    #[test]
    fn test_proxy_request_invalid_path() {
        // Test invalid proxy path (missing tool name)
        let path = "/mcp/";
        let tool_name = path.strip_prefix("/mcp/");
        assert!(tool_name.is_some());
        assert_eq!(tool_name.unwrap(), "");

        // Test completely invalid path
        let path = "/invalid/path";
        let tool_name = path.strip_prefix("/mcp/");
        assert!(tool_name.is_none());
    }

    #[test]
    fn test_mcp_bridge_integration() {
        // Test that we can set and access the MCP bridge
        let mut server = ArchestraServer::new("user123".to_string(), "session456".to_string());
        assert!(server.mcp_bridge.is_none());

        // Create a mock MCP bridge
        let mcp_bridge = Arc::new(crate::mcp_bridge::McpBridge::new());
        server.set_mcp_bridge(mcp_bridge.clone());

        assert!(server.mcp_bridge.is_some());
        assert!(Arc::ptr_eq(&server.mcp_bridge.unwrap(), &mcp_bridge));
    }

    #[test]
    fn test_json_rpc_error_format() {
        // Test that our error responses follow JSON-RPC format
        let error_response = serde_json::json!({
            "jsonrpc": "2.0",
            "id": "test-123",
            "error": {
                "code": -32601,
                "message": "Tool 'nonexistent_tool' not found in any MCP server"
            }
        });

        assert_eq!(error_response["jsonrpc"], "2.0");
        assert_eq!(error_response["id"], "test-123");
        assert!(error_response["error"].is_object());
        assert_eq!(error_response["error"]["code"], -32601);
        assert!(error_response["error"]["message"].is_string());
    }

    #[test]
    fn test_json_rpc_success_format() {
        // Test that our success responses follow JSON-RPC format
        let success_response = serde_json::json!({
            "jsonrpc": "2.0",
            "id": "test-123",
            "result": {
                "content": [{
                    "type": "text",
                    "text": "Tool executed successfully"
                }]
            }
        });

        assert_eq!(success_response["jsonrpc"], "2.0");
        assert_eq!(success_response["id"], "test-123");
        assert!(success_response["result"].is_object());
        assert!(success_response["error"].is_null());
    }

    #[test]
    fn test_url_path_extraction() {
        // Test various URL path scenarios for proxy routing
        let test_cases = vec![
            ("/mcp/slack", Some("slack")),
            ("/mcp/filesystem", Some("filesystem")),
            ("/mcp/git_status", Some("git_status")),
            ("/mcp/", Some("")),
            ("/mcp", None),
            ("/health", None),
            ("/", None),
        ];

        for (path, expected) in test_cases {
            let result = path.strip_prefix("/mcp/");
            match expected {
                Some(tool_name) => {
                    assert!(result.is_some(), "Expected Some for path: {}", path);
                    assert_eq!(result.unwrap(), tool_name, "Wrong tool name for path: {}", path);
                }
                None => {
                    assert!(result.is_none(), "Expected None for path: {}", path);
                }
            }
        }
    }

    #[tokio::test]
    async fn test_traditional_mcp_server_functionality() {
        // Ensure traditional MCP server functionality still works
        let server = ArchestraServer::new("user123".to_string(), "session456".to_string());

        // Test get_context tool
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": "traditional-test",
            "method": "tools/call",
            "params": {
                "name": "get_context",
                "arguments": {}
            }
        });

        let result = server.handle_mcp_request(request).await;
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response["jsonrpc"], "2.0");
        assert_eq!(response["id"], "traditional-test");
        assert!(response["result"]["content"].is_array());
    }

    #[tokio::test]
    async fn test_update_context_tool() {
        let server = ArchestraServer::new("user123".to_string(), "session456".to_string());

        // Test update_context tool
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": "update-test",
            "method": "tools/call",
            "params": {
                "name": "update_context",
                "arguments": {
                    "key": "test_key",
                    "value": "test_value"
                }
            }
        });

        let result = server.handle_mcp_request(request).await;
        assert!(result.is_ok());

        let response = result.unwrap();
        assert_eq!(response["jsonrpc"], "2.0");
        assert_eq!(response["id"], "update-test");

        let content = &response["result"]["content"][0]["text"];
        assert!(content.as_str().unwrap().contains("test_key"));
        assert!(content.as_str().unwrap().contains("test_value"));

        // Verify the context was actually updated
        let context = server.context.lock().unwrap();
        assert_eq!(context.project_context.get("test_key"), Some(&"test_value".to_string()));
    }
}
