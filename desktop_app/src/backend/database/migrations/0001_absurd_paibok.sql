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
CREATE UNIQUE INDEX `cloud_providers_provider_type_unique` ON `cloud_providers` (`provider_type`);