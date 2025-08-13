-- Create new organization table with updated schema
CREATE TABLE `organization` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`has_completed_onboarding` integer DEFAULT 0 NOT NULL,
	`collect_telemetry_data` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);

-- Copy data from onboarding table
INSERT INTO `organization` (`id`, `has_completed_onboarding`, `created_at`, `updated_at`)
SELECT `id`, `completed`, `created_at`, `updated_at` FROM `onboarding`;

-- Drop old onboarding table
DROP TABLE `onboarding`;