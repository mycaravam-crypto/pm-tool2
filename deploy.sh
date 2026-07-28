#!/usr/bin/env bash
#
# Deploys a published ChronosPM image to this host: determines the currently
# running image (rollback target), backs up the database, pulls and switches
# to the new image, waits for it to report healthy, and rolls back
# automatically if it doesn't. Meant to be run by
# .github/workflows/production.yml on the dedicated production runner, but
# is a plain shell script an operator can also run by hand from the
# deployment directory (where docker-compose.prod.yml and its `.env` live).
#
# Required env vars:
#   APP_IMAGE   Image reference to deploy, e.g. ghcr.io/<owner>/<repo>:<sha>.
#               Resolved to its immutable digest below before anything is
#               actually deployed — see docker-compose.prod.yml.
#   BACKUP_DIR  Host directory (outside any container or Docker volume) that
#               pre-deploy database backups are copied into. Created if
#               missing. This is *not* an offsite backup by itself — see
#               DEPLOYMENT.md's backup/restore section.
#
# Optional env vars:
#   COMPOSE_FILE          Defaults to docker-compose.prod.yml.
#   COMPOSE_PROJECT_NAME  Defaults to chronospm-prod. Fixes the Compose
#                         project identity (and therefore the data volume's
#                         name) regardless of which directory this runs from.
#   WAIT_TIMEOUT          Seconds `docker compose up --wait` waits for the
#                         container's HEALTHCHECK before giving up. Default 120.
#
# Application runtime config (CLIENT_ORIGIN, SMTP_*, CRON_SCHEDULE, ...) is
# read by docker-compose.prod.yml from the environment/`.env` file next to it
# the normal Compose way — this script doesn't touch it, and never logs it.
set -Eeuo pipefail

export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-chronospm-prod}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-120}"

: "${APP_IMAGE:?APP_IMAGE must be set, e.g. ghcr.io/<owner>/<repo>:<commit-sha>}"
: "${BACKUP_DIR:?BACKUP_DIR must be set to a host directory for pre-deploy backups}"

if [[ "$APP_IMAGE" == *:latest ]]; then
  echo "[deploy] WARNING: deploying the mutable ':latest' tag — a commit SHA or digest is strongly preferred (see DEPLOYMENT.md)." >&2
fi

log() { printf '[deploy] %s\n' "$*"; }

mkdir -p "$BACKUP_DIR"

# --- 1. Current image (rollback target) -------------------------------------
previous_image=""
if container_id=$(docker compose ps -q app 2>/dev/null) && [ -n "$container_id" ]; then
  previous_image=$(docker inspect --format='{{.Config.Image}}' "$container_id")
  log "Currently running: $previous_image"
else
  log "No running 'app' container found — first deployment on this host, nothing to roll back to."
fi

# --- 2. Backup ---------------------------------------------------------------
# Only meaningful if there's an existing container/database to back up (a
# brand-new volume has none yet). A failed backup must stop the deploy
# outright: shipping a new version on top of an unbacked-up database is
# exactly what this whole pipeline exists to avoid.
if [ -n "$previous_image" ]; then
  log "Backing up database before deploying..."
  # server/scripts/backup.js (see that file) uses better-sqlite3's own
  # .backup() — safe against a database that's live and being written to.
  # Run via `node` directly, not `npm run backup`: the distroless runtime
  # image has no npm (or shell) at all, only the Node binary and the app.
  backup_output=$(docker compose exec -T app /nodejs/bin/node server/scripts/backup.js)
  echo "$backup_output"
  in_container_backup=$(printf '%s\n' "$backup_output" | sed -n 's/^Backed up to //p' | tail -n1)
  if [ -z "$in_container_backup" ]; then
    log "ERROR: could not determine the backup file path from backup.js's output — aborting deploy."
    exit 1
  fi

  # Copied out of the container (and out of the named volume it ran against)
  # onto the host filesystem — a container replacement or a lost volume no
  # longer takes the backup down with it. This is still a single host-local
  # copy, not a disaster-recovery plan: sync $BACKUP_DIR offsite on whatever
  # schedule/storage your environment provides (see DEPLOYMENT.md).
  host_backup_path="$BACKUP_DIR/chronospm-$(date -u +%Y%m%dT%H%M%SZ).db"
  docker compose cp "app:$in_container_backup" "$host_backup_path"

  if [ ! -s "$host_backup_path" ]; then
    log "ERROR: backup copy at $host_backup_path is missing or empty — aborting deploy."
    exit 1
  fi
  log "Backup verified at $host_backup_path ($(stat -c%s "$host_backup_path") bytes)."

  # The in-container copy is now redundant with the verified host copy above
  # — remove it so timestamped backups don't quietly grow the data volume
  # forever. No `rm` in the distroless image either, so this goes through
  # Node's fs module, same as the healthcheck does for `fetch`.
  docker compose exec -T app /nodejs/bin/node -e "require('fs').unlinkSync(process.argv[1])" "$in_container_backup" \
    || log "WARNING: could not remove in-container backup copy at $in_container_backup (non-fatal, continuing)."
else
  log "Skipping backup: no existing database to back up."
fi

# --- 3. Pull the new image and resolve it to an immutable digest -----------
log "Pulling $APP_IMAGE..."
docker pull "$APP_IMAGE"
resolved_image=$(docker inspect --format='{{index .RepoDigests 0}}' "$APP_IMAGE")
log "Resolved $APP_IMAGE -> $resolved_image"
export APP_IMAGE="$resolved_image"

# --- 4. Replace the container and wait for it to become healthy ------------
# Everything from here on touches the running container, so only failures
# from this point trigger a rollback — a failure above (bad backup, missing
# env var) leaves the previous container untouched, and there is nothing to
# roll back from.
deploy_attempted=false
rollback() {
  if [ "$deploy_attempted" != true ]; then
    return
  fi
  if [ -z "$previous_image" ]; then
    log "ERROR: deploy failed and there is no previous image to roll back to — manual intervention required."
    return
  fi
  log "Deploy failed — rolling back to $previous_image"
  if APP_IMAGE="$previous_image" docker compose up --detach --wait --wait-timeout "$WAIT_TIMEOUT" --remove-orphans; then
    log "Rollback to $previous_image succeeded."
  else
    log "ERROR: rollback to $previous_image also failed — manual intervention required."
  fi
}
trap rollback ERR

log "Deploying $APP_IMAGE..."
deploy_attempted=true
docker compose up --detach --wait --wait-timeout "$WAIT_TIMEOUT" --remove-orphans

# `--wait` above already gates on the container's own HEALTHCHECK (see
# docker-compose.prod.yml); this repeats the same request explicitly so the
# deploy log states in plain terms that /healthz was actually reached, not
# just that Compose considers the container "healthy".
docker compose exec -T app /nodejs/bin/node -e \
  "fetch('http://127.0.0.1:3001/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

trap - ERR

log "Deployment successful."
log "Image: $APP_IMAGE"
