import fs from "node:fs";

import type {
  Owner,
  TouchChannel,
  TouchOutcome,
} from "../lib/db/enums";
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

/** Business hours make the activity feed read like a person did the work. */
function atWorkingHour(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(randomInt(8, 18), randomInt(0, 59), randomInt(0, 59), 0);
  return copy;
}

function dollars(amount: number): number {
  return Math.round(amount * 100);
}

function resetDatabaseFile(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${DB_PATH}${suffix}`;
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
}

async function main(): Promise<void> {
  // The file has to go before the client module opens it, so the repo layer is
  // imported dynamically rather than at the top of the file.
  resetDatabaseFile();
  const repo = await import("../lib/repo");

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
        color: spec.color,
        staleAfterDays: spec.staleAfterDays,
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
    const timeline = buildTimeline(path.length + (lead.lost ? 1 : 0), lead.ageInStage, now);

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
    for (let step = 1; step < path.length; step += 1) {
      const stageIndex = path[step];
      const at = timeline[step];
      if (stageIndex === undefined || !at) continue;
      await repo.moveDeal({
        dealId: deal.id,
        toStageId: stageAt(stageIndex).id,
        targetIndex: 0,
        at,
      });
    }

    if (lead.lost) {
      const at = timeline[path.length];
      if (at) {
        await repo.updateDeal(deal.id, { lostReason: lead.lost.reason });
        await repo.moveDeal({
          dealId: deal.id,
          toStageId: lostStage.id,
          targetIndex: 0,
          at,
        });
      }
    }

    await seedTouches(repo, { lead, dealId: deal.id, path, timeline, now });
    await seedNotes(repo, { lead, dealId: deal.id, path, timeline, now });
    await seedTasksAndNextAction(repo, { lead, dealId: deal.id, now });
  }

  // Winning an outbound deal already created the delivery deal. Push a few of
  // them along so the second board is not a single full column.
  const deliveryCards = await repo.listDealCards({ pipelineId: delivery.id });
  // One stays in Onboarding, the others are further along.
  const deliveryTargets = [0, 2, 3];
  for (const [index, card] of deliveryCards.entries()) {
    const target = deliveryTargets[index % deliveryTargets.length] ?? 1;
    let at = daysBefore(now, randomInt(10, 30));
    for (let step = 1; step <= target; step += 1) {
      const stage = deliveryStages[step];
      if (!stage) break;
      at = new Date(at.getTime() + randomInt(2, 9) * MS_PER_DAY);
      if (at.getTime() > now.getTime() - MS_PER_DAY) break;
      await repo.moveDeal({
        dealId: card.id,
        toStageId: stage.id,
        targetIndex: 0,
        at,
      });
    }
    await repo.createNote({
      dealId: card.id,
      body: `Kickoff call done. Access to ad account and email platform requested, waiting on the ESP login.\n\nFirst deliverable: rebuild the ${card.contact.offerType ?? "core"} follow-up sequence.`,
      author: card.owner,
      createdAt: daysBefore(now, randomInt(3, 12)),
    });
  }

  // Count what actually landed rather than what this script thinks it wrote:
  // the won handoff creates deals and notes of its own.
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
function buildTimeline(entries: number, ageInStage: number, now: Date): Date[] {
  const times: Date[] = new Array<Date>(entries);
  let cursor = atWorkingHour(daysBefore(now, ageInStage, 6));
  times[entries - 1] = cursor;

  for (let index = entries - 2; index >= 0; index -= 1) {
    cursor = atWorkingHour(daysBefore(cursor, randomInt(1, 8), 4));
    times[index] = cursor;
  }
  return times;
}

type Repo = typeof import("../lib/repo");

function channelFor(lead: LeadSpec): TouchChannel {
  if (lead.source === "ig_dm") return "ig_dm";
  if (lead.source === "cold_email" || lead.source === "list_import") return "email";
  return chance(0.5) ? "email" : "ig_dm";
}

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
  const reachedIndex = (stage: number) => path.indexOf(stage);

  const log = async (args: {
    at: Date;
    channel: TouchChannel;
    direction: "outbound" | "inbound";
    outcome: TouchOutcome;
    step: number | null;
    snippet: string;
  }) => {
    if (args.at.getTime() > now.getTime()) return;
    await repo.createTouch({
      dealId,
      channel: args.channel,
      direction: args.direction,
      outcome: args.outcome,
      sequenceStep: args.step,
      bodySnippet: args.snippet,
      occurredAt: args.at,
    });
  };

  const contactedAt = timeline[reachedIndex(FUNNEL.contacted)];
  if (contactedAt) {
    await log({
      at: contactedAt,
      channel,
      direction: "outbound",
      outcome: "sent",
      step: 1,
      snippet:
        channel === "ig_dm"
          ? `Hey ${lead.firstName} - been through a few of your posts on ${lead.niche.toLowerCase()}. Quick one: how are you handling follow-up with people who don't buy on the first ask?`
          : `${lead.firstName} - looked at how ${lead.company} sells the ${lead.offerType.toLowerCase()}. One thing stood out and I don't think it's obvious from the inside. Worth two minutes?`,
    });
  }

  const followUpIndex = reachedIndex(FUNNEL.followUp);
  const followUpAt = timeline[followUpIndex];
  if (followUpAt) {
    // The sequence runs until the deal moved on, or until now if it is parked.
    const nextEventAt = timeline[followUpIndex + 1] ?? now;
    const span = Math.max(
      1,
      Math.floor((nextEventAt.getTime() - followUpAt.getTime()) / MS_PER_DAY),
    );
    const steps = Math.min(5, Math.max(2, Math.floor(span / 3)));

    for (let step = 0; step < steps; step += 1) {
      const at = new Date(
        followUpAt.getTime() + Math.round((span * (step + 1)) / (steps + 1)) * MS_PER_DAY,
      );
      const outcome: TouchOutcome =
        step === steps - 1 && lead.reached <= FUNNEL.followUp
          ? "no_response"
          : chance(0.4)
            ? "opened"
            : "sent";
      await log({
        at: atWorkingHour(at),
        channel,
        direction: "outbound",
        outcome,
        step: step + 2,
        snippet:
          step === steps - 1
            ? `Last one from me - if ${lead.offerType.toLowerCase()} follow-up isn't a priority this quarter I'll leave it there. Happy to send the teardown either way.`
            : `Following up on the note about ${lead.niche.toLowerCase()}. Recorded a two minute Loom on what I'd change first if it's useful.`,
      });
    }
  }

  const repliedAt = timeline[reachedIndex(FUNNEL.replied)];
  if (repliedAt) {
    await log({
      at: repliedAt,
      channel,
      direction: "inbound",
      outcome: lead.lost ? "replied" : "positive_reply",
      step: null,
      snippet: lead.lost
        ? "Interesting, thanks. Let me think on it and come back to you."
        : "Yeah this is the exact thing we keep putting off. What does working together actually look like?",
    });
  }

  const bookedAt = timeline[reachedIndex(FUNNEL.callBooked)];
  if (bookedAt) {
    await log({
      at: bookedAt,
      channel,
      direction: "outbound",
      outcome: "booked",
      step: null,
      snippet: "Sent the booking link, they took the Thursday slot.",
    });
  }

  const heldAt = timeline[reachedIndex(FUNNEL.callHeld)];
  if (heldAt) {
    await log({
      at: heldAt,
      channel: "call",
      direction: "outbound",
      outcome: lead.lost ? "objection" : "positive_reply",
      step: null,
      snippet: lead.lost
        ? `Call went well on diagnosis. Objection was timing and wanting to try it in-house first.`
        : `Walked through the funnel gap. ${lead.angle}`,
    });
  }

  const proposalAt = timeline[reachedIndex(FUNNEL.proposalSent)];
  if (proposalAt) {
    await log({
      at: proposalAt,
      channel: chance(0.5) ? "loom" : "email",
      direction: "outbound",
      outcome: "sent",
      step: null,
      snippet: `Proposal sent: ${lead.valueType === "rev_share_estimate" ? "performance deal on new cash collected" : `$${lead.value.toLocaleString()} ${lead.valueType === "one_time" ? "one-time build" : "per month"}`}, 90 day term.`,
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
    now: Date;
  },
): Promise<void> {
  const { lead, dealId, path, timeline } = input;
  const author: Owner = lead.owner;
  const at = (stage: number): Date | undefined => {
    const index = path.indexOf(stage);
    return index === -1 ? undefined : timeline[index];
  };

  const researchAt = at(FUNNEL.researched) ?? at(FUNNEL.newLead) ?? timeline[0];
  if (researchAt && lead.reached >= FUNNEL.researched) {
    await repo.createNote({
      dealId,
      author,
      // Pinned so the research stays at the top of the panel once the thread
      // below it gets long.
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
      pinned: false,
    });
  }

  const heldAt = at(FUNNEL.callHeld);
  if (heldAt) {
    await repo.createNote({
      dealId,
      author,
      body: `**Call notes**\n\n- Currently at roughly $${lead.monthlyRevenue.toLocaleString()}/mo\n- Offer: ${lead.offerType}\n- ${lead.angle}\n\nNext: scope the first 30 days and price it.`,
      createdAt: new Date(heldAt.getTime() + MS_PER_HOUR),
      pinned: false,
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
        pinned: false,
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
    [FUNNEL.researched]: "Send opening message",
    [FUNNEL.contacted]: "Start the follow-up sequence",
    [FUNNEL.followUp]: "Send break-up message",
    [FUNNEL.replied]: "Send booking link",
    [FUNNEL.callBooked]: "Run the call",
    [FUNNEL.callHeld]: "Send proposal",
    [FUNNEL.proposalSent]: "Chase the proposal",
  };

  const action = actions[lead.reached];
  if (!action) return;

  // A third of the board is deliberately overdue so the dashboard's
  // needs-attention list and the card's red date have something real to show.
  const overdue = chance(0.35);
  const offset = overdue ? -randomInt(1, 9) : randomInt(1, 8);
  const nextActionAt = atWorkingHour(daysBefore(now, offset * -1));

  await repo.updateDeal(dealId, { nextAction: action, nextActionAt });

  if (lead.reached >= FUNNEL.callBooked) {
    await repo.createTask({
      dealId,
      title:
        lead.reached === FUNNEL.proposalSent
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
