<script setup>
import { computed, ref, watch } from 'vue';
import { formatDate, todayStr as getTodayStr } from '../lib/dateFormat.js';
import { EVENT_TYPES, STATUS_LABELS } from '../lib/eventTypes.js';
import { TABLE_BODY_ROW, TABLE_HEADER_ROW } from '../lib/tableStyles.js';
import { useProjectStore } from '../stores/useProjectStore.js';
import EventLink from './EventLink.vue';
import ProjectChip from './ProjectChip.vue';

const props = defineProps({
  // Set by the parent (e.g. clicking a Health Summary stat) to jump straight to
  // a filtered view instead of making the user hunt for it themselves. Include a
  // `token` (a new value each time) so re-clicking the same stat still re-applies
  // the filter even if subTab/flags were already at those values.
  focus: { type: Object, default: null },
});
const emit = defineEmits(['select-event']);

const store = useProjectStore();
const subTab = ref('overview');
// Defaults "My Tasks" to whoever's logged in, when their account is linked to a
// Stakeholder identity — still just a starting point, the dropdown stays editable.
const assigneeFilter = ref(store.currentMember?.stakeholder_id ?? '');
const projectFilter = ref('');
const actionOverdueOnly = ref(false);
const painOpenOnly = ref(false);
const painSeverityFilter = ref('');
const painKindFilter = ref('');
const requirementOpenOnly = ref(false);
const goalOpenOnly = ref(false);

watch(
  () => props.focus,
  (f) => {
    if (!f) return;
    subTab.value = f.subTab;
    if (f.subTab === 'actions') {
      assigneeFilter.value = ''; // drilling in from a portfolio-wide count shouldn't stay scoped to "My Tasks"
      actionOverdueOnly.value = !!f.overdueOnly;
    } else if (f.subTab === 'pain') {
      painOpenOnly.value = !!f.openOnly;
      painSeverityFilter.value = f.severity ?? '';
    }
  },
  { immediate: true },
);

const todayStr = getTodayStr();
const in14DaysStr = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

function isOverdue(item) {
  return item.due_date && !item.done && item.due_date < todayStr;
}

// Combines every trackable item — event-sourced (decisions/action items/pain
// points) and project-sourced (requirements/goals) — into one chronological
// log for a general overview; the dedicated tabs below stay for focused
// per-type work/filtering. Requirements/goals carry no `event` (they aren't
// tied to a meeting), so `project` is set explicitly on every row rather than
// read via `.event.project`, and the Event column just renders '—' for them.
// Action items sort/display by their own due_date (falling back to the parent
// event's date if unset) rather than the event date, since due_date is what
// actually determines whether one reads as overdue; goals similarly use
// target_date when set, since that's what determines whether they're on track.
const allItems = computed(() => {
  let rows = store.events.flatMap((e) => [
    ...e.action_items.map((a) => ({
      kind: 'action',
      id: `a${a.id}`,
      raw: a,
      text: a.text,
      date: a.due_date || e.date,
      event: e,
      project: e.project,
      person: a.assignee_name,
      statusLabel: a.done ? 'Done' : isOverdue(a) ? 'Overdue' : 'Open',
      statusClass: a.done
        ? 'bg-emerald-100 text-emerald-700'
        : isOverdue(a)
          ? 'bg-rose-100 text-rose-700'
          : 'bg-slate-100 text-slate-600',
    })),
    ...e.pain_points.map((p) => ({
      kind: 'pain',
      id: `p${p.id}`,
      raw: p,
      text: p.text,
      date: e.date,
      event: e,
      project: e.project,
      person: p.owner_name,
      statusLabel: p.resolved ? 'Resolved' : p.severity,
      statusClass: p.resolved
        ? 'bg-emerald-100 text-emerald-700'
        : {
            High: 'bg-rose-100 text-rose-700',
            Medium: 'bg-amber-100 text-amber-700',
            Low: 'bg-slate-100 text-slate-600',
          }[p.severity],
    })),
    ...e.decisions.map((d) => ({
      kind: 'decision',
      id: `d${d.id}`,
      raw: d,
      text: d.text,
      date: e.date,
      event: e,
      project: e.project,
      person: d.decided_by_name,
      statusLabel: 'Decided',
      statusClass: 'bg-indigo-100 text-indigo-700',
    })),
  ]);
  rows = rows.concat(
    store.selectedProjects.flatMap((p) => [
      ...p.requirements.map((r) => ({
        kind: 'requirement',
        id: `req${r.id}`,
        raw: r,
        text: r.text,
        date: r.created_at.slice(0, 10),
        event: null,
        project: p,
        person: null,
        statusLabel: r.done ? 'Done' : 'Open',
        statusClass: r.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600',
      })),
      ...p.goals.map((g) => ({
        kind: 'goal',
        id: `goal${g.id}`,
        raw: g,
        text: g.text,
        date: g.target_date || g.created_at.slice(0, 10),
        event: null,
        project: p,
        person: null,
        statusLabel: g.achieved ? 'Achieved' : 'Open',
        statusClass: g.achieved ? 'bg-emerald-100 text-emerald-700' : 'bg-fuchsia-100 text-fuchsia-700',
      })),
    ]),
  );
  if (projectFilter.value) rows = rows.filter((r) => r.project.id === Number(projectFilter.value));
  return rows.sort((a, b) => b.date.localeCompare(a.date));
});

