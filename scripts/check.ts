/**
 * Behavioural checks for the repository layer.
 *
 * Runs against a throwaway database in the system temp directory so it never
 * touches data/bureau.db. Everything the board and the detail panel depend on
 * lives here: stage moves, activity logging, the won handoff, staleness, and
 * the filters.
 *
 *   npm run check
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Set before the repo layer is imported: lib/db/path reads this at module load.
process.env.BUREAU_DB_PATH = path.join(
  os.tmpdir(),
  `bureau-check-${process.pid}.db`,
);
let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}`, detail ?? "");
  }
}

let dates: typeof import("../lib/dates");

function checkTimezone(): void {
  const iso = (d: Date) => d.toISOString();

  // Standard time is UTC-5, daylight time UTC-4.
  check("day starts at 05:00Z in winter",
    iso(dates.startOfDay(new Date("2026-01-15T18:30:00Z"))) === "2026-01-15T05:00:00.000Z");
  check("day starts at 04:00Z in summer",
    iso(dates.startOfDay(new Date("2026-07-15T18:30:00Z"))) === "2026-07-15T04:00:00.000Z");
  check("an instant past UTC midnight keeps the business day's date",
    iso(dates.startOfDay(new Date("2026-07-16T03:30:00Z"))) === "2026-07-15T04:00:00.000Z");

  // The clocks move at 2am, so those two days are 23 and 25 hours long.
  const spring = new Date("2026-03-08T12:00:00Z");
  const fall = new Date("2026-11-01T12:00:00Z");
  check("the spring-forward day is 23 hours",
    (dates.endOfDay(spring).getTime() - dates.startOfDay(spring).getTime() + 1) / 3_600_000 === 23);
  check("the fall-back day is 25 hours",
    (dates.endOfDay(fall).getTime() - dates.startOfDay(fall).getTime() + 1) / 3_600_000 === 25);
  check("day arithmetic crosses a transition intact",
    iso(dates.startOfDaysAgo(new Date("2026-03-10T12:00:00Z"), 7)) === "2026-03-03T05:00:00.000Z");

  const now = new Date("2026-09-14T12:00:00Z");
  check("later today counts as due", dates.isDueOrOverdue(new Date("2026-09-14T23:00:00Z"), now));
  check("tomorrow does not count as due", !dates.isDueOrOverdue(new Date("2026-09-15T13:00:00Z"), now));
  // 02:00Z on the 15th is 10pm on the 14th in New York.
  check("a late-evening instant is still today",
    dates.isDueOrOverdue(new Date("2026-09-15T02:00:00Z"), now));

  check("a date input round trips",
    dates.toDateInputValue(dates.fromDateInputValue("2026-09-20")!) === "2026-09-20");
  check("a date input parses to business-timezone midnight, not UTC",
    iso(dates.fromDateInputValue("2026-09-20")!) === "2026-09-20T04:00:00.000Z");
  check("dates render in the business timezone",
    dates.formatDate(new Date("2026-09-22T02:00:00Z")) === "Sep 21");
  check("timestamps render in the business timezone",
    dates.formatDateTime(new Date("2026-09-21T13:00:00Z")) === "Sep 21, 9:00 AM");
}

async function main() {
  const repo = await import("../lib/repo");
  dates = await import("../lib/dates");

  checkTimezone();

  const pipeline = await repo.createPipeline({ name: "Test", slug: "test" });
  const second = await repo.createPipeline({ name: "Next", slug: "next" });

  const names = ["A", "B", "C", "Won", "Lost"];
  const stages = [];
  for (const name of names) {
    stages.push(
      await repo.createStage({ pipelineId: pipeline.id, name, staleAfterDays: 2 }),
    );
  }
  const [a, b, c, wonStage, lostStage] = stages;
  if (!a || !b || !c || !wonStage || !lostStage) throw new Error("stage setup");
  await repo.updateStage(wonStage.id, { isWon: true, staleAfterDays: null });
  await repo.updateStage(lostStage.id, { isLost: true, staleAfterDays: null });

  const deliveryStage = await repo.createStage({
    pipelineId: second.id, name: "Onboarding",
  });

  // --- stale thresholds ---
  check("an explicit null threshold is stored as null, not the default",
    (await repo.getStage(wonStage.id))?.staleAfterDays === null,
    (await repo.getStage(wonStage.id))?.staleAfterDays);
  check("an omitted threshold falls back to the default",
    deliveryStage.staleAfterDays === 7, deliveryStage.staleAfterDays);
  const nulled = await repo.createStage({
    pipelineId: second.id, name: "Never stale", staleAfterDays: null,
  });
  check("createStage keeps a null threshold null", nulled.staleAfterDays === null, nulled.staleAfterDays);
  check("updateStage can clear a threshold back to null",
    (await repo.updateStage(deliveryStage.id, { staleAfterDays: null }))?.staleAfterDays === null);
  check("updateStage leaves fields it was not given alone",
    (await repo.updateStage(deliveryStage.id, { name: "Onboarding" }))?.staleAfterDays === null);
  await repo.updateStage(deliveryStage.id, { staleAfterDays: 7 });
  await repo.deleteStage(nulled.id);

  const { contact, deal } = await repo.createContactWithDeal({
    contact: { firstName: "Test", lastName: "Lead", source: "ig_dm", owner: "riley",
      instagramHandle: "https://instagram.com/TestLead/", email: "  TEST@Example.com " },
    pipelineId: pipeline.id,
    stageId: a.id,
    value: 100_000,
  });

  check("handle normalized from a profile URL", contact.instagramHandle === "@testlead", contact.instagramHandle);
  check("email lowercased and trimmed", contact.email === "test@example.com", contact.email);
  check("deal inherits the contact's owner", deal.owner === "riley");

  const created = await repo.listActivities(deal.id);
  check("created activity records the starting stage",
    created.length === 1 && created[0]?.type === "created" && created[0]?.toStageId === a.id);

  // --- stage change ---
  const entered = deal.stageEnteredAt.getTime();
  await new Promise((r) => setTimeout(r, 5));
  const moved = await repo.moveDeal({ dealId: deal.id, toStageId: b.id, targetIndex: 0 });
  check("stageEnteredAt resets on a stage change", moved.stageEnteredAt.getTime() > entered);
  const afterMove = await repo.listActivities(deal.id);
  check("stage change writes one activity",
    afterMove.filter((x) => x.type === "stage_changed").length === 1);
  check("activity records both ends of the move",
    afterMove[0]?.fromStageId === a.id && afterMove[0]?.toStageId === b.id);

  // --- reorder within a stage does not count as a stage change ---
  const sibling = await repo.createDeal({
    contactId: contact.id, pipelineId: pipeline.id, stageId: b.id,
    title: "Sibling", owner: "kavi",
  });
  const enteredBefore = (await repo.getDeal(deal.id))?.stageEnteredAt.getTime();
  await repo.moveDeal({ dealId: deal.id, toStageId: b.id, targetIndex: 1 });
  const enteredAfter = (await repo.getDeal(deal.id))?.stageEnteredAt.getTime();
  check("reordering leaves stageEnteredAt alone", enteredBefore === enteredAfter);
  check("reordering writes no stage_changed row",
    (await repo.listActivities(deal.id)).filter((x) => x.type === "stage_changed").length === 1);
  const ordered = await repo.listDealCards({ pipelineId: pipeline.id });
  const inB = ordered.filter((x) => x.stageId === b.id);
  check("card landed after its sibling", inB[0]?.id === sibling.id && inB[1]?.id === deal.id,
    inB.map((x) => x.title));

  // --- value change ---
  await repo.updateDeal(deal.id, { value: 250_000 });
  const valueRows = (await repo.listActivities(deal.id)).filter((x) => x.type === "value_changed");
  check("value change is logged once", valueRows.length === 1);
  check("value change records both amounts",
    (valueRows[0]?.meta?.from as { value: number } | undefined)?.value === 100_000);
  await repo.updateDeal(deal.id, { value: 250_000 });
  check("an unchanged value logs nothing",
    (await repo.listActivities(deal.id)).filter((x) => x.type === "value_changed").length === 1);

  // --- winning hands off to the next pipeline ---
  await repo.moveDeal({ dealId: deal.id, toStageId: wonStage.id, targetIndex: 0 });
  const wonDeal = await repo.getDeal(deal.id);
  check("won stage sets status", wonDeal?.status === "won");
  check("won activity written",
    (await repo.listActivities(deal.id)).some((x) => x.type === "won"));

  const handed = await repo.listDealCards({ pipelineId: second.id });
  check("handoff created one deal in the next pipeline", handed.length === 1, handed.length);
  check("handoff deal starts in the first stage", handed[0]?.stageId === deliveryStage.id);
  check("handoff deal is open", handed[0]?.status === "open");
  check("handoff carried the value", handed[0]?.value === 250_000);
  const handoffNotes = handed[0] ? await repo.listNotes(handed[0].id) : [];
  check("handoff left a real pinned note", handoffNotes.length === 1 && handoffNotes[0]?.pinned === true);

  // --- re-winning must not duplicate the handoff ---
  await repo.moveDeal({ dealId: deal.id, toStageId: c.id, targetIndex: 0 });
  check("dragging out of Won reopens the deal", (await repo.getDeal(deal.id))?.status === "open");
  await repo.moveDeal({ dealId: deal.id, toStageId: wonStage.id, targetIndex: 0 });
  check("re-winning does not create a second handoff",
    (await repo.listDealCards({ pipelineId: second.id })).length === 1);

  // --- losing ---
  await repo.updateDeal(sibling.id, { lostReason: "Budget" });
  await repo.moveDeal({ dealId: sibling.id, toStageId: lostStage.id, targetIndex: 0 });
  const lostDeal = await repo.getDeal(sibling.id);
  check("lost stage sets status", lostDeal?.status === "lost");
  check("lost reason survives the move", lostDeal?.lostReason === "Budget");

  // --- cross-pipeline move is refused ---
  let refused = false;
  try {
    await repo.moveDeal({ dealId: deal.id, toStageId: deliveryStage.id, targetIndex: 0 });
  } catch {
    refused = true;
  }
  check("moving a deal into another pipeline is refused", refused);

  // --- deleting a stage that still holds deals ---
  const parked = await repo.createDeal({
    contactId: contact.id, pipelineId: pipeline.id, stageId: c.id, title: "Parked", owner: "riley",
  });

  let blocked = false;
  try {
    await repo.deleteStage(c.id);
  } catch {
    blocked = true;
  }
  check("deleting a non-empty stage without a destination is refused", blocked);
  check("the refused delete left the stage in place",
    (await repo.listStages(pipeline.id)).some((stage) => stage.id === c.id));

  await repo.deleteStage(c.id, a.id);
  const relocated = await repo.getDeal(parked.id);
  check("deals move to the named destination", relocated?.stageId === a.id);
  check("the forced move is logged",
    (await repo.listActivities(parked.id)).some(
      (x) => x.type === "stage_changed" && x.toStageId === a.id),
  );
  const left = await repo.listStages(pipeline.id);
  check("positions stay dense after a delete",
    left.every((stage, index) => stage.position === index), left.map((s) => s.position));

  // --- filters ---
  await repo.createContacts([
    { firstName: "Zed", lastName: "Filter", company: "Filterco", source: "cold_email", owner: "kavi" },
  ]);
  const searched = await repo.listContacts({ filters: { search: "filterco" } });
  check("search matches on company", searched.total === 1 && searched.rows[0]?.firstName === "Zed");
  const byOwner = await repo.listContacts({ filters: { owner: "riley" } });
  check("owner filter narrows the list", byOwner.total === 1, byOwner.total);

  const tag = await repo.getOrCreateTag("smoke");
  await repo.setContactTags(contact.id, [tag.id]);
  const tagged = await repo.listContacts({ filters: { tagId: tag.id } });
  check("tag filter works", tagged.total === 1 && tagged.rows[0]?.id === contact.id);
  check("getOrCreateTag is idempotent", (await repo.getOrCreateTag("smoke")).id === tag.id);

  const ownerCards = await repo.listDealCards({ pipelineId: pipeline.id, filters: { owner: "kavi" } });
  check("deal owner filter reads the deal, not the contact",
    ownerCards.length === 1 && ownerCards[0]?.title === "Sibling", ownerCards.map((c2) => c2.title));

  // --- staleness ---
  const stale = await repo.createDeal({
    contactId: contact.id, pipelineId: pipeline.id, stageId: a.id, title: "Old", owner: "riley",
    createdAt: new Date(Date.now() - 10 * 86_400_000),
  });
  const staleCard = (await repo.listDealCards({ pipelineId: pipeline.id })).find((x) => x.id === stale.id);
  check("days in stage derives from stageEnteredAt", staleCard?.daysInStage === 10, staleCard?.daysInStage);
  check("past double the threshold reads critical", staleCard?.staleness === "critical", staleCard?.staleness);
  const staleOnly = await repo.listDealCards({ pipelineId: pipeline.id, filters: { staleOnly: true } });
  check("stale-only filter returns just the aged deal",
    staleOnly.length === 1 && staleOnly[0]?.id === stale.id, staleOnly.map((x) => x.title));

  // A deal sitting in Won for months is not a deal that needs chasing.
  const wonCard = (await repo.listDealCards({ pipelineId: pipeline.id })).find((x) => x.id === deal.id);
  check("a deal in a null-threshold stage never reads stale",
    wonCard?.staleness === "fresh", wonCard?.staleness);
  check("stale-only excludes deals in null-threshold stages",
    !staleOnly.some((x) => x.id === deal.id));

  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${process.env.BUREAU_DB_PATH ?? ""}${suffix}`;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  // --- follow-up cadence ---
  const seqStage = await repo.createStage({
    pipelineId: pipeline.id, name: "Seq", isSequence: true,
  });
  check("createStage records the sequence flag", seqStage.isSequence === true);

  const seqDeal = await repo.createDeal({
    contactId: contact.id, pipelineId: pipeline.id, stageId: a.id,
    title: "Cadence", owner: "riley",
  });
  check("a deal outside the sequence has no step",
    (await repo.getDeal(seqDeal.id))?.sequenceStep === null);

  await repo.moveDeal({ dealId: seqDeal.id, toStageId: seqStage.id, targetIndex: 0 });
  check("entering the sequence starts the cadence at day one",
    (await repo.getDeal(seqDeal.id))?.sequenceStep === "day_1");
  check("starting the cadence is logged",
    (await repo.listActivities(seqDeal.id)).some((x) => x.type === "sequence_step_changed"));

  await repo.setSequenceStep({ dealId: seqDeal.id, step: "day_3", targetIndex: 0 });
  check("advancing the cadence keeps the deal in the sequence stage",
    (await repo.getDeal(seqDeal.id))?.stageId === seqStage.id);
  check("advancing the cadence sets the step",
    (await repo.getDeal(seqDeal.id))?.sequenceStep === "day_3");
  check("each advance is logged",
    (await repo.listActivities(seqDeal.id)).filter((x) => x.type === "sequence_step_changed").length === 2);

  await repo.moveDeal({ dealId: seqDeal.id, toStageId: a.id, targetIndex: 0 });
  check("leaving the sequence clears the step",
    (await repo.getDeal(seqDeal.id))?.sequenceStep === null);

  // No Answer is the end of the cadence, not a step in it.
  await repo.moveDeal({ dealId: seqDeal.id, toStageId: seqStage.id, targetIndex: 0 });
  await repo.setSequenceStep({ dealId: seqDeal.id, step: "no_answer", targetIndex: 0 });
  const dead = await repo.getDeal(seqDeal.id);
  check("no answer marks the deal lost", dead?.status === "lost", dead?.status);
  check("no answer moves the deal to the Lost stage", dead?.stageId === lostStage.id);
  check("no answer records a reason", dead?.lostReason === "No answer", dead?.lostReason);
  check("no answer keeps the step so the sub-board still shows it",
    dead?.sequenceStep === "no_answer");
  check("no answer writes a lost activity",
    (await repo.listActivities(seqDeal.id)).some((x) => x.type === "lost"));

  const subBoard = await repo.getSequenceBoard("test");
  const noAnswerColumn = subBoard?.columns.find((c) => c.step === "no_answer");
  check("the sub-board still lists a no-answer deal",
    noAnswerColumn?.cards.some((c) => c.id === seqDeal.id) === true);
  check("the sub-board has one column per cadence step",
    subBoard?.columns.length === 9, subBoard?.columns.length);

  // --- detail panel data ---
  const detail = await repo.getDealDetail(deal.id);
  check("deal detail loads", detail !== null);
  check("history merges touches and activities",
    (detail?.history.length ?? 0) > 0);
  check("history does not double-count logged touches",
    detail?.history.every((e) => e.kind === "touch" || e.activity.type !== "touch_logged") === true);
  check("history is newest first",
    (detail?.history ?? []).every((entry, i, list) =>
      i === 0 || list[i - 1]!.at.getTime() >= entry.at.getTime()));

  // --- KPI dashboard ---
  const kpi = await import("../lib/repo/kpi");
  const meta = await import("../lib/kpi");

  for (const period of meta.PERIODS) {
    const board = await kpi.getKpiDashboard(period, new Date());
    check(`${period}: every metric has a reading`,
      meta.KPI_METRICS.every((m) => board.readings[m] !== undefined));
    check(`${period}: the chart has buckets`, board.series.length > 0);
    check(`${period}: buckets run oldest to newest`,
      board.series.every((b, i, list) =>
        i === 0 || list[i - 1]!.start.getTime() < b.start.getTime()));
    check(`${period}: buckets do not overlap`,
      board.series.every((b, i, list) =>
        i === 0 || list[i - 1]!.end.getTime() < b.start.getTime()));
    check(`${period}: conversion is a ratio, not a percentage`,
      board.readings.conversion.current >= 0 &&
      board.readings.conversion.current <= 1);
  }

  // A metric with nothing before it reports no change rather than a fake 100%.
  const daily = await kpi.getKpiDashboard("daily", new Date());
  check("no previous figure means no percentage",
    daily.readings.leads.previous !== 0 ||
    daily.readings.leads.changeRatio === null);

  // --- the bin ---------------------------------------------------------------
  // The invariant worth protecting is not that binning works, but that a binned
  // deal disappears from every surface at once. A deal that vanished from the
  // board while still counting toward a conversion rate would be worse than no
  // bin at all.
  const binContact = await repo.createContact({
    firstName: "Bin", lastName: "Subject", owner: "riley", source: "ig_dm",
  });
  const binDeal = await repo.createDeal({
    contactId: binContact.id, pipelineId: pipeline.id, stageId: a.id,
    title: "Binned deal", owner: "riley", value: 500_00,
  });

  const onBoardBefore = (await repo.listDealCards({ pipelineId: pipeline.id }))
    .some((card) => card.id === binDeal.id);
  const countBefore = await repo.countDealsInStage(a.id);
  check("a new deal is on the board", onBoardBefore);

  await repo.binDeal(binDeal.id);

  check("a binned deal leaves the board",
    !(await repo.listDealCards({ pipelineId: pipeline.id }))
      .some((card) => card.id === binDeal.id));
  check("a binned deal leaves its column count",
    (await repo.countDealsInStage(a.id)) === countBefore - 1);
  check("a binned deal is in the bin",
    (await repo.listBinnedCards()).some((card) => card.id === binDeal.id));
  check("the bin count agrees with the bin",
    (await repo.countBinned()) === (await repo.listBinnedCards()).length);
  check("binning records the day it happened",
    (await repo.listBinnedCards()).find((card) => card.id === binDeal.id)
      ?.binnedAt instanceof Date);
  check("a binned deal leaves the search results",
    !(await repo.suggestLeads("Subject")).some((hit) => hit.dealId === binDeal.id));
  check("binning twice does not move the date",
    (await repo.binDeal(binDeal.id))?.binnedAt?.getTime() ===
      (await repo.listBinnedCards()).find((card) => card.id === binDeal.id)
        ?.binnedAt?.getTime());

  await repo.restoreDeal(binDeal.id);
  check("restoring puts it back on the board",
    (await repo.listDealCards({ pipelineId: pipeline.id }))
      .some((card) => card.id === binDeal.id));
  check("restoring puts it back in its stage",
    (await repo.getDeal(binDeal.id))?.stageId === a.id);
  check("the bin is empty again", (await repo.countBinned()) === 0);

  await repo.binDeal(binDeal.id);
  const emptied = await repo.emptyBin();
  check("emptying reports what it destroyed", emptied.deals === 1, emptied);
  check("emptying deletes the deal", (await repo.getDeal(binDeal.id)) === null);
  check("emptying takes a contact left with no deals at all",
    emptied.contacts === 1 &&
    (await repo.getContact(binContact.id)) === null, emptied);
  check("emptying an empty bin is a no-op",
    (await repo.emptyBin()).deals === 0);

  // --- lead suggestions -------------------------------------------------------
  const suggestContact = await repo.createContact({
    firstName: "Tonique", lastName: "Baptiste", owner: "kavi", source: "ig_dm",
  });
  await repo.createDeal({
    contactId: suggestContact.id, pipelineId: pipeline.id, stageId: b.id,
    title: "Suggestion subject", owner: "kavi",
  });
  check("two letters are below the floor and suggest nothing",
    (await repo.suggestLeads("to")).length === 0);
  check("three letters find the lead",
    (await repo.suggestLeads("ton")).some((hit) => hit.name === "Tonique Baptiste"));
  check("a surname finds them too",
    (await repo.suggestLeads("bap")).some((hit) => hit.name === "Tonique Baptiste"));
  check("a suggestion carries where to jump to",
    (await repo.suggestLeads("ton"))[0]?.pipelineSlug === "test");
  check("a suggestion names the stage the lead is in",
    (await repo.suggestLeads("ton"))[0]?.stageName === "B");

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILED`);
  if (failures > 0) process.exit(1);
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
