use super::{McpServerDefinition, ServerConfig};
use crate::database::connection::get_database_connection_with_app;
use crate::models::mcp_server::Model;
use crate::utils::node;
use rmcp::model::{JsonRpcResponse, Resource as McpResource, Tool as McpTool};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, Mutex as TokioMutex, RwLock};

// Constants for resource management
const MAX_BUFFER_SIZE: usize = 1000;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CHANNEL_CAPACITY: usize = 100;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlexibleJsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    pub params: Option<serde_json::Value>,
    pub id: Option<serde_json::Value>, // Make ID optional to handle notifications
}

#[derive(Debug, Clone)]
pub enum ServerType {
    Process,
    Http {
        url: String,
        headers: HashMap<String, String>,
    },
}

#[derive(Debug)]
pub struct ResponseEntry {
    pub content: String,
    pub timestamp: Instant,
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
    pub response_buffer: Arc<TokioMutex<VecDeque<ResponseEntry>>>,
    pub process_handle: Option<Arc<TokioMutex<Child>>>,
    pub is_running: bool,
    pub last_health_check: Instant,
}

/// Manages MCP server processes and their lifecycle
pub struct McpServerManager {
    servers: Arc<RwLock<HashMap<String, McpServer>>>,
    http_client: reqwest::Client,
}

impl Default for McpServerManager {
    fn default() -> Self {
        Self::new()
    }
}

