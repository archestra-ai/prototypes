// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri_plugin_shell;
use tauri_plugin_shell::ShellExt;
// use tauri_plugin_shell::process::CommandEvent;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// #[tauri::command]
// async fn run_node_server_sidecar(app: tauri::AppHandle) -> Result<String, String> {
//     let sidecar_command = app.shell().sidecar("binaries/hello-server").map_err(|e| e.to_string())?;
//     let (mut rx, mut _child) = sidecar_command.spawn().map_err(|e| e.to_string())?;
//     let mut output = String::new();
//     while let Some(event) = rx.recv().await {
//         if let CommandEvent::Stdout(line_bytes) = event {
//             let line = String::from_utf8_lossy(&line_bytes);
//             output.push_str(&line);
//         }
//     }
//     Ok(output)
// }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // let sidecar_command = app.shell().sidecar("binaries/hello-server").unwrap();
    // let (mut rx, mut _child) = sidecar_command
    //     .spawn()
    //     .expect("Failed to spawn sidecar");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // Start the MCP server using shell command
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                println!("Starting MCP server with command: npx @modelcontextprotocol/server-everything streamableHttp");
                match app_handle.shell()
                    .command("npx")
                    .args(["@modelcontextprotocol/server-everything", "streamableHttp", "--port", "3001"])
                    .spawn() {
                    Ok((mut rx, child)) => {
                        println!("MCP server started successfully via npx! PID: {:?}", child.pid());
                        
                        // Handle command output
                        tauri::async_runtime::spawn(async move {
                            while let Some(event) = rx.recv().await {
                                match event {
                                    tauri_plugin_shell::process::CommandEvent::Stdout(data) => {
                                        println!("MCP stdout: {}", String::from_utf8_lossy(&data));
                                    }
                                    tauri_plugin_shell::process::CommandEvent::Stderr(data) => {
                                        eprintln!("MCP stderr: {}", String::from_utf8_lossy(&data));
                                    }
                                    tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                                        println!("MCP server terminated with code: {:?}", payload.code);
                                        break;
                                    }
                                    _ => {}
                                }
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("Failed to start MCP server via npx: {:?}", e);
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
