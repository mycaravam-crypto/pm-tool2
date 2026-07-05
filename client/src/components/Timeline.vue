<script setup>
import { CalendarSearch, RotateCcw, ZoomIn, ZoomOut } from 'lucide-vue-next';
import { computed, nextTick, onMounted, ref } from 'vue';
import { formatDate, formatMonthYear, todayStr as getTodayStr } from '../lib/dateFormat.js';
import { resolveEventVisual } from '../lib/eventTypes.js';
import { useProjectStore } from '../stores/useProjectStore.js';

const emit = defineEmits(['select-event']);
const store = useProjectStore();

const todayStr = getTodayStr();
const DAY_MS = 86400000;
const TRACK_HEIGHT = 400;
const BASELINE_TOP = 280;
// Each stacked unit is icon (40px) + label gap (6px) + one line of title text (~14px) = ~60px tall.
// STACK_BASE must clear that whole unit above the baseline, or the title dips below the line.
const STACK_BASE = 76;
const STACK_STEP = 74;

// Zoom controls pixels-per-day directly, so "zoom in" is literally "give nearby
// events more room" — which is also how label collisions get resolved, see
// CLUSTER_THRESHOLD_PX below.
const BASE_PX_PER_DAY = 5;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.4;
const MAX_TRACK_WIDTH = 16000;
// Two truncated title labels (max-w-22 = 88px, centered under their icon) start
// visually colliding once their icons are closer than about this many pixels.
const CLUSTER_THRESHOLD_PX = 90;

const zoomLevel = ref(1);
const scrollContainer = ref(null);

const range = computed(() => {
  const dates = store.events.map((e) => e.date);
  dates.push(todayStr);
  if (dates.length === 1) {
    const only = new Date(dates[0]);
    return { min: new Date(only.getTime() - 30 * DAY_MS), max: new Date(only.getTime() + 30 * DAY_MS) };
  }
  const sorted = [...dates].sort();
  const min = new Date(sorted[0]);
  const max = new Date(sorted[sorted.length - 1]);
  const pad = Math.max((max - min) * 0.1, 7 * DAY_MS);
  return { min: new Date(min.getTime() - pad), max: new Date(max.getTime() + pad) };
});

const trackWidth = computed(() => {
  const days = (range.value.max - range.value.min) / DAY_MS;
  const pxPerDay = BASE_PX_PER_DAY * zoomLevel.value;
  return Math.min(MAX_TRACK_WIDTH, Math.max(900, Math.round(days * pxPerDay)));
});

function leftPercent(dateStr) {
  const { min, max } = range.value;
  const t = new Date(dateStr).getTime();
  const pct = ((t - min.getTime()) / (max.getTime() - min.getTime())) * 100;
  return Math.min(100, Math.max(0, pct));
}

const todayLeftPercent = computed(() => leftPercent(todayStr));

// Groups events close enough in *rendered pixel space* to collide, not just events
// sharing an exact date. At low zoom many days collapse into the same handful of
// pixels, so nearby-but-different-date events need to stack too; at high zoom the
// same events end up far enough apart to stand alone. Recomputes with trackWidth,
// so zooming in is the fix for "labels are colliding."
const clusters = computed(() => {
  const sorted = [...store.events].sort((a, b) => a.date.localeCompare(b.date));
  const width = trackWidth.value;
  const result = [];
  let prevPx = null;
  let prevIsFuture = null;
  for (const event of sorted) {
    const pct = leftPercent(event.date);
    const px = (pct / 100) * width;
    const isFuture = event.date >= todayStr;
    const withVisual = { ...event, visual: resolveEventVisual(event, todayStr) };
    const withinThreshold = result.length > 0 && prevPx !== null && Math.abs(px - prevPx) < CLUSTER_THRESHOLD_PX;
    // A cluster renders every event at its first member's x-position (the rest
    // stack vertically above it) — so a cluster must never straddle "today," or
    // an after-today event pulled into a before-today cluster would render on
    // the wrong side of the marker, even though its own position is correct.
    if (withinThreshold && prevIsFuture === isFuture) {
      result[result.length - 1].events.push(withVisual);
    } else {
      result.push({ leftPercent: pct, events: [withVisual] });
    }
    prevPx = px;
    prevIsFuture = isFuture;
  }
  return result;
});

// Flattened for TransitionGroup, which needs a single-level v-for to animate
// individual entries in/out as filtering (sidebar project selection) adds or
// removes events — the nested cluster/event structure above is still what
// decides each bubble's position, just re-shaped into one list here.
const positionedEvents = computed(() => {
  return clusters.value.flatMap((cluster) =>
    cluster.events.map((event, idx) => ({ ...event, leftPercent: cluster.leftPercent, stackIndex: idx })),
  );
});

