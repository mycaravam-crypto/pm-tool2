<script setup>
defineProps({ project: { type: Object, required: true } });
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: project.color_hex }" />{{ project.name }}
  </span>
</template>
