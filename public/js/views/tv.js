// TV-Ansicht: links was läuft und als Nächstes kommt, rechts abwechselnd Tabellen und Turnierbaum.
import { h } from '../ui.js';
import { state, now } from '../app.js';
import { fmtTime, stationName, matchTitle, relTime, side } from './shared.js';
import { phaseInfo } from './jetzt.js';
import { gameTables } from './tabellen.js';

const ROTATE_MS = 15000;
let page = 0;
let timer = null;
let lastCtx = null;

export function renderTv(main, c) {
  lastCtx = c;
  const d = state.data;
  const phase = phaseInfo(c);
  const clock = h('span', { class: 'tv-clock' }, fmtTime(now()));
  main.replaceChildren(h('div', { class: 'tv' },
    h('header', { class: 'tv-head' },
      h('img', { src: '/icons/icon.svg', alt: '', class: 'tv-logo' }),
      h('h1', null, d.tournament.name),
      h('span', { class: 'tv-phase phase-' + phase.key }, phase.text, phase.sub ? h('small', null, phase.sub) : null),
      clock,
      h('a', { class: 'tv-exit', href: '#jetzt', 'aria-label': 'TV-Ansicht verlassen' }, '✕')),
    h('div', { class: 'tv-body' },
      h('section', { class: 'tv-now' }, nowList(c)),
      h('section', { class: 'tv-side', id: 'tv-side' }, sidePage(c)))));
  if (!timer) timer = setInterval(() => {
    if (location.hash !== '#tv') { clearInterval(timer); timer = null; return; }
    page++;
    const el = document.getElementById('tv-side');
    if (el && lastCtx) el.replaceChildren(sidePage(lastCtx));
    const ck = document.querySelector('.tv-clock');
    if (ck) ck.textContent = fmtTime(now());
  }, ROTATE_MS);
}

function nowList(c) {
  const d = state.data;
  const out = [];
  for (const game of d.games) {
    const open = c.list.filter((m) => m.gameId === game.id && !m.result);
    if (!open.length) continue;
    const stations = game.stations.length ? game.stations : ['Station 1'];
    const rows = [];
    stations.forEach((_, i) => {
      const here = open.filter((m) => m.slot.station === i);
      const cur = here.find((m) => m.slot.status === 'running') || here[0];
      if (!cur) return;
      const next = here.find((m) => m !== cur);
      rows.push(h('div', { class: 'tv-match ' + cur.slot.status },
        h('div', { class: 'tv-meta' },
          stations.length > 1 || stations[0] !== 'Station 1' ? h('span', { class: 'tv-station' }, stationName(game, cur.slot)) : null,
          h('span', null, matchTitle(cur)),
          h('span', { class: 'tv-when' + (cur.slot.status === 'running' ? ' live' : '') }, cur.slot.status === 'running' ? relTime(cur.slot) : fmtTime(cur.slot.start))),
        h('div', { class: 'tv-players' }, side(c, cur, 'a'), h('span', { class: 'vs' }, 'gegen'), side(c, cur, 'b')),
        next ? h('div', { class: 'tv-next' }, `Danach ${fmtTime(next.slot.start)}: `, next.a ? c.name(next.a) : next.labelA, ' – ', next.b ? c.name(next.b) : next.labelB) : null));
    });
    if (rows.length) out.push(h('div', { class: 'tv-game', style: { '--c': c.color(game.id) } }, h('h2', null, game.name), ...rows));
  }
  if (!out.length) {
    const champs = d.games.map((g) => ({ g, id: c.resolved.get(g.id)?.ranking?.[0]?.id })).filter((x) => x.id);
    return champs.length
      ? [h('h2', { class: 'tv-title' }, 'Sieger'), ...champs.map((x) => h('div', { class: 'tv-champ', style: { '--c': c.color(x.g.id) } }, h('span', null, x.g.name), h('strong', null, c.name(x.id))))]
      : [h('p', { class: 'tv-empty' }, 'Noch nichts ausgelost.')];
  }
  return [h('h2', { class: 'tv-title' }, 'Jetzt und als Nächstes'), ...out];
}

/** Seiten rechts: pro Spiel die Gruppen, danach der Baum (sobald es KO-Matches gibt) */
function sidePage(c) {
  const pages = [];
  for (const g of state.data.games) {
    const r = c.resolved.get(g.id);
    if (!r?.drawn) continue;
    const hasGroups = r.tables.some((t) => t.matches.length);
    if (hasGroups && !r.groupsDone) pages.push({ g, part: 'groups' });
    if (r.ko.matches.length && (r.groupsDone || !hasGroups)) pages.push({ g, part: 'ko' });
    else if (hasGroups && r.groupsDone && !r.ko.matches.length) pages.push({ g, part: 'groups' });
  }
  if (!pages.length) return [];
  const p = pages[page % pages.length];
  return [
    h('h2', { class: 'tv-title', style: { '--c': c.color(p.g.id) } }, p.g.name, h('small', null, p.part === 'ko' ? ' · Finalrunde' : ' · Gruppen'),
      pages.length > 1 ? h('span', { class: 'tv-dots', 'aria-hidden': 'true' }, pages.map((_, i) => h('i', { class: i === page % pages.length ? 'on' : '' }))) : null),
    ...gameTables(c, p.g.id, { tv: true, part: p.part }),
  ];
}
