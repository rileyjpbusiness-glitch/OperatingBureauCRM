# Bureau CRM

A local-first CRM for Operating Bureau's cold outbound (Instagram DMs + cold
email) into high-ticket coaching and info-product clients. Two users, Riley and
Kavi. Stores everything in one SQLite file. No billing, no third-party calls,
and no authentication code in the app itself. It runs on localhost during
development and, deployed, behind Cloudflare Access on a host with no publicly
reachable origin. See `docs/DEPLOY.md`.

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
| `npm run bootstrap` | Creates the two pipelines and their stages in an empty database, and nothing else |
| `npm run backup` | Downloads a verified snapshot of the deployed database into `backups/` |
| `npm run snapshot` | Writes a consistent single-file copy of the local database |
| `npm run verify:backup` | Opens a backup file and reports what is in it |
| `npm run build` | Applies migrations, then builds (typechecks and lints as part of it) |
| `npm run start` | Serves the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run check` | Behavioural checks of the repo layer, against a temp database |
| `npm run check:dockerfile` | Resolves every COPY source in the Dockerfile; run it before pushing a change to that file |
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
- Tailwind CSS v4, dark and light themes, shadcn/ui component conventions
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

## Deploying

`docs/DEPLOY.md` is the runbook: eight numbered steps, each marked with whether
it needs a Cloudflare login or a Fly login. The shape of it:

The app listens on `127.0.0.1` inside its container and nothing else. There is
no public Fly port and no `*.fly.dev` hostname, which is why `fly.toml` has no
`[http_service]` and no `[[services]]` block. `fly ips list` printing nothing is
the check that this held.

Traffic reaches it through a Cloudflare Tunnel. `cloudflared` runs as a sidecar
in the same container, started by `docker/entrypoint.sh`, and dials out to
Cloudflare; the connection is outbound only, so there is no inbound address to
find. `privatecrm.operatingbureau.com` resolves to the tunnel, and a Cloudflare
Access policy in front of it allows two email addresses by explicit allowlist,
authenticating with one-time email codes and a thirty day session.

That is the whole authentication story. The application has no login screen, no
users table and no session handling, because an origin that only Cloudflare can
reach does not need them, and a second implementation of the same control is a
second thing to get wrong.

`scripts/bootstrap.ts` runs on every boot. On a fresh volume it creates the two
pipelines and their stages so the boards render instead of 404ing; on a volume
that already has them it prints what it found and exits. It never writes
contacts or deals — the production database starts empty of leads on purpose.

## Finding a lead

Typing filters the board, as it always has. Typing three letters also offers the
leads it matches, and picking one jumps to that card with its detail panel open
-- which is the faster path when you already know who you are looking for and do
not want the board narrowed around them. Matching is the same contains-match the
board filter uses, so the dropdown can never offer a lead the filtered board
then hides; the ranking is done afterwards, because "starts with" is what
someone typing a name means and SQL LIKE cannot express the preference in one
pass. A surname finds someone as readily as a first name.

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

**The hot flag is the one thing on a card you set by hand.** Everything else
the card shows is derived: the badge from the next action date, the left edge
from time in stage, the dimming from status. `deals.priority` is the operator's
own judgement that a lead needs attention now, and it is deliberately not
computed from anything, because the point of it is to say something the board
cannot work out for itself. A flagged card keeps its own surface and takes a
wash of the hot signal rather than becoming a red box; it has to stay readable
next to twenty others. It writes no activity row: every other field in that
table changes rarely and means something historically, while this is a flag
flipped while working a list, and logging each flip would bury the history it
sits in.

**Builds out is the only figure with a target on it.** Three a day, where a
build going out means a deal reaching the first step of the cadence. Everything
before that step is preparation and everything after it depends on it, so it is
the one number the operation is actually run against; leads created and calls
booked are reporting. The dashboard reads it off the activity log rather than
the deals' current positions, so a lead that has since replied, been won or been
lost still counts on the day its build went out, and re-entering the cadence
does not count twice.

**Reply rate is measured against everyone who got a build, not everyone who
finished.** Of the deals that reached day one in the window, what share have
reached any stage past the cadence that is not a dead end -- because a lead who
answered and went straight to a booked call has replied just as much as one who
stopped at Replied. Deals still in the cadence stay in the denominator: a rate
over resolved conversations only flatters itself early and moves for reasons
that have nothing to do with the messages. The breakdown underneath says how
many are still in flight, and the sample is printed next to the figure, because
a rate over four people is not a rate.

**The bin is a middle state, and that is the point.** Dragging a lead onto the
bin sets a date on the row rather than deleting it, and every read of deals
excludes a row with a date there, so the lead leaves the board, its column
count, the funnel, the search box and every figure at once. It stays in the bin
with the day it was binned until the bin is emptied, which is the only
irreversible step and asks twice. A lead dragged off by mistake can be put back;
one you meant to delete is gone only when you say so a second time. Emptying
also takes any contact left holding no deals at all, because a name in the
search box that belongs to nothing is worse than no name.

**Zero is an absence, not a value.** A lead nobody has priced renders no value
line at all rather than claiming to be worth $0, and empty fields in the detail
panel are empty slots rather than eight repetitions of "Not set".

**Close rate reads off the same log as the column headers.** Of the deals that
reached the closing stage in the last thirty days, how many were won. A deal
that reached Won counts as having reached Closing, so winning one can never make
the rate look worse than never having the conversation.

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

## The visual system

Every colour, radius, duration and type size in the application is a custom
property in `app/globals.css`. No component carries a literal value; the audit
for that is `grep -rniE "#[0-9a-f]{3,8}|rgba?\(" components app lib scripts`,
which returns nothing.

The interface is monochrome and colour is earned. There are three non-neutral
colours in the whole application: `--signal-warm` for due and stale, and for the
worst converting step; `--signal-hot` for badly overdue and for a lead flagged
hot; `--signal-good` for won. Stage markers, owner chips and tags are all
neutral, because a stage's position is its identity and a tag is a label.

**Two themes, one palette.** Dark is the default and lives on `:root`; light
overrides only the values that have to change, under `html[data-theme="light"]`.
The neutrals invert their order and the three signals are re-tuned rather than
replaced, because `#e0a03c` on paper is a pale smudge where on the dark ground
it is a warning. Anything derived from those tokens -- the priority wash, the
silt edge, the drag shadow, the vignette -- follows without being restated.

