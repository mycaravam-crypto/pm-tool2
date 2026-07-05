<script setup>
import { Pencil, Plus, Trash2 } from 'lucide-vue-next';
import { reactive, ref } from 'vue';
import { useProjectStore } from '../stores/useProjectStore.js';
import ModalShell from './ModalShell.vue';

const emit = defineEmits(['close']);
const store = useProjectStore();

const editingId = ref(null);
const form = reactive({ name: '', email: '', role: '' });
const showNewForm = ref(false);
const error = ref('');

function startEdit(s) {
  editingId.value = s.id;
  form.name = s.name;
  form.email = s.email ?? '';
  form.role = s.role ?? '';
  showNewForm.value = false;
  error.value = '';
}

function startNew() {
  editingId.value = null;
  form.name = '';
  form.email = '';
  form.role = '';
  showNewForm.value = true;
  error.value = '';
}

function cancel() {
  editingId.value = null;
  showNewForm.value = false;
  error.value = '';
}

async function save() {
  if (!form.name) return;
  error.value = '';
  try {
    if (editingId.value) {
      await store.updateStakeholder(editingId.value, { ...form });
    } else {
      await store.createStakeholder({ ...form });
    }
    cancel();
  } catch (e) {
    error.value = e.message;
  }
}

async function remove(id) {
  if (
    !confirm(
      'Delete this stakeholder? They will be removed from all projects, events, and unassigned from any decisions/action items/pain points they owned.',
    )
  )
    return;
  try {
    await store.deleteStakeholder(id);
  } catch (e) {
    alert(e.message);
  }
}
</script>

<template>
  <ModalShell title="Stakeholder Directory" wide @close="emit('close')">
    <div class="flex items-center justify-between mb-3">
      <p class="text-sm text-slate-500">Global list of people referenced across projects.</p>
      <button
        class="flex items-center gap-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md px-3 py-1.5 hover:bg-indigo-700"
        @click="startNew"
      >
        <Plus class="w-4 h-4" /> New Stakeholder
      </button>
    </div>

    <form v-if="showNewForm || editingId" class="border border-slate-200 rounded-md p-3 mb-3 space-y-2" @submit.prevent="save">
      <div class="grid grid-cols-3 gap-2">
        <input v-model="form.name" placeholder="Name" required class="border border-slate-300 rounded px-2 py-1 text-sm" />
        <input v-model="form.email" placeholder="Email" type="email" class="border border-slate-300 rounded px-2 py-1 text-sm" />
        <input v-model="form.role" placeholder="Organizational role (e.g. Designer)" class="border border-slate-300 rounded px-2 py-1 text-sm" />
      </div>
      <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>
      <div class="flex gap-2 justify-end">
        <button type="button" class="text-xs px-2 py-1 rounded border border-slate-300" @click="cancel">Cancel</button>
        <button type="submit" class="text-xs px-2 py-1 rounded bg-indigo-600 text-white">Save</button>
      </div>
    </form>

    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
          <th class="py-1.5">Name</th>
          <th class="py-1.5">Role</th>
          <th class="py-1.5">Email</th>
          <th class="py-1.5"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in store.stakeholders" :key="s.id" class="border-b border-slate-100">
          <td class="py-1.5">{{ s.name }}</td>
          <td class="py-1.5 text-slate-500">{{ s.role || '—' }}</td>
          <td class="py-1.5 text-slate-500">{{ s.email || '—' }}</td>
          <td class="py-1.5 text-right whitespace-nowrap">
            <button class="text-slate-400 hover:text-indigo-600 mr-2" @click="startEdit(s)"><Pencil class="w-3.5 h-3.5" /></button>
            <button class="text-slate-400 hover:text-rose-600" @click="remove(s.id)"><Trash2 class="w-3.5 h-3.5" /></button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="store.stakeholders.length === 0" class="text-sm text-slate-400 py-2">No stakeholders yet.</p>
  </ModalShell>
</template>
