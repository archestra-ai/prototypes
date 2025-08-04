CREATE TABLE `mcp_request_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text NOT NULL,
	`session_id` text,
	`mcp_session_id` text,
	`server_name` text NOT NULL,
	`client_info` text,
	`method` text,
	`request_headers` text,
	`request_body` text,
	`response_body` text,
	`response_headers` text,
	`status_code` integer NOT NULL,
	`error_message` text,
	`duration_ms` integer,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_request_logs_request_id_unique` ON `mcp_request_logs` (`request_id`);