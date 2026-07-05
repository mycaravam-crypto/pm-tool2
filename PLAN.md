# ChronosPM Multi-Project — Project Plan

## 1. Overview

ChronosPM is a timeline-first project management tool for people who run more than one project at once. Instead of flipping between separate boards per project, the main view is a single chronological timeline where you can overlay events from several projects at the same time — so a PM covering three initiatives can see at a glance where kickoffs, reviews, and deadlines across all of them land relative to each other and to today.

This document is our working plan for the app: what it does, how it's structured, and the order we intend to build and ship it in. It's a living reference for the team, not a locked spec — sections will get updated as decisions change during the build.

**Who it's for:** a PM (or a small team of them) juggling 2+ concurrent projects who wants one place to see schedule health, budget health, open risks, and who's accountable for what — without adopting a heavyweight enterprise PM suite.

## 2. Goals & Non-Goals

**Goals**
- One overlay timeline across multiple projects, not a per-project silo
- Real (if simplified) tracking of the four things that actually define a project: scope, time, cost, quality
- Clear single-owner accountability per project
- Enough process around decisions, action items, and pain points that they're actionable, not just a notes field
- Basic login and a two-tier permission model, since this will hold real project data
- Lightweight notifications so people who aren't in the tool daily still find out when something changes

**Non-goals** — things we're deliberately not building, to keep this shippable:
- A formal Work Breakdown Structure or task hierarchy
- Earned Value Management (EV/PV/AC/CPI/SPI) — full cost/schedule performance indices are overkill here
- Per-task RACI assignment — we use a simpler project-level role instead (see below)
- Multi-currency budgeting or a line-item cost ledger — budget is a single planned-vs-actual number, not a transaction log
- SMS delivery — email is wired up (Section 9); SMS stays a documented future seam, not built
- SSO — email/password login is enough for the team size we're building for
- A full custom permission matrix — the finer permission tier (Section 6.H) reuses the existing project-level role instead of inventing configurable per-action grants

We can revisit any of these once the core tool proves useful — they're deferred, not rejected.

## 3. How This Maps to Standard PM Practice

We didn't want to invent our own vocabulary, so the app is built around the classic project triangle — **scope, time, cost, quality** — plus a single accountable owner and a small team with differentiated roles:

| PM concept | Represented as |
|---|---|
| Scope | The project description, plus the Decisions log (a record of what was actually agreed to build) |
| Time | Start date / target end date / actual end date, plus milestone and deadline events on the timeline |
| Cost | Planned budget vs. spent budget |
| Quality | Pain Points, each with a severity and a resolution state |
| People / roles | Each project's team, with a project-level role: `lead` / `sponsor` / `member` / `stakeholder` |
| Single accountable owner | Exactly one `lead` per project — the person accountable for schedule, budget, and quality outcomes, i.e. the PM |

**Role mapping** (a simplified RACI, not a full one): `lead` = Accountable (owns schedule/budget/quality), `member` = Responsible (does the work), `sponsor` = the business owner who authorized the project (roughly Consulted), `stakeholder` = Informed. This project-level role is separate from a person's actual job title (e.g. "UX Designer") — what you do for a living and what you're accountable for on a given project are different things.

## 4. Tech Stack & Architecture

- **Frontend:** Vue 3 (Composition API, `<script setup>`), Tailwind CSS, Lucide icons, Pinia for state. No router — this is a single page; the Stakeholder Directory is a modal and the aggregated dashboards are an in-page tab switcher, not separate routes.
- **Backend:** Node.js + Express.
- **Database:** SQLite via `better-sqlite3` — its synchronous API keeps the nested-write endpoints (an event plus its decisions/action items/pain points in one go) simple to reason about without an ORM.
- **Layout:** a monorepo with two workspaces — `/server` (API, port 3001) and `/client` (Vite + Vue SPA, port 5173, dev server proxies `/api/*` to the server).

This is a deliberately small stack for a small team to move fast in — no microservices, no separate auth provider, no message queue. If usage outgrows SQLite or the app needs to scale past a single server process, that's a good problem to revisit later, not something to design around up front.

