// Mirrors client/src/lib/dateFormat.js's DD.MM.YYYY convention, so notification
// bodies (in-app log + email) read the same as every date the client renders,
// instead of leaking the raw 'YYYY-MM-DD' storage format to the reader.
export function formatDate(dateStr) {
  if (!dateStr) return dateStr;
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}.${m}.${y}`;
}
