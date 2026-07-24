<script setup>
import { FileText, FileUp, Plus } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import AggregatedTabs from './components/AggregatedTabs.vue';
import EventDetailModal from './components/EventDetailModal.vue';
import HealthSummary from './components/HealthSummary.vue';
import ImportEventsModal from './components/ImportEventsModal.vue';
import LoginView from './components/LoginView.vue';
import MembersModal from './components/MembersModal.vue';
import NotificationsLogModal from './components/NotificationsLogModal.vue';
import ProjectFormModal from './components/ProjectFormModal.vue';
import ResetPasswordView from './components/ResetPasswordView.vue';
import Sidebar from './components/Sidebar.vue';
import StakeholderDirectoryModal from './components/StakeholderDirectoryModal.vue';
import Timeline from './components/Timeline.vue';
import { api } from './lib/api.js';
import { formatDate, todayStr } from './lib/dateFormat.js';
import { generateSituationReportPdf } from './lib/pdfReports.js';
import { playNotificationSound } from './lib/sound.js';
import { connectNotificationSocket } from './lib/ws.js';
import { useProjectStore } from './stores/useProjectStore.js';

const store = useProjectStore();

const mainTab = ref('timeline');
const showProjectForm = ref(false);
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
  editingProject.value = null;
  showProjectForm.value = true;
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
function exportSituationReport() {
  generateSituationReportPdf({
    projects: store.selectedProjects,
    events: store.events,
    summary: store.scopedSummary,
  });
}

// Jumps from a Health Summary count straight to the matching filtered list —
// a token (always a fresh value) so re-clicking the same stat re-applies the
// filter even when subTab/flags are already at those values.
async function ensureProjectsSelected() {
  if (store.selectedProjectIds.length === 0) await store.selectAllProjects();
}
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
</script>

<template>
  <ResetPasswordView v-if="resetToken" :token="resetToken" @done="clearResetToken" />
  <div v-else-if="!authChecked" class="min-h-screen flex items-center justify-center text-sm text-slate-400">
    Loading…
  </div>
  <LoginView v-else-if="!store.currentMember" @login="handleLogin" />
  <div v-else class="flex h-screen overflow-hidden">
    <Sidebar
      @open-stakeholders="showStakeholders = true"
      @open-project-form="openNewProject"
      @edit-project="openEditProject"
      @open-members="showMembers = true"
      @open-notifications="showNotifications = true"
      @logout="handleLogout"
    />

    <main class="flex-1 flex flex-col overflow-hidden">
      <HealthSummary @focus-overdue="focusOverdueActions" @focus-pain="focusHighSeverityPain" @focus-upcoming="focusUpcoming" />

      <div class="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white">
        <div class="flex gap-1">
          <button
            class="px-3 py-1.5 text-sm rounded-md"
            :class="mainTab === 'timeline' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="mainTab = 'timeline'"
          >Timeline</button>
          <button
            class="px-3 py-1.5 text-sm rounded-md"
            :class="mainTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="mainTab = 'dashboard'"
          >Action Items / Pain Points / Decisions</button>
        </div>
        <div class="flex items-center gap-4">
          <span class="text-sm text-slate-500 whitespace-nowrap">Today: <span class="font-medium text-slate-700">{{ formatDate(todayStr()) }}</span></span>
          <div v-if="store.selectedProjectIds.length > 0" class="flex items-center gap-2">
            <button
              class="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              @click="exportSituationReport"
            >
              <FileText class="w-4 h-4" /> Situation Report
            </button>
            <button
              class="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              @click="showImportEvents = true"
            >
              <FileUp class="w-4 h-4" /> Import Events
            </button>
            <button
              class="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
              @click="openNewEvent"
            >
              <Plus class="w-4 h-4" /> New Event
            </button>
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-auto">
        <Timeline v-if="mainTab === 'timeline'" @select-event="openEvent" @new-event="openNewEventOnDate" />
        <AggregatedTabs v-else :focus="dashboardFocus" @select-event="openEvent" />
      </div>
    </main>

    <ProjectFormModal v-if="showProjectForm" :project="editingProject" @close="showProjectForm = false" />
    <StakeholderDirectoryModal v-if="showStakeholders" @close="showStakeholders = false" />
    <MembersModal v-if="showMembers" @close="showMembers = false" />
    <NotificationsLogModal v-if="showNotifications" @close="showNotifications = false" />
    <EventDetailModal
      v-if="showEventDetail" :event="editingEvent" :default-date="newEventDate"
      @close="showEventDetail = false"
    />
    <ImportEventsModal v-if="showImportEvents" @close="showImportEvents = false" />
  </div>
</template>
