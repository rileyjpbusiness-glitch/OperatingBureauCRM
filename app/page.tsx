import { redirect } from "next/navigation";

import { listPipelines } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * The dashboard lands here in phase 8. Until then the root goes straight to the
 * first pipeline, which is where the work actually happens.
 */
export default async function HomePage() {
  const pipelines = await listPipelines();
  const first = pipelines[0];
  redirect(first ? `/pipeline/${first.slug}` : "/pipeline/outbound");
}
