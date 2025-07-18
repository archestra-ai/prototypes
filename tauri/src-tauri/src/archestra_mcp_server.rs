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

#[derive(Debug, Clone)]
pub struct ArchestraServer {
    context: Arc<Mutex<ArchestraContext>>,
    resources: Arc<Mutex<HashMap<String, ArchestraResource>>>,
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
        }
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
    
    // Register the Archestra MCP Server in the database if it doesn't exist
    if let Err(e) = register_archestra_mcp_server(&app_handle, &server_url).await {
        eprintln!("Failed to register Archestra MCP Server: {}", e);
    }
    
    // Generate unique session ID for this app instance
    let session_id = Uuid::new_v4().to_string();
    let user_id = "archestra_user".to_string();
    
    // Create and run the server
    let server = ArchestraServer::new(user_id, session_id);
    
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

async fn register_archestra_mcp_server(app_handle: &tauri::AppHandle, server_url: &str) -> Result<(), String> {
    use crate::database::get_database_connection_with_app;
    
    let conn = get_database_connection_with_app(app_handle)
        .map_err(|e| format!("Failed to get database connection: {}", e))?;
    
    // Create the server configuration
    let server_name = "archestra-mcp-server";
    let command = server_url; // Use the HTTP URL as the command
    let args = vec!["--http"];
    let args_json = serde_json::to_string(&args)
        .map_err(|e| format!("Failed to serialize args: {}", e))?;
    
    // Insert or update the server configuration
    conn.execute(
        "INSERT OR REPLACE INTO mcp_servers (name, command, args) VALUES (?1, ?2, ?3)",
        [server_name, command, &args_json],
    ).map_err(|e| format!("Failed to register MCP server: {}", e))?;
    
    println!("Archestra MCP Server registered in database with URL: {}", server_url);
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
}
