# Bureau CRM

A local-first CRM for Operating Bureau's cold outbound (Instagram DMs + cold
email) into high-ticket coaching and info-product clients. Two users, Riley and
Kavi. Runs on localhost, stores everything in a local SQLite file. No auth, no
cloud, no billing, no outbound network calls.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the dev server on port 3000 |
| `npm run build` | Production build (typechecks and lints as part of the build) |
| `npm run start` | Serves the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

`npm run seed` (resets and reseeds the database) arrives in phase 2, along with
the SQLite file itself.

## Where the data lives

The SQLite database will live at `data/bureau.db`, relative to the repo root.
`data/` is gitignored, so the database never leaves your machine and is never
committed. Deleting that directory and re-running the seed gives you a clean
database.

## Stack

- Next.js 15 (App Router) + React 19, TypeScript in strict mode
- Tailwind CSS v4, dark-only theme, shadcn/ui component conventions
- SQLite via better-sqlite3, Drizzle ORM, Drizzle Kit migrations
- Server Actions for every mutation; no separate API layer
- @dnd-kit for the pipeline board's drag and drop
- zod for server action input validation, date-fns for date math

### Notes on the setup

- `components.json` is present so the shadcn CLI works, but the UI components
  under `components/ui/` are written into this repo directly. That is how
  shadcn works anyway: it copies source files into your project rather than
  shipping a runtime dependency.
- Data access is confined to `lib/repo/`. No component imports Drizzle. Swapping
  SQLite for Postgres later should mean rewriting that directory, not the UI.
- `.env` is committed and contains one line, `NEXT_TELEMETRY_DISABLED=1`. The
  app makes no external requests; this turns off Next.js's own build telemetry
  too. You can also run `npx next telemetry disable` once per machine.

## Build phases

1. Scaffold, dependencies, Tailwind, dark theme, blank page rendering — **done**
2. Drizzle schema, migrations, repo layer, seed script
3. Pipeline board, read-only, with stage math in the column headers
4. Drag and drop with persistence and activity logging
5. Deal detail panel (Notes, Activity, Touches, Details)
6. Search, filters, quick-add, keyboard shortcuts
7. Contacts table and CSV import
8. Dashboard
9. Stage management

## Requirements

- Node 22 or newer (`better-sqlite3` 13 requires it; Node 26 is fine)
- No other system dependencies. `better-sqlite3` ships N-API prebuilds, so it
  does not compile from source and Xcode command line tools are not needed.

### Why package.json has an `overrides` block

`drizzle-kit` still depends on the deprecated `@esbuild-kit/esm-loader`, which
pins its own nested esbuild 0.18. That prebuilt binary fails to execute on
current macOS with `Unknown system error -88` (EBADARCH), which breaks
`npm install` outright. The override pins that one nested copy to esbuild 0.25,
which `drizzle-kit` already depends on directly. `tsx` keeps its own esbuild 0.28
untouched. Remove the override once drizzle-kit drops `@esbuild-kit`.
