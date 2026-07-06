// Mirrors server/utils/recurrence.js — used here only to preview "ends on ..."
// before saving; the server is still the source of truth for the actual rows.
export const RECURRENCE_FREQUENCIES = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];
export const MAX_OCCURRENCES = 25;

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
