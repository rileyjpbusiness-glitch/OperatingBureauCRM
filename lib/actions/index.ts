"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  LINK_PLATFORMS,
  OWNERS,
  SEQUENCE_STEPS,
  SOURCES,
  TOUCH_CHANNELS,
  TOUCH_OUTCOMES,
  VALUE_TYPES,
} from "@/lib/db/enums";
import * as repo from "@/lib/repo";

/**
 * Every mutation the UI can perform. Each one validates its input with zod
 * before touching the repository, and nothing here talks to Drizzle directly.
 */

function refresh(): void {
  // The board, the sub-board and the dashboard all read the same rows, and
  // every one of them is dynamic, so there is nothing finer worth targeting.
  revalidatePath("/", "layout");
}

const dealId = z.string().min(1);

const moveDealSchema = z.object({
  dealId,
  toStageId: z.string().min(1),
  targetIndex: z.number().int().min(0),
});

export async function moveDealAction(input: unknown): Promise<void> {
  const parsed = moveDealSchema.parse(input);
  await repo.moveDeal(parsed);
  refresh();
}

const sequenceStepSchema = z.object({
  dealId,
  step: z.enum(SEQUENCE_STEPS),
  targetIndex: z.number().int().min(0),
});

export async function setSequenceStepAction(input: unknown): Promise<void> {
  const parsed = sequenceStepSchema.parse(input);
  await repo.setSequenceStep(parsed);
  refresh();
}

const updateDealSchema = z.object({
  dealId,
  title: z.string().min(1).optional(),
  /** Whole dollars from the form; cents in the database. */
  valueDollars: z.number().min(0).optional(),
  valueType: z.enum(VALUE_TYPES).optional(),
  owner: z.enum(OWNERS).optional(),
  nextAction: z.string().nullable().optional(),
  nextActionAt: z.coerce.date().nullable().optional(),
  lostReason: z.string().nullable().optional(),
  priority: z.boolean().optional(),
});

export async function updateDealAction(input: unknown): Promise<void> {
  const { dealId: id, valueDollars, ...rest } = updateDealSchema.parse(input);
  await repo.updateDeal(id, {
    ...rest,
    ...(valueDollars === undefined
      ? {}
      : { value: Math.round(valueDollars * 100) }),
  });
  refresh();
}

const addLinkSchema = z.object({
  contactId: z.string().min(1),
  platform: z.enum(LINK_PLATFORMS).optional(),
  url: z.string().optional(),
});

export async function addLinkAction(input: unknown): Promise<void> {
  const parsed = addLinkSchema.parse(input);
  await repo.addLink(parsed);
  refresh();
}

const updateLinkSchema = z.object({
  linkId: z.string().min(1),
  platform: z.enum(LINK_PLATFORMS).optional(),
  url: z.string().optional(),
  label: z.string().nullable().optional(),
});

export async function updateLinkAction(input: unknown): Promise<void> {
  const { linkId, ...patch } = updateLinkSchema.parse(input);
  await repo.updateLink(linkId, patch);
  refresh();
}

export async function deleteLinkAction(input: unknown): Promise<void> {
  const { linkId } = z.object({ linkId: z.string().min(1) }).parse(input);
  await repo.deleteLink(linkId);
  refresh();
}

const suggestSchema = z.object({ term: z.string() });

/**
 * Typeahead for the search box. A read rather than a mutation, but it goes
 * through an action for the same reason every other query does: the repository
 * is server-only and the browser never gets a database handle.
 */
export async function suggestLeadsAction(
  input: unknown,
): Promise<repo.LeadSuggestion[]> {
  const { term } = suggestSchema.parse(input);
  return repo.suggestLeads(term);
}

const binSchema = z.object({ dealId });

/**
 * Off the board but not destroyed. The board rolls itself back if this throws,
 * so a failed drop leaves the card where it was rather than vanishing.
 */
export async function binDealAction(input: unknown): Promise<void> {
  const parsed = binSchema.parse(input);
  await repo.binDeal(parsed.dealId);
  refresh();
}

export async function restoreDealAction(input: unknown): Promise<void> {
  const parsed = binSchema.parse(input);
  await repo.restoreDeal(parsed.dealId);
  refresh();
}

