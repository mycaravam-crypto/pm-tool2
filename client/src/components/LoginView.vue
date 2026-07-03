<script setup>
import { ref } from 'vue';
import { api } from '../lib/api.js';

const emit = defineEmits(['login']);

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    const member = await api.auth.login(email.value, password.value);
    emit('login', member);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-50">
    <form class="bg-white rounded-lg shadow-md p-8 w-full max-w-sm space-y-4" @submit.prevent="submit">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">ChronosPM</h1>
        <p class="text-sm text-slate-500">Sign in to continue</p>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">Email</label>
        <input v-model="email" type="email" required autofocus class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">Password</label>
        <input v-model="password" type="password" required class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
      </div>
      <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>
      <button
        type="submit" :disabled="loading"
        class="w-full bg-indigo-600 text-white rounded-md py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
      >{{ loading ? 'Signing in…' : 'Sign in' }}</button>
    </form>
  </div>
</template>
