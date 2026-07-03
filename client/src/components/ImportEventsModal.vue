<script setup>
import { ref } from 'vue';
import { Upload, Download, CircleAlert } from 'lucide-vue-next';
import { useProjectStore } from '../stores/useProjectStore.js';
import { api } from '../lib/api.js';
import ModalShell from './ModalShell.vue';

const emit = defineEmits(['close']);
const store = useProjectStore();

const projectId = ref(store.selectedProjects[0]?.id ?? null);
const fileName = ref('');
const csvText = ref('');
const preview = ref(null);
const result = ref(null);
const error = ref('');
const busy = ref(false);

function onFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  fileName.value = file.name;
  preview.value = null;
  result.value = null;
  error.value = '';
  const reader = new FileReader();
  reader.onload = () => { csvText.value = reader.result; };
  reader.readAsText(file);
}

async function runPreview() {
  error.value = '';
  result.value = null;
  busy.value = true;
  try {
    preview.value = await api.events.import(projectId.value, csvText.value, false);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function runImport() {
  error.value = '';
  busy.value = true;
  try {
    result.value = await api.events.import(projectId.value, csvText.value, true);
    preview.value = null;
    await store.refreshAll();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

function downloadTemplate() {
  const template = [
    'title,date,type,summary,status,participants',
    'Design freeze,2026-08-15,milestone,,pending,',
    'Sprint review,2026-07-10,review,Walkthrough of sprint deliverables,,Alice;Bob'
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
    <div class="space-y-4 text-sm">
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">Project</label>
        <select v-model.number="projectId" class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm">
          <option v-for="p in store.selectedProjects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>

      <div class="border border-dashed border-slate-300 rounded-md p-4 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-slate-600">
          <Upload class="w-4 h-4 shrink-0" />
          <span>{{ fileName || 'Choose a CSV file to import' }}</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" class="text-indigo-600 hover:underline flex items-center gap-1" @click="downloadTemplate">
            <Download class="w-3.5 h-3.5" /> Template
          </button>
          <label class="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 cursor-pointer">
            Browse…
            <input type="file" accept=".csv" class="hidden" @change="onFileChange" />
          </label>
        </div>
      </div>

      <p class="text-xs text-slate-500">
        Columns: <code>title</code>, <code>date</code> (YYYY-MM-DD), <code>type</code> (kickoff/sync/workshop/review/decision/retro/milestone/deadline),
        <code>summary</code>, <code>status</code> (pending/achieved/missed, optional), <code>participants</code> (optional, stakeholder names separated by <code>;</code>).
      </p>

      <div v-if="error" class="text-rose-600 flex items-center gap-1.5">
        <CircleAlert class="w-4 h-4" /> {{ error }}
      </div>

      <div v-if="preview" class="space-y-2">
        <p class="font-medium text-slate-700">{{ preview.validCount }} of {{ preview.totalRows }} rows valid</p>
        <div class="max-h-64 overflow-y-auto border border-slate-200 rounded-md">
          <table class="w-full text-xs">
            <thead class="bg-slate-50 sticky top-0">
              <tr class="text-left text-slate-500">
                <th class="px-2 py-1">Row</th>
                <th class="px-2 py-1">Title</th>
                <th class="px-2 py-1">Date</th>
                <th class="px-2 py-1">Type</th>
                <th class="px-2 py-1">Issues</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in preview.rows" :key="r.row" :class="r.errors.length ? 'bg-rose-50' : ''" class="border-t border-slate-100">
                <td class="px-2 py-1">{{ r.row }}</td>
                <td class="px-2 py-1">{{ r.title }}</td>
                <td class="px-2 py-1">{{ r.date }}</td>
                <td class="px-2 py-1">{{ r.type }}</td>
                <td class="px-2 py-1">
                  <span v-if="r.errors.length" class="text-rose-600">{{ r.errors.join('; ') }}</span>
                  <span v-else-if="r.warnings.length" class="text-amber-600">{{ r.warnings.join('; ') }}</span>
                  <span v-else class="text-emerald-600">OK</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="result" class="text-emerald-700 bg-emerald-50 rounded-md px-3 py-2">
        Imported {{ result.imported }} event{{ result.imported === 1 ? '' : 's' }}.
        <span v-if="result.skipped.length">{{ result.skipped.length }} row{{ result.skipped.length === 1 ? '' : 's' }} skipped.</span>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button type="button" class="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50" @click="emit('close')">Close</button>
        <button
          v-if="!preview"
          type="button"
          :disabled="!projectId || !csvText || busy"
          class="px-3 py-1.5 rounded-md bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
          @click="runPreview"
        >Preview</button>
        <button
          v-else
          type="button"
          :disabled="!preview.validCount || busy"
          class="px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          @click="runImport"
        >Import {{ preview.validCount }} event{{ preview.validCount === 1 ? '' : 's' }}</button>
      </div>
    </div>
  </ModalShell>
</template>
