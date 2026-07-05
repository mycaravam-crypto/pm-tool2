<script setup>
import { ref } from 'vue';
import { api } from '../lib/api.js';

const props = defineProps({ token: { type: String, required: true } });
const emit = defineEmits(['done']);

const password = ref('');
const error = ref('');
const success = ref(false);
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await api.auth.resetPassword(props.token, password.value);
    success.value = true;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-50">
    <div class="bg-white rounded-lg shadow-md p-8 w-full max-w-sm space-y-4">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">ChronosPM</h1>
        <p class="text-sm text-slate-500">Choose a new password</p>
      </div>

      <template v-if="success">
        <p class="text-sm text-emerald-600">Password updated. You can sign in now.</p>
        <button
          type="button"
          class="w-full bg-indigo-600 text-white rounded-md py-2 text-sm font-medium hover:bg-indigo-700"
          @click="emit('done')"
        >Go to sign in</button>
      </template>
      <form v-else class="space-y-4" @submit.prevent="submit">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">New password</label>
          <input v-model="password" type="password" required minlength="6" autofocus class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>
        <button
          type="submit" :disabled="loading"
          class="w-full bg-indigo-600 text-white rounded-md py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >{{ loading ? 'Saving…' : 'Set new password' }}</button>
      </form>
    </div>
  </div>
</template>
