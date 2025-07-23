use crate::models::mcp_request_log::ClientInfo;
use crate::models::mcp_server::sandbox::forward_raw_request;
use crate::models::{CreateLogRequest, MCPRequestLog};
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

        println!("🚀 Gateway proxy: Starting request to server '{server_name}' (ID: {request_id})");

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
                println!("📥 Successfully read request body ({} bytes)", bytes.len());
                bytes
            }
            Err(e) => {
                println!("❌ Failed to read request body: {e}");

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
                        eprintln!("Failed to log request: {e}");
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
                println!("📝 Request body: {body}");
                body
            }
            Err(e) => {
                println!("❌ Invalid UTF-8 in request body: {e}");

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
                        eprintln!("Failed to log request: {e}");
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

        println!("🔄 Forwarding request to forward_raw_request function...");
        // Forward the raw JSON-RPC request to the MCPServerManager
        match forward_raw_request(&server_name, request_body.clone()).await {
            Ok(raw_response) => {
                println!("✅ Successfully received response from server '{server_name}'");
                println!("📤 Response: {raw_response}");

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
                        eprintln!("Failed to log request: {e}");
                    }
                });

                axum::http::Response::builder()
                    .status(axum::http::StatusCode::OK)
                    .header("Content-Type", "application/json")
                    .body(Body::from(raw_response))
                    .unwrap()
            }
            Err(e) => {
                println!("❌ Gateway proxy: Failed to forward request to '{server_name}': {e}");

                let duration_ms = start_time.elapsed().as_millis() as i32;

                // Return a JSON-RPC error response
                let error_response = serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": null,
                    "error": {
                        "code": -32603,
                        "message": format!("Proxy error: {}", e)
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
                        eprintln!("Failed to log request: {e}");
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
