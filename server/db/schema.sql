-- 1. Stakeholders Table
CREATE TABLE IF NOT EXISTS stakeholders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    role TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    color_hex TEXT NOT NULL DEFAULT '#3B82F6',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','completed')),
    start_date TEXT,
    target_end_date TEXT,
    actual_end_date TEXT,
    budget_planned REAL,
    budget_spent REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Project-Stakeholder Association (Many-to-Many)
CREATE TABLE IF NOT EXISTS project_stakeholders (
    project_id INTEGER NOT NULL,
    stakeholder_id INTEGER NOT NULL,
    project_role TEXT NOT NULL DEFAULT 'member' CHECK(project_role IN ('lead','sponsor','member','stakeholder')),
    PRIMARY KEY (project_id, stakeholder_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (stakeholder_id) REFERENCES stakeholders(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_lead_per_project ON project_stakeholders(project_id) WHERE project_role = 'lead';

-- 4. Events Table
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('kickoff','sync','workshop','review','decision','retro','milestone','deadline')),
    summary TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','achieved','missed')), -- only meaningful for milestone/deadline; ignored elsewhere
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

-- 5. Event-Participant Association (Many-to-Many)
CREATE TABLE IF NOT EXISTS event_participants (
    event_id INTEGER NOT NULL,
    stakeholder_id INTEGER NOT NULL,
    PRIMARY KEY (event_id, stakeholder_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (stakeholder_id) REFERENCES stakeholders(id) ON DELETE CASCADE
);

-- 6. Decisions Table
CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    decided_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (decided_by) REFERENCES stakeholders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_decisions_event_id ON decisions(event_id);

-- 7. Action Items Table
CREATE TABLE IF NOT EXISTS action_items (
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
CREATE INDEX IF NOT EXISTS idx_action_items_event_id ON action_items(event_id);
CREATE INDEX IF NOT EXISTS idx_action_items_assignee_id ON action_items(assignee_id);

-- 8. Pain Points Table
CREATE TABLE IF NOT EXISTS pain_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('Low', 'Medium', 'High')),
    owner_id INTEGER,
    resolved INTEGER NOT NULL DEFAULT 0,
    resolved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES stakeholders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_pain_points_event_id ON pain_points(event_id);
CREATE INDEX IF NOT EXISTS idx_pain_points_owner_id ON pain_points(owner_id);

-- 9. Members Table
-- Deliberately separate from Stakeholders: a member is a notification subscriber,
-- not necessarily a person doing project work. stakeholder_id is an optional link
-- to a Stakeholder identity — only members linked this way can receive "assigned to
-- you" notifications, since assignee_id/owner_id/decided_by all point at stakeholders.
-- password_hash is nullable: a member is a notification subscriber first and a
-- login account only once someone sets a password for them (via the Members
-- modal, or the seed script). Never select/return this column to a client.
CREATE TABLE IF NOT EXISTS members (
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
CREATE INDEX IF NOT EXISTS idx_members_stakeholder_id ON members(stakeholder_id);

-- 9b. Sessions — backs the login cookie. No sliding expiry or cleanup job in this
-- prototype; a session is just valid until expires_at, full stop.
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    member_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_member_id ON sessions(member_id);

-- 10. Member-Project subscriptions (digest scope) — independent of project_stakeholders,
-- since a member doesn't have to be doing work on a project to want its digests.
CREATE TABLE IF NOT EXISTS member_projects (
    member_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    PRIMARY KEY (member_id, project_id),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 11. Notifications Table — stub outbox. Real sending is out of scope for now (no
-- provider credentials); this is the seam where a real email call would go, logged
-- instead so the feature is buildable and demoable without external infrastructure.
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('assigned','overdue_digest','deadline_digest')),
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notifications_member_id ON notifications(member_id);

-- 12. Requirements — what the project must deliver. Project-scoped (not event-scoped
-- like decisions/action_items/pain_points), since a requirement isn't tied to a
-- single meeting. Part of the "Scope" constraint alongside projects.description
-- and the Decisions log.
CREATE TABLE IF NOT EXISTS requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_requirements_project_id ON requirements(project_id);

-- 13. Goals — what success looks like for the project. target_date is optional;
-- a goal doesn't have to be time-bound.
CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    achieved INTEGER NOT NULL DEFAULT 0,
    target_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_goals_project_id ON goals(project_id);
