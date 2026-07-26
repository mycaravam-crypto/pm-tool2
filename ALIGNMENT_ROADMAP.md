# Goal & Scope Alignment Roadmap

Tracking doc for an initiative to close a gap identified in a conceptual review of ChronosPM: the tool has no mechanism for keeping a PM aligned with a project's stated *goals*, even though goals/requirements exist in the schema. If you're picking this up in a fresh session, **read this file first** — it's the single source of truth for what's done, what's next, and why specific choices were made.

Branch: `feature/goal-alignment`

## Motivation

- `goals` and `requirements` (`server/db/schema.sql`) are flat project-scoped checklists with no link to each other or to anything else — no traceability from a goal down to the work meant to serve it.
- The app's documented philosophy (`PLAN.md` §3) is the PM iron triangle — **scope, time, cost, quality** — but the RAG scorecard (`server/utils/scorecard.js`) only ever covered three of the four (Schedule/Cost/Quality). Scope has never had a health signal.
- Goal drift has no detection: milestones/deadlines get an amber timeline nudge + digest notification when overdue; goals with a `target_date` get neither.
- `server/db/seed.js` seeds zero goals/requirements rows — the feature is invisible in demo data today.

Full analysis lives in the conversation that started this; this doc carries forward only what's needed to keep building without re-deriving it.

## Decisions log

- 4th scorecard dot is named **"Scope"** (not "Alignment"/"Goals") — completes the existing scope/time/cost/quality framing already documented, rather than inventing new vocabulary.
- Goal-overdue notifications reuse the existing `deadline_digest` notification type + `notify_upcoming_deadlines` toggle — **no** `notifications.type` CHECK-constraint migration. Same "reuse the shape" pattern already used for `pain_points.kind` (risk vs. issue).
- `requirements.goal_id` is nullable, `ON DELETE SET NULL` — losing a goal shouldn't delete requirement history (mirrors `decided_by`/`owner_id`/`assignee_id`).
- No new API endpoints needed: `requirements` create/update already forward an arbitrary body object end-to-end, so `goal_id` slots in with zero route-plumbing changes in `api.js`/`useProjectStore.js`.
- Amber Scope state is *not* represented in seed data (only 2 seed projects, both have a cleaner red/green story already) — verify amber manually by editing a goal's target date in the running app.

## Phase 1 — Goal traceability + Scope health signal (done, uncommitted on `feature/goal-alignment`)

- [x] Schema: `requirements.goal_id` column + index (`schema.sql`, `migrations.js`)
- [x] `server/routes/requirements.js`: accept + same-project-validate `goal_id` on POST/PUT
- [x] `server/utils/scorecard.js`: add `scope` dimension (red/amber/green/n/a from goals' target_date/achieved)
- [x] `server/utils/digest.js`: overdue/upcoming goal notifications (reusing `deadline_digest`)
- [x] `server/routes/dashboard.js`: `at_risk_goals` count in `/api/dashboard/summary`
- [x] `client/src/components/ScorecardDots.vue`: render the Scope dot
- [x] `client/src/lib/goalProgress.js`: shared `goalProgress(goalId, requirements)` helper
- [x] `client/src/components/ProjectFormModal.vue`: goal picker on requirements (add + per-row), goal progress readout
- [x] `client/src/components/AggregatedTabs.vue`: "Linked" column on Goals tab; `goals` branch in the focus-watch handler
- [x] `client/src/stores/useProjectStore.js`: `at_risk_goals: 0` in summary defaults
- [x] `client/src/components/HealthSummary.vue` + `App.vue`: at-risk-goals stat + drill-through
- [x] `server/db/seed.js`: goals/requirements for `website` (green demo) and `campaign` (red demo)
- [x] `PLAN.md` §11 + `README.md`: documented
- [x] Verification pass: `npm run lint` clean; API-level checks (scorecard colors, cross-project `goal_id` rejected with 400, dashboard `at_risk_goals`, digest producing a goal notification) all passed against a throwaway server instance; UI walked end-to-end with Playwright (4-dot scorecard, requirement→goal picker, "X/Y reqs" progress, health-strip stat) — screenshots matched expectations, no regressions in console errors beyond a pre-existing/benign 401 on the unauthenticated `GET /api/auth/me` check at app boot.

**Resume here:** Phase 1 is functionally complete and verified but was sitting uncommitted on `feature/goal-alignment` as of 2026-07-26 — check `git log feature/goal-alignment` / `git status` first to see whether it's since been committed. If still uncommitted, review the diff and commit it, then move on to Phase 2 below.

## Phase 2 — backlog (not started, no code yet)

- **Goals on the timeline.** Render goals with a `target_date` as a distinct marker type/lens on the Timeline (currently only events/milestones/deadlines appear there) — makes a goal's horizon visible against the actual events leading up to it, instead of living only in the Edit Project modal.
- **Scope-creep signal.** Surface requirements with `goal_id IS NULL` (added but not tied to any stated outcome) as a distinct filter/count, and/or requirements added after a project's `original_target_end_date` was set — a lightweight scope-creep detector using data Phase 1 already captures.
- **Portfolio-wide goals view.** Elevate the Goals aggregated tab with an "at-risk across portfolio" filter, similar in spirit to Pain Points' risk/issue filter — for a PM watching several projects at once.

## Phase 3 — ideas parked, not scoped yet

- Weighting goal progress by requirement count/complexity rather than a flat linked-count ratio, if flat counting proves misleading in practice.
- Extending the same traceability pattern (`goal_id`) to decisions, if "which decisions served this goal" turns out to matter as much as "which requirements did."
