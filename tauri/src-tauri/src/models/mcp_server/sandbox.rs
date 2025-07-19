// Sandbox functionality for MCP servers
// This module handles the lifecycle of MCP server processes

use super::{McpServerDefinition};

/// Start an MCP server
pub async fn start_mcp_server(
    app_handle: &tauri::AppHandle,
    definition: &McpServerDefinition,
) -> Result<(), String> {
    let bridge_state = app_handle.state::<crate::mcp_bridge::McpBridgeState>();
    let bridge = &bridge_state.0;
    
    bridge.start_mcp_server(
        definition.name.clone(),
        definition.server_config.command.clone(),
        definition.server_config.args.clone(),
        Some(definition.server_config.env.clone()),
    ).await
}

/// Stop an MCP server
pub async fn stop_mcp_server(
    app_handle: &tauri::AppHandle,
    server_name: &str,
) -> Result<(), String> {
    let bridge_state = app_handle.state::<crate::mcp_bridge::McpBridgeState>();
    let bridge = &bridge_state.0;
    
    bridge.stop_server(server_name).await
}