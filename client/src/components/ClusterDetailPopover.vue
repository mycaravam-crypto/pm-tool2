<script setup>
import { formatDate } from '../lib/dateFormat.js';

defineProps({
  overflowEvents: { type: Array, required: true },
  isOpen: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle', 'select']);
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="flex h-[30px] items-center gap-1.5 rounded-full border border-white/16 bg-white/8 px-2.5 text-[11px] font-semibold text-slate-200 shadow-[0_6px_16px_rgba(0,0,0,.22)] transition hover:-translate-y-0.5 hover:bg-white/14 hover:border-white/28"
      :title="`${overflowEvents.length} more event(s) — click to list`"
      aria-haspopup="true"
      :aria-expanded="isOpen"
      @click="emit('toggle')"
    ><span class="text-white">+{{ overflowEvents.length }}</span>more</button>

    <div
      v-if="isOpen"
      role="menu"
      aria-label="More events at this point in time"
      class="absolute top-full left-0 mt-1 z-20 w-52 rounded-lg border border-white/10 bg-[#171b25] py-1 shadow-[0_20px_45px_rgba(0,0,0,.45)] max-h-56 overflow-y-auto"
    >
      <button
        v-for="oe in overflowEvents" :key="oe.id" type="button" role="menuitem"
        class="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-slate-200 hover:bg-white/8"
        @click="emit('select', oe)"
      >
        <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: oe.project.color_hex }" />
        <span class="flex-1 truncate" :title="oe.title">{{ oe.title }}</span>
        <span class="text-slate-500 shrink-0">{{ formatDate(oe.date) }}</span>
      </button>
    </div>
  </div>
</template>
