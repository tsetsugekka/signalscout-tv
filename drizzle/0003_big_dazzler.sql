CREATE TABLE `source_votes` (
	`source` text NOT NULL,
	`device` text NOT NULL,
	`reporter` text NOT NULL,
	`ok_at` integer DEFAULT 0 NOT NULL,
	`failed_at` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`source`, `device`, `reporter`)
);
