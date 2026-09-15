import type {
  Owner,
  SequenceStep,
  TouchChannel,
  TouchOutcome,
} from "../lib/db/enums";
import { atZonedTime } from "../lib/dates";
import { DB_PATH } from "../lib/db/path";
import {
  DELIVERY_STAGES,
  FUNNEL,
  LEADS,
  OUTBOUND_STAGES,
  type LeadSpec,
  type StageSpec,
} from "./seed-data";

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/**
 * Days into the cadence at which each follow-up goes out: one a day for five
 * days, then one a week for four weeks.
 */
const CADENCE: { step: SequenceStep; dayOffset: number }[] = [
  { step: "day_1", dayOffset: 0 },
  { step: "day_2", dayOffset: 1 },
  { step: "day_3", dayOffset: 2 },
  { step: "day_4", dayOffset: 3 },
  { step: "day_5", dayOffset: 4 },
  { step: "week_2", dayOffset: 11 },
  { step: "week_3", dayOffset: 18 },
  { step: "week_4", dayOffset: 25 },
];

/** How long a whole cadence runs before it is out of road. */
const CADENCE_DAYS = 26;

/**
 * Fixed-seed PRNG so `npm run seed` produces the same database every time.
 * Debugging a board is miserable when the data moves underneath you.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(0x8ea17e);

function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function chance(probability: number): boolean {
  return random() < probability;
}

function daysBefore(reference: Date, days: number, jitterHours = 0): Date {
  const jitter = jitterHours === 0 ? 0 : randomInt(-jitterHours, jitterHours);
  return new Date(reference.getTime() - days * MS_PER_DAY + jitter * MS_PER_HOUR);
}

/**
 * Business hours make the history read like a person did the work. Business
 * hours in New York specifically, so the seed produces the same history
 * whatever timezone the machine running it is set to.
 */
function atWorkingHour(date: Date): Date {
  return atZonedTime(date, randomInt(8, 18), randomInt(0, 59), randomInt(0, 59));
}

function dollars(amount: number): number {
  return Math.round(amount * 100);
}

type Repo = typeof import("../lib/repo");

