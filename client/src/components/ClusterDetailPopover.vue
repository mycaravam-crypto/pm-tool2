<script setup>
import { formatDate } from '../lib/dateFormat.js';

defineProps({
  overflowEvents: { type: Array, required: true },
  isOpen: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle', 'select']);
</script>

<template>
  <div class="flex flex-col items-center">
    <button
      class="flex items-center justify-center w-10 h-10 rounded-full shadow hover:shadow-md hover:-translate-y-0.5 transition-all bg-slate-100 border-2 border-slate-400 text-slate-600 text-xs font-semibold"
      :title="`${overflowEvents.length} more event(s) — click to list`"
      aria-haspopup="true"
      :aria-expanded="isOpen"
      @click="emit('toggle')"
    >+{{ overflowEvents.length }}</button>
    <span class="mt-1.5 text-[11px] leading-tight text-slate-500">more</span>

    <div
      v-if="isOpen"
      role="menu"
      aria-label="More events at this point in time"
      class="absolute top-full mt-1 z-20 w-52 bg-white border border-slate-200 rounded-md shadow-lg py-1 max-h-56 overflow-y-auto"
    >
      <button
        v-for="oe in overflowEvents" :key="oe.id" type="button" role="menuitem"
        class="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
        @click="emit('select', oe)"
      >
        <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: oe.project.color_hex }" />
        <span class="flex-1 truncate" :title="oe.title">{{ oe.title }}</span>
        <span class="text-slate-400 shrink-0">{{ formatDate(oe.date) }}</span>
      </button>
    </div>
  </div>
</template>
