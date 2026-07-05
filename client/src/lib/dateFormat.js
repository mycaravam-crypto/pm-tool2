const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const monthYearFmt = new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric' });

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Accepts a YYYY-MM-DD date-only string and formats it as DD.MM.YYYY, avoiding
// the UTC-midnight-rolls-back-a-day trap that new Date('YYYY-MM-DD') hits in
// timezones behind UTC. Falls back to the raw input for malformed strings
// (e.g. an unvalidated CSV import preview row), rather than throwing.
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return dateStr;
  return dateFmt.format(new Date(y, m - 1, d));
}

// Accepts a SQLite-style 'YYYY-MM-DD HH:MM:SS' timestamp (as returned by
// datetime('now'), used for notifications.created_at and similar columns).
export function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  const [datePart, timePart = '00:00:00'] = timestamp.split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min, s] = timePart.split(':').map(Number);
  return timeFmt.format(new Date(y, m - 1, d, h, min, s));
}

export function formatMonthYear(date) {
  return monthYearFmt.format(date);
}
