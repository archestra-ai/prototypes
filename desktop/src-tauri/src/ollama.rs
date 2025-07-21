use crate::utils::get_free_port;
use std::sync::OnceLock;
use tauri_plugin_shell::ShellExt;

// Global state for Ollama server port
static OLLAMA_PORT: OnceLock<u16> = OnceLock::new();

pub async fn start_ollama_server_on_startup(app_handle: tauri::AppHandle) -> Result<u16, String> {
    use tauri_plugin_shell::process::CommandEvent;

    let port = get_free_port()?;
    println!("Starting Ollama server as sidecar on port {port}...");

    let sidecar_result = app_handle
        .shell()
        .sidecar("ollama")
        .map_err(|e| format!("Failed to get sidecar: {e:?}"))?
        .env("OLLAMA_HOST", format!("127.0.0.1:{port}"))
        .env("OLLAMA_DEBUG", "0")
        .args(["serve"])
        .spawn();

    match sidecar_result {
        Ok((mut rx, _child)) => {
            println!("Ollama server started successfully on port {port}!");

            // Store the port globally
            OLLAMA_PORT
                .set(port)
                .map_err(|_| "Failed to store Ollama port")?;

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

            Ok(port)
        }
        Err(e) => {
            let error_msg = format!("Failed to start Ollama server: {e:?}");
            eprintln!("{error_msg}");
            Err(error_msg)
        }
    }
}

#[tauri::command]
pub fn get_ollama_port() -> Result<u16, String> {
    OLLAMA_PORT
        .get()
        .copied()
        .ok_or_else(|| "Ollama server not started".to_string())
}
