<script setup>
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';
import { formatDate } from '../lib/dateFormat.js';
import { useProjectStore } from '../stores/useProjectStore.js';
import HelpTooltip from './HelpTooltip.vue';
import ModalShell from './ModalShell.vue';

const emit = defineEmits(['close']);
const store = useProjectStore();

const STEPS = ['Basics', 'Lead', 'Timeline', 'Budget', 'Team', 'Goals', 'Requirements', 'Review'];
const step = ref(0);

const form = reactive({
  name: '',
  description: '',
  color_hex: '#3B82F6',
  lead_stakeholder_id: '',
  start_date: '',
  target_end_date: '',
  budget_planned: '',
  budget_spent: 0,
});

// Draft team/goals/requirements only exist client-side until "Create Project" —
// nothing here is persisted until the final step, so the whole wizard can be
// abandoned with @close and no partial project is left behind.
const team = ref([]);
const newTeamStakeholderId = ref('');
const newTeamRole = ref('member');

// Each goal carries a locally-unique `key` (not a real id yet) so a requirement
// draft can reference "the 2nd goal I just added" and survive goals being
// reordered or deleted before submission — an array index would silently point
// at the wrong goal once the list changes.
let goalKeySeq = 0;
const goals = ref([]);
const newGoalText = ref('');
const newGoalTargetDate = ref('');

const requirements = ref([]);
const newRequirementText = ref('');
const newRequirementGoalKey = ref('');

const saving = ref(false);
const error = ref('');

const leadStakeholder = computed(() => store.stakeholderById(Number(form.lead_stakeholder_id)) ?? null);
const availableTeamCandidates = computed(() =>
  store.stakeholders.filter(
    (s) => s.id !== Number(form.lead_stakeholder_id) && !team.value.some((t) => t.stakeholder_id === s.id),
  ),
);

const canProceed = computed(() => {
  if (STEPS[step.value] === 'Basics') return form.name.trim().length > 0;
  if (STEPS[step.value] === 'Lead') return !!form.lead_stakeholder_id;
  return true;
});

function goTo(index) {
  step.value = index;
}
function next() {
  if (!canProceed.value || step.value >= STEPS.length - 1) return;
  step.value += 1;
}
function back() {
  if (step.value === 0) return;
  step.value -= 1;
}

function addTeamMember() {
  if (!newTeamStakeholderId.value) return;
  team.value.push({ stakeholder_id: Number(newTeamStakeholderId.value), project_role: newTeamRole.value });
  newTeamStakeholderId.value = '';
  newTeamRole.value = 'member';
}
function removeTeamMember(stakeholderId) {
  team.value = team.value.filter((t) => t.stakeholder_id !== stakeholderId);
}
function stakeholderName(id) {
  return store.stakeholderById(id)?.name ?? 'Unknown';
}

function addGoal() {
  if (!newGoalText.value.trim()) return;
  goals.value.push({ key: ++goalKeySeq, text: newGoalText.value.trim(), target_date: newGoalTargetDate.value || null });
  newGoalText.value = '';
  newGoalTargetDate.value = '';
}
function removeGoal(key) {
  goals.value = goals.value.filter((g) => g.key !== key);
  requirements.value = requirements.value.map((r) => (r.goalKey === key ? { ...r, goalKey: '' } : r));
}

function addRequirement() {
  if (!newRequirementText.value.trim()) return;
  requirements.value.push({ text: newRequirementText.value.trim(), goalKey: newRequirementGoalKey.value || '' });
  newRequirementText.value = '';
  newRequirementGoalKey.value = '';
}
function removeRequirement(index) {
  requirements.value.splice(index, 1);
}
function goalText(key) {
  return goals.value.find((g) => g.key === key)?.text ?? null;
}

