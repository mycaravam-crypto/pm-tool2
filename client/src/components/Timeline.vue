<script setup>
import { CalendarSearch, Repeat, RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { formatDate, formatMonthYear, formatYear, todayStr as getTodayStr } from '../lib/dateFormat.js';
import { EVENT_TYPE_KEYS, EVENT_TYPES, FORWARD_TYPES, resolveEventVisual, TYPE_COLORS } from '../lib/eventTypes.js';
import { computeClusters as computeClustersPure, computePositionedEvents } from '../lib/timelineAggregation.js';
import {
  computeRange,
  computeSemanticZoomLabel,
  computeTrackWidth,
  leftPercent as leftPercentPure,
} from '../lib/timelineScale.js';
import { useProjectStore } from '../stores/useProjectStore.js';
import ClusterDetailPopover from './ClusterDetailPopover.vue';
import HelpTooltip from './HelpTooltip.vue';
import TimelineMiniMap from './TimelineMiniMap.vue';

const emit = defineEmits(['select-event', 'new-event']);
const store = useProjectStore();

const todayStr = getTodayStr();
const DAY_MS = 86400000;
const TRACK_HEIGHT = 400;
const BASELINE_TOP = 280;
// A card is a single 30px-tall row (icon + inline title, no separate label
// line below it like the old bubble layout had), so it only needs enough
// clearance above the baseline to fit itself plus a small gap.
const STACK_BASE = 40;
const STACK_STEP = 38;
// Beyond this many events, a cluster collapses the rest into a "+N" chip
// instead of stacking indefinitely — an unbounded stack eventually pushes
// cards above the track entirely (or into the "Today" label near the top),
// so capping keeps the tallest stack offset constant regardless of size.
const MAX_VISIBLE_STACK = 5;

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
// Two truncated card titles start visually colliding once their anchors are
// closer than about this many pixels — CARD_WIDTH below is kept safely under
// this so cards from two different (non-clustered) anchors never overlap.
const CLUSTER_THRESHOLD_PX = 100;
const CARD_WIDTH = 88;
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
const search = ref('');
const activeTypes = ref([...EVENT_TYPE_KEYS]);

function toggleType(key) {
  const idx = activeTypes.value.indexOf(key);
  if (idx >= 0) activeTypes.value.splice(idx, 1);
  else activeTypes.value.push(key);
}
function toggleAllTypes() {
  activeTypes.value = activeTypes.value.length === EVENT_TYPE_KEYS.length ? [] : [...EVENT_TYPE_KEYS];
}

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

const visibleEvents = computed(() => {
  const term = search.value.trim().toLowerCase();
  return store.events.filter(
    (e) => activeTypes.value.includes(e.type) && (!term || e.title.toLowerCase().includes(term)),
  );
});

const summaryStats = computed(() => {
  const visible = visibleEvents.value;
  const achieved = visible.filter((e) => e.status === 'achieved').length;
  const missed = visible.filter((e) => e.status === 'missed').length;
  const overdue = visible.filter(
    (e) => FORWARD_TYPES.includes(e.type) && e.status === 'pending' && e.date < todayStr,
  ).length;
  return [
    { label: 'Visible events', value: visible.length, note: `of ${store.events.length}` },
    { label: 'Achieved', value: achieved, note: 'milestones & deadlines' },
    { label: 'Missed', value: missed, note: 'milestones & deadlines' },
    { label: 'Overdue, unmarked', value: overdue, note: 'needs a status' },
  ];
});

// Groups events close enough in *rendered pixel space* to collide, not just events
// sharing an exact date. At low zoom many days collapse into the same handful of
// pixels, so nearby-but-different-date events need to stack too; at high zoom the
// same events end up far enough apart to stand alone. Recomputes with trackWidth,
// so zooming in is the fix for "labels are colliding." Logic lives in
// timelineAggregation.js so it's unit-testable without mounting the component.
const clusters = computed(() =>
  computeClustersPure(visibleEvents.value, {
    range: range.value,
    trackWidth: trackWidth.value,
    todayStr,
    thresholdPx: CLUSTER_THRESHOLD_PX,
    resolveVisual: resolveEventVisual,
  }),
);

// Flattened for TransitionGroup, which needs a single-level v-for to animate
// individual entries in/out as filtering (sidebar project selection, search,
// type pills) adds or removes events — the nested cluster structure above is
// still what decides each card's position, just re-shaped into one list here.
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

function cardTitle(event) {
  const parts = [
    event.title,
    '—',
    event.project.name,
    `(${formatDate(event.date)}${event.time ? ` ${event.time}` : ''})`,
  ];
  if (event.status !== 'pending') parts.push(`— ${event.status}`);
  if (event.series_id) parts.push('— recurring');
  return parts.join(' ');
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
// event cards, the overflow popover, form controls — so their own click
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
// the clicked date — clicks on an event/cluster card are excluded so they
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
  <div class="p-3 sm:p-5">
    <div v-if="store.selectedProjectIds.length === 0" class="text-center py-24 text-slate-500">
      Select a project from the sidebar to see its timeline.
    </div>
    <div v-else-if="store.loading && store.events.length === 0" class="text-center py-24 text-slate-500">
      Loading events…
    </div>
    <div v-else-if="!store.loading && store.events.length === 0" class="text-center py-24 text-slate-500">
      No events yet for the selected project(s).
    </div>
    <!-- Kept mounted across a background refetch (e.g. toggling a project
         checkbox) whenever there's already something to show, rather than
         swapping to the "Loading…" branch above and destroying/recreating
         this whole subtree — that was killing the enter/leave transitions
         below since TransitionGroup had no continuity to animate across. -->
    <template v-else>
      <div class="glass rounded-[26px] overflow-hidden">
        <!-- Project color legend: the timeline's overlay only works if you can tell
             whose event is whose without looking away to the sidebar checkboxes. -->
        <div v-if="store.selectedProjects.length > 1" class="flex items-center gap-3 flex-wrap px-4 sm:px-6 pt-4 text-xs text-slate-400">
          <span v-for="p in store.selectedProjects" :key="p.id" class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: p.color_hex }" />{{ p.name }}
          </span>
        </div>

        <!-- Header: search, type filters, today/jump, zoom -->
        <div class="border-b border-white/8 px-4 sm:px-6 py-4">
          <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div class="flex flex-1 items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filter by event type">
              <button
                type="button"
                class="inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition"
                :class="activeTypes.length === EVENT_TYPE_KEYS.length ? 'border-white/20 bg-white/10 text-white' : 'border-white/8 bg-transparent text-slate-500 hover:text-slate-300'"
                @click="toggleAllTypes"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-white" />All
                <span class="text-[10px] text-slate-500">{{ visibleEvents.length }}</span>
              </button>
              <button
                v-for="key in EVENT_TYPE_KEYS" :key="key" type="button"
                class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition"
                :class="activeTypes.includes(key) ? 'border-white/16 bg-white/[.075] text-slate-100' : 'border-white/6 bg-transparent text-slate-600 hover:text-slate-300'"
                @click="toggleType(key)"
              >
                <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: TYPE_COLORS[key], boxShadow: activeTypes.includes(key) ? `0 0 10px ${TYPE_COLORS[key]}` : 'none' }" />
                {{ EVENT_TYPES[key].label }}
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <label class="relative">
                <span class="sr-only">Search events</span>
                <Search class="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  v-model.trim="search" type="search" placeholder="Search events…"
                  class="h-9 w-44 rounded-lg border border-white/8 bg-white/[.045] pl-8 pr-3 text-xs text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-400/45 focus:bg-white/[.065] focus:ring-4 focus:ring-violet-500/10"
                />
              </label>

              <form class="flex items-center gap-1" @submit.prevent="jumpToDate">
                <input v-model="jumpDate" type="date" class="h-9 rounded-lg border border-white/8 bg-white/[.045] px-2 text-xs text-slate-100 outline-none focus:border-violet-400/45" />
                <button
                  type="submit" title="Jump to date" :disabled="!jumpDate"
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/8 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                ><CalendarSearch class="w-4 h-4" /></button>
              </form>

              <button
                type="button"
                class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[.045] px-3 text-xs font-medium text-slate-300 transition hover:bg-white/[.08] hover:text-white"
                @click="scrollToToday"
              >Today</button>

              <div class="flex items-center rounded-lg border border-white/8 bg-black/15 p-1">
                <button
                  class="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-white/8 hover:text-white disabled:opacity-30"
                  title="Zoom out" :disabled="zoomLevel <= ZOOM_MIN" @click="zoomOut"
                ><ZoomOut class="w-3.5 h-3.5" /></button>
                <span class="w-16 text-center text-[11px] text-slate-400 tabular-nums" :title="`Zoom: ${Math.round(zoomLevel * 100)}%`">{{ semanticZoomLabel }}</span>
                <button
                  class="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-white/8 hover:text-white disabled:opacity-30"
                  title="Zoom in" :disabled="zoomLevel >= ZOOM_MAX" @click="zoomIn"
                ><ZoomIn class="w-3.5 h-3.5" /></button>
                <button
                  class="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-white/8 hover:text-white"
                  title="Reset zoom and jump to today" @click="resetZoom"
                ><RotateCcw class="w-3.5 h-3.5" /></button>
              </div>
              <HelpTooltip
                align="right"
                text="Scroll your mouse wheel or trackpad to zoom into whatever date is under your cursor. Click and drag to pan. With the timeline focused: arrow keys pan, +/- zoom, Home jumps to today. Double-click empty space to create an event on that date."
              />
            </div>
          </div>
          <span v-if="store.loading" class="mt-2 block text-xs italic text-slate-500">Updating…</span>
        </div>

        <!-- Summary stats strip -->
        <div class="grid grid-cols-2 border-b border-white/7 bg-black/10 sm:grid-cols-4">
          <div v-for="stat in summaryStats" :key="stat.label" class="border-r border-white/6 px-4 py-3 last:border-r-0 sm:px-6">
            <div class="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{{ stat.label }}</div>
            <div class="mt-1 flex items-end gap-2"><strong class="text-xl font-semibold tracking-tight text-slate-100">{{ stat.value }}</strong><span class="pb-0.5 text-[11px] text-slate-500">{{ stat.note }}</span></div>
          </div>
        </div>

        <!-- Timeline viewport -->
        <div
          id="timeline-scroll-viewport"
          ref="scrollContainer"
          class="timeline-scroll relative overflow-x-auto pb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          :class="isPanning ? 'cursor-grabbing select-none' : 'cursor-grab'"
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
                class="absolute top-0 w-px bg-white/[.04] transition-[left] duration-300 ease-out"
                :style="{ left: d.leftPercent + '%', height: BASELINE_TOP + 'px' }"
              />
            </TransitionGroup>

            <!-- month gridlines -->
            <TransitionGroup name="fade-pop" tag="div">
              <div
                v-for="m in monthMarkers" :key="m.key"
                class="absolute top-0 w-px bg-white/[.07] transition-[left] duration-300 ease-out"
                :style="{ left: m.leftPercent + '%', height: BASELINE_TOP + 'px' }"
              />
            </TransitionGroup>
            <TransitionGroup name="fade-pop" tag="div">
              <div
                v-for="m in monthMarkers" :key="'label-' + m.key"
                class="absolute text-[11px] text-slate-500 -translate-x-1/2 whitespace-nowrap transition-[left] duration-300 ease-out"
                :style="{ left: m.leftPercent + '%', top: (BASELINE_TOP + 10) + 'px' }"
              >{{ m.label }}</div>
            </TransitionGroup>

            <!-- year gridlines: heaviest tier, painted last so they win visually
                 wherever they land on the same tick as a month/day line -->
            <TransitionGroup name="fade-pop" tag="div">
              <div
                v-for="y in yearMarkers" :key="y.key"
                class="absolute top-0 w-px bg-white/[.14] transition-[left] duration-300 ease-out"
                :style="{ left: y.leftPercent + '%', height: BASELINE_TOP + 'px' }"
              />
            </TransitionGroup>
            <TransitionGroup name="fade-pop" tag="div">
              <div
                v-for="y in yearMarkers" :key="'label-' + y.key"
                class="absolute text-[11px] font-semibold text-slate-300 -translate-x-1/2 whitespace-nowrap transition-[left] duration-300 ease-out"
                :style="{ left: y.leftPercent + '%', top: (BASELINE_TOP + 28) + 'px' }"
              >{{ y.label }}</div>
            </TransitionGroup>

            <!-- baseline -->
            <div class="absolute left-0 right-0 h-px bg-white/15" :style="{ top: BASELINE_TOP + 'px' }" />

            <div class="absolute text-xs font-medium text-slate-500 left-0" :style="{ top: BASELINE_TOP + 'px', transform: 'translateY(-24px)' }">Past</div>
            <div class="absolute text-xs font-medium text-slate-500 right-0" :style="{ top: BASELINE_TOP + 'px', transform: 'translateY(-24px)' }">Future</div>

            <!-- today marker -->
            <div class="today-line" :style="{ left: todayLeftPercent + '%', height: BASELINE_TOP + 'px' }">
              <span class="absolute -top-1 left-1.5 text-[10px] text-rose-400 font-medium whitespace-nowrap">Today · {{ formatDate(todayStr) }}</span>
            </div>

            <!-- event cards: a flat, TransitionGroup-animated list so events
                 entering/leaving as the sidebar's project filter, search, or
                 type pills change fade and pop instead of snapping in/out;
                 ongoing left/top transitions (re-clustering, zoom, filtering-
                 driven range changes) still apply per-element below -->
            <TransitionGroup name="event-pop" tag="div">
              <template v-for="event in positionedEvents" :key="event.id">
                <div
                  v-if="event.isOverflow"
                  :key="event.id"
                  class="absolute z-20 transition-[left,top] duration-300 ease-out"
                  :style="{ left: `${event.leftPercent}%`, top: `${BASELINE_TOP - (STACK_BASE + event.stackIndex * STACK_STEP)}px` }"
                >
                  <ClusterDetailPopover
                    :overflow-events="event.overflowEvents"
                    :is-open="openOverflowId === event.id"
                    @toggle="toggleOverflow(event.id)"
                    @select="selectOverflowEvent"
                  />
                </div>
                <button
                  v-else
                  :key="event.id"
                  type="button"
                  class="event-card"
                  :class="event.visual.shape === 'diamond' ? 'event-card--diamond' : ''"
                  :style="{ left: `${event.leftPercent}%`, top: `${BASELINE_TOP - (STACK_BASE + event.stackIndex * STACK_STEP)}px`, width: `${CARD_WIDTH}px`, borderColor: `${TYPE_COLORS[event.type]}55` }"
                  :title="cardTitle(event)"
                  @click="emit('select-event', event)"
                >
                  <span
                    class="event-badge"
                    :class="[event.visual.bgClass, event.visual.shape === 'diamond' ? 'rounded-md rotate-45' : 'rounded-full']"
                    :style="{ borderColor: event.project.color_hex }"
                  >
                    <component
                      :is="event.visual.icon" class="h-2.5 w-2.5"
                      :class="[event.visual.iconClass, event.visual.shape === 'diamond' ? '-rotate-45' : '']"
                    />
                  </span>
                  <span class="truncate">{{ event.title }}</span>
                  <span v-if="event.series_id" class="event-card-repeat"><Repeat class="h-2 w-2 text-white" /></span>
                </button>
              </template>
            </TransitionGroup>

            <!-- click-outside closer for the overflow popover -->
            <div v-if="openOverflowId" class="fixed inset-0 z-10" @click="closeOverflow" />
          </div>
        </div>

        <!-- Footer: status legend + minimap -->
        <div class="flex flex-col gap-3 border-t border-white/8 bg-black/15 px-4 sm:px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full border-2 border-slate-400" /> Record</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 border-2 border-slate-400 rotate-45" /> Milestone / Deadline</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-50 border-2 border-emerald-500" /> Achieved</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-rose-50 border-2 border-rose-500" /> Missed</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-50 border-2 border-amber-500" /> Overdue, unmarked</span>
            <span class="flex items-center gap-1.5"><span class="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-violet-600"><Repeat class="w-2 h-2 text-white" /></span> Recurring</span>
            <span class="hidden sm:inline text-slate-600">· Double-click empty space to create an event</span>
          </div>

          <TimelineMiniMap
            class="lg:w-80"
            :range="range"
            :events="store.events"
            :today-str="todayStr"
            :viewport-start-pct="viewportStartPct"
            :viewport-width-pct="viewportWidthPct"
            @navigate="handleMinimapNavigate"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.today-line {
  position: absolute;
  top: 0;
  z-index: 18;
  width: 1px;
  background: linear-gradient(180deg, #ff6b91, rgba(255, 107, 145, 0.25));
  box-shadow: 0 0 14px rgba(255, 107, 145, 0.45);
  pointer-events: none;
}
.today-line::before {
  content: '';
  position: absolute;
  top: -3px;
  left: -3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ff6b91;
  box-shadow: 0 0 0 3px rgba(255, 107, 145, 0.15);
}

.event-card {
  position: absolute;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 8px 0 4px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.055);
  color: #f1f5f9;
  font-size: 11px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
}
.event-card--diamond {
  border-radius: 12px;
}
.event-card:hover,
.event-card:focus-visible {
  z-index: 15;
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.36);
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.32);
  outline: none;
}
.event-badge {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-width: 1.5px;
  border-style: solid;
}
.event-card-repeat {
  position: absolute;
  top: -4px;
  right: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #7c3aed;
  border: 1px solid #11141c;
}

/* Event cards: pop + fade in/out as filters (project/search/type) add or
   remove events. `scale`/`opacity` are used instead of `transform` so this
   doesn't fight the per-element `left`/`top` transition already on the
   element — the two compose independently. */
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

/* Month/year gridlines and labels: simple fade as the visible date range shifts. */
.fade-pop-enter-active,
.fade-pop-leave-active {
  transition: opacity 220ms ease;
}
.fade-pop-enter-from,
.fade-pop-leave-to {
  opacity: 0;
}
</style>
