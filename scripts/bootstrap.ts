/**
 * Creates the pipelines and stages the app needs in order to have a board at
 * all. Idempotent: a database that already has pipelines is left alone, so this
 * is safe on every boot and safe to run twice.
 *
 * Structure only. Contacts, deals and history are yours; `npm run seed` is the
 * separate command that fills a database with demo data.
 */
import { PIPELINE_DEFAULTS } from "../lib/pipeline-defaults";

async function main(): Promise<void> {
  const repo = await import("../lib/repo");

  const existing = await repo.listPipelines();
  if (existing.length > 0) {
    console.log(
      `Pipelines already present (${existing.map((p) => p.slug).join(", ")}). Nothing to do.`,
    );
    return;
  }

  for (const spec of PIPELINE_DEFAULTS) {
    const pipeline = await repo.createPipeline({
      name: spec.name,
      slug: spec.slug,
    });

    for (const stage of spec.stages) {
      const created = await repo.createStage({
        pipelineId: pipeline.id,
        name: stage.name,
        staleAfterDays: stage.staleAfterDays,
        isSequence: stage.isSequence ?? false,
      });
      if (stage.isWon || stage.isLost) {
        await repo.updateStage(created.id, {
          isWon: stage.isWon ?? false,
          isLost: stage.isLost ?? false,
        });
      }
    }

    console.log(`Created ${spec.name} with ${spec.stages.length} stages.`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

export {};
