CREATE TABLE `tools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mcp_server_id` text NOT NULL,
	`name` text NOT NULL,
	`metadata` text NOT NULL,
	`analysis` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`mcp_server_id`) REFERENCES `mcp_servers`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Create index for faster lookups by MCP server
CREATE INDEX `tools_mcp_server_id_idx` ON `tools` (`mcp_server_id`);

-- Create unique index to prevent duplicate tools per server
CREATE UNIQUE INDEX `tools_mcp_server_id_name_idx` ON `tools` (`mcp_server_id`, `name`);