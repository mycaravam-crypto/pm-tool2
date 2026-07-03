<script setup>
import { AlertCircle, ShieldAlert, CalendarClock } from 'lucide-vue-next';
import { useProjectStore } from '../stores/useProjectStore.js';

const store = useProjectStore();
</script>

<template>
  <div v-if="store.selectedProjectIds.length > 0" class="flex items-center gap-6 px-6 py-3 border-b border-slate-200 bg-white text-sm">
    <span class="flex items-center gap-1.5" :class="store.scopedSummary.overdue_action_items > 0 ? 'text-rose-600' : 'text-slate-500'">
      <AlertCircle class="w-4 h-4" /> {{ store.scopedSummary.overdue_action_items }} overdue action item(s)
    </span>
    <span class="flex items-center gap-1.5" :class="store.scopedSummary.open_high_severity_pain_points > 0 ? 'text-amber-600' : 'text-slate-500'">
      <ShieldAlert class="w-4 h-4" /> {{ store.scopedSummary.open_high_severity_pain_points }} open high-severity pain point(s)
    </span>
    <span class="flex items-center gap-1.5 text-slate-500">
      <CalendarClock class="w-4 h-4" /> {{ store.scopedSummary.upcoming_deadlines }} upcoming milestone/deadline(s) (14d)
    </span>
  </div>
</template>
