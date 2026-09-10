CREATE TABLE `whatsapp_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`from_number` text NOT NULL,
	`question` text NOT NULL,
	`received_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reply` text,
	`next_part` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`last_message_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_whatsapp_status_available` ON `whatsapp_messages` (`status`,`available_at`);