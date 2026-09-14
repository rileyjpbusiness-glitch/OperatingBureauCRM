/**
 * The only module the UI imports for data. Nothing outside lib/repo touches
 * Drizzle or better-sqlite3, so moving to Postgres means rewriting this
 * directory and leaving every component alone.
 */
export * from "./types";
export * from "./money";
export * from "./pipelines";
export * from "./stages";
export * from "./contacts";
export * from "./deals";
export * from "./notes";
export * from "./touches";
export * from "./tasks";
export * from "./activities";
export * from "./tags";
export * from "./metrics";
export * from "./board";
export * from "./dashboard";
export * from "./reset";
export * from "./kpi";
