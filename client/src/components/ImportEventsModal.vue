<script setup>
import { CircleAlert, Download, Eye, FolderOpen, Upload, X } from 'lucide-vue-next';
import { ref } from 'vue';
import HelpTooltip from '@/components/HelpTooltip.vue';
import ModalShell from '@/components/ModalShell.vue';
import { useAsyncAction } from '@/composables/useAsyncAction.js';
import { api } from '@/lib/api.js';
import { formatDate } from '@/lib/dateFormat.js';
import { TABLE_BODY_ROW, TABLE_HEADER_ROW } from '@/lib/tableStyles.js';
import { useProjectStore } from '@/stores/useProjectStore.js';

const emit = defineEmits(['close']);
const store = useProjectStore();

const projectId = ref(store.selectedProjects[0]?.id ?? null);
const fileName = ref('');
const csvText = ref('');
const preview = ref(null);
const result = ref(null);
const error = ref('');
const busy = ref(false);
const runAction = useAsyncAction(error);

function onFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  fileName.value = file.name;
  preview.value = null;
  result.value = null;
  error.value = '';
  const reader = new FileReader();
  reader.onload = () => {
    csvText.value = reader.result;
  };
  reader.readAsText(file);
}

async function runPreview() {
  result.value = null;
  busy.value = true;
  await runAction(async () => {
    preview.value = await api.events.import(projectId.value, csvText.value, false);
  });
  busy.value = false;
}

async function runImport() {
  busy.value = true;
  await runAction(async () => {
    result.value = await api.events.import(projectId.value, csvText.value, true);
    preview.value = null;
    await store.refreshAll();
  });
  busy.value = false;
}

function downloadTemplate() {
  const template = [
    'title,date,type,summary,status,participants',
    'Design freeze,2026-08-15,milestone,,pending,',
    'Sprint review,2026-07-10,review,Walkthrough of sprint deliverables,,Alice;Bob',
  ].join('\n');
  const blob = new Blob([template], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'events-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <ModalShell title="Import Events" wide @close="emit('close')">
    <div class="import-events-modal space-y-4 text-sm">
      <div>
        <label class="block text-xs font-medium text-slate-400 mb-1">Project</label>
        <select v-model.number="projectId" class="w-full border border-white/15 rounded-md px-3 py-1.5 text-sm">
          <option v-for="p in store.selectedProjects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>

      <div class="border border-dashed border-white/15 rounded-md p-4 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-slate-400">
          <Upload class="w-4 h-4 shrink-0" />
          <span>{{ fileName || 'Choose a CSV file to import' }}</span>
          <HelpTooltip text="Columns: title, date (YYYY-MM-DD), type (kickoff/sync/workshop/review/retro/milestone/deadline), summary, status (pending/achieved/missed, optional), participants (optional, stakeholder names separated by ;)." />
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" title="Download template" class="grid h-9 w-9 place-items-center rounded-md text-violet-400 hover:bg-white/[.03]" @click="downloadTemplate">
            <Download class="w-4 h-4" />
          </button>
          <label class="grid h-9 w-9 place-items-center rounded-md border border-white/15 hover:bg-white/[.03] cursor-pointer" title="Browse for a CSV file">
            <FolderOpen class="w-4 h-4" />
            <input type="file" accept=".csv" class="hidden" @change="onFileChange" />
          </label>
        </div>
      </div>

      <div v-if="error" class="text-rose-400 flex items-center gap-1.5">
        <CircleAlert class="w-4 h-4" /> {{ error }}
      </div>

      <div v-if="preview" class="space-y-2">
        <p class="font-medium text-slate-300">{{ preview.validCount }} of {{ preview.totalRows }} rows valid</p>
        <div class="max-h-64 overflow-y-auto border border-white/10 rounded-md">
          <table class="w-full text-xs">
            <thead class="bg-white/[.03] sticky top-0">
              <tr :class="TABLE_HEADER_ROW">
                <th class="px-2 py-1">Row</th>
                <th class="px-2 py-1">Title</th>
                <th class="px-2 py-1">Date</th>
                <th class="px-2 py-1">Type</th>
                <th class="px-2 py-1">Issues</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in preview.rows" :key="r.row" :class="[TABLE_BODY_ROW, r.errors.length ? 'bg-rose-500/10' : '']">
                <td class="px-2 py-1">{{ r.row }}</td>
                <td class="px-2 py-1">{{ r.title }}</td>
                <td class="px-2 py-1">{{ formatDate(r.date) }}</td>
                <td class="px-2 py-1">{{ r.type }}</td>
                <td class="px-2 py-1">
                  <span v-if="r.errors.length" class="text-rose-400">{{ r.errors.join('; ') }}</span>
                  <span v-else-if="r.warnings.length" class="text-amber-400">{{ r.warnings.join('; ') }}</span>
                  <span v-else class="text-emerald-400">OK</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="result" class="text-emerald-300 bg-emerald-500/10 rounded-md px-3 py-2">
        Imported {{ result.imported }} event{{ result.imported === 1 ? '' : 's' }}.
        <span v-if="result.skipped.length">{{ result.skipped.length }} row{{ result.skipped.length === 1 ? '' : 's' }} skipped.</span>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button type="button" title="Close" class="grid h-9 w-9 place-items-center rounded-md border border-white/15 hover:bg-white/[.03]" @click="emit('close')"><X class="w-4 h-4" /></button>
        <button
          v-if="!preview"
          type="button"
          :disabled="!projectId || !csvText || busy"
          title="Preview"
          class="grid h-9 w-9 place-items-center rounded-md border border-white/15 bg-white/10 text-white hover:bg-white/15 disabled:opacity-50"
          @click="runPreview"
        ><Eye class="w-4 h-4" /></button>
        <button
          v-else
          type="button"
          :disabled="!preview.validCount || busy"
          :title="`Import ${preview.validCount} event${preview.validCount === 1 ? '' : 's'}`"
          class="grid h-9 w-9 place-items-center rounded-md bg-white text-slate-950 hover:bg-violet-50 disabled:opacity-50"
          @click="runImport"
        ><Upload class="w-4 h-4" /></button>
      </div>
    </div>
  </ModalShell>
</template>
