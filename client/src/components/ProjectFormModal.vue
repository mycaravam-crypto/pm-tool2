<script setup>
import { Check, Crown, History, Loader2, Pencil, Plus, Trash2, X } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref } from 'vue';
import HelpTooltip from '@/components/HelpTooltip.vue';
import ModalShell from '@/components/ModalShell.vue';
import { useAsyncAction } from '@/composables/useAsyncAction.js';
import { api } from '@/lib/api.js';
import { formatDate } from '@/lib/dateFormat.js';
import { goalProgress } from '@/lib/goalProgress.js';
import { DAY_MS } from '@/lib/timelineScale.js';
import { useProjectStore } from '@/stores/useProjectStore.js';

const props = defineProps({ project: { type: Object, default: null } });
const emit = defineEmits(['close']);
const store = useProjectStore();
const isEdit = computed(() => !!props.project);

// props.project is a snapshot from when the modal opened; store.projects gets
// replaced wholesale after every mutation, so nested Requirements/Goals must be
// read from the live store entry or they'd go stale after the first edit.
const liveProject = computed(() => (isEdit.value ? (store.projectById(props.project.id) ?? props.project) : null));

// original_target_end_date is snapshotted once at creation and never updated
// (see POST /api/projects) — comparing it to the current target_end_date is
// what makes schedule slip visible instead of silently overwritten.
const scheduleSlip = computed(() => {
  const proj = liveProject.value;
  if (!proj?.original_target_end_date || !proj?.target_end_date) return null;
  if (proj.original_target_end_date === proj.target_end_date) return null;
  const days = Math.round((new Date(proj.target_end_date) - new Date(proj.original_target_end_date)) / DAY_MS);
  return { originalDate: proj.original_target_end_date, days };
});

// original_budget_planned is snapshotted once at creation and never updated (see
// POST /api/projects) — same "baseline vs. current" pattern as scheduleSlip above.
const budgetSlip = computed(() => {
  const proj = liveProject.value;
  if (proj?.original_budget_planned == null || proj?.budget_planned == null) return null;
  if (proj.original_budget_planned === proj.budget_planned) return null;
  return { originalAmount: proj.original_budget_planned, delta: proj.budget_planned - proj.original_budget_planned };
});

const goalsWithProgress = computed(() => {
  const requirements = liveProject.value?.requirements ?? [];
  return (liveProject.value?.goals ?? []).map((g) => ({ ...g, progress: goalProgress(g.id, requirements) }));
});

const form = reactive({
  name: props.project?.name ?? '',
  description: props.project?.description ?? '',
  color_hex: props.project?.color_hex ?? '#3B82F6',
  status: props.project?.status ?? 'active',
  start_date: props.project?.start_date ?? '',
  target_end_date: props.project?.target_end_date ?? '',
  budget_planned: props.project?.budget_planned ?? '',
  budget_spent: props.project?.budget_spent ?? 0,
  lead_stakeholder_id: props.project?.lead?.id ?? '',
});

const people = ref([]);
const newPersonId = ref('');
const newPersonRole = ref('member');
const saving = ref(false);
const error = ref('');
const runAction = useAsyncAction(error);

async function loadPeople() {
  if (!isEdit.value) return;
  people.value = await api.projects.stakeholders(props.project.id);
}

onMounted(loadPeople);

const availableToAdd = computed(() => store.stakeholders.filter((s) => !people.value.some((p) => p.id === s.id)));

// Mirrors server-side canManageProject/canContribute (server/utils/access.js):
// settings/team changes need lead/sponsor/admin, Requirements/Goals need any
// committed role.
const myRole = computed(
  () => people.value.find((p) => p.id === store.currentMember?.stakeholder_id)?.project_role ?? null,
);
const canManage = computed(
  () => !isEdit.value || store.isAdmin || myRole.value === 'lead' || myRole.value === 'sponsor',
);
const canContribute = computed(
  () => !isEdit.value || store.isAdmin || (myRole.value !== null && myRole.value !== 'stakeholder'),
);
// Mirrors server-side canDeleteProjectItems: narrower than canContribute — every
// committed role can add/edit a requirement or goal, but only the project's
// lead (or an admin) can delete one.
const canDelete = computed(() => !isEdit.value || store.isAdmin || myRole.value === 'lead');

