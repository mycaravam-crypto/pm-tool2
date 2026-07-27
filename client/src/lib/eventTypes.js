import {
  AlarmClock,
  CheckCircle2,
  ClipboardCheck,
  Flag,
  History,
  RefreshCw,
  Rocket,
  Target,
  Users,
  XCircle,
} from 'lucide-vue-next';

export const EVENT_TYPES = {
  kickoff: { icon: Rocket, shape: 'circle', label: 'Kickoff' },
  sync: { icon: RefreshCw, shape: 'circle', label: 'Sync' },
  workshop: { icon: Users, shape: 'circle', label: 'Workshop' },
  review: { icon: ClipboardCheck, shape: 'circle', label: 'Review' },
  retro: { icon: History, shape: 'circle', label: 'Retro' },
  milestone: { icon: Flag, shape: 'diamond', label: 'Milestone' },
  deadline: { icon: AlarmClock, shape: 'diamond', label: 'Deadline' },
};

export const EVENT_TYPE_KEYS = Object.keys(EVENT_TYPES);

// Purely presentational — lets an event's type read as its own hue (filter pills,
// card accents, drawer header glow), independent of status colors below. Shared
// here so Timeline.vue and EventDetailModal.vue can't drift onto different palettes.
export const TYPE_COLORS = {
  kickoff: '#38bdf8',
  sync: '#22d3ee',
  workshop: '#a78bfa',
  review: '#4ade80',
  retro: '#fb923c',
  milestone: '#c084fc',
  deadline: '#fb7185',
};

export const FORWARD_TYPES = ['milestone', 'deadline'];

export const STATUS_LABELS = { pending: 'Pending', achieved: 'Achieved', missed: 'Missed' };
export const STATUS_KEYS = Object.keys(STATUS_LABELS);

// Status (pending/achieved/missed) only carries meaning for milestone/deadline events —
// the other six types are historical records with no state to track. Icon and tint
// communicate status; the caller still applies the project color as the border,
// which is the separate "whose event is this" signal on the overlay timeline.
export function resolveEventVisual(event, todayStr) {
  const base = EVENT_TYPES[event.type];
  if (!FORWARD_TYPES.includes(event.type)) {
    return { icon: base.icon, shape: base.shape, iconClass: 'text-slate-700', bgClass: 'bg-white' };
  }
  if (event.status === 'achieved') {
    return { icon: CheckCircle2, shape: base.shape, iconClass: 'text-emerald-600', bgClass: 'bg-emerald-50' };
  }
  if (event.status === 'missed') {
    return { icon: XCircle, shape: base.shape, iconClass: 'text-rose-600', bgClass: 'bg-rose-50' };
  }
  const isOverduePending = event.date < todayStr;
  if (isOverduePending) {
    return { icon: base.icon, shape: base.shape, iconClass: 'text-amber-600', bgClass: 'bg-amber-50' };
  }
  return { icon: base.icon, shape: base.shape, iconClass: 'text-slate-700', bgClass: 'bg-white' };
}

// Goals aren't a real event type — a synthetic marker built client-side from
// project.goals for the timeline's "Goals" lens. Deliberately NOT added to
// EVENT_TYPES/EVENT_TYPE_KEYS: that map also drives the real event-type <select>,
// and events.type has a CHECK(type IN (...)) that doesn't include 'goal'.
export const GOAL_COLOR = '#e879f9';

// Mirrors resolveEventVisual's forward-type branch, minus the "missed" state — a goal
// only has achieved/unachieved, no equivalent of a milestone being explicitly marked missed.
export function resolveGoalVisual(goal, todayStr) {
  if (goal.status === 'achieved') {
    return { icon: CheckCircle2, shape: 'diamond', iconClass: 'text-emerald-600', bgClass: 'bg-emerald-50' };
  }
  const isOverduePending = goal.date < todayStr;
  if (isOverduePending) {
    return { icon: Target, shape: 'diamond', iconClass: 'text-amber-600', bgClass: 'bg-amber-50' };
  }
  return { icon: Target, shape: 'diamond', iconClass: 'text-slate-700', bgClass: 'bg-white' };
}
