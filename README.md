# ChronosPM Multi-Project

A full-stack, timeline-first project management application. Instead of managing one project at a time in isolation, ChronosPM lets you track several projects concurrently and overlay their events on a single chronological timeline — so you can see how kickoffs, reviews, decisions, and deadlines across your whole portfolio relate to each other in time, not just within one project's history.

## Why a timeline?

Most PM tools organize around boards or lists. ChronosPM organizes around time: a horizontal track split into Past, Present, and Future, with every project's events plotted on it in that project's color. Select multiple projects in the sidebar and their events merge onto the same view, making cross-project scheduling conflicts and clusters of activity visible at a glance instead of requiring you to tab between separate project views.

## Core concepts

ChronosPM deliberately maps onto the classic PM "iron triangle" — scope, time, cost, and quality — governed by a single accountable owner, rather than inventing its own vocabulary:

| PM concept | How it shows up in the app |
|---|---|
| **Scope** | A project's description and its Decisions log — what was agreed to build |
| **Time** | Start/target-end/actual-end dates, plus `milestone` and `deadline` events on the timeline itself |
| **Cost** | Planned vs. spent budget, tracked as a single running total |
| **Quality** | Pain Points, each with a severity and a resolution state |
| **People** | Stakeholders assigned to a project with a governance role: `lead`, `sponsor`, `member`, or `stakeholder` |
| **Accountability** | Every project has exactly one `lead` — the person accountable for its schedule, budget, and quality — enforced by the data model, not just convention |

This is intentionally lightweight: no formal Work Breakdown Structure, no Earned Value Management metrics, no per-task RACI matrix, no multi-currency budgeting or line-item cost ledger. Budget tracking is a planned-vs-actual signal, not audit-grade accounting.

## Features

**Overlay timeline** — Zoomable, with automatic clustering so close-together events separate into their own bubbles instead of overlapping. Meeting-type events (kickoff, sync, workshop, review, decision, retro) render as circles; forward-looking markers (milestone, deadline) render as diamonds and track a pending/achieved/missed status. Every bubble is bordered in its project's color so you always know whose event you're looking at, even with several projects overlaid at once.

**Event detail view** — Click any event to see its full record: title, date, summary, participants, and three linked lists — Decisions, Action Items, and Pain Points — each with an owner or assignee drawn from that project's assigned stakeholders.

**Aggregated dashboards** — Action Items, Pain Points, and Decisions each get their own cross-project tab, scoped to whatever projects are currently selected, with overdue items and high-severity issues highlighted.

**Health summary & scorecards** — A summary strip shows overdue action items, open high-severity pain points, and upcoming deadlines for the selected projects, plus a portfolio-wide badge that's always visible. Every project also gets a three-dot RAG (red/amber/green) scorecard for Schedule, Cost, and Quality, computed from its dates, budget, and open pain points.

**Stakeholder directory** — A global address book of the people referenced across projects, with a rollup view showing everything a given person is on the hook for — their assignments, open action items, and upcoming deadlines — across every project they're part of.

**Members, notifications & live delivery** — A separate "notification subscriber" concept from Stakeholders, since not everyone who wants visibility into a project is doing work on it. Members can subscribe to per-project digests and opt into three triggers: something was assigned to them, an action item is overdue, or a deadline is approaching. Every notification is pushed live over a WebSocket connection to the right person's browser (with a chime and an in-app log, filtered to the projects they can access) and emailed via SMTP — logged to the console instead if no mail server is configured, so local dev needs no credentials. Digests also run automatically every night via a cron job, with a "Run Digest Now" button for testing on demand.

**Authentication, roles & permissions** — Login is required to use the app at all, enforced server-side, with self-service signup and password reset. Two account roles: `admin`, who can see and manage everything, and `member`, who only sees projects they're actually committed to. Within a committed project, the existing team role (lead/sponsor/member/stakeholder) also governs write access: everyone but a plain `stakeholder` can contribute to events/decisions/action items/pain points, while project settings and team membership are restricted to the lead, sponsor, or an admin. Access checks happen on every route, not just in the UI, and inaccessible projects return a plain 404 rather than revealing that they exist.

## Tech Stack

- **Frontend:** Vue 3 (Composition API, `<script setup>`), Vite, Tailwind CSS, Pinia, Lucide icons
- **Backend:** Node.js, Express, WebSockets (`ws`)
- **Database:** SQLite via `better-sqlite3`
- **Tooling:** Biome (lint/format), npm workspaces

## Project Layout

Monorepo with two workspaces:

```
├── client/   # Vite + Vue 3 SPA (dev server on :5173, proxies /api to the server)
└── server/   # Express API + SQLite (listens on :3001)
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
npm install
```

### Seed the database

```bash
npm run seed
```

### Run in development

```bash
npm run dev
```

This starts both the server (`:3001`) and the client (`:5173`) concurrently. Open the client URL in your browser and log in with one of the seeded demo accounts (printed to the console when you seed), or sign up for a new account from the login screen.

### Optional: real email delivery

By default, notification emails (and password-reset links) are logged to the server console instead of sent. To send real email, digest on a different schedule, or point reset links at a different origin, copy `server/.env.example` to `server/.env` and fill in the SMTP/cron/origin settings you need.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run client + server together in dev mode |
| `npm run seed` | Seed the SQLite database with sample data |
| `npm run lint` | Check formatting/lint issues with Biome |
| `npm run lint:fix` | Auto-fix formatting/lint issues with Biome |

## Notes on scope

A few things are deliberately left out to keep this a focused prototype rather than a production PM suite: SMS delivery (email only), SSO, CSRF tokens, login rate-limiting, and cleanup of expired sessions/reset tokens. See [PLAN.md](PLAN.md) for the full technical specification, including the database schema and API reference.
