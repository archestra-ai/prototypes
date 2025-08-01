use crate::gateway::websocket::Service as WebSocketService;
use crate::models::chat::{ChatDefinition, Model as ChatModel};
use crate::ollama::client::OllamaClient;
use axum::{
    body::Body,
    extract::State,
    http::{Request, Response, StatusCode},
    response::IntoResponse,
};
use futures_util::StreamExt;
use ollama_rs::{
    generation::{
        chat::{request::ChatMessageRequest, ChatMessage as OllamaChatMessage},
        tools::ToolInfo,
    },
    models::ModelOptions,
};
use sea_orm::DatabaseConnection;
use std::sync::Arc;
use tracing::{debug, error};

// Constants
const MAX_REQUEST_SIZE: usize = 10 * 1024 * 1024; // 10 MB
const CONTENT_TYPE_NDJSON: &str = "application/x-ndjson";
const HEADER_CONTENT_TYPE: &str = "content-type";

#[derive(Clone)]
pub struct Service {
    pub(crate) db: Arc<DatabaseConnection>,
    pub(crate) ollama_client: OllamaClient,
    pub(crate) _ws_service: Arc<WebSocketService>,
}

impl Service {
    pub fn new(
        db: Arc<DatabaseConnection>,
        ollama_client: OllamaClient,
        ws_service: Arc<WebSocketService>,
    ) -> Self {
        Self {
            db,
            ollama_client,
            _ws_service: ws_service,
        }
    }

    async fn proxy_chat_request(&self, req: Request<Body>) -> Result<Response<Body>, String> {
        // Read request body
        let body_bytes = match axum::body::to_bytes(req.into_body(), MAX_REQUEST_SIZE).await {
            Ok(bytes) => bytes,
            Err(_) => return Err("Failed to read request body".to_string()),
        };

        // Convert to Ollama request
        let (ollama_request, session_id) = convert_proxied_request_to_ollama_request(&body_bytes)?;

        // Load or create chat
        let _chat = match ChatModel::load_by_session_id(session_id.clone(), &self.db).await {
            Ok(Some(chat)) => chat,
            Ok(None) => {
                // Create new chat if doesn't exist
                let definition = ChatDefinition {
                    llm_provider: "ollama".to_string(),
                };
                match ChatModel::save(definition, &self.db).await {
                    Ok(chat) => chat,
                    Err(e) => return Err(format!("Failed to create chat: {e}")),
                }
            }
            Err(e) => return Err(format!("Failed to load chat: {e}")),
        };

        // Send request to Ollama
        let client = reqwest::Client::new();
        let target_url = format!("{}/api/chat", self.ollama_client.client.url());

        let response = client
            .post(&target_url)
            .header(HEADER_CONTENT_TYPE, CONTENT_TYPE_NDJSON)
            .body(
                serde_json::to_vec(&ollama_request)
                    .map_err(|e| format!("Failed to serialize request: {e}"))?,
            )
            .send()
            .await
            .map_err(|e| format!("Failed to send request to Ollama: {e}"))?;

        let status = response.status();
        let headers = response.headers().clone();

        // Stream the response
        let stream = response.bytes_stream();
        let body_stream = stream.map(|result| {
            result
                .map(|bytes| axum::body::Bytes::from(bytes.to_vec()))
                .map_err(std::io::Error::other)
        });

        let mut response = Response::builder().status(status.as_u16());

        // Copy response headers
        for (name, value) in headers {
            if let Some(name) = name {
                response = response.header(name.as_str(), value.as_bytes());
            }
        }

        response
            .body(Body::from_stream(body_stream))
            .map_err(|e| format!("Failed to create response body: {e}"))
    }

    async fn proxy_other_request(
        &self,
        method: axum::http::Method,
        path: &str,
        req: Request<Body>,
    ) -> Result<Response<Body>, String> {
        // Create HTTP client for proxying
        let client = reqwest::Client::new();

        // Build the target URL for Ollama
        let mut target_host = self.ollama_client.client.url().to_string();
        // Remove trailing slash
        if target_host.ends_with('/') {
            target_host.pop();
        }
        let target_url = format!("{target_host}{path}");
        debug!("Target URL: {}", target_url);

        // Validate the target URL for security
        Self::validate_proxy_target(&target_url)?;

        // Convert axum request to reqwest
        let mut reqwest_builder = client.request(
            match method {
                axum::http::Method::GET => reqwest::Method::GET,
                axum::http::Method::POST => reqwest::Method::POST,
                axum::http::Method::PUT => reqwest::Method::PUT,
                axum::http::Method::DELETE => reqwest::Method::DELETE,
                axum::http::Method::PATCH => reqwest::Method::PATCH,
                _ => return Err("Unsupported HTTP method".to_string()),
            },
            &target_url,
        );

        // Copy headers
        for (name, value) in req.headers() {
            if let Ok(value_str) = value.to_str() {
                reqwest_builder = reqwest_builder.header(name.as_str(), value_str);
            }
        }

        // Copy body
        let body_bytes = match axum::body::to_bytes(req.into_body(), MAX_REQUEST_SIZE).await {
            Ok(bytes) => bytes,
            Err(_) => return Err("Failed to read request body".to_string()),
        };

        if !body_bytes.is_empty() {
            reqwest_builder = reqwest_builder.body(body_bytes.to_vec());
        }

        // Send request to Ollama
        debug!("Sending request to Ollama");
        match reqwest_builder.send().await {
            Ok(resp) => {
                let status = resp.status();
                let headers = resp.headers().clone();
                debug!("Received response with status: {}", status);

                // Stream the response back
                let stream = resp.bytes_stream();
                let body_stream = stream.map(|result| {
                    result
                        .map(|bytes| axum::body::Bytes::from(bytes.to_vec()))
                        .map_err(std::io::Error::other)
                });

                let mut response = Response::builder().status(status.as_u16());

                // Copy response headers
                for (name, value) in headers {
                    if let Some(name) = name {
                        response = response.header(name.as_str(), value.as_bytes());
                    }
                }

                response
                    .body(Body::from_stream(body_stream))
                    .map_err(|e| format!("Failed to create response body: {e}"))
            }
            Err(e) => {
                error!("Failed to proxy request to Ollama: {}", e);
                Err(format!(
                    "Failed to proxy request to Ollama (is Ollama running?): {e}"
                ))
            }
        }
    }

