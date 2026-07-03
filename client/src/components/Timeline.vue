<script setup>
import { computed } from 'vue';
import { useProjectStore } from '../stores/useProjectStore.js';
import { EVENT_TYPES } from '../lib/eventTypes.js';

const emit = defineEmits(['select-event']);
const store = useProjectStore();

const todayStr = new Date().toISOString().slice(0, 10);

const range = computed(() => {
  const dates = store.events.map(e => e.date);
  dates.push(todayStr);
  if (dates.length === 1) {
    const only = new Date(dates[0]);
    return { min: new Date(only.getTime() - 30 * 86400000), max: new Date(only.getTime() + 30 * 86400000) };
  }
  const sorted = [...dates].sort();
  const min = new Date(sorted[0]);
  const max = new Date(sorted[sorted.length - 1]);
  const pad = Math.max((max - min) * 0.08, 5 * 86400000);
  return { min: new Date(min.getTime() - pad), max: new Date(max.getTime() + pad) };
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
    byDate.get(event.date).push(event);
  }
  return [...byDate.entries()].map(([date, events]) => ({
    date, leftPercent: leftPercent(date), events
  }));
});

function bucketLabel(dateStr) {
  if (dateStr === todayStr) return 'present';
  return dateStr < todayStr ? 'past' : 'future';
}
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
      <div class="relative" style="height: 320px; min-width: 900px;">
        <div class="absolute left-0 right-0 top-1/2 h-px bg-slate-300" />

        <div class="absolute top-2 text-xs text-slate-400 left-0">Past</div>
        <div class="absolute top-2 text-xs text-slate-400 right-0">Future</div>

        <div class="absolute top-0 bottom-0 w-px bg-rose-400 z-10" :style="{ left: todayLeftPercent + '%' }">
          <span class="absolute -top-1 left-1 text-[10px] text-rose-500 font-medium whitespace-nowrap">Today</span>
        </div>

        <div v-for="cluster in clusters" :key="cluster.date" class="absolute top-1/2" :style="{ left: cluster.leftPercent + '%' }">
          <div
            v-for="(event, idx) in cluster.events"
            :key="event.id"
            class="absolute -translate-x-1/2"
            :style="{ top: `${-24 - idx * 46}px` }"
          >
            <button
              class="group relative flex items-center justify-center w-10 h-10 bg-white shadow hover:shadow-md transition-shadow"
              :class="EVENT_TYPES[event.type].shape === 'diamond' ? 'rotate-45' : 'rounded-full'"
              :style="{ border: `2px solid ${event.project.color_hex}` }"
              :title="`${event.title} — ${event.project.name} (${event.date})`"
              @click="emit('select-event', event)"
            >
              <component
                :is="EVENT_TYPES[event.type].icon"
                class="w-4 h-4 text-slate-700"
                :class="EVENT_TYPES[event.type].shape === 'diamond' ? '-rotate-45' : ''"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
