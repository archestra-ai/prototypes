use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post},
    Router,
};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::ToSchema;

use crate::models::external_mcp_client::Model as ExternalMCPClient;

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[schema(as = ConnectExternalMCPClientRequest)]
pub struct ConnectRequest {
    pub client_name: String,
}

pub struct Service {
    db: Arc<DatabaseConnection>,
}

impl Service {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    async fn get_connected_external_mcp_clients(&self) -> Result<Vec<ExternalMCPClient>, String> {
        ExternalMCPClient::get_connected_external_mcp_clients(&self.db)
            .await
            .map_err(|e| format!("Failed to get connected external MCP clients: {e}"))
    }

    async fn get_supported_external_mcp_clients(&self) -> Result<Vec<String>, String> {
        Ok(ExternalMCPClient::SUPPORTED_CLIENT_NAMES
            .into_iter()
            .map(|s| s.to_string())
            .collect())
    }

    async fn connect_external_mcp_client(&self, client_name: String) -> Result<(), String> {
        ExternalMCPClient::connect_external_mcp_client(&self.db, &client_name).await
    }

    async fn disconnect_external_mcp_client(&self, client_name: String) -> Result<(), String> {
        ExternalMCPClient::disconnect_external_mcp_client(&self.db, &client_name).await
    }
}

