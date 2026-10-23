const $ = (s) => document.querySelector(s);

async function load() {
  const s = await getSettings();
  $('#threshold').value = s.thresholdMin;
  $('#demo').checked = s.demoMode;
  $('#sound').checked = s.sound;
  $('#never').value = s.neverHaunt.join('\n');
  $('#key').value = s.apiKey;
  $('#model').value = s.model;
}

function flash(text) {
  $('#status').textContent = text;
  setTimeout(() => { $('#status').textContent = ''; }, 2500);
}

$('#save').addEventListener('click', async () => {
  const raw = parseInt($('#threshold').value, 10);
  const threshold = Number.isFinite(raw) ? Math.min(1440, Math.max(1, raw)) : WRAITH_DEFAULTS.thresholdMin;
  const neverHaunt = $('#never').value.split(/[\s,]+/)
    .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);
  await saveSettings({
    thresholdMin: threshold,
    demoMode: $('#demo').checked,
    sound: $('#sound').checked,
    neverHaunt: [...new Set(neverHaunt)],
    apiKey: $('#key').value.trim(),
    model: $('#model').value.trim() || WRAITH_DEFAULTS.model
  });
  $('#threshold').value = threshold;
  await chrome.runtime.sendMessage({ type: 'tick' });
  flash('Saved. The wraith obeys.');
});

$('#clear').addEventListener('click', async () => {
  const btn = $('#clear');
  if (!btn.dataset.armed) {
    btn.dataset.armed = '1';
    btn.textContent = 'Click again to confirm';
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Empty the graveyard'; }, 3000);
    return;
  }
  await chrome.storage.local.set({ graveyard: [] });
  delete btn.dataset.armed;
  btn.textContent = 'Empty the graveyard';
  flash('The graveyard is empty.');
});

load();
