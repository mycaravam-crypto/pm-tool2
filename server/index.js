import app from '#server/app.js';
import { startDigestCron, startStatusReportCron } from '#server/cron.js';
import { db } from '#server/db/connection.js';
import { closeWebSocketServer, initWebSocketServer } from '#server/ws.js';

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`ChronosPM API listening on http://localhost:${PORT}`));
initWebSocketServer(server);
const digestTask = startDigestCron();
const statusReportTask = startStatusReportCron();

// Docker/orchestrators send SIGTERM on stop/redeploy (Ctrl-C sends SIGINT
// locally) — without handling these, the default behavior kills the process
// immediately mid-request and can leave the SQLite file mid-write. This drains
// in-flight HTTP requests, drops WS connections and the cron job, then closes
// the database cleanly before exiting.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully...`);

  digestTask.stop();
  statusReportTask.stop();
  closeWebSocketServer();

  // Force-exit if something (e.g. a request that never resolves) keeps the
  // server from closing on its own within a reasonable grace period.
  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out, forcing exit.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
