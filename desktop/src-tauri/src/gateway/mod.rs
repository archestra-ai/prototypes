use axum::Router;
use sea_orm::DatabaseConnection;
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::{DefaultMakeSpan, DefaultOnRequest, DefaultOnResponse, TraceLayer};
use tracing::{info, Level};

pub mod api;
pub mod llm_providers;
mod mcp;
mod mcp_proxy;
pub mod websocket;

pub const GATEWAY_SERVER_PORT: u16 = 54587;

pub async fn start_gateway(
    user_id: String,
    db: DatabaseConnection,
) -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(Level::DEBUG)
        .with_target(false)
        .init();

    info!("Starting gateway server...");

    let ws_service = std::sync::Arc::new(websocket::Service::new());
    let mcp_service = mcp::create_streamable_http_service(user_id, db.clone()).await;

    let mcp_proxy_router = mcp_proxy::create_router(db.clone());
    let api_router = api::create_router(db.clone());
    let llm_providers_router = llm_providers::create_router(db.clone(), ws_service.clone());
    let websocket_router = websocket::create_router(ws_service.clone());

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Create trace layer for logging
    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
        .on_request(DefaultOnRequest::new().level(Level::INFO))
        .on_response(DefaultOnResponse::new().level(Level::INFO));

    let app = Router::new()
        .nest("/mcp_proxy", mcp_proxy_router)
        .nest("/llm", llm_providers_router)
        .nest("/api", api_router)
        .nest("/ws", websocket_router)
        .nest_service("/mcp", mcp_service)
        .layer(cors)
        .layer(trace_layer);

    let addr = SocketAddr::from(([127, 0, 0, 1], GATEWAY_SERVER_PORT));
    let listener = TcpListener::bind(addr).await?;

    info!("Gateway started successfully on http://{addr}");
    info!("  - Archestra MCP endpoint (streamable HTTP): http://{addr}/mcp");
    info!("  - Proxy endpoints: http://{addr}/mcp_proxy/<server_name>");
    info!("  - LLM endpoints: http://{addr}/llm/<provider>");
    info!("  - API endpoints: http://{addr}/api");
    info!("  - WebSocket endpoint: ws://{addr}/ws");

    let server = axum::serve(listener, app);

    if let Err(e) = server.await {
        tracing::error!("Server error: {e}");
    }

    info!("Server has been shut down");
    Ok(())
}
