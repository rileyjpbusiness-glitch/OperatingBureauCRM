ALTER TABLE `deals` ADD `import_batch_id` text;--> statement-breakpoint
CREATE INDEX `deals_import_batch_idx` ON `deals` (`import_batch_id`);