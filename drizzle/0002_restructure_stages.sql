-- Collapse Outbound from ten stages to eight and Client Delivery from seven to
-- four.
--
-- Stages are renamed and merged rather than dropped and recreated, so the
-- activities rows that reference them keep pointing at a real stage and no
-- deal loses its history. Deals are moved out of a stage before it is deleted,
-- which the restrict foreign key on deals.stage_id would otherwise refuse.

-- Outbound: Contacted becomes In Sequence, and sending the first message is
-- day one of the cadence, so everything already there starts at Day 1.
UPDATE stages SET name = 'In Sequence', color = '#8b5cf6', stale_after_days = 10
WHERE name = 'Contacted'
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound');
--> statement-breakpoint

UPDATE deals SET sequence_step = 'day_1'
WHERE sequence_step IS NULL
  AND stage_id = (SELECT id FROM stages WHERE name = 'In Sequence'
                  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'));
--> statement-breakpoint

-- Follow-Up Sequence folds into the same column. How far through the cadence a
-- deal already is gets inferred from how long it has been sitting there.
UPDATE deals SET sequence_step = CASE
  WHEN (CAST(strftime('%s','now') AS INTEGER) * 1000 - stage_entered_at) / 86400000 <= 1 THEN 'day_1'
  WHEN (CAST(strftime('%s','now') AS INTEGER) * 1000 - stage_entered_at) / 86400000 = 2 THEN 'day_2'
  WHEN (CAST(strftime('%s','now') AS INTEGER) * 1000 - stage_entered_at) / 86400000 = 3 THEN 'day_3'
  WHEN (CAST(strftime('%s','now') AS INTEGER) * 1000 - stage_entered_at) / 86400000 = 4 THEN 'day_4'
  WHEN (CAST(strftime('%s','now') AS INTEGER) * 1000 - stage_entered_at) / 86400000 = 5 THEN 'day_5'
  WHEN (CAST(strftime('%s','now') AS INTEGER) * 1000 - stage_entered_at) / 86400000 <= 12 THEN 'week_2'
  WHEN (CAST(strftime('%s','now') AS INTEGER) * 1000 - stage_entered_at) / 86400000 <= 19 THEN 'week_3'
  ELSE 'week_4'
END
WHERE stage_id = (SELECT id FROM stages WHERE name = 'Follow-Up Sequence'
                  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'));
--> statement-breakpoint

UPDATE deals SET stage_id = (SELECT id FROM stages WHERE name = 'In Sequence'
                             AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'))
WHERE stage_id = (SELECT id FROM stages WHERE name = 'Follow-Up Sequence'
                  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'));
--> statement-breakpoint

UPDATE activities SET from_stage_id = (SELECT id FROM stages WHERE name = 'In Sequence'
                                       AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'))
WHERE from_stage_id = (SELECT id FROM stages WHERE name = 'Follow-Up Sequence'
                       AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'));
--> statement-breakpoint

UPDATE activities SET to_stage_id = (SELECT id FROM stages WHERE name = 'In Sequence'
                                     AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'))
WHERE to_stage_id = (SELECT id FROM stages WHERE name = 'Follow-Up Sequence'
                     AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'));
--> statement-breakpoint

DELETE FROM stages WHERE name = 'Follow-Up Sequence'
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound');
--> statement-breakpoint

-- Call Held and Proposal Sent both happen on or just after the call, so they
-- become one stage: the call was taken and we are working to close.
UPDATE stages SET name = 'Closing', color = '#ec4899', stale_after_days = 5
WHERE name = 'Call Held'
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound');
--> statement-breakpoint

UPDATE deals SET stage_id = (SELECT id FROM stages WHERE name = 'Closing'
                             AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'))
WHERE stage_id = (SELECT id FROM stages WHERE name = 'Proposal Sent'
                  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'));
--> statement-breakpoint

UPDATE activities SET from_stage_id = (SELECT id FROM stages WHERE name = 'Closing'
                                       AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'))
WHERE from_stage_id = (SELECT id FROM stages WHERE name = 'Proposal Sent'
                       AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'));
--> statement-breakpoint

UPDATE activities SET to_stage_id = (SELECT id FROM stages WHERE name = 'Closing'
                                     AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'))
WHERE to_stage_id = (SELECT id FROM stages WHERE name = 'Proposal Sent'
                     AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound'));
--> statement-breakpoint

DELETE FROM stages WHERE name = 'Proposal Sent'
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound');
--> statement-breakpoint

-- Client Delivery: Access + Assets Collected folds back into Onboarding.
UPDATE deals SET stage_id = (SELECT id FROM stages WHERE name = 'Onboarding'
                             AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery'))
WHERE stage_id = (SELECT id FROM stages WHERE name = 'Access + Assets Collected'
                  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery'));
--> statement-breakpoint

UPDATE activities SET from_stage_id = (SELECT id FROM stages WHERE name = 'Onboarding'
                                       AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery'))
WHERE from_stage_id = (SELECT id FROM stages WHERE name = 'Access + Assets Collected'
                       AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery'));
--> statement-breakpoint

UPDATE activities SET to_stage_id = (SELECT id FROM stages WHERE name = 'Onboarding'
                                     AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery'))
WHERE to_stage_id = (SELECT id FROM stages WHERE name = 'Access + Assets Collected'
                     AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery'));
--> statement-breakpoint

DELETE FROM stages WHERE name = 'Access + Assets Collected'
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery');
--> statement-breakpoint

UPDATE stages SET name = 'Building', stale_after_days = 14
WHERE name = 'Build In Progress'
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery');
--> statement-breakpoint

UPDATE stages SET name = 'Live', stale_after_days = 30
WHERE name = 'Launched'
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery');
--> statement-breakpoint

-- Optimizing and Renewal / Expansion describe the same state as Live.
UPDATE deals SET stage_id = (SELECT id FROM stages WHERE name = 'Live'
                             AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery'))
WHERE stage_id IN (SELECT id FROM stages WHERE name IN ('Optimizing', 'Renewal / Expansion')
                   AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery'));
--> statement-breakpoint

UPDATE activities SET from_stage_id = (SELECT id FROM stages WHERE name = 'Live'
                                       AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery'))
WHERE from_stage_id IN (SELECT id FROM stages WHERE name IN ('Optimizing', 'Renewal / Expansion')
                        AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery'));
--> statement-breakpoint

UPDATE activities SET to_stage_id = (SELECT id FROM stages WHERE name = 'Live'
                                     AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery'))
WHERE to_stage_id IN (SELECT id FROM stages WHERE name IN ('Optimizing', 'Renewal / Expansion')
                      AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery'));
--> statement-breakpoint

DELETE FROM stages WHERE name IN ('Optimizing', 'Renewal / Expansion')
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery');
--> statement-breakpoint

-- Merging two stages turns the transitions between them into moves from a
-- stage to itself, which say nothing. Everything else in the log is untouched.
DELETE FROM activities
WHERE type = 'stage_changed' AND from_stage_id IS NOT NULL AND from_stage_id = to_stage_id;
--> statement-breakpoint

-- Close the gaps the deletions left, in the order the stages should read.
UPDATE stages SET position = CASE name
  WHEN 'New Lead' THEN 0
  WHEN 'Researched' THEN 1
  WHEN 'In Sequence' THEN 2
  WHEN 'Replied' THEN 3
  WHEN 'Call Booked' THEN 4
  WHEN 'Closing' THEN 5
  WHEN 'Won' THEN 6
  WHEN 'Lost' THEN 7
  ELSE position END
WHERE pipeline_id = (SELECT id FROM pipelines WHERE slug = 'outbound');
--> statement-breakpoint

UPDATE stages SET position = CASE name
  WHEN 'Onboarding' THEN 0
  WHEN 'Building' THEN 1
  WHEN 'Live' THEN 2
  WHEN 'Churned' THEN 3
  ELSE position END
WHERE pipeline_id = (SELECT id FROM pipelines WHERE slug = 'delivery');