// Month gridlines give the timeline a sense of scale beyond the "Past/Future" corner labels.
const monthMarkers = computed(() => {
  const { min, max } = range.value;
  const markers = [];
  const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
  if (cursor < min) cursor.setMonth(cursor.getMonth() + 1);
  while (cursor <= max) {
    const dateStr = cursor.toISOString().slice(0, 10);
    markers.push({
      key: dateStr,
      leftPercent: leftPercent(dateStr),
      label: formatMonthYear(cursor),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return markers;
});

function scrollToDate(dateStr) {
  const container = scrollContainer.value;
  if (!container) return;
  const px = (leftPercent(dateStr) / 100) * trackWidth.value;
  container.scrollLeft = Math.max(0, px - container.clientWidth / 2);
}
function scrollToToday() {
  scrollToDate(todayStr);
}

const jumpDate = ref('');
function jumpToDate() {
  if (!jumpDate.value) return;
  scrollToDate(jumpDate.value);
}

// Re-centers on whatever was in the middle of the viewport before zooming, so a
// zoom click doesn't jump the view to an unrelated part of the timeline.
function zoomBy(factor) {
  const container = scrollContainer.value;
  const oldWidth = trackWidth.value;
  const oldCenterRatio = container ? (container.scrollLeft + container.clientWidth / 2) / oldWidth : 0.5;

  zoomLevel.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(zoomLevel.value * factor).toFixed(2)));

  nextTick(() => {
    if (!container) return;
    const newWidth = trackWidth.value;
    container.scrollLeft = Math.max(0, oldCenterRatio * newWidth - container.clientWidth / 2);
  });
}
function zoomIn() {
  zoomBy(ZOOM_STEP);
}
function zoomOut() {
  zoomBy(1 / ZOOM_STEP);
}
function resetZoom() {
  zoomLevel.value = 1;
  nextTick(scrollToToday);
}

onMounted(() => nextTick(scrollToToday));
</script>

<template>
  <div class="p-6">
    <div v-if="store.selectedProjectIds.length === 0" class="text-center py-24 text-slate-400">
      Select a project from the sidebar to see its timeline.
    </div>
    <div v-else-if="store.loading && store.events.length === 0" class="text-center py-24 text-slate-400">
      Loading events…
    </div>
    <div v-else-if="!store.loading && store.events.length === 0" class="text-center py-24 text-slate-400">
      No events yet for the selected project(s).
    </div>
    <!-- Kept mounted across a background refetch (e.g. toggling a project
         checkbox) whenever there's already something to show, rather than
         swapping to the "Loading…" branch above and destroying/recreating
         this whole subtree — that was killing the enter/leave transitions
         below since TransitionGroup had no continuity to animate across. -->
    <template v-else>
      <div class="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <div class="flex items-center gap-4 text-xs text-slate-500">
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full border-2 border-slate-400" /> Record</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 border-2 border-slate-400 rotate-45" /> Milestone / Deadline</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-50 border-2 border-emerald-500" /> Achieved</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-rose-50 border-2 border-rose-500" /> Missed</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-50 border-2 border-amber-500" /> Overdue, unmarked</span>
          <span v-if="store.loading" class="text-slate-400 italic">Updating…</span>
        </div>

        <div class="flex items-center gap-3">
          <span class="text-xs font-medium text-rose-600 whitespace-nowrap">Heute — {{ formatDate(todayStr) }}</span>
          <form class="flex items-center gap-1" @submit.prevent="jumpToDate">
            <input v-model="jumpDate" type="date" class="border border-slate-300 rounded px-2 py-1 text-xs" />
            <button
              type="submit"
              class="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
              title="Jump to date" :disabled="!jumpDate"
            ><CalendarSearch class="w-4 h-4" /></button>
          </form>
          <div class="flex items-center gap-1">
            <button
              class="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
              title="Zoom out" :disabled="zoomLevel <= ZOOM_MIN" @click="zoomOut"
            ><ZoomOut class="w-4 h-4" /></button>
            <span class="text-xs text-slate-500 w-11 text-center tabular-nums">{{ Math.round(zoomLevel * 100) }}%</span>
            <button
              class="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
              title="Zoom in" :disabled="zoomLevel >= ZOOM_MAX" @click="zoomIn"
            ><ZoomIn class="w-4 h-4" /></button>
            <button
              class="p-1.5 rounded text-slate-500 hover:bg-slate-100"
              title="Reset zoom and jump to today" @click="resetZoom"
            ><RotateCcw class="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      <div ref="scrollContainer" class="relative overflow-x-auto pb-4">
        <div class="relative transition-[min-width] duration-300 ease-out" :style="{ height: TRACK_HEIGHT + 'px', minWidth: trackWidth + 'px' }">
          <!-- month gridlines -->
          <TransitionGroup name="fade-pop" tag="div">
            <div
              v-for="m in monthMarkers" :key="m.key"
              class="absolute top-0 w-px bg-slate-100 transition-[left] duration-300 ease-out"
              :style="{ left: m.leftPercent + '%', height: BASELINE_TOP + 'px' }"
            />
          </TransitionGroup>
          <TransitionGroup name="fade-pop" tag="div">
            <div
              v-for="m in monthMarkers" :key="'label-' + m.key"
              class="absolute text-[11px] text-slate-400 -translate-x-1/2 whitespace-nowrap transition-[left] duration-300 ease-out"
              :style="{ left: m.leftPercent + '%', top: (BASELINE_TOP + 10) + 'px' }"
            >{{ m.label }}</div>
          </TransitionGroup>

          <!-- baseline -->
          <div class="absolute left-0 right-0 h-px bg-slate-300" :style="{ top: BASELINE_TOP + 'px' }" />

          <div class="absolute text-xs font-medium text-slate-400 left-0" :style="{ top: BASELINE_TOP + 'px', transform: 'translateY(-24px)' }">Past</div>
          <div class="absolute text-xs font-medium text-slate-400 right-0" :style="{ top: BASELINE_TOP + 'px', transform: 'translateY(-24px)' }">Future</div>

          <!-- today marker -->
          <div class="absolute top-0 w-px bg-rose-400 z-10" :style="{ left: todayLeftPercent + '%', height: BASELINE_TOP + 'px' }">
            <span class="absolute -top-1 left-1.5 text-[10px] text-rose-500 font-medium whitespace-nowrap">Heute · {{ formatDate(todayStr) }}</span>
          </div>

          <!-- event bubbles: a flat, TransitionGroup-animated list so events
               entering/leaving as the sidebar's project filter changes fade
               and pop instead of snapping in/out; ongoing left/top transitions
               (re-clustering, zoom, filtering-driven range changes) still
               apply per-element via the transition-[left,top] utility below -->
          <TransitionGroup name="event-pop" tag="div">
            <div
              v-for="event in positionedEvents"
              :key="event.id"
              class="absolute -translate-x-1/2 flex flex-col items-center transition-[left,top] duration-300 ease-out"
              :style="{ left: event.leftPercent + '%', top: `${BASELINE_TOP - (STACK_BASE + event.stackIndex * STACK_STEP)}px` }"
            >
              <button
                class="group relative flex items-center justify-center w-10 h-10 shadow hover:shadow-md hover:-translate-y-0.5 transition-all"
                :class="[event.visual.shape === 'diamond' ? 'rotate-45' : 'rounded-full', event.visual.bgClass]"
                :style="{ border: `2px solid ${event.project.color_hex}` }"
                :title="`${event.title} — ${event.project.name} (${formatDate(event.date)})${event.status !== 'pending' ? ' — ' + event.status : ''}`"
                @click="emit('select-event', event)"
              >
                <component
                  :is="event.visual.icon"
                  class="w-4 h-4"
                  :class="[event.visual.iconClass, event.visual.shape === 'diamond' ? '-rotate-45' : '']"
                />
              </button>
              <span
                class="mt-1.5 max-w-22 truncate text-[11px] leading-tight text-slate-600 text-center"
                :title="event.title"
              >{{ event.title }}</span>
            </div>
          </TransitionGroup>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Event bubbles: pop + fade in/out as the sidebar's project filter adds or
   removes events. `scale`/`opacity` are used instead of `transform` so this
   doesn't fight the persistent `-translate-x-1/2` centering transform already
   on the element — the two compose independently. */
.event-pop-enter-active,
.event-pop-leave-active {
  transition: opacity 220ms ease, scale 220ms ease;
}
.event-pop-enter-from,
.event-pop-leave-to {
  opacity: 0;
  scale: 0.5;
}
.event-pop-leave-active {
  /* Removed nodes stay put (they're already position:absolute, so this has no
     layout effect) rather than being yanked out before the fade finishes. */
  pointer-events: none;
}

/* Month gridlines/labels: simple fade as the visible date range shifts. */
.fade-pop-enter-active,
.fade-pop-leave-active {
  transition: opacity 220ms ease;
}
.fade-pop-enter-from,
.fade-pop-leave-to {
  opacity: 0;
}
</style>
