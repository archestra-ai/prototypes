PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`server_config` text NOT NULL,
	`user_config_values` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_mcp_servers`("id", "name", "server_config", "user_config_values", "created_at") SELECT "id", "name", "server_config", "user_config_values", "created_at" FROM `mcp_servers`;--> statement-breakpoint
DROP TABLE `mcp_servers`;--> statement-breakpoint
ALTER TABLE `__new_mcp_servers` RENAME TO `mcp_servers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;