const KIND_LABELS = {
  action: 'Action Item',
  pain: 'Pain Point',
  decision: 'Decision',
  requirement: 'Requirement',
  goal: 'Goal',
};
const KIND_CLASSES = {
  action: 'bg-sky-100 text-sky-700',
  pain: 'bg-amber-100 text-amber-700',
  decision: 'bg-slate-200 text-slate-700',
  requirement: 'bg-cyan-100 text-cyan-700',
  goal: 'bg-fuchsia-100 text-fuchsia-700',
};

// Scoped by project only (not assignee/overdue/etc.) so the empty states below can
// tell "genuinely nothing here" apart from "filtered down to nothing" and offer to
// clear the filter instead of just looking broken.
const actionItemsInScope = computed(() => {
  let rows = store.events.flatMap((e) => e.action_items.map((a) => ({ ...a, event: e })));
  if (projectFilter.value) rows = rows.filter((a) => a.event.project_id === Number(projectFilter.value));
  return rows;
});
const actionItems = computed(() => {
  let rows = actionItemsInScope.value;
  if (assigneeFilter.value) rows = rows.filter((a) => a.assignee_id === Number(assigneeFilter.value));
  if (actionOverdueOnly.value) rows = rows.filter(isOverdue);
  return [...rows].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
});
function clearActionFilters() {
  assigneeFilter.value = '';
  actionOverdueOnly.value = false;
}

const painPointsInScope = computed(() => {
  let rows = store.events.flatMap((e) => e.pain_points.map((p) => ({ ...p, event: e })));
  if (projectFilter.value) rows = rows.filter((p) => p.event.project_id === Number(projectFilter.value));
  return rows;
});
const painPoints = computed(() => {
  let rows = painPointsInScope.value;
  if (painOpenOnly.value) rows = rows.filter((p) => !p.resolved);
  if (painSeverityFilter.value) rows = rows.filter((p) => p.severity === painSeverityFilter.value);
  if (painKindFilter.value) rows = rows.filter((p) => p.kind === painKindFilter.value);
  const order = { High: 0, Medium: 1, Low: 2 };
  return [...rows].sort((a, b) => order[a.severity] - order[b.severity]);
});
function clearPainFilters() {
  painOpenOnly.value = false;
  painSeverityFilter.value = '';
  painKindFilter.value = '';
}

