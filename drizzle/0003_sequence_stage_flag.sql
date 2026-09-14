ALTER TABLE `stages` ADD `is_sequence` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Point the flag at the stage the restructure created.
UPDATE stages SET is_sequence = true
WHERE name = 'In Sequence'
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound');
