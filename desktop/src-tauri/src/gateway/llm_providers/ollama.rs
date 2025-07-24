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
    // Handle CORS preflight requests
    if req.method() == axum::http::Method::OPTIONS {
        return Response::builder()
            .status(StatusCode::OK)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            .header("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent")
            .body(Body::empty())
            .unwrap();
    }
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

            // Copy headers from the upstream response, but skip CORS headers to avoid duplicates
            for (name, value) in resp.headers().iter() {
                let name_str = name.as_str().to_lowercase();
                if !name_str.starts_with("access-control-") {
                    response_builder = response_builder.header(name, value);
                }
            }

            // Add CORS headers
            response_builder = response_builder
                .header("Access-Control-Allow-Origin", "*")
                .header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
                .header("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent");

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
        Err(e) => Response::builder()
            .status(StatusCode::BAD_GATEWAY)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            .header("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent")
            .body(Body::from(format!("Proxy error: {e}")))
            .unwrap(),
    }
}

pub fn create_router(db: DatabaseConnection) -> Router {
    Router::new()
        .fallback(proxy_handler)
        .with_state(Arc::new(Service::new(db)))
}
