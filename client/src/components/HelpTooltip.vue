<script setup>
import { CircleHelp } from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  text: { type: String, required: true },
  // 'right' anchors the tooltip's right edge to the button instead of centering
  // it — needed when the trigger sits near the right edge of the viewport, where
  // a centered w-64 tooltip would run off-screen.
  align: { type: String, default: 'center' },
});

const open = ref(false);
const root = ref(null);
const tooltip = ref(null);
const tooltipStyle = ref({});

// Teleported to <body> and positioned in fixed viewport coordinates instead of
// `absolute` inside `root` — every caller lives inside ModalShell's
// `overflow-y-auto` body (or worse, a modal nested inside another modal), and
// an absolutely-positioned descendant gets clipped to the nearest scrolling
// ancestor's bounds no matter how high its z-index is set.
function updatePosition() {
  const btn = root.value?.querySelector('button');
  if (!btn || !tooltip.value) return;
  const btnRect = btn.getBoundingClientRect();
  const tipRect = tooltip.value.getBoundingClientRect();
  const rawLeft =
    props.align === 'right' ? btnRect.right - tipRect.width : btnRect.left + btnRect.width / 2 - tipRect.width / 2;
  const left = Math.min(Math.max(rawLeft, 8), window.innerWidth - tipRect.width - 8);
  tooltipStyle.value = { top: `${btnRect.bottom + 6}px`, left: `${left}px` };
}

function toggle() {
  open.value = !open.value;
  if (open.value) nextTick(updatePosition);
}
function handleClickOutside(e) {
  if (root.value?.contains(e.target) || tooltip.value?.contains(e.target)) return;
  open.value = false;
}
function handleKeydown(e) {
  if (e.key === 'Escape') open.value = false;
}
// Capture phase: reposition on scroll anywhere in the tree (e.g. the modal
// body scrolling under the trigger), not just window-level scrolling, which
// wouldn't otherwise bubble here.
function handleReposition() {
  if (open.value) updatePosition();
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('scroll', handleReposition, true);
  window.addEventListener('resize', handleReposition);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('scroll', handleReposition, true);
  window.removeEventListener('resize', handleReposition);
});
</script>

<template>
  <span ref="root" class="help-tooltip relative inline-flex align-middle">
    <button
      type="button"
      class="text-slate-500 hover:text-violet-400"
      :aria-expanded="open"
      aria-label="Help"
      @click.stop="toggle"
    >
      <CircleHelp class="w-3.5 h-3.5" />
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="tooltip"
        role="tooltip"
        class="fixed z-[200] w-64 rounded-md border border-white/10 bg-[#171b25] p-2.5 text-xs leading-relaxed text-slate-400 shadow-[0_20px_45px_rgba(0,0,0,.45)]"
        :style="tooltipStyle"
      >{{ text }}</div>
    </Teleport>
  </span>
</template>
