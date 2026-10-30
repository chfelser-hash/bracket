// Gemeinsame Bausteine der Ansichten
import { h } from '../ui.js';
import { state, now } from '../app.js';
import { groupName } from '../turnier.js';

export const fmtTime = (ms) => new Date(ms).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${Number(d)}.${Number(m)}.${y}`; };
export const fmtDur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };

/** Kurzer Text, wann etwas ist: «in 12 min», «läuft seit 5 min», «vor 3 min» */
export function relTime(slot) {
  const t = now();
  if (slot.status === 'running') return `läuft seit ${fmtDur(t - slot.start)}`;
  if (slot.status === 'done') return '';
  const d = slot.start - t;
  if (d <= 60000) return 'jetzt';
  if (d < 90 * 60000) return `in ${fmtDur(d)}`;
  return '';
}

export const isMine = (m) => !!state.me && (m.a === state.me || m.b === state.me);

/** Wo wird gespielt: «Tisch 2» oder (bei einer Station) leer */
export function stationName(game, slot) {
  if (!game || slot?.station == null) return '';
  return game.stations?.[slot.station] || `Station ${slot.station + 1}`;
}

/** Bezeichnung des Matches: «Gruppe A», «Halbfinal 1», «Final» */
export function matchTitle(m) {
  if (m.phase === 'group') return `Gruppe ${groupName(m.group)}`;
  if (m.third || m.roundName === 'Final') return m.roundName;
  return `${m.roundName} ${m.num}`;
}

export function gameTag(c, gameId) {
  const g = c.game(gameId);
  return h('span', { class: 'game-tag', style: { '--c': c.color(gameId) } }, g?.name || '?');
}

/** Spielername oder Platzhalter («1. Gruppe A») */
export function side(c, m, which) {
  const id = m[which];
  if (id) return h('span', { class: 'pl' + (id === state.me ? ' me' : '') + (winnerOf(m) === id ? ' won' : '') }, c.name(id));
  return h('span', { class: 'pl tbd' }, m[which === 'a' ? 'labelA' : 'labelB'] || 'offen');
}

export function winnerOf(m) {
  const r = m.result;
  if (!r || r.a === r.b) return null;
  return r.a > r.b ? m.a : m.b;
}

export const scoreText = (r) => (r ? `${r.a} : ${r.b}` : '');

export const section = (title, ...children) => h('section', { class: 'block' }, title ? h('h2', null, title) : null, ...children);

export function empty(text, action) {
  return h('div', { class: 'empty-state' }, h('p', null, text), action || null);
}
