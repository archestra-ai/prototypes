use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::get,
    Router,
};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use utoipa::{IntoParams, ToSchema};

use crate::models::mcp_request_log::{LogFilters, LogStats, Model as MCPRequestLog};

#[derive(Debug, Deserialize, IntoParams)]
pub struct LogQueryParams {
    // Filters
    server_name: Option<String>,
    session_id: Option<String>,
    mcp_session_id: Option<String>,
    status_code: Option<i32>,
    method: Option<String>,
    start_time: Option<String>,
    end_time: Option<String>,
    // Pagination
    page: Option<u64>,
    page_size: Option<u64>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct ClearLogsParams {
    clear_all: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[schema(as = PaginatedMCPRequestLogResponse)]
pub struct PaginatedResponse<T> {
    data: Vec<T>,
    total: u64,
    page: u64,
    page_size: u64,
}

pub struct Service {
    db: Arc<DatabaseConnection>,
}

impl Service {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db: Arc::new(db) }
    }

    async fn get_mcp_request_logs(
        &self,
        filters: Option<LogFilters>,
        page: u64,
        page_size: u64,
    ) -> Result<(Vec<MCPRequestLog>, u64), String> {
        MCPRequestLog::get_request_logs(&self.db, filters, page, page_size)
            .await
            .map_err(|e| format!("Failed to get request logs: {e}"))
    }

    async fn get_mcp_request_log_by_id(
        &self,
        request_id: i32,
    ) -> Result<Option<MCPRequestLog>, String> {
        MCPRequestLog::get_request_log_by_id(&self.db, request_id)
            .await
            .map_err(|e| format!("Failed to get request log: {e}"))
    }

    async fn get_mcp_request_log_stats(
        &self,
        filters: Option<LogFilters>,
    ) -> Result<LogStats, String> {
        MCPRequestLog::get_request_log_stats(&self.db, filters)
            .await
            .map_err(|e| format!("Failed to get request log stats: {e}"))
    }

