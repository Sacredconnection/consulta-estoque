CREATE TABLE `sync_jobs` (
	`store_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`status` text NOT NULL,
	`cursor` text NOT NULL,
	`started_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`error` text
);
