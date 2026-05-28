// Phase 2 dashboard — shared helpers.
// No framework. Loaded as an ES module by savings.html / token-economy.html / scalability.html.

const KEY_STORAGE = 'eam-api-key';
const TENANT_STORAGE = 'eam-tenant';
const DEFAULT_TENANT = 'pilot';

export function getKey() { return localStorage.getItem(KEY_STORAGE); }
export function getTenant() { return localStorage.getItem(TENANT_STORAGE) || DEFAULT_TENANT; }
export function setKey(k) { localStorage.setItem(KEY_STORAGE, k); }
export function setTenant(t) { localStorage.setItem(TENANT_STORAGE, t); }
export function clearKey() { localStorage.removeItem(KEY_STORAGE); }

export async function fetchEam(path) {
  const key = getKey();
  if (!key) throw new Error('NO_KEY');
  const tenant = getTenant();

  const headers = { 'x-api-key': key, 'x-tenant-id': tenant };
  const doFetch = () => fetch(path, { headers });

  let res = await doFetch();
  if (res.status === 401) { clearKey(); requireKey(); throw new Error('BAD_KEY'); }
  if (!res.ok && res.status >= 500) {
    await new Promise((r) => setTimeout(r, 500));
    res = await doFetch();
  }
  if (!res.ok) throw new Error(`API ${res.status}`);
  const body = await res.json();
  return body.data;
}

export function pollEvery(ms, fn) {
  const run = async () => {
    if (document.hidden) return;
    try { await fn(); } catch (e) { console.warn('[eam]', e); }
  };
  run();
  return setInterval(run, ms);
}

export function requireKey() {
  if (getKey()) return;
  if (document.getElementById('eam-key-modal')) return;
  const modal = document.createElement('div');
  modal.className = 'eam-modal';
  modal.id = 'eam-key-modal';
  modal.innerHTML = `
    <div class="eam-modal-content">
      <h2>API key required</h2>
      <p>Paste your <code>eam-mcp</code> API key (prefix is your name).</p>
      <input type="password" id="eam-key-input" placeholder="roey-..." autocomplete="off" />
      <label class="eam-tenant-label">Tenant:
        <input type="text" id="eam-tenant-input" value="${getTenant()}" />
      </label>
      <button id="eam-key-submit">Save</button>
    </div>`;
  document.body.appendChild(modal);
  const submit = () => {
    const v = document.getElementById('eam-key-input').value.trim();
    const t = document.getElementById('eam-tenant-input').value.trim() || DEFAULT_TENANT;
    if (v) { setKey(v); setTenant(t); modal.remove(); location.reload(); }
  };
  document.getElementById('eam-key-submit').onclick = submit;
  document.getElementById('eam-key-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}

const numFmt = new Intl.NumberFormat('en-US');
const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function fmtNumber(n) { return numFmt.format(Math.round(Number(n) || 0)); }
export function fmtUsd(n)    { return usdFmt.format(Number(n) || 0); }
export function fmtRatio(n)  { return `${(Number(n) || 0).toFixed(1)} : 1`; }
export function fmtPct(n)    { return `${(Number(n) || 0).toFixed(1)}%`; }

export function mkLineChart(canvas, labels, series, label = '') {
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new window.Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [{ data: series, label, fill: false, borderColor: '#3b82f6', tension: 0.2 }] },
    options: {
      animation: false,
      plugins: { legend: { display: !!label } },
      scales: { y: { beginAtZero: true } },
    },
  });
  return canvas._chart;
}

export function mkHistogram(canvas, buckets) {
  if (canvas._chart) canvas._chart.destroy();
  canvas._chart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: buckets.map((b) => b.bucket),
      datasets: [{ data: buckets.map((b) => b.count), backgroundColor: '#3b82f6' }],
    },
    options: { animation: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });
  return canvas._chart;
}

export function table(tbodyEl, headers, rows) {
  const head = `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  tbodyEl.innerHTML = head + body;
}
