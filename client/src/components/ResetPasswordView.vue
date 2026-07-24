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
  <div class="min-h-screen flex items-center justify-center">
    <div class="glass rounded-2xl p-8 w-full max-w-sm space-y-4">
      <div>
        <h1 class="text-lg font-semibold text-white">ChronosPM</h1>
        <p class="text-sm text-slate-500">Choose a new password</p>
      </div>

      <template v-if="success">
        <p class="text-sm text-emerald-400">Password updated. You can sign in now.</p>
        <button
          type="button"
          class="w-full bg-white text-slate-950 rounded-md py-2 text-sm font-semibold hover:bg-violet-50"
          @click="emit('done')"
        >Go to sign in</button>
      </template>
      <form v-else class="space-y-4" @submit.prevent="submit">
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1">New password</label>
          <input v-model="password" type="password" required minlength="6" autofocus class="w-full border border-white/15 rounded-md px-3 py-2 text-sm" />
        </div>
        <p v-if="error" class="text-sm text-rose-400">{{ error }}</p>
        <button
          type="submit" :disabled="loading"
          class="w-full bg-white text-slate-950 rounded-md py-2 text-sm font-semibold hover:bg-violet-50 disabled:opacity-50"
        >{{ loading ? 'Saving…' : 'Set new password' }}</button>
      </form>
    </div>
  </div>
</template>
