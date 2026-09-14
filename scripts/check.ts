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

async function main() {
  const repo = await import("../lib/repo");

  const pipeline = await repo.createPipeline({ name: "Test", slug: "test" });
  const second = await repo.createPipeline({ name: "Next", slug: "next" });

  const names = ["A", "B", "C", "Won", "Lost"];
  const stages = [];
  for (const name of names) {
    stages.push(
      await repo.createStage({ pipelineId: pipeline.id, name, color: "#fff", staleAfterDays: 2 }),
    );
  }
  const [a, b, c, wonStage, lostStage] = stages;
  if (!a || !b || !c || !wonStage || !lostStage) throw new Error("stage setup");
  await repo.updateStage(wonStage.id, { isWon: true, staleAfterDays: null });
  await repo.updateStage(lostStage.id, { isLost: true, staleAfterDays: null });

  const deliveryStage = await repo.createStage({
    pipelineId: second.id, name: "Onboarding", color: "#fff",
  });

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

  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${process.env.BUREAU_DB_PATH ?? ""}${suffix}`;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILED`);
  if (failures > 0) process.exit(1);
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
