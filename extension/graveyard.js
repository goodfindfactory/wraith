const grid = document.getElementById('grid');
const search = document.getElementById('search');

function stone(g) {
  const el = document.createElement('article');
  el.className = 'stone';

  const rip = document.createElement('div');
  rip.className = 'rip';
  rip.textContent = 'R · I · P';

  const head = document.createElement('div');
  head.className = 'head';
  if (g.favIconUrl && /^https?:|^data:/.test(g.favIconUrl)) {
    const img = document.createElement('img');
    img.src = g.favIconUrl;
    img.alt = '';
    img.addEventListener('error', () => img.remove());
    head.append(img);
  }
  const host = document.createElement('span');
  host.className = 'meta';
  host.textContent = g.host;
  head.append(host);

  const h2 = document.createElement('h2');
  h2.textContent = g.title;
  h2.title = g.url;

  const ep = document.createElement('p');
  ep.className = 'epitaph' + (g.epitaph ? '' : ' pending');
  ep.style.margin = '0';
  ep.textContent = g.epitaph || 'The ghost is carving the inscription…';

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `Lived ${fmtAge(g.buriedAt - g.bornAt)} · Buried ${fmtAge(Date.now() - g.buriedAt)} ago`;

  const actions = document.createElement('div');
  actions.className = 'actions';
  const res = document.createElement('button');
  res.className = 'primary';
  res.textContent = '✨ Resurrect';
  res.addEventListener('click', async () => {
    res.disabled = true;
    await chrome.runtime.sendMessage({ type: 'resurrect', id: g.id });
  });
  const forget = document.createElement('button');
  forget.className = 'danger';
  forget.textContent = 'Forget';
  forget.addEventListener('click', async () => {
    if (forget.dataset.armed) { await chrome.runtime.sendMessage({ type: 'forget', id: g.id }); return; }
    forget.dataset.armed = '1';
    forget.textContent = 'Sure?';
    setTimeout(() => { delete forget.dataset.armed; forget.textContent = 'Forget'; }, 2500);
  });
  actions.append(res, forget);

  el.append(rip, head, h2, ep, meta, actions);
  if (g.epitaphSource === 'ai') {
    const b = document.createElement('div');
    b.className = 'badge';
    b.textContent = 'Written by the wraith';
    el.insertBefore(b, meta);
  }
  return el;
}

async function render() {
  const { graveyard = [], stats = {} } = await chrome.storage.local.get(['graveyard', 'stats']);
  const q = search.value.trim().toLowerCase();
  const list = q
    ? graveyard.filter((g) => `${g.title} ${g.url} ${g.epitaph || ''}`.toLowerCase().includes(q))
    : graveyard;

  document.getElementById('count').textContent =
    `${graveyard.length} resting here · ${stats.resurrected || 0} resurrected`;
  grid.replaceChildren(...list.map(stone));

  const empty = document.getElementById('empty');
  empty.hidden = list.length > 0;
  if (!list.length && q) {
    document.getElementById('emptyTitle').textContent = 'No grave matches.';
    document.getElementById('emptyText').textContent = 'Try another word. The dead are patient.';
  } else if (!list.length) {
    document.getElementById('emptyTitle').textContent = 'The ground is undisturbed.';
    document.getElementById('emptyText').textContent = 'Leave a few tabs alone. The wraith will find them.';
  }
}

search.addEventListener('input', render);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.graveyard || changes.stats)) render();
});
render();
