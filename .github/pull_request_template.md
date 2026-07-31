<!--
PR TITLE MUST BE A CONVENTIONAL COMMIT, e.g.:
  feat: add goal timeline markers to the alignment view
  fix: correct scorecard schedule calc for completed projects
  feat!: drop legacy /api/v1 routes          (breaking change)

Why: main only takes squash-merges, so this title becomes the commit
message on main, and semantic-release reads that commit to decide the
next release (see README.md "Versioning and releases" / release.config.js).
CI lints the title on every PR (commitlint) — a non-conventional title
fails that check before lint/test/build even run.

Allowed types: feat | fix | perf | refactor | build | ci | docs | style | test | chore | revert
Only feat/fix/perf trigger a release (minor/patch); a `!` after the type
or a `BREAKING CHANGE:` footer in this description triggers a major bump.
Everything else (chore, docs, test, ci, style, refactor, build) never cuts
a release on its own.
-->

## Summary

<!-- What does this change, and why? -->

## Type of change

- [ ] `feat` — new feature (minor release)
- [ ] `fix` — bug fix (patch release)
- [ ] `perf` — performance improvement (patch release)
- [ ] `refactor` — code change with no behavior change (no release)
- [ ] `docs` — documentation only (no release)
- [ ] `test` — tests only (no release)
- [ ] `build` / `ci` — build tooling or CI config (no release)
- [ ] `chore` — everything else (no release)
- [ ] Breaking change (major release — explain below, and mark the PR title with `!`, e.g. `feat!: ...`)

## Breaking changes

<!-- If this is a breaking change, describe what breaks and how to migrate.
     Leave blank / delete this section if not applicable. -->

## Test plan

<!-- How did you verify this? e.g. `npm run test`, `npm run lint`, manual steps in the UI -->

- [ ] `npm run lint`
- [ ] `npm run test`
- [ ]
