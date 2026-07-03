import {
  Rocket, RefreshCw, Users, ClipboardCheck, GitBranch, History, Flag, AlarmClock,
  CheckCircle2, XCircle
} from 'lucide-vue-next';

export const EVENT_TYPES = {
  kickoff: { icon: Rocket, shape: 'circle', label: 'Kickoff' },
  sync: { icon: RefreshCw, shape: 'circle', label: 'Sync' },
  workshop: { icon: Users, shape: 'circle', label: 'Workshop' },
  review: { icon: ClipboardCheck, shape: 'circle', label: 'Review' },
  decision: { icon: GitBranch, shape: 'circle', label: 'Decision' },
  retro: { icon: History, shape: 'circle', label: 'Retro' },
  milestone: { icon: Flag, shape: 'diamond', label: 'Milestone' },
  deadline: { icon: AlarmClock, shape: 'diamond', label: 'Deadline' }
};

export const EVENT_TYPE_KEYS = Object.keys(EVENT_TYPES);

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
