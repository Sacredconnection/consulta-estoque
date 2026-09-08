CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`credentials` text NOT NULL,
	`snapshot` text,
	`last_sync` text,
	`error` text,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`lock_token` text
);
--> statement-breakpoint
CREATE TABLE `records` (
	`snapshot` text NOT NULL,
	`store_id` text NOT NULL,
	`product_id` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`snapshot`, `store_id`, `product_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_records_store_snapshot` ON `records` (`store_id`,`snapshot`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
