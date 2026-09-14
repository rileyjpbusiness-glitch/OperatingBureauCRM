CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`type` text NOT NULL,
	`from_stage_id` text,
	`to_stage_id` text,
	`meta` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`to_stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activities_deal_created_idx` ON `activities` (`deal_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activities_to_stage_idx` ON `activities` (`to_stage_id`,`deal_id`);--> statement-breakpoint
CREATE TABLE `contact_tags` (
	`contact_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`contact_id`, `tag_id`),
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_tags_tag_idx` ON `contact_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text,
	`company` text,
	`instagram_handle` text,
	`email` text,
	`phone` text,
	`website` text,
	`niche` text,
	`offer_type` text,
	`monthly_revenue_estimate` integer,
	`source` text NOT NULL,
	`owner` text NOT NULL,
	`notes_summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contacts_owner_idx` ON `contacts` (`owner`);--> statement-breakpoint
CREATE INDEX `contacts_source_idx` ON `contacts` (`source`);--> statement-breakpoint
CREATE INDEX `contacts_email_idx` ON `contacts` (`email`);--> statement-breakpoint
CREATE INDEX `contacts_instagram_idx` ON `contacts` (`instagram_handle`);--> statement-breakpoint
CREATE INDEX `contacts_last_name_idx` ON `contacts` (`last_name`);--> statement-breakpoint
CREATE TABLE `deals` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`pipeline_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`title` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`value_type` text DEFAULT 'monthly_recurring' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`lost_reason` text,
	`owner` text NOT NULL,
	`next_action` text,
	`next_action_at` integer,
	`position` real NOT NULL,
	`stage_entered_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pipeline_id`) REFERENCES `pipelines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `deals_stage_position_idx` ON `deals` (`stage_id`,`position`);--> statement-breakpoint
CREATE INDEX `deals_pipeline_idx` ON `deals` (`pipeline_id`);--> statement-breakpoint
CREATE INDEX `deals_contact_idx` ON `deals` (`contact_id`);--> statement-breakpoint
CREATE INDEX `deals_status_idx` ON `deals` (`status`);--> statement-breakpoint
CREATE INDEX `deals_next_action_idx` ON `deals` (`next_action_at`);--> statement-breakpoint
CREATE INDEX `deals_owner_idx` ON `deals` (`owner`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`body` text NOT NULL,
	`author` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_deal_idx` ON `notes` (`deal_id`,`pinned`,`created_at`);--> statement-breakpoint
CREATE TABLE `pipelines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pipelines_slug_unique` ON `pipelines` (`slug`);--> statement-breakpoint
CREATE INDEX `pipelines_position_idx` ON `pipelines` (`position`);--> statement-breakpoint
CREATE TABLE `stages` (
	`id` text PRIMARY KEY NOT NULL,
	`pipeline_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`color` text NOT NULL,
	`stale_after_days` integer DEFAULT 7,
	`is_won` integer DEFAULT false NOT NULL,
	`is_lost` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`pipeline_id`) REFERENCES `pipelines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stages_pipeline_position_idx` ON `stages` (`pipeline_id`,`position`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`title` text NOT NULL,
	`due_at` integer,
	`completed_at` integer,
	`owner` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_deal_due_idx` ON `tasks` (`deal_id`,`due_at`);--> statement-breakpoint
CREATE TABLE `touches` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`channel` text NOT NULL,
	`direction` text NOT NULL,
	`sequence_step` integer,
	`outcome` text NOT NULL,
	`body_snippet` text,
	`occurred_at` integer NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`external_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `touches_deal_occurred_idx` ON `touches` (`deal_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `touches_channel_idx` ON `touches` (`channel`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `touches_external_id_unique` ON `touches` (`external_id`);