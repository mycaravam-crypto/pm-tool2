import { onBeforeUnmount, ref } from 'vue';

// Polls GET /version (see server/index.js) so an already-open tab can notice
// a deploy happened without the user having to refresh blind. Deliberately
// never reloads by itself — see UpdateBanner.vue, which only reloads on an
// explicit click. Auto-reloading mid-edit would blow away unsaved input.
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function useVersionCheck() {
  const updateAvailable = ref(false);
  let knownCommit = null;
  let timer = null;

  async function poll() {
    let commit;
    try {
      const res = await fetch('/version');
      if (!res.ok) return;
      ({ commit } = await res.json());
    } catch {
      return; // Transient network hiccup — just try again next interval.
    }
    if (knownCommit === null) {
      knownCommit = commit;
    } else if (commit !== knownCommit) {
      updateAvailable.value = true;
    }
  }

  poll();
  timer = setInterval(poll, POLL_INTERVAL_MS);
  onBeforeUnmount(() => clearInterval(timer));

  return { updateAvailable };
}
