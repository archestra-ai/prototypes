use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Manager;
use tokio::process::Child;
use tokio::sync::{mpsc, Mutex as TokioMutex};
use uuid::Uuid;

pub struct McpClientState(pub Arc<McpClient>);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: String,
    pub method: String,
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpResource {
    pub uri: String,
    pub name: String,
    pub description: Option<String>,
    pub mime_type: Option<String>,
}

// Constants for resource management
const MAX_BUFFER_SIZE: usize = 1000;
const RESPONSE_CLEANUP_INTERVAL: Duration = Duration::from_secs(300); // 5 minutes
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const TOOLS_LIST_TIMEOUT: Duration = Duration::from_secs(15); // Increased timeout for tools/list
const CHANNEL_CAPACITY: usize = 100;

#[derive(Debug)]
pub struct ResponseEntry {
    pub content: String,
    pub timestamp: Instant,
}

#[derive(Debug, Clone)]
pub enum ServerType {
    Process,
    Http {
        url: String,
        headers: std::collections::HashMap<String, String>,
    },
}

#[derive(Debug)]
pub struct McpServer {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub server_type: ServerType,
    pub tools: Vec<McpTool>,
    pub resources: Vec<McpResource>,
    pub stdin_tx: Option<mpsc::Sender<String>>,
    pub response_buffer: Arc<Mutex<VecDeque<ResponseEntry>>>,
    pub process_handle: Option<Arc<TokioMutex<Child>>>,
    pub is_running: bool,
    pub last_health_check: Instant,
}

pub struct McpClient {
    servers: Arc<Mutex<HashMap<String, McpServer>>>,
}

impl McpClient {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn get_server_tool_hints(&self, server_name: &str) -> Vec<McpTool> {
        // Generic pattern-based tool hints for common MCP servers
        // This allows the LLM to know what tools are likely available

        let server_lower = server_name.to_lowercase();

