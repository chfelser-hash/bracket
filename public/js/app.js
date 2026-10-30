// Bracket – Oberfläche: Zustand, Server-Abgleich, Navigation, PIN.
import { h, toast, modal, confirmDialog, closeDialogOf } from './ui.js';
import { schedule, baseTime } from './turnier.js';
import { renderJetzt } from './views/jetzt.js';
import { renderPlan } from './views/plan.js';
import { renderTabellen } from './views/tabellen.js';
import { renderSetup } from './views/setup.js';
import { renderTv } from './views/tv.js';

const ROUTES = {
  jetzt: { label: 'Jetzt', icon: '●', render: renderJetzt },
  plan: { label: 'Zeitplan', icon: '◷', render: renderPlan },
  tabellen: { label: 'Tabellen', icon: '▤', render: renderTabellen },
  setup: { label: 'Setup', icon: '⚙', render: renderSetup },
};

const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ohne Speicher */ } return null; };

export const state = {
  data: null,
  offset: 0, // Uhr des Servers minus eigene Uhr
  me: store('bracket-me') || '',
  online: true,
  dirty: false,
};

export const now = () => Date.now() + state.offset;
export const route = () => (location.hash.slice(1).split('/')[0] || 'jetzt');

// ---------- Server ----------
async function rawFetch(method, url, body) {
  return fetch(url, {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Bracket': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
}

/**
 * API-Aufruf. Meldet der Server einen Konflikt, der sich bestätigen lässt (z.B. «neu auslosen»),
 * wird nachgefragt und mit force wiederholt. Liefert null, wenn abgebrochen wurde.
 */
export async function api(method, url, body, opts = {}) {
  let res;
  try {
    res = await rawFetch(method, url, body);
  } catch {
    setOnline(false);
    throw new Error('Keine Verbindung zum Bracket-Server');
  }
  setOnline(true);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (res.status === 409 && data?.needsForce) {
    const ok = await confirmDialog(opts.confirmTitle || 'Bist du sicher?', data.error, opts.confirmLabel || 'Trotzdem', true);
    if (!ok) return null;
    if (method === 'DELETE') return api(method, url + (url.includes('?') ? '&' : '?') + 'force=1', undefined, opts);
    return api(method, url, { ...(body || {}), force: true }, opts);
  }
  if (res.status === 401 && method !== 'GET' && !url.startsWith('/api/unlock') && !url.startsWith('/api/setup')) {
    if (state.data) state.data.canEdit = false;
    const ok = await askPin();
    if (ok) return api(method, url, body, opts);
    return null;
  }
  if (!res.ok) throw new Error(data?.error || 'Fehler ' + res.status);
  return data;
}

/** API-Aufruf mit Fehlermeldung als Toast; lädt danach die Daten neu */
export async function act(method, url, body, opts = {}) {
  try {
    const r = await api(method, url, body, opts);
    if (r === null) return null;
    await refresh(true);
    if (opts.done) toast(opts.done);
    return r;
  } catch (e) {
    toast(e.message, { error: true });
    return null;
  }
}

function setOnline(v) {
  if (state.online === v) return;
  state.online = v;
  document.body.classList.toggle('offline', !v);
}

let polling = null;
export async function refresh(force = false) {
  const d = state.data;
  const url = !force && d ? `/api/data?rev=${d.rev}&edit=${d.canEdit}` : '/api/data';
  let r;
  try {
    r = await (await rawFetch('GET', url)).json();
    setOnline(true);
  } catch {
    setOnline(false);
    return;
  }
  const sent = Date.now();
  if (r.serverTime) state.offset = r.serverTime - sent;
  if (r.same) return;
  state.data = r;
  render();
}

function startPolling() {
  clearInterval(polling);
  const ms = route() === 'tv' ? 3000 : 5000;
  polling = setInterval(() => { if (!document.hidden) refresh(); }, ms);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

// ---------- Berechnete Sicht (Zeitplan, Tabellen) ----------
let ctxCache = null;
export function ctx() {
  const d = state.data;
  const minute = Math.floor(now() / 60000);
  if (ctxCache && ctxCache.rev === d.rev && ctxCache.minute === minute) return ctxCache;
  const t = d.tournament;
  const base = baseTime(t);
  const sc = schedule(d, { base, now: now(), changeMin: t.changeMin, breakMin: t.breakMin });
  const players = new Map(d.players.map((p) => [p.id, p]));
  const games = new Map(d.games.map((g, i) => [g.id, { ...g, index: i }]));
  const list = sc.matches.map((m) => ({ ...m, slot: sc.slots.get(m.id), result: d.results[m.id], live: d.live[m.id] }))
    .sort((a, b) => a.slot.start - b.slot.start || a.gi - b.gi);
  ctxCache = {
    rev: d.rev, minute, base, sc, list,
    resolved: new Map(sc.resolved.map((r) => [r.game.id, r])),
    name: (id) => (id ? players.get(id)?.name || '?' : null),
    game: (id) => games.get(id),
    color: (gameId) => gameColor(games.get(gameId)?.index ?? 0),
  };
  return ctxCache;
}

const HUES = ['#f2b33d', '#4fa3ff', '#ff6b8b', '#45c48b', '#b58cff', '#ff8a3d', '#3fd0d4', '#d9e05c'];
export const gameColor = (i) => HUES[i % HUES.length];

// ---------- PIN ----------
export async function askPin() {
  if (state.data?.needsSetup) { location.hash = '#setup'; return false; }
  const input = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', name: 'pin', class: 'pin-input', placeholder: '••••', 'aria-label': 'Turnier-PIN' });
  const err = h('p', { class: 'form-error', hidden: true });
  const r = await modal('Turnier-PIN', h('div', null,
    h('p', null, 'Zum Eintragen braucht es die Turnier-PIN. Dieses Gerät merkt sie sich 30 Tage.'),
    input, err), [
    { label: 'Abbrechen', value: false },
    {
      label: 'Entsperren', primary: true, onClick: async () => {
        try {
          await api('POST', '/api/unlock', { pin: input.value });
          return true;
        } catch (e) {
          err.textContent = e.message;
          err.hidden = false;
          input.select();
          return false;
        }
      },
    },
  ]);
  if (r === true) { await refresh(true); toast('Entsperrt – du kannst jetzt eintragen'); return true; }
  return false;
}

export async function lockDevice() {
  await api('POST', '/api/lock');
  await refresh(true);
  toast('Gesperrt – auf diesem Gerät nur noch anschauen');
}

export function setMe(id) {
  state.me = id || '';
  store('bracket-me', id || null);
  render();
}

// ---------- Darstellung ----------
const main = () => document.getElementById('main');

export function render() {
  if (!state.data) return;
  // Läuft gerade ein Dialog (z.B. Resultat eintragen), nicht dazwischenfunken
  if (document.querySelector('dialog[open]')) { state.dirty = true; return; }
  state.dirty = false;
  const r = route();
  document.body.dataset.route = r;
  document.title = r === 'tv' ? `${state.data.tournament.name} – TV` : 'Bracket';
  if (r === 'tv') {
    document.getElementById('topbar').replaceChildren();
    document.getElementById('tabbar').replaceChildren();
    renderTv(main(), ctx());
    return;
  }
  renderTopbar(r);
  const view = ROUTES[r] || ROUTES.jetzt;
  const scroll = window.scrollY;
  const keep = main().dataset.view === r;
  main().dataset.view = r;
  view.render(main(), ctx());
  if (keep) window.scrollTo(0, scroll);
}

// Nach dem Schliessen eines Dialogs aufgeschobene Aktualisierung nachholen
new MutationObserver(() => { if (state.dirty && !document.querySelector('dialog[open]')) render(); }).observe(document.body, { childList: true });

function renderTopbar(r) {
  const d = state.data;
  const me = d.players.find((p) => p.id === state.me);
  document.getElementById('topbar').replaceChildren(
    h('a', { class: 'brand', href: '#jetzt' }, h('img', { class: 'logo', src: '/icons/icon.svg', alt: '' }), h('span', null, d.tournament.name)),
    h('span', { class: 'spacer' }),
    h('span', { class: 'conn', title: 'Keine Verbindung zum Server' }, 'offline'),
    h('button', { class: 'me-btn' + (me ? ' set' : ''), onclick: pickMe, title: 'Wer bist du? Deine Matches werden hervorgehoben.' }, me ? me.name : 'Ich bin …'),
    h('button', {
      class: 'icon-btn lock' + (d.canEdit ? ' open' : ''),
      title: d.canEdit ? 'Entsperrt – antippen zum Sperren' : 'Nur anschauen – antippen zum Entsperren',
      'aria-label': d.canEdit ? 'Gerät sperren' : 'Mit PIN entsperren',
      onclick: () => (d.canEdit ? lockDevice() : askPin()),
    }, d.canEdit ? '🔓' : '🔒')
  );
  document.getElementById('tabbar').replaceChildren(...Object.entries(ROUTES).map(([k, v]) =>
    h('a', { href: '#' + k, class: 'tab' + (k === r ? ' on' : ''), 'aria-current': k === r ? 'page' : null }, h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, v.icon), h('span', null, v.label))));
}

async function pickMe() {
  const d = state.data;
  const sel = h('div', { class: 'me-list' },
    h('button', { class: 'btn' + (!state.me ? ' primary' : ''), onclick: (e) => { closeDialogOf(e.currentTarget); setMe(''); } }, 'Niemand (alle gleich)'),
    ...d.players.map((p) => h('button', { class: 'btn' + (p.id === state.me ? ' primary' : ''), onclick: (e) => { closeDialogOf(e.currentTarget); setMe(p.id); } }, p.name)));
  await modal('Wer bist du?', h('div', null, h('p', { class: 'muted small' }, 'Deine Matches werden hervorgehoben. Wird nur auf diesem Gerät gespeichert.'), d.players.length ? sel : h('p', null, 'Noch keine Teilnehmer erfasst.')), []);
}

// ---------- Start ----------
window.addEventListener('hashchange', () => { startPolling(); window.scrollTo(0, 0); render(); });
setInterval(() => { if (!document.querySelector('dialog[open]')) render(); }, 30000); // Zeiten und «läuft seit» aktuell halten

(async function start() {
  await refresh(true);
  if (!state.data) {
    main().replaceChildren(h('p', { class: 'loading' }, 'Der Bracket-Server ist nicht erreichbar. Ich versuche es weiter …'));
    const retry = setInterval(async () => { await refresh(true); if (state.data) clearInterval(retry); }, 3000);
  }
  if (state.data?.needsSetup && route() !== 'setup') location.hash = '#setup';
  startPolling();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
