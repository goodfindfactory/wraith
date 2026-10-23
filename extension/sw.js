importScripts('util.js');

const ALARM = 'wraith-tick';
const DEMO_MS = 30_000;

// ---------- state (always in storage; the worker can die at any time) ----------
async function getState() {
  const s = await chrome.storage.session.get(['lastActive', 'born', 'stages', 'pendingScroll', 'activeByWindow']);
  return {
    lastActive: s.lastActive || {}, born: s.born || {}, stages: s.stages || {},
    pendingScroll: s.pendingScroll || {}, activeByWindow: s.activeByWindow || {}
  };
}
async function saveState(st) { await chrome.storage.session.set(st); }

// Serialize graveyard writes so parallel epitaphs don't clobber each other.
let gLock = Promise.resolve();
function withGraveLock(fn) { const p = gLock.then(fn, fn); gLock = p.catch(() => {}); return p; }

async function ensureAlarm() {
  if (!(await chrome.alarms.get(ALARM))) await chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
}

// ---------- lifecycle ----------
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({ settings: WRAITH_DEFAULTS, graveyard: [], stats: { totalBuried: 0, resurrected: 0 } });
  }
  await ensureAlarm();
  await injectExisting();
  await tick();
});
chrome.runtime.onStartup.addListener(ensureAlarm);
ensureAlarm();

chrome.alarms.onAlarm.addListener(async (a) => { if (a.name === ALARM) await tick(); });

async function injectExisting() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(tabs.map(async (t) => {
    try { await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }); } catch {}
  }));
}

// ---------- rules ----------
function isHauntable(tab, s) {
  if (!tab.url || !/^https?:\/\//.test(tab.url)) return false; // skips chrome://, Web Store, extension pages
  if (tab.pinned || tab.audible) return false;
  const host = hostOf(tab.url);
  return !s.neverHaunt.some((h) => h && (host === h || host.endsWith('.' + h)));
}

async function sendToTab(tabId, msg) {
  try { return await chrome.tabs.sendMessage(tabId, msg); } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch { return null; }
  }
}

async function updateBadge(stages) {
  const n = Object.values(stages).filter((v) => v >= 1).length;
  await chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' });
  await chrome.action.setBadgeText({ text: n ? String(n) : '' });
}

// ---------- the Watcher + the Haunting ----------
async function tick() {
  const [s, st, tabs] = await Promise.all([getSettings(), getState(), chrome.tabs.query({})]);
  const now = Date.now();
  const t = s.demoMode ? DEMO_MS : Math.max(1, Number(s.thresholdMin) || 30) * 60_000;
  const live = new Set();
  const sends = [];

  for (const tab of tabs) {
    const id = String(tab.id);
    live.add(id);
    st.lastActive[id] ??= now;
    st.born[id] ??= now;
    const prev = st.stages[id] || 0;
    let stage = 0;

    if (!isHauntable(tab, s)) {
      st.lastActive[id] = now; // protected tabs never accumulate decay
    } else if (tab.active) {
      stage = prev === 2 ? 2 : 0; // a full wraith waits for your answer
      if (stage === 0) st.lastActive[id] = now;
    } else {
      const idle = now - st.lastActive[id];
      stage = idle >= 2 * t ? 2 : idle >= t ? 1 : 0;
    }

    if (stage !== prev) {
      st.stages[id] = stage;
      sends.push(sendToTab(tab.id, { type: 'haunt', stage, idleMs: now - st.lastActive[id], sound: s.sound }));
    }
  }

  for (const key of ['lastActive', 'born', 'stages']) {
    for (const id of Object.keys(st[key])) if (!live.has(id)) delete st[key][id];
  }
  await saveState({ lastActive: st.lastActive, born: st.born, stages: st.stages });
  await Promise.all(sends);
  await updateBadge(st.stages);
}

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const st = await getState();
  const now = Date.now();
  const id = String(tabId);
  const prevId = st.activeByWindow[windowId];
  if (prevId) st.lastActive[prevId] = now; // decay starts the moment you leave
  st.activeByWindow[windowId] = id;
  st.lastActive[id] = now;
  if ((st.stages[id] || 0) === 1) {          // looking at a fading tab revives it
    st.stages[id] = 0;
    await sendToTab(tabId, { type: 'haunt', stage: 0 });
  }
  await saveState({ lastActive: st.lastActive, activeByWindow: st.activeByWindow, stages: st.stages });
  await updateBadge(st.stages);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (!tab) return;
  const st = await getState();
  st.lastActive[String(tab.id)] = Date.now();
  await saveState({ lastActive: st.lastActive });
});

