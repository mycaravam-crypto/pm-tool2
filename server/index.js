import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import './db/connection.js';

import authRouter from './routes/auth.js';
import projectsRouter from './routes/projects.js';
import stakeholdersRouter from './routes/stakeholders.js';
import eventsRouter from './routes/events.js';
import decisionsRouter from './routes/decisions.js';
import actionItemsRouter from './routes/actionItems.js';
import painPointsRouter from './routes/painPoints.js';
import dashboardRouter from './routes/dashboard.js';
import membersRouter from './routes/members.js';
import notificationsRouter from './routes/notifications.js';
import { initWebSocketServer } from './ws.js';
import { requireAuth, requireAdmin } from './middleware/requireAuth.js';

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
app.use('/api/dashboard', dashboardRouter);
app.use('/api/notifications', notificationsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`ChronosPM API listening on http://localhost:${PORT}`));
initWebSocketServer(server);
