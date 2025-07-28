use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;
use tracing::{debug, error, info};

pub mod database;
pub mod gateway;
pub mod models;
pub mod ollama;
pub mod openapi;
pub mod sandbox;

#[cfg(test)]
pub mod test_fixtures;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_http::init());

    // Configure the single instance plugin which should always be the first plugin you register
    // https://v2.tauri.app/plugin/deep-linking/#desktop
    #[cfg(desktop)]
    {
        debug!("Setting up single instance plugin...");
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            debug!("SINGLE INSTANCE CALLBACK: a new app instance was opened with {argv:?}");

            // HANDLER 1: Single Instance Deep Link Handler
            // This handles deep links when the app is ALREADY RUNNING and user clicks a deep link
            // Scenario: App is open → User clicks archestra-ai://foo-bar → This prevents opening
            // a second instance and processes the deep link in the existing app
            for arg in argv {
                if arg.starts_with("archestra-ai://") {
                    debug!("SINGLE INSTANCE: Found deep link in argv: {arg}");
                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        gateway::api::oauth::handle_oauth_callback(app_handle, arg.to_string())
                            .await;
                    });
                }
            }
        }));
        debug!("Single instance plugin set up successfully");
    }

    let app = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // Initialize database
            let app_handle = app.handle().clone();
            let db = tauri::async_runtime::block_on(async {
                database::init_database(&app_handle)
                    .await
                    .map_err(|e| format!("Database error: {e}"))
            })?;

            // Start all persisted MCP servers
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = models::mcp_server::sandbox::start_all_mcp_servers(app_handle).await
                {
                    error!("Failed to start MCP servers: {e}");
                }
            });

            // Start Ollama server automatically on app startup
            let ollama_service = ollama::server::Service::new(app.handle().clone());
            tauri::async_runtime::spawn(async move {
                if let Err(e) = ollama_service.start_server_on_startup().await {
                    error!("Failed to start Ollama server: {e}");
                }
            });

            // Start the archestra gateway server
            let user_id = "archestra_user".to_string();
            let db_for_mcp = db.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = gateway::start_gateway(user_id, db_for_mcp).await {
                    error!("Failed to start gateway: {e}");
                }
            });

            // Sync all connected external MCP clients
            let db = db.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) =
                    models::external_mcp_client::Model::sync_all_connected_external_mcp_clients(&db)
                        .await
                {
                    error!("Failed to sync all connected external MCP clients: {e}");
                }
            });

            // HANDLER 2: Deep Link Plugin Handler
            // This handles deep links when the app is FIRST LAUNCHED via deep link
            // Scenario: App is NOT running → User clicks archestra-ai://foo-bar → App starts up
            // and this handler processes the initial deep link during startup
            // https://v2.tauri.app/plugin/deep-linking/#listening-to-deep-links
            debug!("Setting up deep link handler...");
            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                debug!("DEEP LINK PLUGIN: Received URLs: {urls:?}");
                for url in urls {
                    debug!("DEEP LINK PLUGIN: Processing URL: {url}");
                    let app_handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        gateway::api::oauth::handle_oauth_callback(app_handle, url.to_string())
                            .await;
                    });
                }
            });
            debug!("Deep link handler set up successfully");

            #[cfg(debug_assertions)] // only include this code on debug builds
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
                window.close_devtools();
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api: _, .. } = event {
            info!("Archestra is shutting down, cleaning up resources...");

            // Block on async cleanup
            tauri::async_runtime::block_on(async {
                // Shutdown Ollama server
                if let Err(e) = ollama::server::shutdown().await {
                    error!("Failed to shutdown Ollama: {e}");
                }

                // Note: MCP servers will be stopped automatically via kill_on_drop, no need to explicitly stop them here
            });

            info!("Cleanup completed");
        }
    });
}
