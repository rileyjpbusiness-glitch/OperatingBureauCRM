#!/usr/bin/env bash
set -euo pipefail

# Pulls a consistent copy of the live database onto this machine.
#
# The machine takes the snapshot itself with VACUUM INTO rather than this script
# copying bureau.db, because the app runs in WAL mode: at any moment some
# committed work lives in bureau.db-wal, and a copy of the main file alone would
# lose it while looking like a clean backup.
#
#   npm run backup

APP="${FLY_APP:-bureau-crm}"
DIR="${BACKUP_DIR:-backups}"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
LOCAL="${DIR}/bureau-${STAMP}.db"
REMOTE="/data/snapshot.db"

if ! command -v fly >/dev/null 2>&1; then
  echo "flyctl is not installed. See docs/DEPLOY.md." >&2
  exit 1
fi

mkdir -p "${DIR}"

echo "Snapshotting ${APP}..."
fly ssh console -a "${APP}" -C "node_modules/.bin/tsx scripts/snapshot.ts ${REMOTE}"

echo "Downloading..."
fly ssh sftp get "${REMOTE}" "${LOCAL}" -a "${APP}"

# The machine has a 1GB volume; leaving snapshots on it would eventually fill
# the disk the database itself needs.
fly ssh console -a "${APP}" -C "rm -f ${REMOTE}" || true

if [ ! -s "${LOCAL}" ]; then
  echo "Download produced an empty file; keeping nothing." >&2
  rm -f "${LOCAL}"
  exit 1
fi

echo
node_modules/.bin/tsx scripts/verify-snapshot.ts "${LOCAL}"
echo
echo "Backup complete. Restore instructions are in docs/DEPLOY.md."