// Requirements/goals are project-scoped, not event-scoped — they're already
// delivered nested on each project (see GET /api/projects), so no
// store.events flatMap is needed here, unlike action items/pain points/decisions.
const requirementsInScope = computed(() => {
  let rows = store.selectedProjects.flatMap((p) => p.requirements.map((r) => ({ ...r, project: p })));
  if (projectFilter.value) rows = rows.filter((r) => r.project_id === Number(projectFilter.value));
  return rows;
});
const requirementsList = computed(() => {
  let rows = requirementsInScope.value;
  if (requirementOpenOnly.value) rows = rows.filter((r) => !r.done);
  return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
});
function clearRequirementFilters() {
  requirementOpenOnly.value = false;
}

const goalsInScope = computed(() => {
  let rows = store.selectedProjects.flatMap((p) => p.goals.map((g) => ({ ...g, project: p })));
  if (projectFilter.value) rows = rows.filter((g) => g.project_id === Number(projectFilter.value));
  return rows;
});
const goalsList = computed(() => {
  let rows = goalsInScope.value;
  if (goalOpenOnly.value) rows = rows.filter((g) => !g.achieved);
  return [...rows].sort((a, b) => (a.target_date || '9999-99-99').localeCompare(b.target_date || '9999-99-99'));
});
function clearGoalFilters() {
  goalOpenOnly.value = false;
}

// Milestone/deadline events aren't decisions/action items/pain points — they're
// events themselves — so they get their own tab rather than folding into Overview.
// Mirrors the 14-day window GET /api/dashboard/summary uses server-side.
const upcomingEvents = computed(() => {
  let rows = store.events.filter(
    (e) => ['milestone', 'deadline'].includes(e.type) && e.date >= todayStr && e.date <= in14DaysStr,
  );
  if (projectFilter.value) rows = rows.filter((e) => e.project_id === Number(projectFilter.value));
  return rows.sort((a, b) => a.date.localeCompare(b.date));
});

const decisions = computed(() => {
  let rows = store.events.flatMap((e) => e.decisions.map((d) => ({ ...d, event: e })));
  if (projectFilter.value) rows = rows.filter((d) => d.event.project_id === Number(projectFilter.value));
  return rows.sort((a, b) => b.event.date.localeCompare(a.event.date));
});

// The Stakeholder Directory is admin-only now (PLAN.md Section 3.H), so a
// non-admin can't fetch store.stakeholders to populate this filter — build it
// instead from assignees who actually appear in the events this user can already
// see, plus their own entry (so "My Tasks" always has something to select even
// before they have any tasks assigned).
const knownAssignees = computed(() => {
  const byId = new Map();
  for (const e of store.events) {
    for (const a of e.action_items) {
      if (a.assignee_id && !byId.has(a.assignee_id)) byId.set(a.assignee_id, a.assignee_name);
    }
  }
  if (store.currentMember?.stakeholder_id && !byId.has(store.currentMember.stakeholder_id)) {
    byId.set(store.currentMember.stakeholder_id, store.currentMember.name);
  }
  return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
});

