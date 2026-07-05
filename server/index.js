import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import './db/connection.js';

import { startDigestCron } from './cron.js';
import { requireAdmin, requireAuth } from './middleware/requireAuth.js';
import actionItemsRouter from './routes/actionItems.js';
import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import decisionsRouter from './routes/decisions.js';
import eventsRouter from './routes/events.js';
import goalsRouter from './routes/goals.js';
import membersRouter from './routes/members.js';
import notificationsRouter from './routes/notifications.js';
import painPointsRouter from './routes/painPoints.js';
import projectsRouter from './routes/projects.js';
import requirementsRouter from './routes/requirements.js';
import stakeholdersRouter from './routes/stakeholders.js';
import { initWebSocketServer } from './ws.js';

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

// No auth, no DB — just proves the process is alive, for Docker's HEALTHCHECK
// (or any orchestrator/load balancer) to poll.
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

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
app.get(/^(?!\/api|\/ws|\/healthz).*/, (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) res.status(404).end();
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`ChronosPM API listening on http://localhost:${PORT}`));
initWebSocketServer(server);
startDigestCron();
