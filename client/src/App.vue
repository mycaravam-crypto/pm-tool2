<script setup>
import { ref, onMounted, computed } from 'vue';
import { Plus } from 'lucide-vue-next';
import { useProjectStore } from './stores/useProjectStore.js';
import Sidebar from './components/Sidebar.vue';
import Timeline from './components/Timeline.vue';
import HealthSummary from './components/HealthSummary.vue';
import AggregatedTabs from './components/AggregatedTabs.vue';
import ProjectFormModal from './components/ProjectFormModal.vue';
import StakeholderDirectoryModal from './components/StakeholderDirectoryModal.vue';
import EventDetailModal from './components/EventDetailModal.vue';

const store = useProjectStore();

const mainTab = ref('timeline');
const showProjectForm = ref(false);
const editingProject = ref(null);
const showStakeholders = ref(false);
const showEventDetail = ref(false);
const editingEvent = ref(null);

onMounted(() => store.init());

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
  showEventDetail.value = true;
}
function openEvent(event) {
  editingEvent.value = event;
  showEventDetail.value = true;
}
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <Sidebar @open-stakeholders="showStakeholders = true" @open-project-form="openNewProject" @edit-project="openEditProject" />

    <main class="flex-1 flex flex-col overflow-hidden">
      <HealthSummary />

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
        <button
          v-if="store.selectedProjectIds.length > 0"
          class="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
          @click="openNewEvent"
        >
          <Plus class="w-4 h-4" /> New Event
        </button>
      </div>

      <div class="flex-1 overflow-auto">
        <Timeline v-if="mainTab === 'timeline'" @select-event="openEvent" />
        <AggregatedTabs v-else />
      </div>
    </main>

    <ProjectFormModal v-if="showProjectForm" :project="editingProject" @close="showProjectForm = false" />
    <StakeholderDirectoryModal v-if="showStakeholders" @close="showStakeholders = false" />
    <EventDetailModal v-if="showEventDetail" :event="editingEvent" @close="showEventDetail = false" />
  </div>
</template>
