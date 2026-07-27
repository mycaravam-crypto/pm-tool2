<script setup>
import { CalendarDays, CalendarRange, FileText, FileUp, ListChecks, Plus } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import AggregatedTabs from '@/components/AggregatedTabs.vue';
import EventDetailModal from '@/components/EventDetailModal.vue';
import HealthSummary from '@/components/HealthSummary.vue';
import ImportEventsModal from '@/components/ImportEventsModal.vue';
import InitializeProjectModal from '@/components/InitializeProjectModal.vue';
import LoginView from '@/components/LoginView.vue';
import MembersModal from '@/components/MembersModal.vue';
import NotificationsLogModal from '@/components/NotificationsLogModal.vue';
import ProjectFormModal from '@/components/ProjectFormModal.vue';
import ResetPasswordView from '@/components/ResetPasswordView.vue';
import Sidebar from '@/components/Sidebar.vue';
import StakeholderDirectoryModal from '@/components/StakeholderDirectoryModal.vue';
import Timeline from '@/components/Timeline.vue';
import { api } from '@/lib/api.js';
import { formatDate, todayStr } from '@/lib/dateFormat.js';
import { playNotificationSound } from '@/lib/sound.js';
import { connectNotificationSocket } from '@/lib/ws.js';
import { useProjectStore } from '@/stores/useProjectStore.js';

const store = useProjectStore();

const mainTab = ref('timeline');
const showProjectForm = ref(false);
const showInitProject = ref(false);
const editingProject = ref(null);
const showStakeholders = ref(false);
const showMembers = ref(false);
const showNotifications = ref(false);
const showEventDetail = ref(false);
const editingEvent = ref(null);
const newEventDate = ref(null);
const showImportEvents = ref(false);
const authChecked = ref(false);
const dashboardFocus = ref(null);

// Handled before the normal login/app branch below, since there's no router
// to give this its own page — a reset link just lands on / with a query
// string (see routes/auth.js's forgot-password email).
const resetToken = ref(new URLSearchParams(window.location.search).get('reset_token'));
function clearResetToken() {
  resetToken.value = null;
  window.history.replaceState({}, '', window.location.pathname);
}

onMounted(async () => {
  try {
    store.setCurrentMember(await api.auth.me());
  } catch {
    store.setCurrentMember(null);
  }
  authChecked.value = true;
  if (store.currentMember) await afterLogin();
});

async function afterLogin() {
  await store.init();
  connectNotificationSocket((notification) => {
    store.receiveNotification(notification);
    playNotificationSound();
  });
}

async function handleLogin(member) {
  store.setCurrentMember(member);
  await afterLogin();
}

async function handleLogout() {
  await store.logout();
  // Simplest correct way to tear down the WebSocket connection and all in-memory
  // state at once, rather than manually unwinding the reconnect loop and every
  // store field.
  window.location.reload();
}

function openNewProject() {
  showInitProject.value = true;
}
function openEditProject(project) {
  editingProject.value = project;
  showProjectForm.value = true;
}
function openNewEvent() {
  editingEvent.value = null;
  newEventDate.value = null;
  showEventDetail.value = true;
}
function openEvent(event) {
  editingEvent.value = event;
  showEventDetail.value = true;
}
function openNewEventOnDate(dateStr) {
  editingEvent.value = null;
  newEventDate.value = dateStr;
  showEventDetail.value = true;
}
async function exportSituationReport() {
  // pdfReports.js embeds its own Inter font data (~300KB) — loaded on demand
  // here rather than bundled into the main app chunk every visitor downloads.
  const { generateSituationReportPdf } = await import('@/lib/pdfReports.js');
  generateSituationReportPdf({
    projects: store.selectedProjects,
    events: store.events,
    summary: store.scopedSummary,
  });
}

async function ensureProjectsSelected() {
  if (store.selectedProjectIds.length === 0) await store.selectAllProjects();
}

// Each jumps from a Health Summary count straight to the matching filtered list —
// a token (always a fresh value) so re-clicking the same stat re-applies the
// filter even when subTab/flags are already at those values.
async function focusOverdueActions() {
  await ensureProjectsSelected();
  mainTab.value = 'dashboard';
  dashboardFocus.value = { subTab: 'actions', overdueOnly: true, token: Date.now() };
}
async function focusHighSeverityPain() {
  await ensureProjectsSelected();
  mainTab.value = 'dashboard';
  dashboardFocus.value = { subTab: 'pain', openOnly: true, severity: 'High', token: Date.now() };
}
async function focusUpcoming() {
  await ensureProjectsSelected();
  mainTab.value = 'dashboard';
  dashboardFocus.value = { subTab: 'upcoming', token: Date.now() };
}
async function focusGoals() {
  await ensureProjectsSelected();
  mainTab.value = 'dashboard';
  // atRiskOnly, not openOnly — matches what the stat itself counts (at_risk_goals:
  // unachieved AND overdue-or-due-within-14d), not just "unachieved."
  dashboardFocus.value = { subTab: 'goals', atRiskOnly: true, token: Date.now() };
}
async function focusScopeCreep() {
  await ensureProjectsSelected();
  mainTab.value = 'dashboard';
  dashboardFocus.value = { subTab: 'requirements', unlinkedOnly: true, token: Date.now() };
}
</script>

