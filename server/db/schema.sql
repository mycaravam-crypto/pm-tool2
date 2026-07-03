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
