import {
  Rocket, RefreshCw, Users, ClipboardCheck, GitBranch, History, Flag, AlarmClock
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
