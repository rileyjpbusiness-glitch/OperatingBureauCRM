ALTER TABLE `deals` ADD `binned_at` integer;--> statement-breakpoint
CREATE INDEX `deals_binned_idx` ON `deals` (`binned_at`);