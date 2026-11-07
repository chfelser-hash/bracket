// Tabellen: pro Spiel die Gruppen (mit Wertungsregel), Gruppenspiele und der KO-Baum.
import { h, chips } from '../ui.js';
import { state } from '../app.js';
import { TIEBREAK_RULES, POINTS } from '../turnier.js';
import { fmtTime, isMine, matchTitle, side, empty } from './shared.js';
import { openScore } from './score.js';

export function renderTabellen(main, c) {
  const d = state.data;
  const drawn = d.games.filter((g) => c.resolved.get(g.id)?.drawn);
  if (!drawn.length) {
    main.replaceChildren(empty('Noch nichts ausgelost – Tabellen gibt es nach der Auslosung.', h('a', { class: 'btn primary', href: '#setup/auslosung' }, 'Zur Auslosung')));
    return;
  }
  let gid = location.hash.split('/')[1];
  if (!drawn.some((g) => g.id === gid)) gid = drawn[0].id;
  const body = h('div');
  const show = (id) => {
    history.replaceState(null, '', `#tabellen/${id}`);
    body.replaceChildren(...gameTables(c, id, {}));
  };
  main.replaceChildren(
    h('h1', { class: 'page-title' }, 'Tabellen'),
    drawn.length > 1 ? chips(drawn.map((g) => ({ value: g.id, label: g.name, color: c.color(g.id) })), gid, show, 'scroll') : null,
    body);
  show(gid);
}

/** Alles zu einem Spiel – auch für die TV-Ansicht (opts.tv: ohne Bedienelemente, nur Tabellen oder nur Baum) */
export function gameTables(c, gameId, opts) {
  const r = c.resolved.get(gameId);
  const g = c.game(gameId);
  const out = [];
  if (!opts.tv) out.push(h('h2', { class: 'game-title', style: { '--c': c.color(gameId) } }, g.name));
  if (r.ranking.length && opts.part !== 'groups') out.push(podium(c, r));
  const multiGroup = r.tables.length > 1 || r.tables[0]?.rows.length > 1;
  if (opts.part !== 'ko' && multiGroup && r.tables.some((t) => t.matches.length)) {
    const qualified = qualifiedIds(r);
    out.push(h('div', { class: 'groups' }, r.tables.map((t) => groupTable(c, t, qualified, opts))));
    if (!opts.tv) out.push(rules(g, r));
  }
  if (opts.part !== 'groups' && r.ko.matches.length) out.push(bracket(c, r, opts));
  return out;
}

function qualifiedIds(r) {
  if (!r.groupsDone) return new Set();
  // Alle, die über einen Setzplatz in den Baum kommen (auch Freilos-Gewinner, die erst in Runde 2 einsteigen)
  return new Set(r.matches.filter((m) => m.phase === 'ko').flatMap((m) => m.src.map((s, i) => (s.seed ? [m.a, m.b][i] : null))).filter(Boolean));
}

const TIE = {
  direkt: ['D', 'Punktgleich – die Direktbegegnung entscheidet'],
  tore: ['T', 'Punktgleich, Direktbegegnung ausgeglichen – Tordifferenz bzw. Tore entscheiden'],
  los: ['L', 'Alles gleich – das Los (Reihenfolge der Auslosung) entscheidet'],
};