async function main(): Promise<void> {
  const repo = await import("../lib/repo");
  // Empties the tables rather than deleting the file, so a dev server that is
  // already running picks the new data up without a restart.
  await repo.resetDatabase();

  const now = new Date();

  const outbound = await repo.createPipeline({
    name: "Outbound",
    slug: "outbound",
  });
  const delivery = await repo.createPipeline({
    name: "Client Delivery",
    slug: "delivery",
  });

  async function buildStages(pipelineId: string, specs: StageSpec[]) {
    const created = [];
    for (const spec of specs) {
      const stage = await repo.createStage({
        pipelineId,
        name: spec.name,
        staleAfterDays: spec.staleAfterDays,
        isSequence: spec.isSequence ?? false,
      });
      if (spec.isWon || spec.isLost) {
        const updated = await repo.updateStage(stage.id, {
          isWon: spec.isWon ?? false,
          isLost: spec.isLost ?? false,
        });
        created.push(updated ?? stage);
      } else {
        created.push(stage);
      }
    }
    return created;
  }

  const outboundStages = await buildStages(outbound.id, OUTBOUND_STAGES);
  const deliveryStages = await buildStages(delivery.id, DELIVERY_STAGES);

  const lostStage = outboundStages[OUTBOUND_STAGES.length - 1];
  if (!lostStage) throw new Error("Outbound pipeline has no Lost stage");

  const stageAt = (index: number) => {
    const stage = outboundStages[index];
    if (!stage) throw new Error(`No outbound stage at index ${index}`);
    return stage;
  };

  const tagIds = new Map<string, string>();
  for (const name of new Set(LEADS.flatMap((lead) => lead.tags))) {
    const tag = await repo.getOrCreateTag(name);
    tagIds.set(name, tag.id);
  }

  for (const lead of LEADS) {
    const path = buildPath(lead);
    // A deal that died in the cadence needs room for the whole cadence to have
    // run before it was given up on.
    const extraEvents = lead.lost ? 1 : 0;
    const timeline = buildTimeline(
      path.length + extraEvents,
      lead.ageInStage,
      now,
      lead.lostInSequence ? CADENCE_DAYS : undefined,
    );

    const createdAt = timeline[0];
    if (!createdAt) throw new Error(`No timeline for ${lead.firstName}`);

    const contact = await repo.createContact({
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      instagramHandle: lead.handle,
      email: lead.email,
      website: lead.website,
      niche: lead.niche,
      offerType: lead.offerType,
      monthlyRevenueEstimate: dollars(lead.monthlyRevenue),
      source: lead.source,
      owner: lead.owner,
      notesSummary: lead.research,
      createdAt,
    });

    await repo.setContactTags(
      contact.id,
      lead.tags.map((name) => tagIds.get(name)).filter((id): id is string => !!id),
    );

    const firstStageIndex = path[0];
    if (firstStageIndex === undefined) throw new Error("Empty journey path");

    const deal = await repo.createDeal({
      contactId: contact.id,
      pipelineId: outbound.id,
      stageId: stageAt(firstStageIndex).id,
      title: `${lead.company} - ${lead.offerType}`,
      value: dollars(lead.value),
      valueType: lead.valueType,
      owner: lead.owner,
      createdAt,
    });

    // Walk the journey one stage at a time so every transition leaves an
    // activity row behind. Conversion rates read those rows, not the deal's
    // current position.
    for (let step = 0; step < path.length; step += 1) {
      const stageIndex = path[step];
      const at = timeline[step];
      if (stageIndex === undefined || !at) continue;

      if (step > 0) {
        await repo.moveDeal({
          dealId: deal.id,
          toStageId: stageAt(stageIndex).id,
          targetIndex: 0,
          at,
        });
      }

      // The cadence runs while the deal is actually sitting in the sequence,
      // between arriving and moving on. Running it afterwards would drag the
      // deal back out of whatever stage it had reached.
      if (stageIndex === FUNNEL.inSequence) {
        const leftAt =
          timeline[step + 1] ?? (lead.lost ? timeline[path.length] : now) ?? now;
        await runCadence(repo, {
          lead,
          dealId: deal.id,
          enteredAt: at,
          until: leftAt,
          now,
        });
      }
    }

    if (lead.lost) {
      const at = timeline[path.length];
      if (at) {
        await repo.updateDeal(deal.id, { lostReason: lead.lost.reason });
        if (lead.lostInSequence) {
          // Ran out of cadence rather than being rejected: the deal goes to
          // Lost but stays in the sub-board's No Answer column.
          await repo.setSequenceStep({
            dealId: deal.id,
            step: "no_answer",
            targetIndex: 0,
            at,
          });
        } else {
          await repo.moveDeal({
            dealId: deal.id,
            toStageId: lostStage.id,
            targetIndex: 0,
            at,
          });
        }
      }
    }

    await seedTouches(repo, { lead, dealId: deal.id, path, timeline, now });
    await seedNotes(repo, { lead, dealId: deal.id, path, timeline });
    await seedTasksAndNextAction(repo, { lead, dealId: deal.id, now });
  }

  // Winning an outbound deal already created the delivery deal. Push a couple
  // of them along so the second board is not a single full column.
  const deliveryCards = await repo.listDealCards({ pipelineId: delivery.id });
  const deliveryTargets = [0, 1, 2];
  for (const [index, card] of deliveryCards.entries()) {
    const target = deliveryTargets[index % deliveryTargets.length] ?? 0;
    // Start far enough back that every planned step lands before today, so the
    // shape of this board does not depend on what time the seed runs.
    let at = daysBefore(now, 9 * target + randomInt(3, 9));
    for (let step = 1; step <= target; step += 1) {
      const stage = deliveryStages[step];
      if (!stage) break;
      at = new Date(at.getTime() + randomInt(2, 9) * MS_PER_DAY);
      await repo.moveDeal({
        dealId: card.id,
        toStageId: stage.id,
        targetIndex: 0,
        at,
      });
    }
    await repo.createNote({
      dealId: card.id,
      body: `Kickoff call done. Access to the ad account and email platform requested, still waiting on the ESP login.\n\nFirst deliverable: rebuild the ${card.contact.offerType ?? "core"} follow-up sequence.`,
      author: card.owner,
      createdAt: daysBefore(now, randomInt(3, 12)),
    });
  }

  const allDeals = [
    ...(await repo.listDealCards({ pipelineId: outbound.id })),
    ...(await repo.listDealCards({ pipelineId: delivery.id })),
  ];
  let notesWritten = 0;
  let touchesWritten = 0;
  let activitiesWritten = 0;
  for (const card of allDeals) {
    notesWritten += (await repo.listNotes(card.id)).length;
    touchesWritten += (await repo.listTouches(card.id)).length;
    activitiesWritten += (await repo.listActivities(card.id)).length;
  }
  const { total: contactTotal } = await repo.listContacts({ limit: 1 });

  console.log(
    [
      "",
      `Database: ${DB_PATH}`,
      `  pipelines   2 (outbound, delivery)`,
      `  stages      ${outboundStages.length + deliveryStages.length}`,
      `  contacts    ${contactTotal}`,
      `  deals       ${allDeals.length}`,
      `  notes       ${notesWritten}`,
      `  touches     ${touchesWritten}`,
      `  activities  ${activitiesWritten}`,
      "",
    ].join("\n"),
  );
}

