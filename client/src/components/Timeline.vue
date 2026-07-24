<script setup>
import { CalendarSearch, Repeat, RotateCcw, ZoomIn, ZoomOut } from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { formatDate, formatMonthYear, formatYear, todayStr as getTodayStr } from '../lib/dateFormat.js';
import { resolveEventVisual } from '../lib/eventTypes.js';
import { computeClusters as computeClustersPure, computePositionedEvents } from '../lib/timelineAggregation.js';
import {
  computeRange,
  computeSemanticZoomLabel,
  computeTrackWidth,
  leftPercent as leftPercentPure,
} from '../lib/timelineScale.js';
import { useProjectStore } from '../stores/useProjectStore.js';
import HelpTooltip from './HelpTooltip.vue';
import TimelineMiniMap from './TimelineMiniMap.vue';

const emit = defineEmits(['select-event', 'new-event']);
const store = useProjectStore();

const todayStr = getTodayStr();
const DAY_MS = 86400000;
const TRACK_HEIGHT = 400;
const BASELINE_TOP = 280;
// Each stacked unit is icon (40px) + label gap (6px) + one line of title text (~14px) = ~60px tall.
// STACK_BASE must clear that whole unit above the baseline, or the title dips below the line.
const STACK_BASE = 76;
const STACK_STEP = 74;
// Beyond this many events, a cluster collapses the rest into a "+N" badge
// instead of stacking indefinitely — an unbounded stack eventually pushes
// bubbles above the track entirely, which is exactly the overlay-timeline
// promise ("see clusters at a glance") breaking down under real multi-project
// density. Capping keeps the max stack offset constant regardless of size.
// 3, not 4: with STACK_BASE/STACK_STEP above, tier index 3 lands at
// BASELINE_TOP - (76 + 3*74) = -18px — off the top of the track and into
// whatever sits above it (the "Today" label included). Tier index 2 (56px)
// is the tallest one that still fits.
const MAX_VISIBLE_STACK = 3;

// Zoom controls pixels-per-day directly, so "zoom in" is literally "give nearby
// events more room" — which is also how label collisions get resolved, see
// CLUSTER_THRESHOLD_PX below.
const BASE_PX_PER_DAY = 5;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.4;
// Continuous zoom factor per wheel-delta unit (vs. the fixed ZOOM_STEP used by
// the +/- buttons), so a single scroll gesture zooms smoothly rather than in clicky jumps.
const WHEEL_ZOOM_SENSITIVITY = 0.0018;
const MAX_TRACK_WIDTH = 16000;
// Two truncated title labels (max-w-22 = 88px, centered under their icon) start
// visually colliding once their icons are closer than about this many pixels.
const CLUSTER_THRESHOLD_PX = 90;
// Day gridlines only render once each day has this much width — below it
// they'd pack into an illegible solid band, so day-level detail stays hidden
// until you've zoomed in far enough for it to actually read as detail.
const DAY_GRID_MIN_PX_PER_DAY = 16;

// A dblclick within this many pixels of a mousedown still counts as "did not
// drag" — trackpads and imprecise pointers rarely land the second click on
// the exact pixel of the first, so a zero-tolerance check would make
// double-click-to-create feel broken for anyone not using a mouse on glass.
const DRAG_MOVE_THRESHOLD_PX = 4;
// Arrow-key panning moves a week at the current zoom; Shift+Arrow jumps a
// near-full viewport, mirroring how PageUp/PageDown behave in text editors.
const KEY_PAN_DAYS = 7;

const zoomLevel = ref(1);
const scrollContainer = ref(null);
const trackEl = ref(null);
const isPanning = ref(false);