async function toggleDone(item) {
  await store.toggleActionItemDone(item.id, !item.done);
}
async function toggleResolved(pp) {
  await store.togglePainPointResolved(pp.id, !pp.resolved);
}
async function toggleRequirement(r) {
  await store.toggleRequirementDone(r.id, !r.done);
}
async function toggleGoal(g) {
  await store.toggleGoalAchieved(g.id, !g.achieved);
}
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
            v-for="t in [['overview', 'Overview'], ['actions', 'Action Items'], ['pain', 'Pain Points'], ['decisions', 'Decisions'], ['requirements', 'Requirements'], ['goals', 'Goals'], ['upcoming', 'Upcoming']]"
            :key="t[0]"
            class="px-3 py-1.5 text-sm rounded-md"
            :class="subTab === t[0] ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="subTab = t[0]"
          >{{ t[1] }}</button>
        </div>
        <div class="flex items-center gap-2">
          <label v-if="subTab === 'actions'" class="flex items-center gap-1.5 text-sm text-slate-600 whitespace-nowrap">
            <input type="checkbox" v-model="actionOverdueOnly" /> Overdue only
          </label>
          <select v-if="subTab === 'actions'" v-model="assigneeFilter" class="border border-slate-300 rounded px-2 py-1 text-sm">
            <option value="">My Tasks: all assignees</option>
            <option v-for="s in knownAssignees" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <label v-if="subTab === 'pain'" class="flex items-center gap-1.5 text-sm text-slate-600 whitespace-nowrap">
            <input type="checkbox" v-model="painOpenOnly" /> Open only
          </label>
          <select v-if="subTab === 'pain'" v-model="painKindFilter" class="border border-slate-300 rounded px-2 py-1 text-sm">
            <option value="">Risks + Issues</option>
            <option value="risk">Risks only</option>
            <option value="issue">Issues only</option>
          </select>
          <select v-if="subTab === 'pain'" v-model="painSeverityFilter" class="border border-slate-300 rounded px-2 py-1 text-sm">
            <option value="">All severities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <label v-if="subTab === 'requirements'" class="flex items-center gap-1.5 text-sm text-slate-600 whitespace-nowrap">
            <input type="checkbox" v-model="requirementOpenOnly" /> Open only
          </label>
          <label v-if="subTab === 'goals'" class="flex items-center gap-1.5 text-sm text-slate-600 whitespace-nowrap">
            <input type="checkbox" v-model="goalOpenOnly" /> Open only
          </label>
          <select v-model="projectFilter" class="border border-slate-300 rounded px-2 py-1 text-sm">
            <option value="">All selected projects</option>
            <option v-for="p in store.selectedProjects" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
      </div>

      <table v-if="subTab === 'overview'" class="w-full text-sm">
        <thead>
          <tr :class="TABLE_HEADER_ROW">
            <th class="py-1.5 w-8"></th><th class="py-1.5">Type</th><th class="py-1.5">Text</th><th class="py-1.5">Event</th><th class="py-1.5">Person</th><th class="py-1.5">Project</th><th class="py-1.5">Status</th><th class="py-1.5">Date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in allItems" :key="r.id" :class="TABLE_BODY_ROW">
            <td class="py-1.5">
              <input
                v-if="r.kind === 'action'" type="checkbox" :checked="!!r.raw.done" @change="toggleDone(r.raw)"
              />
              <input
                v-else-if="r.kind === 'pain'" type="checkbox" :checked="!!r.raw.resolved" @change="toggleResolved(r.raw)"
              />
              <input
                v-else-if="r.kind === 'requirement'" type="checkbox" :checked="!!r.raw.done" @change="toggleRequirement(r.raw)"
              />
              <input
                v-else-if="r.kind === 'goal'" type="checkbox" :checked="!!r.raw.achieved" @change="toggleGoal(r.raw)"
              />
            </td>
            <td class="py-1.5"><span class="text-xs px-1.5 py-0.5 rounded font-medium" :class="KIND_CLASSES[r.kind]">{{ KIND_LABELS[r.kind] }}</span></td>
            <td class="py-1.5" :class="(r.raw.done || r.raw.resolved || r.raw.achieved) ? 'line-through text-slate-400' : ''">{{ r.text }}</td>
            <td class="py-1.5">
              <EventLink v-if="r.event" :event="r.event" @select="emit('select-event', $event)" />
              <span v-else class="text-slate-400">—</span>
            </td>
            <td class="py-1.5 text-slate-500">{{ r.person || '—' }}</td>
            <td class="py-1.5"><ProjectChip :project="r.project" /></td>
            <td class="py-1.5"><span class="text-xs px-1.5 py-0.5 rounded" :class="r.statusClass">{{ r.statusLabel }}</span></td>
            <td class="py-1.5 text-slate-500">{{ formatDate(r.date) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="subTab === 'overview' && allItems.length === 0" class="text-sm text-slate-400 py-4">Nothing to show yet.</p>

      <table v-if="subTab === 'actions'" class="w-full text-sm">
        <thead>
          <tr :class="TABLE_HEADER_ROW">
            <th class="py-1.5 w-8"></th><th class="py-1.5">Action Item</th><th class="py-1.5">Assignee</th><th class="py-1.5">Event</th><th class="py-1.5">Project</th><th class="py-1.5">Due date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in actionItems" :key="a.id" :class="TABLE_BODY_ROW">
            <td class="py-1.5"><input type="checkbox" :checked="!!a.done" @change="toggleDone(a)" /></td>
            <td class="py-1.5" :class="a.done ? 'line-through text-slate-400' : ''">{{ a.text }}</td>
            <td class="py-1.5 text-slate-500">{{ a.assignee_name || '—' }}</td>
            <td class="py-1.5"><EventLink :event="a.event" @select="emit('select-event', $event)" /></td>
            <td class="py-1.5"><ProjectChip :project="a.event.project" /></td>
            <td class="py-1.5" :class="isOverdue(a) ? 'text-rose-600 font-medium' : 'text-slate-500'">{{ formatDate(a.due_date) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="subTab === 'actions' && actionItems.length === 0" class="text-sm text-slate-400 py-4">
        <template v-if="actionItemsInScope.length > 0">
          No tasks match the current filter — {{ actionItemsInScope.length }} hidden.
          <button type="button" class="text-indigo-600 hover:underline" @click="clearActionFilters">Clear filters</button>
        </template>
        <template v-else>No action items.</template>
      </div>

      <table v-if="subTab === 'pain'" class="w-full text-sm">
        <thead>
          <tr :class="TABLE_HEADER_ROW">
            <th class="py-1.5 w-8"></th><th class="py-1.5">Pain Point</th><th class="py-1.5">Kind</th><th class="py-1.5">Severity</th><th class="py-1.5">Owner</th><th class="py-1.5">Event</th><th class="py-1.5">Project</th><th class="py-1.5">Date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in painPoints" :key="p.id" :class="TABLE_BODY_ROW">
            <td class="py-1.5"><input type="checkbox" :checked="!!p.resolved" @change="toggleResolved(p)" /></td>
            <td class="py-1.5" :class="p.resolved ? 'line-through text-slate-400' : ''">{{ p.text }}</td>
            <td class="py-1.5">
              <span
                class="text-xs px-1.5 py-0.5 rounded"
                :class="p.kind === 'risk' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'"
              >{{ p.kind === 'risk' ? 'Risk' : 'Issue' }}</span>
            </td>
            <td class="py-1.5">
              <span
                class="text-xs px-1.5 py-0.5 rounded"
                :class="{ High: 'bg-rose-100 text-rose-700', Medium: 'bg-amber-100 text-amber-700', Low: 'bg-slate-100 text-slate-600' }[p.severity]"
              >{{ p.severity }}</span>
            </td>
            <td class="py-1.5 text-slate-500">{{ p.owner_name || '—' }}</td>
            <td class="py-1.5"><EventLink :event="p.event" @select="emit('select-event', $event)" /></td>
            <td class="py-1.5"><ProjectChip :project="p.event.project" /></td>
            <td class="py-1.5 text-slate-500">{{ formatDate(p.event.date) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="subTab === 'pain' && painPoints.length === 0" class="text-sm text-slate-400 py-4">
        <template v-if="painPointsInScope.length > 0">
          No pain points match the current filter — {{ painPointsInScope.length }} hidden.
          <button type="button" class="text-indigo-600 hover:underline" @click="clearPainFilters">Clear filters</button>
        </template>
        <template v-else>No pain points.</template>
      </div>

      <table v-if="subTab === 'decisions'" class="w-full text-sm">
        <thead>
          <tr :class="TABLE_HEADER_ROW">
            <th class="py-1.5">Decision</th><th class="py-1.5">Decided by</th><th class="py-1.5">Event</th><th class="py-1.5">Project</th><th class="py-1.5">Date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in decisions" :key="d.id" :class="TABLE_BODY_ROW">
            <td class="py-1.5">{{ d.text }}</td>
            <td class="py-1.5 text-slate-500">{{ d.decided_by_name || '—' }}</td>
            <td class="py-1.5"><EventLink :event="d.event" @select="emit('select-event', $event)" /></td>
            <td class="py-1.5"><ProjectChip :project="d.event.project" /></td>
            <td class="py-1.5 text-slate-500">{{ formatDate(d.event.date) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="subTab === 'decisions' && decisions.length === 0" class="text-sm text-slate-400 py-4">No decisions logged.</p>

      <table v-if="subTab === 'requirements'" class="w-full text-sm">
        <thead>
          <tr :class="TABLE_HEADER_ROW">
            <th class="py-1.5 w-8"></th><th class="py-1.5">Requirement</th><th class="py-1.5">Project</th><th class="py-1.5">Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in requirementsList" :key="r.id" :class="TABLE_BODY_ROW">
            <td class="py-1.5"><input type="checkbox" :checked="!!r.done" @change="toggleRequirement(r)" /></td>
            <td class="py-1.5" :class="r.done ? 'line-through text-slate-400' : ''">{{ r.text }}</td>
            <td class="py-1.5"><ProjectChip :project="r.project" /></td>
            <td class="py-1.5 text-slate-500">{{ formatDate(r.created_at.slice(0, 10)) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="subTab === 'requirements' && requirementsList.length === 0" class="text-sm text-slate-400 py-4">
        <template v-if="requirementsInScope.length > 0">
          No requirements match the current filter — {{ requirementsInScope.length }} hidden.
          <button type="button" class="text-indigo-600 hover:underline" @click="clearRequirementFilters">Clear filters</button>
        </template>
        <template v-else>No requirements yet — add some from a project's Edit Project form.</template>
      </div>

      <table v-if="subTab === 'goals'" class="w-full text-sm">
        <thead>
          <tr :class="TABLE_HEADER_ROW">
            <th class="py-1.5 w-8"></th><th class="py-1.5">Goal</th><th class="py-1.5">Project</th><th class="py-1.5">Target date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in goalsList" :key="g.id" :class="TABLE_BODY_ROW">
            <td class="py-1.5"><input type="checkbox" :checked="!!g.achieved" @change="toggleGoal(g)" /></td>
            <td class="py-1.5" :class="g.achieved ? 'line-through text-slate-400' : ''">{{ g.text }}</td>
            <td class="py-1.5"><ProjectChip :project="g.project" /></td>
            <td class="py-1.5 text-slate-500">{{ g.target_date ? formatDate(g.target_date) : '—' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="subTab === 'goals' && goalsList.length === 0" class="text-sm text-slate-400 py-4">
        <template v-if="goalsInScope.length > 0">
          No goals match the current filter — {{ goalsInScope.length }} hidden.
          <button type="button" class="text-indigo-600 hover:underline" @click="clearGoalFilters">Clear filters</button>
        </template>
        <template v-else>No goals yet — add some from a project's Edit Project form.</template>
      </div>

      <table v-if="subTab === 'upcoming'" class="w-full text-sm">
        <thead>
          <tr :class="TABLE_HEADER_ROW">
            <th class="py-1.5">Type</th><th class="py-1.5">Title</th><th class="py-1.5">Project</th><th class="py-1.5">Status</th><th class="py-1.5">Date</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in upcomingEvents" :key="e.id" :class="TABLE_BODY_ROW">
            <td class="py-1.5"><span class="text-xs px-1.5 py-0.5 rounded font-medium bg-violet-100 text-violet-700">{{ EVENT_TYPES[e.type].label }}</span></td>
            <td class="py-1.5"><EventLink :event="e" @select="emit('select-event', $event)" /></td>
            <td class="py-1.5"><ProjectChip :project="e.project" /></td>
            <td class="py-1.5 text-slate-500">{{ STATUS_LABELS[e.status] }}</td>
            <td class="py-1.5 text-slate-500">{{ formatDate(e.date) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="subTab === 'upcoming' && upcomingEvents.length === 0" class="text-sm text-slate-400 py-4">No milestones or deadlines in the next 14 days.</p>
    </template>
  </div>
</template>