async function save() {
  error.value = '';
  if (!isEdit.value && !form.lead_stakeholder_id) {
    error.value = 'A project lead is required.';
    return;
  }
  saving.value = true;
  await runAction(async () => {
    if (isEdit.value) {
      await store.updateProject(props.project.id, {
        name: form.name,
        description: form.description,
        color_hex: form.color_hex,
        status: form.status,
        start_date: form.start_date || null,
        target_end_date: form.target_end_date || null,
        budget_planned: form.budget_planned === '' ? null : Number(form.budget_planned),
        budget_spent: Number(form.budget_spent) || 0,
      });
    } else {
      await store.createProject({
        name: form.name,
        description: form.description,
        color_hex: form.color_hex,
        start_date: form.start_date || null,
        target_end_date: form.target_end_date || null,
        budget_planned: form.budget_planned === '' ? null : Number(form.budget_planned),
        budget_spent: Number(form.budget_spent) || 0,
        lead_stakeholder_id: Number(form.lead_stakeholder_id),
      });
    }
    emit('close');
  });
  saving.value = false;
}

async function removeProject() {
  if (
    !confirm(
      `Delete "${props.project.name}"? This also deletes all of its events, decisions, action items, and pain points. This cannot be undone.`,
    )
  )
    return;
  await runAction(async () => {
    await store.deleteProject(props.project.id);
    emit('close');
  });
}

async function addPerson() {
  if (!newPersonId.value) return;
  await runAction(async () => {
    await store.assignStakeholderToProject(props.project.id, Number(newPersonId.value), newPersonRole.value);
    newPersonId.value = '';
    newPersonRole.value = 'member';
    await loadPeople();
  });
}

async function makeLead(stakeholderId) {
  await runAction(async () => {
    await store.setProjectLead(props.project.id, stakeholderId);
    await loadPeople();
  });
}

async function removePerson(stakeholderId) {
  await runAction(async () => {
    await api.projects.removeStakeholder(props.project.id, stakeholderId);
    await loadPeople();
  });
}

async function changeRole(stakeholderId, role) {
  await runAction(async () => {
    await api.projects.setStakeholderRole(props.project.id, stakeholderId, role);
    await loadPeople();
  });
}

const newRequirementText = ref('');
const newRequirementGoalId = ref('');
async function addRequirement() {
  if (!newRequirementText.value.trim()) return;
  await runAction(async () => {
    await store.addRequirement({
      project_id: props.project.id,
      text: newRequirementText.value.trim(),
      goal_id: newRequirementGoalId.value || null,
    });
    newRequirementText.value = '';
    newRequirementGoalId.value = '';
  });
}
async function toggleRequirement(r) {
  await runAction(() => store.toggleRequirementDone(r.id, !r.done));
}
async function changeRequirementGoal(r, goalId) {
  await runAction(() => store.updateRequirement(r.id, { text: r.text, goal_id: goalId || null }));
}
async function removeRequirement(id) {
  await runAction(() => store.deleteRequirement(id));
}

const newGoalText = ref('');
const newGoalTargetDate = ref('');
async function addGoal() {
  if (!newGoalText.value.trim()) return;
  await runAction(async () => {
    await store.addGoal({
      project_id: props.project.id,
      text: newGoalText.value.trim(),
      target_date: newGoalTargetDate.value || null,
    });
    newGoalText.value = '';
    newGoalTargetDate.value = '';
  });
}
async function toggleGoal(g) {
  await runAction(() => store.toggleGoalAchieved(g.id, !g.achieved));
}
async function removeGoal(id) {
  await runAction(() => store.deleteGoal(id));
}

// Content editing (text, and target_date for goals) is separate from the
// done/achieved checkbox and goal-link dropdown above — those are status changes
// and don't generate history rows (server only logs on a text diff).
const editingRequirementId = ref(null);
const editRequirementText = ref('');
function startEditRequirement(r) {
  editingRequirementId.value = r.id;
  editRequirementText.value = r.text;
}
function cancelEditRequirement() {
  editingRequirementId.value = null;
}
async function saveRequirementEdit(r) {
  if (!editRequirementText.value.trim()) return;
  await runAction(async () => {
    await store.updateRequirement(r.id, { text: editRequirementText.value.trim(), goal_id: r.goal_id });
    editingRequirementId.value = null;
  });
}

const editingGoalId = ref(null);
const editGoalText = ref('');
const editGoalTargetDate = ref('');
function startEditGoal(g) {
  editingGoalId.value = g.id;
  editGoalText.value = g.text;
  editGoalTargetDate.value = g.target_date ?? '';
}
function cancelEditGoal() {
  editingGoalId.value = null;
}
async function saveGoalEdit(g) {
  if (!editGoalText.value.trim()) return;
  await runAction(async () => {
    await store.updateGoal(g.id, { text: editGoalText.value.trim(), target_date: editGoalTargetDate.value || null });
    editingGoalId.value = null;
  });
}

