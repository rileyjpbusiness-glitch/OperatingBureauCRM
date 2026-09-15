-- The outbound board gains a step. "Researched" becomes "Built Bureau Pitch",
-- and a "Finalised Bureau Pitch" stage sits between it and the sequence: the
-- pitch being written and the pitch being signed off are different work, and
-- the gap between them is where deals were quietly stalling.
--
-- A rename rather than a new stage plus a retired one, so every activity row
-- pointing at the old stage keeps pointing at the same place and the funnel
-- history survives.
UPDATE stages
SET name = 'Built Bureau Pitch'
WHERE name = 'Researched'
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound');
--> statement-breakpoint
-- Open a gap immediately before the sequence stage. Positions are integers and
-- contiguous, so everything from the sequence onward shifts up by one.
UPDATE stages
SET position = position + 1
WHERE pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound')
  AND position >= (
    SELECT position FROM stages
    WHERE is_sequence = 1
      AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound')
  );
--> statement-breakpoint
-- Fill the gap. The id is written out rather than generated because a migration
-- has no access to newId(); it follows the same prefixed shape.
INSERT INTO stages (id, pipeline_id, name, position, stale_after_days, is_won, is_lost, is_sequence)
SELECT
  'stage_0009finalisedpitch',
  p.id,
  'Finalised Bureau Pitch',
  (SELECT position FROM stages WHERE is_sequence = 1 AND pipeline_id = p.id) - 1,
  2,
  0,
  0,
  0
FROM pipelines p
WHERE p.slug = 'outbound'
  AND NOT EXISTS (
    SELECT 1 FROM stages s
    WHERE s.pipeline_id = p.id AND s.name = 'Finalised Bureau Pitch'
  );
