# Project Specification: "ChronosPM Multi-Project"

## 1. System Overview & Objectives
"ChronosPM Multi-Project" is a full-stack, timeline-first project management application. It allows users to track multiple projects concurrently. The main view displays a highly visual chronological timeline where users can overlay events from multiple selected projects at once.

**Scope note:** This is a single-user local tool — no authentication/authorization layer. Stakeholders are records of people referenced by events, not app users who log in.

### PM Concept Mapping
Standard project management defines a project by four constraints — **scope, time, cost, quality** (the "iron triangle" plus quality at its center) — governed by a **single accountable owner** (the Project Manager) and a **team** with differentiated roles. ChronosPM represents each of these deliberately, not implicitly:

| PM concept | Represented as |
|---|---|
| Scope | `projects.description` + the Decisions log (what was agreed to build) |
| Time | `projects.start_date` / `target_end_date` / `actual_end_date`, plus `milestone`/`deadline` events and the overlay timeline itself |
| Cost | `projects.budget_planned` / `budget_spent` (planned vs. actual, see Section 3.E) |
| Quality | `pain_points` (severity/resolution) — quality problems are exactly what a pain point is |
| People / roles | `project_stakeholders.project_role` (`lead` / `sponsor` / `member` / `stakeholder`) — see below |
| Single accountable owner | Exactly one `project_role = 'lead'` per project, enforced by the schema (Section 2) — this is the person accountable for time/cost/quality, i.e. the Project Manager |

**Role mapping (a simplified RACI, not a full one):** `lead` = Accountable (the Project Manager — owns schedule, budget, and quality outcomes); `member` = Responsible (does the work); `sponsor` = the business owner who authorized the project, roughly Consulted; `stakeholder` = Informed. This is a project-level role, separate from `stakeholders.role`, which is a free-text organizational title (e.g. "UX Designer") — a person's job title and their governance role on a given project are different things.

**Deliberately out of scope**, to keep this "as simple as possible" while still being recognizably by-the-book: a formal Work Breakdown Structure, Earned Value Management (EV/PV/AC/CPI/SPI cost & schedule performance indices), per-task RACI assignment, multi-currency budgeting, and a cost ledger with line-item entries. `budget_spent` is a single manually-updated running total, not a transaction log — sufficient for a planned-vs-actual signal, not for audit-grade cost accounting.

### Technology Stack
*   **Frontend:** Vue 3 (Composition API with `<script setup>`), Tailwind CSS, Lucide Vue Icons, and Pinia (for state management). No Vue Router — this is a single-page view; the Stakeholder Directory is a modal and the aggregated dashboards are an in-page tab switcher (see Section 3).
*   **Backend:** Node.js with Express.
*   **Database:** SQLite (using `better-sqlite3` — synchronous API simplifies transaction handling for the nested-write endpoints in Section 4).

### Project Layout
Monorepo with two workspaces:
*   `/server` — Express API, port `3001`.
*   `/client` — Vite + Vue 3 SPA, port `5173`, dev server proxies `/api/*` to `http://localhost:3001`.

---

## 2. Database Schema (SQLite)
The AI agent should create the SQLite database with the following relational structure. Foreign keys are not enforced by SQLite by default — the connection init code must run `PRAGMA foreign_keys = ON;` on every connection/statement setup.

