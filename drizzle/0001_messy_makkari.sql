ALTER TABLE `deals` ADD `sequence_step` text;--> statement-breakpoint
CREATE INDEX `deals_sequence_step_idx` ON `deals` (`sequence_step`);