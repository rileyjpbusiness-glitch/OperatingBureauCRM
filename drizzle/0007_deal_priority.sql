ALTER TABLE `deals` ADD `priority` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `deals_priority_idx` ON `deals` (`priority`);