#[utoipa::path(
    get,
    path = "/api/external_mcp_client",
    tag = "external_mcp_client",
    responses(
        (status = 200, description = "List of connected external MCP clients", body = Vec<ExternalMCPClient>),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_connected_external_mcp_clients(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<ExternalMCPClient>>, StatusCode> {
    service
        .get_connected_external_mcp_clients()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    get,
    path = "/api/external_mcp_client/supported",
    tag = "external_mcp_client",
    responses(
        (status = 200, description = "List of supported external MCP client names", body = Vec<String>),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_supported_external_mcp_clients(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<String>>, StatusCode> {
    service
        .get_supported_external_mcp_clients()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    post,
    path = "/api/external_mcp_client/connect",
    tag = "external_mcp_client",
    request_body = ConnectRequest,
    responses(
        (status = 200, description = "External MCP client connected successfully"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn connect_external_mcp_client(
    State(service): State<Arc<Service>>,
    Json(payload): Json<ConnectRequest>,
) -> Result<StatusCode, StatusCode> {
    service
        .connect_external_mcp_client(payload.client_name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    delete,
    path = "/api/external_mcp_client/{client_name}/disconnect",
    tag = "external_mcp_client",
    params(
        ("client_name" = String, Path, description = "Name of the external MCP client to disconnect")
    ),
    responses(
        (status = 200, description = "External MCP client disconnected successfully"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn disconnect_external_mcp_client(
    State(service): State<Arc<Service>>,
    Path(client_name): Path<String>,
) -> Result<StatusCode, StatusCode> {
    service
        .disconnect_external_mcp_client(client_name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn create_router(db: Arc<DatabaseConnection>) -> Router {
    let service = Arc::new(Service::new(db));

    Router::new()
        .route("/", get(get_connected_external_mcp_clients))
        .route("/supported", get(get_supported_external_mcp_clients))
        .route("/connect", post(connect_external_mcp_client))
        .route(
            "/{client_name}/disconnect",
            delete(disconnect_external_mcp_client),
        )
        .with_state(service)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_fixtures::database;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use rstest::*;
    use serde_json::json;
    use tower::ServiceExt;

    #[fixture]
    async fn router(#[future] database: DatabaseConnection) -> Router {
        let db = database.await;
        create_router(Arc::new(db))
    }
    #[fixture]
    async fn service(#[future] database: DatabaseConnection) -> Service {
        let db = database.await;
        Service::new(Arc::new(db))
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_connected_external_mcp_clients_empty(#[future] router: Router) {
        let router = router.await;

        let response = router
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let clients: Vec<ExternalMCPClient> = serde_json::from_slice(&body).unwrap();
        assert_eq!(clients.len(), 0);
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_supported_external_mcp_clients(#[future] router: Router) {
        let router = router.await;

        let response = router
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/supported")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let supported_clients: Vec<String> = serde_json::from_slice(&body).unwrap();

        // Check that we get the expected supported clients
        assert!(supported_clients.contains(&"claude".to_string()));
        assert!(supported_clients.contains(&"cursor".to_string()));
        assert!(supported_clients.contains(&"vscode".to_string()));
        assert_eq!(supported_clients.len(), 3);
    }

    #[rstest]
    #[tokio::test]
    async fn test_connect_external_mcp_client_success(
        #[future] router: Router,
        #[future] service: Service,
    ) {
        let router = router.await;
        let service = service.await;

        let request_body = json!({
            "client_name": "claude"
        });

        let response = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/connect")
                    .header("Content-Type", "application/json")
                    .body(Body::from(serde_json::to_string(&request_body).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        // Verify the client was actually connected
        let connected_clients = service.get_connected_external_mcp_clients().await.unwrap();
        assert_eq!(connected_clients.len(), 1);
        assert_eq!(connected_clients[0].client_name, "claude");
    }

    #[rstest]
    #[tokio::test]
    async fn test_connect_external_mcp_client_invalid_name(#[future] router: Router) {
        let router = router.await;

        let request_body = json!({
            "client_name": "invalid-client-name"
        });

        let response = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/connect")
                    .header("Content-Type", "application/json")
                    .body(Body::from(serde_json::to_string(&request_body).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[rstest]
    #[tokio::test]
    async fn test_disconnect_external_mcp_client_success(
        #[future] router: Router,
        #[future] service: Service,
    ) {
        let router = router.await;
        let service = service.await;

        // First connect a client
        service
            .connect_external_mcp_client("claude".to_string())
            .await
            .unwrap();

        // Verify it's connected
        let connected_clients = service.get_connected_external_mcp_clients().await.unwrap();
        assert_eq!(connected_clients.len(), 1);

        // Now disconnect it via the API
        let response = router
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri("/claude/disconnect")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // Disconnect succeeds even if the client is in DB (it modifies config files)
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[rstest]
    #[tokio::test]
    async fn test_disconnect_external_mcp_client_not_connected(#[future] router: Router) {
        let router = router.await;

        let response = router
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri("/claude/disconnect")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // Should return OK - disconnect succeeds even if not connected
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[rstest]
    #[tokio::test]
    async fn test_connect_multiple_clients_and_list(
        #[future] router: Router,
        #[future] service: Service,
    ) {
        let router = router.await;
        let service = service.await;

        // Connect multiple clients
        service
            .connect_external_mcp_client("claude".to_string())
            .await
            .unwrap();
        service
            .connect_external_mcp_client("cursor".to_string())
            .await
            .unwrap();
        service
            .connect_external_mcp_client("vscode".to_string())
            .await
            .unwrap();

        // Get connected clients via API
        let response = router
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let clients: Vec<ExternalMCPClient> = serde_json::from_slice(&body).unwrap();

        assert_eq!(clients.len(), 3);
        let client_names: Vec<String> = clients.iter().map(|c| c.client_name.clone()).collect();
        assert!(client_names.contains(&"claude".to_string()));
        assert!(client_names.contains(&"cursor".to_string()));
        assert!(client_names.contains(&"vscode".to_string()));
    }

    #[rstest]
    #[tokio::test]
    async fn test_connect_duplicate_client(
        #[future] router: Router,
        #[future] service: Service,
    ) {
        let router = router.await;
        let service = service.await;

        // Connect a client
        service
            .connect_external_mcp_client("claude".to_string())
            .await
            .unwrap();

        // Try to connect the same client again via API
        let request_body = json!({
            "client_name": "claude"
        });

        let response = router
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/connect")
                    .header("Content-Type", "application/json")
                    .body(Body::from(serde_json::to_string(&request_body).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        // Should return OK since connecting again succeeds (upsert)
        assert_eq!(response.status(), StatusCode::OK);

        // Verify still only one client is connected (upsert behavior)
        let connected_clients = service.get_connected_external_mcp_clients().await.unwrap();
        assert_eq!(connected_clients.len(), 1);
    }
}
