<script setup>
import { ref, computed } from 'vue';
import { useProjectStore } from '../stores/useProjectStore.js';

const store = useProjectStore();
const subTab = ref('actions');
// Defaults "My Tasks" to whoever's logged in, when their account is linked to a
// Stakeholder identity — still just a starting point, the dropdown stays editable.
const assigneeFilter = ref(store.currentMember?.stakeholder_id ?? '');
const projectFilter = ref('');

const todayStr = new Date().toISOString().slice(0, 10);

const actionItems = computed(() => {
  let rows = store.events.flatMap(e => e.action_items.map(a => ({ ...a, event: e })));
  if (assigneeFilter.value) rows = rows.filter(a => a.assignee_id === Number(assigneeFilter.value));
  if (projectFilter.value) rows = rows.filter(a => a.event.project_id === Number(projectFilter.value));
  return rows.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
});

const painPoints = computed(() => {
  let rows = store.events.flatMap(e => e.pain_points.map(p => ({ ...p, event: e })));
  if (projectFilter.value) rows = rows.filter(p => p.event.project_id === Number(projectFilter.value));
  const order = { High: 0, Medium: 1, Low: 2 };
  return rows.sort((a, b) => order[a.severity] - order[b.severity]);
});

const decisions = computed(() => {
  let rows = store.events.flatMap(e => e.decisions.map(d => ({ ...d, event: e })));
  if (projectFilter.value) rows = rows.filter(d => d.event.project_id === Number(projectFilter.value));
  return rows.sort((a, b) => b.event.date.localeCompare(a.event.date));
});

function isOverdue(item) {
  return item.due_date && !item.done && item.due_date < todayStr;
}
async function toggleDone(item) { await store.toggleActionItemDone(item.id, !item.done); }
async function toggleResolved(pp) { await store.togglePainPointResolved(pp.id, !pp.resolved); }
</script>

<template>
  <div class="p-6">
    <div v-if="store.selectedProjectIds.length === 0" class="text-center py-24 text-slate-400">
      Select a project from the sidebar to see aggregated data.
    </div>
    <template v-else>
      <div class="flex items-center justify-between mb-4">
        <div class="flex gap-1">
          <button
            v-for="t in [['actions', 'Action Items'], ['pain', 'Pain Points'], ['decisions', 'Decisions']]"
            :key="t[0]"
            class="px-3 py-1.5 text-sm rounded-md"
            :class="subTab === t[0] ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="subTab = t[0]"
          >{{ t[1] }}</button>
        </div>
        <div class="flex gap-2">
          <select v-if="subTab === 'actions'" v-model="assigneeFilter" class="border border-slate-300 rounded px-2 py-1 text-sm">
            <option value="">My Tasks: all assignees</option>
            <option v-for="s in store.stakeholders" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <select v-model="projectFilter" class="border border-slate-300 rounded px-2 py-1 text-sm">
            <option value="">All selected projects</option>
            <option v-for="p in store.selectedProjects" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
      </div>

      <table v-if="subTab === 'actions'" class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <th class="py-1.5 w-8"></th><th class="py-1.5">Task</th><th class="py-1.5">Assignee</th><th class="py-1.5">Project</th><th class="py-1.5">Due date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in actionItems" :key="a.id" class="border-b border-slate-100">
            <td class="py-1.5"><input type="checkbox" :checked="!!a.done" @change="toggleDone(a)" /></td>
            <td class="py-1.5" :class="a.done ? 'line-through text-slate-400' : ''">{{ a.text }}</td>
            <td class="py-1.5 text-slate-500">{{ a.assignee_name || '—' }}</td>
            <td class="py-1.5">
              <span class="inline-flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: a.event.project.color_hex }" />{{ a.event.project.name }}
              </span>
            </td>
            <td class="py-1.5" :class="isOverdue(a) ? 'text-rose-600 font-medium' : 'text-slate-500'">{{ a.due_date || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="subTab === 'actions' && actionItems.length === 0" class="text-sm text-slate-400 py-4">No action items.</p>

      <table v-if="subTab === 'pain'" class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <th class="py-1.5 w-8"></th><th class="py-1.5">Pain Point</th><th class="py-1.5">Severity</th><th class="py-1.5">Owner</th><th class="py-1.5">Project</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in painPoints" :key="p.id" class="border-b border-slate-100">
            <td class="py-1.5"><input type="checkbox" :checked="!!p.resolved" @change="toggleResolved(p)" /></td>
            <td class="py-1.5" :class="p.resolved ? 'line-through text-slate-400' : ''">{{ p.text }}</td>
            <td class="py-1.5">
              <span
                class="text-xs px-1.5 py-0.5 rounded"
                :class="{ High: 'bg-rose-100 text-rose-700', Medium: 'bg-amber-100 text-amber-700', Low: 'bg-slate-100 text-slate-600' }[p.severity]"
              >{{ p.severity }}</span>
            </td>
            <td class="py-1.5 text-slate-500">{{ p.owner_name || '—' }}</td>
            <td class="py-1.5">
              <span class="inline-flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: p.event.project.color_hex }" />{{ p.event.project.name }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="subTab === 'pain' && painPoints.length === 0" class="text-sm text-slate-400 py-4">No pain points.</p>

      <table v-if="subTab === 'decisions'" class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <th class="py-1.5">Decision</th><th class="py-1.5">Decided by</th><th class="py-1.5">Event</th><th class="py-1.5">Project</th><th class="py-1.5">Date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in decisions" :key="d.id" class="border-b border-slate-100">
            <td class="py-1.5">{{ d.text }}</td>
            <td class="py-1.5 text-slate-500">{{ d.decided_by_name || '—' }}</td>
            <td class="py-1.5 text-slate-500">{{ d.event.title }}</td>
            <td class="py-1.5">
              <span class="inline-flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: d.event.project.color_hex }" />{{ d.event.project.name }}
              </span>
            </td>
            <td class="py-1.5 text-slate-500">{{ d.event.date }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="subTab === 'decisions' && decisions.length === 0" class="text-sm text-slate-400 py-4">No decisions logged.</p>
    </template>
  </div>
</template>
