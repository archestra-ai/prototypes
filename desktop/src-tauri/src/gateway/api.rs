use axum::{
    body::Body,
    extract::State,
    http::Request,
    response::IntoResponse,
    routing::{any, Router},
    Json,
};
use sea_orm::DatabaseConnection;
use std::sync::Arc;

struct Service {
    db: Arc<DatabaseConnection>,
}

impl Service {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db: Arc::new(db) }
    }

    async fn call(&self, _request: Request<Body>) -> impl IntoResponse {
        Json("Hello, world!")
    }
}

async fn handler(State(service): State<Arc<Service>>, request: Request<Body>) -> impl IntoResponse {
    service.call(request).await
}

pub fn create_router(db: DatabaseConnection) -> Router {
    Router::new()
        .route("/", any(handler))
        .with_state(Arc::new(Service::new(db)))
}
