<script setup>
import { AlertCircle, CalendarClock, ShieldAlert } from 'lucide-vue-next';
import { useProjectStore } from '../stores/useProjectStore.js';

const emit = defineEmits(['focus-overdue', 'focus-pain', 'focus-upcoming']);
const store = useProjectStore();
</script>

<template>
  <div v-if="store.selectedProjectIds.length > 0" class="flex items-center gap-6 px-6 py-3 border-b border-slate-200 bg-white text-sm">
    <button
      type="button"
      class="flex items-center gap-1.5 disabled:cursor-default enabled:hover:underline"
      :class="store.scopedSummary.overdue_action_items > 0 ? 'text-rose-600' : 'text-slate-500'"
      :disabled="store.scopedSummary.overdue_action_items === 0"
      title="Show these in Action Items"
      @click="emit('focus-overdue')"
    >
      <AlertCircle class="w-4 h-4" /> {{ store.scopedSummary.overdue_action_items }} overdue action item(s)
    </button>
    <button
      type="button"
      class="flex items-center gap-1.5 disabled:cursor-default enabled:hover:underline"
      :class="store.scopedSummary.open_high_severity_pain_points > 0 ? 'text-amber-600' : 'text-slate-500'"
      :disabled="store.scopedSummary.open_high_severity_pain_points === 0"
      title="Show these in Pain Points"
      @click="emit('focus-pain')"
    >
      <ShieldAlert class="w-4 h-4" /> {{ store.scopedSummary.open_high_severity_pain_points }} open high-severity pain point(s)
    </button>
    <button
      type="button"
      class="flex items-center gap-1.5 disabled:cursor-default enabled:hover:underline text-slate-500"
      :disabled="store.scopedSummary.upcoming_deadlines === 0"
      title="Show these in Upcoming"
      @click="emit('focus-upcoming')"
    >
      <CalendarClock class="w-4 h-4" /> {{ store.scopedSummary.upcoming_deadlines }} upcoming milestone/deadline(s) (14d)
    </button>
  </div>
</template>