<template>
  <ResetPasswordView v-if="resetToken" :token="resetToken" @done="clearResetToken" />
  <div v-else-if="!authChecked" class="app-loading min-h-screen flex items-center justify-center text-sm text-slate-500">
    Loading…
  </div>
  <LoginView v-else-if="!store.currentMember" @login="handleLogin" />
  <div v-else class="app-shell flex h-screen overflow-hidden">
    <Sidebar
      @open-stakeholders="showStakeholders = true"
      @open-project-form="openNewProject"
      @edit-project="openEditProject"
      @open-members="showMembers = true"
      @open-notifications="showNotifications = true"
      @logout="handleLogout"
    />

    <main class="flex-1 flex flex-col overflow-hidden">
      <HealthSummary
        @focus-overdue="focusOverdueActions" @focus-pain="focusHighSeverityPain" @focus-upcoming="focusUpcoming"
        @focus-goals="focusGoals" @focus-scope-creep="focusScopeCreep"
      />

      <div class="main-toolbar flex items-center justify-between px-6 py-3 border-b border-white/8 bg-[#0d0f16]">
        <div class="main-toolbar__tabs inline-flex items-center gap-1 rounded-lg border border-white/8 bg-white/[.03] p-1">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium transition"
            :class="mainTab === 'timeline' ? 'bg-white text-slate-950' : 'text-slate-400 hover:bg-white/8 hover:text-white'"
            @click="mainTab = 'timeline'"
          ><CalendarRange class="w-3.5 h-3.5" />Timeline</button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium transition"
            :class="mainTab === 'dashboard' ? 'bg-white text-slate-950' : 'text-slate-400 hover:bg-white/8 hover:text-white'"
            @click="mainTab = 'dashboard'"
          ><ListChecks class="w-3.5 h-3.5" />Items</button>
        </div>
        <div class="main-toolbar__actions flex items-center gap-4">
          <span class="main-toolbar__today flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[.03] px-3 py-1.5 text-sm text-slate-500 whitespace-nowrap">
            <CalendarDays class="w-3.5 h-3.5" />
            Today: <span class="font-medium text-slate-300">{{ formatDate(todayStr()) }}</span>
          </span>
          <div v-if="store.selectedProjectIds.length > 0" class="flex items-center gap-2">
            <button
              class="grid h-9 w-9 place-items-center rounded-lg border border-white/8 bg-white/[.03] text-slate-300 transition hover:-translate-y-0.5 hover:bg-white/[.08] hover:text-white hover:border-white/15"
              title="Situation Report" @click="exportSituationReport"
            >
              <FileText class="w-4 h-4" />
            </button>
            <button
              class="grid h-9 w-9 place-items-center rounded-lg border border-white/8 bg-white/[.03] text-slate-300 transition hover:-translate-y-0.5 hover:bg-white/[.08] hover:text-white hover:border-white/15"
              title="Import Events" @click="showImportEvents = true"
            >
              <FileUp class="w-4 h-4" />
            </button>
            <button
              class="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-950 shadow-[0_10px_28px_rgba(255,255,255,.08)] transition hover:-translate-y-0.5 hover:bg-violet-50"
              title="New Event" @click="openNewEvent"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-auto">
        <Timeline v-if="mainTab === 'timeline'" @select-event="openEvent" @select-goal="openEditProject" @new-event="openNewEventOnDate" />
        <AggregatedTabs v-else :focus="dashboardFocus" @select-event="openEvent" />
      </div>
    </main>

    <ProjectFormModal v-if="showProjectForm" :project="editingProject" @close="showProjectForm = false" />
    <InitializeProjectModal v-if="showInitProject" @close="showInitProject = false" />
    <StakeholderDirectoryModal v-if="showStakeholders" @close="showStakeholders = false" />
    <MembersModal v-if="showMembers" @close="showMembers = false" />
    <NotificationsLogModal v-if="showNotifications" @close="showNotifications = false" />
    <Transition name="drawer">
      <EventDetailModal
        v-if="showEventDetail" :event="editingEvent" :default-date="newEventDate"
        @close="showEventDetail = false"
      />
    </Transition>
    <ImportEventsModal v-if="showImportEvents" @close="showImportEvents = false" />
  </div>
</template>
