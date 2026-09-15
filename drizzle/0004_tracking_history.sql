CREATE TABLE IF NOT EXISTS `tracking_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_key` text NOT NULL,
	`shipment_id` text NOT NULL,
	`order_ref` text NOT NULL,
	`tracking` text NOT NULL,
	`carrier` text NOT NULL,
	`recorded_at` text NOT NULL,
	`kind` text NOT NULL,
	`status` text,
	`status_changed` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_tracking_history_event` ON `tracking_history` (`event_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tracking_history_shipment` ON `tracking_history` (`shipment_id`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tracking_history_tracking` ON `tracking_history` (`tracking`,`id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tracking_history_order` ON `tracking_history` (`order_ref`,`id`);