    async fn clear_mcp_request_logs(&self, clear_all: bool) -> Result<u64, String> {
        if clear_all {
            MCPRequestLog::clear_all_logs(&self.db)
                .await
                .map_err(|e| format!("Failed to clear all logs: {e}"))
        } else {
            // Clear logs older than 7 days by default
            MCPRequestLog::cleanup_old_logs(&self.db, 7)
                .await
                .map_err(|e| format!("Failed to cleanup old logs: {e}"))
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/mcp_request_log",
    tag = "mcp_request_log",
    params(LogQueryParams),
    responses(
        (status = 200, description = "Paginated list of MCP request logs", body = PaginatedResponse<MCPRequestLog>),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_mcp_request_logs(
    State(service): State<Arc<Service>>,
    Query(params): Query<LogQueryParams>,
) -> Result<Json<PaginatedResponse<MCPRequestLog>>, StatusCode> {
    let filters = if params.server_name.is_some()
        || params.session_id.is_some()
        || params.mcp_session_id.is_some()
        || params.status_code.is_some()
        || params.method.is_some()
        || params.start_time.is_some()
        || params.end_time.is_some()
    {
        Some(LogFilters {
            server_name: params.server_name,
            session_id: params.session_id,
            mcp_session_id: params.mcp_session_id,
            status_code: params.status_code,
            method: params.method,
            start_time: params.start_time.and_then(|s| s.parse().ok()),
            end_time: params.end_time.and_then(|s| s.parse().ok()),
        })
    } else {
        None
    };

    let page = params.page.unwrap_or(1);
    let page_size = params.page_size.unwrap_or(50);

    service
        .get_mcp_request_logs(filters, page, page_size)
        .await
        .map(|(data, total)| {
            Json(PaginatedResponse {
                data,
                total,
                page,
                page_size,
            })
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    get,
    path = "/api/mcp_request_log/{request_id}",
    tag = "mcp_request_log",
    params(
        ("request_id" = String, Path, description = "Request ID to fetch")
    ),
    responses(
        (status = 200, description = "MCP request log if found", body = Option<MCPRequestLog>),
        (status = 400, description = "Invalid request ID format"),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_mcp_request_log_by_id(
    State(service): State<Arc<Service>>,
    Path(request_id): Path<String>,
) -> Result<Json<Option<MCPRequestLog>>, StatusCode> {
    let id = request_id
        .parse::<i32>()
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    service
        .get_mcp_request_log_by_id(id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    get,
    path = "/api/mcp_request_log/stats",
    tag = "mcp_request_log",
    params(LogQueryParams),
    responses(
        (status = 200, description = "Request log statistics", body = LogStats),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn get_mcp_request_log_stats(
    State(service): State<Arc<Service>>,
    Query(params): Query<LogQueryParams>,
) -> Result<Json<LogStats>, StatusCode> {
    let filters = if params.server_name.is_some()
        || params.session_id.is_some()
        || params.mcp_session_id.is_some()
        || params.status_code.is_some()
        || params.method.is_some()
        || params.start_time.is_some()
        || params.end_time.is_some()
    {
        Some(LogFilters {
            server_name: params.server_name,
            session_id: params.session_id,
            mcp_session_id: params.mcp_session_id,
            status_code: params.status_code,
            method: params.method,
            start_time: params.start_time.and_then(|s| s.parse().ok()),
            end_time: params.end_time.and_then(|s| s.parse().ok()),
        })
    } else {
        None
    };

    service
        .get_mcp_request_log_stats(filters)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[utoipa::path(
    delete,
    path = "/api/mcp_request_log",
    tag = "mcp_request_log",
    params(ClearLogsParams),
    responses(
        (status = 200, description = "Number of deleted log entries", body = u64),
        (status = 500, description = "Internal server error")
    )
)]
pub async fn clear_mcp_request_logs(
    State(service): State<Arc<Service>>,
    Query(params): Query<ClearLogsParams>,
) -> Result<Json<u64>, StatusCode> {
    service
        .clear_mcp_request_logs(params.clear_all.unwrap_or(false))
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn create_router(db: DatabaseConnection) -> Router {
    let service = Arc::new(Service::new(db));

    Router::new()
        .route(
            "/",
            get(get_mcp_request_logs).delete(clear_mcp_request_logs),
        )
        .route("/{request_id}", get(get_mcp_request_log_by_id))
        .route("/stats", get(get_mcp_request_log_stats))
        .with_state(service)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::mcp_request_log::{ActiveModel, CreateLogRequest};
    use crate::test_fixtures::database;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use rstest::*;
    use sea_orm::ActiveModelTrait;
    use tower::ServiceExt;

    fn app(db: DatabaseConnection) -> Router {
        create_router(db)
    }

    async fn create_test_log(db: &DatabaseConnection, request_id: &str, status_code: i32) -> i32 {
        let log_request = CreateLogRequest {
            request_id: request_id.to_string(),
            server_name: "test-server".to_string(),
            status_code,
            method: Some("GET".to_string()),
            session_id: Some("session-123".to_string()),
            mcp_session_id: Some("mcp-123".to_string()),
            client_info: None,
            request_headers: None,
            request_body: None,
            response_headers: None,
            response_body: None,
            error_message: None,
            duration_ms: Some(100),
        };

        let active_model: ActiveModel = log_request.into();
        active_model.insert(db).await.unwrap().id
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_mcp_request_logs_empty(#[future] database: DatabaseConnection) {
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
        let result: PaginatedResponse<MCPRequestLog> = serde_json::from_slice(&body).unwrap();

        assert_eq!(result.data.len(), 0);
        assert_eq!(result.total, 0);
        assert_eq!(result.page, 1);
        assert_eq!(result.page_size, 50);
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_mcp_request_logs_with_data(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create test logs
        create_test_log(&db, "req-1", 200).await;
        create_test_log(&db, "req-2", 404).await;
        create_test_log(&db, "req-3", 500).await;

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
        let result: PaginatedResponse<MCPRequestLog> = serde_json::from_slice(&body).unwrap();

        // Check that we have the logs created (order may vary)
        assert_eq!(result.data.len(), 3);
        // total is total_pages from get_request_logs
        assert_eq!(result.total, 1); // 3 items with page_size 50 = 1 page
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_mcp_request_logs_with_filters(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create test logs
        create_test_log(&db, "req-1", 200).await;
        create_test_log(&db, "req-2", 404).await;
        create_test_log(&db, "req-3", 500).await;

        let app = app(db);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/?status_code=200")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let result: PaginatedResponse<MCPRequestLog> = serde_json::from_slice(&body).unwrap();

        // Should have 1 log with status 200
        assert_eq!(result.data.len(), 1);
        assert_eq!(result.data[0].status_code, 200);
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_mcp_request_logs_pagination(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create 5 test logs
        for i in 1..=5 {
            create_test_log(&db, &format!("req-{i}"), 200).await;
        }

        let app = app(db);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/?page=2&page_size=2")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let result: PaginatedResponse<MCPRequestLog> = serde_json::from_slice(&body).unwrap();

        // Page 2 with page_size 2 should have 2 items (items 3-4)
        assert_eq!(result.data.len(), 2);
        // total is total pages (5 items / 2 per page = 3 pages)
        assert_eq!(result.total, 3);
        assert_eq!(result.page, 2);
        assert_eq!(result.page_size, 2);
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_mcp_request_log_by_id_success(#[future] database: DatabaseConnection) {
        let db = database.await;

        let id = create_test_log(&db, "req-1", 200).await;

        let app = app(db);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/{id}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let result: Option<MCPRequestLog> = serde_json::from_slice(&body).unwrap();

        assert!(result.is_some());
        let log = result.unwrap();
        assert_eq!(log.id, id);
        assert_eq!(log.request_id, "req-1");
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_mcp_request_log_by_id_not_found(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/999999")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let result: Option<MCPRequestLog> = serde_json::from_slice(&body).unwrap();

        assert!(result.is_none());
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_mcp_request_log_by_id_invalid(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/invalid-id")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_mcp_request_log_stats(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create test logs with different status codes
        create_test_log(&db, "req-1", 200).await;
        create_test_log(&db, "req-2", 200).await;
        create_test_log(&db, "req-3", 404).await;
        create_test_log(&db, "req-4", 500).await;

        let app = app(db);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/stats")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let stats: LogStats = serde_json::from_slice(&body).unwrap();

        assert_eq!(stats.total_requests, 4);
        assert_eq!(stats.success_count, 2);
        assert_eq!(stats.error_count, 2);
        assert!(stats.avg_duration_ms > 0.0);
        assert!(stats.requests_per_server.contains_key("test-server"));
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_mcp_request_log_stats_with_filters(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create test logs
        create_test_log(&db, "req-1", 200).await;
        create_test_log(&db, "req-2", 200).await;
        create_test_log(&db, "req-3", 404).await;

        let app = app(db);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/stats?status_code=200")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let stats: LogStats = serde_json::from_slice(&body).unwrap();

        assert_eq!(stats.total_requests, 2);
        assert_eq!(stats.success_count, 2);
        assert_eq!(stats.error_count, 0);
    }

    #[rstest]
    #[tokio::test]
    async fn test_clear_mcp_request_logs_old(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create test logs
        create_test_log(&db, "req-1", 200).await;
        create_test_log(&db, "req-2", 404).await;

        let app = app(db.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
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
        let deleted_count: u64 = serde_json::from_slice(&body).unwrap();

        // Should not delete anything since logs are recent (created just now)
        assert_eq!(deleted_count, 0);

        // Verify logs still exist
        let service = Service::new(db);
        let (logs, _) = service.get_mcp_request_logs(None, 1, 50).await.unwrap();
        assert_eq!(logs.len(), 2);
    }

    #[rstest]
    #[tokio::test]
    async fn test_clear_mcp_request_logs_all(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create test logs
        create_test_log(&db, "req-1", 200).await;
        create_test_log(&db, "req-2", 404).await;
        create_test_log(&db, "req-3", 500).await;

        let app = app(db.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri("/?clear_all=true")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let deleted_count: u64 = serde_json::from_slice(&body).unwrap();

        assert_eq!(deleted_count, 3);

        // Verify all logs are deleted
        let service = Service::new(db);
        let (logs, _) = service.get_mcp_request_logs(None, 1, 50).await.unwrap();
        assert_eq!(logs.len(), 0);
    }
}