## 5. Data Model

The schema follows directly from Section 3: projects, the people on them, the events that happen on them, and the three actionable record types (decisions, action items, pain points) that hang off events. A separate `members`/`sessions` layer handles login and notification preferences — kept apart from `stakeholders` because being a login/notification subscriber and being a person actively doing project work are genuinely different relationships (more on that in Section 6.F).

Key modeling decisions worth calling out:
- **Every project has exactly one lead**, enforced by a partial unique index — the schema itself won't allow a project to end up with zero or two.
- **Stakeholders are people referenced by events** (decision-makers, assignees, pain-point owners); they don't necessarily have login access. **Members** are the ones who can log in and/or subscribe to notifications. A member can optionally link to a stakeholder identity — that's what lets "assigned to you" notifications work — but doesn't have to.
- **Foreign keys cascade sensibly:** deleting a project cascades to its events, decisions, action items, and pain points. Deleting a stakeholder nulls out their references (`decided_by`, `owner_id`, `assignee_id`) rather than deleting the records they're attached to — losing a person shouldn't erase project history.

<details>
<summary>Reference: full SQLite schema</summary>

```sql
-- 1. Stakeholders — people referenced by project events (not necessarily login users)
CREATE TABLE stakeholders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    role TEXT, -- free-text job title, e.g. "UX Designer" — distinct from project_role below
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Projects
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT, -- Scope
    color_hex TEXT NOT NULL DEFAULT '#3B82F6', -- identifies this project on the overlay timeline
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','completed')),
    start_date TEXT, -- YYYY-MM-DD
    target_end_date TEXT, -- YYYY-MM-DD — the Time constraint
    original_target_end_date TEXT, -- snapshotted once at creation, never touched again — makes
        -- schedule slip (current vs. originally planned) visible (Section 10)
    actual_end_date TEXT, -- set when status flips to 'completed'; null while active
    budget_planned REAL, -- the Cost constraint; single implicit currency
    budget_spent REAL NOT NULL DEFAULT 0, -- a running total, not a line-item ledger
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Project-Stakeholder Association — who's on the team, and in what capacity
CREATE TABLE project_stakeholders (
    project_id INTEGER NOT NULL,
    stakeholder_id INTEGER NOT NULL,
    project_role TEXT NOT NULL DEFAULT 'member' CHECK(project_role IN ('lead','sponsor','member','stakeholder')),
    PRIMARY KEY (project_id, stakeholder_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (stakeholder_id) REFERENCES stakeholders(id) ON DELETE CASCADE
);
-- Guarantees a single accountable owner: at most one lead per project.
CREATE UNIQUE INDEX idx_one_lead_per_project ON project_stakeholders(project_id) WHERE project_role = 'lead';

-- 4. Events — the entries that appear on the timeline
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    type TEXT NOT NULL CHECK(type IN ('kickoff','sync','workshop','review','decision','retro','milestone','deadline')),
    summary TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','achieved','missed')), -- meaningful only for milestone/deadline
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX idx_events_project_id ON events(project_id);
CREATE INDEX idx_events_date ON events(date);

-- 5. Event Participants
CREATE TABLE event_participants (
    event_id INTEGER NOT NULL,
    stakeholder_id INTEGER NOT NULL,
    PRIMARY KEY (event_id, stakeholder_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (stakeholder_id) REFERENCES stakeholders(id) ON DELETE CASCADE
);

-- 6. Decisions — what got agreed, and who's accountable for the call
CREATE TABLE decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    decided_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (decided_by) REFERENCES stakeholders(id) ON DELETE SET NULL
);
CREATE INDEX idx_decisions_event_id ON decisions(event_id);

-- 7. Action Items
CREATE TABLE action_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    assignee_id INTEGER,
    done INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES stakeholders(id) ON DELETE SET NULL
);
CREATE INDEX idx_action_items_event_id ON action_items(event_id);
CREATE INDEX idx_action_items_assignee_id ON action_items(assignee_id);

-- 8. Pain Points — the Quality signal
CREATE TABLE pain_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('Low', 'Medium', 'High')),
    kind TEXT NOT NULL DEFAULT 'issue' CHECK(kind IN ('issue', 'risk')), -- issue: already
        -- happened; risk: might happen — same shape, just a forward-looking lens (Section 10)
    owner_id INTEGER,
    resolved INTEGER NOT NULL DEFAULT 0,
    resolved_at TEXT, -- set when resolved flips to true, cleared if flipped back
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES stakeholders(id) ON DELETE SET NULL
);
CREATE INDEX idx_pain_points_event_id ON pain_points(event_id);
CREATE INDEX idx_pain_points_owner_id ON pain_points(owner_id);

-- 9. Members — login + notification subscribers, separate from Stakeholders
-- (a member is a notification subscriber first, a login account only once
-- someone sets a password for them; stakeholder_id optionally links the two)
CREATE TABLE members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    stakeholder_id INTEGER,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
    notify_assigned INTEGER NOT NULL DEFAULT 1,
    notify_overdue_action_items INTEGER NOT NULL DEFAULT 1,
    notify_upcoming_deadlines INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (stakeholder_id) REFERENCES stakeholders(id) ON DELETE SET NULL
);
CREATE INDEX idx_members_stakeholder_id ON members(stakeholder_id);

-- 9b. Sessions — backs the login cookie
CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    member_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_member_id ON sessions(member_id);

-- 10. Member-Project Subscriptions — digest scope, independent of team membership
CREATE TABLE member_projects (
    member_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    PRIMARY KEY (member_id, project_id),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 11. Notifications — stub outbox until a real email provider is wired in
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('assigned','overdue_digest','deadline_digest')),
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX idx_notifications_member_id ON notifications(member_id);
```