// Named zoom tiers so the toolbar readout matches the issue's semantic-zoom
// vocabulary (Jahr/Quartal/Monat/Woche/Tag) instead of a bare percentage —
// thresholds are picked against the actual pxPerDay range this component
// produces (BASE_PX_PER_DAY * [ZOOM_MIN..ZOOM_MAX] = 2..30). Delegates to
// timelineScale.js so the tier logic has a unit-testable, Vue-free home.
const semanticZoomLabel = computed(() =>
  computeSemanticZoomLabel(BASE_PX_PER_DAY * zoomLevel.value, DAY_GRID_MIN_PX_PER_DAY),
);

const range = computed(() =>
  computeRange(
    store.events.map((e) => e.date),
    todayStr,
  ),
);

const trackWidth = computed(() =>
  computeTrackWidth(range.value, zoomLevel.value, {
    basePxPerDay: BASE_PX_PER_DAY,
    minWidth: 900,
    maxWidth: MAX_TRACK_WIDTH,
  }),
);

function leftPercent(dateStr) {
  return leftPercentPure(dateStr, range.value);
}

const todayLeftPercent = computed(() => leftPercent(todayStr));

// Groups events close enough in *rendered pixel space* to collide, not just events
// sharing an exact date. At low zoom many days collapse into the same handful of
// pixels, so nearby-but-different-date events need to stack too; at high zoom the
// same events end up far enough apart to stand alone. Recomputes with trackWidth,
// so zooming in is the fix for "labels are colliding." Logic lives in
// timelineAggregation.js so it's unit-testable without mounting the component.
const clusters = computed(() =>
  computeClustersPure(store.events, {
    range: range.value,
    trackWidth: trackWidth.value,
    todayStr,
    thresholdPx: CLUSTER_THRESHOLD_PX,
    resolveVisual: resolveEventVisual,
  }),
);

// Flattened for TransitionGroup, which needs a single-level v-for to animate
// individual entries in/out as filtering (sidebar project selection) adds or
// removes events — the nested cluster/event structure above is still what
// decides each bubble's position, just re-shaped into one list here.
const positionedEvents = computed(() => computePositionedEvents(clusters.value, MAX_VISIBLE_STACK));

const openOverflowId = ref(null);
function toggleOverflow(id) {
  openOverflowId.value = openOverflowId.value === id ? null : id;
}
function closeOverflow() {
  openOverflowId.value = null;
}
function selectOverflowEvent(event) {
  closeOverflow();
  emit('select-event', event);
}

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

// Year gridlines are the heaviest tier — they anchor the "which year am I in"
// question at a glance, since the month labels below repeat the year on every
// single tick and get easy to lose track of over a multi-year range.
const yearMarkers = computed(() => {
  const { min, max } = range.value;
  const markers = [];
  const cursor = new Date(min.getFullYear(), 0, 1);
  if (cursor < min) cursor.setFullYear(cursor.getFullYear() + 1);
  while (cursor <= max) {
    const dateStr = cursor.toISOString().slice(0, 10);
    markers.push({
      key: dateStr,
      leftPercent: leftPercent(dateStr),
      label: formatYear(cursor),
    });
    cursor.setFullYear(cursor.getFullYear() + 1);
  }
  return markers;
});

