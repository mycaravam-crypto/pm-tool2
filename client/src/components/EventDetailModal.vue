<script setup>
import { FileDown, Plus, Repeat, Trash2, X } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api } from '../lib/api.js';
import { formatDate, todayStr as getTodayStr } from '../lib/dateFormat.js';
import { EVENT_TYPE_KEYS, EVENT_TYPES, STATUS_KEYS, STATUS_LABELS, TYPE_COLORS } from '../lib/eventTypes.js';
import { generateEventProtocolPdf } from '../lib/pdfReports.js';
import { generateOccurrenceDates, MAX_OCCURRENCES, RECURRENCE_FREQUENCIES } from '../lib/recurrence.js';
import { useProjectStore } from '../stores/useProjectStore.js';
import HelpTooltip from './HelpTooltip.vue';

const props = defineProps({
  event: { type: Object, default: null },
  defaultProjectId: { type: Number, default: null },
  defaultDate: { type: String, default: null },
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
  date: props.event?.date ?? props.defaultDate ?? todayStr,
  time: props.event?.time ?? '',
  type: props.event?.type ?? 'sync',
  summary: props.event?.summary ?? '',
  status: props.event?.status ?? 'pending',
  participants: props.event?.participants?.map((p) => p.id) ?? [],
});

const isForwardType = computed(() => EVENT_TYPES[form.type].shape === 'diamond');

