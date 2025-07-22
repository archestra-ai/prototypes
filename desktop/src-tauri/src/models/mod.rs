pub mod external_mcp_client;
pub mod mcp_request_log;
pub mod mcp_server;

// Re-export the main types for convenience
pub use external_mcp_client::Model as ClientConnectionConfig;
pub use mcp_request_log::{Model as MCPRequestLog, CreateLogRequest, LogFilters, LogStats};
pub use mcp_server::{MCPServerDefinition, Model as MCPServer};
