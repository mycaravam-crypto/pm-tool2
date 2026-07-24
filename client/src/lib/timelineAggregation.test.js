import { describe, expect, it } from 'vitest';
import { computeClusters, computePositionedEvents } from './timelineAggregation.js';

const range = { min: new Date('2026-01-01'), max: new Date('2026-01-31') }; // 30-day range
const resolveVisual = () => ({ tag: 'visual' });

function event(id, date) {
  return { id, date, title: `Event ${id}` };
}

describe('computeClusters', () => {
  it('keeps far-apart events in separate clusters', () => {
    const events = [event(1, '2026-01-01'), event(2, '2026-01-31')];
    const clusters = computeClusters(events, {
      range,
      trackWidth: 900,
      todayStr: '2026-01-01',
      thresholdPx: 90,
      resolveVisual,
    });
    expect(clusters).toHaveLength(2);
    expect(clusters[0].events.map((e) => e.id)).toEqual([1]);
    expect(clusters[1].events.map((e) => e.id)).toEqual([2]);
  });

  it('groups events within the pixel threshold into one cluster', () => {
    // 900px track over 30 days = 30px/day; two events one day apart = 30px < 90px threshold
    const events = [event(1, '2026-01-01'), event(2, '2026-01-02')];
    const clusters = computeClusters(events, {
      range,
      trackWidth: 900,
      todayStr: '2026-01-01',
      thresholdPx: 90,
      resolveVisual,
    });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].events.map((e) => e.id)).toEqual([1, 2]);
  });

  it('anchors each cluster to its first member so a chain of near-threshold gaps does not merge unboundedly', () => {
    // 900px / 30 days = 30px/day. Events at day 0, 2, 4: gaps of 60px each (< 90px
    // threshold vs. the *previous* event) but 60px and 120px vs. the *anchor* —
    // anchoring must split this into two clusters, not one spanning 120px.
    const events = [event(1, '2026-01-01'), event(2, '2026-01-03'), event(3, '2026-01-05')];
    const clusters = computeClusters(events, {
      range,
      trackWidth: 900,
      todayStr: '2026-01-01',
      thresholdPx: 90,
      resolveVisual,
    });
    expect(clusters).toHaveLength(2);
    expect(clusters[0].events.map((e) => e.id)).toEqual([1, 2]);
    expect(clusters[1].events.map((e) => e.id)).toEqual([3]);
  });

  it('never merges a past event and a future event into the same cluster, even if close in pixels', () => {
    const events = [event(1, '2026-01-14'), event(2, '2026-01-16')];
    // todayStr falls between the two dates: one is past, one is future
    const clusters = computeClusters(events, {
      range,
      trackWidth: 900,
      todayStr: '2026-01-15',
      thresholdPx: 90,
      resolveVisual,
    });
    expect(clusters).toHaveLength(2);
  });

  it('sorts events by date before clustering regardless of input order', () => {
    const events = [event(2, '2026-01-31'), event(1, '2026-01-01')];
    const clusters = computeClusters(events, {
      range,
      trackWidth: 900,
      todayStr: '2026-01-01',
      thresholdPx: 90,
      resolveVisual,
    });
    expect(clusters[0].events[0].id).toBe(1);
    expect(clusters[1].events[0].id).toBe(2);
  });

  it('attaches a resolved visual to every event', () => {
    const events = [event(1, '2026-01-01')];
    const clusters = computeClusters(events, {
      range,
      trackWidth: 900,
      todayStr: '2026-01-01',
      thresholdPx: 90,
      resolveVisual,
    });
    expect(clusters[0].events[0].visual).toEqual({ tag: 'visual' });
  });
});

describe('computePositionedEvents', () => {
  it('passes clusters at or under the stack limit through with sequential stack indices', () => {
    const clusters = [{ leftPercent: 10, events: [event(1, '2026-01-01'), event(2, '2026-01-01')] }];
    const positioned = computePositionedEvents(clusters, 3);
    expect(positioned).toEqual([
      { ...event(1, '2026-01-01'), leftPercent: 10, stackIndex: 0, isOverflow: false },
      { ...event(2, '2026-01-01'), leftPercent: 10, stackIndex: 1, isOverflow: false },
    ]);
  });

  it('folds events beyond the stack limit into a single overflow entry', () => {
    const events = [event(1, 'd'), event(2, 'd'), event(3, 'd'), event(4, 'd'), event(5, 'd')];
    const clusters = [{ leftPercent: 50, events }];
    const positioned = computePositionedEvents(clusters, 3);
    // maxVisibleStack=3 -> 2 visible (idx 0,1) + 1 overflow slot (idx 2) holding the rest
    expect(positioned).toHaveLength(3);
    expect(positioned[0]).toMatchObject({ id: 1, stackIndex: 0, isOverflow: false });
    expect(positioned[1]).toMatchObject({ id: 2, stackIndex: 1, isOverflow: false });
    expect(positioned[2]).toMatchObject({ id: 'overflow-1', stackIndex: 2, isOverflow: true });
    expect(positioned[2].overflowEvents.map((e) => e.id)).toEqual([3, 4, 5]);
  });

  it('caps the tallest cluster at the same height regardless of how many events overflow', () => {
    const small = computePositionedEvents(
      [{ leftPercent: 0, events: [event(1, 'd'), event(2, 'd'), event(3, 'd'), event(4, 'd')] }],
      3,
    );
    const large = computePositionedEvents(
      [{ leftPercent: 0, events: Array.from({ length: 50 }, (_, i) => event(i, 'd')) }],
      3,
    );
    const maxStackIndex = (list) => Math.max(...list.map((e) => e.stackIndex));
    expect(maxStackIndex(small)).toBe(maxStackIndex(large));
  });
});
