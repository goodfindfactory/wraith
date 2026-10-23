(() => {
  if (globalThis.__tabWraithLoaded) return;
  globalThis.__tabWraithLoaded = true;

  const PREFIX = { 1: '👻 ', 2: '☠️ ' };
  const STRIP = /^(?:👻|☠️?)\s*/u;
  let stage = 0;
  let baseTitle = null;
  let titleObs = null;
  let overlay = null;      // { host, root, ageEl }
  let idleSince = Date.now();
  let soundOn = true;
  let moaned = false;
  let audioCtx = null;

  // Filters go on <body> so our overlay (a child of <html>) stays crisp.
  const CSS = `
    html.tw-ever > body { transition: filter 4s ease; }
    html.tw-stage-1 > body { filter: grayscale(.9) brightness(.82) contrast(.95); }
    html.tw-stage-2 > body { filter: grayscale(1) brightness(.6); animation: tw-flicker 5s infinite; }
    @keyframes tw-flicker {
      0%, 88%, 100% { filter: grayscale(1) brightness(.6); }
      89% { filter: grayscale(1) brightness(.25); }
      90% { filter: grayscale(1) brightness(.7); }
      92% { filter: grayscale(1) brightness(.2); }
      94% { filter: grayscale(1) brightness(.6); }
    }
    @media (prefers-reduced-motion: reduce) { html.tw-stage-2 > body { animation: none; } }
  `;

  function ensureStyle() {
    if (document.getElementById('tab-wraith-style')) return;
    const el = document.createElement('style');
    el.id = 'tab-wraith-style';
    el.textContent = CSS;
    (document.head || document.documentElement).appendChild(el);
  }

  // ---------- title ----------
  function applyTitle() {
    if (stage === 0) {
      titleObs?.disconnect();
      titleObs = null;
      if (baseTitle !== null) document.title = baseTitle;
      baseTitle = null;
      return;
    }
    if (baseTitle === null) baseTitle = document.title.replace(STRIP, '');
    const want = PREFIX[stage] + baseTitle;
    if (document.title !== want) document.title = want;
    const el = document.querySelector('title');
    if (!titleObs && el) {
      titleObs = new MutationObserver(() => {
        if (stage === 0 || document.title.startsWith(PREFIX[stage])) return;
        baseTitle = document.title.replace(STRIP, '');
        document.title = PREFIX[stage] + baseTitle;
      });
      titleObs.observe(el, { childList: true, characterData: true, subtree: true });
    }
  }

  // ---------- sound ----------
  function moan() {
    if (!soundOn || moaned) return;
    moaned = true;
    try {
      audioCtx ??= new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const t = audioCtx.currentTime;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.1, t + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 3);
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.connect(gain).connect(audioCtx.destination);
      for (const detune of [0, 7]) {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(330 + detune, t);
        osc.frequency.exponentialRampToValueAtTime(140 + detune, t + 3);
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfo.frequency.value = 5;
        lfoGain.gain.value = 12;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        osc.connect(filter);
        lfo.start(t); osc.start(t);
        lfo.stop(t + 3.1); osc.stop(t + 3.1);
      }
    } catch {}
  }

  // ---------- overlay ----------
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

  function updateAge() {
    if (overlay) overlay.ageEl.textContent = `Forgotten for ${fmtAge(Date.now() - idleSince)}.`;
  }

  function onKey(e) {
    if (e.key === 'Escape' && overlay) { e.stopPropagation(); doSpare(); }
  }

  function showOverlay() {
    if (overlay) { updateAge(); return; }
    const host = document.createElement('tab-wraith-overlay');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .veil { position: fixed; inset: 0; display: grid; place-items: center;
          background: radial-gradient(circle at 50% 40%, rgba(46,16,101,.55), rgba(5,3,12,.88));
          backdrop-filter: blur(3px); animation: fade 1.2s ease both;
          font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #ede9fe; }
        .card { width: min(420px, calc(100vw - 40px)); padding: 32px 28px 22px; text-align: center;
          background: rgba(18,10,36,.92); border: 1px solid rgba(167,139,250,.35); border-radius: 22px;
          box-shadow: 0 0 60px rgba(124,58,237,.35); animation: rise .9s cubic-bezier(.2,.8,.2,1) both; }
        .ghost { font-size: 64px; line-height: 1; animation: float 3s ease-in-out infinite;
          filter: drop-shadow(0 0 18px rgba(196,181,253,.8)); }
        .eyebrow { margin: 14px 0 2px; font-size: 11px; letter-spacing: .25em; text-transform: uppercase; color: #a78bfa; }
        h1 { margin: 0 0 10px; font-size: 30px; font-weight: 700; color: #fff; }
        .title { margin: 0 0 4px; color: #ddd6fe; font-style: italic; overflow: hidden; text-overflow: ellipsis;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .age { margin: 0 0 22px; color: #a1a1aa; font-size: 13px; }
        .row { display: flex; gap: 10px; }
        button { flex: 1; padding: 12px 14px; border-radius: 12px; font: inherit; font-weight: 600; cursor: pointer;
          border: 1px solid rgba(167,139,250,.4); transition: transform .15s, background .15s; }
        button:hover { transform: translateY(-1px); }
        button:focus-visible { outline: 2px solid #c4b5fd; outline-offset: 2px; }
        button:disabled { opacity: .6; cursor: default; transform: none; }
        .bury { background: #7c3aed; color: #fff; border-color: #7c3aed; }
        .bury:hover { background: #6d28d9; }
        .spare { background: transparent; color: #ede9fe; }
        .spare:hover { background: rgba(167,139,250,.12); }
        .foot { margin: 16px 0 0; font-size: 11px; color: #71717a; letter-spacing: .05em; }
        @keyframes fade { from { opacity: 0; } }
        @keyframes rise { from { opacity: 0; transform: translateY(24px) scale(.97); } }
        @keyframes float { 50% { transform: translateY(-8px); } }
        @media (prefers-reduced-motion: reduce) { .veil, .card, .ghost { animation: none; } }
      </style>
      <div class="veil">
        <div class="card" role="dialog" aria-modal="true" aria-labelledby="tw-h">
          <div class="ghost" aria-hidden="true">👻</div>
          <p class="eyebrow">This tab has been haunted</p>
          <h1 id="tw-h">Bury me?</h1>
          <p class="title"></p>
          <p class="age"></p>
          <div class="row">
            <button class="bury" type="button">🪦 Bury</button>
            <button class="spare" type="button">Spare me</button>
          </div>
          <p class="foot">TAB WRAITH · ESC TO SPARE</p>
        </div>
      </div>`;
    root.querySelector('.title').textContent = baseTitle || location.hostname;
    const buryBtn = root.querySelector('.bury');
    buryBtn.addEventListener('click', async () => {
      buryBtn.disabled = true;
      buryBtn.textContent = 'Burying…';
      try { await chrome.runtime.sendMessage({ type: 'bury' }); } catch { removeOverlay(); }
    });
    root.querySelector('.spare').addEventListener('click', doSpare);
    document.documentElement.appendChild(host);
    overlay = { host, root, ageEl: root.querySelector('.age') };
    updateAge();
    window.addEventListener('keydown', onKey, true);
    if (document.visibilityState === 'visible') {
      moan();
      buryBtn.focus({ preventScroll: true });
    }
  }

  function removeOverlay() {
    if (!overlay) return;
    overlay.host.remove();
    overlay = null;
    window.removeEventListener('keydown', onKey, true);
  }

  async function doSpare() {
    setStage(0);
    try { await chrome.runtime.sendMessage({ type: 'spare' }); } catch {}
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && stage === 2 && overlay) {
      updateAge();
      moan();
      overlay.root.querySelector('.bury')?.focus({ preventScroll: true });
    }
  });

  // ---------- stage control ----------
  function setStage(next, idleMs = 0, sound = true) {
    next = Number(next) || 0;
    soundOn = sound !== false;
    if (next > 0) idleSince = Date.now() - idleMs;
    ensureStyle();
    const root = document.documentElement;
    root.classList.add('tw-ever');
    root.classList.toggle('tw-stage-1', next === 1);
    root.classList.toggle('tw-stage-2', next === 2);
    if (next !== 2) moaned = false;
    stage = next;
    applyTitle();
    if (next === 2) showOverlay(); else removeOverlay();
  }

  // ---------- snapshot + resurrection ----------
  function snapshot() {
    const meta = document.querySelector('meta[name="description"], meta[property="og:description"]')?.content || '';
    const body = (document.body?.innerText || '').slice(0, 1500);
    return {
      title: (baseTitle ?? document.title).replace(STRIP, ''),
      scrollY: Math.round(window.scrollY),
      snippet: `${meta} ${body}`.replace(/\s+/g, ' ').trim().slice(0, 500)
    };
  }

  async function restoreScroll(y) {
    for (let i = 0; i < 12; i++) {
      window.scrollTo({ top: y, behavior: 'instant' });
      if (Math.abs(window.scrollY - y) < 5) return;
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case 'haunt': setStage(msg.stage, msg.idleMs, msg.sound); sendResponse({ ok: true }); break;
      case 'snapshot': sendResponse(snapshot()); break;
      case 'restoreScroll': restoreScroll(msg.y); sendResponse({ ok: true }); break;
      default: sendResponse({ ok: false });
    }
  });
})();