```sql
-- 1. Stakeholders Table
CREATE TABLE stakeholders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    role TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Projects Table
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT, -- captures Scope, see PM Concept Mapping in Section 1
    color_hex TEXT NOT NULL DEFAULT '#3B82F6', -- Used for project overlay representation
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','completed')), -- [stretch] drives sidebar visibility, see Section 3
    start_date TEXT, -- YYYY-MM-DD, planned/actual kickoff
    target_end_date TEXT, -- YYYY-MM-DD, planned delivery date (the "Time" constraint)
    actual_end_date TEXT, -- YYYY-MM-DD; server sets this when status flips to 'completed' (see Section 4), null while active
    budget_planned REAL, -- the "Cost" constraint; single implicit currency, no multi-currency support
    budget_spent REAL NOT NULL DEFAULT 0, -- manually-updated running total, not a line-item ledger — see Section 1 non-goals
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Project-Stakeholder Association (Many-to-Many)
-- Defines which stakeholders are assignable within a project (drives the
-- participant/assignee dropdowns in Section 3) AND each person's project-level
-- governance role (the "People" constraint — see PM Concept Mapping, Section 1).
CREATE TABLE project_stakeholders (
    project_id INTEGER NOT NULL,
    stakeholder_id INTEGER NOT NULL,
    project_role TEXT NOT NULL DEFAULT 'member' CHECK(project_role IN ('lead','sponsor','member','stakeholder')),
    PRIMARY KEY (project_id, stakeholder_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (stakeholder_id) REFERENCES stakeholders(id) ON DELETE CASCADE
);
-- Enforces "single accountable owner": at most one lead per project.
-- SQLite partial indexes support this directly, no trigger needed.
CREATE UNIQUE INDEX idx_one_lead_per_project ON project_stakeholders(project_id) WHERE project_role = 'lead';

-- 4. Events Table
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL, -- Format: YYYY-MM-DD
    type TEXT NOT NULL CHECK(type IN ('kickoff','sync','workshop','review','decision','retro','milestone','deadline')), -- milestone/deadline are forward-looking markers, see Section 3
    summary TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','achieved','missed')), -- only meaningful for milestone/deadline, see Section 3.B
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX idx_events_project_id ON events(project_id);
CREATE INDEX idx_events_date ON events(date);

-- 5. Event-Participant Association (Many-to-Many)
-- Application layer must only offer stakeholders present in
-- project_stakeholders for the event's project (not enforced at the DB level).
CREATE TABLE event_participants (
    event_id INTEGER NOT NULL,
    stakeholder_id INTEGER NOT NULL,
    PRIMARY KEY (event_id, stakeholder_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (stakeholder_id) REFERENCES stakeholders(id) ON DELETE CASCADE
);

-- 6. Decisions Table
CREATE TABLE decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    decided_by INTEGER, -- Links to Stakeholders; who owns/made the call
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (decided_by) REFERENCES stakeholders(id) ON DELETE SET NULL
);
CREATE INDEX idx_decisions_event_id ON decisions(event_id);

-- 7. Action Items Table
CREATE TABLE action_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    assignee_id INTEGER, -- Links to Stakeholders
    done INTEGER NOT NULL DEFAULT 0, -- 0 for false, 1 for true
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (assignee_id) REFERENCES stakeholders(id) ON DELETE SET NULL
);
CREATE INDEX idx_action_items_event_id ON action_items(event_id);
CREATE INDEX idx_action_items_assignee_id ON action_items(assignee_id);

-- 8. Pain Points Table
CREATE TABLE pain_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('Low', 'Medium', 'High')),
    owner_id INTEGER, -- Links to Stakeholders; who is accountable for resolving it
    resolved INTEGER NOT NULL DEFAULT 0, -- 0 for false, 1 for true
    resolved_at TEXT, -- set by the server when `resolved` flips to 1, cleared if flipped back
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES stakeholders(id) ON DELETE SET NULL
);
CREATE INDEX idx_pain_points_event_id ON pain_points(event_id);
CREATE INDEX idx_pain_points_owner_id ON pain_points(owner_id);
```

---

## 3. UI/UX & Layout Structure

