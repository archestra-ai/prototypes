// For local development, we use the Vite dev server, otherwise we use a fixed port
pub const TAURI_WINDOW_PORT: u16 = if cfg!(debug_assertions) { 1420 } else { 54586 };

pub const GATEWAY_SERVER_PORT: u16 = 54587;
