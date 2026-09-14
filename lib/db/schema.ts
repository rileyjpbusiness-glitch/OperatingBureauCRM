import { relations } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import {
  ACTIVITY_TYPES,
  DEAL_STATUSES,
  OWNERS,
  SEQUENCE_STEPS,
  SOURCES,
  TOUCH_CHANNELS,
  TOUCH_DIRECTIONS,
  TOUCH_ORIGINS,
  TOUCH_OUTCOMES,
  VALUE_TYPES,
} from "./enums";

/**
 * Conventions
 *
 * - Ids are text (see lib/db/ids.ts). Text ids port to Postgres unchanged and
 *   let the seed build a whole object graph without round-tripping for
 *   autoincrement values.
 * - Timestamps are epoch milliseconds stored as INTEGER. `timestamp_ms` gives
 *   us real Date objects in TypeScript and maps to `timestamptz` later.
 * - Money is integer cents. Never a float.
 * - Multi-workspace later is a `workspace_id` column on pipelines, contacts and
 *   tags plus widening two unique indexes (noted at each one). Nothing here
 *   assumes a single tenant beyond those indexes.
 */

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull();
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" }).notNull();

export const pipelines = sqliteTable(
  "pipelines",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // Widens to (workspace_id, slug) when workspaces arrive.
    uniqueIndex("pipelines_slug_unique").on(t.slug),
    index("pipelines_position_idx").on(t.position),
  ],
);

export const stages = sqliteTable(
  "stages",
  {
    id: text("id").primaryKey(),
    pipelineId: text("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    color: text("color").notNull(),
    /** Null means deals in this stage never go stale. */
    staleAfterDays: integer("stale_after_days").default(7),
    isWon: integer("is_won", { mode: "boolean" }).notNull().default(false),
    isLost: integer("is_lost", { mode: "boolean" }).notNull().default(false),
    /**
     * Marks the stage that runs the follow-up cadence. A flag rather than a
     * name match, so renaming the column in the UI cannot quietly detach the
     * sub-board from it.
     */
    isSequence: integer("is_sequence", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [index("stages_pipeline_position_idx").on(t.pipelineId, t.position)],
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    company: text("company"),
    instagramHandle: text("instagram_handle"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    niche: text("niche"),
    offerType: text("offer_type"),
    /** Their revenue, not ours. Integer cents per month. */
    monthlyRevenueEstimate: integer("monthly_revenue_estimate"),
    source: text("source", { enum: SOURCES }).notNull(),
    owner: text("owner", { enum: OWNERS }).notNull(),
    notesSummary: text("notes_summary"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("contacts_owner_idx").on(t.owner),
    index("contacts_source_idx").on(t.source),
    index("contacts_email_idx").on(t.email),
    index("contacts_instagram_idx").on(t.instagramHandle),
    index("contacts_last_name_idx").on(t.lastName),
  ],
);

export const deals = sqliteTable(
  "deals",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    pipelineId: text("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    stageId: text("stage_id")
      .notNull()
      .references(() => stages.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    /** Integer cents. Interpreted according to valueType. */
    value: integer("value").notNull().default(0),
    valueType: text("value_type", { enum: VALUE_TYPES })
      .notNull()
      .default("monthly_recurring"),
    status: text("status", { enum: DEAL_STATUSES }).notNull().default("open"),
    lostReason: text("lost_reason"),
    /**
     * Defaults from the contact at creation but is reassignable per deal, so
     * delivery can sit with a different operator than outbound did.
     */
    owner: text("owner", { enum: OWNERS }).notNull(),
    nextAction: text("next_action"),
    nextActionAt: integer("next_action_at", { mode: "timestamp_ms" }),
    /**
     * Position in the follow-up cadence. Non-null only while the deal is in the
     * In Sequence stage, with the single exception of no_answer, which the deal
     * keeps after being marked lost so the sub-board can still show it.
     */
    sequenceStep: text("sequence_step", { enum: SEQUENCE_STEPS }),
    /** Sort key within a stage. Float so a card can be dropped between two. */
    position: real("position").notNull(),
    /**
     * Set on create and reset on every stage change. Time-in-stage derives from
     * this and never from updatedAt, which moves for unrelated edits.
     */
    stageEnteredAt: integer("stage_entered_at", {
      mode: "timestamp_ms",
    }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("deals_stage_position_idx").on(t.stageId, t.position),
    index("deals_pipeline_idx").on(t.pipelineId),
    index("deals_contact_idx").on(t.contactId),
    index("deals_status_idx").on(t.status),
    index("deals_next_action_idx").on(t.nextActionAt),
    index("deals_owner_idx").on(t.owner),
    index("deals_sequence_step_idx").on(t.sequenceStep),
  ],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    author: text("author", { enum: OWNERS }).notNull(),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("notes_deal_idx").on(t.dealId, t.pinned, t.createdAt)],
);

export const touches = sqliteTable(
  "touches",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: TOUCH_CHANNELS }).notNull(),
    direction: text("direction", { enum: TOUCH_DIRECTIONS }).notNull(),
    /** Which step of a sequence this was, when it came from one. */
    sequenceStep: integer("sequence_step"),
    outcome: text("outcome", { enum: TOUCH_OUTCOMES }).notNull(),
    bodySnippet: text("body_snippet"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    /**
     * Everything v1 writes is "manual". These two columns are what an Instantly
     * or Smartlead sync would write instead, with externalId making replays
     * idempotent. Out of scope for v1, but the table does not need changing.
     */
    origin: text("origin", { enum: TOUCH_ORIGINS }).notNull().default("manual"),
    externalId: text("external_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("touches_deal_occurred_idx").on(t.dealId, t.occurredAt),
    index("touches_channel_idx").on(t.channel, t.occurredAt),
    uniqueIndex("touches_external_id_unique").on(t.externalId),
  ],
);

export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    type: text("type", { enum: ACTIVITY_TYPES }).notNull(),
    fromStageId: text("from_stage_id").references(() => stages.id, {
      onDelete: "set null",
    }),
    toStageId: text("to_stage_id").references(() => stages.id, {
      onDelete: "set null",
    }),
    /** JSON blob. Read through lib/repo, which parses and types it. */
    meta: text("meta"),
    createdAt: createdAt(),
  },
  (t) => [
    index("activities_deal_created_idx").on(t.dealId, t.createdAt),
    // Conversion rates scan this: "which deals ever reached stage X".
    index("activities_to_stage_idx").on(t.toStageId, t.dealId),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    createdAt: createdAt(),
  },
  // Widens to (workspace_id, name) when workspaces arrive.
  (t) => [uniqueIndex("tags_name_unique").on(t.name)],
);

export const contactTags = sqliteTable(
  "contact_tags",
  {
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.tagId] }),
    index("contact_tags_tag_idx").on(t.tagId),
  ],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    owner: text("owner", { enum: OWNERS }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("tasks_deal_due_idx").on(t.dealId, t.dueAt)],
);

