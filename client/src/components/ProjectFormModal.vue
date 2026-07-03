<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import { useProjectStore } from '../stores/useProjectStore.js';
import { api } from '../lib/api.js';
import ModalShell from './ModalShell.vue';

const props = defineProps({ project: { type: Object, default: null } });
const emit = defineEmits(['close']);
const store = useProjectStore();
const isEdit = computed(() => !!props.project);

const form = reactive({
  name: props.project?.name ?? '',
  description: props.project?.description ?? '',
  color_hex: props.project?.color_hex ?? '#3B82F6',
  status: props.project?.status ?? 'active',
  start_date: props.project?.start_date ?? '',
  target_end_date: props.project?.target_end_date ?? '',
  budget_planned: props.project?.budget_planned ?? '',
  budget_spent: props.project?.budget_spent ?? 0,
  lead_stakeholder_id: props.project?.lead?.id ?? ''
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

const availableToAdd = computed(() =>
  store.stakeholders.filter(s => !people.value.some(p => p.id === s.id))
);

async function save() {
  error.value = '';
  saving.value = true;
  try {
    if (isEdit.value) {
      await store.updateProject(props.project.id, {
        name: form.name, description: form.description, color_hex: form.color_hex, status: form.status,
        start_date: form.start_date || null, target_end_date: form.target_end_date || null,
        budget_planned: form.budget_planned === '' ? null : Number(form.budget_planned),
        budget_spent: Number(form.budget_spent) || 0
      });
    } else {
      if (!form.lead_stakeholder_id) { error.value = 'A project lead is required.'; saving.value = false; return; }
      await store.createProject({
        name: form.name, description: form.description, color_hex: form.color_hex,
        start_date: form.start_date || null, target_end_date: form.target_end_date || null,
        budget_planned: form.budget_planned === '' ? null : Number(form.budget_planned),
        budget_spent: Number(form.budget_spent) || 0,
        lead_stakeholder_id: Number(form.lead_stakeholder_id)
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
  if (!confirm(`Delete "${props.project.name}"? This also deletes all of its events, decisions, action items, and pain points. This cannot be undone.`)) return;
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
</script>

<template>
  <ModalShell :title="isEdit ? 'Edit Project' : 'New Project'" :wide="isEdit" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="save">
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">
          <label class="block text-xs font-medium text-slate-600 mb-1">Name</label>
          <input v-model="form.name" required class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm" />
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-medium text-slate-600 mb-1">Description (Scope)</label>
          <textarea v-model="form.description" rows="2" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Color</label>
          <input v-model="form.color_hex" type="color" class="w-full h-9 border border-slate-300 rounded-md" />
        </div>
        <div v-if="isEdit">
          <label class="block text-xs font-medium text-slate-600 mb-1">Status</label>
          <select v-model="form.status" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Start date</label>
          <input v-model="form.start_date" type="date" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Target end date</label>
          <input v-model="form.target_end_date" type="date" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Budget planned</label>
          <input v-model="form.budget_planned" type="number" step="0.01" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Budget spent</label>
          <input v-model="form.budget_spent" type="number" step="0.01" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm" />
        </div>

        <div v-if="!isEdit" class="col-span-2">
          <label class="block text-xs font-medium text-slate-600 mb-1">Lead <span class="text-rose-500">*</span></label>
          <select v-model="form.lead_stakeholder_id" required class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm">
            <option value="" disabled>Select a lead…</option>
            <option v-for="s in store.stakeholders" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <p class="text-xs text-slate-400 mt-1">Every project must have exactly one accountable lead.</p>
        </div>
      </div>

      <div v-if="isEdit" class="border-t border-slate-200 pt-4">
        <h3 class="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">People</h3>
        <ul class="space-y-1 mb-3">
          <li v-for="p in people" :key="p.id" class="flex items-center gap-2 text-sm">
            <span class="flex-1">{{ p.name }}</span>
            <select
              v-if="p.project_role !== 'lead'"
              :value="p.project_role"
              class="border border-slate-300 rounded px-1.5 py-0.5 text-xs"
              @change="changeRole(p.id, $event.target.value)"
            >
              <option value="sponsor">Sponsor</option>
              <option value="member">Member</option>
              <option value="stakeholder">Stakeholder</option>
            </select>
            <span v-else class="text-xs font-medium px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">Lead</span>
            <button
              v-if="p.project_role !== 'lead'"
              type="button" class="text-xs text-indigo-600 hover:underline"
              @click="makeLead(p.id)"
            >Make lead</button>
            <button
              v-if="p.project_role !== 'lead'"
              type="button" class="text-slate-400 hover:text-rose-600"
              @click="removePerson(p.id)"
            ><Trash2 class="w-3.5 h-3.5" /></button>
          </li>
        </ul>
        <div class="flex items-center gap-2">
          <select v-model="newPersonId" class="flex-1 border border-slate-300 rounded-md px-2 py-1 text-sm" @keydown.enter.prevent="addPerson">
            <option value="" disabled>Add stakeholder…</option>
            <option v-for="s in availableToAdd" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <select v-model="newPersonRole" class="border border-slate-300 rounded-md px-2 py-1 text-sm" @keydown.enter.prevent="addPerson">
            <option value="sponsor">Sponsor</option>
            <option value="member">Member</option>
            <option value="stakeholder">Stakeholder</option>
          </select>
          <button type="button" class="text-sm text-indigo-600 hover:underline" @click="addPerson">Add</button>
        </div>
      </div>

      <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>

      <div class="flex items-center justify-between pt-2">
        <button v-if="isEdit" type="button" class="text-sm text-rose-600 hover:underline flex items-center gap-1" @click="removeProject">
          <Trash2 class="w-4 h-4" /> Delete project
        </button>
        <span v-else />
        <div class="flex gap-2">
          <button type="button" class="text-sm px-3 py-1.5 rounded-md border border-slate-300" @click="emit('close')">Cancel</button>
          <button type="submit" :disabled="saving" class="text-sm px-3 py-1.5 rounded-md bg-indigo-600 text-white disabled:opacity-50">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </form>
  </ModalShell>
</template>
