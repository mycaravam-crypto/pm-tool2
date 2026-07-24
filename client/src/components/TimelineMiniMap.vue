<script setup>
import { computed } from 'vue';

const props = defineProps({
  range: { type: Object, required: true },
  events: { type: Array, default: () => [] },
  todayStr: { type: String, required: true },
  viewportStartPct: { type: Number, required: true },
  viewportWidthPct: { type: Number, required: true },
});
const emit = defineEmits(['navigate']);

// Density is bucketed into a fixed number of slices rather than one bar per
// event, so the minimap stays cheap to render no matter how many events are
// in range — a project with 10 events and one with 10,000 produce the same
// number of DOM nodes here.
const BUCKET_COUNT = 120;
const KEY_STEP_PCT = 2;

function toPercent(dateStr) {
  const t = new Date(dateStr).getTime();
  const { min, max } = props.range;
  const span = max.getTime() - min.getTime();
  if (span <= 0) return 0;
  return Math.min(100, Math.max(0, ((t - min.getTime()) / span) * 100));
}

const densityBuckets = computed(() => {
  const counts = new Array(BUCKET_COUNT).fill(0);
  for (const event of props.events) {
    const idx = Math.min(BUCKET_COUNT - 1, Math.floor((toPercent(event.date) / 100) * BUCKET_COUNT));
    counts[idx] += 1;
  }
  const maxCount = Math.max(1, ...counts);
  return counts.map((count, i) => ({
    key: i,
    leftPercent: (i / BUCKET_COUNT) * 100,
    // A bucket with any events at all stays readable (min 15% height) instead
    // of shrinking to a sliver next to a single very dense bucket.
    heightPercent: count > 0 ? Math.max(15, (count / maxCount) * 100) : 0,
  }));
});

const todayPercent = computed(() => toPercent(props.todayStr));
const viewportCenterPercent = computed(() => props.viewportStartPct + props.viewportWidthPct / 2);

function navigateToClientX(clientX, trackRect) {
  const pct = Math.min(100, Math.max(0, ((clientX - trackRect.left) / trackRect.width) * 100));
  emit('navigate', pct);
}

function handleTrackClick(e) {
  navigateToClientX(e.clientX, e.currentTarget.getBoundingClientRect());
}

// Dragging the viewport window itself re-targets on every move (rather than
// tracking a delta), which reads the same as clicking elsewhere on the strip —
// simple scrubber behavior instead of a second, subtly different drag model.
function handleViewportPointerDown(e) {
  e.stopPropagation();
  const track = e.currentTarget.parentElement;
  function onMove(ev) {
    navigateToClientX(ev.clientX, track.getBoundingClientRect());
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function handleKeydown(e) {
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    emit('navigate', Math.max(0, viewportCenterPercent.value - KEY_STEP_PCT));
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    emit('navigate', Math.min(100, viewportCenterPercent.value + KEY_STEP_PCT));
  }
}
</script>

<template>
  <div
    class="relative h-9 rounded bg-slate-100 border border-slate-200 overflow-hidden cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    role="scrollbar"
    aria-orientation="horizontal"
    aria-controls="timeline-scroll-viewport"
    :aria-valuenow="Math.round(viewportCenterPercent)"
    aria-valuemin="0"
    aria-valuemax="100"
    aria-label="Timeline-Übersicht. Klicken oder ziehen, um zu einem Zeitpunkt zu springen."
    tabindex="0"
    @click="handleTrackClick"
    @keydown="handleKeydown"
  >
    <div
      v-for="b in densityBuckets" :key="b.key"
      class="absolute bottom-0 bg-slate-300"
      :style="{ left: b.leftPercent + '%', width: (100 / BUCKET_COUNT) + '%', height: b.heightPercent + '%' }"
    />

    <div class="absolute top-0 bottom-0 w-px bg-rose-400" :style="{ left: todayPercent + '%' }" />

    <div
      class="absolute top-0 bottom-0 bg-indigo-500/20 border-x-2 border-indigo-500 cursor-grab hover:bg-indigo-500/30 transition-colors"
      :style="{ left: viewportStartPct + '%', width: Math.max(viewportWidthPct, 1.5) + '%' }"
      @pointerdown="handleViewportPointerDown"
    />
  </div>
</template>
