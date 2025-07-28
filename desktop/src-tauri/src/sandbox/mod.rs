use crate::database::connection::get_database_connection_with_app;
use crate::models::mcp_server::{MCPServerDefinition, Model as MCPServerModel, ServerConfig};
use rmcp::model::{Resource as MCPResource, Tool as MCPTool};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, Mutex as TokioMutex, RwLock};
use tracing::{debug, error, info};

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
    Container {
        container_id: String,
    },
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
pub struct MCPServer {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub server_type: ServerType,
    pub tools: Vec<MCPTool>,
    pub resources: Vec<MCPResource>,
    pub stdin_tx: Option<mpsc::Sender<String>>,
    pub response_buffer: Arc<TokioMutex<VecDeque<ResponseEntry>>>,
    pub process_handle: Option<Arc<TokioMutex<Child>>>,
    pub is_running: bool,
    pub last_health_check: Instant,
}

/// Manages MCP server processes and their lifecycle
pub struct MCPServerManager {
    servers: Arc<RwLock<HashMap<String, MCPServer>>>,
    http_client: reqwest::Client,
}

impl Default for MCPServerManager {
    fn default() -> Self {
        Self::new()
    }
}

impl MCPServerManager {
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

        // Handle HTTP-based MCP server
        if command == "http" {
            return self.start_http_mcp_server(name, args, env).await;
        }

        let env_vars = env.unwrap_or_default();
        debug!(
            "🚀 MCP [{}] Starting container with command: {} {}",
            name,
            command,
            args.join(" ")
        );

        // Generate a unique container name
        let container_name = format!("mcp-server-{}", name.replace(" ", "-").to_lowercase());
        
        // Get the podman binary path
        let podman_path = get_podman_binary_path()?;
        
        // Start the container using podman
        let mut cmd = Command::new(&podman_path);
        cmd
            .arg("run")
            .arg("--name")
            .arg(&container_name)
            .arg("--rm") // Remove container when it exits
            .arg("-i") // Interactive mode for stdin
            .arg("--pull=never") // Use local image only
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        // Add environment variables
        for (key, value) in env_vars {
            cmd.arg("-e").arg(format!("{}={}", key, value));
        }
        
        // Add the image name (TODO: This will be the GCR image URL later)
        cmd.arg("archestra/mcp-server-sandbox:latest");
        
