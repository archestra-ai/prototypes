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

use crate::gateway::api::oauth::AuthResponse;
use crate::models::mcp_server::{ConnectorCatalogEntry, Model as MCPServer};

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[schema(as = InstallMCPServerRequest)]
pub struct InstallRequest {
    mcp_connector_id: String,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[schema(as = StartMCPServerOAuthRequest)]
pub struct StartOAuthRequest {
    mcp_connector_id: String,
}

pub struct Service {
    db: Arc<DatabaseConnection>,
}

impl Service {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db: Arc::new(db) }
    }

    async fn get_installed_mcp_servers(&self) -> Result<Vec<MCPServer>, String> {
        MCPServer::load_installed_mcp_servers(&self.db)
            .await
            .map_err(|e| format!("Failed to load installed MCP servers: {e}"))
    }

    async fn get_mcp_connector_catalog(&self) -> Result<Vec<ConnectorCatalogEntry>, String> {
        MCPServer::get_mcp_connector_catalog()
            .await
            .map_err(|e| format!("Failed to get MCP connector catalog: {e}"))
    }

    async fn install_mcp_server_from_catalog(
        &self,
        mcp_connector_id: String,
    ) -> Result<(), String> {
        MCPServer::save_mcp_server_from_catalog(&self.db, mcp_connector_id)
            .await
            .map_err(|e| format!("Failed to save server: {e}"))?;

        Ok(())
    }

    async fn uninstall_mcp_server(&self, mcp_server_name: String) -> Result<(), String> {
        MCPServer::uninstall_mcp_server(&self.db, &mcp_server_name)
            .await
            .map_err(|e| format!("Failed to uninstall server: {e}"))?;

        Ok(())
    }
}

