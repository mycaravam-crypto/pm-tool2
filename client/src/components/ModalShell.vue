<script setup>
import { X } from 'lucide-vue-next';

defineProps({ title: { type: String, required: true }, wide: { type: Boolean, default: false } });
const emit = defineEmits(['close']);
</script>

<template>
  <div class="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4" @click.self="emit('close')">
    <div
      class="bg-[#121620] border border-white/10 rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto"
      :class="wide ? 'max-w-2xl' : 'max-w-md'"
    >
      <div class="flex items-center justify-between px-5 py-4 border-b border-white/8 sticky top-0 bg-[#121620]">
        <h2 class="text-base font-semibold text-white">{{ title }}</h2>
        <button class="text-slate-500 hover:text-white" @click="emit('close')">
          <X class="w-5 h-5" />
        </button>
      </div>
      <div class="p-5">
        <slot />
      </div>
    </div>
  </div>
</template>