    /// Validate proxy target URL for security
    fn validate_proxy_target(url: &str) -> Result<(), String> {
        // Parse the URL
        let parsed_url = url.parse::<url::Url>().map_err(|_| "Invalid URL format")?;

        // Only allow specific schemes
        match parsed_url.scheme() {
            "http" | "https" => {}
            scheme => return Err(format!("Disallowed URL scheme: {scheme}")),
        }

        // Extract host
        let host = parsed_url.host_str().ok_or("No host in URL")?;

        // Only allow localhost and loopback addresses
        let allowed_hosts = ["localhost", "127.0.0.1", "::1", "[::1]"];
        if !allowed_hosts.contains(&host) {
            return Err(format!(
                "Host not allowed: {host}. Only localhost connections are permitted."
            ));
        }

        // Only allow specific ports (Ollama port)
        if let Some(port) = parsed_url.port() {
            let allowed_ports = [
                54588, // Ollama port from FALLBACK_OLLAMA_SERVER_PORT
                crate::ollama::server::get_ollama_server_port(),
            ];
            if !allowed_ports.contains(&port) {
                return Err(format!(
                    "Port not allowed: {port}. Only Ollama ports are permitted."
                ));
            }
        }

        // Validate path doesn't contain directory traversal
        let path = parsed_url.path();
        if path.contains("..") || path.contains("\\") {
            return Err("Path contains directory traversal patterns".to_string());
        }

        Ok(())
    }
}

pub async fn proxy_handler(
    State(service): State<Arc<Service>>,
    req: Request<Body>,
) -> impl IntoResponse {
    let path = req.uri().path().to_string();
    let method = req.method().clone();

    let result = match path.as_str() {
        "/api/chat" => service.proxy_chat_request(req).await,
        _ => service.proxy_other_request(method, &path, req).await,
    };

    match result {
        Ok(response) => response,
        Err(e) => {
            error!("Request failed with error: {}", e);
            (StatusCode::BAD_GATEWAY, format!("Proxy error: {e}")).into_response()
        }
    }
}

// NOTE: the ideal way here would be that ChatMessageRequest would implement Deserialize and then we could just
// create our own "ProxiedOllamaChatRequest" struct, which contains session_id + all of the OllamaChatRequest
// fields and flatten everything into one object and deserialize the request json bytes into that struct, but
// OllamaChatRequest doesn't "implement" Deserialize.. so this is the alternative
fn convert_proxied_request_to_ollama_request(
    body_bytes: &[u8],
) -> Result<(ChatMessageRequest, String), String> {
    debug!("Converting proxied request to ollama request");

    // First, parse as JSON Value to extract session_id
    let json_value: serde_json::Value = match serde_json::from_slice(body_bytes) {
        Ok(value) => value,
        Err(e) => {
            error!("Failed to parse JSON: {e}");
            return Err(format!("Failed to parse JSON: {e}"));
        }
    };

    // Extract session_id
    let session_id = match json_value.get("session_id").and_then(|v| v.as_str()) {
        Some(id) => {
            debug!("Extracted session_id: {}", id);
            id.to_string()
        }
        None => {
            error!("Missing session_id in request");
            return Err("Missing session_id in request".to_string());
        }
    };

    // Extract required fields to construct ChatMessageRequest
    let model_name = match json_value.get("model").and_then(|v| v.as_str()) {
        Some(model) => model.to_string(),
        None => return Err("Missing model in request".to_string()),
    };

    // Extract messages array
    let messages_value = match json_value.get("messages") {
        Some(msgs) => msgs,
        None => return Err("Missing messages in request".to_string()),
    };

    // Parse messages as OllamaChatMessage objects
    let messages: Vec<OllamaChatMessage> = match serde_json::from_value(messages_value.clone()) {
        Ok(msgs) => msgs,
        Err(e) => return Err(format!("Failed to parse messages: {e}")),
    };

    // Create ChatMessageRequest using the constructor
    let mut ollama_request = ChatMessageRequest::new(model_name.clone(), messages);

    // Set optional fields if they exist
    if let Some(options_value) = json_value.get("options") {
        if let Ok(options) = serde_json::from_value::<ModelOptions>(options_value.clone()) {
            ollama_request = ollama_request.options(options);
        }
    }

    if let Some(template) = json_value.get("template").and_then(|v| v.as_str()) {
        ollama_request = ollama_request.template(template.to_string());
    }

    if let Some(tools_value) = json_value.get("tools") {
        if let Ok(tools) = serde_json::from_value::<Vec<ToolInfo>>(tools_value.clone()) {
            ollama_request = ollama_request.tools(tools);
        }
    }

    if let Some(think) = json_value.get("think").and_then(|v| v.as_bool()) {
        ollama_request = ollama_request.think(think);
    }

    Ok((ollama_request, session_id))
}
