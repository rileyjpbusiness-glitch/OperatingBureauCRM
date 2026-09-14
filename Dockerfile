# syntax=docker/dockerfile:1

# Two processes ship in this image: the Next.js server, bound to loopback, and
# cloudflared. The app is never published on a port, so the tunnel is the only
# route in and Cloudflare Access is the only way through it.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
WORKDIR /app
# npm runs an implicit `node-gyp rebuild` for any dependency that ships a
# binding.gyp, and better-sqlite3 ships one. On this platform it compiles
# nothing: its binding.gyp asks whether the package already carries a prebuilt
# binary for the host and resolves both targets to `type: none` when it does.
# node-gyp still needs Python to run the gyp generator before it can reach that
# conclusion, which is why the failure is "Could not find any Python
# installation to use" rather than a compiler error. python3 is the fix for
# that; make and g++ are here so the build still works in the other branch,
# where gyp does have to compile for real because no prebuild matches the host.
# This stage is discarded, so none of it reaches the shipped image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
# Dev dependencies are kept: the runtime image needs tsx so that bootstrap,
# seed and the database inspectors can be run over `fly ssh console`.
RUN npm ci

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build typechecks and lints, so a broken commit never reaches the machine.
RUN npm run build

FROM base AS runtime
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && ARCH="$(dpkg --print-architecture)" \
 && curl -fsSL -o /usr/local/bin/cloudflared \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}" \
 && chmod +x /usr/local/bin/cloudflared \
 && cloudflared --version \
 && apt-get purge -y --auto-remove curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules

# The native binding has to survive two copies, deps to build to runtime, and
# then load against this stage's node and glibc. It does, and this proves it
# rather than assuming it: a failure here costs one build, the same failure
# found after deploying costs a machine that crash-loops on boot. It also
# covers the apt purge above, which runs with --auto-remove.
RUN node -e "\
const Database = require('better-sqlite3'); \
const db = new Database(':memory:'); \
db.exec('create table t (x integer)'); \
db.prepare('insert into t values (?)').run(1); \
if (db.prepare('select x from t').get().x !== 1) throw new Error('better-sqlite3 returned the wrong row'); \
db.close(); \
const native = Object.keys(require.cache).filter((f) => f.endsWith('.node')); \
if (native.length !== 1) throw new Error('expected one native binding, loaded: ' + JSON.stringify(native)); \
console.log('better-sqlite3 ok on ' + process.version + ', ' + process.platform + '-' + process.arch); \
console.log('native binding: ' + native[0]); \
"

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production \
    PORT=3000 \
    BUREAU_DB_PATH=/data/bureau.db

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
