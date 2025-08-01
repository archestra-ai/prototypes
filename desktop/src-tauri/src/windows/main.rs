use tauri::{AppHandle, webview::{WebviewWindow, WebviewWindowBuilder}, WebviewUrl};
use tauri_utils::{
    TitleBarStyle,
    config::{LogicalPosition, WindowConfig}
};
use crate::consts::TAURI_WINDOW_PORT;


pub fn create_main_window(app: &AppHandle) -> Result<WebviewWindow, tauri::Error> {
    // we define the "main" window here EXPLICITLY because we want to use the localhost plugin
    // and we need to be able to configure the URL on it which is not possible in tauri.conf.json
    // NOTE: do not add a "main" window in tauri.conf.json, otherwise this will result in
    // Failed to setup app: error encountered during setup hook: a webview with label `main` already exists
    //
    // See these references for more information:
    //
    // https://v2.tauri.app/plugin/localhost/
    // https://github.com/tauri-apps/plugins-workspace/issues/1974
    // https://v2.tauri.app/security/capabilities/#remote-api-access
    let url = format!("http://localhost:{TAURI_WINDOW_PORT}").parse().unwrap();

    let window = WebviewWindowBuilder::from_config(app, &WindowConfig {
        label: "main".to_string(),
        url: WebviewUrl::External(url),
        fullscreen: false,
        width: 1200.0,
        height: 800.0,
        resizable: true,
        title: "Archestra AI".to_string(),
        title_bar_style: TitleBarStyle::Overlay,
        traffic_light_position: Some(LogicalPosition { x: 16.0, y: 17.0 }),
        ..Default::default()
    }).unwrap().build().unwrap();
    
    Ok(window)
}
