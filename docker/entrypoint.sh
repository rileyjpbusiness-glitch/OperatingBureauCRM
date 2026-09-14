#!/usr/bin/env bash
set -euo pipefail

# Without the tunnel token there is no way in at all, and an app listening on
# loopback with no tunnel is a machine burning money serving nobody. Fail loudly.
if [ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  echo "CLOUDFLARE_TUNNEL_TOKEN is not set. Run: fly secrets set CLOUDFLARE_TUNNEL_TOKEN=..." >&2
  exit 1
fi

mkdir -p "$(dirname "${BUREAU_DB_PATH}")"

# Migrations apply themselves when the database is opened. This adds the two
# pipelines and their stages if the volume is new, and does nothing otherwise,
# so a fresh volume comes up with a working board rather than a 404.
node_modules/.bin/tsx scripts/bootstrap.ts

# Loopback only. Fly publishes no port for this app and there is no .fly.dev
# hostname, so the tunnel below is the sole route in.
node_modules/.bin/next start -H 127.0.0.1 -p "${PORT}" &
app=$!

cloudflared --no-autoupdate tunnel run --token "${CLOUDFLARE_TUNNEL_TOKEN}" &
tunnel=$!

terminate() {
  kill -TERM "${app}" "${tunnel}" 2>/dev/null || true
  wait "${app}" "${tunnel}" 2>/dev/null || true
}
trap terminate TERM INT

# If either half dies the machine should restart rather than limp on: an app
# with no tunnel is unreachable, and a tunnel with no app serves errors.
wait -n
echo "One of the processes exited; shutting the machine down for a restart." >&2
terminate
exit 1