</details>

## 6. Feature Walkthrough

### A. Sidebar
A checklist of active projects, each showing its color, name, lead's initials, and RAG scorecard dots (Section 6.E). Checking projects overlays their events on the timeline; unchecking clears them. A "show archived/completed" toggle keeps the list usable once project history piles up — archiving is just a status change, never a delete.

Creating a project requires picking a Lead up front — you cannot create a project without one. Everyone else (sponsor, additional members, other stakeholders) gets added afterward from the project's own team list.

A small persistent badge in the header always shows portfolio-wide health — overdue action items and open high-severity pain points across every active project — regardless of what's currently selected in the sidebar, so you get a signal even before choosing anything.

### B. The Overlay Timeline
The core view: a horizontal chronological track split into Past / Present / Future, with "today" computed from the browser's local date.

Each event renders as a bubble with an icon and a border in its project's color, so on a shared timeline you can always tell which project an event belongs to:

| type | icon | shape |
|---|---|---|
| kickoff | Rocket | circle |
| sync | Refresh | circle |
| workshop | Users | circle |
| review | Clipboard check | circle |
| decision | Git branch | circle |
| retro | History | circle |
| milestone | Flag | diamond |
| deadline | Alarm clock | diamond |

Milestones and deadlines are forward-looking markers rather than meeting records — a milestone marks a target ("design freeze"), a deadline marks a hard external date. Both render as diamonds so the "history vs. plan" distinction reads at a glance. They carry a status — pending, achieved, or missed — which drives the bubble's fill and icon independently of its border (border always stays the project color; fill/icon communicate whether it was hit). A past-dated item nobody has marked either way shows up in amber as a nudge that it needs attention.

Events that land close together — even a few days apart, once compressed into pixels — cluster and stack vertically as their own clickable bubbles rather than hiding behind a picker popup. Zoom controls change the pixel-per-day density, which both spreads out cramped clusters and lets you focus on a narrower window; a reset control snaps back to 100% and re-centers on today.

