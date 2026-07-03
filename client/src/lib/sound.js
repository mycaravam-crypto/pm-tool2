// Self-contained two-tone chime via Web Audio — no audio file asset needed.
// Browsers block audio before any user gesture on the page; playNotificationSound()
// swallows that case rather than throwing, since a notification arriving before
// the user has clicked anything is a normal, harmless situation, not an error.

const STORAGE_KEY = 'chronospm_muted';
let ctx = null;
let muted = localStorage.getItem(STORAGE_KEY) === 'true';

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  localStorage.setItem(STORAGE_KEY, String(value));
}

export function playNotificationSound() {
  if (muted) return;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const start = now + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch {
    // Audio unavailable or blocked — not worth surfacing to the user.
  }
}