### A. Sidebar / Sidebar Controller
*   **Project Selector:** A checklist of `status = 'active'` projects in the database. Each project row shows: the colored checkbox (using `color_hex`), the project name, the **Lead's** initials/avatar (their `project_role = 'lead'` stakeholder — every project has exactly one, see Section 2), and the three RAG scorecard dots from Section 3.E. **[stretch]** A "Show archived/completed" toggle at the bottom of the list reveals projects in those states (still viewable/selectable, visually muted) — this keeps the list usable once a real project history accumulates instead of growing forever. Archiving/completing a project is a status change only, not a delete — no cascade.
*   **Project Create/Edit Form:** name, description, color, `start_date`, `target_end_date`, `budget_planned`, `budget_spent`, and a required **Lead** selector (dropdown of stakeholders). Creating a project without a lead is not allowed — see `POST /api/projects` in Section 4. Additional team members, the sponsor, and other stakeholders are assigned afterward via the project's people list (role dropdown: sponsor / member / stakeholder — `lead` is reassigned only through the dedicated "Change lead" action, never the generic role dropdown, so the app can never end up with zero or two leads).
*   **Overlay Toggle:** Checking multiple projects immediately merges their events onto the active timeline view. **Zero-selection state:** when no projects are checked, the timeline and dashboard tabs show an explicit empty state ("Select a project to see its timeline") rather than an empty or all-projects view.
*   **Stakeholder Directory Button:** Opens a **modal** (not a routed page — see Section 1) to manage the global database of Stakeholders: list, create, edit, delete. **[stretch]** Selecting a stakeholder in this modal expands a rollup — projects they're assigned to, open action items assigned to them, and upcoming milestones/deadlines on their projects — computed across *all* their projects regardless of the sidebar's current selection. This is the one view in the app that answers "what is this person on the hook for" rather than "what is this project's history."
*   **Portfolio Health Badge:** A small persistent indicator in the header (independent of sidebar selection) showing counts across all active projects: overdue action items and open high-severity pain points. See Section 3.D — this is the one signal always visible even before selecting anything.

### B. View 1: Multi-Project Overlay Timeline
*   **Timeline Track:** A chronological horizontal line divided visually into **Past**, **Present (Today)**, and **Future**. "Today" is computed from the browser's local date (`YYYY-MM-DD`); since `events.date` has no time component, comparisons are date-only string comparisons, not timezone-aware timestamps.
*   **Event Bubbles:**
    *   Represented by a bubble containing the event-type icon. Fixed icon mapping (Lucide Vue):
        | type | icon | shape |
        |---|---|---|
        | kickoff | `Rocket` | circle |
        | sync | `RefreshCw` | circle |
        | workshop | `Users` | circle |
        | review | `ClipboardCheck` | circle |
        | decision | `GitBranch` | circle |
        | retro | `History` | circle |
        | milestone | `Flag` | diamond |
        | deadline | `AlarmClock` | diamond |
    *   **Milestone / Deadline events** are forward-looking markers, not meeting records: `milestone` marks a target the project is working toward (e.g., "Design freeze"); `deadline` marks a hard external due date. Both render as a diamond (vs. the circular bubble used for meeting-type events) so the "history vs. plan" distinction is visible without reading the icon. Participants are optional and typically empty for these two types — the Participants section on the detail card may be omitted for them, but Decisions/Action Items/Pain Points remain available since a deadline slip often produces exactly those.
    *   **Status** applies only to `milestone`/`deadline` — the other six types are historical records with nothing to track. `status` (`pending`/`achieved`/`missed`) drives the bubble's icon and fill independently of its border: the border always stays the project color (identifies *whose* event it is on the shared overlay), while icon/fill communicate whether it was hit. `achieved` → green check-circle icon, light green fill. `missed` → red X-circle icon, light red fill. `pending` with a past date (nobody marked it either way) → the original type icon in amber, light amber fill, flagging it as needing attention. `pending` with a future date renders normally (white fill, slate icon) — it just hasn't happened yet.
    *   **Overlay Treatment:** The outer ring/border of the bubble must match the parent project's `color_hex` (e.g., `border-2` using inline style `borderColor: project.color_hex`). This allows users to immediately tell which project an event belongs to on a shared timeline.
    *   **Collision handling:** Multiple events on the same or nearby dates must not visually overlap. Cluster same-day events into a stacked/offset group (vertical offset per index within the cluster); clicking a cluster with >1 event opens a small picker before the detail view.
    *   Clicking a bubble opens the detail card.
