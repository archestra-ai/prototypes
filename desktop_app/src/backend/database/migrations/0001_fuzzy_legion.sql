CREATE TABLE `onboarding` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
