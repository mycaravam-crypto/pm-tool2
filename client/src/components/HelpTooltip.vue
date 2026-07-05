<script setup>
import { CircleHelp } from 'lucide-vue-next';
import { onBeforeUnmount, onMounted, ref } from 'vue';

defineProps({
  text: { type: String, required: true },
  // 'right' anchors the tooltip's right edge to the button instead of centering
  // it — needed when the trigger sits near the right edge of the viewport, where
  // a centered w-64 tooltip would run off-screen.
  align: { type: String, default: 'center' },
});

const open = ref(false);
const root = ref(null);

function toggle() {
  open.value = !open.value;
}
function handleClickOutside(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false;
}
function handleKeydown(e) {
  if (e.key === 'Escape') open.value = false;
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <span ref="root" class="relative inline-flex align-middle">
    <button
      type="button"
      class="text-slate-400 hover:text-indigo-600"
      :aria-expanded="open"
      aria-label="Help"
      @click.stop="toggle"
    >
      <CircleHelp class="w-3.5 h-3.5" />
    </button>
    <div
      v-if="open"
      role="tooltip"
      class="absolute z-30 top-full mt-1.5 w-64 rounded-md border border-slate-200 bg-white p-2.5 text-xs leading-relaxed text-slate-600 shadow-lg"
      :class="align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'"
    >{{ text }}</div>
  </span>
</template>
