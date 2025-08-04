use crate::credibility::ToolCredibilityService;
use crate::models::mcp_request_log::ClientInfo;
use crate::models::mcp_request_log::{CreateLogRequest, Model as MCPRequestLog};
use crate::sandbox;
use axum::{
    body::Body,
    extract::{Path, State},
    http::{HeaderMap, Request, Response},
    response::IntoResponse,
    routing::{post, Router},
};
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tracing::{debug, error, info};
use uuid::Uuid;

pub struct Service {
    db: Arc<DatabaseConnection>,
}

impl Service {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db: Arc::new(db) }
    }

    // Extract client info from request headers
    fn extract_client_info(headers: &HeaderMap) -> ClientInfo {
        ClientInfo {
            user_agent: headers
                .get("user-agent")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string()),
            client_name: headers
                .get("x-client-name")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string()),
            client_version: headers
                .get("x-client-version")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string()),
            client_platform: headers
                .get("x-client-platform")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string()),
        }
    }

    // Extract session IDs from headers
    fn extract_session_ids(headers: &HeaderMap) -> (Option<String>, Option<String>) {
        let session_id = headers
            .get("x-session-id")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let mcp_session_id = headers
            .get("mcp-session-id")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        (session_id, mcp_session_id)
    }

    // Convert HeaderMap to HashMap for JSON serialization
    fn headers_to_hashmap(headers: &HeaderMap) -> HashMap<String, String> {
        headers
            .iter()
            .filter_map(|(key, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|v| (key.to_string(), v.to_string()))
            })
            .collect()
    }

    // Extract JSON-RPC method from request body
    fn extract_method_from_request(request_body: &str) -> Option<String> {
        match serde_json::from_str::<serde_json::Value>(request_body) {
            Ok(json) => json
                .get("method")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            Err(_) => None,
        }
    }

    async fn call(&self, server_name: String, req: Request<Body>) -> Response<Body> {
        let start_time = Instant::now();
        let request_id = Uuid::new_v4().to_string();

        info!("🚀 MCP Proxy: Starting request to server '{server_name}' (ID: {request_id})");

        // Extract headers and session info before consuming the request
        let headers = req.headers().clone();
        let (session_id, mcp_session_id) = Self::extract_session_ids(&headers);
        let client_info = Self::extract_client_info(&headers);
        let request_headers = Self::headers_to_hashmap(&headers);

        // Generate session_id if not provided
        let session_id = session_id.unwrap_or_else(|| Uuid::new_v4().to_string());

        // Read the request body
        let body_bytes = match axum::body::to_bytes(req.into_body(), usize::MAX).await {
            Ok(bytes) => {
                debug!("📥 Successfully read request body ({} bytes)", bytes.len());
                bytes
            }
            Err(e) => {
                error!("❌ Failed to read request body: {e}");

                // Log the failed request
                let log_data = CreateLogRequest {
                    request_id,
                    session_id: Some(session_id),
                    mcp_session_id,
                    server_name,
                    client_info: Some(client_info),
                    method: None,
                    request_headers: Some(request_headers),
                    request_body: None,
                    response_body: None,
                    response_headers: None,
                    status_code: 400,
                    error_message: Some(format!("Failed to read request body: {e}")),
                    duration_ms: Some(start_time.elapsed().as_millis() as i32),
                };

                // Log asynchronously (don't block on database errors)
                let db_clone = Arc::clone(&self.db);
                tokio::spawn(async move {
                    if let Err(e) = MCPRequestLog::create_request_log(&db_clone, log_data).await {
                        error!("Failed to log request: {e}");
                    }
                });

                return axum::http::Response::builder()
                    .status(axum::http::StatusCode::BAD_REQUEST)
                    .header("Content-Type", "application/json")
                    .body(Body::from("Failed to read request body"))
                    .unwrap();
            }
        };

        // Convert bytes to string
        let request_body = match String::from_utf8(body_bytes.to_vec()) {
            Ok(body) => {
                debug!("📝 Request body: {body}");
                body
            }
            Err(e) => {
                error!("❌ Invalid UTF-8 in request body: {e}");

                // Log the failed request
                let log_data = CreateLogRequest {
                    request_id,
                    session_id: Some(session_id),
                    mcp_session_id,
                    server_name,
                    client_info: Some(client_info),
                    method: None,
                    request_headers: Some(request_headers),
                    request_body: None,
                    response_body: None,
                    response_headers: None,
                    status_code: 400,
                    error_message: Some(format!("Invalid UTF-8 in request body: {e}")),
                    duration_ms: Some(start_time.elapsed().as_millis() as i32),
                };

                // Log asynchronously
                let db_clone = Arc::clone(&self.db);
                tokio::spawn(async move {
                    if let Err(e) = MCPRequestLog::create_request_log(&db_clone, log_data).await {
                        error!("Failed to log request: {e}");
                    }
                });

                return axum::http::Response::builder()
                    .status(axum::http::StatusCode::BAD_REQUEST)
                    .header("Content-Type", "application/json")
                    .body(Body::from("Invalid UTF-8 in request body"))
                    .unwrap();
            }
        };

        // Extract method from request body
        let method = Self::extract_method_from_request(&request_body);

        // Check tool call credibility
        let tool_service = ToolCredibilityService::new();
        match tool_service
            .evaluate_tool_call_credibility(request_body.clone())
            .await
        {
            Ok(Some(evaluation)) => {
                if !evaluation.credible {
                    // Return a JSON-RPC error response
                    let error_response = serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": null,
                        "error": {
                            "code": -32600,
                            "message": format!("Tool call was flagged as potentially non-credible: {}", evaluation.reason)
                        }
                    });

                    let error_response_str = serde_json::to_string(&error_response).unwrap();

                    // Log the failed request
                    let mut response_headers = HashMap::new();
                    response_headers
                        .insert("Content-Type".to_string(), "application/json".to_string());

                    let log_data = CreateLogRequest {
                        request_id,
                        session_id: Some(session_id),
                        mcp_session_id,
                        server_name,
                        client_info: Some(client_info),
                        method,
                        request_headers: Some(request_headers),
                        request_body: Some(request_body),
                        response_body: Some(error_response_str.clone()),
                        response_headers: Some(response_headers),
                        status_code: 400,
                        error_message: Some(format!(
                            "Tool credibility check failed: {}",
                            evaluation.reason
                        )),
                        duration_ms: Some(start_time.elapsed().as_millis() as i32),
                    };

                    // Log asynchronously
                    let db_clone = Arc::clone(&self.db);
                    tokio::spawn(async move {
                        if let Err(e) = MCPRequestLog::create_request_log(&db_clone, log_data).await
                        {
                            error!("Failed to log request: {e}");
                        }
                    });

                    return axum::http::Response::builder()
                        .status(axum::http::StatusCode::BAD_REQUEST)
                        .header("Content-Type", "application/json")
                        .body(Body::from(error_response_str))
                        .unwrap();
                }
            }
            Ok(None) => {
                // Guard model not available, continue processing
                debug!("Tool credibility check skipped - guard model not available");
            }
            Err(e) => {
                // Log error but continue processing
                error!("Failed to evaluate tool call credibility: {e}");
            }
        }

        debug!("🔄 Forwarding request to forward_raw_request function...");
        // Forward the raw JSON-RPC request to the MCPServerManager
        match sandbox::forward_raw_request(&server_name, request_body.clone()).await {
            Ok(raw_response) => {
                info!("✅ Successfully received response from server '{server_name}'");

                let duration_ms = start_time.elapsed().as_millis() as i32;

                // Log successful request
                let mut response_headers = HashMap::new();
                response_headers.insert("Content-Type".to_string(), "application/json".to_string());

                let log_data = CreateLogRequest {
                    request_id,
                    session_id: Some(session_id),
                    mcp_session_id,
                    server_name,
                    client_info: Some(client_info),
                    method,
                    request_headers: Some(request_headers),
                    request_body: Some(request_body),
                    response_body: Some(raw_response.clone()),
                    response_headers: Some(response_headers),
                    status_code: 200,
                    error_message: None,
                    duration_ms: Some(duration_ms),
                };

                // Log asynchronously
                let db_clone = Arc::clone(&self.db);
                tokio::spawn(async move {
                    if let Err(e) = MCPRequestLog::create_request_log(&db_clone, log_data).await {
                        error!("Failed to log request: {e}");
                    }
                });

                axum::http::Response::builder()
                    .status(axum::http::StatusCode::OK)
                    .header("Content-Type", "application/json")
                    .body(Body::from(raw_response))
                    .unwrap()
            }
            Err(e) => {
                error!("❌ MCP Proxy: Failed to forward request to '{server_name}': {e}");

                let duration_ms = start_time.elapsed().as_millis() as i32;

                // Return a JSON-RPC error response
                let error_response = serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": null,
                    "error": {
                        "code": -32603,
                        "message": format!("MCP Proxy error: {}", e)
                    }
                });

                let error_response_str = serde_json::to_string(&error_response).unwrap();

                // Log failed request
                let mut response_headers = HashMap::new();
                response_headers.insert("Content-Type".to_string(), "application/json".to_string());

                let log_data = CreateLogRequest {
                    request_id,
                    session_id: Some(session_id),
                    mcp_session_id,
                    server_name,
                    client_info: Some(client_info),
                    method,
                    request_headers: Some(request_headers),
                    request_body: Some(request_body),
                    response_body: Some(error_response_str.clone()),
                    response_headers: Some(response_headers),
                    status_code: 500,
                    error_message: Some(e),
                    duration_ms: Some(duration_ms),
                };

                // Log asynchronously
                let db_clone = Arc::clone(&self.db);
                tokio::spawn(async move {
                    if let Err(e) = MCPRequestLog::create_request_log(&db_clone, log_data).await {
                        error!("Failed to log request: {e}");
                    }
                });

                axum::http::Response::builder()
                    .status(axum::http::StatusCode::INTERNAL_SERVER_ERROR)
                    .header("Content-Type", "application/json")
                    .body(Body::from(error_response_str))
                    .unwrap()
            }
        }
    }
}

