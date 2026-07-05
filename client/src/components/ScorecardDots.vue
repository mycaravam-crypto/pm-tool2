<script setup>
import { RAG_COLORS, RAG_LABELS } from '../lib/rag.js';

defineProps({
  scorecard: { type: Object, required: true },
  size: { type: String, default: 'sm' },
});

const LABELS = { schedule: 'Schedule', cost: 'Cost', quality: 'Quality' };
</script>

<template>
  <div class="flex items-center gap-1" role="group" aria-label="Project scorecard">
    <span
      v-for="key in ['schedule', 'cost', 'quality']"
      :key="key"
      :class="[RAG_COLORS[scorecard[key]], size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5']"
      class="rounded-full inline-block"
      :title="`${LABELS[key]}: ${RAG_LABELS[scorecard[key]]}`"
    />
  </div>
</template>
