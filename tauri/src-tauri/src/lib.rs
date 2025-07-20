use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener;
use tauri_plugin_shell;
#[cfg(desktop)]
use tauri_plugin_single_instance;

pub mod archestra_mcp_server;
pub mod database;
pub mod models;
pub mod ollama;
pub mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Configure the single instance plugin which should always be the first plugin you register
    // https://v2.tauri.app/plugin/deep-linking/#desktop
    #[cfg(desktop)]
    {
        println!("Setting up single instance plugin...");
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            println!("SINGLE INSTANCE CALLBACK: a new app instance was opened with {argv:?}");

            // HANDLER 1: Single Instance Deep Link Handler
            // This handles deep links when the app is ALREADY RUNNING and user clicks a deep link
            // Scenario: App is open → User clicks archestra-ai://foo-bar → This prevents opening
            // a second instance and processes the deep link in the existing app
            for arg in argv {
                if arg.starts_with("archestra-ai://") {
                    println!("SINGLE INSTANCE: Found deep link in argv: {}", arg);
                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        models::mcp_server::oauth::handle_oauth_callback(
                            app_handle,
                            arg.to_string(),
                        )
                        .await;
                    });
                }
            }
        }));
        println!("Single instance plugin set up successfully");
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // Initialize database
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async {
                database::init_database(&app_handle)
                    .await
                    .map_err(|e| format!("Database error: {}", e))
            })?;

            // Start all persisted MCP servers
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = models::mcp_server::sandbox::start_all_mcp_servers(app_handle).await {
                    eprintln!("Failed to start MCP servers: {}", e);
                }
            });

            // Start Ollama server automatically on app startup
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = ollama::start_ollama_server_on_startup(app_handle).await {
                    eprintln!("Failed to start Ollama server: {}", e);
                }
            });

            // Start the Archestra MCP Server
            let user_id = "archestra_user".to_string();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = archestra_mcp_server::start_archestra_mcp_server(user_id).await {
                    eprintln!("Failed to start Archestra MCP Server: {}", e);
                }
            });

            // HANDLER 2: Deep Link Plugin Handler
            // This handles deep links when the app is FIRST LAUNCHED via deep link
            // Scenario: App is NOT running → User clicks archestra-ai://foo-bar → App starts up
            // and this handler processes the initial deep link during startup
            // https://v2.tauri.app/plugin/deep-linking/#listening-to-deep-links
            println!("Setting up deep link handler...");
            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                println!("DEEP LINK PLUGIN: Received URLs: {:?}", urls);
                for url in urls {
                    println!("DEEP LINK PLUGIN: Processing URL: {}", url);
                    let app_handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        models::mcp_server::oauth::handle_oauth_callback(
                            app_handle,
                            url.to_string(),
                        )
                        .await;
                    });
                }
            });
            println!("Deep link handler set up successfully");

            // Open devtools in debug mode
            #[cfg(debug_assertions)]
            {
                let _window = app.get_webview_window("main").unwrap();
                // window.open_devtools();
                // window.close_devtools();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ollama::get_ollama_port,
            models::mcp_server::save_mcp_server,
            models::mcp_server::save_mcp_server_from_catalog,
            models::mcp_server::load_mcp_servers,
            models::mcp_server::delete_mcp_server,
            models::mcp_server::get_mcp_connector_catalog,
            models::mcp_server::oauth::start_oauth_auth,
            models::client_connection_config::connect_mcp_client,
            models::client_connection_config::disconnect_mcp_client,
            models::client_connection_config::check_client_connection_status,
            models::client_connection_config::notify_new_mcp_tools_available,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
