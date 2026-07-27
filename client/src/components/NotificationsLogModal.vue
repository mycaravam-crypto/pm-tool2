<script setup>
import { CalendarClock, Loader2, Mail, PlayCircle } from 'lucide-vue-next';
import { ref } from 'vue';
import HelpTooltip from '@/components/HelpTooltip.vue';
import ModalShell from '@/components/ModalShell.vue';
import { useAsyncAction } from '@/composables/useAsyncAction.js';
import { formatDateTime } from '@/lib/dateFormat.js';
import { useProjectStore } from '@/stores/useProjectStore.js';

const emit = defineEmits(['close']);
const store = useProjectStore();
const running = ref(false);
const lastRun = ref(null);
const runningStatusReport = ref(false);
const lastStatusReportRun = ref(null);
const error = ref('');
const runAction = useAsyncAction(error);

const TYPE_LABELS = {
  assigned: 'Assigned to you',
  overdue_digest: 'Overdue digest',
  deadline_digest: 'Deadline digest',
  status_report: 'Status report',
};
const TYPE_COLORS = {
  assigned: 'bg-violet-500/20 text-violet-300',
  overdue_digest: 'bg-rose-500/15 text-rose-300',
  deadline_digest: 'bg-amber-500/15 text-amber-300',
  status_report: 'bg-cyan-500/15 text-cyan-300',
};

async function runDigest() {
  running.value = true;
  await runAction(async () => {
    const result = await store.runDigestNow();
    lastRun.value = result.generated;
  });
  running.value = false;
}

async function runStatusReport() {
  runningStatusReport.value = true;
  await runAction(async () => {
    const result = await store.runStatusReportNow();
    lastStatusReportRun.value = result.generated;
  });
  runningStatusReport.value = false;
}
</script>

<template>
  <ModalShell title="Notifications" wide @close="emit('close')">
    <div class="notifications-log-modal">
    <p class="flex items-center gap-1 text-sm text-slate-500 mb-3">
      Everything the system has generated, most recent first.
      <HelpTooltip text="Each row was also emailed to its recipient (or logged to the server console if SMTP isn't configured). Real-time rows appear as soon as someone is assigned an action item, pain point, or decision. Digest rows are generated automatically every night, and status reports weekly — use the buttons below to also trigger either on demand." />
    </p>

    <div class="flex items-center gap-3 mb-4">
      <button
        class="grid h-9 w-9 place-items-center rounded-md bg-white text-slate-950 hover:bg-violet-50 disabled:opacity-50"
        :disabled="running" :title="running ? 'Running…' : 'Run Digest Now'"
        @click="runDigest"
      >
        <Loader2 v-if="running" class="w-4 h-4 animate-spin" />
        <PlayCircle v-else class="w-4 h-4" />
      </button>
      <span v-if="lastRun !== null" class="text-sm text-slate-500">Generated {{ lastRun }} digest notification(s).</span>
    </div>

    <div class="flex items-center gap-3 mb-4">
      <button
        class="grid h-9 w-9 place-items-center rounded-md border border-white/15 text-slate-300 hover:bg-white/[.03] disabled:opacity-50"
        :disabled="runningStatusReport" :title="runningStatusReport ? 'Running…' : 'Run Status Report Now'"
        @click="runStatusReport"
      >
        <Loader2 v-if="runningStatusReport" class="w-4 h-4 animate-spin" />
        <CalendarClock v-else class="w-4 h-4" />
      </button>
      <span v-if="lastStatusReportRun !== null" class="text-sm text-slate-500">Generated {{ lastStatusReportRun }} status report notification(s).</span>
    </div>
    <p v-if="error" class="text-sm text-rose-600 mb-3">{{ error }}</p>

    <ul class="space-y-2">
      <li v-for="n in store.notifications" :key="n.id" class="border border-white/10 rounded-md p-3">
        <div class="flex items-center gap-2 mb-1">
          <Mail class="w-3.5 h-3.5 text-slate-500" />
          <span class="text-xs px-1.5 py-0.5 rounded font-medium" :class="TYPE_COLORS[n.type]">{{ TYPE_LABELS[n.type] }}</span>
          <span v-if="n.project_id && store.projectById(n.project_id)" class="flex items-center gap-1 text-xs text-slate-500">
            <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: store.projectById(n.project_id).color_hex }" />
            {{ store.projectById(n.project_id).name }}
          </span>
          <span class="text-sm font-medium">{{ n.subject }}</span>
          <span class="text-xs text-slate-500 ml-auto">{{ formatDateTime(n.created_at) }}</span>
        </div>
        <p class="text-xs text-slate-500 mb-1">To: {{ n.member_name }} &lt;{{ n.member_email }}&gt;</p>
        <pre class="text-xs text-slate-400 whitespace-pre-wrap font-sans">{{ n.body }}</pre>
      </li>
    </ul>
    <p v-if="store.notifications.length === 0" class="text-sm text-slate-500 py-4">No notifications logged yet.</p>
    </div>
  </ModalShell>
</template>
