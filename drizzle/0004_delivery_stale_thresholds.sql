-- Tighten the delivery clocks. A signed client going quiet during onboarding is
-- the failure mode this board exists to catch, and a five day threshold was too
-- slack to catch it.
UPDATE stages SET stale_after_days = 3
WHERE name = 'Onboarding'
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery');
--> statement-breakpoint

UPDATE stages SET stale_after_days = 7
WHERE name = 'Building'
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery');
--> statement-breakpoint

UPDATE stages SET stale_after_days = 30
WHERE name = 'Live'
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery');
