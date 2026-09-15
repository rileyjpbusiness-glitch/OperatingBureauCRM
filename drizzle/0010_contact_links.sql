CREATE TABLE `contact_links` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`platform` text NOT NULL,
	`url` text NOT NULL,
	`label` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_links_contact_idx` ON `contact_links` (`contact_id`,`position`);--> statement-breakpoint
CREATE INDEX `contact_links_platform_idx` ON `contact_links` (`platform`);--> statement-breakpoint
ALTER TABLE `contacts` ADD `links_backfilled` integer DEFAULT false NOT NULL;