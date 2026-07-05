import cron from 'node-cron';
import { runDigest } from './utils/digest.js';

// Real background scheduler, replacing the old "digests only run when someone
// clicks the button" gap. CRON_SCHEDULE defaults to nightly at 7am server time;
// the manual "Run Digest Now" endpoint (routes/notifications.js) still exists
// as a supplement for demos/testing, not a replacement for this.
const SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';

export function startDigestCron() {
  cron.schedule(SCHEDULE, () => {
    const generated = runDigest();
    console.log(`[cron] digest run generated ${generated.length} notification(s)`);
  });
  console.log(`[cron] digest scheduler active (${SCHEDULE})`);
}
