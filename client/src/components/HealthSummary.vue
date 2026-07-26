<script setup>
import { AlertCircle, CalendarClock, ShieldAlert, Target, Unlink2 } from 'lucide-vue-next';
import { computed } from 'vue';
import { useProjectStore } from '../stores/useProjectStore.js';

const emit = defineEmits(['focus-overdue', 'focus-pain', 'focus-upcoming', 'focus-goals', 'focus-scope-creep']);
const store = useProjectStore();

// Falls back to the portfolio-wide summary when no project is selected, so this
// is the single stat strip for both "everything" and "what I've filtered to" —
// see Sidebar.vue, which used to show the portfolio numbers separately.
const isScoped = computed(() => store.selectedProjectIds.length > 0);
const summary = computed(() => (isScoped.value ? store.scopedSummary : store.portfolioSummary));
const scopeLabel = computed(() => (isScoped.value ? 'Selected:' : 'Portfolio:'));
</script>

<template>
  <div class="flex items-center gap-6 px-6 py-3 border-b border-white/8 bg-[#0d0f16] text-sm">
    <span class="text-xs font-medium uppercase tracking-wide text-slate-500">{{ scopeLabel }}</span>
    <button
      type="button"
      class="flex items-center gap-1.5 disabled:cursor-default enabled:hover:underline"
      :class="summary.overdue_action_items > 0 ? 'text-rose-400' : 'text-slate-500'"
      :disabled="summary.overdue_action_items === 0"
      title="Show these in Action Items"
      @click="emit('focus-overdue')"
    >
      <AlertCircle class="w-4 h-4" /> {{ summary.overdue_action_items }} overdue action item(s)
    </button>
    <button
      type="button"
      class="flex items-center gap-1.5 disabled:cursor-default enabled:hover:underline"
      :class="summary.open_high_severity_pain_points > 0 ? 'text-amber-400' : 'text-slate-500'"
      :disabled="summary.open_high_severity_pain_points === 0"
      title="Show these in Pain Points"
      @click="emit('focus-pain')"
    >
      <ShieldAlert class="w-4 h-4" /> {{ summary.open_high_severity_pain_points }} open high-severity pain point(s)
    </button>
    <button
      type="button"
      class="flex items-center gap-1.5 disabled:cursor-default enabled:hover:underline text-slate-500"
      :disabled="summary.upcoming_deadlines === 0"
      title="Show these in Upcoming"
      @click="emit('focus-upcoming')"
    >
      <CalendarClock class="w-4 h-4" /> {{ summary.upcoming_deadlines }} upcoming milestone/deadline(s) (14d)
    </button>
    <button
      type="button"
      class="flex items-center gap-1.5 disabled:cursor-default enabled:hover:underline"
      :class="summary.at_risk_goals > 0 ? 'text-amber-400' : 'text-slate-500'"
      :disabled="summary.at_risk_goals === 0"
      title="Show these in Goals"
      @click="emit('focus-goals')"
    >
      <Target class="w-4 h-4" /> {{ summary.at_risk_goals }} goal(s) at risk
    </button>
    <button
      type="button"
      class="flex items-center gap-1.5 disabled:cursor-default enabled:hover:underline"
      :class="summary.unlinked_requirements > 0 ? 'text-amber-400' : 'text-slate-500'"
      :disabled="summary.unlinked_requirements === 0"
      title="Show these in Requirements"
      @click="emit('focus-scope-creep')"
    >
      <Unlink2 class="w-4 h-4" /> {{ summary.unlinked_requirements }} requirement(s) with no goal
    </button>
  </div>
</template>