// Repeat is only offered at creation time — an existing series is managed
// afterwards via "save/delete entire series" below, not by re-configuring its rule.
const recurrence = reactive({ enabled: false, frequency: 'weekly', interval: 1, count: 10 });
const recurrenceEndDate = computed(() => {
  if (!recurrence.enabled || !form.date) return null;
  const dates = generateOccurrenceDates(
    form.date,
    recurrence.frequency,
    Number(recurrence.interval) || 1,
    Number(recurrence.count) || 1,
  );
  return dates[dates.length - 1];
});
const isSeriesOccurrence = computed(() => isEdit.value && !!liveEvent.value?.series_id);

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
        time: form.time || null,
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
        time: form.time || null,
        type: form.type,
        summary: form.summary,
        status: form.status,
        participants: form.participants,
        decisions: stagedDecisions.value,
        action_items: stagedActionItems.value,
        pain_points: stagedPainPoints.value,
        recurrence: recurrence.enabled
          ? { frequency: recurrence.frequency, interval: Number(recurrence.interval), count: Number(recurrence.count) }
          : undefined,
      });
    }
    emit('close');
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function saveSeries() {
  error.value = '';
  saving.value = true;
  try {
    await store.updateEventSeries(liveEvent.value.series_id, {
      title: form.title,
      time: form.time || null,
      type: form.type,
      summary: form.summary,
      participants: form.participants,
    });
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

async function removeSeries() {
  const count = liveEvent.value.series?.count ?? '?';
  if (
    !confirm(
      `Delete the entire series "${props.event.title}"? This deletes all ${count} occurrences and their decisions, action items, and pain points.`,
    )
  )
    return;
  await store.deleteEventSeries(liveEvent.value.series_id);
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
  <div class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[3px]" @click.self="emit('close')">
    <aside
      class="drawer-panel absolute bottom-2 right-2 top-2 flex w-[min(560px,calc(100vw-16px))] flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[#121620] shadow-2xl"
      role="dialog" aria-modal="true" aria-labelledby="event-drawer-title"
    >
      <div class="relative shrink-0 overflow-hidden border-b border-white/8 p-6">
        <div
          class="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-25 blur-3xl"
          :style="{ background: `radial-gradient(circle at 20% 0%, ${TYPE_COLORS[form.type]}, transparent 65%)` }"
        />
        <div class="relative flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">
              <span class="h-1.5 w-1.5 rounded-full" :style="{ backgroundColor: TYPE_COLORS[form.type] }" />
              {{ EVENT_TYPES[form.type].label }}
            </div>
            <h2 id="event-drawer-title" class="mt-3 truncate text-xl font-semibold tracking-[-.025em] text-white">{{ isEdit ? liveEvent.title : 'New Event' }}</h2>
            <div v-if="isEdit" class="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-400">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: liveEvent.project.color_hex }" />
              <span class="font-medium text-slate-300">{{ liveEvent.project.name }}</span>
              <span>·</span>
              <span>Lead: {{ store.projectById(liveEvent.project_id)?.lead?.name ?? '—' }}</span>
            </div>
          </div>
          <button
            type="button"
            class="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/8 bg-white/5 text-slate-500 transition hover:bg-white/10 hover:text-white"
            aria-label="Close" @click="emit('close')"
          ><X class="h-4 w-4" /></button>
        </div>
        <div v-if="isSeriesOccurrence" class="relative mt-4 flex w-fit items-center gap-1.5 rounded-md bg-violet-500/15 px-2.5 py-1.5 text-xs text-violet-300">
          <Repeat class="w-3.5 h-3.5" />
          Part of a recurring series — occurrence {{ liveEvent.occurrence_index + 1 }} of {{ liveEvent.series.count }} ({{ liveEvent.series.frequency }})
        </div>
      </div>

      <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="save">
      <div class="flex-1 overflow-y-auto p-6 space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div v-if="!isEdit">
          <label class="block text-xs font-medium text-slate-400 mb-1">Project</label>
          <select v-model.number="form.project_id" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm">
            <option v-for="p in store.selectedProjects" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div class="col-span-2" v-else />
        <div class="col-span-2">
          <label class="block text-xs font-medium text-slate-400 mb-1">Title</label>
          <input v-model="form.title" required :disabled="!canContribute" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm disabled:bg-white/[.03] disabled:text-slate-500" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Date</label>
          <div class="flex gap-2">
            <input v-model="form.date" type="date" required :disabled="!canContribute" class="flex-1 min-w-0 border border-white/15 rounded-md px-3 py-1.5 text-sm disabled:bg-white/[.03] disabled:text-slate-500" />
            <input v-model="form.time" type="time" :disabled="!canContribute" title="Optional time" class="w-28 border border-white/15 rounded-md px-3 py-1.5 text-sm disabled:bg-white/[.03] disabled:text-slate-500" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Type</label>
          <select v-model="form.type" :disabled="!canContribute" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm disabled:bg-white/[.03] disabled:text-slate-500">
            <option v-for="key in EVENT_TYPE_KEYS" :key="key" :value="key">{{ EVENT_TYPES[key].label }}</option>
          </select>
        </div>
        <div class="col-span-2">
          <label class="block text-xs font-medium text-slate-400 mb-1">Summary</label>
          <textarea v-model="form.summary" rows="2" :disabled="!canContribute" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm disabled:bg-white/[.03] disabled:text-slate-500" />
        </div>
        <div class="col-span-2" v-if="!isForwardType">
          <label class="block text-xs font-medium text-slate-400 mb-1">Participants</label>
          <select v-model="form.participants" multiple :disabled="!canContribute" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm h-24 disabled:bg-white/[.03] disabled:text-slate-500">
            <option v-for="p in projectPeople" :key="p.id" :value="p.id">{{ p.name }} ({{ p.project_role }})</option>
          </select>
        </div>
        <div v-else>
          <label class="flex items-center gap-1 text-xs font-medium text-slate-400 mb-1">
            Status
            <HelpTooltip :text="`Was this ${form.type} hit or missed once its date passed?`" />
          </label>
          <select v-model="form.status" :disabled="!canContribute" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm disabled:bg-white/[.03] disabled:text-slate-500">
            <option v-for="key in STATUS_KEYS" :key="key" :value="key">{{ STATUS_LABELS[key] }}</option>
          </select>
        </div>
      </div>

      <!-- Repeat: create-mode only — an existing series is managed afterwards
           via "save/delete entire series" rather than by re-editing its rule. -->
      <div v-if="!isEdit && canContribute" class="border-t border-white/10 pt-3">
        <label class="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
          <input v-model="recurrence.enabled" type="checkbox" />
          <span class="flex items-center gap-1"><Repeat class="w-3.5 h-3.5" /> Repeat</span>
        </label>
        <div v-if="recurrence.enabled" class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-xs text-slate-500 mb-1">Frequency</label>
            <select v-model="recurrence.frequency" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm">
              <option v-for="f in RECURRENCE_FREQUENCIES" :key="f.key" :value="f.key">{{ f.label }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">Every</label>
            <input v-model.number="recurrence.interval" type="number" min="1" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label class="flex items-center gap-1 text-xs text-slate-500 mb-1">
              Occurrences
              <HelpTooltip :text="`Repeating events are capped at ${MAX_OCCURRENCES} occurrences.`" />
            </label>
            <input v-model.number="recurrence.count" type="number" min="2" :max="MAX_OCCURRENCES" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm" />
          </div>
        </div>
        <p v-if="recurrence.enabled && recurrenceEndDate" class="mt-2 text-xs text-slate-500">
          Creates {{ recurrence.count }} events, ending {{ formatDate(recurrenceEndDate) }}.
        </p>
      </div>

      <!-- Decisions -->
      <div class="border-t border-white/10 pt-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Decisions</h3>
        <ul class="space-y-1 mb-2">
          <li v-for="(d, idx) in (isEdit ? liveEvent.decisions : stagedDecisions)" :key="d.id ?? idx" class="flex items-center gap-2 text-sm">
            <span class="flex-1">{{ d.text }}</span>
            <span class="text-xs text-slate-500">{{ d.decided_by_name || (d.decided_by && projectPeople.find(p => p.id === d.decided_by)?.name) || 'unassigned' }}</span>
            <button v-if="canContribute" type="button" class="text-slate-500 hover:text-rose-400" @click="isEdit ? removeDecision(d.id) : removeStagedDecision(idx)"><Trash2 class="w-3.5 h-3.5" /></button>
          </li>
          <li v-if="(isEdit ? liveEvent.decisions.length : stagedDecisions.length) === 0" class="text-sm text-slate-500">No decisions yet.</li>
        </ul>
        <div v-if="canContribute" class="flex gap-2">
          <input v-model="newDecisionText" placeholder="New decision…" class="flex-1 border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addDecision" />
          <select v-model="newDecisionBy" class="border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addDecision">
            <option value="">Decided by…</option>
            <option v-for="p in projectPeople" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button type="button" class="text-violet-400" @click="addDecision"><Plus class="w-4 h-4" /></button>
        </div>
      </div>

      <!-- Action Items -->
      <div class="border-t border-white/10 pt-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Action Items</h3>
        <ul class="space-y-1 mb-2">
          <li v-for="(a, idx) in (isEdit ? liveEvent.action_items : stagedActionItems)" :key="a.id ?? idx" class="flex items-center gap-2 text-sm">
            <input v-if="isEdit" type="checkbox" :checked="!!a.done" :disabled="!canContribute" @change="toggleDone(a)" />
            <span class="flex-1" :class="a.done ? 'line-through text-slate-500' : ''">{{ a.text }}</span>
            <span class="text-xs text-slate-500">{{ a.assignee_name || (a.assignee_id && projectPeople.find(p => p.id === a.assignee_id)?.name) || 'unassigned' }}</span>
            <span class="text-xs" :class="isOverdue(a) ? 'text-rose-400 font-medium' : 'text-slate-500'">{{ a.due_date ? formatDate(a.due_date) : 'no due date' }}</span>
            <button v-if="canContribute" type="button" class="text-slate-500 hover:text-rose-400" @click="isEdit ? removeActionItem(a.id) : removeStagedAction(idx)"><Trash2 class="w-3.5 h-3.5" /></button>
          </li>
          <li v-if="(isEdit ? liveEvent.action_items.length : stagedActionItems.length) === 0" class="text-sm text-slate-500">No action items yet.</li>
        </ul>
        <div v-if="canContribute" class="flex gap-2">
          <input v-model="newActionText" placeholder="New action item…" class="flex-1 border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addActionItem" />
          <select v-model="newActionAssignee" class="border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addActionItem">
            <option value="">Assignee…</option>
            <option v-for="p in projectPeople" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <input v-model="newActionDue" type="date" class="border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addActionItem" />
          <button type="button" class="text-violet-400" @click="addActionItem"><Plus class="w-4 h-4" /></button>
        </div>
      </div>

      <!-- Pain Points -->
      <div class="border-t border-white/10 pt-3">
        <h3 class="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Pain Points</h3>
        <ul class="space-y-1 mb-2">
          <li v-for="(p, idx) in (isEdit ? liveEvent.pain_points : stagedPainPoints)" :key="p.id ?? idx" class="flex items-center gap-2 text-sm">
            <input v-if="isEdit" type="checkbox" :checked="!!p.resolved" :disabled="!canContribute" @change="toggleResolved(p)" />
            <span class="flex-1" :class="p.resolved ? 'line-through text-slate-500' : ''">{{ p.text }}</span>
            <span
              class="text-xs px-1.5 py-0.5 rounded"
              :class="p.kind === 'risk' ? 'bg-violet-500/20 text-violet-300' : 'bg-white/10 text-slate-400'"
            >{{ p.kind === 'risk' ? 'Risk' : 'Issue' }}</span>
            <span
              class="text-xs px-1.5 py-0.5 rounded"
              :class="{ High: 'bg-rose-500/15 text-rose-300', Medium: 'bg-amber-500/15 text-amber-300', Low: 'bg-white/10 text-slate-400' }[p.severity]"
            >{{ p.severity }}</span>
            <span class="text-xs text-slate-500">{{ p.owner_name || (p.owner_id && projectPeople.find(pp => pp.id === p.owner_id)?.name) || 'unowned' }}</span>
            <button v-if="canContribute" type="button" class="text-slate-500 hover:text-rose-400" @click="isEdit ? removePainPoint(p.id) : removeStagedPain(idx)"><Trash2 class="w-3.5 h-3.5" /></button>
          </li>
          <li v-if="(isEdit ? liveEvent.pain_points.length : stagedPainPoints.length) === 0" class="text-sm text-slate-500">No pain points yet.</li>
        </ul>
        <div v-if="canContribute" class="flex gap-2">
          <input v-model="newPainText" placeholder="New pain point…" class="flex-1 border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addPainPoint" />
          <select v-model="newPainKind" class="border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addPainPoint" title="Issue: already happened. Risk: might happen.">
            <option value="issue">Issue</option>
            <option value="risk">Risk</option>
          </select>
          <select v-model="newPainSeverity" class="border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addPainPoint">
            <option>Low</option><option>Medium</option><option>High</option>
          </select>
          <select v-model="newPainOwner" class="border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addPainPoint">
            <option value="">Owner…</option>
            <option v-for="p in projectPeople" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <button type="button" class="text-violet-400" @click="addPainPoint"><Plus class="w-4 h-4" /></button>
        </div>
      </div>

      <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>
      </div>

      <div class="flex shrink-0 items-center justify-between gap-2 border-t border-white/8 p-4">
        <div v-if="isEdit && canContribute" class="flex items-center gap-3">
          <button type="button" class="text-sm text-rose-400 hover:underline flex items-center gap-1" @click="removeEvent">
            <Trash2 class="w-4 h-4" /> {{ isSeriesOccurrence ? 'Delete this occurrence' : 'Delete event' }}
          </button>
          <button v-if="isSeriesOccurrence" type="button" class="text-sm text-rose-400 hover:underline" @click="removeSeries">
            Delete entire series
          </button>
        </div>
        <span v-else />
        <div class="flex gap-2">
          <button
            v-if="isEdit" type="button"
            class="text-sm px-3 py-1.5 rounded-md border border-white/15 flex items-center gap-1.5 hover:bg-white/[.03]"
            @click="exportProtocol"
          ><FileDown class="w-4 h-4" /> Export PDF</button>
          <button type="button" class="text-sm px-3 py-1.5 rounded-md border border-white/15" @click="emit('close')">Cancel</button>
          <button
            v-if="canContribute && isSeriesOccurrence" type="button" :disabled="saving"
            class="text-sm px-3 py-1.5 rounded-md border border-violet-400/40 text-violet-300 disabled:opacity-50"
            @click="saveSeries"
          >Save entire series</button>
          <button v-if="canContribute" type="submit" :disabled="saving" class="text-sm px-3 py-1.5 rounded-md bg-white text-slate-950 font-semibold hover:bg-violet-50 disabled:opacity-50">
            {{ saving ? 'Saving…' : (isSeriesOccurrence ? 'Save this occurrence' : 'Save') }}
          </button>
        </div>
      </div>
      </form>
    </aside>
  </div>
</template>

<style scoped>
/* Backdrop fades; the panel itself slides in from the right — split across
   two selectors because Vue's <Transition> only applies its enter/leave
   classes to this component's root node (the backdrop), so the panel's own
   motion has to be driven by a descendant-selector rule keyed off of them. */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(28px);
}
</style>