/** Destroys everything in the bin. There is no undo past this point. */
export async function emptyBinAction(): Promise<{
  deals: number;
  contacts: number;
}> {
  const result = await repo.emptyBin();
  refresh();
  return result;
}

const updateContactSchema = z.object({
  contactId: z.string().min(1),
  firstName: z.string().min(1).optional(),
  lastName: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  instagramHandle: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  niche: z.string().nullable().optional(),
  offerType: z.string().nullable().optional(),
  source: z.enum(SOURCES).optional(),
  owner: z.enum(OWNERS).optional(),
});

export async function updateContactAction(input: unknown): Promise<void> {
  const { contactId, ...patch } = updateContactSchema.parse(input);
  await repo.updateContact(contactId, patch);
  refresh();
}

const createNoteSchema = z.object({
  dealId,
  body: z.string().trim().min(1),
  author: z.enum(OWNERS),
});

export async function createNoteAction(input: unknown): Promise<void> {
  const parsed = createNoteSchema.parse(input);
  await repo.createNote(parsed);
  refresh();
}

const updateNoteSchema = z.object({
  noteId: z.string().min(1),
  body: z.string().optional(),
  pinned: z.boolean().optional(),
});

export async function updateNoteAction(input: unknown): Promise<void> {
  const { noteId, ...patch } = updateNoteSchema.parse(input);
  await repo.updateNote(noteId, patch);
  refresh();
}

export async function deleteNoteAction(input: unknown): Promise<void> {
  const { noteId } = z.object({ noteId: z.string().min(1) }).parse(input);
  await repo.deleteNote(noteId);
  refresh();
}

/**
 * Direction is inferred from the outcome rather than asked for: a reply of any
 * kind came in, everything else went out.
 */
const INBOUND_OUTCOMES = new Set(["replied", "positive_reply", "objection"]);

const createTouchSchema = z.object({
  dealId,
  channel: z.enum(TOUCH_CHANNELS),
  outcome: z.enum(TOUCH_OUTCOMES),
  bodySnippet: z.string().trim().nullable().optional(),
});

export async function createTouchAction(input: unknown): Promise<void> {
  const parsed = createTouchSchema.parse(input);
  await repo.createTouch({
    ...parsed,
    direction: INBOUND_OUTCOMES.has(parsed.outcome) ? "inbound" : "outbound",
  });
  refresh();
}

const createLeadSchema = z.object({
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  firstName: z.string().trim().min(1, "A name is required"),
  lastName: z.string().trim().optional(),
  company: z.string().trim().optional(),
  handle: z.string().trim().optional(),
  email: z.string().trim().optional(),
  valueDollars: z.number().min(0).optional(),
  valueType: z.enum(VALUE_TYPES).default("monthly_recurring"),
  source: z.enum(SOURCES),
  owner: z.enum(OWNERS),
});

export async function createLeadAction(input: unknown): Promise<string> {
  const parsed = createLeadSchema.parse(input);
  const { deal } = await repo.createContactWithDeal({
    contact: {
      firstName: parsed.firstName,
      lastName: parsed.lastName ?? null,
      company: parsed.company ?? null,
      instagramHandle: parsed.handle ?? null,
      email: parsed.email ?? null,
      source: parsed.source,
      owner: parsed.owner,
    },
    pipelineId: parsed.pipelineId,
    stageId: parsed.stageId,
    value: Math.round((parsed.valueDollars ?? 0) * 100),
    valueType: parsed.valueType,
    owner: parsed.owner,
  });
  refresh();
  return deal.id;
}

const createTaskSchema = z.object({
  dealId,
  title: z.string().trim().min(1),
  owner: z.enum(OWNERS),
  dueAt: z.coerce.date().nullable().optional(),
});

export async function createTaskAction(input: unknown): Promise<void> {
  const parsed = createTaskSchema.parse(input);
  await repo.createTask(parsed);
  refresh();
}

const setTaskCompletedSchema = z.object({
  taskId: z.string().min(1),
  completed: z.boolean(),
});

export async function setTaskCompletedAction(input: unknown): Promise<void> {
  const { taskId, completed } = setTaskCompletedSchema.parse(input);
  await repo.setTaskCompleted(taskId, completed);
  refresh();
}
