CREATE TABLE `catalog_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`synced_at` integer NOT NULL,
	`checked_at` integer NOT NULL
);
