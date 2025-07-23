use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get},
    Router,
};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::models::mcp_request_log::{LogFilters, LogStats, Model as MCPRequestLog};

#[derive(Debug, Deserialize)]
struct LogQueryParams {
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

#[derive(Debug, Deserialize)]
struct ClearLogsParams {
    clear_all: Option<bool>,
}

#[derive(Debug, Serialize)]
struct PaginatedResponse<T> {
    data: Vec<T>,
    total: u64,
    page: u64,
    page_size: u64,
}

struct Service {
    db: Arc<DatabaseConnection>,
}

impl Service {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db: Arc::new(db) }
    }

    async fn get_logs(
        &self,
        filters: Option<LogFilters>,
        page: u64,
        page_size: u64,
    ) -> Result<(Vec<MCPRequestLog>, u64), String> {
        MCPRequestLog::get_request_logs(&self.db, filters, page, page_size)
            .await
            .map_err(|e| format!("Failed to get request logs: {e}"))
    }

    async fn get_log_by_id(&self, request_id: i32) -> Result<Option<MCPRequestLog>, String> {
        MCPRequestLog::get_request_log_by_id(&self.db, request_id)
            .await
            .map_err(|e| format!("Failed to get request log: {e}"))
    }

    async fn get_stats(&self, filters: Option<LogFilters>) -> Result<LogStats, String> {
        MCPRequestLog::get_request_log_stats(&self.db, filters)
            .await
            .map_err(|e| format!("Failed to get request log stats: {e}"))
    }

    async fn clear_logs(&self, clear_all: bool) -> Result<u64, String> {
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

async fn get_logs_handler(
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
        .get_logs(filters, page, page_size)
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

async fn get_log_by_id_handler(
    State(service): State<Arc<Service>>,
    Path(request_id): Path<String>,
) -> Result<Json<Option<MCPRequestLog>>, StatusCode> {
    let id = request_id
        .parse::<i32>()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    
    service
        .get_log_by_id(id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn get_stats_handler(
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
        .get_stats(filters)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn clear_logs_handler(
    State(service): State<Arc<Service>>,
    Query(params): Query<ClearLogsParams>,
) -> Result<Json<u64>, StatusCode> {
    service
        .clear_logs(params.clear_all.unwrap_or(false))
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub fn create_router(db: DatabaseConnection) -> Router {
    let service = Arc::new(Service::new(db));

    Router::new()
        .route("/", get(get_logs_handler).delete(clear_logs_handler))
        .route("/:request_id", get(get_log_by_id_handler))
        .route("/stats", get(get_stats_handler))
        .with_state(service)
}
