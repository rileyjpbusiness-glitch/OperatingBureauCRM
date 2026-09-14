/**
 * The pipeline structure the application ships with.
 *
 * This is product configuration rather than demo data: without these two
 * pipelines and their stages there is no board to open, so a fresh database is
 * bootstrapped with them before the app serves a request. The seed imports the
 * same definitions, so demo data and a real deployment cannot drift apart.
 */
export type StageSpec = {
  name: string;
  staleAfterDays: number | null;
  isWon?: boolean;
  isLost?: boolean;
  isSequence?: boolean;
};

export const OUTBOUND_STAGES: StageSpec[] = [
  { name: "New Lead", staleAfterDays: 3 },
  { name: "Researched", staleAfterDays: 4 },
  // Sending the first message is day one of the cadence, so contacting and
  // following up are one stage with a sub-board behind it.
  { name: "In Sequence", staleAfterDays: 30, isSequence: true },
  { name: "Replied", staleAfterDays: 3 },
  { name: "Call Booked", staleAfterDays: 7 },
  // The call was taken and we are working to close it.
  { name: "Closing", staleAfterDays: 5 },
  { name: "Won", staleAfterDays: null, isWon: true },
  { name: "Lost", staleAfterDays: null, isLost: true },
];

export const DELIVERY_STAGES: StageSpec[] = [
  // Onboarding is exactly where a signed client goes quiet, so it has the
  // tightest clock on either board.
  { name: "Onboarding", staleAfterDays: 3 },
  { name: "Building", staleAfterDays: 7 },
  { name: "Live", staleAfterDays: 30 },
  { name: "Churned", staleAfterDays: null, isLost: true },
];

export const PIPELINE_DEFAULTS = [
  { name: "Outbound", slug: "outbound", stages: OUTBOUND_STAGES },
  { name: "Client Delivery", slug: "delivery", stages: DELIVERY_STAGES },
] as const;
