<script setup>
import { FileDown, Plus, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api } from '../lib/api.js';
import { formatDate, todayStr as getTodayStr } from '../lib/dateFormat.js';
import { EVENT_TYPE_KEYS, EVENT_TYPES, STATUS_KEYS, STATUS_LABELS } from '../lib/eventTypes.js';
import { generateEventProtocolPdf } from '../lib/pdfReports.js';
import { useProjectStore } from '../stores/useProjectStore.js';
import ModalShell from './ModalShell.vue';

const props = defineProps({
  event: { type: Object, default: null },
  defaultProjectId: { type: Number, default: null },
});
const emit = defineEmits(['close']);
const store = useProjectStore();
const isEdit = computed(() => !!props.event);
const todayStr = getTodayStr();

// props.event is a snapshot taken when the modal opened; store.events gets replaced
// wholesale after every mutation (see useProjectStore), so nested lists must be read
// from the live store entry or the modal goes stale after the first add/toggle/delete.
const liveEvent = computed(() => {
  if (!isEdit.value) return null;
  return store.events.find((e) => e.id === props.event.id) ?? props.event;
});

const form = reactive({
  project_id: props.event?.project_id ?? props.defaultProjectId ?? store.selectedProjectIds[0] ?? null,
  title: props.event?.title ?? '',
  date: props.event?.date ?? todayStr,
  type: props.event?.type ?? 'sync',
  summary: props.event?.summary ?? '',
  status: props.event?.status ?? 'pending',
  participants: props.event?.participants?.map((p) => p.id) ?? [],
});

const isForwardType = computed(() => EVENT_TYPES[form.type].shape === 'diamond');

const projectPeople = ref([]);
async function loadPeople() {
  if (!form.project_id) {
    projectPeople.value = [];
    return;
  }
  projectPeople.value = await api.projects.stakeholders(form.project_id);
}
onMounted(loadPeople);
watch(() => form.project_id, loadPeople);

// A 'stakeholder' (the RACI "Informed" tier) can view this project's events but
// not edit them — mirrors the server-side canContribute check in
// server/utils/access.js. Admins and every other committed role can contribute.
const myRole = computed(
  () => projectPeople.value.find((p) => p.id === store.currentMember?.stakeholder_id)?.project_role ?? null,
);
const canContribute = computed(() => store.isAdmin || (myRole.value !== null && myRole.value !== 'stakeholder'));

// --- create-mode staged nested items ---
const stagedDecisions = ref([]);
const stagedActionItems = ref([]);
const stagedPainPoints = ref([]);

const newDecisionText = ref('');
const newDecisionBy = ref('');
const newActionText = ref('');
const newActionAssignee = ref('');
const newActionDue = ref('');
const newPainText = ref('');
const newPainSeverity = ref('Medium');
const newPainOwner = ref('');
const newPainKind = ref('issue');

function isOverdue(item) {
  return item.due_date && !item.done && item.due_date < todayStr;
}

async function addDecision() {
  if (!newDecisionText.value) return;
  if (isEdit.value) {
    await store.addDecision({
      event_id: props.event.id,
      text: newDecisionText.value,
      decided_by: newDecisionBy.value || null,
    });
  } else {
    stagedDecisions.value.push({ text: newDecisionText.value, decided_by: newDecisionBy.value || null });
  }
  newDecisionText.value = '';
  newDecisionBy.value = '';
}
async function addActionItem() {
  if (!newActionText.value) return;
  const payload = {
    text: newActionText.value,
    assignee_id: newActionAssignee.value || null,
    due_date: newActionDue.value || null,
  };
  if (isEdit.value) {
    await store.addActionItem({ event_id: props.event.id, ...payload });
  } else {
    stagedActionItems.value.push(payload);
  }
  newActionText.value = '';
  newActionAssignee.value = '';
  newActionDue.value = '';
}
async function addPainPoint() {
  if (!newPainText.value) return;
  const payload = {
    text: newPainText.value,
    severity: newPainSeverity.value,
    owner_id: newPainOwner.value || null,
    kind: newPainKind.value,
  };
  if (isEdit.value) {
    await store.addPainPoint({ event_id: props.event.id, ...payload });
  } else {
    stagedPainPoints.value.push(payload);
  }
  newPainText.value = '';
  newPainSeverity.value = 'Medium';
  newPainOwner.value = '';
  newPainKind.value = 'issue';
}

