# syntax=docker/dockerfile:1

# Two processes ship in this image: the Next.js server, bound to loopback, and
# cloudflared. The app is never published on a port, so the tunnel is the only
# route in and Cloudflare Access is the only way through it.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
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
