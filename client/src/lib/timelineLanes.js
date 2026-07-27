// Deterministic greedy interval-scheduling lane assignment — the same algorithm
// calendar/Gantt views use to lay out overlapping items into the minimum number
// of non-overlapping rows. Items sort by start position (stable tie-break so
// identical input always produces identical output), then each is greedily
// placed in the lowest-numbered lane whose last item ends at or before this
// one's start; otherwise a new lane opens.
//
// getStart/getEnd map an item to its footprint's [start, end) — e.g. a pixel
// range on the timeline. getTieBreakKey (optional) breaks start ties; defaults
// to each item's original index.
export function computeLanes(items, { getStart, getEnd, getTieBreakKey }) {
  const indexed = items.map((item, index) => ({ item, index }));
  indexed.sort((a, b) => {
    const startDiff = getStart(a.item) - getStart(b.item);
    if (startDiff !== 0) return startDiff;
    const tieA = getTieBreakKey ? getTieBreakKey(a.item) : a.index;
    const tieB = getTieBreakKey ? getTieBreakKey(b.item) : b.index;
    if (tieA < tieB) return -1;
    if (tieA > tieB) return 1;
    return a.index - b.index;
  });

  // laneEnds[lane] tracks the end position of the last item placed in that lane.
  const laneEnds = [];
  const assignments = new Array(items.length);
  for (const { item, index } of indexed) {
    const start = getStart(item);
    const end = getEnd(item);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    assignments[index] = { item, lane };
  }
  return { assignments, laneCount: laneEnds.length };
}
