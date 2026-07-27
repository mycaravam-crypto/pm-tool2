import cron from 'node-cron';
import { runDigest } from './utils/digest.js';
import { runStatusReportDigest } from './utils/statusReportDigest.js';

// Real background scheduler, replacing the old "digests only run when someone
// clicks the button" gap. CRON_SCHEDULE defaults to nightly at 7am server time;
// the manual "Run Digest Now" endpoint (routes/notifications.js) still exists
// as a supplement for demos/testing, not a replacement for this.
const SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';
// Weekly, defaulting to Monday 8am — a status report is a start-of-week planning
// input, not a nightly alert, so it runs on its own cadence rather than piggybacking
// on the nightly digest above.
const STATUS_REPORT_SCHEDULE = process.env.STATUS_REPORT_CRON_SCHEDULE || '0 8 * * 1';

export function startDigestCron() {
  const task = cron.schedule(SCHEDULE, () => {
    const generated = runDigest();
    console.log(`[cron] digest run generated ${generated.length} notification(s)`);
  });
  console.log(`[cron] digest scheduler active (${SCHEDULE})`);
  return task;
}

export function startStatusReportCron() {
  const task = cron.schedule(STATUS_REPORT_SCHEDULE, () => {
    const generated = runStatusReportDigest();
    console.log(`[cron] status report run generated ${generated.length} notification(s)`);
  });
  console.log(`[cron] status report scheduler active (${STATUS_REPORT_SCHEDULE})`);
  return task;
}
