<script setup>
import { ref } from 'vue';
import { api } from '../lib/api.js';

const emit = defineEmits(['login']);

// 'login' | 'register' | 'forgot' — one shared form, swapped by mode, rather
// than three separate routed pages (this app has no router — see App.vue).
const mode = ref('login');

const name = ref('');
const email = ref('');
const password = ref('');
const error = ref('');
const info = ref('');
const loading = ref(false);

function switchMode(next) {
  mode.value = next;
  error.value = '';
  info.value = '';
  password.value = '';
}

async function submit() {
  error.value = '';
  info.value = '';
  loading.value = true;
  try {
    if (mode.value === 'login') {
      const member = await api.auth.login(email.value, password.value);
      emit('login', member);
    } else if (mode.value === 'register') {
      const member = await api.auth.register(name.value, email.value, password.value);
      emit('login', member);
    } else if (mode.value === 'forgot') {
      await api.auth.forgotPassword(email.value);
      info.value = "If that email is registered, we've sent a reset link.";
    }
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
        <p class="text-sm text-slate-500">
          {{ mode === 'login' ? 'Sign in to continue' : mode === 'register' ? 'Create an account' : 'Reset your password' }}
        </p>
      </div>

      <div v-if="mode === 'register'">
        <label class="block text-xs font-medium text-slate-600 mb-1">Name</label>
        <input v-model="name" type="text" required autofocus class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">Email</label>
        <input
          v-model="email" type="email" required :autofocus="mode !== 'register'"
          class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div v-if="mode !== 'forgot'">
        <label class="block text-xs font-medium text-slate-600 mb-1">Password</label>
        <input v-model="password" type="password" required minlength="6" class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
      </div>

      <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>
      <p v-if="info" class="text-sm text-emerald-600">{{ info }}</p>

      <button
        type="submit" :disabled="loading"
        class="w-full bg-indigo-600 text-white rounded-md py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        {{ loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link' }}
      </button>

      <div class="text-center text-xs text-slate-500 space-x-2">
        <button v-if="mode !== 'login'" type="button" class="text-indigo-600 hover:underline" @click="switchMode('login')">Back to sign in</button>
        <template v-else>
          <button type="button" class="text-indigo-600 hover:underline" @click="switchMode('forgot')">Forgot password?</button>
          <span>&middot;</span>
          <button type="button" class="text-indigo-600 hover:underline" @click="switchMode('register')">Sign up</button>
        </template>
      </div>
    </form>
  </div>
</template>