impl McpServerManager {
    pub fn new() -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .unwrap_or_default();

        Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
            http_client,
        }
    }

    /// Start an MCP server
    pub async fn start_server(
        &self,
        name: String,
        command: String,
        args: Vec<String>,
        env: Option<HashMap<String, String>>,
    ) -> Result<(), String> {
        // Check if server already exists
        {
            let servers = self.servers.read().await;
            if let Some(existing) = servers.get(&name) {
                if existing.is_running {
                    return Err(format!("MCP server '{name}' is already running"));
                }
            }
        }

        // Handle special case for npx commands
        let (actual_command, actual_args) = if command == "npx" {
            let node_info = node::detect_node_installation();

            if !node_info.is_available() {
                let instructions = node::get_node_installation_instructions();
                return Err(format!(
                    "Cannot start MCP server '{name}': {instructions}"
                ));
            }

            if args.is_empty() {
                return Err(format!(
                    "No package specified for npx command in server '{name}'"
                ));
            }

            let package_name = &args[0];
            let remaining_args = args[1..].to_vec();

            match node::get_npm_execution_command(package_name, &node_info) {
                Ok((cmd, cmd_args)) => {
                    let mut all_args = cmd_args;
                    all_args.extend(remaining_args);
                    (cmd, all_args)
                }
                Err(e) => {
                    return Err(format!(
                        "Failed to prepare npm execution for '{name}': {e}"
                    ))
                }
            }
        } else if command == "http" {
            // Handle HTTP-based MCP server
            return self.start_http_mcp_server(name, args, env).await;
        } else {
            (command.clone(), args.clone())
        };

        println!(
            "🔧 Executing command: {actual_command} with args: {actual_args:?}"
        );

        let env_vars = env.unwrap_or_default();
        if !env_vars.is_empty() {
            println!("🌍 Environment variables:");
            for (key, value) in &env_vars {
                println!("   {key} = {value}");
            }
        }

        // Start the process with sandbox-exec for security (macOS only)
        let mut cmd = if cfg!(target_os = "macos") {
            let mut sandbox_cmd = Command::new("sandbox-exec");
            sandbox_cmd
                .arg("-f")
                .arg("./sandbox-exec-profiles/mcp-server-everything-for-now.sb")
                .arg(&actual_command)
                .args(&actual_args)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true);
            sandbox_cmd
        } else {
            let mut regular_cmd = Command::new(&actual_command);
            regular_cmd
                .args(&actual_args)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true);
            regular_cmd
        };

        // Set environment variables
        for (key, value) in env_vars {
            cmd.env(key, value);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn MCP server process: {e}"))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to get stdin handle".to_string())?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to get stdout handle".to_string())?;

        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to get stderr handle".to_string())?;

        let (stdin_tx, mut stdin_rx) = mpsc::channel::<String>(CHANNEL_CAPACITY);
        let response_buffer = Arc::new(TokioMutex::new(VecDeque::new()));
        let process_handle = Arc::new(TokioMutex::new(child));

        // Start stdin writer task
        let _stdin_writer_handle = tokio::spawn(async move {
            let mut stdin = stdin;
            while let Some(message) = stdin_rx.recv().await {
                if let Err(e) = stdin.write_all(message.as_bytes()).await {
                    eprintln!("Failed to write to stdin: {e}");
                    break;
                }
                if let Err(e) = stdin.flush().await {
                    eprintln!("Failed to flush stdin: {e}");
                    break;
                }
            }
        });

        // Start stdout reader task
        let buffer_clone = response_buffer.clone();
        let server_name_clone = name.clone();
        let _stdout_handle = tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                println!("[{server_name_clone}] stdout: {line}");

                let mut buffer = buffer_clone.lock().await;
                if buffer.len() >= MAX_BUFFER_SIZE {
                    buffer.pop_front();
                }
                buffer.push_back(ResponseEntry {
                    content: line,
                    timestamp: Instant::now(),
                });
            }
        });

        // Start stderr reader task
        let server_name_clone2 = name.clone();
        let _stderr_handle = tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[{server_name_clone2}] stderr: {line}");
            }
        });

        // Create server instance
        let server = McpServer {
            name: name.clone(),
            command: actual_command,
            args: actual_args,
            server_type: ServerType::Process,
            tools: Vec::new(),
            resources: Vec::new(),
            stdin_tx: Some(stdin_tx),
            response_buffer,
            process_handle: Some(process_handle),
            is_running: true,
            last_health_check: Instant::now(),
        };

        // Store the server
        {
            let mut servers = self.servers.write().await;
            servers.insert(name.clone(), server);
        }

        Ok(())
    }

    /// Start an HTTP-based MCP server
    async fn start_http_mcp_server(
        &self,
        name: String,
        args: Vec<String>,
        env: Option<HashMap<String, String>>,
    ) -> Result<(), String> {
        if args.is_empty() {
            return Err(format!("No URL specified for HTTP MCP server '{name}'"));
        }

        let url = args[0].clone();
        let headers = env.unwrap_or_default();

        println!("🌐 Starting HTTP MCP server '{name}' at URL: {url}");

        let server = McpServer {
            name: name.clone(),
            command: "http".to_string(),
            args: vec![url.clone()],
            server_type: ServerType::Http {
                url: url.clone(),
                headers: headers.clone(),
            },
            tools: Vec::new(),
            resources: Vec::new(),
            stdin_tx: None,
            response_buffer: Arc::new(TokioMutex::new(VecDeque::new())),
            process_handle: None,
            is_running: true,
            last_health_check: Instant::now(),
        };

        {
            let mut servers = self.servers.write().await;
            servers.insert(name.clone(), server);
        }

        println!("✅ HTTP MCP server '{name}' started successfully");
        Ok(())
    }

    /// Stop an MCP server
    pub async fn stop_server(&self, server_name: &str) -> Result<(), String> {
        println!("🛑 Stopping MCP server '{server_name}'");

        let server = {
            let mut servers = self.servers.write().await;
            servers.remove(server_name)
        };

        if let Some(mut server) = server {
            server.is_running = false;

            // Close stdin channel
            drop(server.stdin_tx);

            // Kill the process if it exists
            if let Some(process_handle) = server.process_handle {
                let mut child = process_handle.lock().await;
                match child.kill().await {
                    Ok(_) => println!("✅ Process killed successfully"),
                    Err(e) => eprintln!("⚠️ Failed to kill process: {e}"),
                }
            }

            println!("✅ MCP server '{server_name}' stopped");
            Ok(())
        } else {
            Err(format!("MCP server '{server_name}' not found"))
        }
    }

    /// Forward a raw request to a server
    pub async fn forward_raw_request(
        &self,
        server_name: &str,
        request_body: String,
    ) -> Result<String, String> {
        println!("🔍 Looking up server '{server_name}' in manager");
        let servers = self.servers.read().await;
        println!("📊 Total servers in manager: {}", servers.len());

        // List all available servers for debugging
        for (name, _) in servers.iter() {
            println!("   - Available server: '{name}'");
        }

        let server = servers.get(server_name).ok_or_else(|| {
            println!("❌ Server '{server_name}' not found in manager");
            format!("Server '{server_name}' not found")
        })?;

        println!(
            "✅ Found server '{}', type: {:?}",
            server_name,
            match &server.server_type {
                ServerType::Http { url, .. } => format!("HTTP ({url})"),
                ServerType::Process => "Process".to_string(),
            }
        );

        match &server.server_type {
            ServerType::Http { url, headers } => {
                println!("🌐 Forwarding HTTP request to: {url}");
                // For HTTP servers, forward the request as-is
                let mut req = self
                    .http_client
                    .post(url)
                    .body(request_body)
                    .header("Content-Type", "application/json");

                for (key, value) in headers {
                    println!("📎 Adding header: {key} = {value}");
                    req = req.header(key, value);
                }

                println!("📡 Sending HTTP request...");
                let response = req.send().await.map_err(|e| {
                    println!("❌ HTTP request failed: {e}");
                    format!("HTTP request failed: {e}")
                })?;

                println!("📨 Received HTTP response, status: {}", response.status());
                let response_text = response.text().await.map_err(|e| {
                    println!("❌ Failed to read HTTP response: {e}");
                    format!("Failed to read response: {e}")
                })?;

                println!("✅ HTTP response received successfully");
                Ok(response_text)
            }
            ServerType::Process => {
                println!("🔧 Processing request for process-based server");
                // For process servers, send via stdin and wait for response
                let stdin_tx = server.stdin_tx.as_ref().ok_or_else(|| {
                    println!("❌ No stdin channel available for server '{server_name}'");
                    "No stdin channel available".to_string()
                })?;

                println!("📤 Sending request to process stdin...");
                println!("📋 Raw request body: {request_body}");
                println!("📏 Request body length: {} bytes", request_body.len());

                // Let's also try to parse as generic JSON first to see what fields are present
                if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&request_body) {
                    println!(
                        "📊 Parsed as JSON. Keys present: {:?}",
                        json_value
                            .as_object()
                            .map(|obj| obj.keys().collect::<Vec<_>>())
                    );
                    println!(
                        "📝 Full JSON structure: {}",
                        serde_json::to_string_pretty(&json_value).unwrap_or_default()
                    );
                } else {
                    println!("❌ Request body is not valid JSON");
                }

                stdin_tx
                    .send(format!("{request_body}\n"))
                    .await
                    .map_err(|e| {
                        println!("❌ Failed to send request to stdin: {e}");
                        format!("Failed to send request: {e}")
                    })?;

                // Parse request using our flexible structure
                let request: FlexibleJsonRpcRequest =
                    serde_json::from_str(&request_body).map_err(|e| {
                        println!("❌ Failed to parse JSON-RPC request: {e}");
                        format!("Failed to parse request: {e}")
                    })?;

                println!(
                    "🔍 Parsed request - method: {}, id: {:?}",
                    request.method, request.id
                );

                // Check if this is a notification (no ID) or a regular request
                if request.id.is_none() {
                    println!("📢 This is a JSON-RPC notification (no response expected)");
                    return Ok("".to_string()); // Notifications don't expect responses
                }

                println!("🕐 Waiting for response with ID: {:?}", request.id);
                // Wait for response with matching ID
                let start_time = Instant::now();
                let mut iteration_count = 0;
                loop {
                    iteration_count += 1;
                    let elapsed = start_time.elapsed();

                    if elapsed > REQUEST_TIMEOUT {
                        println!(
                            "⏰ Request timeout after {iteration_count} iterations ({elapsed:?})"
                        );
                        return Err("Request timeout".to_string());
                    }

                    if iteration_count % 100 == 0 {
                        println!(
                            "⏳ Still waiting... iteration {iteration_count}, elapsed: {elapsed:?}"
                        );
                    }

                    let mut buffer = server.response_buffer.lock().await;
                    let buffer_size = buffer.len();

                    if iteration_count % 100 == 0 && buffer_size > 0 {
                        println!("📋 Response buffer size: {buffer_size}");
                    }

                    while let Some(entry) = buffer.pop_front() {
                        println!("📨 Processing buffer entry: {}", entry.content);
                        if let Ok(response) =
                            serde_json::from_str::<JsonRpcResponse>(&entry.content)
                        {
                            println!("✅ Parsed JSON-RPC response with ID: {:?}", response.id);

                            // Convert request.id to match response.id format for comparison
                            let ids_match = match &request.id {
                                Some(req_id) => {
                                    // Convert serde_json::Value to string for comparison
                                    match req_id {
                                        serde_json::Value::Number(n) => {
                                            response.id.to_string() == n.to_string()
                                        }
                                        serde_json::Value::String(s) => {
                                            response.id.to_string() == *s
                                        }
                                        _ => response.id.to_string() == *req_id,
                                    }
                                }
                                None => false, // Should not happen since we checked earlier
                            };

                            if ids_match {
                                println!("🎯 Found matching response for ID: {:?}", request.id);
                                return Ok(entry.content);
                            } else {
                                println!(
                                    "🔄 Response ID {:?} doesn't match request ID {:?}",
                                    response.id, request.id
                                );
                            }
                        } else {
                            println!("❌ Failed to parse response as JSON-RPC: {}", entry.content);
                        }
                        // Put it back if it's not our response
                        buffer.push_front(entry);
                        break;
                    }

                    drop(buffer);
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            }
        }
    }
}

