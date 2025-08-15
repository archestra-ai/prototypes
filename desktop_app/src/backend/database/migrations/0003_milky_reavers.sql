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
