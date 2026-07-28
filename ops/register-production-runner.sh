#!/usr/bin/env bash
#
# Registers THIS machine as a GitHub Actions self-hosted runner labeled
# "production" for mycaravam-crypto/pm-tool2 (see DEPLOYMENT.md, issue #22).
#
# Run this ON the production host itself — it installs a system service
# that stays running and executes .github/workflows/production.yml jobs
# with access to whatever is on this machine (the live database included).
# Only run it on a host you intend to actually use as production, and never
# on a shared/CI machine that also runs other workflows.
#
# Prerequisites this script checks but does not install for you (Docker
# install steps are too distro-specific to script safely/generically —
# follow https://docs.docker.com/engine/install/ for this OS first):
#   - Docker Engine + the Compose plugin (v2.17+, for `--wait`/`--wait-timeout`)
#   - systemd (used to run the runner as a service)
#
# Usage:
#   GH_TOKEN=<a token with repo admin, e.g. from `gh auth token`> \
#     ./ops/register-production-runner.sh
#
# GH_TOKEN is only used once, to mint a short-lived runner registration
# token via the GitHub API — it is never stored on this host.
set -Eeuo pipefail

REPO="mycaravam-crypto/pm-tool2"
RUNNER_VERSION="2.323.0"
RUNNER_USER="${RUNNER_USER:-$(whoami)}"
RUNNER_HOME="${RUNNER_HOME:-/opt/actions-runner}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/chronospm}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/chronospm}"

: "${GH_TOKEN:?Set GH_TOKEN to a token with admin rights on ${REPO} (e.g. \`GH_TOKEN=\$(gh auth token)\`) — used once to mint a runner registration token, then discarded.}"

command -v docker >/dev/null || { echo "docker not found — install Docker Engine first (see script header)." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose plugin not found — install it first (see script header)." >&2; exit 1; }

case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

echo "==> Creating deployment and backup directories..."
sudo mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR"
sudo chown "$RUNNER_USER" "$DEPLOY_DIR" "$BACKUP_DIR"

if [ ! -f "$DEPLOY_DIR/docker-compose.prod.yml" ]; then
  echo "NOTE: $DEPLOY_DIR has no docker-compose.prod.yml yet."
  echo "      Copy it (and a real .env based on .env.example) there before the first deploy — see DEPLOYMENT.md."
fi

echo "==> Requesting a runner registration token..."
REG_TOKEN=$(curl -sS -X POST \
  -H "Authorization: Bearer ${GH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/actions/runners/registration-token" \
  | grep -o '"token": *"[^"]*"' | cut -d'"' -f4)

if [ -z "$REG_TOKEN" ]; then
  echo "ERROR: could not obtain a registration token — check GH_TOKEN has admin rights on ${REPO}." >&2
  exit 1
fi

echo "==> Downloading the GitHub Actions runner (v${RUNNER_VERSION}, linux-${ARCH})..."
sudo mkdir -p "$RUNNER_HOME"
sudo chown "$RUNNER_USER" "$RUNNER_HOME"
cd "$RUNNER_HOME"
curl -o actions-runner.tar.gz -L \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${ARCH}-${RUNNER_VERSION}.tar.gz"
tar xzf actions-runner.tar.gz
rm actions-runner.tar.gz

echo "==> Configuring the runner (label: production)..."
./config.sh --unattended \
  --url "https://github.com/${REPO}" \
  --token "$REG_TOKEN" \
  --name "$(hostname)-production" \
  --labels "production" \
  --work "_work"

echo "==> Installing and starting the runner as a system service..."
sudo ./svc.sh install "$RUNNER_USER"
sudo ./svc.sh start

cat <<EOF

Done. This host is now registered as a self-hosted runner labeled
"production" for ${REPO}.

Remaining steps (see DEPLOYMENT.md):
  - Make sure ${DEPLOY_DIR}/docker-compose.prod.yml and .env exist and are correct.
  - Make sure ops/setup-production-environment.sh has been run (elsewhere,
    by a repo admin with the gh CLI) so the "production" Environment,
    required reviewers, and BACKUP_DIR variable are configured.
  - Only then is .github/workflows/production.yml ready for a first real
    dispatch.
EOF
