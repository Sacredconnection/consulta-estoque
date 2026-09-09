ALTER TABLE `connections` ADD `source_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `connections` ADD `snapshot_revision` integer DEFAULT 0 NOT NULL;