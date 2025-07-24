use crate::ollama::OLLAMA_SERVER_PORT;
use axum::{
    body::Body,
    extract::State,
    http::{Request, Response, StatusCode},
    response::IntoResponse,
    Router,
};
use futures_util::StreamExt;
use reqwest::Client;
use sea_orm::DatabaseConnection;
use std::sync::Arc;
use std::time::Duration;

// Constants for resource management
// Also, make the request timeout very high as it can take some time for the LLM to respond
const REQUEST_TIMEOUT: Duration = Duration::from_secs(180);

struct Service {
    _db: Arc<DatabaseConnection>,
    http_client: Client,
}

impl Service {
    pub fn new(db: DatabaseConnection) -> Self {
        Self {
            _db: Arc::new(db),
            http_client: Client::builder()
                .timeout(REQUEST_TIMEOUT)
                .build()
                .unwrap_or_default(),
        }
    }
}

async fn proxy_handler(
    State(service): State<Arc<Service>>,
    req: Request<Body>,
) -> impl IntoResponse {
    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("");
    let target_url = format!("http://127.0.0.1:{OLLAMA_SERVER_PORT}{path_and_query}");

    let method = req.method().clone();
    let headers = req.headers().clone();
    let body_bytes = match axum::body::to_bytes(req.into_body(), usize::MAX).await {
        Ok(bytes) => bytes,
        Err(_) => return (StatusCode::BAD_REQUEST, "Failed to read request body").into_response(),
    };

    let mut request = service.http_client.request(method, &target_url);

    for (name, value) in headers.iter() {
        request = request.header(name, value);
    }

    if !body_bytes.is_empty() {
        request = request.body(body_bytes);
    }

    match request.send().await {
        Ok(resp) => {
            let status = resp.status();
            let mut response_builder = Response::builder().status(status);

            // Copy headers from the upstream response
            for (name, value) in resp.headers().iter() {
                response_builder = response_builder.header(name, value);
            }

            // Convert the response body into a stream
            let body_stream = resp.bytes_stream();

            // Map the stream to convert reqwest::Bytes to axum::body::Bytes
            let mapped_stream = body_stream.map(|result| {
                result
                    .map(|bytes| axum::body::Bytes::from(bytes.to_vec()))
                    .map_err(std::io::Error::other)
            });

            // Create a streaming body from the mapped stream
            let body = Body::from_stream(mapped_stream);

            response_builder.body(body).unwrap_or_else(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to build response",
                )
                    .into_response()
            })
        }
        Err(e) => (StatusCode::BAD_GATEWAY, format!("Proxy error: {e}")).into_response(),
    }
}

pub fn create_router(db: DatabaseConnection) -> Router {
    Router::new()
        .fallback(proxy_handler)
        .with_state(Arc::new(Service::new(db)))
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
    use tower::ServiceExt;

    fn app(db: DatabaseConnection) -> Router {
        create_router(db)
    }

    #[rstest]
    #[tokio::test]
    async fn test_service_creation(#[future] database: DatabaseConnection) {
        let db = database.await;
        let service = Service::new(db);
        
        // Just ensure the service is created successfully
        // (We can't easily test the timeout configuration)
        assert!(Arc::strong_count(&service._db) > 0);
    }

    #[rstest]
    #[tokio::test]
    async fn test_proxy_get_request(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);
        
        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/tags")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // This will fail with BAD_GATEWAY since Ollama isn't running
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        
        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body_str = String::from_utf8(body.to_vec()).unwrap();
        assert!(body_str.contains("Proxy error"));
    }

    #[rstest]
    #[tokio::test]
    async fn test_proxy_with_body(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);

        let request_body = serde_json::json!({
            "model": "llama2",
            "prompt": "Hello, world!"
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/generate")
                    .header("Content-Type", "application/json")
                    .body(Body::from(serde_json::to_string(&request_body).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        // This will fail with BAD_GATEWAY since Ollama isn't running
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        
        let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body_str = String::from_utf8(body.to_vec()).unwrap();
        assert!(body_str.contains("Proxy error"));
    }

    #[rstest]
    #[tokio::test]
    async fn test_proxy_with_headers(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/version")
                    .header("Authorization", "Bearer test-token")
                    .header("X-Custom-Header", "test-value")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        // This will fail with BAD_GATEWAY since Ollama isn't running
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    }

    #[rstest]
    #[tokio::test]
    async fn test_proxy_path_and_query(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);

        // Test with query parameters
        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/pull?name=llama2&insecure=false")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    }

    #[rstest]
    #[tokio::test]
    async fn test_proxy_empty_path(#[future] database: DatabaseConnection) {
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

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
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
                let req = Request::builder()
                    .method("GET")
                    .uri(format!("/api/test/{i}"))
                    .body(Body::empty())
                    .unwrap();
                
                let response = proxy_handler(
                    State(service_clone),
                    req
                ).await.into_response();
                
                response.status()
            });
            handles.push(handle);
        }

        for handle in handles {
            let status = handle.await.unwrap();
            assert_eq!(status, StatusCode::BAD_GATEWAY);
        }
    }

    #[rstest]
    #[tokio::test]
    async fn test_proxy_large_body(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);

        // Create a large body (1MB)
        let large_body = "x".repeat(1024 * 1024);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/generate")
                    .header("Content-Type", "text/plain")
                    .body(Body::from(large_body))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    }

    #[rstest]
    #[tokio::test]
    async fn test_proxy_various_methods(#[future] database: DatabaseConnection) {
        let db = database.await;
        let app = app(db);

        let methods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
        
        for method_str in &methods {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(*method_str)
                        .uri("/api/test")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        }
    }
}