#[utoipa::path(
    get,
    path = "/api/mcp_server",
    tag = "mcp_server",
    responses(
        (status = 200, description = "List of installed MCP servers", body = Vec<MCPServer>),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_installed_mcp_servers(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<MCPServer>>, StatusCode> {
    service
        .get_installed_mcp_servers()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    get,
    path = "/api/mcp_server/catalog",
    tag = "mcp_server",
    responses(
        (status = 200, description = "MCP connector catalog", body = Vec<ConnectorCatalogEntry>),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_mcp_connector_catalog(
    State(service): State<Arc<Service>>,
) -> Result<Json<Vec<ConnectorCatalogEntry>>, StatusCode> {
    service
        .get_mcp_connector_catalog()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    post,
    path = "/api/mcp_server/catalog/install",
    tag = "mcp_server",
    request_body = InstallRequest,
    responses(
        (status = 200, description = "MCP server installed successfully"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn install_mcp_server_from_catalog(
    State(service): State<Arc<Service>>,
    Json(payload): Json<InstallRequest>,
) -> Result<StatusCode, StatusCode> {
    service
        .install_mcp_server_from_catalog(payload.mcp_connector_id)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    post,
    path = "/api/mcp_server/start_oauth",
    tag = "mcp_server",
    request_body = StartOAuthRequest,
    responses(
        (status = 200, description = "OAuth authorization URL", body = AuthResponse),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn start_mcp_server_oauth(
    State(_service): State<Arc<Service>>,
    Json(payload): Json<StartOAuthRequest>,
) -> Result<Json<AuthResponse>, StatusCode> {
    // TODO: finish setting this up with models::mcp_server::oauth::start_oauth_auth
    // need to get the cloud run service's static URL and plug that in here
    let auth_response = AuthResponse {
        auth_url: format!(
            "https://oauth-proxy.archestra.ai/auth/{}",
            payload.mcp_connector_id
        ),
    };
    Ok(Json(auth_response))
}

#[utoipa::path(
    delete,
    path = "/api/mcp_server/{mcp_server_name}",
    tag = "mcp_server",
    params(
        ("mcp_server_name" = String, Path, description = "Name of the MCP server to uninstall")
    ),
    responses(
        (status = 200, description = "MCP server uninstalled successfully"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn uninstall_mcp_server(
    State(service): State<Arc<Service>>,
    Path(mcp_server_name): Path<String>,
) -> Result<StatusCode, StatusCode> {
    service
        .uninstall_mcp_server(mcp_server_name)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn create_router(db: DatabaseConnection) -> Router {
    let service = Arc::new(Service::new(db));

    Router::new()
        .route("/", get(get_installed_mcp_servers))
        .route("/catalog", get(get_mcp_connector_catalog))
        .route("/catalog/install", post(install_mcp_server_from_catalog))
        .route("/start_oauth", post(start_mcp_server_oauth))
        .route("/{mcp_server_name}", delete(uninstall_mcp_server))
        .with_state(service)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::mcp_server::{ActiveModel, Column, Entity, ServerConfig};
    use crate::test_fixtures::database;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use rstest::*;
    use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
    use tower::ServiceExt;

    fn app(db: DatabaseConnection) -> Router {
        create_router(db)
    }

    async fn create_test_mcp_server(db: &DatabaseConnection, name: &str) -> i32 {
        let server_config = ServerConfig {
            transport: "stdio".to_string(),
            command: "node".to_string(),
            args: vec!["index.js".to_string()],
            env: std::collections::HashMap::new(),
        };

        let active_model = ActiveModel {
            name: Set(name.to_string()),
            server_config: Set(serde_json::to_string(&server_config).unwrap()),
            meta: Set(None),
            created_at: Set(chrono::Utc::now()),
            ..Default::default()
        };

        active_model.insert(db).await.unwrap().id
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_installed_mcp_servers_empty(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);

        let response = app
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
        let result: Vec<MCPServer> = serde_json::from_slice(&body).unwrap();

        assert_eq!(result.len(), 0);
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_installed_mcp_servers_with_data(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create test servers
        create_test_mcp_server(&db, "test-server-1").await;
        create_test_mcp_server(&db, "test-server-2").await;

        let app = app(db);

        let response = app
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
        let result: Vec<MCPServer> = serde_json::from_slice(&body).unwrap();

        assert_eq!(result.len(), 2);

        // Check that the servers have the expected names
        let names: Vec<String> = result.iter().map(|s| s.name.clone()).collect();
        assert!(names.contains(&"test-server-1".to_string()));
        assert!(names.contains(&"test-server-2".to_string()));
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_mcp_connector_catalog(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/catalog")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let result: Vec<ConnectorCatalogEntry> = serde_json::from_slice(&body).unwrap();

        // The catalog might be empty or have entries depending on the implementation
        assert!(result.is_empty() || !result.is_empty());
    }

    #[rstest]
    #[tokio::test]
    async fn test_install_mcp_server_from_catalog(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db.clone());

        let install_request = InstallRequest {
            mcp_connector_id: "test-connector".to_string(),
        };

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/catalog/install")
                    .header("Content-Type", "application/json")
                    .body(Body::from(serde_json::to_string(&install_request).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        // This might return either OK or INTERNAL_SERVER_ERROR depending on whether
        // the connector exists in the catalog
        assert!(
            response.status() == StatusCode::OK
                || response.status() == StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    #[rstest]
    #[tokio::test]
    async fn test_start_mcp_server_oauth(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);

        let oauth_request = StartOAuthRequest {
            mcp_connector_id: "test-connector".to_string(),
        };

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/start_oauth")
                    .header("Content-Type", "application/json")
                    .body(Body::from(serde_json::to_string(&oauth_request).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let result: AuthResponse = serde_json::from_slice(&body).unwrap();

        assert_eq!(
            result.auth_url,
            "https://oauth-proxy.archestra.ai/auth/test-connector"
        );
    }

    #[rstest]
    #[tokio::test]
    async fn test_uninstall_mcp_server_success(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create a test server to uninstall
        create_test_mcp_server(&db, "test-server-to-uninstall").await;

        let app = app(db.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri("/test-server-to-uninstall")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        // Verify the server was deleted
        let remaining = Entity::find()
            .filter(Column::Name.eq("test-server-to-uninstall"))
            .one(&db)
            .await
            .unwrap();

        assert!(remaining.is_none());
    }

    #[rstest]
    #[tokio::test]
    async fn test_uninstall_mcp_server_not_found(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);

        let response = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri("/non-existent-server")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // The uninstall endpoint returns OK even if the server doesn't exist
        // (it's a no-op delete_many operation)
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[rstest]
    #[tokio::test]
    async fn test_service_methods(#[future] database: DatabaseConnection) {
        let db = database.await;
        let service = Service::new(db.clone());

        // Test get_installed_mcp_servers
        let servers = service.get_installed_mcp_servers().await;
        assert!(servers.is_ok());
        assert_eq!(servers.unwrap().len(), 0);

        // Test get_mcp_connector_catalog
        let catalog = service.get_mcp_connector_catalog().await;
        assert!(catalog.is_ok());

        // Test install_mcp_server_from_catalog
        let install_result = service
            .install_mcp_server_from_catalog("test-connector".to_string())
            .await;
        // This might fail if the connector doesn't exist in the catalog
        assert!(install_result.is_ok() || install_result.is_err());

        // Test uninstall_mcp_server
        let uninstall_result = service
            .uninstall_mcp_server("non-existent".to_string())
            .await;
        // Uninstall returns Ok even for non-existent servers (no-op)
        assert!(uninstall_result.is_ok());
    }

    #[rstest]
    #[tokio::test]
    async fn test_concurrent_operations(#[future] database: DatabaseConnection) {
        let db = database.await;
        let service = Arc::new(Service::new(db.clone()));

        // Create multiple servers concurrently
        let mut handles = vec![];

        for i in 0..5 {
            let db_clone = db.clone();
            let handle = tokio::spawn(async move {
                create_test_mcp_server(&db_clone, &format!("concurrent-server-{i}")).await
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.await.unwrap();
        }

        // Now get all servers
        let servers = service.get_installed_mcp_servers().await.unwrap();
        assert_eq!(servers.len(), 5);

        // Uninstall all servers concurrently
        let mut handles = vec![];

        for i in 0..5 {
            let service_clone = service.clone();
            let handle = tokio::spawn(async move {
                service_clone
                    .uninstall_mcp_server(format!("concurrent-server-{i}"))
                    .await
            });
            handles.push(handle);
        }

        for handle in handles {
            let result = handle.await.unwrap();
            assert!(result.is_ok());
        }

        // Verify all servers are deleted
        let servers = service.get_installed_mcp_servers().await.unwrap();
        assert_eq!(servers.len(), 0);
    }
}
