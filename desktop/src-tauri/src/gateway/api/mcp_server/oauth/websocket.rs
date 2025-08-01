use crate::gateway::websocket::{
    OAuthErrorWebSocketPayload, OAuthSuccessWebSocketPayload, Service as WebSocketService,
    WebSocketMessage,
};

pub async fn emit_oauth_success(
    websocket_service: WebSocketService,
    mcp_server_catalog_id: String,
) {
    let message = WebSocketMessage::OAuthSuccess(OAuthSuccessWebSocketPayload {
        mcp_server_catalog_id,
    });
    websocket_service.broadcast(message).await;
}

pub async fn emit_oauth_error(
    websocket_service: WebSocketService,
    mcp_server_catalog_id: String,
    error: String,
) {
    let message = WebSocketMessage::OAuthError(OAuthErrorWebSocketPayload {
        mcp_server_catalog_id,
        error,
    });
    websocket_service.broadcast(message).await;
}
