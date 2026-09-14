/**
 * Prints both boards with their stage metrics, plus a sample deal's activity
 * trail. A way to see the numbers the column headers will show without
 * loading the UI.
 *
 *   npm run db:inspect
 */
async function main(): Promise<void> {
  const repo = await import("../lib/repo");

  for (const slug of ["outbound", "delivery"]) {
    const board = await repo.getBoard(slug);
    if (!board) throw new Error(`no board ${slug}`);

    console.log(`\n=== ${board.pipeline.name} (${slug}) ===`);
    console.log(
      "stage".padEnd(26) +
        "n".padStart(3) +
        "mrr".padStart(10) +
        "conv".padStart(7) +
        "avgD".padStart(6) +
        "reach".padStart(7) +
        "  flags",
    );
    for (const stage of board.stages) {
      const m = stage.metrics;
      const flags = [
        stage.isWon ? "WON" : "",
        stage.isLost ? "LOST" : "",
        board.bottleneckStageId === stage.id ? "<< BOTTLENECK" : "",
      ]
        .filter(Boolean)
        .join(" ");
      console.log(
        stage.name.padEnd(26) +
          String(m.count).padStart(3) +
          `$${(m.totalMonthlyRecurringCents / 100).toLocaleString()}`.padStart(10) +
          (m.conversionFromPrevious === null
            ? "-"
            : `${Math.round(m.conversionFromPrevious * 100)}%`
          ).padStart(7) +
          (m.avgDaysInStage === null ? "-" : m.avgDaysInStage.toFixed(1)).padStart(6) +
          String(m.everReached).padStart(7) +
          "  " +
          flags,
      );
    }
  }

  const board = await repo.getBoard("outbound");
  if (!board) return;
  const all = Object.values(board.cardsByStage).flat();
  const staleness = all.reduce<Record<string, number>>((acc, card) => {
    acc[card.staleness] = (acc[card.staleness] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\nstaleness:", staleness);
  console.log("overdue next actions:", all.filter((c) => c.nextActionOverdue).length);

  const steps = all.reduce<Record<string, number>>((acc, card) => {
    if (card.sequenceStep) acc[card.sequenceStep] = (acc[card.sequenceStep] ?? 0) + 1;
    return acc;
  }, {});
  console.log("sequence steps:", steps);

  const sample = all.find((c) => c.contact.firstName === "Dane");
  if (sample) {
    const acts = await repo.listActivities(sample.id);
    console.log(`\nactivity trail for ${sample.title} (${acts.length} rows):`);
    for (const a of acts.slice().reverse()) {
      console.log(
        "  ",
        a.createdAt.toISOString().slice(0, 10),
        a.type.padEnd(14),
        a.toStageId ? board.stages.find((s) => s.id === a.toStageId)?.name ?? "" : "",
      );
    }
    const touches = await repo.listTouches(sample.id);
    console.log(`  touches: ${touches.length}, notes: ${(await repo.listNotes(sample.id)).length}, tasks: ${(await repo.listTasks(sample.id)).length}`);
  }

  const attention = await repo.listDealsNeedingAttention();
  console.log(`\nneeds attention: ${attention.stale.length} stale, ${attention.overdue.length} overdue`);

  const contacts = await repo.listContacts({ limit: 3, sort: "name", direction: "asc" });
  console.log(`\ncontacts total ${contacts.total}; first rows:`);
  for (const row of contacts.rows) {
    console.log(`   ${row.firstName} ${row.lastName} | ${row.company} | ${row.source} | deals ${row.dealCount} | open ACV $${(row.openAnnualizedCents / 100).toLocaleString()} | tags ${row.tags.map((t) => t.name).join(",")}`);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
