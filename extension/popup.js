const $ = (s) => document.querySelector(s);
let confirmTimer = null;

async function render() {
  const s = await chrome.runtime.sendMessage({ type: 'getStats' });
  if (!s) return;
  $('#haunted').textContent = s.haunted;
  $('#wraiths').textContent = s.wraiths;
  $('#graves').textContent = s.graves;
  $('#demo').checked = s.demoMode;
  $('#keyNote').hidden = s.hasKey;
  $('#lifetime').textContent = s.totalBuried
    ? `${s.totalBuried} buried all time · ${s.resurrected} resurrected`
    : 'No tabs buried yet. Leave some alone and watch.';
  const ex = $('#exorcise');
  if (!confirmTimer) {
    ex.disabled = s.wraiths === 0;
    ex.textContent = s.wraiths ? `Exorcise ${s.wraiths} wraith${s.wraiths === 1 ? '' : 's'}` : 'No wraiths to exorcise';
  }
}

$('#demo').addEventListener('change', async (e) => {
  await saveSettings({ demoMode: e.target.checked });
  await chrome.runtime.sendMessage({ type: 'tick' });
  await render();
});

$('#exorcise').addEventListener('click', async () => {
  const btn = $('#exorcise');
  if (!confirmTimer) {
    btn.textContent = 'Click again to bury them all';
    confirmTimer = setTimeout(() => { confirmTimer = null; render(); }, 3000);
    return;
  }
  clearTimeout(confirmTimer);
  confirmTimer = null;
  btn.disabled = true;
  btn.textContent = 'Burying…';
  const res = await chrome.runtime.sendMessage({ type: 'exorcise' });
  btn.textContent = `Buried ${res?.buried ?? 0}`;
  setTimeout(render, 1200);
});

$('#graveyard').addEventListener('click', () => chrome.tabs.create({ url: 'graveyard.html' }));
$('#settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#addKey').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

$('#protect').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = hostOf(tab?.url || '');
  const btn = $('#protect');
  if (!host || !/^https?:/.test(tab.url)) { btn.textContent = 'This page can\u2019t be haunted anyway'; return; }
  const s = await getSettings();
  if (!s.neverHaunt.includes(host)) await saveSettings({ neverHaunt: [...s.neverHaunt, host] });
  await chrome.runtime.sendMessage({ type: 'tick' });
  btn.textContent = `✓ ${host} is protected`;
  btn.disabled = true;
});

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = hostOf(tab?.url || '');
  const s = await getSettings();
  if (host && s.neverHaunt.includes(host)) { $('#protect').textContent = `✓ ${host} is protected`; $('#protect').disabled = true; }
  await chrome.runtime.sendMessage({ type: 'tick' });
  await render();
})();
