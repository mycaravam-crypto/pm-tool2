# Deployment

Automated, controlled, and rollback-capable deployment for ChronosPM, built on
GitHub Actions, Docker Compose, and GitHub Container Registry (GHCR). This
document describes the pipeline end to end: what runs on every commit, what a
human has to approve, what happens on the production host, and how to recover
if something goes wrong.

For local development and the plain `docker compose up -d --build` workflow,
see [README.md](README.md#deployment) — this document is specifically about
the automated `main` → production pipeline.

## Pipeline overview

```text
Commit or merge to main
  → CI: lint, unit tests, client build           (.github/workflows/ci.yml)
  → Docker image built and pushed to GHCR         (.github/workflows/ci.yml)
      tags: ghcr.io/<owner>/<repo>:<commit-sha>
            ghcr.io/<owner>/<repo>:latest
  → [manual] Deploy to production is dispatched, requires environment approval
                                                   (.github/workflows/production.yml)
  → deploy.sh, on the production host:
      1. determine the currently running image (rollback target)
      2. back up the SQLite database, copy it out to the host, verify it
      3. pull the new image, resolve it to its immutable digest
      4. `docker compose up --wait` — replaces the container, waits for
         its HEALTHCHECK to pass
      5. explicit /healthz confirmation, log the deployed image
      6. on any failure from step 3 onward: redeploy the previous image
         automatically and fail the workflow run
```

`main` is never pushed to directly — see [Branch protection](#branch-protection-and-repository-settings) below. The application itself never runs `git pull`, `npm install`, or anything else against its own source on the production host; it only ever runs a container built from an image GHCR already has.

## Files in this pipeline

| File | Purpose |
|---|---|
| `.github/workflows/ci.yml` | Lint, test, build, and (on `main`) build+push the Docker image to GHCR |
| `.github/workflows/production.yml` | Manually-dispatched, environment-gated production deployment |
| `docker-compose.prod.yml` | Production Compose file — runs a published image, not a local build |
| `deploy.sh` | Backup → deploy → healthcheck → rollback, run on the production host |
| `.env.example` | Documents the environment variables `docker-compose.prod.yml` reads |
| `ops/setup-production-environment.sh` | One-time `gh`-CLI script: creates the `production` Environment, required reviewers, `BACKUP_DIR` variable, and `main` branch protection |
| `ops/register-production-runner.sh` | One-time script, run on the production host: installs and registers the self-hosted `production` runner |
| `Dockerfile` | Unchanged build logic; now also bakes in `GIT_SHA` (see `/version` below) |
| `server/index.js` | `/healthz` now does a real DB round-trip; new `/version` endpoint |
| `client/src/composables/useVersionCheck.js`, `client/src/components/UpdateBanner.vue` | Optional "new version available" banner (Section 10) |

## Repository analysis (assumptions this design relies on)

Recorded here because the task asked risks/assumptions to be documented, not invented:

- **Dockerfile**: already a 3-stage build (`build` → `assemble` → distroless
  runtime), pinned by digest, running as the distroless image's built-in
  `nonroot` (65532:65532) user. Not restructured — only `ARG`/`ENV GIT_SHA`
  added to the final stage.
- **`/healthz`**: existed already (`server/index.js`), but only proved the
  process was alive, not that it could actually serve requests (no DB
  touch). Hardened to do a cheap `SELECT 1` so a deploy-time healthcheck
  gate actually means something — see [server/index.js](server/index.js).
- **`/version`**: did not exist; added. Reports the `GIT_SHA` baked in at
  image build time.
- **SIGTERM**: already handled gracefully in `server/index.js` (drains HTTP,
  closes the WebSocket server, stops cron jobs, closes the DB, then exits) —
  this is exactly what `docker compose up` needs on a container replacement
  and required no changes.
- **SQLite location & persistence**: `server/data/chronos.db`, inside the
  `chronos-data` named Docker volume — unchanged, reused as-is by
  `docker-compose.prod.yml`.
- **Migrations**: `server/db/migrations.js` runs unconditionally and
  idempotently on every process start (see
  [Migration safety](#migration-safety-and-rollback) below for what that
  means for rollbacks).
- **`npm ci` / lint / test / build scripts**: taken verbatim from the root
  `package.json` (`lint`, `test`, `build`) — none invented. `test` runs the
  client's Vitest suite only; there are no server-side test files in this
  repo today (see [Known risks](#known-risks-and-limitations)).
- **No prior GitHub Actions workflows existed** in this repository —
  `.github/workflows/` was created from scratch by this change.
- **`server/scripts/backup.js`** already existed and does exactly what's
  needed (a live, non-locking `better-sqlite3` `.backup()` to a timestamped
  file) — reused as-is via `docker compose exec`, not modified. Its own
  comment already flagged that it "only produces a local snapshot" — this
  pipeline's `deploy.sh` addresses the "local to the volume" half of that by
  copying the result onto the host filesystem, but does **not** address the
  "still on one physical host" half — see
  [Known risks](#known-risks-and-limitations).

## Required GitHub configuration

Everything in this section is a repository/account-level setting, not code —
none of it can be done from a CI job or an automated coding session (this
repo's GitHub App connection doesn't grant that access, by design). It has
to be run once by a human with admin rights on the repo, either by hand in
the GitHub UI or via [`ops/setup-production-environment.sh`](ops/setup-production-environment.sh),
which does the whole block below in one shot using the `gh` CLI:

```bash
gh auth login   # once, as a repo admin
./ops/setup-production-environment.sh --reviewer <your-github-username>
```

### Branch protection and repository settings

Configure in **Settings → Branches** for `main`:

- Require a pull request before merging (no direct pushes).
- Require status checks to pass before merging — select the `Lint, test, build` job from `ci.yml`.
- (Recommended) Require signed commits / linear history per your team's policy.

Note: with a single repository collaborator, requiring a *review approval*
on top of the passing-checks requirement would lock that person out of
merging their own work (GitHub doesn't let a PR's author approve their own
PR) — `ops/setup-production-environment.sh` leaves the approval count at 0
for that reason. Raise it once there's more than one maintainer.

### The `production` GitHub Environment

Configure in **Settings → Environments → production**:

- **Required reviewers**: at least one person who is not the person who
  dispatched the run. This is the "manual approval" gate — `production.yml`
  cannot enforce this from the workflow file itself, GitHub enforces it
  before the job is allowed to start.
- **Deployment branches**: restrict to `main` only (belt-and-suspenders on
  top of the workflow's own `github.ref` check).
- **Environment secrets** (if you choose not to use a host-side `.env` file
  — see [Server installation](#server-installation-first-time-setup) for the alternative):
  none are strictly required by `production.yml` itself, since it
  authenticates to GHCR with the automatically-provided `GITHUB_TOKEN`.
- **Environment variables** (non-secret):
  - `BACKUP_DIR` — host path `deploy.sh` copies backups into. Defaults to
    `/var/backups/chronospm` if unset.

### The self-hosted `production` runner

`production.yml` targets `runs-on: [self-hosted, production]` — a runner you
register yourself, labeled `production`, installed on (or with direct access
to) the production Docker host. [`ops/register-production-runner.sh`](ops/register-production-runner.sh)
does this end to end (installs the runner, configures it with the
`production` label, and installs it as a system service) — run it **on the
production host itself**, not from wherever you're reading this:

```bash
GH_TOKEN=$(gh auth token) ./ops/register-production-runner.sh
```

This is a deliberate, meaningful trust boundary: anything this runner
executes has access to the production database and whatever credentials
live on that host. Concretely:

- Register it with the `production` label **and no other label** other
  workflows might target.
- It only ever runs jobs from `production.yml`, which is only ever triggered
  by `workflow_dispatch` from `main` — it never executes pull-request code.
- Keep the runner's own OS and the GitHub Actions runner software patched;
  treat it as production infrastructure, not CI infrastructure.

### GHCR image visibility

If the `ghcr.io/<owner>/<repo>` package is private (the default for a
private repository), the production host's Docker daemon needs its own
`docker login ghcr.io` once (a classic PAT with `read:packages`, or the
runner's own `GITHUB_TOKEN` context via `docker/login-action`, which
`production.yml` already does per-run) — nothing further to configure if the
runner performs that login step, which it does.

## Server installation (first-time setup)

1. Install Docker Engine and the Compose plugin (v2.17+, for `--wait`/`--wait-timeout`) on the production host — see https://docs.docker.com/engine/install/ for your distro; this isn't scripted here since the install steps are too OS-specific to do safely/generically.
2. Run [`ops/register-production-runner.sh`](ops/register-production-runner.sh) on that host (see above) — it also creates the deployment (`/opt/chronospm` by default) and backup (`/var/backups/chronospm` by default) directories.
3. Copy `docker-compose.prod.yml` into the deployment directory, plus a `.env` file (copy `.env.example`) with the real `CLIENT_ORIGIN`, `SMTP_*`, and cron settings for this deployment. **Never commit this file** — it's already covered by `.gitignore`'s `.env`/`.env.*` rules.
4. From a repo admin's machine (not the production host), run [`ops/setup-production-environment.sh`](ops/setup-production-environment.sh) — see [Required GitHub configuration](#required-github-configuration) above.
5. Trigger `production.yml` manually (Actions tab → "Deploy to production" → Run workflow) for the first deploy. `deploy.sh` will detect there's no previous container, skip the backup step (nothing to back up yet), and start the app fresh.

## Backup and restore

**Backup** happens automatically before every deploy (see `deploy.sh`
step 2) and can also be run manually at any time:

```bash
# From the deployment directory, against the running container:
docker compose -f docker-compose.prod.yml exec -T app /nodejs/bin/node server/scripts/backup.js
docker compose -f docker-compose.prod.yml cp app:<path printed above> /var/backups/chronospm/manual-$(date -u +%Y%m%dT%H%M%SZ).db
```

**Restore** (app must be stopped first — SQLite shouldn't be written to while its file is replaced):

```bash
docker compose -f docker-compose.prod.yml stop app
# Copy the chosen backup file into the volume, replacing the live database:
docker run --rm \
  -v chronospm-prod_chronos-data:/data \
  -v /var/backups/chronospm:/backups:ro \
  gcr.io/distroless/nodejs24-debian12:nonroot \
  /nodejs/bin/node -e "require('fs').copyFileSync('/backups/<chosen-backup>.db', '/data/chronos.db')"
docker compose -f docker-compose.prod.yml up --detach --wait
```

(Adjust the volume name if `COMPOSE_PROJECT_NAME` was overridden — confirm with `docker volume ls | grep chronos-data`. The distroless image is reused here purely because it already has a `node` binary and nothing else needed for a plain file copy; any image with Node works.)

**Restore verification**: periodically test this procedure against a
disposable volume/host, not just in an incident — an unverified backup is
not a backup. This isn't automated in this pipeline (see
[Known risks](#known-risks-and-limitations)).

## Rollback

**Automatic**: if `docker compose up --wait` fails to reach a healthy state,
or the explicit post-deploy `/healthz` check fails, `deploy.sh` redeploys the
previously-running image automatically and the workflow run fails — check
the run's log/summary for which image it fell back to.

**Manual**, to redeploy a specific older commit: dispatch `production.yml`
again with `image_ref` set to that commit's SHA (must already exist as a
GHCR tag — i.e., it must have gone through CI on `main` at some point).

**A container rollback is not a database rollback** — see the next section.

## Migration safety and rollback

`server/db/migrations.js` runs on every process start, unconditionally and
idempotently (each migration checks whether it's already applied). As of
this change, every migration in that file is **additive**: new columns with
defaults, new indexes, and one `CREATE TABLE ... AS SELECT` rebuild that
only *widens* a `CHECK` constraint (`widenNotificationTypeCheck`) — none
drop a column, drop a table, rename a column, or narrow a constraint. That
matters for rollback specifically because of the order of operations here:
migrations already ran (as part of the *new* version starting up) by the
time a rollback would trigger, so "rolling back the container" means running
older code against a database an older version of that code doesn't know
about. With every current migration being additive, that's safe: old code
simply doesn't read the new column/type it doesn't know about.

This is a property of today's migrations, not a guarantee this pipeline
enforces mechanically. Before merging a migration that is **not** purely
additive (a dropped/renamed column, a dropped table, a narrowed constraint,
or anything that would make an older version crash or misbehave against the
post-migration schema), it needs, at minimum:

- A verified, restorable backup taken immediately before it ships (this
  pipeline's automatic pre-deploy backup covers "immediately before," but
  the *restorable* part is still on you — see restore verification above).
- A deliberate, documented decision to accept the rollback risk: once data
  has been written under the new schema, a destructive migration makes
  rolling the container back to older code unsafe by definition.
- Preferably, a multi-step rollout: ship the additive half (e.g. a new
  column filled alongside the old one) in one deploy, let it run, and only
  drop the old column in a later deploy once nobody could plausibly need to
  roll back past the additive step.

SQLite specifically also means: **never** point two different app versions
at the same `chronos-data` volume at once. `docker-compose.prod.yml` only
ever runs one `app` container by design (no scaling/blue-green in this
setup), and `deploy.sh` replaces it in place rather than running old and new
side by side, which is what keeps this true in practice.

## Security notes (ISO 27001 framing)

- **Confidentiality**: no secrets committed (`.env`/`.env.*` are gitignored
  everywhere they matter); `production.yml` only ever uses the
  automatically-scoped `GITHUB_TOKEN` and non-secret `vars.BACKUP_DIR`;
  application secrets (SMTP credentials) live in the host's own `.env` file,
  never in a workflow log. `deploy.sh` never echoes an env var's value.
- **Integrity**: `docker-compose.prod.yml` requires an explicit `APP_IMAGE`
  (`:?` — fails rather than silently defaulting); `deploy.sh` always
  resolves it to an immutable digest before deploying; `latest` is published
  for human browsing only and is rejected outright as a `production.yml`
  input. Actions from third parties (`actions/checkout`, `docker/*`) are
  pinned to full commit SHAs, not floating tags.
- **Availability**: container-level `HEALTHCHECK` (distroless-safe, no
  shell/curl needed), `restart: unless-stopped`, automatic backup before
  every deploy, automatic rollback on a failed healthcheck, and the
  existing graceful-SIGTERM shutdown in `server/index.js`.

## Known risks and limitations

- **Backups are host-local.** `deploy.sh` gets a backup off the ephemeral
  container and its volume, but `BACKUP_DIR` is still one directory on the
  same physical/virtual production host. A host-level disaster (disk
  failure, host loss) takes the backups down with the database they're
  backing up. This pipeline doesn't implement offsite replication (no cloud
  storage credentials were available to wire up) — syncing `BACKUP_DIR`
  offsite on a schedule is a follow-up task for whoever operates the
  production host.
- **No automated restore drill.** The restore procedure above is documented
  but not exercised by CI. Recommend a periodic (e.g. monthly) manual or
  scripted restore-to-a-scratch-volume test.
- **The `production` self-hosted runner is a new, meaningful trust
  boundary.** It has real access to the production host. Anyone who can
  approve/dispatch workflow runs against it effectively has deploy access;
  scope repository write access accordingly.
- **`/healthz` is a liveness+DB-reachability check, not a full readiness
  probe** — it doesn't validate that every subsystem (SMTP, WebSocket) is
  functioning, by design (keeping it cheap enough to poll every few
  seconds during a deploy).
- **No server-side automated tests exist** in this repository today — `npm
  run test` (used by `ci.yml`) only covers the client (Vitest). The CI gate
  is exactly as strong as the test suite it runs; it was not this task's
  place to add server test coverage that wasn't asked for.
- **Pre-existing, out-of-scope gaps** noted in `README.md`'s "Notes on
  scope" (no CSRF tokens, no security headers, no expired-session cleanup)
  are unrelated to deployment and were left as-is.
- **Docker Hub image pulls could not be verified inside this task's
  sandboxed execution environment** (its network egress policy blocks
  Docker Hub's blob CDN specifically; `gcr.io` pulls worked and were used to
  confirm the distroless base image's pinned digest is still valid and
  current). The Dockerfile's build/assemble stages were not changed beyond
  the `GIT_SHA` `ARG`/`ENV` addition to the final stage, so this is a
  sandbox limitation, not a claim that the full build was never exercised —
  `ci.yml`, running on GitHub-hosted runners with normal internet access,
  will build and push the real image on the next push to `main`.

## Tests run for this change

- `npm run lint` (Biome) — pass, after fixing one pre-existing import-order
  violation in `server/index.js` unrelated to this change's own edits (it
  failed identically on the base commit before this change).
- `npm run test` (client Vitest) — 33/33 tests passed, 3 files.
- `npm run build` — client build succeeded.
- `docker compose -f docker-compose.prod.yml config` — validated
  successfully with `APP_IMAGE`/`CLIENT_ORIGIN` set; confirmed it fails
  fast with a clear error when either is unset (the `:?` guard).
- `bash -n deploy.sh` — syntax check passed.
- YAML parse of both new workflow files and `docker-compose.prod.yml` —
  passed.
- Manually confirmed the pinned `gcr.io/distroless/nodejs24-debian12:nonroot`
  digest in the `Dockerfile` still resolves and pulls (see
  [Known risks](#known-risks-and-limitations) for what could not be
  verified: the full multi-stage build against Docker Hub's `node:24-slim`).
