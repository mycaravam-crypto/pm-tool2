import { describe, expect, it } from 'vitest';
import { computeRange, computeSemanticZoomLabel, computeTrackWidth, leftPercent } from './timelineScale.js';

describe('computeRange', () => {
  const DAY_MS = 86400000;

  it('falls back to a 60-day window centered on today when there are no events', () => {
    const { min, max } = computeRange([], '2026-07-24');
    expect(min.toISOString().slice(0, 10)).toBe('2026-06-24');
    expect(max.toISOString().slice(0, 10)).toBe('2026-08-23');
  });

  it('spans from the earliest to the latest date including today, using a 7-day floor when 10% of the span is smaller', () => {
    // today (2026-07-24) is later than both event dates, so it becomes the max;
    // span (~204 days) * 10% (~20d) is already above the 7-day floor here, so
    // this exercises the "earliest/latest incl. today" combining logic itself
    // rather than the floor — the floor is covered by the case below.
    const eventDates = ['2026-01-01', '2026-07-01'];
    const todayStr = '2026-07-24';
    const { min, max } = computeRange(eventDates, todayStr);
    const expectedMin = new Date('2026-01-01');
    const expectedMax = new Date(todayStr);
    const expectedPad = Math.max((expectedMax - expectedMin) * 0.1, 7 * DAY_MS);
    expect(min.getTime()).toBe(expectedMin.getTime() - expectedPad);
    expect(max.getTime()).toBe(expectedMax.getTime() + expectedPad);
  });

  it('falls back to the 7-day floor when 10% of the span would be smaller', () => {
    // span = 10 days; 10% = 1 day < 7-day floor
    const { min, max } = computeRange(['2026-01-01'], '2026-01-11');
    expect(min.toISOString().slice(0, 10)).toBe('2025-12-25');
    expect(max.toISOString().slice(0, 10)).toBe('2026-01-18');
  });

  it('uses the 10%-of-span padding once the span is large enough to exceed the 7-day floor', () => {
    const { min, max } = computeRange(['2026-01-01'], '2026-12-01');
    const expectedMin = new Date('2026-01-01');
    const expectedMax = new Date('2026-12-01');
    const expectedPad = (expectedMax - expectedMin) * 0.1;
    expect(expectedPad).toBeGreaterThan(7 * DAY_MS); // sanity check this case actually exercises the 10% branch
    expect(min.getTime()).toBe(expectedMin.getTime() - expectedPad);
    expect(max.getTime()).toBe(expectedMax.getTime() + expectedPad);
  });
});

describe('leftPercent', () => {
  const range = { min: new Date('2026-01-01'), max: new Date('2026-01-11') };

  it('places the start of the range at 0% and the end at 100%', () => {
    expect(leftPercent('2026-01-01', range)).toBe(0);
    expect(leftPercent('2026-01-11', range)).toBe(100);
  });

  it('places the midpoint at 50%', () => {
    expect(leftPercent('2026-01-06', range)).toBe(50);
  });

  it('clamps dates outside the range to the nearest edge instead of extrapolating', () => {
    expect(leftPercent('2025-01-01', range)).toBe(0);
    expect(leftPercent('2027-01-01', range)).toBe(100);
  });
});

describe('computeTrackWidth', () => {
  const opts = { basePxPerDay: 5, minWidth: 900, maxWidth: 16000 };

  it('clamps to the minimum width for a very short range', () => {
    const range = { min: new Date('2026-01-01'), max: new Date('2026-01-02') };
    expect(computeTrackWidth(range, 1, opts)).toBe(900);
  });

  it('clamps to the maximum width for a very long range', () => {
    const range = { min: new Date('2000-01-01'), max: new Date('2050-01-01') };
    expect(computeTrackWidth(range, 6, opts)).toBe(16000);
  });

  it('scales linearly with zoom level within the clamped bounds', () => {
    const range = { min: new Date('2026-01-01'), max: new Date('2026-10-28') }; // 300 days
    const atZoom1 = computeTrackWidth(range, 1, opts);
    const atZoom2 = computeTrackWidth(range, 2, opts);
    expect(atZoom1).toBe(1500); // 300 days * 5px, above the 900px floor
    expect(atZoom2).toBe(3000); // 300 days * 10px
  });
});

describe('computeSemanticZoomLabel', () => {
  it('maps pxPerDay to the five named tiers in ascending order', () => {
    expect(computeSemanticZoomLabel(2, 16)).toBe('Jahr');
    expect(computeSemanticZoomLabel(5, 16)).toBe('Quartal');
    expect(computeSemanticZoomLabel(10, 16)).toBe('Monat');
    expect(computeSemanticZoomLabel(20, 16)).toBe('Woche');
    expect(computeSemanticZoomLabel(30, 16)).toBe('Tag');
  });

  it('treats the day-grid threshold as the Monat/Woche boundary', () => {
    expect(computeSemanticZoomLabel(15.9, 16)).toBe('Monat');
    expect(computeSemanticZoomLabel(16, 16)).toBe('Woche');
  });
});