// Day gridlines are the lightest tier, gated by DAY_GRID_MIN_PX_PER_DAY (see
// above) so they only appear once you've zoomed in enough for one-per-day
// lines to read as texture instead of a solid smear. Uses the actual rendered
// trackWidth (post-clamping) rather than the nominal zoom-derived px/day, since
// that's what determines how the lines will really look.
const dayMarkers = computed(() => {
  const { min, max } = range.value;
  const totalDays = (max - min) / DAY_MS;
  if (totalDays <= 0 || trackWidth.value / totalDays < DAY_GRID_MIN_PX_PER_DAY) return [];
  const markers = [];
  const cursor = new Date(min.getFullYear(), min.getMonth(), min.getDate());
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= max) {
    const dateStr = cursor.toISOString().slice(0, 10);
    markers.push({ key: dateStr, leftPercent: leftPercent(dateStr) });
    cursor.setDate(cursor.getDate() + 1);
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

// Tracked reactively (rather than read imperatively on demand) so the minimap's
// viewport window can follow every scroll/zoom/pan/resize without each of
// those call sites having to remember to notify it separately.
const scrollLeftPx = ref(0);
const viewportWidthPx = ref(0);
let resizeObserver = null;

function handleScroll() {
  scrollLeftPx.value = scrollContainer.value?.scrollLeft ?? 0;
}

const viewportStartPct = computed(() => {
  const width = trackWidth.value;
  return width > 0 ? Math.min(100, (scrollLeftPx.value / width) * 100) : 0;
});
const viewportWidthPct = computed(() => {
  const width = trackWidth.value;
  return width > 0 ? Math.min(100, (viewportWidthPx.value / width) * 100) : 100;
});

// The minimap emits a plain 0-100 position on the full date range; translate
// that into the same scrollLeft math scrollToDate/zoomBy already use.
function handleMinimapNavigate(pct) {
  const container = scrollContainer.value;
  if (!container) return;
  const targetPx = (pct / 100) * trackWidth.value;
  container.scrollLeft = Math.max(0, targetPx - container.clientWidth / 2);
}

// Re-centers on whatever was under `viewportAnchor` (an x-offset within the
// container's visible area) before zooming, so a zoom doesn't jump the view to
// an unrelated part of the timeline. Defaults to the viewport's own center for
// the +/- buttons; the wheel handler below passes the cursor position instead,
// so scrolling zooms into whatever date you're pointing at.
function zoomBy(factor, viewportAnchor) {
  const container = scrollContainer.value;
  const oldWidth = trackWidth.value;
  const anchor = viewportAnchor ?? (container ? container.clientWidth / 2 : 0);
  const oldRatio = container ? (container.scrollLeft + anchor) / oldWidth : 0.5;

  zoomLevel.value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(zoomLevel.value * factor).toFixed(2)));

  nextTick(() => {
    if (!container) return;
    const newWidth = trackWidth.value;
    container.scrollLeft = Math.max(0, oldRatio * newWidth - anchor);
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

// Lets the mouse wheel zoom the timeline (matching the pinch-to-zoom feel of
// maps/design tools) instead of only offering it via the +/- buttons. Plain
// wheel is free to repurpose here because the track never overflows
// vertically — horizontal panning still works via shift+wheel, trackpad swipe,
// or the scrollbar, none of which this handler touches (deltaY stays ~0 for those).
function handleWheel(e) {
  if (e.deltaY === 0) return;
  const container = scrollContainer.value;
  if (!container) return;
  e.preventDefault();
  const anchor = e.clientX - container.getBoundingClientRect().left;
  zoomBy(Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY), anchor);
}

// Click-and-drag panning for mouse users (trackpads/touch already pan via
// native scroll). Skipped when the press starts on an interactive element —
// event bubbles, the overflow popover, form controls — so their own click
// handling is untouched. `moved` gates the paired dblclick handler below so
// a drag-release-drag never gets misread as a double-click.
let panStartX = 0;
let panStartScrollLeft = 0;
let panMoved = false;
function handlePointerDown(e) {
  if (e.button !== 0) return;
  if (e.target.closest('button, input, a')) return;
  const container = scrollContainer.value;
  if (!container) return;
  isPanning.value = true;
  panMoved = false;
  panStartX = e.clientX;
  panStartScrollLeft = container.scrollLeft;
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
}
function handlePointerMove(e) {
  const container = scrollContainer.value;
  if (!isPanning.value || !container) return;
  const dx = e.clientX - panStartX;
  if (Math.abs(dx) > DRAG_MOVE_THRESHOLD_PX) panMoved = true;
  container.scrollLeft = panStartScrollLeft - dx;
}
function handlePointerUp() {
  isPanning.value = false;
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', handlePointerUp);
}

// Double-click on empty timeline space creates a new event pre-filled with
// the clicked date — clicks on an event/cluster bubble are excluded so they
// keep going to their own click handler instead of also firing this.
function handleDblclick(e) {
  if (panMoved) return;
  if (e.target.closest('button')) return;
  const track = trackEl.value;
  if (!track) return;
  const rect = track.getBoundingClientRect();
  const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
  const { min, max } = range.value;
  const t = min.getTime() + (pct / 100) * (max.getTime() - min.getTime());
  emit('new-event', new Date(t).toISOString().slice(0, 10));
}

// Keyboard equivalents for pan/zoom/today so the timeline is usable without
// a mouse: arrow keys pan (Shift = near-full-viewport jump), +/- zoom, Home
// or 0 return to today — the same actions the toolbar buttons trigger.
function handleKeydown(e) {
  const container = scrollContainer.value;
  if (!container) return;
  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowRight': {
      e.preventDefault();
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      const step = e.shiftKey ? container.clientWidth * 0.9 : BASE_PX_PER_DAY * zoomLevel.value * KEY_PAN_DAYS;
      container.scrollLeft += dir * step;
      break;
    }
    case '+':
    case '=':
      e.preventDefault();
      zoomIn();
      break;
    case '-':
    case '_':
      e.preventDefault();
      zoomOut();
      break;
    case '0':
    case 'Home':
      e.preventDefault();
      resetZoom();
      break;
  }
}

