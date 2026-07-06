export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly'];
export const MAX_OCCURRENCES = 25;

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Generates `count` occurrence dates starting at (and including) startDate,
// spaced by frequency/interval. Built on local Date arithmetic — new Date(y, m, d)
// normalizes overflowing days/months itself — rather than a date library, matching
// the rest of this codebase (see client/server dateFormat.js). Monthly clamps to
// the target month's last day instead of overflowing into the next one (Jan 31 +
// 1 month -> Feb 28, not Mar 3), matching Outlook's "same day each month" behavior.
export function generateOccurrenceDates(startDate, frequency, interval, count) {
  const [y, m, d] = startDate.split('-').map(Number);
  const dates = [];
  for (let i = 0; i < count; i++) {
    let date;
    if (frequency === 'daily') {
      date = new Date(y, m - 1, d + interval * i);
    } else if (frequency === 'weekly') {
      date = new Date(y, m - 1, d + interval * i * 7);
    } else {
      const targetMonth = m - 1 + interval * i;
      const lastDayOfTargetMonth = new Date(y, targetMonth + 1, 0).getDate();
      date = new Date(y, targetMonth, Math.min(d, lastDayOfTargetMonth));
    }
    dates.push(toDateStr(date));
  }
  return dates;
}

// Shared validation for the recurrence rule on event creation — kept here rather
// than inline in the route so the cap (and its error message) has one source of truth.
export function validateRecurrence({ frequency, interval, count }) {
  if (!RECURRENCE_FREQUENCIES.includes(frequency)) return 'recurrence.frequency must be daily, weekly, or monthly';
  if (!Number.isInteger(interval) || interval < 1) return 'recurrence.interval must be a positive integer';
  if (!Number.isInteger(count) || count < 2 || count > MAX_OCCURRENCES)
    return `recurrence.count must be between 2 and ${MAX_OCCURRENCES}`;
  return null;
}