async fn handler(
    State(service): State<Arc<Service>>,
    Path(server_name): Path<String>,
    request: Request<Body>,
) -> impl IntoResponse {
    service.call(server_name, request).await
}

pub fn create_router(db: DatabaseConnection) -> Router {
    Router::new()
        .route("/{server_name}", post(handler))
        .with_state(Arc::new(Service::new(db)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::mcp_request_log::{Column, Entity};
    use crate::test_fixtures::database;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use rstest::*;
    use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
    use tower::ServiceExt;

    fn app(db: DatabaseConnection) -> Router {
        create_router(db)
    }

    #[rstest]
    #[tokio::test]
    async fn test_extract_client_info(#[future] database: DatabaseConnection) {
        let db = database.await;
        let _service = Service::new(db);

        let mut headers = HeaderMap::new();
        headers.insert("user-agent", "test-agent/1.0".parse().unwrap());
        headers.insert("x-client-name", "test-client".parse().unwrap());
        headers.insert("x-client-version", "1.0.0".parse().unwrap());
        headers.insert("x-client-platform", "linux".parse().unwrap());

        let client_info = Service::extract_client_info(&headers);

        assert_eq!(client_info.user_agent, Some("test-agent/1.0".to_string()));
        assert_eq!(client_info.client_name, Some("test-client".to_string()));
        assert_eq!(client_info.client_version, Some("1.0.0".to_string()));
        assert_eq!(client_info.client_platform, Some("linux".to_string()));
    }

    #[rstest]
    #[tokio::test]
    async fn test_extract_session_ids(#[future] database: DatabaseConnection) {
        let db = database.await;
        let _service = Service::new(db);

        let mut headers = HeaderMap::new();
        headers.insert("x-session-id", "session-123".parse().unwrap());
        headers.insert("mcp-session-id", "mcp-456".parse().unwrap());

        let (session_id, mcp_session_id) = Service::extract_session_ids(&headers);

        assert_eq!(session_id, Some("session-123".to_string()));
        assert_eq!(mcp_session_id, Some("mcp-456".to_string()));
    }

    #[rstest]
    #[tokio::test]
    async fn test_headers_to_hashmap(#[future] database: DatabaseConnection) {
        let db = database.await;
        let _service = Service::new(db);

        let mut headers = HeaderMap::new();
        headers.insert("content-type", "application/json".parse().unwrap());
        headers.insert("authorization", "Bearer token123".parse().unwrap());

        let hashmap = Service::headers_to_hashmap(&headers);

        assert_eq!(
            hashmap.get("content-type"),
            Some(&"application/json".to_string())
        );
        assert_eq!(
            hashmap.get("authorization"),
            Some(&"Bearer token123".to_string())
        );
    }

    #[rstest]
    #[tokio::test]
    async fn test_extract_method_from_request(#[future] database: DatabaseConnection) {
        let db = database.await;
        let _service = Service::new(db);

        // Valid JSON-RPC request
        let request_body = r#"{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}"#;
        let method = Service::extract_method_from_request(request_body);
        assert_eq!(method, Some("tools/list".to_string()));

        // Invalid JSON
        let invalid_body = "not json";
        let method = Service::extract_method_from_request(invalid_body);
        assert_eq!(method, None);

        // JSON without method
        let no_method_body = r#"{"jsonrpc":"2.0","id":1}"#;
        let method = Service::extract_method_from_request(no_method_body);
        assert_eq!(method, None);
    }

    #[rstest]
    #[tokio::test]
    async fn test_proxy_invalid_utf8_request(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);

        // Create a request with invalid UTF-8 bytes
        let invalid_utf8 = vec![0xFF, 0xFE, 0xFD];

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/test-server")
                    .header("Content-Type", "application/json")
                    .body(Body::from(invalid_utf8))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body_str = String::from_utf8(body.to_vec()).unwrap();
        assert_eq!(body_str, "Invalid UTF-8 in request body");
    }

    #[rstest]
    #[tokio::test]
    async fn test_proxy_with_headers(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);

        let request_body = r#"{"jsonrpc":"2.0","id":1,"method":"test","params":{}}"#;

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/test-server")
                    .header("Content-Type", "application/json")
                    .header("x-session-id", "session-789")
                    .header("x-client-name", "test-client")
                    .header("user-agent", "test/1.0")
                    .body(Body::from(request_body))
                    .unwrap(),
            )
            .await
            .unwrap();

        // Since we can't easily mock forward_raw_request in tests,
        // we expect an internal server error when it tries to forward
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(json["jsonrpc"], "2.0");
        assert!(json["error"]["message"]
            .as_str()
            .unwrap()
            .contains("MCP Proxy error"));
    }

    #[rstest]
    #[tokio::test]
    async fn test_concurrent_proxy_requests(#[future] database: DatabaseConnection) {
        let db = database.await;
        let service = Arc::new(Service::new(db));

        let mut handles = vec![];

        for i in 0..5 {
            let service_clone = service.clone();
            let handle = tokio::spawn(async move {
                let request_body =
                    format!(r#"{{"jsonrpc":"2.0","id":{i},"method":"test","params":{{}}}}"#);
                let req = Request::builder()
                    .method("POST")
                    .uri(format!("/server-{i}"))
                    .header("Content-Type", "application/json")
                    .body(Body::from(request_body))
                    .unwrap();

                let response = service_clone.call(format!("server-{i}"), req).await;
                response.status()
            });
            handles.push(handle);
        }

        for handle in handles {
            let status = handle.await.unwrap();
            // All should fail with internal server error since forward_raw_request isn't mocked
            assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    #[rstest]
    #[tokio::test]
    async fn test_service_logging(#[future] database: DatabaseConnection) {
        let db = database.await;
        let service = Service::new(db.clone());

        let request_body = r#"{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}"#;
        let req = Request::builder()
            .method("POST")
            .uri("/test-server")
            .header("Content-Type", "application/json")
            .header("x-session-id", "test-session")
            .body(Body::from(request_body))
            .unwrap();

        // Call the service
        let _response = service.call("test-server".to_string(), req).await;

        // Give time for async logging to complete
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Check that a log entry was created
        let logs = Entity::find()
            .filter(Column::ServerName.eq("test-server"))
            .all(&db)
            .await
            .unwrap();

        assert!(!logs.is_empty());
        let log = &logs[0];
        assert_eq!(log.server_name, "test-server");
        assert_eq!(log.method, Some("tools/list".to_string()));
        assert_eq!(log.status_code, 500); // Failed since forward_raw_request isn't mocked
    }
}
