# Deploying Bureau CRM to privatecrm.operatingbureau.com

The shape of it: a single Fly machine runs the Next.js server bound to
`127.0.0.1` and `cloudflared` beside it. No Fly port is published and no
`.fly.dev` hostname exists, so the tunnel is the only route to the app and
Cloudflare Access is the only way through the tunnel.

The application itself has no authentication and never will under this design.
That is the point: auth lives at the edge, so there is no login screen, no users
table and no session handling to get wrong. It also means **the Access policy is
the only thing between the internet and full control of the CRM.** Keep it to
two addresses and do not add a bypass or service-token policy.

Everything below has to be run by you: it needs a Cloudflare login, a Fly login,
or both. Each step says which.

---

## 1. Cloudflare: create the tunnel *(needs your Cloudflare login)*

Zero Trust dashboard, `one.dash.cloudflare.com`. If you have never used Zero
Trust on this account it will ask you to pick a team name once; any name is fine.

1. **Networks → Tunnels → Create a tunnel → Cloudflared.**
2. Name it `bureau-crm`. Save.
3. The next screen offers install commands. **Do not run them.** Copy the token
   only: the long string after `--token` in the command. That is what the Fly
   machine will use.
4. Leave the tunnel page. It will read *Inactive* until the machine connects in
   step 6, which is expected.

## 2. Cloudflare: point the hostname at the app *(needs your Cloudflare login)*

Still on the tunnel, open the **Public Hostname** tab → **Add a public hostname**:

| Field | Value |
| --- | --- |
| Subdomain | `privatecrm` |
| Domain | `operatingbureau.com` |
| Type | `HTTP` |
| URL | `127.0.0.1:3000` |

Save. This writes the DNS record for you; there is no A or CNAME to add by hand.

`HTTP` rather than `HTTPS` is correct. The hop is inside the machine, from
cloudflared to a loopback port. Everything from the browser to Cloudflare is
still TLS.

## 3. Cloudflare: lock it to two people *(needs your Cloudflare login)*

**Access → Applications → Add an application → Self-hosted.**

1. Application name: `Bureau CRM`.
2. Session Duration: **30 days**.
3. Public hostname: subdomain `privatecrm`, domain `operatingbureau.com`.
4. Next, then add a policy:
   - Policy name: `Operators`
   - Action: **Allow**
   - Include → selector **Emails** → add your address, then Kavi's, as two
     separate entries.

   Emails, not *Emails ending in*. A domain rule would let anyone who ever gets
   an `@operatingbureau.com` address straight in.
5. Next, to login methods: enable **One-time PIN** and turn everything else off.
   No OAuth app to register, no Google dependency. Signing in is: enter your
   email, get a code, paste the code.
6. Save.

## 4. Fly: create the app and its disk *(needs your Fly login)*

```bash
brew install flyctl          # or: curl -L https://fly.io/install.sh | sh
fly auth login               # opens a browser

cd ~/Developer/OperatingBureauCRM
git pull

fly apps create bureau-crm
```

If that name is taken, pick another and change the `app = ` line at the top of
`fly.toml` to match.

```bash
fly volumes create bureau_data --region ewr --size 1 --yes
```

The volume holds `bureau.db`. It must be in the same region as the machine,
which `fly.toml` pins to `ewr` (Newark). 1GB is far more than this will ever
need.

## 5. Fly: hand over the tunnel token *(needs your Fly login)*

```bash
fly secrets set CLOUDFLARE_TUNNEL_TOKEN="paste-the-token-from-step-1"
```

Quote it. The token contains characters your shell would otherwise interpret.

## 6. Fly: deploy *(needs your Fly login)*

If you have touched the Dockerfile, `.dockerignore`, or the set of files the
image needs, run this first. It resolves every COPY source rather than reading
the file, and it is faster to run than a failed build is to watch:

```bash
npm run check:dockerfile
```

Then:

```bash
fly deploy
```

First build takes a few minutes. Watch it come up:

```bash
fly logs
```

You are looking for, in order:

- `Created Outbound with 8 stages.` and `Created Client Delivery with 4 stages.`
  on a fresh volume, or `Pipelines already present` on later deploys
- `Ready in ...` from Next
- `Registered tunnel connection` from cloudflared

The tunnel in the Cloudflare dashboard flips to **Healthy** at that point.

## 7. Confirm the origin really is unreachable *(needs your Fly login)*

```bash
fly ips list
```

**This should print nothing.** If any address is listed, release it:

```bash
fly ips release <address>
```

An allocated IP means Fly is publishing the machine, and a reachable origin
makes Access decoration. Worth re-checking after any `fly launch`, which likes
to add a service block and an IP.

## 8. Open it

<https://privatecrm.operatingbureau.com>

You should get Cloudflare's one-time PIN screen, not the app. Enter your email,
paste the code, and the board loads. Kavi does the same with his address.

The board will be empty, which is correct: the deploy creates the pipelines and
their stages but no contacts or deals. Add a lead with the `+ Lead` button, or
press `n`.

---

## Afterwards

**Shipping a change.** Push to the branch, then `fly deploy`. Migrations apply
themselves when the machine boots, and the bootstrap is a no-op once the
pipelines exist. There are a few seconds of downtime per deploy because one
machine holds the volume; see the note in `fly.toml`.

**Loading the demo data to look around.** This *wipes everything* first:

```bash
fly ssh console -C "npm run seed"
```

**Reading the numbers without a browser.**

```bash
fly ssh console -C "npm run db:inspect"
```

**Backups.** Fly snapshots volumes daily and keeps them five days. To pull the
database down:

```bash
fly ssh sftp get /data/bureau.db ./bureau-backup.db
```

Worth doing before anything destructive. Five days of automatic snapshots is
thin cover for the only copy of your pipeline.

**Never run two machines.** SQLite has one writer. `fly scale count 1` if you
ever find more than one.

## Things that will bite

**A build fails at a COPY with "not found".** Run `npm run check:dockerfile`.
It checks context paths against `git ls-files` rather than the filesystem,
which is the case that bites: an empty directory exists on your machine, git
cannot track an empty directory, so it is absent from every fresh clone and the
COPY fails only in the build. The check also resolves each `--from=<stage>`
source back to the instruction in that stage that creates it, so a dropped or
reordered instruction shows up as a failing row.

**A mutation fails with "Invalid Server Actions request".** The public hostname
is listed in `next.config.ts` under `serverActions.allowedOrigins`. If the
hostname ever changes, change it there too and redeploy.

**A save fails silently after a long idle.** The Access session is 30 days; when
it expires mid-use, the browser has a page open but the next save gets bounced
to the login screen instead of the app. Reload the page, sign in again, redo the
action. This is the cost of having no auth inside the app, and it is a fair
trade at two users.

**Kavi says he never gets a code.** Check the allowlist for a typo in his
address before you look at his spam folder. By design Access shows the same "A
code has been emailed to you" screen whether or not the address is allowed, and
sends nothing to an address that is not, so a mistyped entry looks exactly like
a mail delivery problem. The codes also expire ten minutes after they are
requested, and some corporate mail scanners burn a code by following the link
first; "This One-Time PIN has already been used" means that happened, and
requesting a new one works.

**The site 502s.** Usually the machine restarted and cloudflared has not
reconnected yet. `fly logs` will say. The entrypoint deliberately kills the
machine if either the app or the tunnel dies, rather than leaving a half-running
instance, so Fly restarts it clean.
