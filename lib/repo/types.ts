import type {
  ActivityType,
  DealStatus,
  Owner,
  Source,
  TouchChannel,
  TouchDirection,
  TouchOrigin,
  TouchOutcome,
  ValueType,
} from "@/lib/db/enums";

export type Pipeline = {
  id: string;
  name: string;
  slug: string;
  position: number;
  createdAt: Date;
};

export type Stage = {
  id: string;
  pipelineId: string;
  name: string;
  position: number;
  color: string;
  staleAfterDays: number | null;
  isWon: boolean;
  isLost: boolean;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
};

export type Contact = {
  id: string;
  firstName: string;
  lastName: string | null;
  company: string | null;
  instagramHandle: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  niche: string | null;
  offerType: string | null;
  monthlyRevenueEstimate: number | null;
  source: Source;
  owner: Owner;
  notesSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Deal = {
  id: string;
  contactId: string;
  pipelineId: string;
  stageId: string;
  title: string;
  value: number;
  valueType: ValueType;
  status: DealStatus;
  lostReason: string | null;
  owner: Owner;
  nextAction: string | null;
  nextActionAt: Date | null;
  position: number;
  stageEnteredAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * How aged a deal is relative to its stage's own threshold. "fresh" below it,
 * "stale" past it, "critical" past double. Stages with a null threshold are
 * always "fresh".
 */
export type Staleness = "fresh" | "stale" | "critical";

/** A deal plus everything the board card renders, in one object. */
export type DealCard = Deal & {
  contact: Contact;
  tags: Tag[];
  daysInStage: number;
  staleness: Staleness;
  /** True when nextActionAt is set and already in the past. */
  nextActionOverdue: boolean;
};

export type StageMetrics = {
  stageId: string;
  /** Deals sitting in this stage right now, after filters. */
  count: number;
  totalAnnualizedCents: number;
  totalMonthlyRecurringCents: number;
  /** Mean age of the deals currently in the stage. Null when the stage is empty. */
  avgDaysInStage: number | null;
  /**
   * Share of deals that reached the previous funnel stage and went on to reach
   * this one. Null for the first funnel stage, for lost stages, and whenever
   * the previous stage has too small a sample to mean anything.
   */
  conversionFromPrevious: number | null;
  /** Deals that ever reached this stage or any later funnel stage. */
  everReached: number;
};

export type StageWithMetrics = Stage & { metrics: StageMetrics };

export type Board = {
  pipeline: Pipeline;
  stages: StageWithMetrics[];
  cardsByStage: Record<string, DealCard[]>;
  /**
   * The funnel step with the worst conversion rate, which the board flags so
   * the bottleneck is visible without reading every header. Null when no step
   * has a large enough sample.
   */
  bottleneckStageId: string | null;
};

export type Note = {
  id: string;
  dealId: string;
  body: string;
  author: Owner;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type Touch = {
  id: string;
  dealId: string;
  channel: TouchChannel;
  direction: TouchDirection;
  sequenceStep: number | null;
  outcome: TouchOutcome;
  bodySnippet: string | null;
  occurredAt: Date;
  origin: TouchOrigin;
  externalId: string | null;
  createdAt: Date;
};

export type ActivityMeta = Record<string, unknown>;

export type Activity = {
  id: string;
  dealId: string;
  type: ActivityType;
  fromStageId: string | null;
  toStageId: string | null;
  meta: ActivityMeta | null;
  createdAt: Date;
};

export type Task = {
  id: string;
  dealId: string;
  title: string;
  dueAt: Date | null;
  completedAt: Date | null;
  owner: Owner;
  createdAt: Date;
};

/** Filters shared by the board, the contacts table and the dashboard. */
export type DealFilters = {
  search?: string | undefined;
  owner?: Owner | undefined;
  source?: Source | undefined;
  tagId?: string | undefined;
  staleOnly?: boolean | undefined;
};

/** Filters for the contacts table. Mirrors DealFilters but keyed off contacts. */
export type ContactFilters = {
  search?: string | undefined;
  owner?: Owner | undefined;
  source?: Source | undefined;
  tagId?: string | undefined;
  /** Only contacts with at least one deal past its stage's stale threshold. */
  staleOnly?: boolean | undefined;
};

export type ContactSortKey =
  | "name"
  | "company"
  | "source"
  | "owner"
  | "createdAt"
  | "updatedAt";

export type ContactListRow = Contact & {
  tags: Tag[];
  dealCount: number;
  openDealCount: number;
  openAnnualizedCents: number;
};

export type ContactListResult = {
  rows: ContactListRow[];
  total: number;
};
