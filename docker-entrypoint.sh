#!/usr/bin/env sh
# Runs once per container start, before the app boots (see ENTRYPOINT in
# Dockerfile). Schema creation and migrations already happen automatically
# inside the app itself on every startup (server/db/connection.js runs both
# unconditionally, guarded so they're safe to re-run) — this script only
# covers what that doesn't: making sure the data directory exists on a
# brand-new volume, and optionally seeding demo data the first time the app
# ever starts against that volume.
set -e

DB_FILE="/app/server/data/chronos.db"

mkdir -p "$(dirname "$DB_FILE")"

if [ ! -f "$DB_FILE" ]; then
  echo "docker-entrypoint: no database found at $DB_FILE — first startup on this volume."
  if [ "$SEED_DEMO_DATA" = "true" ]; then
    echo "docker-entrypoint: SEED_DEMO_DATA=true, seeding demo data..."
    npm run seed -w server
  fi
fi

exec "$@"
