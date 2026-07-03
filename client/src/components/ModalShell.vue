<script setup>
import { X } from 'lucide-vue-next';

defineProps({ title: { type: String, required: true }, wide: { type: Boolean, default: false } });
const emit = defineEmits(['close']);
</script>

<template>
  <div class="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" @click.self="emit('close')">
    <div
      class="bg-white rounded-lg shadow-xl w-full max-h-[90vh] overflow-y-auto"
      :class="wide ? 'max-w-2xl' : 'max-w-md'"
    >
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white">
        <h2 class="text-base font-semibold text-slate-900">{{ title }}</h2>
        <button class="text-slate-400 hover:text-slate-700" @click="emit('close')">
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="p-5">
        <slot />
      </div>
    </div>
  </div>
</template>
