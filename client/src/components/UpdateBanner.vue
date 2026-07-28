<script setup>
defineProps({ show: Boolean });
defineEmits(['dismiss']);
</script>

<template>
  <div
    v-if="show"
    class="update-banner flex items-center justify-center gap-3 bg-violet-600 px-4 py-2 text-sm text-white"
  >
    <span>A new version of ChronosPM is available.</span>
    <button
      class="rounded-md bg-white/15 px-3 py-1 font-medium transition hover:bg-white/25"
      @click="location.reload()"
    >
      Reload
    </button>
    <button class="text-white/70 transition hover:text-white" title="Dismiss" @click="$emit('dismiss')">✕</button>
  </div>
</template>