/** Stage indexes this lead actually passed through, honouring any it skipped. */
function buildPath(lead: LeadSpec): number[] {
  const skipped = new Set(lead.skipped ?? []);
  const path: number[] = [];
  for (let index = 0; index <= lead.reached; index += 1) {
    if (!skipped.has(index)) path.push(index);
  }
  return path;
}

/**
 * Timestamps for each entry in the journey, anchored so the final one lands
 * exactly `ageInStage` days ago and earlier ones fan out backwards.
 */
function buildTimeline(
  entries: number,
  ageInStage: number,
  now: Date,
  finalGapDays?: number,
): Date[] {
  const times: Date[] = new Array<Date>(entries);
  let cursor = atWorkingHour(daysBefore(now, ageInStage, 6));
  times[entries - 1] = cursor;

  for (let index = entries - 2; index >= 0; index -= 1) {
    const gap =
      index === entries - 2 && finalGapDays !== undefined
        ? finalGapDays
        : randomInt(1, 8);
    cursor = atWorkingHour(daysBefore(cursor, gap, 4));
    times[index] = cursor;
  }
  return times;
}

/** Which step a deal that entered the cadence `days` ago should be sitting on. */
function stepForAge(days: number): SequenceStep {
  let current: SequenceStep = "day_1";
  for (const entry of CADENCE) {
    if (days >= entry.dayOffset) current = entry.step;
  }
  return current;
}

function channelFor(lead: LeadSpec): TouchChannel {
  if (lead.source === "ig_dm") return "ig_dm";
  if (lead.source === "cold_email" || lead.source === "list_import") return "email";
  return chance(0.5) ? "email" : "ig_dm";
}

/**
 * Walks a deal along the cadence from the day it entered, logging the follow-up
 * that each step represents. A deal that left the sequence for a later stage
 * only runs as far as the day it left.
 */
