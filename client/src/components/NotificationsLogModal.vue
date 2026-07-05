<script setup>
import { Mail, PlayCircle } from 'lucide-vue-next';
import { ref } from 'vue';
import { formatDateTime } from '../lib/dateFormat.js';
import { useProjectStore } from '../stores/useProjectStore.js';
import ModalShell from './ModalShell.vue';

const emit = defineEmits(['close']);
const store = useProjectStore();
const running = ref(false);
const lastRun = ref(null);

const TYPE_LABELS = {
  assigned: 'Assigned to you',
  overdue_digest: 'Overdue digest',
  deadline_digest: 'Deadline digest',
};
const TYPE_COLORS = {
  assigned: 'bg-indigo-100 text-indigo-700',
  overdue_digest: 'bg-rose-100 text-rose-700',
  deadline_digest: 'bg-amber-100 text-amber-700',
};

async function runDigest() {
  running.value = true;
  try {
    const result = await store.runDigestNow();
    lastRun.value = result.generated;
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <ModalShell title="Notifications" wide @close="emit('close')">
    <p class="text-sm text-slate-500 mb-3">
      Sending is stubbed — no real email goes out. Each row below is what would have been sent,
      to whom, and why. Real-time rows appear as soon as someone is assigned an action item, pain
      point, or decision. Digest rows only appear after running the digest below (in production
      this would run on a nightly schedule instead of on demand).
    </p>

    <div class="flex items-center gap-3 mb-4">
      <button
        class="flex items-center gap-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50"
        :disabled="running"
        @click="runDigest"
      >
        <PlayCircle class="w-4 h-4" /> {{ running ? 'Running…' : 'Run Digest Now' }}
      </button>
      <span v-if="lastRun !== null" class="text-sm text-slate-500">Generated {{ lastRun }} digest notification(s).</span>
    </div>

    <ul class="space-y-2">
      <li v-for="n in store.notifications" :key="n.id" class="border border-slate-200 rounded-md p-3">
        <div class="flex items-center gap-2 mb-1">
          <Mail class="w-3.5 h-3.5 text-slate-400" />
          <span class="text-xs px-1.5 py-0.5 rounded font-medium" :class="TYPE_COLORS[n.type]">{{ TYPE_LABELS[n.type] }}</span>
          <span class="text-sm font-medium">{{ n.subject }}</span>
          <span class="text-xs text-slate-400 ml-auto">{{ formatDateTime(n.created_at) }}</span>
        </div>
        <p class="text-xs text-slate-500 mb-1">To: {{ n.member_name }} &lt;{{ n.member_email }}&gt;</p>
        <pre class="text-xs text-slate-600 whitespace-pre-wrap font-sans">{{ n.body }}</pre>
      </li>
    </ul>
    <p v-if="store.notifications.length === 0" class="text-sm text-slate-400 py-4">No notifications logged yet.</p>
  </ModalShell>
</template>
