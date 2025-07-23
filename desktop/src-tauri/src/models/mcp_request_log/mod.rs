use sea_orm::entity::prelude::*;
use sea_orm::{PaginatorTrait, QueryOrder, Set};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "mcp_request_logs")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique)]
    pub request_id: String,
    pub session_id: Option<String>,
    pub mcp_session_id: Option<String>,
    pub server_name: String,
    pub client_info: Option<String>, // JSON string
    pub method: Option<String>,
    pub request_headers: Option<String>, // JSON string
    pub request_body: Option<String>,
    pub response_body: Option<String>,
    pub response_headers: Option<String>, // JSON string
    pub status_code: i32,
    pub error_message: Option<String>,
    pub duration_ms: Option<i32>,
    pub timestamp: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientInfo {
    pub user_agent: Option<String>,
    pub client_name: Option<String>,
    pub client_version: Option<String>,
    pub client_platform: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogFilters {
    pub server_name: Option<String>,
    pub session_id: Option<String>,
    pub mcp_session_id: Option<String>,
    pub status_code: Option<i32>,
    pub method: Option<String>,
    pub start_time: Option<DateTimeUtc>,
    pub end_time: Option<DateTimeUtc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogStats {
    pub total_requests: u64,
    pub success_count: u64,
    pub error_count: u64,
    pub avg_duration_ms: f64,
    pub requests_per_server: HashMap<String, u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateLogRequest {
    pub request_id: String,
    pub session_id: Option<String>,
    pub mcp_session_id: Option<String>,
    pub server_name: String,
    pub client_info: Option<ClientInfo>,
    pub method: Option<String>,
    pub request_headers: Option<HashMap<String, String>>,
    pub request_body: Option<String>,
    pub response_body: Option<String>,
    pub response_headers: Option<HashMap<String, String>>,
    pub status_code: i32,
    pub error_message: Option<String>,
    pub duration_ms: Option<i32>,
}

impl Model {
    /// Create a new request log entry
    pub async fn create_request_log(
        db: &DatabaseConnection,
        log_data: CreateLogRequest,
    ) -> Result<Model, DbErr> {
        let client_info_json = if let Some(client_info) = &log_data.client_info {
            Some(
                serde_json::to_string(client_info)
                    .map_err(|e| DbErr::Custom(format!("Failed to serialize client_info: {e}")))?,
            )
        } else {
            None
        };

        let request_headers_json =
            if let Some(headers) = &log_data.request_headers {
                Some(serde_json::to_string(headers).map_err(|e| {
                    DbErr::Custom(format!("Failed to serialize request_headers: {e}"))
                })?)
            } else {
                None
            };

        let response_headers_json =
            if let Some(headers) = &log_data.response_headers {
                Some(serde_json::to_string(headers).map_err(|e| {
                    DbErr::Custom(format!("Failed to serialize response_headers: {e}"))
                })?)
            } else {
                None
            };

        let active_model = ActiveModel {
            request_id: Set(log_data.request_id),
            session_id: Set(log_data.session_id),
            mcp_session_id: Set(log_data.mcp_session_id),
            server_name: Set(log_data.server_name),
            client_info: Set(client_info_json),
            method: Set(log_data.method),
            request_headers: Set(request_headers_json),
            request_body: Set(log_data.request_body),
            response_body: Set(log_data.response_body),
            response_headers: Set(response_headers_json),
            status_code: Set(log_data.status_code),
            error_message: Set(log_data.error_message),
            duration_ms: Set(log_data.duration_ms),
            timestamp: Set(chrono::Utc::now()),
            ..Default::default()
        };

        Entity::insert(active_model).exec_with_returning(db).await
    }

    /// Get request logs with filtering and pagination
    pub async fn get_request_logs(
        db: &DatabaseConnection,
        filters: Option<LogFilters>,
        page: u64,
        page_size: u64,
    ) -> Result<(Vec<Model>, u64), DbErr> {
        let mut query = Entity::find().order_by_desc(Column::Timestamp);

        // Apply filters if provided
        if let Some(filters) = filters {
            if let Some(server_name) = filters.server_name {
                query = query.filter(Column::ServerName.eq(server_name));
            }
            if let Some(session_id) = filters.session_id {
                query = query.filter(Column::SessionId.eq(session_id));
            }
            if let Some(mcp_session_id) = filters.mcp_session_id {
                query = query.filter(Column::McpSessionId.eq(mcp_session_id));
            }
            if let Some(status_code) = filters.status_code {
                query = query.filter(Column::StatusCode.eq(status_code));
            }
            if let Some(method) = filters.method {
                query = query.filter(Column::Method.eq(method));
            }
            if let Some(start_time) = filters.start_time {
                query = query.filter(Column::Timestamp.gte(start_time));
            }
            if let Some(end_time) = filters.end_time {
                query = query.filter(Column::Timestamp.lte(end_time));
            }
        }

        let paginator = query.paginate(db, page_size);
        let total_pages = paginator.num_pages().await?;
        let logs = paginator.fetch_page(page).await?;

        Ok((logs, total_pages))
    }

    /// Get a single request log by ID
    pub async fn get_request_log_by_id(
        db: &DatabaseConnection,
        id: i32,
    ) -> Result<Option<Model>, DbErr> {
        Entity::find_by_id(id).one(db).await
    }

    /// Get summary statistics for request logs
    pub async fn get_request_log_stats(
        db: &DatabaseConnection,
        filters: Option<LogFilters>,
    ) -> Result<LogStats, DbErr> {
        let mut base_query = Entity::find();

        // Apply the same filters as get_request_logs
        if let Some(filters) = filters {
            if let Some(server_name) = filters.server_name {
                base_query = base_query.filter(Column::ServerName.eq(server_name));
            }
            if let Some(session_id) = filters.session_id {
                base_query = base_query.filter(Column::SessionId.eq(session_id));
            }
            if let Some(mcp_session_id) = filters.mcp_session_id {
                base_query = base_query.filter(Column::McpSessionId.eq(mcp_session_id));
            }
            if let Some(status_code) = filters.status_code {
                base_query = base_query.filter(Column::StatusCode.eq(status_code));
            }
            if let Some(method) = filters.method {
                base_query = base_query.filter(Column::Method.eq(method));
            }
            if let Some(start_time) = filters.start_time {
                base_query = base_query.filter(Column::Timestamp.gte(start_time));
            }
            if let Some(end_time) = filters.end_time {
                base_query = base_query.filter(Column::Timestamp.lte(end_time));
            }
        }

        let all_logs = base_query.all(db).await?;

        let total_requests = all_logs.len() as u64;
        let success_count = all_logs
            .iter()
            .filter(|log| log.status_code >= 200 && log.status_code < 300)
            .count() as u64;
        let error_count = total_requests - success_count;

        let avg_duration_ms = if total_requests > 0 {
            let total_duration: i32 = all_logs.iter().filter_map(|log| log.duration_ms).sum();
            if total_duration > 0 {
                total_duration as f64 / total_requests as f64
            } else {
                0.0
            }
        } else {
            0.0
        };

        let mut requests_per_server = HashMap::new();
        for log in &all_logs {
            *requests_per_server
                .entry(log.server_name.clone())
                .or_insert(0) += 1;
        }

        Ok(LogStats {
            total_requests,
            success_count,
            error_count,
            avg_duration_ms,
            requests_per_server,
        })
    }

    /// Clean up old logs (older than specified days)
    pub async fn cleanup_old_logs(
        db: &DatabaseConnection,
        retention_days: i32,
    ) -> Result<u64, DbErr> {
        let cutoff_date = chrono::Utc::now() - chrono::Duration::days(retention_days as i64);

        let delete_result = Entity::delete_many()
            .filter(Column::Timestamp.lt(cutoff_date))
            .exec(db)
            .await?;

        Ok(delete_result.rows_affected)
    }

    /// Clear all logs
    pub async fn clear_all_logs(db: &DatabaseConnection) -> Result<u64, DbErr> {
        let delete_result = Entity::delete_many().exec(db).await?;
        Ok(delete_result.rows_affected)
    }

    /// Parse client_info JSON field
    pub fn parse_client_info(&self) -> Option<ClientInfo> {
        self.client_info
            .as_ref()
            .and_then(|json| serde_json::from_str(json).ok())
    }

    /// Parse request_headers JSON field
    pub fn parse_request_headers(&self) -> Option<HashMap<String, String>> {
        self.request_headers
            .as_ref()
            .and_then(|json| serde_json::from_str(json).ok())
    }

    /// Parse response_headers JSON field
    pub fn parse_response_headers(&self) -> Option<HashMap<String, String>> {
        self.response_headers
            .as_ref()
            .and_then(|json| serde_json::from_str(json).ok())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_fixtures::database;
    use rstest::*;

    #[rstest]
    #[tokio::test]
    async fn test_create_request_log(#[future] database: DatabaseConnection) {
        let db = database.await;

        let client_info = ClientInfo {
            user_agent: Some("Test Client/1.0".to_string()),
            client_name: Some("test-client".to_string()),
            client_version: Some("1.0.0".to_string()),
            client_platform: Some("test".to_string()),
        };

        let mut headers = HashMap::new();
        headers.insert("Content-Type".to_string(), "application/json".to_string());

        let log_data = CreateLogRequest {
            request_id: "test-request-123".to_string(),
            session_id: Some("session-456".to_string()),
            mcp_session_id: Some("mcp-session-789".to_string()),
            server_name: "test-server".to_string(),
            client_info: Some(client_info),
            method: Some("tools/call".to_string()),
            request_headers: Some(headers.clone()),
            request_body: Some(r#"{"method":"test","params":{}}"#.to_string()),
            response_body: Some(r#"{"result":"success"}"#.to_string()),
            response_headers: Some(headers),
            status_code: 200,
            error_message: None,
            duration_ms: Some(150),
        };

        let result = Model::create_request_log(&db, log_data).await;
        assert!(result.is_ok());

        let log = result.unwrap();
        assert_eq!(log.request_id, "test-request-123");
        assert_eq!(log.server_name, "test-server");
        assert_eq!(log.status_code, 200);
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_request_logs_with_pagination(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create multiple test logs
        for i in 1..=5 {
            let log_data = CreateLogRequest {
                request_id: format!("test-request-{i}"),
                session_id: Some(format!("session-{i}")),
                mcp_session_id: Some(format!("mcp-session-{i}")),
                server_name: format!("server-{i}"),
                client_info: None,
                method: Some("tools/list".to_string()),
                request_headers: None,
                request_body: None,
                response_body: None,
                response_headers: None,
                status_code: 200,
                error_message: None,
                duration_ms: Some(100 + i),
            };
            Model::create_request_log(&db, log_data).await.unwrap();
        }

        let (logs, total_pages) = Model::get_request_logs(&db, None, 0, 2).await.unwrap();

        assert_eq!(logs.len(), 2);
        assert!(total_pages >= 3); // Should have at least 3 pages for 5 items with page_size 2
    }

    #[rstest]
    #[tokio::test]
    async fn test_get_request_log_stats(#[future] database: DatabaseConnection) {
        let db = database.await;

        // Create test logs with different status codes
        let test_cases = [
            ("server1", 200, 100),
            ("server1", 200, 150),
            ("server2", 500, 200),
            ("server2", 404, 75),
        ];

        for (i, (server, status, duration)) in test_cases.iter().enumerate() {
            let log_data = CreateLogRequest {
                request_id: format!("test-{i}"),
                session_id: None,
                mcp_session_id: None,
                server_name: (*server).to_string(),
                client_info: None,
                method: Some("test".to_string()),
                request_headers: None,
                request_body: None,
                response_body: None,
                response_headers: None,
                status_code: *status,
                error_message: None,
                duration_ms: Some(*duration),
            };
            Model::create_request_log(&db, log_data).await.unwrap();
        }

        let stats = Model::get_request_log_stats(&db, None).await.unwrap();

        assert_eq!(stats.total_requests, 4);
        assert_eq!(stats.success_count, 2); // Only 200 status codes
        assert_eq!(stats.error_count, 2);
        assert!(stats.avg_duration_ms > 0.0);
        assert_eq!(stats.requests_per_server.len(), 2);
    }
}