// Create a global instance of the manager
lazy_static::lazy_static! {
    static ref MCP_SERVER_MANAGER: McpServerManager = McpServerManager::new();
}

/// Start all configured MCP servers using the global manager
pub async fn start_all_mcp_servers(app: tauri::AppHandle) -> Result<(), String> {
    println!("Starting all persisted MCP servers...");

    let db = get_database_connection_with_app(&app)
        .await
        .map_err(|e| format!("Failed to connect to database: {e}"))?;

    let installed_mcp_servers = Model::load_installed_mcp_servers(&db)
        .await
        .map_err(|e| format!("Failed to load MCP servers: {e}"))?;

    if installed_mcp_servers.is_empty() {
        println!("No installed MCP servers found to start.");
        return Ok(());
    }

    println!("Found {} MCP servers to start", installed_mcp_servers.len());

    for server in installed_mcp_servers {
        let server_name = server.name.clone();

        let config: ServerConfig = serde_json::from_str(&server.server_config)
            .map_err(|e| format!("Failed to parse server config for {server_name}: {e}"))?;

        println!(
            "🚀 Starting MCP server '{server_name}' with persistent connection"
        );
        println!(
            "📋 Server config - Command: '{}', Args: {:?}",
            config.command, config.args
        );

        tauri::async_runtime::spawn(async move {
            let name = server_name.clone();
            match MCP_SERVER_MANAGER
                .start_server(
                    server_name.clone(),
                    config.command,
                    config.args,
                    Some(config.env),
                )
                .await
            {
                Ok(_) => println!("✅ MCP server '{name}' started successfully"),
                Err(e) => eprintln!("❌ Failed to start MCP server '{name}': {e}"),
            }
        });
    }

    println!("All MCP servers have been queued for startup.");
    Ok(())
}

/// Start an MCP server using the global manager
pub async fn start_mcp_server(definition: &McpServerDefinition) -> Result<(), String> {
    MCP_SERVER_MANAGER
        .start_server(
            definition.name.clone(),
            definition.server_config.command.clone(),
            definition.server_config.args.clone(),
            Some(definition.server_config.env.clone()),
        )
        .await
}

/// Stop an MCP server using the global manager
pub async fn stop_mcp_server(server_name: &str) -> Result<(), String> {
    MCP_SERVER_MANAGER.stop_server(server_name).await
}

/// Forward a raw request using the global manager
pub async fn forward_raw_request(
    server_name: &str,
    request_body: String,
) -> Result<String, String> {
    MCP_SERVER_MANAGER
        .forward_raw_request(server_name, request_body)
        .await
}