function groupTable(c, t, qualified, opts) {
  const head = h('tr', null, h('th', { class: 'rank' }, ''), h('th', { class: 'name' }, `Gruppe ${t.name}`), h('th', { title: 'Spiele' }, 'Sp'),
    opts.tv ? null : h('th', { title: 'Siege' }, 'S'), opts.tv ? null : h('th', { title: 'Unentschieden' }, 'U'), opts.tv ? null : h('th', { title: 'Niederlagen' }, 'N'),
    h('th', { title: 'Tore' }, 'Tore'), h('th', { title: 'Tordifferenz' }, '±'), h('th', { class: 'pts', title: 'Punkte' }, 'Pkt'));
  const rows = t.rows.map((row) => h('tr', { class: (qualified.has(row.id) ? 'q ' : '') + (row.id === state.me ? 'me' : '') },
    h('td', { class: 'rank' }, row.rank),
    h('td', { class: 'name' }, c.name(row.id), row.tie && row.played ? h('span', { class: 'tie', title: TIE[row.tie][1] }, ` (${TIE[row.tie][0]})`) : null),
    h('td', null, row.played),
    opts.tv ? null : h('td', null, row.w), opts.tv ? null : h('td', null, row.d), opts.tv ? null : h('td', null, row.l),
    h('td', null, `${row.gf}:${row.ga}`),
    h('td', null, row.gd > 0 ? '+' + row.gd : row.gd),
    h('td', { class: 'pts' }, row.pts)));
  const table = h('table', { class: 'standings' }, h('thead', null, head), h('tbody', null, rows));
  if (opts.tv) return h('div', { class: 'group' }, table);
  const ms = t.matches.map((m) => c.list.find((x) => x.id === m.id)).filter(Boolean).sort((a, b) => a.slot.start - b.slot.start);
  return h('div', { class: 'group' }, table,
    h('details', { class: 'group-matches' }, h('summary', null, `Spiele der Gruppe ${t.name} (${ms.filter((m) => m.result).length}/${ms.length})`),
      h('ul', null, ms.map((m) => h('li', null, h('button', { type: 'button', class: 'gm' + (isMine(m) ? ' mine' : ''), onclick: () => openScore(c, m) },
        h('span', { class: 'gm-time' }, m.result ? '✓' : fmtTime(m.slot.start)), side(c, m, 'a'), h('span', { class: 'gm-score' }, m.result ? `${m.result.a}:${m.result.b}` : '–'), side(c, m, 'b')))))));
}

function rules(g, r) {
  const adv = r.ko.slots.length ? `Weiter kommen ${r.ko.slots.length} in die Finalrunde (grün markiert).` : '';
  return h('details', { class: 'rules' }, h('summary', null, 'So wird gewertet'),
    h('p', null, `Sieg ${POINTS.win} Punkte, Unentschieden ${POINTS.draw}, Niederlage ${POINTS.loss}. Bei Gleichstand zählt der Reihe nach:`),
    h('ol', null, TIEBREAK_RULES.map((x) => h('li', null, x))),
    h('p', { class: 'small muted' }, 'Bei Punktgleichheit steht, was entschieden hat: (D) Direktbegegnung, (T) Tordifferenz oder Tore, (L) Los. ', adv,
      g.koSize ? ' Fehlen Plätze, kommen die besten Gruppen-Nächsten weiter (verglichen pro Match).' : ''));
}

function podium(c, r) {
  const by = (p) => r.ranking.filter((x) => x.place === p && x.id);
  const step = (p, cls) => h('div', { class: 'step ' + cls }, h('span', { class: 'place' }, `${p}.`), by(p).map((x) => h('span', { class: 'who' + (x.id === state.me ? ' me' : '') }, c.name(x.id))));
  return h('div', { class: 'podium' }, by(2).length ? step(2, 'silver') : null, step(1, 'gold'), by(3).length ? step(3, 'bronze') : null);
}

function bracket(c, r, opts) {
  const byId = new Map(c.list.map((m) => [m.id, m]));
  const cols = r.ko.rounds.map((rd) => h('div', { class: 'br-col' },
    h('h3', null, rd.name),
    h('div', { class: 'br-matches' }, rd.ids.map((id) => brMatch(c, byId.get(id), opts)))));
  const third = r.ko.matches.find((m) => m.third);
  return h('div', { class: 'bracket-wrap' },
    opts.tv ? null : h('h3', { class: 'sub' }, 'Finalrunde'),
    h('div', { class: 'bracket' }, cols),
    third ? h('div', { class: 'br-third' }, h('h3', null, 'Spiel um Platz 3'), brMatch(c, byId.get(third.id), opts)) : null);
}

function brMatch(c, m, opts) {
  if (!m) return null;
  const line = (k) => h('div', { class: 'br-line' }, side(c, m, k), h('span', { class: 'br-score' }, m.result ? m.result[k] : ''));
  const ready = m.a && m.b;
  return h(ready && !opts.tv ? 'button' : 'div', {
    class: `br-match ${m.slot.status}` + (isMine(m) ? ' mine' : ''),
    ...(ready && !opts.tv ? { type: 'button', onclick: () => openScore(c, m), 'aria-label': `${matchTitle(m)} – Resultat` } : {}),
  }, line('a'), line('b'), !m.result ? h('span', { class: 'br-time' }, m.slot.status === 'running' ? 'läuft' : fmtTime(m.slot.start)) : null);
}