*   **Event Detail Slide-over / Modal:**
    *   Displays the source Project Name with its colored badge and the project Lead's name.
    *   Title, Date, Type, Summary — editable in place. For `milestone`/`deadline` types, a Status selector (Pending/Achieved/Missed) replaces the Participants field (see Section 2).
    *   **Participants Section:** Multi-select dropdown scoped to stakeholders assigned to that project (via `project_stakeholders`), backed by `event_participants`.
    *   **Action Items:** Task checklist with dropdown assignee selectors pulling from the project's assigned Stakeholders; add/edit/delete individual items. Overdue items (`due_date` in the past and `done = 0`) render with a red due-date treatment.
    *   **Decisions & Pain Points:** Interactive lists allowing additions, inline edits, and deletion. Each decision has a "Decided by" stakeholder selector (`decided_by`); each pain point has an "Owner" stakeholder selector (`owner_id`) — both scoped to the project's assigned Stakeholders and optional. This is what makes these lists actionable rather than a text log: every open item has someone accountable for it.
*   **Destructive actions:** Deleting a project or event cascades to all nested records (events, decisions, action items, pain points). The UI must show a confirmation dialog before either delete, naming what will be removed (e.g., "This will also delete 12 events").

### C. View 2: Aggregated Views (Tab Switcher)
These dashboards aggregate data across *only* the currently selected (checked) projects, rendered as tabs within the same page (no route change):
*   **Action Items Tab:** List of tasks assigned to stakeholders. Displays the Task, Assignee Name, Project (with color badge), and Due Date (overdue items highlighted). Filterable by "My Tasks" or by Project.
*   **Pain Points Tab:** Grouped list of pain points sorted by severity. Displays the Owner and Project context for each item.
*   **Decisions Tab:** Chronological logs of all key agreements made, showing which event, project, and decision-maker they originated from.

### D. At-a-Glance Health Summary
A summary strip above the timeline, computed across the currently selected projects (recomputes on selection change):
*   **Overdue Action Items** — count, click to jump to the filtered Action Items tab.
*   **Open High-Severity Pain Points** — count of `severity = 'High' AND resolved = 0`.
*   **Upcoming Deadlines/Milestones** — count of `type IN ('milestone','deadline')` with `date` within the next 14 days.

This exists because a raw timeline and three list tabs answer "what happened," not "is this okay" — a PM opening the tool should be able to tell project health at a glance without reading every item. The portfolio-wide badge in Section 3.A reuses the same three numbers but computed across all active projects regardless of selection.

### E. Project Scorecard (RAG Status)
Every project gets three traffic-light indicators — **Schedule, Cost, Quality** — the exact three things the project Lead is accountable for (PM Concept Mapping, Section 1). Computed server-side (see `GET /api/projects` in Section 4), not stored:
*   **Schedule:** `red` if `target_end_date` has passed and `status != 'completed'`; `amber` if `target_end_date` is within 14 days and `status != 'completed'`; `green` otherwise (or no `target_end_date` set → shown as `n/a`).
*   **Cost:** `red` if `budget_spent > budget_planned`; `amber` if `budget_spent >= 90%` of `budget_planned`; `green` otherwise (or `n/a` if `budget_planned` is unset).
*   **Quality:** based on open high-severity pain points — `red` at 3+, `amber` at 1–2, `green` at 0.

These three dots appear next to each project in the sidebar (Section 3.A) and expanded, with labels, at the top of the timeline for the currently selected project(s). This is intentionally a lightweight heuristic, not Earned Value Management — see the non-goals in Section 1's PM Concept Mapping.

---

## 4. API Endpoints (Express Backend)

