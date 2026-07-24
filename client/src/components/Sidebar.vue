<script setup>
import { Bell, LogOut, Pencil, Plus, UserCog, Users, Volume2, VolumeX } from 'lucide-vue-next';
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
  <aside class="w-72 shrink-0 border-r border-white/8 bg-[#0d0f16] flex flex-col h-full">
    <div class="p-4 border-b border-white/8">
      <h1 class="text-lg font-semibold text-white tracking-[-.02em]">ChronosPM</h1>
      <p class="text-xs text-slate-500">Multi-project timeline</p>
      <div class="flex items-center justify-between mt-2">
        <span class="text-xs text-slate-500 truncate" :title="store.currentMember?.email">
          Signed in as <span class="font-medium text-slate-300">{{ store.currentMember?.name }}</span>
          <span v-if="store.isAdmin" class="ml-1 text-[10px] font-semibold uppercase tracking-wide text-violet-300 bg-violet-500/15 rounded px-1 py-0.5">Admin</span>
        </span>
        <button class="text-slate-500 hover:text-rose-400 shrink-0" title="Log out" @click="emit('logout')">
          <LogOut class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <div class="px-4 py-2 border-b border-white/8 flex items-center gap-3 text-xs text-slate-400">
      <button
        class="flex items-center gap-1 text-slate-500 hover:text-slate-200"
        title="Notification log"
        @click="emit('open-notifications')"
      >
        <Bell class="w-3.5 h-3.5" />{{ store.notifications.length }}
      </button>
      <button
        class="ml-auto text-slate-500 hover:text-slate-200"
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
          class="flex items-center gap-1 text-xs font-medium text-violet-300 hover:text-violet-200 hover:bg-violet-500/10 rounded px-1.5 py-0.5 -mr-1.5"
          title="New project"
          @click="emit('open-project-form')"
        >
          <Plus class="w-3.5 h-3.5" /> New
        </button>
      </div>

      <ul>
        <li v-for="project in store.projects" :key="project.id">
          <label class="flex items-center gap-2 px-4 py-2 hover:bg-white/5 cursor-pointer">
            <input
              type="checkbox"
              class="rounded border-white/20 bg-white/5"
              :style="{ accentColor: project.color_hex }"
              :checked="store.selectedProjectIds.includes(project.id)"
              @change="store.toggleProjectSelection(project.id)"
            />
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ backgroundColor: project.color_hex }" />
            <span class="flex-1 text-sm text-slate-200 truncate" :title="project.name">{{ project.name }}</span>
            <span
              class="w-5 h-5 rounded-full bg-white/10 text-[10px] flex items-center justify-center text-slate-300 shrink-0"
              :title="`Lead: ${project.lead?.name ?? 'unassigned'}`"
            >{{ leadInitials(project) }}</span>
            <ScorecardDots :scorecard="project.scorecard" />
            <button class="text-slate-600 hover:text-slate-300 shrink-0" title="Edit project" @click.prevent="emit('edit-project', project)">
              <Pencil class="w-3.5 h-3.5" />
            </button>
          </label>
        </li>
      </ul>

      <p v-if="store.projects.length === 0" class="px-4 py-2 text-sm text-slate-500">No active projects yet.</p>
    </div>

    <div v-if="store.isAdmin" class="p-4 border-t border-white/8">
      <div class="grid grid-cols-2 gap-2">
        <button
          class="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-300 border border-white/10 bg-white/[.03] rounded-lg py-2 hover:bg-white/8 hover:text-white"
          @click="emit('open-stakeholders')"
        >
          <Users class="w-4 h-4" /> Stakeholders
        </button>
        <button
          class="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-300 border border-white/10 bg-white/[.03] rounded-lg py-2 hover:bg-white/8 hover:text-white"
          @click="emit('open-members')"
        >
          <UserCog class="w-4 h-4" /> Members
        </button>
      </div>
    </div>
  </aside>
</template>