The theme does not follow the operating system. Reading it would flip this
interface to light for anyone whose laptop happens to be set that way, which is
a change to how the product looks that nobody chose. Light is a decision, taken
with the toggle in the top bar and remembered per browser. An inline script in
the root layout sets the attribute before the first paint, so switching costs no
flash of the wrong ground.

Three families, self-hosted at build time by `next/font`. Prose is Instrument
Sans, data is IBM Plex Mono, and the five dashboard figures are Instrument
Serif. A contact's name is a name; their MRR is a measurement; those should not
look like the same kind of thing.

**Age silt.** Every card carries a 2px left edge whose colour is a function of
how long the deal has sat in its stage: clean until halfway to the threshold,
warming from there, hot past double. A healthy column has clean-edged cards; a
column where work is piling up glows down its left side. You see the bottleneck
as texture before you read a number, and it costs no screen space. Moving a card
forward fades its edge back to nothing over 400ms.

**The chart is monochrome until you touch it.** One series, so the heading names
it and there is no legend. Bars are neutral and only the one under the cursor
takes colour: amber means "needs attention" everywhere else in this interface,
and thirty amber bars would spend that meaning on decoration.

**The sequence rule.** The sub-board's columns sit on a single hairline with a
tick under each, like a measuring rule, so nine columns read as one cadence
rather than nine boxes. Ticks with work due today are drawn warm. The rule
breaks before No Answer, which is off the track rather than the last step of it.

### One timezone, not the viewer's

Every date decision resolves in `America/New_York`, set once as `TIME_ZONE` in
`lib/dates.ts`. Two operators in different countries have to agree on what
"today", "overdue" and "this week" mean, or the same board shows them different
work.

Day and week boundaries, the due and overdue comparisons, the rolling thirty day
window, the seeded history, and every rendered date and timestamp all resolve
through that module. Day boundaries are built from `Intl` offsets rather than
millisecond arithmetic, so the two days a year the clocks move are 23 and 25
hours long rather than silently 24. `npm run check` asserts that, and the whole
suite passes identically whatever `TZ` the machine is set to.

Days-in-stage is deliberately left as elapsed duration rather than a calendar
count. It is a measure of how long something has been sitting, which is the same
number everywhere by construction.

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