Conventions: JSON bodies; validation errors return `400 { error: string }`; missing resources return `404 { error: string }`; all nested-write endpoints run inside a single `better-sqlite3` transaction.

**Projects**
*   `GET /api/projects?status=active` — Get projects, optionally filtered by status (`active`/`archived`/`completed`); omit to get all. Each project object includes `lead: { id, name }` and `scorecard: { schedule, cost, quality }` (Section 3.E), computed on read. [stretch: `status` param and non-`active` values]
*   `POST /api/projects` — Create a project. Body requires `{ name, ..., lead_stakeholder_id }`; the project row and the `project_stakeholders` row with `project_role = 'lead'` are created in one transaction — a project cannot exist without a lead. `400` if `lead_stakeholder_id` is missing or doesn't reference an existing stakeholder.
*   `PUT /api/projects/:id` — Update project (name, description, color_hex, status, start_date, target_end_date, budget_planned, budget_spent). If `status` changes to `completed` and `actual_end_date` is null, the server sets `actual_end_date = date('now')`. This endpoint does not accept lead changes — use the dedicated endpoint below.
*   `PUT /api/projects/:id/lead` — Reassign the project lead (`{ stakeholder_id }`). Atomically demotes the current lead's `project_role` to `member` and promotes the given stakeholder to `lead` in one transaction, so there is never a moment with zero or two leads. `400` if `stakeholder_id` is not already assigned to the project (assign them first via the endpoint below).
*   `DELETE /api/projects/:id` — Delete project (cascades to events/decisions/action items/pain points). Note: prefer `PUT .../status=archived` over delete for a project with real history — delete is for mistakes, archive is for lifecycle.
*   `GET /api/projects/:id/stakeholders` — List stakeholders assigned to the project with their `project_role`, ordered lead first. This is what scopes the participant/assignee/decided-by/owner dropdowns in Section 3 to the right people — without it those dropdowns have no data source.
*   `POST /api/projects/:id/stakeholders` — Assign an existing stakeholder to the project (`{ stakeholder_id, project_role? }`, defaults to `member`; `lead` is rejected here — use `PUT .../lead`).
*   `PATCH /api/projects/:id/stakeholders/:stakeholderId` — Change a non-lead assignee's `project_role` (`sponsor`/`member`/`stakeholder`). `400` if attempting to set `lead` here.
*   `DELETE /api/projects/:id/stakeholders/:stakeholderId` — Unassign a stakeholder from the project. `400` if the target is the current lead — reassign the lead first.

**Stakeholders**
*   `GET /api/stakeholders` — Get all global stakeholders.
*   `POST /api/stakeholders` — Create a stakeholder.
*   `PUT /api/stakeholders/:id` — Update a stakeholder.
*   `DELETE /api/stakeholders/:id` — Delete a stakeholder (cascades to `project_stakeholders` / `event_participants`; `decisions.decided_by`, `pain_points.owner_id`, and `action_items.assignee_id` set NULL). `400` if the stakeholder is the `lead` on any project — the cascade would otherwise silently delete the `project_stakeholders` row that holds the single-accountable-owner guarantee from Section 2, leaving that project with no lead. Reassign the lead first.
*   `GET /api/stakeholders/:id/summary` — **[stretch]** Rollup across all their projects: assigned projects, open action items, unresolved pain points they own, and upcoming milestones/deadlines. Powers the Section 3.A directory rollup.

**Events**
*   `GET /api/events?project_ids=1,2,3` — Fetch events for specified project IDs, including nested decisions, action items, pain points, and participants, sorted by `date`.
*   `POST /api/events` — Create a new event, along with its linked arrays of decisions, action items, pain points, and participants, in a single transaction. `status` defaults to `pending` if omitted.
*   `PUT /api/events/:id` — Update event's own fields (title, date, type, summary, status) and its `participants` array (diffed against `event_participants`). Nested decisions/action items/pain points are managed through their own endpoints below, not replaced wholesale here.
*   `DELETE /api/events/:id` — Delete event.

