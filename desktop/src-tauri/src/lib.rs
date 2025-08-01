#[macro_use] extern crate log;

use tauri::{Manager};
use tauri_plugin_deep_link::DeepLinkExt;

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

    // Initialize logging
    let log_plugin = tauri_plugin_log::Builder::new()
        // By default the plugin logs to stdout and to a file in the application logs directory.
        // To only use your own log targets, call clear_targets
        // https://v2.tauri.app/plugin/logging/#log-targets
        .clear_targets()
        .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::Stdout,
        ))
        .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::LogDir {
                file_name: Some("archestra".into())
            },
        ))
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(10))
        .max_file_size(1024 * 1024 * 5) // 5MB
        .with_colors(fern::colors::ColoredLevelConfig {
            error: fern::colors::Color::Red,
            warn: fern::colors::Color::Yellow,
            info: fern::colors::Color::Green,
            debug: fern::colors::Color::Cyan,
            trace: fern::colors::Color::Magenta,
        })
        .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseUtc)
        .level(log::LevelFilter::Debug)
        .build();

    let app = tauri::Builder::default()
        .plugin(log_plugin)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(move |app| {
            // Get the app data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data directory: {e}"))?;

            // Initialize database
            let db = tauri::async_runtime::block_on(async {
                database::init_database(&app_data_dir)
                    .await
                    .map_err(|e| format!("Database error: {e}"))
            }).unwrap();

            let websocket_service = gateway::websocket::Service::new();
            let mcp_server_sandbox_service = sandbox::MCPServerManager::new(
                app_data_dir.clone(),
                db.clone(),
            );

            // Start all persisted MCP servers
            let mcp_server_sandbox_service_for_mcp_servers = mcp_server_sandbox_service.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = mcp_server_sandbox_service_for_mcp_servers.start_all_mcp_servers().await {
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
            let app_handle = app.handle().clone();
            let mcp_server_sandbox_service_for_gateway = mcp_server_sandbox_service.clone();
            let websocket_service_for_gateway = websocket_service.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = gateway::start_gateway(
                    app_handle,
                    websocket_service_for_gateway,
                    mcp_server_sandbox_service_for_gateway,
                    user_id,
                    db_for_mcp,
                )
                .await
                {
                    error!("Failed to start gateway: {e}");
                }
            });

            // Sync all connected external MCP clients
            let db_for_sync = db.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) =
                    models::external_mcp_client::Model::sync_all_connected_external_mcp_clients(
                        &db_for_sync,
                    )
                    .await
                {
                    error!("Failed to sync all connected external MCP clients: {e}");
                }
            });

            // deep link handler
            // TODO: when we support > 1 deep link, we should update this logic to use a map of deep link handlers
            let app_data_dir = app_data_dir.clone();
            let websocket_service = websocket_service.clone();
            let db = db.clone();
            let mcp_server_sandbox_service = mcp_server_sandbox_service.clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();

                debug!("received deep link URLs: {urls:?}");

                for url in urls {
                    let app_data_dir = app_data_dir.clone();
                    let websocket_service = websocket_service.clone();
                    let db = db.clone();
                    let mcp_server_sandbox_service = mcp_server_sandbox_service.clone();
                    tauri::async_runtime::spawn(async move {
                        gateway::api::mcp_server::oauth::handle_oauth_callback(
                            &app_data_dir,
                            db.clone(),
                            websocket_service,
                            mcp_server_sandbox_service,
                            url.to_string(),
                        )
                        .await;
                    });
                }
            });

            // open devtools on debug builds
            #[cfg(debug_assertions)]
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
