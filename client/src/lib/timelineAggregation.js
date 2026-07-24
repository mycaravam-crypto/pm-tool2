// Pure collision-avoidance logic for the event timeline (Timeline.vue): groups
// events that would visually overlap into clusters, then flattens clusters
// into a stacked, render-ready list with a bounded overflow badge. Pulled out
// of the component so it can be unit-tested without mounting Vue.

import { leftPercent } from './timelineScale.js';

// Groups events close enough in *rendered pixel space* to collide, not just
// events sharing an exact date — at low zoom many days collapse into the same
// handful of pixels, so nearby-but-different-date events need to cluster too.
// Each cluster is measured against its anchor (first member), not the previous
// event, so a chain of near-threshold gaps can't merge into one cluster
// spanning many multiples of the threshold. A cluster never straddles "today":
// mixing a based-on-arrival past/future split into the same visual group would
// place an after-today event on the wrong side of the today marker.
export function computeClusters(events, { range, trackWidth, todayStr, thresholdPx, resolveVisual }) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const result = [];
  let anchorPx = null;
  let anchorIsFuture = null;
  for (const event of sorted) {
    const pct = leftPercent(event.date, range);
    const px = (pct / 100) * trackWidth;
    const isFuture = event.date >= todayStr;
    const withVisual = { ...event, visual: resolveVisual(event, todayStr) };
    const withinThreshold = anchorPx !== null && Math.abs(px - anchorPx) < thresholdPx;
    if (withinThreshold && anchorIsFuture === isFuture) {
      result[result.length - 1].events.push(withVisual);
    } else {
      result.push({ leftPercent: pct, events: [withVisual] });
      anchorPx = px;
      anchorIsFuture = isFuture;
    }
  }
  return result;
}

// Flattens clusters into a single render-ready list. Clusters at or under
// maxVisibleStack render every event normally; larger ones show the first
// (maxVisibleStack - 1) events and fold the rest into one overflow badge in
// the last slot, so the tallest a cluster ever gets is the same regardless of
// how many events it actually contains.
export function computePositionedEvents(clusters, maxVisibleStack) {
  return clusters.flatMap((cluster) => {
    const events = cluster.events;
    if (events.length <= maxVisibleStack) {
      return events.map((event, idx) => ({
        ...event,
        leftPercent: cluster.leftPercent,
        stackIndex: idx,
        isOverflow: false,
      }));
    }
    const visible = events
      .slice(0, maxVisibleStack - 1)
      .map((event, idx) => ({ ...event, leftPercent: cluster.leftPercent, stackIndex: idx, isOverflow: false }));
    const overflowEvents = events.slice(maxVisibleStack - 1);
    return [
      ...visible,
      {
        id: `overflow-${events[0].id}`,
        isOverflow: true,
        leftPercent: cluster.leftPercent,
        stackIndex: maxVisibleStack - 1,
        overflowEvents,
      },
    ];
  });
}
