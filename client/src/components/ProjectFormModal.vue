<script setup>
import { Plus, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/dateFormat.js';
import { useProjectStore } from '../stores/useProjectStore.js';
import HelpTooltip from './HelpTooltip.vue';
import ModalShell from './ModalShell.vue';

const props = defineProps({ project: { type: Object, default: null } });
const emit = defineEmits(['close']);
const store = useProjectStore();
const isEdit = computed(() => !!props.project);

// props.project is a snapshot from when the modal opened; store.projects gets
// replaced wholesale after every mutation (see useProjectStore), so Requirements
// and Goals — delivered nested on the project, like lead/scorecard — must be read
// from the live store entry or they'd go stale after the first add/toggle/delete.
const liveProject = computed(() => (isEdit.value ? (store.projectById(props.project.id) ?? props.project) : null));

// original_target_end_date is snapshotted once at creation and never updated
// (see POST /api/projects) — comparing it to the current target_end_date is
// what makes schedule slip visible instead of silently overwritten.
const scheduleSlip = computed(() => {
  const proj = liveProject.value;
  if (!proj?.original_target_end_date || !proj?.target_end_date) return null;
  if (proj.original_target_end_date === proj.target_end_date) return null;
  const days = Math.round((new Date(proj.target_end_date) - new Date(proj.original_target_end_date)) / 86400000);
  return { originalDate: proj.original_target_end_date, days };
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

async function loadPeople() {
  if (!isEdit.value) return;
  people.value = await api.projects.stakeholders(props.project.id);
}

onMounted(loadPeople);

const availableToAdd = computed(() => store.stakeholders.filter((s) => !people.value.some((p) => p.id === s.id)));

// Only reachable in edit mode — creating a project is already admin-only,
// gated at the "New Project" button. Mirrors the server-side canManageProject/
// canContribute checks in server/utils/access.js: settings/team changes need
// lead/sponsor/admin, while Requirements/Goals follow the wider contribute tier.
const myRole = computed(
  () => people.value.find((p) => p.id === store.currentMember?.stakeholder_id)?.project_role ?? null,
);
const canManage = computed(
  () => !isEdit.value || store.isAdmin || myRole.value === 'lead' || myRole.value === 'sponsor',
);
const canContribute = computed(
  () => !isEdit.value || store.isAdmin || (myRole.value !== null && myRole.value !== 'stakeholder'),
);

async function save() {
  error.value = '';
  saving.value = true;
  try {
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
      if (!form.lead_stakeholder_id) {
        error.value = 'A project lead is required.';
        saving.value = false;
        return;
      }
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
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function removeProject() {
  if (
    !confirm(
      `Delete "${props.project.name}"? This also deletes all of its events, decisions, action items, and pain points. This cannot be undone.`,
    )
  )
    return;
  await store.deleteProject(props.project.id);
  emit('close');
}

async function addPerson() {
  if (!newPersonId.value) return;
  await store.assignStakeholderToProject(props.project.id, Number(newPersonId.value), newPersonRole.value);
  newPersonId.value = '';
  newPersonRole.value = 'member';
  await loadPeople();
}

async function makeLead(stakeholderId) {
  await store.setProjectLead(props.project.id, stakeholderId);
  await loadPeople();
}

async function removePerson(stakeholderId) {
  await api.projects.removeStakeholder(props.project.id, stakeholderId);
  await loadPeople();
}

async function changeRole(stakeholderId, role) {
  await api.projects.setStakeholderRole(props.project.id, stakeholderId, role);
  await loadPeople();
}

const newRequirementText = ref('');
async function addRequirement() {
  if (!newRequirementText.value.trim()) return;
  await store.addRequirement({ project_id: props.project.id, text: newRequirementText.value.trim() });
  newRequirementText.value = '';
}
async function toggleRequirement(r) {
  await store.toggleRequirementDone(r.id, !r.done);
}
async function removeRequirement(id) {
  await store.deleteRequirement(id);
}

const newGoalText = ref('');
const newGoalTargetDate = ref('');
async function addGoal() {
  if (!newGoalText.value.trim()) return;
  await store.addGoal({
    project_id: props.project.id,
    text: newGoalText.value.trim(),
    target_date: newGoalTargetDate.value || null,
  });
  newGoalText.value = '';
  newGoalTargetDate.value = '';
}
async function toggleGoal(g) {
  await store.toggleGoalAchieved(g.id, !g.achieved);
}
async function removeGoal(id) {
  await store.deleteGoal(id);
}
</script>

<template>
  <ModalShell :title="isEdit ? 'Edit Project' : 'New Project'" :wide="isEdit" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="save">
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
              type="button" class="text-xs text-violet-400 hover:underline"
              @click="makeLead(p.id)"
            >Make lead</button>
            <button
              v-if="p.project_role !== 'lead' && canManage"
              type="button" class="text-slate-500 hover:text-rose-400"
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
          <button type="button" class="text-sm text-violet-400 hover:underline" @click="addPerson">Add</button>
        </div>
      </div>

      <div v-if="isEdit" class="border-t border-white/10 pt-4">
        <h3 class="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Requirements</h3>
        <ul class="space-y-1 mb-2">
          <li v-for="r in liveProject?.requirements ?? []" :key="r.id" class="flex items-center gap-2 text-sm">
            <input type="checkbox" :checked="!!r.done" :disabled="!canContribute" @change="toggleRequirement(r)" />
            <span class="flex-1" :class="r.done ? 'line-through text-slate-500' : ''">{{ r.text }}</span>
            <button v-if="canContribute" type="button" class="text-slate-500 hover:text-rose-400" @click="removeRequirement(r.id)"><Trash2 class="w-3.5 h-3.5" /></button>
          </li>
          <li v-if="!liveProject?.requirements?.length" class="text-sm text-slate-500">No requirements yet.</li>
        </ul>
        <div v-if="canContribute" class="flex gap-2">
          <input v-model="newRequirementText" placeholder="New requirement…" class="flex-1 border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addRequirement" />
          <button type="button" class="text-violet-400" @click="addRequirement"><Plus class="w-4 h-4" /></button>
        </div>
      </div>

      <div v-if="isEdit" class="border-t border-white/10 pt-4">
        <h3 class="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Goals</h3>
        <ul class="space-y-1 mb-2">
          <li v-for="g in liveProject?.goals ?? []" :key="g.id" class="flex items-center gap-2 text-sm">
            <input type="checkbox" :checked="!!g.achieved" :disabled="!canContribute" @change="toggleGoal(g)" />
            <span class="flex-1" :class="g.achieved ? 'line-through text-slate-500' : ''">{{ g.text }}</span>
            <span v-if="g.target_date" class="text-xs text-slate-500 whitespace-nowrap">{{ formatDate(g.target_date) }}</span>
            <button v-if="canContribute" type="button" class="text-slate-500 hover:text-rose-400" @click="removeGoal(g.id)"><Trash2 class="w-3.5 h-3.5" /></button>
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
        <button v-if="isEdit && store.isAdmin" type="button" class="text-sm text-rose-400 hover:underline flex items-center gap-1" @click="removeProject">
          <Trash2 class="w-4 h-4" /> Delete project
        </button>
        <span v-else />
        <div class="flex gap-2">
          <button type="button" class="text-sm px-3 py-1.5 rounded-md border border-white/15" @click="emit('close')">Cancel</button>
          <button v-if="canManage" type="submit" :disabled="saving" class="text-sm px-3 py-1.5 rounded-md bg-white text-slate-950 font-semibold hover:bg-violet-50 disabled:opacity-50">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </form>
  </ModalShell>
</template>
