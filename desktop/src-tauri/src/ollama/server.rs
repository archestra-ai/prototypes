use once_cell::sync::OnceCell;
use std::net::TcpListener;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Arc;
use tauri::AppHandle;
use tauri_plugin_shell::{process::CommandChild, ShellExt};
use tokio::sync::Mutex;
use tracing::{error, info};

use crate::ollama::client::OllamaClient;

pub const FALLBACK_OLLAMA_SERVER_PORT: u16 = 54588;

// List of required Ollama models that must be downloaded
pub const REQUIRED_OLLAMA_MODELS: &[&str] = &["llama-guard3:1b", "qwen3:1.7b"];

// Store the allocated port
static ALLOCATED_PORT: AtomicU16 = AtomicU16::new(0);

// Global app handle for emitting events
static APP_HANDLE: OnceCell<AppHandle> = OnceCell::new();

// Global Ollama process handle for shutdown
static OLLAMA_PROCESS: OnceCell<Arc<Mutex<Option<CommandChild>>>> = OnceCell::new();

pub struct Service {
    app_handle: AppHandle,
}

impl Service {
    pub fn new(app_handle: AppHandle) -> Self {
        // Store app handle globally for the proxy handler
        let _ = APP_HANDLE.set(app_handle.clone());

        Self { app_handle }
    }

    pub async fn ensure_required_models_are_downloaded(&self) -> Result<(), String> {
        let ollama_client = OllamaClient::new();
        let mut download_tasks = Vec::new();

        info!("Checking required Ollama models...");

        for model in REQUIRED_OLLAMA_MODELS {
            let model_name = (*model).to_string();
            let is_available = ollama_client
                .model_is_available(&model_name)
                .await
                .unwrap_or(false);

            if !is_available {
                info!("Model '{}' is not available, downloading...", model_name);
                let client = ollama_client.clone();
                let model_clone = model_name.clone();

                let download_task = tokio::spawn(async move {
                    match client.download_model(&model_clone).await {
                        Ok(_) => {
                            info!("✅ Successfully downloaded model: {}", model_clone);
                            Ok(())
                        }
                        Err(e) => {
                            error!("❌ Failed to download model '{}': {}", model_clone, e);
                            Err(format!("Failed to download model '{}': {}", model_clone, e))
                        }
                    }
                });

                download_tasks.push(download_task);
            } else {
                info!("✅ Model '{}' is already available", model_name);
            }
        }

        // Wait for all download tasks to complete
        let results = futures::future::join_all(download_tasks).await;

        // Check if any downloads failed
        for result in results {
            match result {
                Ok(inner_result) => {
                    if let Err(e) = inner_result {
                        return Err(e);
                    }
                }
                Err(e) => {
                    return Err(format!("Task join error: {}", e));
                }
            }
        }

        info!("✅ All required models are available");
        Ok(())
    }

    pub async fn start_server_on_startup(&self) -> Result<(), String> {
        use tauri_plugin_shell::process::CommandEvent;

        // Get a random available port
        let port = get_random_available_port()?;
        ALLOCATED_PORT.store(port, Ordering::Relaxed);

        info!("Starting Ollama server as sidecar on port {port}...");

        let sidecar_result = self
            .app_handle
            .shell()
            .sidecar("ollama-v0.9.6")
            .map_err(|e| format!("Failed to get sidecar: {e:?}"))?
            .env("OLLAMA_HOST", format!("127.0.0.1:{port}"))
            // Allow (proxied) requests from the archestra server
            .env("OLLAMA_ORIGINS", "http://localhost:54587")
            .env("OLLAMA_DEBUG", "0")
            .args(["serve"])
            .spawn();

        match sidecar_result {
            Ok((mut rx, child)) => {
                info!("Ollama server started successfully on port {port}!");

                // Store the process handle globally
                let process_handle = Arc::new(Mutex::new(Some(child)));
                let _ = OLLAMA_PROCESS.set(process_handle);

                // Handle output in background
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line_bytes) => {
                                let line = String::from_utf8_lossy(&line_bytes);
                                print!("[Ollama stdout] {line}");
                            }
                            CommandEvent::Stderr(line_bytes) => {
                                let line = String::from_utf8_lossy(&line_bytes);
                                eprint!("[Ollama stderr] {line}");
                            }
                            _ => {}
                        }
                    }
                });

                Ok(())
            }
            Err(e) => {
                let error_msg = format!("Failed to start Ollama server: {e:?}");
                error!("{error_msg}");
                Err(error_msg)
            }
        }
    }
}

// Helper function for the proxy handler to get the app handle
pub fn get_app_handle() -> Option<&'static AppHandle> {
    APP_HANDLE.get()
}

// Shutdown function to clean up Ollama process
pub async fn shutdown() -> Result<(), String> {
    info!("Shutting down Ollama server...");

    if let Some(process_handle) = OLLAMA_PROCESS.get() {
        let mut process_guard = process_handle.lock().await;
        if let Some(child) = process_guard.take() {
            match child.kill() {
                Ok(()) => {
                    info!("✅ Ollama server shut down successfully");
                    Ok(())
                }
                Err(e) => {
                    let error_msg = format!("⚠️ Failed to kill Ollama process: {e}");
                    error!("{error_msg}");
                    Err(error_msg)
                }
            }
        } else {
            info!("Ollama process was already terminated");
            Ok(())
        }
    } else {
        info!("No Ollama process handle found");
        Ok(())
    }
}

// Get a random available port
pub fn get_random_available_port() -> Result<u16, String> {
    match TcpListener::bind("127.0.0.1:0") {
        Ok(listener) => {
            let port = listener.local_addr().map_err(|e| e.to_string())?.port();
            drop(listener); // Release the port immediately
            Ok(port)
        }
        Err(e) => Err(format!("Failed to find available port: {e}")),
    }
}

// Get the allocated Ollama server port
// TODO: maybe this isn't ideal?
pub fn get_ollama_server_port() -> u16 {
    let port = ALLOCATED_PORT.load(Ordering::Relaxed);
    if port == 0 {
        // Fallback to default if not yet allocated
        FALLBACK_OLLAMA_SERVER_PORT
    } else {
        port
    }
}