chrome.tabs.onCreated.addListener(async (tab) => {
  const st = await getState();
  const now = Date.now();
  st.born[String(tab.id)] = now;
  st.lastActive[String(tab.id)] = now;
  await saveState({ born: st.born, lastActive: st.lastActive });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const st = await getState();
  const id = String(tabId);
  delete st.lastActive[id]; delete st.born[id]; delete st.stages[id]; delete st.pendingScroll[id];
  await saveState(st);
  await updateBadge(st.stages);
});

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  const st = await getState();
  const id = String(tabId);
  if (st.pendingScroll[id] != null) {
    await sendToTab(tabId, { type: 'restoreScroll', y: st.pendingScroll[id] });
    delete st.pendingScroll[id];
    await saveState({ pendingScroll: st.pendingScroll });
  }
  const stage = st.stages[id] || 0;
  if (stage > 0) {
    const s = await getSettings();
    await sendToTab(tabId, { type: 'haunt', stage, idleMs: Date.now() - (st.lastActive[id] || Date.now()), sound: s.sound });
  }
});

// ---------- the Burial + the Epitaph ----------
const TEMPLATES = [
  (g) => `Here lies "${g.short}". Opened with hope, abandoned in silence.`,
  (g) => `${g.host} rests here. It waited ${g.idle} for you to come back.`,
  (g) => `Gone but not bookmarked: "${g.short}".`,
  (g) => `Here lies a tab you swore you'd read later. Later never came.`,
  (g) => `"${g.short}" loaded perfectly and was never looked at again.`,
  (g) => `It lived ${g.life}. It asked for nothing but your attention.`,
  (g) => `Beloved by no one, closed by a ghost: "${g.short}".`
];

function templateEpitaph(grave) {
  const ctx = {
    short: grave.title.length > 48 ? grave.title.slice(0, 45) + '…' : grave.title,
    host: grave.host || 'A website',
    idle: fmtAge(grave.buriedAt - grave.lastSeenAt),
    life: fmtAge(grave.buriedAt - grave.bornAt)
  };
  let h = 0;
  for (const c of grave.url) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TEMPLATES[h % TEMPLATES.length](ctx);
}

