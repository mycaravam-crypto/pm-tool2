<script setup>
import {
  AlertCircle,
  Bell,
  CalendarClock,
  LogOut,
  Pencil,
  Plus,
  ShieldAlert,
  UserCog,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-vue-next';
import { ref } from 'vue';
import { isMuted, setMuted } from '../lib/sound.js';
import { useProjectStore } from '../stores/useProjectStore.js';
import ScorecardDots from './ScorecardDots.vue';

const emit = defineEmits([
  'open-stakeholders',
  'open-project-form',
  'edit-project',
  'open-members',
  'open-notifications',
  'logout',
]);
const store = useProjectStore();

const leadInitials = (project) => {
  if (!project.lead) return '?';
  return project.lead.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

const muted = ref(isMuted());
function toggleMuted() {
  muted.value = !muted.value;
  setMuted(muted.value);
}
</script>

<template>
  <aside class="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col h-full">
    <div class="p-4 border-b border-slate-200">
      <h1 class="text-lg font-semibold text-slate-900">ChronosPM</h1>
      <p class="text-xs text-slate-500">Multi-project timeline</p>
      <div class="flex items-center justify-between mt-2">
        <span class="text-xs text-slate-500 truncate" :title="store.currentMember?.email">
          Signed in as <span class="font-medium text-slate-700">{{ store.currentMember?.name }}</span>
          <span v-if="store.isAdmin" class="ml-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 bg-indigo-50 rounded px-1 py-0.5">Admin</span>
        </span>
        <button class="text-slate-400 hover:text-rose-600 shrink-0" title="Log out" @click="emit('logout')">
          <LogOut class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <div class="px-4 py-3 border-b border-slate-200 flex items-center gap-4 text-xs text-slate-600">
      <span class="flex items-center gap-1" title="Overdue action items across active projects">
        <AlertCircle class="w-3.5 h-3.5 text-rose-500" />{{ store.portfolioSummary.overdue_action_items }}
      </span>
      <span class="flex items-center gap-1" title="Open high-severity pain points across active projects">
        <ShieldAlert class="w-3.5 h-3.5 text-amber-500" />{{ store.portfolioSummary.open_high_severity_pain_points }}
      </span>
      <span class="flex items-center gap-1" title="Upcoming milestones/deadlines within 14 days">
        <CalendarClock class="w-3.5 h-3.5 text-sky-500" />{{ store.portfolioSummary.upcoming_deadlines }}
      </span>
      <button
        class="ml-auto flex items-center gap-1 text-slate-500 hover:text-slate-800"
        title="Notification log"
        @click="emit('open-notifications')"
      >
        <Bell class="w-3.5 h-3.5" />{{ store.notifications.length }}
      </button>
      <button
        class="text-slate-400 hover:text-slate-700"
        :title="muted ? 'Unmute notification sound' : 'Mute notification sound'"
        @click="toggleMuted"
      >
        <VolumeX v-if="muted" class="w-3.5 h-3.5" />
        <Volume2 v-else class="w-3.5 h-3.5" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div class="px-4 pt-3 pb-1 flex items-center justify-between">
        <span class="text-xs font-medium uppercase tracking-wide text-slate-500">Projects</span>
        <button
          v-if="store.isAdmin"
          class="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded px-1.5 py-0.5 -mr-1.5"
          title="New project"
          @click="emit('open-project-form')"
        >
          <Plus class="w-3.5 h-3.5" /> New
        </button>
      </div>

      <ul>
        <li v-for="project in store.projects" :key="project.id">
          <label class="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              class="rounded border-slate-300"
              :style="{ accentColor: project.color_hex }"
              :checked="store.selectedProjectIds.includes(project.id)"
              @change="store.toggleProjectSelection(project.id)"
            />
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: project.color_hex }" />
            <span class="flex-1 text-sm text-slate-800 truncate" :title="project.name">{{ project.name }}</span>
            <span
              class="w-5 h-5 rounded-full bg-slate-200 text-[10px] flex items-center justify-center text-slate-700 shrink-0"
              :title="`Lead: ${project.lead?.name ?? 'unassigned'}`"
            >{{ leadInitials(project) }}</span>
            <ScorecardDots :scorecard="project.scorecard" />
            <button class="text-slate-300 hover:text-slate-600 shrink-0" title="Edit project" @click.prevent="emit('edit-project', project)">
              <Pencil class="w-3.5 h-3.5" />
            </button>
          </label>
        </li>
      </ul>

      <p v-if="store.projects.length === 0" class="px-4 py-2 text-sm text-slate-400">No active projects yet.</p>
    </div>

    <div v-if="store.isAdmin" class="p-4 border-t border-slate-200 space-y-2">
      <button
        class="w-full flex items-center justify-center gap-2 text-sm font-medium text-white bg-indigo-600 rounded-md py-2 hover:bg-indigo-700"
        @click="emit('open-project-form')"
      >
        <Plus class="w-4 h-4" /> New Project
      </button>
      <div class="grid grid-cols-2 gap-2">
        <button
          class="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-md py-2 hover:bg-slate-50"
          @click="emit('open-stakeholders')"
        >
          <Users class="w-4 h-4" /> Stakeholders
        </button>
        <button
          class="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-md py-2 hover:bg-slate-50"
          @click="emit('open-members')"
        >
          <UserCog class="w-4 h-4" /> Members
        </button>
      </div>
    </div>
  </aside>
</template>