async function createProject() {
  error.value = '';
  saving.value = true;
  try {
    await store.initializeProject({
      name: form.name.trim(),
      description: form.description,
      color_hex: form.color_hex,
      start_date: form.start_date || null,
      target_end_date: form.target_end_date || null,
      budget_planned: form.budget_planned === '' ? null : Number(form.budget_planned),
      budget_spent: Number(form.budget_spent) || 0,
      lead_stakeholder_id: Number(form.lead_stakeholder_id),
      team: team.value.map((t) => ({ stakeholder_id: t.stakeholder_id, project_role: t.project_role })),
      goals: goals.value.map((g) => ({ text: g.text, target_date: g.target_date })),
      requirements: requirements.value.map((r) => ({
        text: r.text,
        goalIndex: r.goalKey === '' ? null : goals.value.findIndex((g) => g.key === r.goalKey),
      })),
    });
    emit('close');
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ModalShell title="Initialize Project" wide @close="emit('close')">
    <div class="space-y-5">
      <!-- Step indicator -->
      <ol class="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
        <li v-for="(label, i) in STEPS" :key="label" class="flex items-center">
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition"
            :class="
              i === step
                ? 'bg-white text-slate-950'
                : i < step
                  ? 'text-violet-300 hover:bg-white/8'
                  : 'text-slate-500 hover:bg-white/8'
            "
            @click="i <= step ? goTo(i) : null"
          >
            <Check v-if="i < step" class="w-3 h-3" />
            <span v-else>{{ i + 1 }}</span>
            {{ label }}
          </button>
          <span v-if="i < STEPS.length - 1" class="mx-0.5 text-slate-700">/</span>
        </li>
      </ol>

      <!-- Basics -->
      <div v-if="STEPS[step] === 'Basics'" class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Project name <span class="text-rose-400">*</span></label>
          <input
            v-model="form.name" required autofocus placeholder="e.g. Q3 Platform Migration"
            class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Description (Scope)</label>
          <textarea
            v-model="form.description" rows="3" placeholder="What is this project about?"
            class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Color</label>
          <input v-model="form.color_hex" type="color" class="h-9 w-24 border border-white/15 rounded-md" />
        </div>
      </div>

      <!-- Lead -->
      <div v-else-if="STEPS[step] === 'Lead'" class="space-y-4">
        <div>
          <label class="flex items-center gap-1 text-xs font-medium text-slate-400 mb-1">
            Lead stakeholder <span class="text-rose-400">*</span>
            <HelpTooltip text="Every project must have exactly one accountable lead — the person responsible for schedule, budget, and quality outcomes." />
          </label>
          <select v-model="form.lead_stakeholder_id" required class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm">
            <option value="" disabled>Select a lead…</option>
            <option v-for="s in store.stakeholders" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <p v-if="!store.stakeholders.length" class="text-xs text-slate-500">
          No stakeholders yet — add one via the Stakeholder Directory first.
        </p>
      </div>

      <!-- Timeline -->
      <div v-else-if="STEPS[step] === 'Timeline'" class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Start date</label>
          <input v-model="form.start_date" type="date" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Target end date</label>
          <input v-model="form.target_end_date" type="date" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm" />
        </div>
        <p class="col-span-2 text-xs text-slate-500">Both are optional and can be adjusted later.</p>
      </div>

      <!-- Budget -->
      <div v-else-if="STEPS[step] === 'Budget'" class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Budget planned</label>
          <input v-model="form.budget_planned" type="number" step="0.01" placeholder="0.00" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">Budget spent so far</label>
          <input v-model="form.budget_spent" type="number" step="0.01" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm" />
        </div>
      </div>

      <!-- Team -->
      <div v-else-if="STEPS[step] === 'Team'" class="space-y-3">
        <p class="text-xs text-slate-500">
          Add anyone besides {{ leadStakeholder?.name ?? 'the lead' }} who should have access to this project.
        </p>
        <ul class="space-y-1">
          <li v-for="t in team" :key="t.stakeholder_id" class="flex items-center gap-2 text-sm">
            <span class="flex-1">{{ stakeholderName(t.stakeholder_id) }}</span>
            <span class="text-xs text-slate-500 capitalize">{{ t.project_role }}</span>
            <button type="button" class="text-slate-500 hover:text-rose-400" title="Remove" @click="removeTeamMember(t.stakeholder_id)">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </li>
          <li v-if="!team.length" class="text-sm text-slate-500">No additional team members yet.</li>
        </ul>
        <div class="flex items-center gap-2">
          <select v-model="newTeamStakeholderId" class="flex-1 border border-white/15 rounded-md px-2 py-1 text-sm">
            <option value="" disabled>Add stakeholder…</option>
            <option v-for="s in availableTeamCandidates" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <select v-model="newTeamRole" class="border border-white/15 rounded-md px-2 py-1 text-sm">
            <option value="sponsor">Sponsor</option>
            <option value="member">Member</option>
            <option value="stakeholder">Stakeholder</option>
          </select>
          <button type="button" class="text-violet-400" title="Add" @click="addTeamMember"><Plus class="w-4 h-4" /></button>
        </div>
      </div>

      <!-- Goals -->
      <div v-else-if="STEPS[step] === 'Goals'" class="space-y-3">
        <p class="text-xs text-slate-500">The outcomes this project is meant to achieve. Optional — you can add these later too.</p>
        <ul class="space-y-1">
          <li v-for="g in goals" :key="g.key" class="flex items-center gap-2 text-sm">
            <span class="flex-1">{{ g.text }}</span>
            <span v-if="g.target_date" class="text-xs text-slate-500">{{ formatDate(g.target_date) }}</span>
            <button type="button" class="text-slate-500 hover:text-rose-400" title="Remove" @click="removeGoal(g.key)">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </li>
          <li v-if="!goals.length" class="text-sm text-slate-500">No goals yet.</li>
        </ul>
        <div class="flex gap-2">
          <input v-model="newGoalText" placeholder="New goal…" class="flex-1 border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addGoal" />
          <input v-model="newGoalTargetDate" type="date" class="border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addGoal" />
          <button type="button" class="text-violet-400" @click="addGoal"><Plus class="w-4 h-4" /></button>
        </div>
      </div>

      <!-- Requirements -->
      <div v-else-if="STEPS[step] === 'Requirements'" class="space-y-3">
        <p class="flex items-center gap-1 text-xs text-slate-500">
          What needs to be delivered. Optionally link each to a Goal above.
          <HelpTooltip text="Linking a requirement to a goal lets you see how much of the work underway actually adds up to that outcome." />
        </p>
        <ul class="space-y-1">
          <li v-for="(r, i) in requirements" :key="i" class="flex items-center gap-2 text-sm">
            <span class="flex-1">{{ r.text }}</span>
            <span v-if="goalText(r.goalKey)" class="text-xs text-slate-500">{{ goalText(r.goalKey) }}</span>
            <button type="button" class="text-slate-500 hover:text-rose-400" title="Remove" @click="removeRequirement(i)">
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </li>
          <li v-if="!requirements.length" class="text-sm text-slate-500">No requirements yet.</li>
        </ul>
        <div class="flex gap-2">
          <input v-model="newRequirementText" placeholder="New requirement…" class="flex-1 border border-white/15 rounded px-2 py-1 text-sm" @keydown.enter.prevent="addRequirement" />
          <select v-model="newRequirementGoalKey" class="border border-white/15 rounded-md px-2 py-1 text-sm">
            <option value="">No goal</option>
            <option v-for="g in goals" :key="g.key" :value="g.key">{{ g.text }}</option>
          </select>
          <button type="button" class="text-violet-400" @click="addRequirement"><Plus class="w-4 h-4" /></button>
        </div>
      </div>

      <!-- Review -->
      <div v-else-if="STEPS[step] === 'Review'" class="space-y-4 text-sm">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-2">
              <span class="inline-block w-3 h-3 rounded-full" :style="{ backgroundColor: form.color_hex }" />
              <span class="font-semibold text-white">{{ form.name || '(untitled project)' }}</span>
            </div>
            <p v-if="form.description" class="mt-1 text-slate-400">{{ form.description }}</p>
          </div>
          <button type="button" class="text-xs text-violet-400 hover:text-violet-300" @click="goTo(0)">Edit</button>
        </div>

        <div class="border-t border-white/10 pt-3 flex items-center justify-between">
          <span class="text-slate-400">Lead: <span class="text-white">{{ leadStakeholder?.name ?? '—' }}</span></span>
          <button type="button" class="text-xs text-violet-400 hover:text-violet-300" @click="goTo(1)">Edit</button>
        </div>

        <div class="border-t border-white/10 pt-3 flex items-center justify-between">
          <span class="text-slate-400">
            Timeline: <span class="text-white">{{ formatDate(form.start_date) }} → {{ formatDate(form.target_end_date) }}</span>
          </span>
          <button type="button" class="text-xs text-violet-400 hover:text-violet-300" @click="goTo(2)">Edit</button>
        </div>

        <div class="border-t border-white/10 pt-3 flex items-center justify-between">
          <span class="text-slate-400">
            Budget: <span class="text-white">{{ form.budget_planned === '' ? '—' : form.budget_planned }}</span>
          </span>
          <button type="button" class="text-xs text-violet-400 hover:text-violet-300" @click="goTo(3)">Edit</button>
        </div>

        <div class="border-t border-white/10 pt-3">
          <div class="flex items-center justify-between mb-1">
            <span class="text-slate-400">Team ({{ team.length }})</span>
            <button type="button" class="text-xs text-violet-400 hover:text-violet-300" @click="goTo(4)">Edit</button>
          </div>
          <ul v-if="team.length" class="text-slate-300">
            <li v-for="t in team" :key="t.stakeholder_id">{{ stakeholderName(t.stakeholder_id) }} — <span class="capitalize text-slate-500">{{ t.project_role }}</span></li>
          </ul>
          <p v-else class="text-slate-500">No additional team members.</p>
        </div>

        <div class="border-t border-white/10 pt-3">
          <div class="flex items-center justify-between mb-1">
            <span class="text-slate-400">Goals ({{ goals.length }})</span>
            <button type="button" class="text-xs text-violet-400 hover:text-violet-300" @click="goTo(5)">Edit</button>
          </div>
          <ul v-if="goals.length" class="text-slate-300">
            <li v-for="g in goals" :key="g.key">{{ g.text }} <span v-if="g.target_date" class="text-slate-500">({{ formatDate(g.target_date) }})</span></li>
          </ul>
          <p v-else class="text-slate-500">No goals.</p>
        </div>

        <div class="border-t border-white/10 pt-3">
          <div class="flex items-center justify-between mb-1">
            <span class="text-slate-400">Requirements ({{ requirements.length }})</span>
            <button type="button" class="text-xs text-violet-400 hover:text-violet-300" @click="goTo(6)">Edit</button>
          </div>
          <ul v-if="requirements.length" class="text-slate-300">
            <li v-for="(r, i) in requirements" :key="i">{{ r.text }} <span v-if="goalText(r.goalKey)" class="text-slate-500">→ {{ goalText(r.goalKey) }}</span></li>
          </ul>
          <p v-else class="text-slate-500">No requirements.</p>
        </div>
      </div>

      <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>

      <div class="flex items-center justify-between pt-2 border-t border-white/10">
        <button
          type="button" :disabled="step === 0"
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-white/8 disabled:opacity-30 disabled:hover:bg-transparent"
          @click="back"
        ><ArrowLeft class="w-4 h-4" /> Back</button>

        <button
          v-if="STEPS[step] !== 'Review'" type="button" :disabled="!canProceed"
          class="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-violet-50 disabled:opacity-40"
          @click="next"
        >Next <ArrowRight class="w-4 h-4" /></button>
        <button
          v-else type="button" :disabled="saving"
          class="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-violet-50 disabled:opacity-50"
          @click="createProject"
        >
          <Loader2 v-if="saving" class="w-4 h-4 animate-spin" />
          <Check v-else class="w-4 h-4" />
          Create Project
        </button>
      </div>
    </div>
  </ModalShell>
</template>