**Decisions**
*   `POST /api/decisions` — Create a decision (`{ event_id, text, decided_by? }`).
*   `PUT /api/decisions/:id` — Edit decision text/`decided_by`.
*   `DELETE /api/decisions/:id` — Delete decision.

**Action Items**
*   `POST /api/action-items` — Create an action item.
*   `PUT /api/action-items/:id` — Edit text/assignee/due_date.
*   `PATCH /api/action-items/:id` — Toggle `done` status.
*   `DELETE /api/action-items/:id` — Delete action item.

**Pain Points**
*   `POST /api/pain-points` — Create a pain point (`{ event_id, text, severity, owner_id? }`).
*   `PUT /api/pain-points/:id` — Edit text/severity/`owner_id`.
*   `PATCH /api/pain-points/:id` — Toggle `resolved` status; server sets `resolved_at = datetime('now')` when flipping to `1`, clears it when flipping back to `0`.
*   `DELETE /api/pain-points/:id` — Delete pain point.

**Dashboard**
*   `GET /api/dashboard/summary?project_ids=1,2,3` — Returns the three counts from Section 3.D (overdue action items, open high-severity pain points, upcoming milestones/deadlines within 14 days) for the given projects. Omit `project_ids` to compute across all `status = 'active'` projects — this is what powers the portfolio badge in Section 3.A.

---

## 5. Implementation Steps for the AI Coding Agent

Phases 0–5 are **MVP** — the tool isn't usable as a PM tool without them. Phase 6 is **stretch** — real, but deferrable without making the MVP feel broken. Phase 7 verifies both.

### Phase 0: Scaffolding (MVP)
1. Create `/server` and `/client` workspaces per Section 1. Add root scripts to run both concurrently in dev (e.g. `concurrently`).
2. Configure Vite dev proxy so `/client` calls to `/api/*` reach `http://localhost:3001` without CORS issues; still enable `cors` in Express for direct-port access during debugging.

