CREATE TABLE `source_health` (
	`source` text PRIMARY KEY NOT NULL,
	`ok_at` integer DEFAULT 0 NOT NULL,
	`failed_at` integer DEFAULT 0 NOT NULL
);
