CREATE TABLE `usage_counters` (
	`bucket` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `usage_expiry` ON `usage_counters` (`expires_at`);