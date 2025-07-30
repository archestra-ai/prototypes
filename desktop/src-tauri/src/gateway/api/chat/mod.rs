use axum::{
    http::{header, Method},
    Router,
};
use sea_orm::DatabaseConnection;
use tower_http::cors::{Any, CorsLayer};

pub mod crud;

/// Create the chat router with CRUD endpoints
pub fn create_router(db: DatabaseConnection) -> Router {
    // Configure CORS to handle all responses including errors
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
        .max_age(std::time::Duration::from_secs(3600));

    // Create CRUD router
    let crud_router = crud::create_crud_router(db);

    // Return the CRUD router with CORS
    crud_router.layer(cors)
}