### Phase 1: SQLite Database Setup & Express API (MVP)
1. Initialize the Node.js project in `/server`. Installs: `express`, `cors`, `better-sqlite3`.
2. Write a database initializer script using the schema in Section 2, including `PRAGMA foreign_keys = ON;`.
3. Seed the database with at least 2 projects (e.g., "Website Redesign" - Blue, "Marketing Campaign" - Green), each with `start_date`, `target_end_date`, and `budget_planned`/`budget_spent` set; 4 stakeholders (e.g., "Alice", "Bob", "Carol", "Dave") assigned across both projects with a mix of `project_role`s — each project needs exactly one `lead`, and at least one project should also have a `sponsor` — and 7+ events spanning past, present, and future dates — including: at least one same-day pair (to exercise timeline collision handling); at least one event with a decision (with `decided_by` set), an action item, and a pain point (with `owner_id` set) attached (to exercise all detail-card sections and ownership fields without manual data entry); at least one overdue action item (past `due_date`, `done = 0`); and at least one `milestone` or `deadline` event in the future (to exercise the diamond marker and the health summary's upcoming-deadlines count), one in the past with `status = 'achieved'`, one in the past with `status = 'missed'`, and one in the past left at the default `status = 'pending'` (to exercise all four timeline visual states from Section 3.B — upcoming, achieved, missed, and overdue-but-unmarked). Set one project's numbers so its scorecard (Section 3.E) comes out all-green and the other's so at least one dot comes out amber or red — this is the only way to verify the RAG thresholds actually render three distinct states.
4. Implement all Express endpoints from Section 4 with the stated validation/error conventions (MVP endpoints only — skip the `[stretch]`-tagged ones for now).

### Phase 2: Vue 3 Frontend & Pinia Store (MVP)
1. Initialize a Vue 3 SPA with Tailwind CSS and Pinia.
2. Build a Pinia store (`useProjectStore.js`) to handle API calls:
    *   `projects`: State list of projects.
    *   `selectedProjectIds`: Array of IDs representing checked projects.
    *   `stakeholders`: State list of stakeholders.
    *   `events`: Array of combined events fetched from the API based on `selectedProjectIds` (refetch on change; empty array — and empty-state UI — when `selectedProjectIds` is empty).
3. Create the layout with a Sidebar (Project Selector checklist, lead avatar, scorecard dots, and Stakeholder manager) and a main content area.
4. Build the Project Create/Edit form from Section 3.A, including the required Lead selector and the time/budget fields — this form is what turns the schema's `lead`/`start_date`/`target_end_date`/`budget_*` fields into something a user actually sets.

### Phase 3: Interactive Timeline Component (MVP)
1. Build a responsive timeline component that takes the filtered `events` array and sorts them chronologically.
2. Render each event bubble with the icon mapping, shape (circle vs. diamond), and border color rules from Section 3, including same-day clustering/offset so bubbles never overlap.
3. Add a visually distinct vertical line indicating "Today".

### Phase 4: Event Detail Drawer & Interactivity (MVP)
1. Build an expanded view modal when an event bubble is clicked.
2. Wire up forms to let the user add, edit, or delete an event, using the granular decisions/action-items/pain-points endpoints from Section 4 rather than a full-event replace, including the `decided_by`/`owner_id` selectors.
3. Ensure dropdowns for participants, action item assignees, decision-makers, and pain point owners query only stakeholders assigned to that event's project (`project_stakeholders`), not the full global list.
4. Add confirmation dialogs for event and project deletion per Section 3.

### Phase 5: Global Dashboard Tabs & Health Summary (MVP)
1. Build the Aggregated Tabs: **Action Items**, **Pain Points**, and **Decisions**, as in-page tabs (no routing), including overdue highlighting and owner/decision-maker columns.
2. Write computed properties in Vue to query the state and group items across all active (selected) projects.
3. Ensure toggling a task as "Done" or a pain point as "Resolved" in the global list fires a `PATCH` request to update the SQLite database and updates local state optimistically.
4. Build the Section 3.D health summary strip and wire it to `GET /api/dashboard/summary`, plus the portfolio badge in the header (fetches the same endpoint without `project_ids`).
5. Render the Section 3.E scorecard dots (Schedule/Cost/Quality) from the `scorecard` field already included in `GET /api/projects` — no extra request needed — both in the sidebar project rows and expanded above the timeline for the selected project(s).

### Phase 6: Stretch Goals (Post-MVP)
1. **Project lifecycle:** add the status dropdown to the project edit form, the archived/completed filter toggle in the sidebar, and the `status` query param handling on `GET /api/projects`.
2. **Stakeholder rollup:** implement `GET /api/stakeholders/:id/summary` and the expandable rollup panel in the Stakeholder Directory modal.
3. Treat these as separate follow-up work — don't block the Phase 7 verification of the MVP on them.

### Phase 7: Verification
1. Manually exercise the golden path in a browser: create a project through the form (confirm it's rejected without a Lead selected), select projects, view overlay timeline (including a diamond milestone/deadline marker), open an event, add/edit/delete a decision/action item/pain point with owners set, toggle statuses from both the detail card and the aggregated tabs, delete an event and a project and confirm cascades.
2. Confirm the empty-selection state, the same-day-cluster rendering, the overdue-item highlighting, and the health summary counts (both scoped and portfolio-wide) all look correct.
3. Confirm the scorecard dots show three distinct RAG states across the seeded projects (not all green — see the Phase 1 seeding note), and that reassigning a project's lead via the UI correctly demotes the old lead and never leaves a project with zero or two leads.
4. If Phase 6 was implemented, verify archiving a project removes it from the default sidebar list without deleting data, and that the stakeholder rollup shows correct cross-project counts.
