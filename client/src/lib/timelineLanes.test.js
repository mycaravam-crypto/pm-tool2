import { describe, expect, it } from 'vitest';
import { computeLanes } from './timelineLanes.js';

function item(id, start, end) {
  return { id, start, end };
}
const opts = { getStart: (i) => i.start, getEnd: (i) => i.end, getTieBreakKey: (i) => i.id };

function laneById(assignments) {
  return Object.fromEntries(assignments.map(({ item: i, lane }) => [i.id, lane]));
}

describe('computeLanes', () => {
  it('puts non-overlapping items in the same lane', () => {
    const items = [item('a', 0, 10), item('b', 20, 30)];
    const { assignments, laneCount } = computeLanes(items, opts);
    expect(laneById(assignments)).toEqual({ a: 0, b: 0 });
    expect(laneCount).toBe(1);
  });

  it('puts overlapping items in different lanes', () => {
    const items = [item('a', 0, 10), item('b', 5, 15)];
    const { assignments, laneCount } = computeLanes(items, opts);
    expect(laneById(assignments)).toEqual({ a: 0, b: 1 });
    expect(laneCount).toBe(2);
  });

  it('reuses a lane once its occupant has ended', () => {
    // a[0,10] and c[12,20] don't overlap, so c should reuse a's lane even
    // though b[5,15] (which does overlap both) needs a lane of its own.
    const items = [item('a', 0, 10), item('b', 5, 15), item('c', 12, 20)];
    const { assignments, laneCount } = computeLanes(items, opts);
    expect(laneById(assignments)).toEqual({ a: 0, b: 1, c: 0 });
    expect(laneCount).toBe(2); // minimal lane count, not one per item
  });

  it('minimizes lane count to the maximum simultaneous overlap depth', () => {
    // a, b, c all mutually overlap at position 5 -> need 3 lanes regardless
    // of how many other non-overlapping items exist alongside them.
    const items = [item('a', 0, 10), item('b', 0, 10), item('c', 0, 10), item('d', 100, 110)];
    const { laneCount } = computeLanes(items, opts);
    expect(laneCount).toBe(3);
  });

  it('produces the same per-item lane assignment regardless of input order (reproducibility)', () => {
    const items = [item('a', 0, 10), item('b', 5, 15), item('c', 12, 20)];
    const forward = laneById(computeLanes(items, opts).assignments);
    const shuffled = laneById(computeLanes([items[2], items[0], items[1]], opts).assignments);
    const reversed = laneById(computeLanes([...items].reverse(), opts).assignments);
    expect(shuffled).toEqual(forward);
    expect(reversed).toEqual(forward);
  });

  it('breaks ties between equal-start items deterministically via getTieBreakKey', () => {
    const items = [item('z', 0, 10), item('a', 0, 10)];
    const { assignments } = computeLanes(items, opts);
    // 'a' sorts before 'z' by tie-break key, so it's placed first (lane 0)
    // even though it appears second in the input array.
    expect(laneById(assignments)).toEqual({ a: 0, z: 1 });
  });

  it('defaults the tie-break to original array index when none is provided', () => {
    const items = [item('first', 0, 10), item('second', 0, 10)];
    const { assignments } = computeLanes(items, { getStart: opts.getStart, getEnd: opts.getEnd });
    expect(laneById(assignments)).toEqual({ first: 0, second: 1 });
  });

  it('treats a touching boundary (end === start) as non-overlapping', () => {
    const items = [item('a', 0, 10), item('b', 10, 20)];
    const { assignments } = computeLanes(items, opts);
    expect(laneById(assignments)).toEqual({ a: 0, b: 0 });
  });
});
