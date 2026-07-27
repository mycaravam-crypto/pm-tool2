<script setup>
import { Check, Pencil, Plus, Trash2, X } from 'lucide-vue-next';
import { reactive, ref } from 'vue';
import HelpTooltip from '@/components/HelpTooltip.vue';
import ModalShell from '@/components/ModalShell.vue';
import { useAsyncAction } from '@/composables/useAsyncAction.js';
import { api } from '@/lib/api.js';
import { TABLE_BODY_ROW, TABLE_HEADER_ROW } from '@/lib/tableStyles.js';
import { useProjectStore } from '@/stores/useProjectStore.js';

const emit = defineEmits(['close']);
const store = useProjectStore();

const editingId = ref(null);
const showForm = ref(false);
const form = reactive({
  name: '',
  email: '',
  stakeholder_id: '',
  password: '',
  role: 'member',
  notify_assigned: true,
  notify_overdue_action_items: true,
  notify_upcoming_deadlines: true,
  notify_status_report: true,
});
const error = ref('');
const runAction = useAsyncAction(error);
const subscribedProjects = ref([]);

async function loadSubscriptions(memberId) {
  subscribedProjects.value = await api.members.projects(memberId);
}

function startNew() {
  editingId.value = null;
  showForm.value = true;
  error.value = '';
  form.name = '';
  form.email = '';
  form.stakeholder_id = '';
  form.password = '';
  form.role = 'member';
  form.notify_assigned = true;
  form.notify_overdue_action_items = true;
  form.notify_upcoming_deadlines = true;
  form.notify_status_report = true;
  subscribedProjects.value = [];
}

async function startEdit(m) {
  editingId.value = m.id;
  showForm.value = true;
  error.value = '';
  form.name = m.name;
  form.email = m.email;
  form.stakeholder_id = m.stakeholder_id ?? '';
  form.password = '';
  form.role = m.role;
  form.notify_assigned = !!m.notify_assigned;
  form.notify_overdue_action_items = !!m.notify_overdue_action_items;
  form.notify_upcoming_deadlines = !!m.notify_upcoming_deadlines;
  form.notify_status_report = !!m.notify_status_report;
  await loadSubscriptions(m.id);
}

function cancel() {
  editingId.value = null;
  showForm.value = false;
  error.value = '';
}

async function save() {
  if (!form.name || !form.email) return;
  const payload = {
    name: form.name,
    email: form.email,
    stakeholder_id: form.stakeholder_id || null,
    password: form.password,
    role: form.role,
    notify_assigned: form.notify_assigned,
    notify_overdue_action_items: form.notify_overdue_action_items,
    notify_upcoming_deadlines: form.notify_upcoming_deadlines,
    notify_status_report: form.notify_status_report,
  };
  await runAction(async () => {
    if (editingId.value) {
      await store.updateMember(editingId.value, payload);
    } else {
      await store.createMember(payload);
      // Stay open in edit mode so project subscriptions can be added right away —
      // subscriptions need an existing member id, which we only just got.
      const created = store.members.find((m) => m.email === form.email);
      if (created) await startEdit(created);
      return;
    }
    cancel();
  });
}

async function remove(id) {
  if (!confirm('Delete this member? Their notification history and project subscriptions will be removed.')) return;
  await runAction(async () => {
    await store.deleteMember(id);
    if (editingId.value === id) cancel();
  });
}

const isSubscribed = (projectId) => subscribedProjects.value.some((p) => p.id === projectId);

async function toggleSubscription(project) {
  await runAction(async () => {
    if (isSubscribed(project.id)) {
      await store.unsubscribeMemberFromProject(editingId.value, project.id);
    } else {
      await store.subscribeMemberToProject(editingId.value, project.id);
    }
    await loadSubscriptions(editingId.value);
  });
}
</script>

