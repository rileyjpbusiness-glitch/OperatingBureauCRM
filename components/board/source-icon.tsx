import {
  ArrowDownLeft,
  Circle,
  FileSpreadsheet,
  Mail,
  MessageCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Source } from "@/lib/db/enums";
import { cn } from "@/lib/utils";

/**
 * lucide dropped brand marks in v1, so Instagram DMs get the generic message
 * bubble rather than the logo.
 */
const ICONS: Record<Source, LucideIcon> = {
  ig_dm: MessageCircle,
  cold_email: Mail,
  referral: Users,
  inbound: ArrowDownLeft,
  list_import: FileSpreadsheet,
  other: Circle,
};

export const SOURCE_LABELS: Record<Source, string> = {
  ig_dm: "Instagram DM",
  cold_email: "Cold email",
  referral: "Referral",
  inbound: "Inbound",
  list_import: "List import",
  other: "Other",
};

export function SourceIcon({
  source,
  className,
}: {
  source: Source;
  className?: string;
}) {
  const Icon = ICONS[source];
  return (
    <Icon
      aria-label={SOURCE_LABELS[source]}
      className={cn("size-3 shrink-0", className)}
    />
  );
}
