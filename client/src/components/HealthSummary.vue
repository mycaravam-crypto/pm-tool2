<script setup>
import { AlertCircle, CalendarClock, ShieldAlert, Target, Unlink2 } from 'lucide-vue-next';
import { computed } from 'vue';
import { useProjectStore } from '@/stores/useProjectStore.js';

const emit = defineEmits(['focus-overdue', 'focus-pain', 'focus-upcoming', 'focus-goals', 'focus-scope-creep']);
const store = useProjectStore();

// Falls back to the portfolio-wide summary when no project is selected, so this
// is the single stat strip for both "everything" and "what I've filtered to".
const isScoped = computed(() => store.selectedProjectIds.length > 0);
const summary = computed(() => (isScoped.value ? store.scopedSummary : store.portfolioSummary));
const scopeLabel = computed(() => (isScoped.value ? 'Selected' : 'Portfolio'));

// severity drives the icon badge color; 'neutral' stats (upcoming deadlines)
// never alert — they're informational at any count, unlike the other four.
const stats = computed(() => [
  {
    key: 'overdue',
    icon: AlertCircle,
    label: 'overdue action item(s)',
    value: summary.value.overdue_action_items,
    severity: 'critical',
    title: 'Show these in Action Items',
    event: 'focus-overdue',
  },
  {
    key: 'pain',
    icon: ShieldAlert,
    label: 'open high-severity pain point(s)',
    value: summary.value.open_high_severity_pain_points,
    severity: 'warning',
    title: 'Show these in Pain Points',
    event: 'focus-pain',
  },
  {
    key: 'upcoming',
    icon: CalendarClock,
    label: 'upcoming milestone/deadline(s) (14d)',
    value: summary.value.upcoming_deadlines,
    severity: 'neutral',
    title: 'Show these in Upcoming',
    event: 'focus-upcoming',
  },
  {
    key: 'goals',
    icon: Target,
    label: 'goal(s) at risk',
    value: summary.value.at_risk_goals,
    severity: 'warning',
    title: 'Show these in Goals',
    event: 'focus-goals',
  },
  {
    key: 'scope',
    icon: Unlink2,
    label: 'requirement(s) with no goal',
    value: summary.value.unlinked_requirements,
    severity: 'warning',
    title: 'Show these in Requirements',
    event: 'focus-scope-creep',
  },
]);

// A zero count is a cleared state, not a dim alert — it gets the same neutral
// treatment as the always-informational 'upcoming' tile, regardless of severity.
const BADGE_CLASSES = {
  critical: 'bg-rose-500/15 text-rose-400',
  warning: 'bg-amber-500/15 text-amber-400',
  neutral: 'bg-white/[.06] text-slate-400',
};
function badgeClass(stat) {
  return stat.value > 0 ? BADGE_CLASSES[stat.severity] : BADGE_CLASSES.neutral;
}
</script>

<template>
  <div class="health-summary border-b border-white/8 bg-[#0d0f16] px-6 py-3">
    <span class="health-summary__scope block text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">{{ scopeLabel }}</span>
    <div class="health-summary__stats grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5">
      <button
        v-for="stat in stats" :key="stat.key" type="button" :disabled="stat.value === 0" :title="stat.title"
        class="health-summary__stat"
        :class="[`health-summary__stat--${stat.key}`, 'group flex items-center gap-3 rounded-lg border border-white/8 bg-white/[.03] px-3 py-2 text-left transition disabled:cursor-default enabled:hover:-translate-y-0.5 enabled:hover:bg-white/[.06] enabled:hover:border-white/15']"
        @click="emit(stat.event)"
      >
        <span class="health-summary__stat-icon grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors" :class="badgeClass(stat)">
          <component :is="stat.icon" class="w-4 h-4" />
        </span>
        <span class="health-summary__stat-body min-w-0">
          <span class="health-summary__stat-value block text-lg font-semibold leading-none text-white">{{ stat.value }}</span>
          <span class="health-summary__stat-label block text-xs leading-snug text-slate-500 mt-0.5">{{ stat.label }}</span>
        </span>
      </button>
    </div>
  </div>
</template>
