// Shared helpers (service worker via importScripts, pages via <script>).
const WRAITH_DEFAULTS = {
  thresholdMin: 30,          // minutes untouched before stage 1; stage 2 at 2x
  demoMode: false,           // threshold drops to 30 seconds
  apiKey: '',                // Anthropic API key (optional)
  model: 'claude-haiku-5-5', // fast model for epitaphs
  sound: true,               // ghostly moan when the wraith confronts you
  neverHaunt: ['mail.google.com', 'calendar.google.com', 'meet.google.com', 'localhost']
};

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function fmtAge(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
}

async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  return { ...WRAITH_DEFAULTS, ...settings };
}

async function saveSettings(patch) {
  const current = await getSettings();
  await chrome.storage.local.set({ settings: { ...current, ...patch } });
}