async function runCadence(
  repo: Repo,
  input: {
    lead: LeadSpec;
    dealId: string;
    enteredAt: Date;
    /** When the deal left the sequence, or now if it is still there. */
    until: Date;
    now: Date;
  },
): Promise<void> {
  const { lead, dealId, enteredAt, until, now } = input;

  const stillHere = lead.reached === FUNNEL.inSequence;
  const limit = Math.floor(
    (Math.min(until.getTime(), now.getTime()) - enteredAt.getTime()) /
      MS_PER_DAY,
  );

  const target = stepForAge(limit);
  const channel = channelFor(lead);

  for (const entry of CADENCE) {
    if (entry.dayOffset > limit) break;
    const at = atWorkingHour(
      new Date(enteredAt.getTime() + entry.dayOffset * MS_PER_DAY),
    );
    if (at.getTime() > now.getTime()) break;

    if (entry.step !== "day_1") {
      await repo.setSequenceStep({
        dealId,
        step: entry.step,
        targetIndex: 0,
        at,
      });
    }

    const isLast = entry.step === target;
    await repo.createTouch({
      dealId,
      channel,
      direction: "outbound",
      outcome:
        isLast && stillHere && !lead.lost
          ? "sent"
          : chance(0.35)
            ? "opened"
            : "sent",
      sequenceStep: CADENCE.indexOf(entry) + 1,
      bodySnippet:
        entry.step === "day_1"
          ? channel === "ig_dm"
            ? `Hey ${lead.firstName} - been through a few of your posts on ${lead.niche.toLowerCase()}. Quick one: how are you handling follow-up with people who don't buy on the first ask?`
            : `${lead.firstName} - looked at how ${lead.company} sells the ${lead.offerType.toLowerCase()}. One thing stood out and I don't think it's obvious from the inside. Worth two minutes?`
          : entry.step === "week_4"
            ? `Last one from me - if ${lead.offerType.toLowerCase()} follow-up isn't a priority this quarter I'll leave it there. Happy to send the teardown either way.`
            : `Following up on the note about ${lead.niche.toLowerCase()}. Recorded a two minute Loom on what I'd change first if it's useful.`,
      occurredAt: at,
    });

    if (entry.step === target) break;
  }
}

/** Touches outside the cadence: the reply, the booking, the call, the proposal. */
async function seedTouches(
  repo: Repo,
  input: {
    lead: LeadSpec;
    dealId: string;
    path: number[];
    timeline: Date[];
    now: Date;
  },
): Promise<void> {
  const { lead, dealId, path, timeline, now } = input;
  const channel = channelFor(lead);
  const at = (stage: number): Date | undefined => {
    const index = path.indexOf(stage);
    return index === -1 ? undefined : timeline[index];
  };

  const log = async (args: {
    at: Date;
    channel: TouchChannel;
    direction: "outbound" | "inbound";
    outcome: TouchOutcome;
    snippet: string;
  }) => {
    if (args.at.getTime() > now.getTime()) return;
    await repo.createTouch({
      dealId,
      channel: args.channel,
      direction: args.direction,
      outcome: args.outcome,
      bodySnippet: args.snippet,
      occurredAt: args.at,
    });
  };

  const repliedAt = at(FUNNEL.replied);
  if (repliedAt) {
    await log({
      at: repliedAt,
      channel,
      direction: "inbound",
      outcome: lead.lost ? "replied" : "positive_reply",
      snippet: lead.lost
        ? "Interesting, thanks. Let me think on it and come back to you."
        : "Yeah this is the exact thing we keep putting off. What does working together actually look like?",
    });
  }

  const bookedAt = at(FUNNEL.callBooked);
  if (bookedAt) {
    await log({
      at: bookedAt,
      channel,
      direction: "outbound",
      outcome: "booked",
      snippet: "Sent the booking link, they took the Thursday slot.",
    });
  }

  const closingAt = at(FUNNEL.closing);
  if (closingAt) {
    await log({
      at: closingAt,
      channel: "call",
      direction: "outbound",
      outcome: lead.lost ? "objection" : "positive_reply",
      snippet: lead.lost
        ? "Call went well on diagnosis. Objection was timing and wanting to try it in-house first."
        : `Walked through the funnel gap. ${lead.angle}`,
    });
    await log({
      at: new Date(closingAt.getTime() + randomInt(1, 2) * MS_PER_DAY),
      channel: chance(0.5) ? "loom" : "email",
      direction: "outbound",
      outcome: "sent",
      snippet: `Proposal sent: ${
        lead.valueType === "rev_share_estimate"
          ? "performance deal on new cash collected"
          : `$${lead.value.toLocaleString()} ${lead.valueType === "one_time" ? "one-time build" : "per month"}`
      }, 90 day term.`,
    });
  }
}