export const pipelinesRelations = relations(pipelines, ({ many }) => ({
  stages: many(stages),
  deals: many(deals),
}));

export const stagesRelations = relations(stages, ({ one, many }) => ({
  pipeline: one(pipelines, {
    fields: [stages.pipelineId],
    references: [pipelines.id],
  }),
  deals: many(deals),
}));

export const contactsRelations = relations(contacts, ({ many }) => ({
  deals: many(deals),
  contactTags: many(contactTags),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
  contact: one(contacts, {
    fields: [deals.contactId],
    references: [contacts.id],
  }),
  pipeline: one(pipelines, {
    fields: [deals.pipelineId],
    references: [pipelines.id],
  }),
  stage: one(stages, { fields: [deals.stageId], references: [stages.id] }),
  notes: many(notes),
  touches: many(touches),
  activities: many(activities),
  tasks: many(tasks),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  deal: one(deals, { fields: [notes.dealId], references: [deals.id] }),
}));

export const touchesRelations = relations(touches, ({ one }) => ({
  deal: one(deals, { fields: [touches.dealId], references: [deals.id] }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  deal: one(deals, { fields: [activities.dealId], references: [deals.id] }),
  fromStage: one(stages, {
    fields: [activities.fromStageId],
    references: [stages.id],
    relationName: "fromStage",
  }),
  toStage: one(stages, {
    fields: [activities.toStageId],
    references: [stages.id],
    relationName: "toStage",
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  contactTags: many(contactTags),
}));

export const contactTagsRelations = relations(contactTags, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactTags.contactId],
    references: [contacts.id],
  }),
  tag: one(tags, { fields: [contactTags.tagId], references: [tags.id] }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  deal: one(deals, { fields: [tasks.dealId], references: [deals.id] }),
}));