        if server_lower.contains("context7") || server_lower.contains("context-7") {
            vec![
                McpTool {
                    name: "resolve-library-id".to_string(),
                    description: Some(
                        "Find library by name and get Context7-compatible ID".to_string(),
                    ),
                    input_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "libraryName": {"type": "string", "description": "Library/package name to search for"}
                        },
                        "required": ["libraryName"]
                    }),
                },
                McpTool {
                    name: "get-library-docs".to_string(),
                    description: Some(
                        "Get documentation for a library using its Context7 ID".to_string(),
                    ),
                    input_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "context7CompatibleLibraryID": {"type": "string", "description": "Library ID from resolve-library-id"},
                            "topic": {"type": "string", "description": "Optional topic to focus on"},
                            "tokens": {"type": "number", "description": "Max tokens (default: 10000)"}
                        },
                        "required": ["context7CompatibleLibraryID"]
                    }),
                },
            ]
        } else if server_lower.contains("filesystem") || server_lower.contains("fs") {
            vec![
                McpTool {
                    name: "read_file".to_string(),
                    description: Some("Read contents of a file".to_string()),
                    input_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {"type": "string", "description": "File path to read"}
                        },
                        "required": ["path"]
                    }),
                },
                McpTool {
                    name: "write_file".to_string(),
                    description: Some("Write content to a file".to_string()),
                    input_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": {"type": "string", "description": "File path to write"},
                            "content": {"type": "string", "description": "Content to write"}
                        },
                        "required": ["path", "content"]
                    }),
                },
            ]
        } else if server_lower.contains("git") {
            vec![
                McpTool {
                    name: "git_status".to_string(),
                    description: Some("Get git repository status".to_string()),
                    input_schema: serde_json::json!({"type": "object", "properties": {}}),
                },
                McpTool {
                    name: "git_log".to_string(),
                    description: Some("Get git commit history".to_string()),
                    input_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "limit": {"type": "number", "description": "Number of commits to show"}
                        }
                    }),
                },
            ]
        } else {
            // No hints for unknown server types
            Vec::new()
        }
    }

    async fn discover_resources(&self, server_name: &str) -> Result<(), String> {
        println!("Discovering resources for MCP server '{}'", server_name);

        let list_resources_request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Uuid::new_v4().to_string(),
            method: "resources/list".to_string(),
            params: None,
        };

        // Send request and wait for response with retries
        match self
            .send_request_with_retry(server_name, &list_resources_request, 2)
            .await
        {
            Ok(response) => {
                println!("Received response for resources/list: {:?}", response);

                if let Some(result) = response.result {
                    if let Ok(resources_data) = serde_json::from_value::<serde_json::Value>(result)
                    {
                        if let Some(resources_array) =
                            resources_data.get("resources").and_then(|v| v.as_array())
                        {
                            let mut resources = Vec::new();
                            for resource_value in resources_array {
                                match serde_json::from_value::<McpResource>(resource_value.clone())
                                {
                                    Ok(resource) => {
                                        println!("Successfully parsed resource: {}", resource.uri);
                                        resources.push(resource);
                                    }
                                    Err(e) => {
                                        println!("Failed to parse resource: {}", e);
                                    }
                                }
                            }

                            // Update server with discovered resources
                            {
                                let mut servers = self.servers.lock().unwrap();
                                if let Some(server) = servers.get_mut(server_name) {
                                    server.resources = resources;
                                    println!(
                                        "Discovered {} resources for server '{}'",
                                        server.resources.len(),
                                        server_name
                                    );
                                }
                            }
                        }
                    }
                } else if let Some(error) = response.error {
                    // Resources might not be supported by this server
                    println!(
                        "Resources not supported by server '{}': {:?}",
                        server_name, error
                    );
                }
            }
            Err(e) => {
                // Non-fatal error - resources are optional
                println!("Failed to get resources list (may not be supported): {}", e);
            }
        }

        Ok(())
    }

    async fn send_http_request(
        &self,
        url: &str,
        headers: &std::collections::HashMap<String, String>,
        request: &JsonRpcRequest,
    ) -> Result<JsonRpcResponse, String> {
        let client = reqwest::Client::new();
        let request_json = serde_json::to_string(request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;

        println!("🌐 Sending HTTP request to {}: {}", url, request_json);

        // Build the HTTP request
        let mut req_builder = client
            .post(url)
            .header("Content-Type", "application/json")
            .body(request_json);

        // Add custom headers
        for (key, value) in headers {
            println!(
                "🔑 Adding header: {} = {}",
                key,
                if key.to_lowercase().contains("auth") || key.to_lowercase().contains("token") {
                    "***masked***"
                } else {
                    value
                }
            );
            req_builder = req_builder.header(key, value);
        }

        // Send request with timeout
        let response = req_builder
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "HTTP request failed with status: {}",
                response.status()
            ));
        }

        // Parse response
        let response_text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        println!("✅ Received HTTP response: {}", response_text);

        serde_json::from_str::<JsonRpcResponse>(&response_text)
            .map_err(|e| format!("Failed to parse JSON-RPC response: {}", e))
    }

    async fn send_request(
        &self,
        server_name: &str,
        request: &JsonRpcRequest,
    ) -> Result<(), String> {
        let request_json = serde_json::to_string(request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;

        println!("📤 Sending request to '{}': {}", server_name, request_json);

        // Get stdin channel sender and validate server state
        let (stdin_tx, is_running) = {
            let servers = self.servers.lock().unwrap();
            if let Some(server) = servers.get(server_name) {
                (server.stdin_tx.clone(), server.is_running)
            } else {
                return Err(format!(
                    "MCP server '{}' not found in registry",
                    server_name
                ));
            }
        };

        if !is_running {
            return Err(format!("MCP server '{}' is not running", server_name));
        }

        if let Some(stdin_tx) = stdin_tx {
            // Check if channel is closed before sending
            if stdin_tx.is_closed() {
                eprintln!(
                    "❌ Stdin channel is closed for MCP server '{}'",
                    server_name
                );
                return Err(format!("Stdin channel closed for server '{}'", server_name));
            }

            let message_with_newline = format!("{}\n", request_json);
            println!(
                "📬 Sending {} bytes to '{}' stdin (channel capacity remaining: {})",
                message_with_newline.len(),
                server_name,
                stdin_tx.capacity() - stdin_tx.max_capacity()
            );

            match stdin_tx.send(message_with_newline).await {
                Ok(_) => {
                    println!("✅ Request sent successfully to '{}'", server_name);
                }
                Err(e) => {
                    eprintln!("❌ Failed to send request to '{}': {}", server_name, e);

                    // Mark server as not running if channel is closed
                    {
                        let mut servers = self.servers.lock().unwrap();
                        if let Some(server) = servers.get_mut(server_name) {
                            server.is_running = false;
                            server.stdin_tx = None;
                            println!(
                                "🔄 Marked MCP server '{}' as not running due to channel failure",
                                server_name
                            );
                        }
                    }
                    return Err(format!("Failed to send to stdin channel: {}", e));
                }
            }
        } else {
            return Err(format!(
                "No stdin channel found for server '{}'",
                server_name
            ));
        }

        Ok(())
    }

    async fn send_request_with_retry(
        &self,
        server_name: &str,
        request: &JsonRpcRequest,
        max_retries: u32,
    ) -> Result<JsonRpcResponse, String> {
        let mut retries = 0;
        let mut last_error = String::new();

        while retries <= max_retries {
            match self.send_request_and_wait(server_name, request).await {
                Ok(response) => return Ok(response),
                Err(e) => {
                    last_error = e;
                    if retries < max_retries {
                        let delay = Duration::from_millis(100 * (2_u64.pow(retries)));
                        println!(
                            "Request failed, retrying in {:?}... (attempt {}/{})",
                            delay,
                            retries + 1,
                            max_retries
                        );
                        tokio::time::sleep(delay).await;
                    }
                    retries += 1;
                }
            }
        }

        Err(format!(
            "Request failed after {} retries: {}",
            max_retries, last_error
        ))
    }

    async fn send_tools_list_request(
        &self,
        server_name: &str,
        request: &JsonRpcRequest,
    ) -> Result<JsonRpcResponse, String> {
        self.send_request(server_name, request).await?;

        // Get response buffer
        let response_buffer = {
            let servers = self.servers.lock().unwrap();
            if let Some(server) = servers.get(server_name) {
                server.response_buffer.clone()
            } else {
                return Err("Server not found".to_string());
            }
        };

        // Wait for response with shorter timeout for tools/list
        let start_time = Instant::now();

        while start_time.elapsed() < TOOLS_LIST_TIMEOUT {
            // Check response buffer
            {
                let mut buffer = response_buffer.lock().unwrap();

                // Clean up old entries while we're here
                let now = Instant::now();
                buffer.retain(|entry| {
                    now.duration_since(entry.timestamp) < RESPONSE_CLEANUP_INTERVAL
                });

                // Process entries from oldest to newest
                let mut found_response = None;
                for (i, entry) in buffer.iter().enumerate() {
                    // Try to parse as JSON-RPC response
                    if let Ok(response) = serde_json::from_str::<JsonRpcResponse>(&entry.content) {
                        if response.id == request.id {
                            found_response = Some((i, response));
                            break;
                        }
                    }
                }

                // Remove the found response and return it
                if let Some((index, response)) = found_response {
                    buffer.remove(index);
                    return Ok(response);
                }
            }

            // Wait a bit before checking again
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        Err(format!(
            "Tools/list request '{}' to server '{}' timed out after {:?}",
            request.method, server_name, TOOLS_LIST_TIMEOUT
        ))
    }

    async fn send_request_and_wait(
        &self,
        server_name: &str,
        request: &JsonRpcRequest,
    ) -> Result<JsonRpcResponse, String> {
        self.send_request(server_name, request).await?;

        // Get response buffer
        let response_buffer = {
            let servers = self.servers.lock().unwrap();
            if let Some(server) = servers.get(server_name) {
                server.response_buffer.clone()
            } else {
                return Err("Server not found".to_string());
            }
        };

        // Wait for response with timeout
        let start_time = Instant::now();

        while start_time.elapsed() < REQUEST_TIMEOUT {
            // Check response buffer
            {
                let mut buffer = response_buffer.lock().unwrap();

                // Clean up old entries while we're here
                let now = Instant::now();
                buffer.retain(|entry| {
                    now.duration_since(entry.timestamp) < RESPONSE_CLEANUP_INTERVAL
                });

                // Process entries from oldest to newest
                let mut found_response = None;
                for (i, entry) in buffer.iter().enumerate() {
                    // Try to parse as JSON-RPC response
                    if let Ok(response) = serde_json::from_str::<JsonRpcResponse>(&entry.content) {
                        if response.id == request.id {
                            found_response = Some((i, response));
                            break;
                        }
                    }
                }

                // Remove the found response and return it
                if let Some((index, response)) = found_response {
                    buffer.remove(index);
                    return Ok(response);
                }
            }

            // Wait a bit before checking again
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        Err(format!(
            "Request '{}' to server '{}' timed out after {:?}",
            request.method, server_name, REQUEST_TIMEOUT
        ))
    }

    pub async fn execute_tool(
        &self,
        server_name: &str,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        println!(
            "🔧 Executing tool '{}' on server '{}' with args: {}",
            tool_name, server_name, arguments
        );

        // Verify server is running and get server type
        let server_type = {
            let servers = self.servers.lock().unwrap();
            if let Some(server) = servers.get(server_name) {
                if !server.is_running {
                    return Err(format!("MCP server '{}' is not running", server_name));
                }

                // Check if tool exists in discovered tools, but allow execution for dynamic discovery
                let tool_exists = server.tools.iter().any(|t| t.name == tool_name);
                if !tool_exists {
                    if server.tools.is_empty() {
                        println!("🔧 Attempting to execute tool '{}' on server '{}' (no tools pre-discovered)", tool_name, server_name);
                    } else {
                        println!("🔧 Tool '{}' not in pre-discovered tools for '{}', attempting dynamic execution", tool_name, server_name);
                    }
                }

                server.server_type.clone()
            } else {
                return Err(format!("MCP server '{}' not found", server_name));
            }
        };

        let tool_request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Uuid::new_v4().to_string(),
            method: "tools/call".to_string(),
            params: Some(serde_json::json!({
                "name": tool_name,
                "arguments": arguments
            })),
        };

        // Execute tool based on server type
        let response = match server_type {
            ServerType::Http { url, headers } => {
                // For HTTP servers, send request directly via HTTP
                self.send_http_request(&url, &headers, &tool_request).await
            }
            ServerType::Process => {
                // For process servers, send via stdin/stdout
                self.send_request_with_retry(server_name, &tool_request, 2)
                    .await
            }
        };

        match response {
            Ok(response) => {
                if let Some(error) = response.error {
                    Err(format!(
                        "Tool execution error: {} (code: {})",
                        error.message, error.code
                    ))
                } else if let Some(result) = response.result {
                    // If tool executed successfully but wasn't pre-discovered, add it dynamically
                    {
                        let mut servers = self.servers.lock().unwrap();
                        if let Some(server) = servers.get_mut(server_name) {
                            let tool_exists = server.tools.iter().any(|t| t.name == tool_name);
                            if !tool_exists {
                                println!("✅ Tool '{}' executed successfully on '{}', adding to discovered tools", tool_name, server_name);
                                server.tools.push(McpTool {
                                    name: tool_name.to_string(),
                                    description: Some(format!("Dynamically discovered tool from server {}", server_name)),
                                    input_schema: serde_json::json!({
                                        "type": "object",
                                        "description": "Schema not available - tool was dynamically discovered"
                                    }),
                                });
                                println!(
                                    "📊 Server '{}' now has {} tools total",
                                    server_name,
                                    server.tools.len()
                                );
                            }
                        }
                    }
                    Ok(result)
                } else {
                    Err("Tool execution returned empty result".to_string())
                }
            }
            Err(e) => Err(format!("Failed to execute tool '{}': {}", tool_name, e)),
        }
    }

    pub fn get_all_tools(&self) -> Vec<(String, McpTool)> {
        let servers = self.servers.lock().unwrap();
        let mut all_tools = Vec::new();

        for (server_name, server) in servers.iter() {
            if server.is_running {
                for tool in &server.tools {
                    all_tools.push((server_name.clone(), tool.clone()));
                }
            }
        }

        all_tools
    }

    pub fn get_all_resources(&self) -> Vec<(String, McpResource)> {
        let servers = self.servers.lock().unwrap();
        let mut all_resources = Vec::new();

        for (server_name, server) in servers.iter() {
            if server.is_running {
                for resource in &server.resources {
                    all_resources.push((server_name.clone(), resource.clone()));
                }
            }
        }

        all_resources
    }

    pub fn get_server_status(&self) -> HashMap<String, bool> {
        let servers = self.servers.lock().unwrap();
        servers
            .iter()
            .map(|(name, server)| (name.clone(), server.is_running))
            .collect()
    }

    pub fn get_debug_server_info(&self) -> Vec<String> {
        let servers = self.servers.lock().unwrap();
        let mut debug_info = Vec::new();

        for (name, server) in servers.iter() {
            let mut server_info = match &server.server_type {
                ServerType::Http { url, headers: _ } => {
                    format!("🌐 HTTP Server '{}': URL: {}", name, url)
                }
                ServerType::Process => {
                    format!(
                        "🖥️ Process Server '{}': Command: {} {:?}",
                        name, server.command, server.args
                    )
                }
            };

            server_info.push_str(&format!("\n  🏃 Running: {}", server.is_running));
            server_info.push_str(&format!("\n  🔧 Tools Count: {}", server.tools.len()));
            server_info.push_str(&format!(
                "\n  📁 Resources Count: {}",
                server.resources.len()
            ));

            // Server type specific info
            match &server.server_type {
                ServerType::Http { url: _, headers } => {
                    server_info.push_str(&format!(
                        "\n  🌐 HTTP Headers: {} configured",
                        headers.len()
                    ));
                    if !headers.is_empty() {
                        for (key, value) in headers.iter() {
                            let masked_value = if key.to_lowercase().contains("auth")
                                || key.to_lowercase().contains("token")
                            {
                                "***masked***"
                            } else {
                                value
                            };
                            server_info.push_str(&format!("\n    - {}: {}", key, masked_value));
                        }
                    }
                }
                ServerType::Process => {
                    // Stdin channel info (only for process servers)
                    if let Some(ref stdin_tx) = server.stdin_tx {
                        server_info.push_str(&format!("\n  📬 Stdin channel: ✅ Active"));
                        server_info.push_str(&format!("\n    - Capacity: {}", stdin_tx.capacity()));
                        server_info.push_str(&format!(
                            "\n    - Max capacity: {}",
                            stdin_tx.max_capacity()
                        ));
                        server_info
                            .push_str(&format!("\n    - Is closed: {}", stdin_tx.is_closed()));
                    } else {
                        server_info.push_str(&format!("\n  📬 Stdin channel: ❌ None"));
                    }

                    server_info.push_str(&format!(
                        "\n  🔄 Process handle: {}",
                        if server.process_handle.is_some() {
                            "✅ Available"
                        } else {
                            "❌ None"
                        }
                    ));
                }
            }

            server_info.push_str(&format!(
                "\n  ⏰ Last health check: {:?} ago",
                Instant::now().duration_since(server.last_health_check)
            ));

            // Response buffer info
            if let Ok(buffer) = server.response_buffer.lock() {
                server_info.push_str(&format!(
                    "\n  📦 Response buffer size: {}/{}",
                    buffer.len(),
                    MAX_BUFFER_SIZE
                ));
                if !buffer.is_empty() {
                    if let Some(latest) = buffer.back() {
                        let time_since = Instant::now().duration_since(latest.timestamp);
                        server_info.push_str(&format!(
                            "\n    - Latest response ({:?} ago): {}",
                            time_since,
                            if latest.content.len() > 100 {
                                format!("{}...", &latest.content[..100])
                            } else {
                                latest.content.clone()
                            }
                        ));
                    }
                }
            } else {
                server_info.push_str(&format!("\n  📦 Response buffer: ❌ Lock failed"));
            }

            debug_info.push(server_info);
        }

        debug_info
    }

}

#[tauri::command]
pub async fn get_mcp_tools(app: tauri::AppHandle) -> Result<Vec<(String, McpTool)>, String> {
    let client_state = app.state::<McpClientState>();
    Ok(client_state.0.get_all_tools())
}

#[tauri::command]
pub async fn debug_mcp_client(app: tauri::AppHandle) -> Result<String, String> {
    let client_state = app.state::<McpClientState>();
    let tools = client_state.0.get_all_tools();
    let statuses = client_state.0.get_server_status();

    let mut debug_info = String::new();
    debug_info.push_str(&format!("=== MCP Client Debug ===\n"));
    debug_info.push_str(&format!("Server Count: {}\n", statuses.len()));
    debug_info.push_str(&format!("Total Tools: {}\n\n", tools.len()));

    debug_info.push_str("=== Server Status ===\n");
    for (server_name, is_running) in &statuses {
        debug_info.push_str(&format!(
            "{}: {}\n",
            server_name,
            if *is_running {
                "🟢 Running"
            } else {
                "🔴 Stopped"
            }
        ));
    }

    debug_info.push_str("\n=== Discovered Tools ===\n");
    if tools.is_empty() {
        debug_info.push_str("❌ No tools discovered\n");
    } else {
        for (server_name, tool) in &tools {
            debug_info.push_str(&format!("Server '{}': Tool '{}'\n", server_name, tool.name));
            if let Some(desc) = &tool.description {
                debug_info.push_str(&format!("  Description: {}\n", desc));
            }
            debug_info.push_str(&format!("  Schema: {}\n", tool.input_schema));
        }
    }

    debug_info.push_str("\n=== Detailed Server Info ===\n");
    let server_info_list = client_state.0.get_debug_server_info();
    for server_info in server_info_list {
        debug_info.push_str(&server_info);
        debug_info.push_str("\n\n");
    }

    Ok(debug_info)
}