async function aiEpitaph(grave, snippet, s) {
  if (!s.apiKey) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': s.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: s.model || WRAITH_DEFAULTS.model,
        max_tokens: 80,
        system: 'You write epitaphs for abandoned browser tabs. One line, at most 18 words, darkly funny and specific to the page, like a tombstone inscription. No emoji, no hashtags, no surrounding quotation marks. Output only the epitaph.',
        messages: [{
          role: 'user',
          content: `Title: ${grave.title}\nSite: ${grave.host}\nOpen for: ${fmtAge(grave.buriedAt - grave.bornAt)}\nUntouched for: ${fmtAge(grave.buriedAt - grave.lastSeenAt)}\nPage excerpt: ${snippet || '(none)'}`
        }]
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim()
      .replace(/^["'“”]+|["'“”]+$/g, '');
    return text ? text.slice(0, 160) : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

async function buryTab(tabId) {
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { return; }
  const snap = (await sendToTab(tabId, { type: 'snapshot' })) || {};
  const st = await getState();
  const now = Date.now();
  const id = String(tabId);
  const grave = {
    id: crypto.randomUUID(),
    title: (snap.title || tab.title || tab.url).replace(/^(?:👻|☠️?)\s*/u, '') || tab.url,
    url: tab.url,
    host: hostOf(tab.url),
    favIconUrl: tab.favIconUrl || '',
    scrollY: snap.scrollY || 0,
    bornAt: Math.min(st.born[id] || now, st.lastActive[id] || now),
    lastSeenAt: st.lastActive[id] || now,
    buriedAt: now,
    epitaph: null,
    epitaphSource: 'pending'
  };

  await withGraveLock(async () => {
    const { graveyard = [], stats = { totalBuried: 0, resurrected: 0 } } = await chrome.storage.local.get(['graveyard', 'stats']);
    graveyard.unshift(grave);
    stats.totalBuried = (stats.totalBuried || 0) + 1;
    await chrome.storage.local.set({ graveyard: graveyard.slice(0, 500), stats });
  });

  try { await chrome.tabs.remove(tabId); } catch {}

  const s = await getSettings();
  const ai = await aiEpitaph(grave, snap.snippet, s);
  const epitaph = ai || templateEpitaph(grave);
  await withGraveLock(async () => {
    const { graveyard = [] } = await chrome.storage.local.get('graveyard');
    const g = graveyard.find((x) => x.id === grave.id);
    if (g) { g.epitaph = epitaph; g.epitaphSource = ai ? 'ai' : 'template'; await chrome.storage.local.set({ graveyard }); }
  });
}

async function resurrect(graveId) {
  const grave = await withGraveLock(async () => {
    const { graveyard = [], stats = {} } = await chrome.storage.local.get(['graveyard', 'stats']);
    const i = graveyard.findIndex((g) => g.id === graveId);
    if (i < 0) return null;
    const [g] = graveyard.splice(i, 1);
    stats.resurrected = (stats.resurrected || 0) + 1;
    await chrome.storage.local.set({ graveyard, stats });
    return g;
  });
  if (!grave) return false;
  const tab = await chrome.tabs.create({ url: grave.url, active: true });
  if (grave.scrollY > 0) {
    const st = await getState();
    st.pendingScroll[String(tab.id)] = grave.scrollY;
    await saveState({ pendingScroll: st.pendingScroll });
  }
  return true;
}

async function forget(graveId) {
  await withGraveLock(async () => {
    const { graveyard = [] } = await chrome.storage.local.get('graveyard');
    await chrome.storage.local.set({ graveyard: graveyard.filter((g) => g.id !== graveId) });
  });
}

async function getStats() {
  const [st, s, local] = await Promise.all([getState(), getSettings(), chrome.storage.local.get(['graveyard', 'stats'])]);
  const vals = Object.values(st.stages);
  return {
    haunted: vals.filter((v) => v === 1).length,
    wraiths: vals.filter((v) => v === 2).length,
    graves: (local.graveyard || []).length,
    totalBuried: local.stats?.totalBuried || 0,
    resurrected: local.stats?.resurrected || 0,
    demoMode: s.demoMode,
    hasKey: !!s.apiKey
  };
}

async function exorcise() {
  const st = await getState();
  const ids = Object.entries(st.stages).filter(([, v]) => v === 2).map(([k]) => Number(k));
  await Promise.all(ids.map(buryTab));
  return ids.length;
}

async function spare(tabId) {
  const st = await getState();
  const id = String(tabId);
  st.lastActive[id] = Date.now();
  st.stages[id] = 0;
  await saveState({ lastActive: st.lastActive, stages: st.stages });
  await sendToTab(tabId, { type: 'haunt', stage: 0 });
  await updateBadge(st.stages);
}

// ---------- messages ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'bury': if (sender.tab) await buryTab(sender.tab.id); return { ok: true };
        case 'spare': if (sender.tab) await spare(sender.tab.id); return { ok: true };
        case 'tick': await tick(); return { ok: true };
        case 'getStats': return await getStats();
        case 'exorcise': return { buried: await exorcise() };
        case 'resurrect': return { ok: await resurrect(msg.id) };
        case 'forget': await forget(msg.id); return { ok: true };
        default: return { ok: false };
      }
    } catch (e) { return { ok: false, error: String(e) }; }
  })().then(sendResponse);
  return true;
});
