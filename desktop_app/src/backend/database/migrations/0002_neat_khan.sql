ALTER TABLE `onboarding` RENAME TO `user`;--> statement-breakpoint
ALTER TABLE `user` RENAME COLUMN "completed" TO "has_completed_onboarding";--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`has_completed_onboarding` integer DEFAULT false NOT NULL,
	`collect_telemetry_data` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "has_completed_onboarding", "collect_telemetry_data", "created_at", "updated_at") SELECT "id", "has_completed_onboarding", 1, "created_at", "updated_at" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
