import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { db } from '#server/db/connection.js';
import { requireAdmin, requireAuth } from '#server/middleware/requireAuth.js';
import actionItemsRouter from '#server/routes/actionItems.js';
import authRouter from '#server/routes/auth.js';
import dashboardRouter from '#server/routes/dashboard.js';
import decisionsRouter from '#server/routes/decisions.js';
import eventsRouter from '#server/routes/events.js';
import goalsRouter from '#server/routes/goals.js';
import membersRouter from '#server/routes/members.js';
import notificationsRouter from '#server/routes/notifications.js';
import painPointsRouter from '#server/routes/painPoints.js';
import projectsRouter from '#server/routes/projects.js';
import requirementsRouter from '#server/routes/requirements.js';
import stakeholdersRouter from '#server/routes/stakeholders.js';
// The monorepo *root* package.json, not server/package.json — genuinely
// outside what #server/* can address (subpath imports can't reach above
// their own package root), so this one stays a relative import on purpose.
import rootPackageJson from '../package.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');

const app = express();
// Locked to CLIENT_ORIGIN, not wide open — this app runs with credentialed
// (cookie-based) requests, so an unrestricted origin plus credentials would let
// any site read a logged-in user's data via fetch. In the single-container
// deployment (server also serves the built client) this almost never triggers
// since same-origin requests skip CORS entirely; it matters if the API is ever
// called from a different origin (a separately-hosted client, a future mobile
// app's webview, etc).
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

// No auth — for Docker's HEALTHCHECK (or any orchestrator/load balancer) to
// poll. Does a cheap DB round-trip, not just a liveness check: the process
// can stay up while the SQLite file is unreadable (bad volume permissions,
// disk full), and a deploy that only checks "process alive" would treat that
// as healthy and never roll back.
app.get('/healthz', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('healthz: database check failed', err);
    res.status(503).json({ ok: false });
  }
});

// Unauthenticated and cheap on purpose — polled by the client (see
// client/src/composables/useVersionCheck.js) to notice a deploy happened
// while a tab was open, drive the version number shown in the sidebar, and
// for ops post-deploy verification. `version` is APP_VERSION — the latest
// semantic-release tag reachable from the built commit (see release.config.js
// and the Dockerfile) — falling back to the static root package.json version
// when unset (`npm run dev`, or a manual `docker build`). GIT_SHA is likewise
// baked in at image build time and unset outside a built image.
app.get('/version', (_req, res) =>
  res
    .status(200)
    .json({ version: process.env.APP_VERSION || rootPackageJson.version, commit: process.env.GIT_SHA || 'unknown' }),
);

// Unprotected — you can't require a session to create one.
app.use('/api/auth', authRouter);

// Everything else requires a valid session.
app.use('/api', requireAuth);

// Stakeholder Directory and Members management are whole-router admin-only —
// see PLAN.md Section 3.H. Project-scoped access (which projects a non-admin can
// see/touch at all) is enforced per-route inside projectsRouter/eventsRouter/etc,
// not at the mount point, since "admin" isn't the only thing that determines
// access there — project commitment is.
app.use('/api/stakeholders', requireAdmin, stakeholdersRouter);
app.use('/api/members', requireAdmin, membersRouter);

app.use('/api/projects', projectsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/decisions', decisionsRouter);
app.use('/api/action-items', actionItemsRouter);
app.use('/api/pain-points', painPointsRouter);
app.use('/api/requirements', requirementsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/notifications', notificationsRouter);

// Serves the built client (client/dist, produced by `npm run build`) so the
// whole app is one deployable process — no separate static host needed. In dev,
// client/dist doesn't exist yet and the Vue app is served by Vite on :5173
// instead (which proxies /api and /ws here), so this quietly does nothing.
// The catch-all comes last and only matches non-API GETs, so it can never
// shadow an actual API route or return HTML for a JSON 404.
app.use(express.static(clientDistPath));
app.get(/^(?!\/api|\/ws|\/healthz|\/version).*/, (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) res.status(404).end();
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

export default app;
