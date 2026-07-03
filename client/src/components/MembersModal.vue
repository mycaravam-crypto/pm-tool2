<script setup>
import { ref, reactive } from 'vue';
import { Trash2, Pencil, Plus } from 'lucide-vue-next';
import { useProjectStore } from '../stores/useProjectStore.js';
import { api } from '../lib/api.js';
import ModalShell from './ModalShell.vue';

const emit = defineEmits(['close']);
const store = useProjectStore();

const editingId = ref(null);
const showForm = ref(false);
const form = reactive({
  name: '', email: '', stakeholder_id: '', password: '',
  notify_assigned: true, notify_overdue_action_items: true, notify_upcoming_deadlines: true
});
const error = ref('');
const subscribedProjects = ref([]);

async function loadSubscriptions(memberId) {
  subscribedProjects.value = await api.members.projects(memberId);
}

function startNew() {
  editingId.value = null;
  showForm.value = true;
  error.value = '';
  form.name = ''; form.email = ''; form.stakeholder_id = ''; form.password = '';
  form.notify_assigned = true; form.notify_overdue_action_items = true; form.notify_upcoming_deadlines = true;
  subscribedProjects.value = [];
}

async function startEdit(m) {
  editingId.value = m.id;
  showForm.value = true;
  error.value = '';
  form.name = m.name; form.email = m.email; form.stakeholder_id = m.stakeholder_id ?? ''; form.password = '';
  form.notify_assigned = !!m.notify_assigned;
  form.notify_overdue_action_items = !!m.notify_overdue_action_items;
  form.notify_upcoming_deadlines = !!m.notify_upcoming_deadlines;
  await loadSubscriptions(m.id);
}

function cancel() {
  editingId.value = null;
  showForm.value = false;
  error.value = '';
}

async function save() {
  if (!form.name || !form.email) return;
  error.value = '';
  const payload = {
    name: form.name, email: form.email, stakeholder_id: form.stakeholder_id || null, password: form.password,
    notify_assigned: form.notify_assigned, notify_overdue_action_items: form.notify_overdue_action_items,
    notify_upcoming_deadlines: form.notify_upcoming_deadlines
  };
  try {
    if (editingId.value) {
      await store.updateMember(editingId.value, payload);
    } else {
      await store.createMember(payload);
      // Stay open in edit mode so project subscriptions can be added right away —
      // subscriptions need an existing member id, which we only just got.
      const created = store.members.find(m => m.email === form.email);
      if (created) await startEdit(created);
      return;
    }
    cancel();
  } catch (e) {
    error.value = e.message;
  }
}

async function remove(id) {
  if (!confirm('Delete this member? Their notification history and project subscriptions will be removed.')) return;
  await store.deleteMember(id);
  if (editingId.value === id) cancel();
}

const isSubscribed = (projectId) => subscribedProjects.value.some(p => p.id === projectId);

async function toggleSubscription(project) {
  if (isSubscribed(project.id)) {
    await store.unsubscribeMemberFromProject(editingId.value, project.id);
  } else {
    await store.subscribeMemberToProject(editingId.value, project.id);
  }
  await loadSubscriptions(editingId.value);
}
</script>

<template>
  <ModalShell title="Members &amp; Notifications" wide @close="emit('close')">
    <p class="text-sm text-slate-500 mb-3">
      People who receive email notifications. Separate from the Stakeholder directory — a member can
      (optionally) link to their Stakeholder identity to get "assigned to you" alerts, and subscribes to
      projects independently to get overdue/deadline digests. Sending is stubbed for now — see the
      Notifications log.
    </p>

    <div class="flex justify-end mb-3">
      <button
        class="flex items-center gap-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md px-3 py-1.5 hover:bg-indigo-700"
        @click="startNew"
      >
        <Plus class="w-4 h-4" /> New Member
      </button>
    </div>

    <form v-if="showForm" class="border border-slate-200 rounded-md p-3 mb-4 space-y-3" @submit.prevent="save">
      <div class="grid grid-cols-2 gap-2">
        <input v-model="form.name" placeholder="Name" required class="border border-slate-300 rounded px-2 py-1 text-sm" />
        <input v-model="form.email" placeholder="Email" type="email" required class="border border-slate-300 rounded px-2 py-1 text-sm" />
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">Linked stakeholder (optional — needed for "assigned to you" alerts)</label>
        <select v-model="form.stakeholder_id" class="w-full border border-slate-300 rounded px-2 py-1 text-sm">
          <option value="">Not linked</option>
          <option v-for="s in store.stakeholders" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">
          {{ editingId ? 'Set/change password (leave blank to keep unchanged)' : 'Password (leave blank — notification-only, can\'t log in)' }}
        </label>
        <input v-model="form.password" type="password" minlength="6" placeholder="At least 6 characters" class="w-full border border-slate-300 rounded px-2 py-1 text-sm" />
      </div>
      <div class="flex flex-wrap gap-4 text-sm">
        <label class="flex items-center gap-1.5"><input type="checkbox" v-model="form.notify_assigned" /> Assigned to you</label>
        <label class="flex items-center gap-1.5"><input type="checkbox" v-model="form.notify_overdue_action_items" /> Overdue action items</label>
        <label class="flex items-center gap-1.5"><input type="checkbox" v-model="form.notify_upcoming_deadlines" /> Upcoming deadlines</label>
      </div>

      <div v-if="editingId">
        <label class="block text-xs font-medium text-slate-600 mb-1">Subscribed projects (digest scope)</label>
        <div class="flex flex-wrap gap-3">
          <label v-for="p in store.projects" :key="p.id" class="flex items-center gap-1.5 text-sm">
            <input type="checkbox" :checked="isSubscribed(p.id)" @change="toggleSubscription(p)" />
            <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: p.color_hex }" />{{ p.name }}
          </label>
        </div>
      </div>
      <p v-else class="text-xs text-slate-400">Save the member first to add project subscriptions.</p>

      <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>

      <div class="flex gap-2 justify-end">
        <button type="button" class="text-xs px-2 py-1 rounded border border-slate-300" @click="cancel">Close</button>
        <button type="submit" class="text-xs px-2 py-1 rounded bg-indigo-600 text-white">Save</button>
      </div>
    </form>

    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
          <th class="py-1.5">Name</th>
          <th class="py-1.5">Email</th>
          <th class="py-1.5">Linked stakeholder</th>
          <th class="py-1.5">Login</th>
          <th class="py-1.5"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in store.members" :key="m.id" class="border-b border-slate-100">
          <td class="py-1.5">{{ m.name }}</td>
          <td class="py-1.5 text-slate-500">{{ m.email }}</td>
          <td class="py-1.5 text-slate-500">{{ m.stakeholder_name || '—' }}</td>
          <td class="py-1.5">
            <span
              class="text-xs px-1.5 py-0.5 rounded"
              :class="m.has_password ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'"
            >{{ m.has_password ? 'Enabled' : 'Notification-only' }}</span>
          </td>
          <td class="py-1.5 text-right whitespace-nowrap">
            <button class="text-slate-400 hover:text-indigo-600 mr-2" @click="startEdit(m)"><Pencil class="w-3.5 h-3.5" /></button>
            <button class="text-slate-400 hover:text-rose-600" @click="remove(m.id)"><Trash2 class="w-3.5 h-3.5" /></button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="store.members.length === 0" class="text-sm text-slate-400 py-2">No members yet.</p>
  </ModalShell>
</template>
