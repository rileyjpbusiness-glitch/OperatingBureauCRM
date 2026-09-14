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
| `npm run seed` | Deletes the database, re-migrates, and reseeds it |
| `npm run build` | Production build (typechecks and lints as part of the build) |
| `npm run start` | Serves the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run check` | Behavioural checks of the repo layer, against a temp database |
| `npm run db:generate` | Generates a migration from changes to the schema |
| `npm run db:migrate` | Applies pending migrations |
| `npm run db:inspect` | Prints both boards with their stage metrics |
| `npm run db:studio` | Drizzle Studio, a browser UI over the tables |

## Where the data lives

The SQLite database lives at `data/bureau.db`, relative to the repo root. It is
created on first run and migrations apply automatically, so a fresh clone can go
straight to `npm run dev`. `data/` is gitignored, so the database never leaves
your machine and is never committed.

`npm run seed` empties every table and rebuilds it: two pipelines, their stages,
30 leads, and the full history behind them. It empties rather than deleting the
file on purpose, so a dev server that is already running picks the new data up
without a restart. It uses a fixed random seed, so reseeding twice gives you the
identical database. Set `BUREAU_DB_PATH` to point any command at a different
file.

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

## Still to build

Contacts table and CSV import, and stage management in the UI (rename, reorder,
recolour, add, delete). The repository layer already implements all of it; only
the screens are missing.

## How the data model works

Ten tables, all defined in `lib/db/schema.ts`. The parts worth knowing:

Ids are text, prefixed and time-sortable (`deal_01jf3k2m8q4t7v`). Timestamps are
epoch milliseconds in INTEGER columns. Money is integer cents, never a float.

`deals.stage_entered_at` is set on creation and reset on every stage change.
Time in stage derives from it and never from `updated_at`, which moves whenever
anything else on the deal is edited.

`activities` is append-only and written only by `lib/repo/activity-log.ts`.
Every mutation that matters writes its row inside the same transaction as the
change itself, so the two cannot disagree. Nothing edits an activity after the
fact.

`touches` carries `origin` and `external_id` columns that v1 never populates
with anything but `manual` and null. They are what an Instantly or Smartlead
sync would write instead, with `external_id` making a replayed webhook
idempotent. That integration is out of scope, but the table does not need
changing to support it.

Adding a second workspace later means adding a `workspace_id` column to
pipelines, contacts and tags, and widening two unique indexes that are marked
with a comment where they are defined. Nothing else assumes a single tenant.

### Decisions behind the numbers

**Conversion rates are historical, not a snapshot.** A column header does not
compare its own card count to the previous column's. It asks how many deals
ever reached the previous funnel stage or any later one, and what share of those
went on to reach this stage or later. Reading it off the activity log means a
stage that is empty today still shows the rate it has actually converted at, and
counting later stages too means a deal that skipped a stage is not recorded as
having died there. Lost stages are excluded from the funnel entirely, so
dropping a deal into Lost does not retroactively credit it with reaching
everything before it. A rate is only shown once the previous stage has at least
five deals behind it; below that it would be noise.

**Column totals are MRR.** Annualized contract value was dropped: it was the
largest number on the board and it was only MRR times twelve. One-time deals
contribute nothing to it, which is what the figure is supposed to mean. The
conversion lives in `lib/repo/money.ts` and nowhere else, including not in SQL.

**The sequence step is a column on deals, not a stage.** `deals.sequence_step`
is non-null only while a deal is in the stage flagged `is_sequence`. Entering
that stage sets it to day one, leaving clears it, and every change writes an
activity row. The one exception is `no_answer`, which the deal keeps after
moving to Lost so the sub-board can still show it.

**Average days in stage measures the deals sitting there now.** That is the
number that tells you where work is piling up today.

**Cards carry one badge, not two.** It answers what you owe this person next:
the next action date if one is set. Only when nothing is scheduled does age take
the slot, and only once it is past the stage's own threshold. Delivery cards get
the same treatment, with tight thresholds (Onboarding 3 days, Building 7, Live
30) because onboarding is exactly where a signed client goes quiet.

**Zero is an absence, not a value.** A lead nobody has priced renders no value
line at all rather than claiming to be worth $0, and empty fields in the detail
panel are empty slots rather than eight repetitions of "Not set".

**The bottleneck is one coloured number.** The worst converting step shows its
rate in amber when Stats is on, and nothing else changes. Won is excluded from
the running: Closing to Won is a real step, but Won is an outcome rather than a
stage anyone works, and it renders collapsed, so flagging it would hide the flag.

**Winning a deal opens the next pipeline's version of it.** Moving a deal into a
stage marked `is_won` sets its status, logs it, and creates a fresh open deal for
the same contact at the first stage of the next pipeline by position, with a
pinned note explaining where it came from. It is generic rather than hardcoded
to Client Delivery, and it will not duplicate if the contact already has an open
deal there.

**Deals carry their own owner.** It defaults to the contact's owner at creation
but is reassignable, so delivery can sit with a different operator than the one
who sourced the lead. The board, the cards and the owner filter all read the
deal's owner.

### Formatting rules

Values: `$2,000/mo`, `$6,500 once`, and rev-share estimates as `$8,500/mo` in a
muted colour rather than an `est.` suffix, so the shape of the number never
changes.

Dates: relative inside a week either direction (`in 3d`, `today`,
`4d overdue`), absolute beyond it (`Sep 21`). No `tomorrow`, no `yesterday`.

### A caveat on the seeded numbers

Thirty leads cannot show a realistic cold outbound funnel and still put cards in
every column. Real cold DM reply rates are single digits; at that rate a 30-lead
seed would leave everything past Replied empty. The seeded funnel therefore
drops off gently, with the sharp falls at Replied and at Won, which makes the
board legible but flatters the rates. If you would rather see numbers that look
like real outbound, the fix is a larger seed, not a different calculation.
