use tauri_plugin_shell::ShellExt;

pub const OLLAMA_SERVER_PORT: u16 = 54588;

pub async fn start_ollama_server_on_startup(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::process::CommandEvent;

    println!("Starting Ollama server as sidecar on port {OLLAMA_SERVER_PORT}...");

    let sidecar_result = app_handle
        .shell()
        .sidecar("ollama-v0.9.6")
        .map_err(|e| format!("Failed to get sidecar: {e:?}"))?
        .env("OLLAMA_HOST", format!("127.0.0.1:{OLLAMA_SERVER_PORT}"))
        // Allow (proxied) requests from the archestra server
        .env("OLLAMA_ORIGINS", "http://localhost:54587")
        .env("OLLAMA_DEBUG", "0")
        .args(["serve"])
        .spawn();

    match sidecar_result {
        Ok((mut rx, _child)) => {
            println!("Ollama server started successfully on port {OLLAMA_SERVER_PORT}!");

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
            eprintln!("{error_msg}");
            Err(error_msg)
        }
    }
}
