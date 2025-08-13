-- Create new user table with updated schema
CREATE TABLE `user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`has_completed_onboarding` integer DEFAULT 0 NOT NULL,
	`collect_telemetry_data` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);

-- Copy data from organization table
INSERT INTO `user` (`id`, `has_completed_onboarding`, `collect_telemetry_data`, `created_at`, `updated_at`)
SELECT `id`, `has_completed_onboarding`, `collect_telemetry_data`, `created_at`, `updated_at` FROM `organization`;

-- Drop old organization table
DROP TABLE `organization`;