// Only one history list open at a time per section — toggling the same id closes it.
const openRequirementHistoryId = ref(null);
function toggleRequirementHistory(id) {
  openRequirementHistoryId.value = openRequirementHistoryId.value === id ? null : id;
}
const openGoalHistoryId = ref(null);
function toggleGoalHistory(id) {
  openGoalHistoryId.value = openGoalHistoryId.value === id ? null : id;
}
</script>

<template>
  <ModalShell :title="isEdit ? 'Edit Project' : 'New Project'" :wide="isEdit" @close="emit('close')">
    <form class="project-form-modal space-y-4" @submit.prevent="save">
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">
          <label class="block text-xs font-medium text-slate-400 mb-1">Name</label>
          <input v-model="form.name" required :disabled="!canManage" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm disabled:bg-white/[.03] disabled:text-slate-500" />
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-medium text-slate-400 mb-1">Description (Scope)</label>
          <textarea v-model="form.description" rows="2" :disabled="!canManage" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm disabled:bg-white/[.03] disabled:text-slate-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Color</label>
          <input v-model="form.color_hex" type="color" :disabled="!canManage" class="w-full h-9 border border-white/15 rounded-md disabled:opacity-50" />
        </div>
        <div v-if="isEdit">
          <label class="block text-xs font-medium text-slate-400 mb-1">Status</label>
          <select v-model="form.status" :disabled="!canManage" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm disabled:bg-white/[.03] disabled:text-slate-500">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Start date</label>
          <input v-model="form.start_date" type="date" :disabled="!canManage" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm disabled:bg-white/[.03] disabled:text-slate-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Target end date</label>
          <input v-model="form.target_end_date" type="date" :disabled="!canManage" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm disabled:bg-white/[.03] disabled:text-slate-500" />
          <p v-if="scheduleSlip" class="text-xs mt-1" :class="scheduleSlip.days > 0 ? 'text-amber-400' : 'text-slate-500'">
            Originally planned: {{ formatDate(scheduleSlip.originalDate) }}
            ({{ scheduleSlip.days > 0 ? `slipped ${scheduleSlip.days}d` : `moved up ${-scheduleSlip.days}d` }})
          </p>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Budget planned</label>
          <input v-model="form.budget_planned" type="number" step="0.01" :disabled="!canManage" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm disabled:bg-white/[.03] disabled:text-slate-500" />
          <p v-if="budgetSlip" class="text-xs mt-1" :class="budgetSlip.delta > 0 ? 'text-amber-400' : 'text-slate-500'">
            Originally planned: {{ budgetSlip.originalAmount }}
            ({{ budgetSlip.delta > 0 ? `+${budgetSlip.delta}` : budgetSlip.delta }})
          </p>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Budget spent</label>
          <input v-model="form.budget_spent" type="number" step="0.01" :disabled="!canManage" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm disabled:bg-white/[.03] disabled:text-slate-500" />
        </div>

        <div v-if="!isEdit" class="col-span-2">
          <label class="flex items-center gap-1 text-xs font-medium text-slate-400 mb-1">
            Lead <span class="text-rose-400">*</span>
            <HelpTooltip text="Every project must have exactly one accountable lead — the person responsible for schedule, budget, and quality outcomes." />
          </label>
          <select v-model="form.lead_stakeholder_id" required class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm">
            <option value="" disabled>Select a lead…</option>
            <option v-for="s in store.stakeholders" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
      </div>

      <div v-if="isEdit" class="border-t border-white/10 pt-4">
        <h3 class="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">People</h3>
        <ul class="space-y-1 mb-3">
          <li v-for="p in people" :key="p.id" class="flex items-center gap-2 text-sm">
            <span class="flex-1">{{ p.name }}</span>
            <select
              v-if="p.project_role !== 'lead' && canManage"
              :value="p.project_role"
              class="border border-white/15 rounded px-1.5 py-0.5 text-xs"
              @change="changeRole(p.id, $event.target.value)"
            >
              <option value="sponsor">Sponsor</option>
              <option value="member">Member</option>
              <option value="stakeholder">Stakeholder</option>
            </select>
            <span v-else-if="p.project_role === 'lead'" class="text-xs font-medium px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">Lead</span>
            <span v-else class="text-xs text-slate-500 capitalize">{{ p.project_role }}</span>
            <button
              v-if="p.project_role !== 'lead' && canManage"
              type="button" class="text-slate-500 hover:text-violet-400" title="Make lead"
              @click="makeLead(p.id)"
            ><Crown class="w-3.5 h-3.5" /></button>
            <button
              v-if="p.project_role !== 'lead' && canManage"
              type="button" class="text-slate-500 hover:text-rose-400" title="Remove from project"
              @click="removePerson(p.id)"
            ><Trash2 class="w-3.5 h-3.5" /></button>
          </li>
        </ul>
        <div v-if="canManage" class="flex items-center gap-2">
          <select v-model="newPersonId" class="flex-1 border border-white/15 rounded-md px-2 py-1 text-sm" @keydown.enter.prevent="addPerson">
            <option value="" disabled>Add stakeholder…</option>
            <option v-for="s in availableToAdd" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <select v-model="newPersonRole" class="border border-white/15 rounded-md px-2 py-1 text-sm" @keydown.enter.prevent="addPerson">
            <option value="sponsor">Sponsor</option>
            <option value="member">Member</option>
            <option value="stakeholder">Stakeholder</option>
          </select>
          <button type="button" class="text-violet-400" title="Add" @click="addPerson"><Plus class="w-4 h-4" /></button>
        </div>
      </div>

      <div v-if="isEdit" class="border-t border-white/10 pt-4">
        <h3 class="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1">
          Requirements
          <HelpTooltip text="Optionally link a requirement to the Goal it serves — the Goals list below then shows how many of its linked requirements are done, so you can see whether the work underway actually adds up to the outcome." />
        </h3>
        <ul class="space-y-1 mb-2">
          <li v-for="r in liveProject?.requirements ?? []" :key="r.id" class="text-sm">
            <div class="flex items-center gap-2">
              <input type="checkbox" :checked="!!r.done" :disabled="!canContribute" @change="toggleRequirement(r)" />
              <template v-if="editingRequirementId === r.id">
                <input
                  v-model="editRequirementText" class="flex-1 border border-white/15 rounded px-2 py-1 text-sm"
                  @keydown.enter.prevent="saveRequirementEdit(r)" @keydown.esc="cancelEditRequirement"
                />
                <button type="button" title="Cancel" class="text-slate-500 hover:text-white" @click="cancelEditRequirement"><X class="w-3.5 h-3.5" /></button>
                <button type="button" title="Save" class="text-violet-400 hover:text-violet-300" @click="saveRequirementEdit(r)"><Check class="w-3.5 h-3.5" /></button>
              </template>
              <template v-else>
                <span class="flex-1" :class="r.done ? 'line-through text-slate-500' : ''">{{ r.text }}</span>
                <select
                  :value="r.goal_id ?? ''"
                  :disabled="!canContribute"
                  class="border border-white/15 rounded px-1.5 py-0.5 text-xs bg-transparent disabled:opacity-50"
                  @change="changeRequirementGoal(r, $event.target.value)"
                >
                  <option value="">No goal</option>
                  <option v-for="g in liveProject?.goals ?? []" :key="g.id" :value="g.id">{{ g.text }}</option>
                </select>
                <button
                  v-if="r.history?.length" type="button" title="Edit history" class="text-slate-500 hover:text-slate-300"
                  @click="toggleRequirementHistory(r.id)"
                ><History class="w-3.5 h-3.5" /></button>
                <button v-if="canContribute" type="button" title="Edit" class="text-slate-500 hover:text-violet-400" @click="startEditRequirement(r)"><Pencil class="w-3.5 h-3.5" /></button>
                <button v-if="canDelete" type="button" class="text-slate-500 hover:text-rose-400" @click="removeRequirement(r.id)"><Trash2 class="w-3.5 h-3.5" /></button>
              </template>
            </div>
            <ul v-if="openRequirementHistoryId === r.id" class="ml-6 mt-1 space-y-0.5 border-l border-white/10 pl-2 text-xs text-slate-500">
              <li v-for="h in r.history" :key="h.id">Was "{{ h.previous_text }}" — {{ h.changed_by_name || '—' }}, {{ formatDate(h.changed_at.slice(0, 10)) }}</li>
            </ul>
          </li>
          <li v-if="!liveProject?.requirements?.length" class="text-sm text-slate-500">No requirements yet.</li>
        </ul>
        <div v-if="canContribute" class="flex gap-2">
          <input v-model="newRequirementText" placeholder="New requirement…" class="flex-1 border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addRequirement" />
          <select v-model="newRequirementGoalId" class="border border-white/15 rounded-md px-2 py-1 text-sm">
            <option value="">No goal</option>
            <option v-for="g in liveProject?.goals ?? []" :key="g.id" :value="g.id">{{ g.text }}</option>
          </select>
          <button type="button" class="text-violet-400" @click="addRequirement"><Plus class="w-4 h-4" /></button>
        </div>
      </div>

      <div v-if="isEdit" class="border-t border-white/10 pt-4">
        <h3 class="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Goals</h3>
        <ul class="space-y-1 mb-2">
          <li v-for="g in goalsWithProgress" :key="g.id" class="text-sm">
            <div class="flex items-center gap-2">
              <input type="checkbox" :checked="!!g.achieved" :disabled="!canContribute" @change="toggleGoal(g)" />
              <template v-if="editingGoalId === g.id">
                <input
                  v-model="editGoalText" class="flex-1 border border-white/15 rounded px-2 py-1 text-sm"
                  @keydown.enter.prevent="saveGoalEdit(g)" @keydown.esc="cancelEditGoal"
                />
                <input v-model="editGoalTargetDate" type="date" class="border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="saveGoalEdit(g)" />
                <button type="button" title="Cancel" class="text-slate-500 hover:text-white" @click="cancelEditGoal"><X class="w-3.5 h-3.5" /></button>
                <button type="button" title="Save" class="text-violet-400 hover:text-violet-300" @click="saveGoalEdit(g)"><Check class="w-3.5 h-3.5" /></button>
              </template>
              <template v-else>
                <span class="flex-1" :class="g.achieved ? 'line-through text-slate-500' : ''">{{ g.text }}</span>
                <span
                  v-if="g.progress.total > 0"
                  class="text-xs text-slate-500 whitespace-nowrap"
                  title="Linked requirements done"
                >{{ g.progress.done }}/{{ g.progress.total }} reqs</span>
                <span v-if="g.target_date" class="text-xs text-slate-500 whitespace-nowrap">{{ formatDate(g.target_date) }}</span>
                <button
                  v-if="g.history?.length" type="button" title="Edit history" class="text-slate-500 hover:text-slate-300"
                  @click="toggleGoalHistory(g.id)"
                ><History class="w-3.5 h-3.5" /></button>
                <button v-if="canContribute" type="button" title="Edit" class="text-slate-500 hover:text-violet-400" @click="startEditGoal(g)"><Pencil class="w-3.5 h-3.5" /></button>
                <button v-if="canDelete" type="button" class="text-slate-500 hover:text-rose-400" @click="removeGoal(g.id)"><Trash2 class="w-3.5 h-3.5" /></button>
              </template>
            </div>
            <ul v-if="openGoalHistoryId === g.id" class="ml-6 mt-1 space-y-0.5 border-l border-white/10 pl-2 text-xs text-slate-500">
              <li v-for="h in g.history" :key="h.id">
                Was "{{ h.previous_text }}"<template v-if="h.previous_target_date"> (target: {{ formatDate(h.previous_target_date) }})</template>
                — {{ h.changed_by_name || '—' }}, {{ formatDate(h.changed_at.slice(0, 10)) }}
              </li>
            </ul>
          </li>
          <li v-if="!liveProject?.goals?.length" class="text-sm text-slate-500">No goals yet.</li>
        </ul>
        <div v-if="canContribute" class="flex gap-2">
          <input v-model="newGoalText" placeholder="New goal…" class="flex-1 border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addGoal" />
          <input v-model="newGoalTargetDate" type="date" class="border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addGoal" />
          <button type="button" class="text-violet-400" @click="addGoal"><Plus class="w-4 h-4" /></button>
        </div>
      </div>

      <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>

      <div class="flex items-center justify-between pt-2">
        <button
          v-if="isEdit && store.isAdmin" type="button" title="Delete project"
          class="grid h-9 w-9 place-items-center rounded-md text-rose-400 hover:bg-rose-500/10" @click="removeProject"
        ><Trash2 class="w-4 h-4" /></button>
        <span v-else />
        <div class="flex gap-2">
          <button type="button" title="Cancel" class="grid h-9 w-9 place-items-center rounded-md border border-white/15 text-slate-300 hover:bg-white/8" @click="emit('close')"><X class="w-4 h-4" /></button>
          <button
            v-if="canManage" type="submit" :disabled="saving" :title="saving ? 'Saving…' : 'Save'"
            class="grid h-9 w-9 place-items-center rounded-md bg-white text-slate-950 hover:bg-violet-50 disabled:opacity-50"
          >
            <Loader2 v-if="saving" class="w-4 h-4 animate-spin" />
            <Check v-else class="w-4 h-4" />
          </button>
        </div>
      </div>
    </form>
  </ModalShell>
</template>
