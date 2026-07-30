// Drives GET /version's `version` field (see server/app.js and Dockerfile's
// APP_VERSION build-arg) from git tags rather than a committed package.json
// bump: `main` requires a pull request for every change (see DEPLOYMENT.md's
// branch protection section), so a CI job pushing a version-bump commit
// straight to main would just be rejected. Tag pushes aren't subject to that
// rule, so semantic-release only ever creates a tag + GitHub Release here —
// no @semantic-release/git, no @semantic-release/npm.
module.exports = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/github',
      // Keep the release job's permissions to contents:write only — these
      // features need issues:write/pull-requests:write, which it doesn't have.
      { successComment: false, failComment: false, failTitle: false, labels: false },
    ],
  ],
};
