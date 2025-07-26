use axum::routing::Router;
use sea_orm::DatabaseConnection;
use tauri::AppHandle;

pub mod ollama;

pub fn create_router(app_handle: AppHandle, db: DatabaseConnection) -> Router {
    Router::new().nest_service("/ollama", ollama::create_router(app_handle, db))
}