Clicking a bubble opens its detail view: project + lead context, editable title/date/type/summary, a participants list (scoped to that project's team), and three actionable sub-lists — Action Items (with assignee and due date, overdue ones flagged), Decisions (with a "decided by" owner), and Pain Points (with severity and an owner). Every open item has someone accountable for it — that's what makes these lists worth having instead of a plain notes field.

Deleting a project or event cascades to everything nested under it, so both actions get a confirmation dialog that names what's about to disappear (e.g. "this will also delete 12 events").

### C. Aggregated Views
Three cross-project tabs, scoped to whatever's currently selected in the sidebar:
- **Action Items** — task, assignee, project, due date; overdue ones highlighted; filterable by "my tasks" or by project.
- **Pain Points** — grouped by severity, with owner and project context; filterable by risk vs. issue (Section 10).
- **Decisions** — a chronological log of what's been agreed, with the originating event, project, and decision-maker.

### D. Health Summary
A strip above the timeline, recomputed whenever the selection changes: overdue action items, open high-severity pain points, and milestones/deadlines coming up in the next 14 days. This exists because a raw timeline and three list tabs tell you what happened, not whether things are okay — this strip is the "is this okay" answer. The portfolio badge in the sidebar reuses the same three numbers, just computed across everything active rather than just the current selection.

### E. Project Scorecard (RAG status)
Three traffic-light dots per project — Schedule, Cost, Quality — the exact three things the lead is accountable for. Computed on the fly, not stored:
- **Schedule** — red if the target date has passed and the project isn't marked complete; amber if it's within 14 days; green otherwise.
- **Cost** — red if spend has exceeded the plan; amber at 90%+ of plan; green otherwise.
- **Quality** — red at 3+ open high-severity pain points, amber at 1–2, green at 0.

Deliberately a rough heuristic, not a formal earned-value calculation — good enough to flag "look here," not precise enough to defend in a budget review.

### F. Members & Notifications
Closes the loop between "the data exists in the tool" and "the right person actually saw it" — useful for anyone who isn't opening the app every day. Kept as a separate concept from Stakeholders on purpose: a Member is a notification subscriber, who may or may not also be someone doing project work.

- A **Members** panel manages the list of subscribers: create/edit/delete, an optional link to a Stakeholder identity (needed for "assigned to you" alerts), three notification toggles, and a per-member project checklist controlling which projects' digests they get — independent of whether they're actually on that project's team.
- A **notification bell** opens a log of everything the system has generated, each row tagged with the project it's about (Section 9) so a non-admin only sees rows for projects they're committed to. A "Run Digest Now" button supplements the automatic nightly run (Section 9) for demos/testing.
- Three triggers: something gets assigned to you (real-time), your action items are overdue (digest), or a deadline/milestone on one of your projects is coming up in 14 days — or has already passed and is still unmarked (digest; Section 10).
- Live delivery runs over a WebSocket connection targeted at the specific member a notification is for — open the app in two tabs and both get it. A short chime plays on arrival (generated in-browser, no audio asset), with a mute toggle that remembers your preference.
- Every notification is also emailed to its recipient (Section 9) — logged to the server console instead if no SMTP provider is configured, so local dev needs no credentials.

### G. Login
Real authentication, not a cosmetic gate — every API route except login/register/password-reset requires a valid session. Accounts live on the `members` table (the same record that already tracks notification preferences) rather than a separate Users concept; a member becomes login-capable the moment someone sets a password for them (via the Members panel, self-service signup, or a password reset). Sessions are a random token in an httpOnly cookie, valid 7 days with no sliding renewal; passwords are hashed with Node's built-in `scrypt`. Self-service signup and password reset are covered in Section 9. Rate limiting on the whole auth surface is covered in Section 10. Deliberately still out of scope: CSRF tokens, SSO, and cleanup of expired sessions/reset tokens.

### H. Roles & Access
Two account roles: **admin** sees and manages everything, including the Stakeholder Directory and Member management, and is the only one who can create or delete a project. **Member** only sees projects they're actually committed to — meaning their linked Stakeholder identity has a team role on that project, not just a digest subscription. Access is enforced on the server on every route, not just hidden in the UI, and a project you can't access returns a plain 404 rather than a 403 — so you can't tell the difference between "wrong ID" and "real project you're not on."

Within a committed project, the existing project-level role (lead/sponsor/member/stakeholder) now also gates *write* access, not just display — reusing the role that was already there instead of adding a separate permission system:
- **Contribute** (create/edit/delete events, decisions, action items, pain points, requirements, goals): every committed role except `stakeholder` — the RACI "Informed" tier is read-only by design.
- **Manage** (project settings — name/dates/budget/status, lead reassignment, team membership): `lead`, `sponsor`, or admin only.

A `stakeholder`-only viewer can still open and read everything on a project they're committed to; they just can't change it. This is enforced server-side (`403` on a disallowed write) and mirrored in the client by disabling/hiding the relevant controls.

## 7. API Surface (Reference)

Conventions: JSON bodies, `400` for validation errors, `404` for missing/inaccessible resources, `401` for no/expired session, `403` for an admin-only route hit by a non-admin. Multi-step writes (an event plus its decisions/action items/pain points, a project plus its lead assignment) happen inside a single transaction so they can't partially land.

**Auth**
- `POST /api/auth/login` — `{ email, password }` → sets the session cookie, returns the member (never the password hash)
- `POST /api/auth/register` — `{ name, email, password }` → creates a member (no stakeholder link) and logs them in immediately
- `POST /api/auth/forgot-password` — `{ email }` → always `200`; emails a reset link if the address matches an account
- `POST /api/auth/reset-password` — `{ token, password }` → sets a new password and invalidates existing sessions for that member
- `POST /api/auth/logout`
- `GET /api/auth/me` — current member + role, or 401

**Projects**
- `GET /api/projects?status=active` — filtered to committed projects for a non-admin; includes lead and scorecard
- `POST /api/projects` *(admin)* — requires a lead
- `PUT /api/projects/:id` *(lead/sponsor/admin)* — everything except lead reassignment
- `PUT /api/projects/:id/lead` *(lead/sponsor/admin)* — atomic demote-old/promote-new
- `DELETE /api/projects/:id` *(admin)* — cascades
- `GET /api/projects/:id/stakeholders` — read-only, any committed role
- `POST/PATCH/DELETE /api/projects/:id/stakeholders...` *(lead/sponsor/admin)* — manage the project team

**Stakeholders** *(admin only)*
- `GET/POST/PUT/DELETE /api/stakeholders` — the global directory
- `GET /api/stakeholders/:id/summary` — cross-project rollup

**Events** *(scoped to committed projects; writes require the contribute tier — Section 6.H)*
- `GET /api/events?project_ids=1,2,3` — nested decisions/action items/pain points/participants
- `POST /api/events` — creates the event and its nested records in one transaction
- `PUT/DELETE /api/events/:id`

**Decisions / Action Items / Pain Points / Requirements / Goals** — standard create/update/delete per item, plus `PATCH` toggles for done/resolved/achieved status; all require the contribute tier (Section 6.H) on the parent project.

**Dashboard**
- `GET /api/dashboard/summary?project_ids=...` — the three health-summary counts, scoped or portfolio-wide

**Members** *(admin only)*
- `GET/POST/PUT/DELETE /api/members`
- `GET/POST/DELETE /api/members/:id/projects` — digest subscriptions

**Notifications**
- `GET /api/notifications?limit=50` — project-tagged rows filtered to a non-admin's accessible projects (Section 9)
- `POST /api/notifications/run-digest` — on-demand trigger, supplementing the nightly cron job (Section 9)

## 8. Delivery Plan

Rough milestone sequence. Milestones 1–5 are the MVP — the tool isn't usable as a real PM aid without them. 6 is a genuine but deferrable stretch. 7–9 layer on notifications, live delivery, and login/roles once the core is proven out.

**Milestone 1 — Foundations**
Get the two-workspace project running end to end: Express API talking to a seeded SQLite database, Vue app hitting it through the Vite dev proxy. Deliverable: `npm run dev` boots both, and a health-check request round-trips.

**Milestone 2 — Data layer & API**
Build out the schema and the full CRUD API for projects, stakeholders, events, decisions, action items, and pain points. Seed realistic sample data: at least two projects with different schedule/budget health, a handful of stakeholders split across them with one lead each, and a spread of events across past/present/future — including overlapping same-day events and at least one of each milestone status (achieved/missed/pending/overdue) so every visual state in the timeline actually gets exercised. Deliverable: the API is fully testable via curl/Postman before any UI exists on top of it.

**Milestone 3 — Core timeline UI**
Sidebar with project selection, the overlay timeline itself (icons, shapes, project-color borders, clustering, zoom/reset, today marker), and the project create/edit form including the required lead selector. Deliverable: you can create a project, select it, and see its events on the timeline.

**Milestone 4 — Event detail & interactivity**
The event detail view with editable fields, participants, and the three actionable sub-lists (decisions/action items/pain points) with owner/assignee pickers scoped correctly to the project's team. Confirmation dialogs on delete. Deliverable: full CRUD on an event and everything nested under it, from the UI.

**Milestone 5 — Dashboards & health**
The three aggregated tabs, the health summary strip, the portfolio badge, and the scorecard dots. Deliverable: opening the app answers "is anything on fire" without reading every event individually.

*→ MVP acceptance pass: walk the golden path end to end — create a project (confirm it's rejected without a lead), select projects, view the overlay timeline including a diamond marker, open an event and add/edit/delete a decision, action item, and pain point with owners set, toggle statuses from both the detail view and the aggregated tabs, delete an event and a project and confirm the cascades. Confirm the empty-selection state, same-day clustering, overdue highlighting, and both scoped and portfolio health counts all look right, and that all three scorecard colors actually show up somewhere in the seed data.*

**Milestone 6 — Stretch: lifecycle & rollups**
Project status lifecycle (archive/complete) with the sidebar filter toggle, and the stakeholder rollup view (their assignments/open items/upcoming deadlines across all their projects). Not required for MVP sign-off.

**Milestone 7 — Members & notifications**
The members/subscriptions/notifications tables and endpoints, the three notification triggers wired into the relevant create/update paths (fired only after the write commits, never inside the transaction), the Members panel, and the notification log with its manual "run digest" button. Seed at least one member linked to a stakeholder (to demonstrate a real assigned-notification) and one subscribed-but-unlinked member (the case that justifies keeping this separate from Stakeholders at all).

**Milestone 8 — Live delivery**
WebSocket server broadcasting new notifications to connected clients, a reconnecting client-side connection, the in-browser chime, and a mute toggle. Ships first as broadcast-to-everyone (there's no login yet to target by), then gets retrofitted to per-member targeting in the next milestone.

**Milestone 9 — Login & roles**
Password hashing, sessions, the login screen, and the two-role access model layered on top of everything built so far — including retrofitting the WebSocket layer to authenticate connections and target notifications per member. This is the milestone where "who is this for" becomes a real, server-enforced question rather than an open tool.

*→ Roles acceptance pass: verify (not just review) that a non-admin only ever sees their committed projects, gets 404 rather than 403 on ones they're not on, gets 403 on the admin-only directories, and that list endpoints silently drop inaccessible IDs rather than erroring.*

## 9. Notifications, Access & Self-Service (implemented)

The five items originally tracked here as future work are now built:

- **Real email delivery.** `server/utils/mailer.js` sends via SMTP (`nodemailer`), configured through the `SMTP_*` env vars (see `server/.env.example`). With no `SMTP_HOST` set, it logs the message to the console instead of throwing — local dev and CI need no credentials. SMS remains a documented future seam, not built.
- **A real cron scheduler.** `server/cron.js` runs the digest job automatically (`node-cron`, nightly at 7am by default, configurable via `CRON_SCHEDULE`). The digest logic itself lives in `server/utils/digest.js`, shared by both the cron job and the manual "Run Digest Now" button, which is now a supplement for demos/testing rather than the only way digests run.
- **Password reset & self-service signup.** `POST /api/auth/register` creates an account and logs the user in immediately — safe because a fresh member has no `stakeholder_id`, so they're committed to zero projects (Section 6.H) until an admin adds them to one. `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` back a standard reset-link flow (`password_resets` table, 1-hour token expiry, all existing sessions invalidated on reset).
- **A finer permission model.** Covered in Section 6.H — the existing project-level role (lead/sponsor/member/stakeholder) now gates write access within a committed project, not just display.
- **Project-scoped notification log.** `notifications.project_id` is now populated on every row (digests changed from one combined row per member to one row per member per project, specifically so each can carry a real project id), and `GET /api/notifications` filters by project access for non-admins the same way the events list endpoint does.

**Still open, deliberately:** SMS delivery, CSRF tokens, SSO, and cleanup of expired sessions/reset tokens (Section 6.G) — rate limiting itself has since been added (Section 10).

## 10. PM-Domain Enhancements & Production Hardening (implemented)

Two further rounds of work landed after Section 9: closing specific project-management gaps identified in a domain review, then hardening the app for an actual go-live rather than local/demo use.

**PM-domain gaps closed**, each by extending an existing pattern rather than adding a new subsystem:
- **Schedule baseline.** `projects.original_target_end_date` is snapshotted once at creation and never touched again, mirroring the existing budget planned-vs-actual idiom — the project edit form now shows how far the current target date has slipped (or moved up) from what was originally planned.
- **Risk vs. issue split.** `pain_points.kind` (`'issue' | 'risk'`) reuses the existing severity/owner/resolved shape instead of a parallel risk-register table — a risk is just a pain point that hasn't happened yet. The event detail view and the aggregated Pain Points tab both tag and filter by kind.
- **Resource overload signal.** `GET /api/stakeholders` now returns `active_project_count`, `open_item_count`, and a derived `overloaded` flag (lead on 2+ active projects, or 5+ open items across projects), computed on the fly in a handful of grouped queries — the same "computed, not stored" philosophy as the RAG scorecard (Section 6.E). Surfaced as a "Load" column in the Stakeholder Directory.
- **Missed-milestone/deadline notification.** The nightly digest (Section 9) now also flags pending milestones/deadlines whose date has already passed, reusing the existing `notify_upcoming_deadlines` toggle and `deadline_digest` type — previously this only showed up as a passive amber nudge on the timeline (Section 6.B), easy to miss if nobody opens the app.

**Production hardening**, scoped to what a single-container go-live needs rather than a full ops buildout:
- **Rate limiting.** The whole `/api/auth` router (login/register/forgot-password/reset-password) is limited to 20 requests per 15 minutes per IP (`server/middleware/rateLimit.js`), closing what was previously an open brute-force/enumeration surface.
- **CORS and cookie hardening.** `cors()` is now locked to `CLIENT_ORIGIN` (was wide open) with `credentials: true`, and the session cookie gets `secure: true` whenever `NODE_ENV=production`.
- **Single-container deployment.** `server/index.js` now serves the built client (`client/dist`) directly with an SPA fallback, so the whole app is one process/one port. A `Dockerfile` (multi-stage, `node:20-slim` for native-module compatibility with `better-sqlite3`) and `docker-compose.yml` (named volume for the SQLite data directory, `restart: unless-stopped`) package this up; `GET /healthz` backs the container's `HEALTHCHECK`.
- **Backups.** `npm run backup` (`server/scripts/backup.js`) snapshots the live database via `better-sqlite3`'s own `.backup()` API — safe to run against a database that's actively being written to, unlike a raw file copy.
- **Help tooltips.** Longer explanatory paragraphs that used to sit inline in forms/modals (the Members-vs-Stakeholders distinction, what a milestone's status means, the CSV import column reference, etc.) are now behind a small `(?)` popover (`client/src/components/HelpTooltip.vue`) — same information, less permanent visual clutter on forms people use daily.

**Still open, deliberately:** automated tests, security headers (helmet/CSP), a health-check-informed monitoring/alerting setup, cleanup of expired sessions/reset tokens, SQLite WAL mode, and CSRF tokens (the existing `sameSite: 'lax'` cookie already blocks most cross-site abuse).