// scrollContainer is only rendered once a project is selected and its events
// have loaded (see the v-if branches below), so it can go from null to an
// element well after this component's own onMounted has already fired —
// watching the ref (rather than a one-shot onMounted) re-attaches the
// observer and re-centers on today whenever that first happens.
watch(
  scrollContainer,
  (el, oldEl) => {
    resizeObserver?.disconnect();
    if (!el) return;
    viewportWidthPx.value = el.clientWidth;
    resizeObserver = new ResizeObserver(() => {
      viewportWidthPx.value = scrollContainer.value?.clientWidth ?? 0;
    });
    resizeObserver.observe(el);
    if (!oldEl) nextTick(scrollToToday);
  },
  { immediate: true },
);
onBeforeUnmount(() => resizeObserver?.disconnect());
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
      <!-- Project color legend: the timeline's overlay only works if you can tell
           whose event is whose without looking away to the sidebar checkboxes. -->
      <div v-if="store.selectedProjects.length > 1" class="flex items-center gap-3 flex-wrap mb-2 text-xs text-slate-600">
        <span
          v-for="p in store.selectedProjects" :key="p.id"
          class="flex items-center gap-1.5"
        >
          <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: p.color_hex }" />{{ p.name }}
        </span>
      </div>

      <div class="flex items-center justify-between gap-4 mb-3 flex-wrap">
        <div class="flex items-center gap-4 text-xs text-slate-500">
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full border-2 border-slate-400" /> Record</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 border-2 border-slate-400 rotate-45" /> Milestone / Deadline</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-50 border-2 border-emerald-500" /> Achieved</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-rose-50 border-2 border-rose-500" /> Missed</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-50 border-2 border-amber-500" /> Overdue, unmarked</span>
          <span class="flex items-center gap-1.5"><span class="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-indigo-600"><Repeat class="w-2 h-2 text-white" /></span> Recurring</span>
          <span v-if="store.loading" class="text-slate-400 italic">Updating…</span>
        </div>

        <div class="flex items-center gap-3">
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
            <span
              class="text-xs text-slate-500 w-16 text-center tabular-nums"
              :title="`Zoom: ${Math.round(zoomLevel * 100)}%`"
            >{{ semanticZoomLabel }}</span>
            <button
              class="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
              title="Zoom in" :disabled="zoomLevel >= ZOOM_MAX" @click="zoomIn"
            ><ZoomIn class="w-4 h-4" /></button>
            <button
              class="p-1.5 rounded text-slate-500 hover:bg-slate-100"
              title="Reset zoom and jump to today" @click="resetZoom"
            ><RotateCcw class="w-4 h-4" /></button>
            <HelpTooltip
              align="right"
              text="Scroll your mouse wheel or trackpad to zoom into whatever date is under your cursor. Click and drag to pan. With the timeline focused: arrow keys pan, +/- zoom, Home jumps to today. Double-click empty space to create an event on that date."
            />
          </div>
        </div>
      </div>

      <TimelineMiniMap
        class="mb-2"
        :range="range"
        :events="store.events"
        :today-str="todayStr"
        :viewport-start-pct="viewportStartPct"
        :viewport-width-pct="viewportWidthPct"
        @navigate="handleMinimapNavigate"
      />

      <div
        id="timeline-scroll-viewport"
        ref="scrollContainer"
        class="relative overflow-x-auto pb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
        :class="isPanning ? 'cursor-grabbing' : 'cursor-grab'"
        tabindex="0"
        role="group"
        aria-label="Event timeline. Scroll or drag to pan, use arrow keys to pan, plus and minus keys to zoom, and Home to jump to today. Double-click an empty area to create a new event on that date."
        @wheel="handleWheel"
        @pointerdown="handlePointerDown"
        @dblclick="handleDblclick"
        @keydown="handleKeydown"
        @scroll="handleScroll"
      >
        <div ref="trackEl" class="relative transition-[min-width] duration-300 ease-out" :style="{ height: TRACK_HEIGHT + 'px', minWidth: trackWidth + 'px' }">
          <!-- day gridlines: lightest tier, only rendered once zoomed in enough
               (see DAY_GRID_MIN_PX_PER_DAY) for one-per-day lines to read as
               texture rather than a solid smear -->
          <TransitionGroup name="fade-pop" tag="div">
            <div
              v-for="d in dayMarkers" :key="d.key"
              class="absolute top-0 w-px bg-slate-100 transition-[left] duration-300 ease-out"
              :style="{ left: d.leftPercent + '%', height: BASELINE_TOP + 'px' }"
            />
          </TransitionGroup>

          <!-- month gridlines -->
          <TransitionGroup name="fade-pop" tag="div">
            <div
              v-for="m in monthMarkers" :key="m.key"
              class="absolute top-0 w-px bg-slate-200 transition-[left] duration-300 ease-out"
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

          <!-- year gridlines: heaviest tier, painted last so they win visually
               wherever they land on the same tick as a month/day line -->
          <TransitionGroup name="fade-pop" tag="div">
            <div
              v-for="y in yearMarkers" :key="y.key"
              class="absolute top-0 w-px bg-slate-300 transition-[left] duration-300 ease-out"
              :style="{ left: y.leftPercent + '%', height: BASELINE_TOP + 'px' }"
            />
          </TransitionGroup>
          <TransitionGroup name="fade-pop" tag="div">
            <div
              v-for="y in yearMarkers" :key="'label-' + y.key"
              class="absolute text-[11px] font-semibold text-slate-500 -translate-x-1/2 whitespace-nowrap transition-[left] duration-300 ease-out"
              :style="{ left: y.leftPercent + '%', top: (BASELINE_TOP + 28) + 'px' }"
            >{{ y.label }}</div>
          </TransitionGroup>

          <!-- baseline -->
          <div class="absolute left-0 right-0 h-px bg-slate-300" :style="{ top: BASELINE_TOP + 'px' }" />

          <div class="absolute text-xs font-medium text-slate-400 left-0" :style="{ top: BASELINE_TOP + 'px', transform: 'translateY(-24px)' }">Past</div>
          <div class="absolute text-xs font-medium text-slate-400 right-0" :style="{ top: BASELINE_TOP + 'px', transform: 'translateY(-24px)' }">Future</div>

          <!-- today marker -->
          <div class="absolute top-0 w-px bg-rose-400 z-10" :style="{ left: todayLeftPercent + '%', height: BASELINE_TOP + 'px' }">
            <span class="absolute -top-1 left-1.5 text-[10px] text-rose-500 font-medium whitespace-nowrap">Today · {{ formatDate(todayStr) }}</span>
          </div>

          <!-- event bubbles: a flat, TransitionGroup-animated list so events
               entering/leaving as the sidebar's project filter changes fade
               and pop instead of snapping in/out; ongoing left/top transitions
               (re-clustering, zoom, filtering-driven range changes) still
               apply per-element via the transition-[left,top] utility below -->
          <TransitionGroup name="event-pop" tag="div">
            <template v-for="event in positionedEvents" :key="event.id">
              <div
                v-if="event.isOverflow"
                :key="event.id"
                class="absolute -translate-x-1/2 flex flex-col items-center transition-[left,top] duration-300 ease-out"
                :style="{ left: event.leftPercent + '%', top: `${BASELINE_TOP - (STACK_BASE + event.stackIndex * STACK_STEP)}px` }"
              >
                <button
                  class="flex items-center justify-center w-10 h-10 rounded-full shadow hover:shadow-md hover:-translate-y-0.5 transition-all bg-slate-100 border-2 border-slate-400 text-slate-600 text-xs font-semibold"
                  :title="`${event.overflowEvents.length} more event(s) — click to list`"
                  @click="toggleOverflow(event.id)"
                >+{{ event.overflowEvents.length }}</button>
                <span class="mt-1.5 text-[11px] leading-tight text-slate-500">more</span>

                <div
                  v-if="openOverflowId === event.id"
                  class="absolute top-full mt-1 z-20 w-52 bg-white border border-slate-200 rounded-md shadow-lg py-1 max-h-56 overflow-y-auto"
                >
                  <button
                    v-for="oe in event.overflowEvents" :key="oe.id" type="button"
                    class="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                    @click="selectOverflowEvent(oe)"
                  >
                    <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: oe.project.color_hex }" />
                    <span class="flex-1 truncate" :title="oe.title">{{ oe.title }}</span>
                    <span class="text-slate-400 shrink-0">{{ formatDate(oe.date) }}</span>
                  </button>
                </div>
              </div>
              <div
                v-else
                :key="event.id"
                class="absolute -translate-x-1/2 flex flex-col items-center transition-[left,top] duration-300 ease-out"
                :style="{ left: event.leftPercent + '%', top: `${BASELINE_TOP - (STACK_BASE + event.stackIndex * STACK_STEP)}px` }"
              >
                <button
                  class="group relative flex items-center justify-center w-10 h-10 shadow hover:shadow-md hover:-translate-y-0.5 transition-all"
                  :class="[event.visual.shape === 'diamond' ? 'rotate-45' : 'rounded-full', event.visual.bgClass]"
                  :style="{ border: `2px solid ${event.project.color_hex}` }"
                  :title="`${event.title} — ${event.project.name} (${formatDate(event.date)}${event.time ? ' ' + event.time : ''})${event.status !== 'pending' ? ' — ' + event.status : ''}${event.series_id ? ' — recurring' : ''}`"
                  @click="emit('select-event', event)"
                >
                  <component
                    :is="event.visual.icon"
                    class="w-4 h-4"
                    :class="[event.visual.iconClass, event.visual.shape === 'diamond' ? '-rotate-45' : '']"
                  />
                  <span
                    v-if="event.series_id"
                    class="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 border border-white"
                    :class="event.visual.shape === 'diamond' ? '-rotate-45' : ''"
                  ><Repeat class="w-2.5 h-2.5 text-white" /></span>
                </button>
                <span
                  class="max-w-22 truncate text-[11px] leading-tight text-slate-600 text-center"
                  :class="event.visual.shape === 'diamond' ? 'mt-2.5' : 'mt-1.5'"
                  :title="event.title"
                >{{ event.title }}</span>
              </div>
            </template>
          </TransitionGroup>

          <!-- click-outside closer for the overflow dropdown -->
          <div v-if="openOverflowId" class="fixed inset-0 z-10" @click="closeOverflow" />
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
