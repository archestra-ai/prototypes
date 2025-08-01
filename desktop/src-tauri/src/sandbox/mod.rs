pub mod node;

use crate::models::mcp_server::{Model as MCPServerModel, ServerConfig};
use sea_orm::DatabaseConnection;
use rmcp::model::{Resource as MCPResource, Tool as MCPTool};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
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
#[derive(Clone)]
pub struct MCPServerManager {
    servers: Arc<RwLock<HashMap<String, MCPServer>>>,
    http_client: reqwest::Client,
    db: DatabaseConnection,
    app_data_dir: PathBuf,
}

impl MCPServerManager {
    pub fn new(app_data_dir: PathBuf, db: DatabaseConnection) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .unwrap_or_default();

        Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
            http_client,
            db,
            app_data_dir,
        }
    }

    fn resolve_app_data_dir_templated_env_var_value(
        &self,
        templated_env_var_value: String,
    ) -> Result<String, String> {
        Ok(templated_env_var_value.replace("{{ .app_data_dir }}", self.app_data_dir.to_str().unwrap()))
    }

    // TODO: add more template variables as needed
    /// Replace "template variables" in a value representing a "templated" environment variable, with actual values
    /// Currently supports: {{ .app_data_dir }} and {{ .mcp_server_port }}
    fn resolve_templated_env_var_value(
        &self,
        templated_env_var_value: String,
    ) -> Result<String, String> {
        let templated_env_var_value = self.resolve_app_data_dir_templated_env_var_value(templated_env_var_value)
            .map_err(|e| format!("Failed to resolve app_data_dir env var template: {e}"))?;

        Ok(templated_env_var_value)
    }

    /// Start an MCP server
    pub async fn start_server(
        &self,
        mcp_server: &MCPServerModel,
    ) -> Result<(), String> {
        let name = &mcp_server.name;

        let config: ServerConfig = serde_json::from_value(mcp_server.server_config.clone())
                .map_err(|e| format!("Failed to parse server config for {}: {e}", name))?;

        let command = config.command;
        let args = config.args;
        let env: HashMap<String, String> = config.env;

        // Check if server already exists
        let servers = self.servers.read().await;
        if let Some(existing) = servers.get(name) {
            if existing.is_running {
                return Err(format!("MCP server '{}' is already running", name));
            }
        }

        // Handle special case for npx commands
        let (actual_command, actual_args) = if command == "npx" {
            let node_info = node::detect_node_installation();

            if !node_info.is_available() {
                let instructions = node::get_node_installation_instructions();
                return Err(format!("Cannot start MCP server '{}': {instructions}", name));
            }

            if args.is_empty() {
                return Err(format!("No package specified for npx command in server '{}'", name));
            }

            let package_name = &args[0];
            let remaining_args = args[1..].to_vec();

            match node::get_npm_execution_command(package_name, &node_info) {
                Ok((cmd, cmd_args)) => {
                    let mut all_args = cmd_args;
                    all_args.extend(remaining_args);
                    (cmd, all_args)
                }
                Err(e) => return Err(format!("Failed to prepare npm execution for '{name}': {e}")),
            }
        } else if command == "http" {
            // Handle HTTP-based MCP server
            return self.start_http_mcp_server(name, &args, &env).await;
        } else {
            return Ok(());
        };

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

        debug!(
            "MCP [{}] Starting: {} {}",
            name,
            actual_command,
            actual_args.join(" ")
        );

        // Set environment variables
        for (key, value) in env {
            let value_with_resolved_template_values = self.resolve_templated_env_var_value(value)?;

            debug!("MCP [{name}] Setting env var: {key} = {value_with_resolved_template_values}");

            cmd.env(key, value_with_resolved_template_values);
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

        debug!("✅ MCP [{name}] Started successfully");
        Ok(())
    }

    /// Start an HTTP-based MCP server
    async fn start_http_mcp_server(
        &self,
        name: &String,
        args: &Vec<String>,
        env: &HashMap<String, String>,
    ) -> Result<(), String> {
        if args.is_empty() {
            return Err(format!("No URL specified for HTTP MCP server '{name}'"));
        }

        let url = args[0].clone();

        info!("🚀 MCP [{name}] Starting HTTP server at: {url}");

        // TODO: fix the .clone()s here once I learn about "lifetimes"
        let server = MCPServer {
            name: name.clone(),
            command: "http".to_string(),
            args: vec![url.clone()],
            server_type: ServerType::Http {
                url: url.clone(),
                headers: env.clone(),
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
            ServerType::Process => {
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

    /// Start all configured MCP servers
    pub async fn start_all_mcp_servers(&self) -> Result<(), String> {
        info!("Starting all persisted MCP servers...");

        let installed_mcp_servers = MCPServerModel::load_installed_mcp_servers(&self.db)
            .await
            .map_err(|e| format!("Failed to load MCP servers: {e}"))?;

        if installed_mcp_servers.is_empty() {
            info!("No installed MCP servers found to start.");
            return Ok(());
        }

        for server in &installed_mcp_servers {
            match self.start_server(server).await {
                Ok(_) => {} // Success already logged by start_server
                Err(e) => error!("❌ MCP [{}] Startup failed: {e}", server.name),
            }
        }

        let server_count = installed_mcp_servers.len();
        if server_count > 0 {
            debug!("✅ Queued {server_count} MCP servers for startup");
        }
        Ok(())
    }
}