async function seedNotes(
  repo: Repo,
  input: {
    lead: LeadSpec;
    dealId: string;
    path: number[];
    timeline: Date[];
  },
): Promise<void> {
  const { lead, dealId, path, timeline } = input;
  const author: Owner = lead.owner;
  const at = (stage: number): Date | undefined => {
    const index = path.indexOf(stage);
    return index === -1 ? undefined : timeline[index];
  };

  const researchAt = at(FUNNEL.builtPitch) ?? at(FUNNEL.newLead) ?? timeline[0];
  if (researchAt && lead.reached >= FUNNEL.builtPitch) {
    await repo.createNote({
      dealId,
      author,
      // Pinned so the research stays at the top once the thread below it gets
      // long.
      pinned: true,
      body: `**Research**\n\n${lead.research}\n\n**Angle**\n\n${lead.angle}`,
      createdAt: researchAt,
    });
  }

  const repliedAt = at(FUNNEL.replied);
  if (repliedAt) {
    await repo.createNote({
      dealId,
      author,
      body: `Replied on the ${channelFor(lead) === "ig_dm" ? "DM" : "email"}. ${lead.angle}`,
      createdAt: new Date(repliedAt.getTime() + 2 * MS_PER_HOUR),
    });
  }

  const closingAt = at(FUNNEL.closing);
  if (closingAt) {
    await repo.createNote({
      dealId,
      author,
      body: `**Call notes**\n\n- Currently at roughly $${lead.monthlyRevenue.toLocaleString()}/mo\n- Offer: ${lead.offerType}\n- ${lead.angle}\n\nNext: scope the first 30 days and price it.`,
      createdAt: new Date(closingAt.getTime() + MS_PER_HOUR),
    });
  }

  if (lead.lost) {
    const lostAt = timeline[path.length];
    if (lostAt) {
      await repo.createNote({
        dealId,
        author,
        body: `**Lost.** ${lead.lost.reason}`,
        createdAt: lostAt,
      });
    }
  }
}

async function seedTasksAndNextAction(
  repo: Repo,
  input: { lead: LeadSpec; dealId: string; now: Date },
): Promise<void> {
  const { lead, dealId, now } = input;
  if (lead.lost || lead.reached === FUNNEL.won) return;

  const actions: Record<number, string> = {
    [FUNNEL.newLead]: "Research the offer and pricing",
    [FUNNEL.builtPitch]: "Finalise the pitch",
    [FUNNEL.finalisedPitch]: "Send the build",
    [FUNNEL.inSequence]: "Send the next follow-up",
    [FUNNEL.replied]: "Send booking link",
    [FUNNEL.callBooked]: "Run the call",
    [FUNNEL.closing]: "Chase the proposal",
  };

  const action = actions[lead.reached];
  if (!action) return;

  // A third of the board is deliberately overdue so the dashboard's
  // needs-attention list and the card's red date have something real to show.
  const overdue = chance(0.35);
  const offset = overdue ? randomInt(1, 9) : -randomInt(1, 8);
  const nextActionAt = atWorkingHour(daysBefore(now, offset));

  await repo.updateDeal(dealId, { nextAction: action, nextActionAt });

  if (lead.reached >= FUNNEL.callBooked) {
    await repo.createTask({
      dealId,
      title:
        lead.reached === FUNNEL.closing
          ? "Follow up on proposal"
          : "Prep the call doc",
      owner: lead.owner,
      dueAt: nextActionAt,
    });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
