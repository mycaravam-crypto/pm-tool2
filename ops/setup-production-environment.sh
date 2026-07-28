#!/usr/bin/env bash
#
# One-time GitHub-side setup for the "production" deployment gate described
# in DEPLOYMENT.md (issue #22). Run this locally, once, by someone with
# admin rights on the repository — it can't be run by an automated session:
# it needs a real, already-authenticated `gh` CLI (`gh auth login`) with
# admin scope on the repo, which no CI/agent session has.
#
# What it does:
#   1. Creates (or updates) the "production" Environment
#   2. Restricts deployments against it to the `main` branch
#   3. Requires the reviewers passed via --reviewer to approve before a
#      production.yml run is allowed to proceed
#   4. Sets the BACKUP_DIR environment variable deploy.sh reads
#   5. Enables branch protection on `main`: PRs required, the CI job
#      required to pass before merging
#
# Usage:
#   ./ops/setup-production-environment.sh --reviewer <github-username> [--reviewer <another>] [--backup-dir /var/backups/chronospm]
#
# Requires: gh CLI (https://cli.github.com), authenticated as a repo admin.
set -Eeuo pipefail

REPO="mycaravam-crypto/pm-tool2"
BACKUP_DIR="/var/backups/chronospm"
REVIEWERS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --reviewer)
      REVIEWERS+=("$2")
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ "${#REVIEWERS[@]}" -eq 0 ]; then
  echo "Usage: $0 --reviewer <github-username> [--reviewer <another>] [--backup-dir <path>]" >&2
  echo "At least one --reviewer is required — that's who has to approve each production deploy." >&2
  exit 1
fi

command -v gh >/dev/null || { echo "gh CLI not found — install it from https://cli.github.com first." >&2; exit 1; }
gh auth status >/dev/null || { echo "Not logged in — run 'gh auth login' first, as a repo admin." >&2; exit 1; }

echo "==> Resolving reviewer user IDs..."
reviewer_json="["
sep=""
for user in "${REVIEWERS[@]}"; do
  id=$(gh api "users/$user" --jq '.id')
  reviewer_json+="${sep}{\"type\":\"User\",\"id\":${id}}"
  sep=","
done
reviewer_json+="]"

echo "==> Creating/updating the 'production' environment (reviewers: ${REVIEWERS[*]})..."
gh api --method PUT "repos/${REPO}/environments/production" --input - <<EOF
{
  "reviewers": ${reviewer_json},
  "deployment_branch_policy": {
    "protected_branches": false,
    "custom_branch_policies": true
  }
}
EOF

echo "==> Restricting production deployments to the 'main' branch..."
gh api --method POST "repos/${REPO}/environments/production/deployment-branch-policies" \
  -f name='main' >/dev/null 2>&1 || echo "    (already restricted to main, or policy exists — continuing)"

echo "==> Setting the BACKUP_DIR environment variable to '${BACKUP_DIR}'..."
gh api --method POST "repos/${REPO}/environments/production/variables" \
  -f name='BACKUP_DIR' -f "value=${BACKUP_DIR}" >/dev/null 2>&1 \
  || gh api --method PATCH "repos/${REPO}/environments/production/variables/BACKUP_DIR" \
       -f "value=${BACKUP_DIR}"

echo "==> Enabling branch protection on 'main' (PR + passing CI required)..."
# required_approving_review_count is 0 on purpose: this repo currently has a
# single collaborator, and GitHub doesn't let a PR's author approve their
# own PR — requiring >=1 approval here would lock that person out of
# merging their own work. Raise it once there's more than one maintainer.
gh api --method PUT "repos/${REPO}/branches/main/protection" --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Lint, test, build"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0
  },
  "restrictions": null
}
EOF

cat <<EOF

Done. Next steps:
  - Verify in the GitHub UI (Settings > Environments > production) that
    everything landed as expected.
  - Register the self-hosted "production" runner — see
    ops/register-production-runner.sh (run ON the production host, not here).
  - Only after both are done is .github/workflows/production.yml actually
    usable — see DEPLOYMENT.md.
EOF
