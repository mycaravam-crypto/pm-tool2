<script setup>
import { formatDate } from '../lib/dateFormat.js';

defineProps({ event: { type: Object, required: true } });
defineEmits(['select']);
</script>

<template>
  <button
    type="button" class="text-violet-400 hover:underline text-left"
    :title="`Open ${event.title} (${formatDate(event.date)})`"
    @click="$emit('select', event)"
  >{{ event.title }}</button>
</template>