        // Add the MCP server command and args
        cmd.arg(&command);
        cmd.args(&args);

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
                    error!("Failed to write to stdin: {e}");
                    break;
                }
                if let Err(e) = stdin.flush().await {
                    error!("Failed to flush stdin: {e}");
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
                // Only log non-JSON responses or errors for debugging
                if !line.trim_start().starts_with('{') {
                    debug!("MCP [{server_name_clone}] {line}");
                }

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
                error!("⚠️ MCP [{server_name_clone2}] {line}");
            }
        });

        // Create server instance
        let server = MCPServer {
            name: name.clone(),
            command: command.clone(),
            args: args.clone(),
            server_type: ServerType::Container {
                container_id: container_name.clone(),
            },
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

        debug!("✅ MCP [{name}] Started successfully");
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

        info!("🚀 MCP [{name}] Starting HTTP server at: {url}");

        let server = MCPServer {
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

        info!("✅ MCP [{name}] HTTP server started successfully");
        Ok(())
    }

    /// Stop an MCP server
    pub async fn stop_server(&self, server_name: &str) -> Result<(), String> {
        info!("🛑 MCP [{server_name}] Stopping server");

        let server = {
            let mut servers = self.servers.write().await;
            servers.remove(server_name)
        };

        if let Some(mut server) = server {
            server.is_running = false;

            // Close stdin channel
            drop(server.stdin_tx);

            // For containers, we need to stop the container explicitly
            if let ServerType::Container { container_id } = &server.server_type {
                // Stop the container using podman
                if let Ok(podman_path) = get_podman_binary_path() {
                    let stop_result = Command::new(&podman_path)
                        .arg("stop")
                        .arg(container_id)
                        .output()
                        .await;
                    
                    if let Err(e) = stop_result {
                        error!("⚠️ MCP [{server_name}] Failed to stop container: {e}");
                    }
                }
            }

            // Kill the process if it exists
            if let Some(process_handle) = server.process_handle {
                let mut child = process_handle.lock().await;
                if let Err(e) = child.kill().await {
                    error!("⚠️ MCP [{server_name}] Failed to kill process: {e}");
                }
            }

            info!("✅ MCP [{server_name}] Stopped successfully");
            Ok(())
        } else {
            error!("❌ MCP [{server_name}] Server not found");
            Err(format!("MCP server '{server_name}' not found"))
        }
    }

    /// Forward a raw request to a server
    pub async fn forward_raw_request(
        &self,
        server_name: &str,
        request_body: String,
    ) -> Result<String, String> {
        let servers = self.servers.read().await;

        let server = servers.get(server_name).ok_or_else(|| {
            let available = servers.keys().map(|s| s.as_str()).collect::<Vec<_>>();
            let available_str = if available.is_empty() {
                "none".to_string()
            } else {
                available.join(", ")
            };
            error!("❌ MCP [{server_name}] Server not found. Available: [{available_str}]");
            format!("Server '{server_name}' not found")
        })?;

        // Extract method and ID for clean logging
        let (method, request_id) =
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&request_body) {
                let method = json
                    .get("method")
                    .and_then(|m| m.as_str())
                    .unwrap_or("unknown");
                let id = json
                    .get("id")
                    .map(|id| format!("{id}"))
                    .unwrap_or_else(|| "null".to_string());
                (method.to_string(), id)
            } else {
                ("invalid-json".to_string(), "null".to_string())
            };

        debug!("📡 MCP [{server_name}] {method} (id: {request_id})");

        match &server.server_type {
            ServerType::Http { url, headers } => {
                let mut req = self
                    .http_client
                    .post(url)
                    .body(request_body)
                    .header("Content-Type", "application/json");

                for (key, value) in headers {
                    req = req.header(key, value);
                }

                let response = req.send().await.map_err(|e| {
                    error!("❌ MCP [{server_name}] HTTP request failed: {e}");
                    format!("HTTP request failed: {e}")
                })?;

                let status = response.status();
                let response_text = response.text().await.map_err(|e| {
                    error!("❌ MCP [{server_name}] Failed to read response: {e}");
                    format!("Failed to read response: {e}")
                })?;

                if status.is_success() {
                    debug!("✅ MCP [{server_name}] HTTP {method} completed");
                } else {
                    error!("⚠️ MCP [{server_name}] HTTP {method} returned {status}");
                }
                Ok(response_text)
            }
            ServerType::Container { .. } => {
                let stdin_tx = server.stdin_tx.as_ref().ok_or_else(|| {
                    error!("❌ MCP [{server_name}] No stdin channel available");
                    "No stdin channel available".to_string()
                })?;

                stdin_tx
                    .send(format!("{request_body}\n"))
                    .await
                    .map_err(|e| {
                        error!("❌ MCP [{server_name}] Failed to send to stdin: {e}");
                        format!("Failed to send request: {e}")
                    })?;

                // Parse request using our flexible structure
                let request: FlexibleJsonRpcRequest =
                    serde_json::from_str(&request_body).map_err(|e| {
                        error!("❌ MCP [{server_name}] Invalid JSON-RPC: {e}");
                        format!("Failed to parse request: {e}")
                    })?;

                // Check if this is a notification (no ID) or a regular request
                if request.id.is_none() {
                    debug!("📢 MCP [{server_name}] {method} notification sent");
                    return Ok("".to_string()); // Notifications don't expect responses
                }
                // Wait for response with matching ID
                let start_time = Instant::now();
                let mut last_status_log = start_time;
                let mut discarded_count = 0;

                loop {
                    let elapsed = start_time.elapsed();

                    if elapsed > REQUEST_TIMEOUT {
                        error!(
                            "⏰ MCP [{server_name}] {method} (id: {request_id}) timed out after {elapsed:?}"
                        );
                        return Err("Request timeout".to_string());
                    }

                    // Log status every 5 seconds instead of every 100 iterations
                    if elapsed.saturating_sub(last_status_log.elapsed()) >= Duration::from_secs(5) {
                        let buffer_size = server.response_buffer.lock().await.len();
                        if buffer_size > 0 || discarded_count > 0 {
                            debug!("⏳ MCP [{server_name}] Waiting for {method} response (buffer: {buffer_size}, discarded: {discarded_count})");
                        }
                        last_status_log = Instant::now();
                    }

                    let mut buffer = server.response_buffer.lock().await;
                    if let Some(entry) = buffer.pop_front() {
                        // Try to parse as generic JSON to check structure
                        if let Ok(json_value) =
                            serde_json::from_str::<serde_json::Value>(&entry.content)
                        {
                            if let Some(obj) = json_value.as_object() {
                                // Check if this is a response (has "result" or "error" field and "id")
                                if (obj.contains_key("result") || obj.contains_key("error"))
                                    && obj.contains_key("id")
                                {
                                    // Compare IDs directly
                                    let response_id = obj.get("id");
                                    let ids_match = match (&request.id, response_id) {
                                        (Some(req_id), Some(resp_id)) => req_id == resp_id,
                                        _ => false,
                                    };

                                    if ids_match {
                                        debug!("✅ MCP [{server_name}] {method} completed");
                                        return Ok(entry.content);
                                    } else {
                                        // Silently discard non-matching responses (like init responses)
                                        discarded_count += 1;
                                    }
                                } else {
                                    // Discard notifications and other non-response messages
                                    discarded_count += 1;
                                }
                            } else {
                                discarded_count += 1;
                            }
                        } else {
                            discarded_count += 1;
                        }
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
    static ref MCP_SERVER_MANAGER: MCPServerManager = MCPServerManager::new();
}

/// Start all configured MCP servers using the global manager
pub async fn start_all_mcp_servers(app: tauri::AppHandle) -> Result<(), String> {
    info!("Starting all persisted MCP servers...");

    let db = get_database_connection_with_app(&app)
        .await
        .map_err(|e| format!("Failed to connect to database: {e}"))?;

    let installed_mcp_servers = MCPServerModel::load_installed_mcp_servers(&db)
        .await
        .map_err(|e| format!("Failed to load MCP servers: {e}"))?;

    if installed_mcp_servers.is_empty() {
        info!("No installed MCP servers found to start.");
        return Ok(());
    }

    info!("Found {} MCP servers to start", installed_mcp_servers.len());

    let server_count = installed_mcp_servers.len();

    for server in &installed_mcp_servers {
        let server_name = server.name.clone();

        let config: ServerConfig = serde_json::from_value(server.server_config.clone())
            .map_err(|e| format!("Failed to parse server config for {server_name}: {e}"))?;

        debug!(
            "🚀 MCP [{}] Queuing startup: {} {}",
            server_name,
            config.command,
            config.args.join(" ")
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
                Ok(_) => {} // Success already logged by start_server
                Err(e) => error!("❌ MCP [{name}] Startup failed: {e}"),
            }
        });
    }

    if server_count > 0 {
        debug!("✅ Queued {server_count} MCP servers for startup");
    }
    Ok(())
}

/// Start an MCP server using the global manager
pub async fn start_mcp_server(definition: &MCPServerDefinition) -> Result<(), String> {
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

/// Get the path to the podman binary
pub fn get_podman_binary_path() -> Result<String, String> {
    // For now, use a simple path resolution
    // This will be updated when Tauri app context is available
    #[cfg(target_os = "macos")]
    {
        #[cfg(target_arch = "x86_64")]
        return Ok("binaries/podman-v5.5.2-x86_64-apple-darwin".to_string());
        #[cfg(target_arch = "aarch64")]
        return Ok("binaries/podman-v5.5.2-aarch64-apple-darwin".to_string());
    }
    #[cfg(target_os = "linux")]
    {
        Ok("binaries/podman-v5.5.2-x86_64-unknown-linux-gnu".to_string())
    }
    #[cfg(target_os = "windows")]
    {
        Ok("binaries/podman-v5.5.2-x86_64-pc-windows-msvc.exe".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("Unsupported platform".to_string())
    }
}
