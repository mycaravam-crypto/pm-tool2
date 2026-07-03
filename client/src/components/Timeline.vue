<script setup>
import { computed } from 'vue';
import { useProjectStore } from '../stores/useProjectStore.js';
import { resolveEventVisual } from '../lib/eventTypes.js';

const emit = defineEmits(['select-event']);
const store = useProjectStore();

const todayStr = new Date().toISOString().slice(0, 10);
const DAY_MS = 86400000;
const TRACK_HEIGHT = 400;
const BASELINE_TOP = 280;
// Each stacked unit is icon (40px) + label gap (6px) + one line of title text (~14px) = ~60px tall.
// STACK_BASE must clear that whole unit above the baseline, or the title dips below the line.
const STACK_BASE = 76;
const STACK_STEP = 74;

const range = computed(() => {
  const dates = store.events.map(e => e.date);
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
  return Math.min(4000, Math.max(900, Math.round(days * 7)));
});

function leftPercent(dateStr) {
  const { min, max } = range.value;
  const t = new Date(dateStr).getTime();
  const pct = ((t - min.getTime()) / (max.getTime() - min.getTime())) * 100;
  return Math.min(100, Math.max(0, pct));
}

const todayLeftPercent = computed(() => leftPercent(todayStr));

const clusters = computed(() => {
  const byDate = new Map();
  for (const event of store.events) {
    if (!byDate.has(event.date)) byDate.set(event.date, []);
    byDate.get(event.date).push({ ...event, visual: resolveEventVisual(event, todayStr) });
  }
  return [...byDate.entries()].map(([date, events]) => ({
    date, leftPercent: leftPercent(date), events
  }));
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
      label: cursor.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return markers;
});
</script>

<template>
  <div class="p-6">
    <div v-if="store.selectedProjectIds.length === 0" class="text-center py-24 text-slate-400">
      Select a project from the sidebar to see its timeline.
    </div>
    <div v-else-if="store.events.length === 0" class="text-center py-24 text-slate-400">
      No events yet for the selected project(s).
    </div>
    <div v-else class="relative overflow-x-auto pb-4">
      <div class="relative" :style="{ height: TRACK_HEIGHT + 'px', minWidth: trackWidth + 'px' }">
        <!-- month gridlines -->
        <div
          v-for="m in monthMarkers" :key="m.key"
          class="absolute top-0 w-px bg-slate-100"
          :style="{ left: m.leftPercent + '%', height: BASELINE_TOP + 'px' }"
        />
        <div
          v-for="m in monthMarkers" :key="'label-' + m.key"
          class="absolute text-[11px] text-slate-400 -translate-x-1/2 whitespace-nowrap"
          :style="{ left: m.leftPercent + '%', top: (BASELINE_TOP + 10) + 'px' }"
        >{{ m.label }}</div>

        <!-- baseline -->
        <div class="absolute left-0 right-0 h-px bg-slate-300" :style="{ top: BASELINE_TOP + 'px' }" />

        <div class="absolute text-xs font-medium text-slate-400 left-0" :style="{ top: BASELINE_TOP + 'px', transform: 'translateY(-24px)' }">Past</div>
        <div class="absolute text-xs font-medium text-slate-400 right-0" :style="{ top: BASELINE_TOP + 'px', transform: 'translateY(-24px)' }">Future</div>

        <!-- today marker -->
        <div class="absolute top-0 w-px bg-rose-400 z-10" :style="{ left: todayLeftPercent + '%', height: BASELINE_TOP + 'px' }">
          <span class="absolute -top-1 left-1.5 text-[10px] text-rose-500 font-medium whitespace-nowrap">Today</span>
        </div>

        <!-- event clusters -->
        <div
          v-for="cluster in clusters" :key="cluster.date"
          class="absolute"
          :style="{ left: cluster.leftPercent + '%', top: BASELINE_TOP + 'px' }"
        >
          <div
            v-for="(event, idx) in cluster.events"
            :key="event.id"
            class="absolute -translate-x-1/2 flex flex-col items-center"
            :style="{ top: `${-(STACK_BASE + idx * STACK_STEP)}px` }"
          >
            <button
              class="group relative flex items-center justify-center w-10 h-10 shadow hover:shadow-md hover:-translate-y-0.5 transition-all"
              :class="[event.visual.shape === 'diamond' ? 'rotate-45' : 'rounded-full', event.visual.bgClass]"
              :style="{ border: `2px solid ${event.project.color_hex}` }"
              :title="`${event.title} — ${event.project.name} (${event.date})${event.status !== 'pending' ? ' — ' + event.status : ''}`"
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
        </div>
      </div>
    </div>
  </div>
</template>