<template>
  <ModalShell title="Members &amp; Notifications" wide @close="emit('close')">
    <div class="members-modal">
    <p class="flex items-center gap-1 text-sm text-slate-500 mb-3">
      People who receive email notifications.
      <HelpTooltip text="Separate from the Stakeholder directory — a member can (optionally) link to their Stakeholder identity to get 'assigned to you' alerts, and subscribes to projects independently to get overdue/deadline digests and a weekly status report. Sending is stubbed for now — see the Notifications log." />
    </p>

    <p v-if="error && !showForm" class="text-sm text-rose-600 mb-3">{{ error }}</p>

    <div class="flex justify-end mb-3">
      <button
        class="grid h-9 w-9 place-items-center rounded-md bg-white text-slate-950 hover:bg-violet-50"
        title="New Member" @click="startNew"
      >
        <Plus class="w-4 h-4" />
      </button>
    </div>

    <form v-if="showForm" class="border border-white/10 rounded-md p-3 mb-4 space-y-3" @submit.prevent="save">
      <div class="grid grid-cols-2 gap-2">
        <input v-model="form.name" placeholder="Name" required class="border border-white/15 rounded px-2 py-1 text-sm" />
        <input v-model="form.email" placeholder="Email" type="email" required class="border border-white/15 rounded px-2 py-1 text-sm" />
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-400 mb-1">Linked stakeholder (optional — needed for "assigned to you" alerts)</label>
        <select v-model="form.stakeholder_id" class="w-full border border-white/15 rounded px-2 py-1 text-sm">
          <option value="">Not linked</option>
          <option v-for="s in store.stakeholders" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
      <div>
        <label class="flex items-center gap-1 text-xs font-medium text-slate-400 mb-1">
          Role
          <HelpTooltip text="Admins have unrestricted access to every project plus the Stakeholder Directory and Members management. There must always be at least one admin." />
        </label>
        <select v-model="form.role" class="w-full border border-white/15 rounded px-2 py-1 text-sm">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-400 mb-1">
          {{ editingId ? 'Set/change password (leave blank to keep unchanged)' : 'Password (leave blank — notification-only, can\'t log in)' }}
        </label>
        <input v-model="form.password" type="password" minlength="6" placeholder="At least 6 characters" class="w-full border border-white/15 rounded px-2 py-1 text-sm" />
      </div>
      <div class="flex flex-wrap gap-4 text-sm">
        <label class="flex items-center gap-1.5"><input type="checkbox" v-model="form.notify_assigned" /> Assigned to you</label>
        <label class="flex items-center gap-1.5"><input type="checkbox" v-model="form.notify_overdue_action_items" /> Overdue action items</label>
        <label class="flex items-center gap-1.5"><input type="checkbox" v-model="form.notify_upcoming_deadlines" /> Upcoming deadlines</label>
        <label class="flex items-center gap-1.5"><input type="checkbox" v-model="form.notify_status_report" /> Weekly status report</label>
      </div>

      <div v-if="editingId">
        <label class="block text-xs font-medium text-slate-400 mb-1">Subscribed projects (digest scope)</label>
        <div class="flex flex-wrap gap-3">
          <label v-for="p in store.projects" :key="p.id" class="flex items-center gap-1.5 text-sm">
            <input type="checkbox" :checked="isSubscribed(p.id)" @change="toggleSubscription(p)" />
            <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: p.color_hex }" />{{ p.name }}
          </label>
        </div>
      </div>
      <p v-else class="text-xs text-slate-500">Save the member first to add project subscriptions.</p>

      <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>

      <div class="flex gap-2 justify-end">
        <button type="button" title="Close" class="grid h-7 w-7 place-items-center rounded border border-white/15 text-slate-300" @click="cancel"><X class="w-3.5 h-3.5" /></button>
        <button type="submit" title="Save" class="grid h-7 w-7 place-items-center rounded bg-white text-slate-950 hover:bg-violet-50"><Check class="w-3.5 h-3.5" /></button>
      </div>
    </form>

    <table class="w-full text-sm">
      <thead>
        <tr :class="TABLE_HEADER_ROW">
          <th class="py-1.5">Name</th>
          <th class="py-1.5">Email</th>
          <th class="py-1.5">Linked stakeholder</th>
          <th class="py-1.5">Role</th>
          <th class="py-1.5">Login</th>
          <th class="py-1.5"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in store.members" :key="m.id" :class="TABLE_BODY_ROW">
          <td class="py-1.5">{{ m.name }}</td>
          <td class="py-1.5 text-slate-500">{{ m.email }}</td>
          <td class="py-1.5 text-slate-500">{{ m.stakeholder_name || '—' }}</td>
          <td class="py-1.5">
            <span
              class="text-xs px-1.5 py-0.5 rounded"
              :class="m.role === 'admin' ? 'bg-violet-500/15 text-violet-300' : 'bg-white/10 text-slate-500'"
            >{{ m.role === 'admin' ? 'Admin' : 'Member' }}</span>
          </td>
          <td class="py-1.5">
            <span
              class="text-xs px-1.5 py-0.5 rounded"
              :class="m.has_password ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-slate-500'"
            >{{ m.has_password ? 'Enabled' : 'Notification-only' }}</span>
          </td>
          <td class="py-1.5 text-right whitespace-nowrap">
            <button class="text-slate-500 hover:text-violet-400 mr-2" @click="startEdit(m)"><Pencil class="w-3.5 h-3.5" /></button>
            <button class="text-slate-500 hover:text-rose-400" @click="remove(m.id)"><Trash2 class="w-3.5 h-3.5" /></button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="store.members.length === 0" class="text-sm text-slate-500 py-2">No members yet.</p>
    </div>
  </ModalShell>
</template>
