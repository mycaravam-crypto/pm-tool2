// Pure date<->pixel scaling math for the event timeline (Timeline.vue), pulled
// out so it can be unit-tested without mounting the component — no Vue
// reactivity here, just plain functions over dates and numbers.

export const DAY_MS = 86400000;

// Computes the visible [min, max] date window: spans every event date plus
// today (so the marker is always in range), padded by 10% of the span (or a
// week, whichever is larger) on each side. With zero events (only today in
// the list), falls back to a fixed 60-day window centered on today.
export function computeRange(eventDates, todayStr) {
  const dates = [...eventDates, todayStr];
  if (dates.length === 1) {
    const only = new Date(dates[0]);
    return { min: new Date(only.getTime() - 30 * DAY_MS), max: new Date(only.getTime() + 30 * DAY_MS) };
  }
  const sorted = [...dates].sort();
  const min = new Date(sorted[0]);
  const max = new Date(sorted[sorted.length - 1]);
  const pad = Math.max((max.getTime() - min.getTime()) * 0.1, 7 * DAY_MS);
  return { min: new Date(min.getTime() - pad), max: new Date(max.getTime() + pad) };
}

// Where a date falls within a [min, max] range, as a percentage clamped to
// [0, 100] — dates outside the range pin to the nearest edge rather than
// producing an off-track position.
export function leftPercent(dateStr, range) {
  const { min, max } = range;
  const span = max.getTime() - min.getTime();
  if (span <= 0) return 0;
  const t = new Date(dateStr).getTime();
  const pct = ((t - min.getTime()) / span) * 100;
  return Math.min(100, Math.max(0, pct));
}

// Pixel width of the scrollable track for a given date range and zoom level,
// clamped to [minWidth, maxWidth] so an empty/tiny range doesn't collapse the
// track and a huge range doesn't produce an unusably (or unrenderably) wide one.
export function computeTrackWidth(range, zoomLevel, { basePxPerDay, minWidth, maxWidth }) {
  const days = (range.max.getTime() - range.min.getTime()) / DAY_MS;
  const pxPerDay = basePxPerDay * zoomLevel;
  return Math.min(maxWidth, Math.max(minWidth, Math.round(days * pxPerDay)));
}

// Named zoom tiers (Jahr/Quartal/Monat/Woche/Tag) for a given pixels-per-day
// value, ascending by density — thresholds are exclusive upper bounds so a
// pxPerDay of exactly `dayGridMinPxPerDay` reads as "Woche", matching when
// Timeline.vue's day gridlines actually switch on.
export function computeSemanticZoomLabel(pxPerDay, dayGridMinPxPerDay) {
  if (pxPerDay < 4) return 'Jahr';
  if (pxPerDay < 8) return 'Quartal';
  if (pxPerDay < dayGridMinPxPerDay) return 'Monat';
  if (pxPerDay < 24) return 'Woche';
  return 'Tag';
}
