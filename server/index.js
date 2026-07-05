import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import './db/connection.js';

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

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

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

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`ChronosPM API listening on http://localhost:${PORT}`));
initWebSocketServer(server);