const saving = ref(false);
const error = ref('');

async function save() {
  error.value = '';
  if (!form.project_id) {
    error.value = 'Choose a project.';
    return;
  }
  saving.value = true;
  try {
    if (isEdit.value) {
      await store.updateEvent(props.event.id, {
        title: form.title,
        date: form.date,
        type: form.type,
        summary: form.summary,
        status: form.status,
        participants: form.participants,
      });
    } else {
      await store.createEvent({
        project_id: form.project_id,
        title: form.title,
        date: form.date,
        type: form.type,
        summary: form.summary,
        status: form.status,
        participants: form.participants,
        decisions: stagedDecisions.value,
        action_items: stagedActionItems.value,
        pain_points: stagedPainPoints.value,
      });
    }
    emit('close');
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

function exportProtocol() {
  generateEventProtocolPdf(liveEvent.value);
}

async function removeEvent() {
  if (!confirm(`Delete "${props.event.title}"? This also deletes its decisions, action items, and pain points.`))
    return;
  await store.deleteEvent(props.event.id);
  emit('close');
}

async function toggleDone(item) {
  await store.toggleActionItemDone(item.id, !item.done);
}
async function toggleResolved(pp) {
  await store.togglePainPointResolved(pp.id, !pp.resolved);
}
async function removeDecision(id) {
  await store.deleteDecision(id);
}
async function removeActionItem(id) {
  await store.deleteActionItem(id);
}
async function removePainPoint(id) {
  await store.deletePainPoint(id);
}
function removeStagedDecision(idx) {
  stagedDecisions.value.splice(idx, 1);
}
function removeStagedAction(idx) {
  stagedActionItems.value.splice(idx, 1);
}
function removeStagedPain(idx) {
  stagedPainPoints.value.splice(idx, 1);
}
</script>

<template>
  <ModalShell :title="isEdit ? liveEvent.title : 'New Event'" wide @close="emit('close')">
    <div v-if="isEdit" class="flex items-center gap-2 mb-4 text-sm">
      <span class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: liveEvent.project.color_hex }" />
      <span class="font-medium">{{ liveEvent.project.name }}</span>
      <span class="text-slate-400">·</span>
      <span class="text-slate-500">Lead: {{ store.projectById(liveEvent.project_id)?.lead?.name ?? '—' }}</span>
    </div>

    <form class="space-y-4" @submit.prevent="save">
      <div class="grid grid-cols-2 gap-4">
        <div v-if="!isEdit">
          <label class="block text-xs font-medium text-slate-600 mb-1">Project</label>
          <select v-model.number="form.project_id" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm">
            <option v-for="p in store.selectedProjects" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div class="col-span-2" v-else />
        <div class="col-span-2">
          <label class="block text-xs font-medium text-slate-600 mb-1">Title</label>
          <input v-model="form.title" required :disabled="!canContribute" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Date</label>
          <input v-model="form.date" type="date" required :disabled="!canContribute" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Type</label>
          <select v-model="form.type" :disabled="!canContribute" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400">
            <option v-for="key in EVENT_TYPE_KEYS" :key="key" :value="key">{{ EVENT_TYPES[key].label }}</option>
          </select>
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-medium text-slate-600 mb-1">Summary</label>
          <textarea v-model="form.summary" rows="2" :disabled="!canContribute" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400" />
        </div>
        <div class="col-span-2" v-if="!isForwardType">
          <label class="block text-xs font-medium text-slate-600 mb-1">Participants</label>
          <select v-model="form.participants" multiple :disabled="!canContribute" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm h-24 disabled:bg-slate-50 disabled:text-slate-400">
            <option v-for="p in projectPeople" :key="p.id" :value="p.id">{{ p.name }} ({{ p.project_role }})</option>
          </select>
        </div>
        <div v-else>
          <label class="block text-xs font-medium text-slate-600 mb-1">Status</label>
          <select v-model="form.status" :disabled="!canContribute" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400">
            <option v-for="key in STATUS_KEYS" :key="key" :value="key">{{ STATUS_LABELS[key] }}</option>
          </select>
          <p class="text-xs text-slate-400 mt-1">Was this {{ form.type }} hit or missed once its date passed?</p>
        </div>
      </div>

      <!-- Decisions -->
      <div class="border-t border-slate-200 pt-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Decisions</h3>
        <ul class="space-y-1 mb-2">
          <li v-for="(d, idx) in (isEdit ? liveEvent.decisions : stagedDecisions)" :key="d.id ?? idx" class="flex items-center gap-2 text-sm">
            <span class="flex-1">{{ d.text }}</span>
            <span class="text-xs text-slate-400">{{ d.decided_by_name || (d.decided_by && projectPeople.find(p => p.id === d.decided_by)?.name) || 'unassigned' }}</span>
            <button v-if="canContribute" type="button" class="text-slate-400 hover:text-rose-600" @click="isEdit ? removeDecision(d.id) : removeStagedDecision(idx)"><Trash2 class="w-3.5 h-3.5" /></button>
          </li>
          <li v-if="(isEdit ? liveEvent.decisions.length : stagedDecisions.length) === 0" class="text-sm text-slate-400">No decisions yet.</li>
        </ul>
        <div v-if="canContribute" class="flex gap-2">
          <input v-model="newDecisionText" placeholder="New decision…" class="flex-1 border border-slate-300 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addDecision" />
          <select v-model="newDecisionBy" class="border border-slate-300 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addDecision">
            <option value="">Decided by…</option>
            <option v-for="p in projectPeople" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button type="button" class="text-indigo-600" @click="addDecision"><Plus class="w-4 h-4" /></button>
        </div>
      </div>

      <!-- Action Items -->
      <div class="border-t border-slate-200 pt-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Action Items</h3>
        <ul class="space-y-1 mb-2">
          <li v-for="(a, idx) in (isEdit ? liveEvent.action_items : stagedActionItems)" :key="a.id ?? idx" class="flex items-center gap-2 text-sm">
            <input v-if="isEdit" type="checkbox" :checked="!!a.done" :disabled="!canContribute" @change="toggleDone(a)" />
            <span class="flex-1" :class="a.done ? 'line-through text-slate-400' : ''">{{ a.text }}</span>
            <span class="text-xs text-slate-400">{{ a.assignee_name || (a.assignee_id && projectPeople.find(p => p.id === a.assignee_id)?.name) || 'unassigned' }}</span>
            <span class="text-xs" :class="isOverdue(a) ? 'text-rose-600 font-medium' : 'text-slate-400'">{{ a.due_date ? formatDate(a.due_date) : 'no due date' }}</span>
            <button v-if="canContribute" type="button" class="text-slate-400 hover:text-rose-600" @click="isEdit ? removeActionItem(a.id) : removeStagedAction(idx)"><Trash2 class="w-3.5 h-3.5" /></button>
          </li>
          <li v-if="(isEdit ? liveEvent.action_items.length : stagedActionItems.length) === 0" class="text-sm text-slate-400">No action items yet.</li>
        </ul>
        <div v-if="canContribute" class="flex gap-2">
          <input v-model="newActionText" placeholder="New action item…" class="flex-1 border border-slate-300 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addActionItem" />
          <select v-model="newActionAssignee" class="border border-slate-300 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addActionItem">
            <option value="">Assignee…</option>
            <option v-for="p in projectPeople" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <input v-model="newActionDue" type="date" class="border border-slate-300 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addActionItem" />
          <button type="button" class="text-indigo-600" @click="addActionItem"><Plus class="w-4 h-4" /></button>
        </div>
      </div>

      <!-- Pain Points -->
      <div class="border-t border-slate-200 pt-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Pain Points</h3>
        <ul class="space-y-1 mb-2">
          <li v-for="(p, idx) in (isEdit ? liveEvent.pain_points : stagedPainPoints)" :key="p.id ?? idx" class="flex items-center gap-2 text-sm">
            <input v-if="isEdit" type="checkbox" :checked="!!p.resolved" :disabled="!canContribute" @change="toggleResolved(p)" />
            <span class="flex-1" :class="p.resolved ? 'line-through text-slate-400' : ''">{{ p.text }}</span>
            <span
              class="text-xs px-1.5 py-0.5 rounded"
              :class="p.kind === 'risk' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'"
            >{{ p.kind === 'risk' ? 'Risk' : 'Issue' }}</span>
            <span
              class="text-xs px-1.5 py-0.5 rounded"
              :class="{ High: 'bg-rose-100 text-rose-700', Medium: 'bg-amber-100 text-amber-700', Low: 'bg-slate-100 text-slate-600' }[p.severity]"
            >{{ p.severity }}</span>
            <span class="text-xs text-slate-400">{{ p.owner_name || (p.owner_id && projectPeople.find(pp => pp.id === p.owner_id)?.name) || 'unowned' }}</span>
            <button v-if="canContribute" type="button" class="text-slate-400 hover:text-rose-600" @click="isEdit ? removePainPoint(p.id) : removeStagedPain(idx)"><Trash2 class="w-3.5 h-3.5" /></button>
          </li>
          <li v-if="(isEdit ? liveEvent.pain_points.length : stagedPainPoints.length) === 0" class="text-sm text-slate-400">No pain points yet.</li>
        </ul>
        <div v-if="canContribute" class="flex gap-2">
          <input v-model="newPainText" placeholder="New pain point…" class="flex-1 border border-slate-300 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addPainPoint" />
          <select v-model="newPainKind" class="border border-slate-300 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addPainPoint" title="Issue: already happened. Risk: might happen.">
            <option value="issue">Issue</option>
            <option value="risk">Risk</option>
          </select>
          <select v-model="newPainSeverity" class="border border-slate-300 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addPainPoint">
            <option>Low</option><option>Medium</option><option>High</option>
          </select>
          <select v-model="newPainOwner" class="border border-slate-300 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addPainPoint">
            <option value="">Owner…</option>
            <option v-for="p in projectPeople" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button type="button" class="text-indigo-600" @click="addPainPoint"><Plus class="w-4 h-4" /></button>
        </div>
      </div>

      <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>

      <div class="flex items-center justify-between pt-2 border-t border-slate-200">
        <button v-if="isEdit && canContribute" type="button" class="text-sm text-rose-600 hover:underline flex items-center gap-1" @click="removeEvent">
          <Trash2 class="w-4 h-4" /> Delete event
        </button>
        <span v-else />
        <div class="flex gap-2">
          <button
            v-if="isEdit" type="button"
            class="text-sm px-3 py-1.5 rounded-md border border-slate-300 flex items-center gap-1.5 hover:bg-slate-50"
            @click="exportProtocol"
          ><FileDown class="w-4 h-4" /> Export PDF</button>
          <button type="button" class="text-sm px-3 py-1.5 rounded-md border border-slate-300" @click="emit('close')">Cancel</button>
          <button v-if="canContribute" type="submit" :disabled="saving" class="text-sm px-3 py-1.5 rounded-md bg-indigo-600 text-white disabled:opacity-50">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </form>
  </ModalShell>
</template>
