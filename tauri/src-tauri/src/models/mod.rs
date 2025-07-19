pub mod client_connection_config;
pub mod mcp_server;

// Re-export the main types for convenience
pub use client_connection_config::Model as ClientConnectionConfig;
pub use mcp_server::{Model as McpServer, McpServerDefinition};