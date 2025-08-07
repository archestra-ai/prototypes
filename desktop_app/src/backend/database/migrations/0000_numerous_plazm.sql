CREATE TABLE `chats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))) NOT NULL,
	`title` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chats_sessionId_unique` ON `chats` (`session_id`);--> statement-breakpoint
CREATE TABLE `cloud_providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_type` text NOT NULL,
	`api_key` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`validated_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cloud_providers_providerType_unique` ON `cloud_providers` (`provider_type`);--> statement-breakpoint
CREATE TABLE `external_mcp_clients` (
	`client_name` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mcp_request_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text NOT NULL,
	`session_id` text,
	`mcp_session_id` text,
	`server_name` text NOT NULL,
	`client_info` text NOT NULL,
	`method` text,
	`request_headers` text NOT NULL,
	`request_body` text,
	`response_body` text,
	`response_headers` text NOT NULL,
	`status_code` integer NOT NULL,
	`error_message` text,
	`duration_ms` integer,
	`timestamp` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_request_logs_requestId_unique` ON `mcp_request_logs` (`request_id`);--> statement-breakpoint
CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`server_config` text NOT NULL,
	`user_config_values` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
