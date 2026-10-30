// Zeitplan: alle Matches in zeitlicher Reihenfolge, filterbar nach Spiel oder «Mein Plan».
import { h, chips } from '../ui.js';
import { state } from '../app.js';
import { fmtTime, fmtDur, isMine, stationName, matchTitle, side, empty } from './shared.js';
import { openScore } from './score.js';

let filter = 'alle';

export function renderPlan(main, c) {
  const d = state.data;
  if (!c.list.length) {
    main.replaceChildren(empty('Noch kein Zeitplan – zuerst Teilnehmer und Spiele erfassen und auslosen.', h('a', { class: 'btn primary', href: '#setup/auslosung' }, 'Zur Auslosung')));
    return;
  }
  const t = d.tournament;
  const groupList = c.list.filter((m) => m.phase === 'group');
  const summary = h('dl', { class: 'plan-summary' },
    h('div', null, h('dt', null, 'Start'), h('dd', null, fmtTime(c.base))),
    groupList.length ? h('div', null, h('dt', null, 'Gruppenphase bis ca.'), h('dd', null, fmtTime(c.sc.groupEnd))) : null,
    groupList.length && t.breakMin ? h('div', null, h('dt', null, `Pause (${t.breakMin} min)`), h('dd', null, `bis ${fmtTime(c.sc.koStart)}`)) : null,
    h('div', null, h('dt', null, 'Ende ca.'), h('dd', null, fmtTime(c.sc.end))),
    h('div', null, h('dt', null, 'Dauer'), h('dd', null, fmtDur(c.sc.end - c.base))));

  const opts = [{ value: 'alle', label: 'Alle' }];
  if (state.me) opts.push({ value: 'me', label: 'Mein Plan' });
  for (const g of d.games) if (c.list.some((m) => m.gameId === g.id)) opts.push({ value: g.id, label: g.name, color: c.color(g.id) });
  if (!opts.some((o) => o.value === filter)) filter = 'alle';
  const listEl = h('div', { class: 'plan-list' });
  const draw = () => {
    const ms = c.list.filter((m) => filter === 'alle' || (filter === 'me' ? isMine(m) : m.gameId === filter));
    const out = [];
    let lastPhase = null;
    for (const m of ms) {
      if (m.phase !== lastPhase) {
        if (m.phase === 'ko' && groupList.length && t.breakMin) out.push(h('div', { class: 'plan-break' }, `Pause ${fmtTime(c.sc.groupEnd)} – ${fmtTime(c.sc.koStart)}`));
        out.push(h('h2', { class: 'plan-phase' }, m.phase === 'group' ? 'Gruppenphase' : 'Finalrunde'));
        lastPhase = m.phase;
      }
      out.push(planRow(c, m));
    }
    listEl.replaceChildren(...(out.length ? out : [h('p', { class: 'empty' }, 'Keine Matches.')]));
  };
  draw();
  main.replaceChildren(
    h('h1', { class: 'page-title' }, 'Zeitplan'),
    summary,
    h('p', { class: 'hint' }, `Verschiebt sich automatisch, wenn Matches länger oder kürzer dauern. Wechselzeit ${t.changeMin} min.`),
    chips(opts, filter, (v) => { filter = v; draw(); }, 'scroll'),
    listEl);
}

function planRow(c, m) {
  const g = c.game(m.gameId);
  const s = m.slot;
  const ready = m.a && m.b;
  return h(ready ? 'button' : 'div', {
    class: `plan-row ${s.status}` + (isMine(m) ? ' mine' : ''),
    style: { '--c': c.color(m.gameId) },
    ...(ready ? { type: 'button', onclick: () => openScore(c, m), 'aria-label': `${matchTitle(m)}: Resultat ${m.result ? 'ändern' : 'eintragen'}` } : {}),
  },
    h('span', { class: 'plan-time' }, s.status === 'running' ? 'läuft' : fmtTime(s.start)),
    h('span', { class: 'plan-what' }, h('span', { class: 'plan-game' }, g.name), h('span', { class: 'muted' }, [matchTitle(m), stationName(g, s)].filter(Boolean).join(' · '))),
    h('span', { class: 'plan-players' }, side(c, m, 'a'), h('span', { class: 'plan-score' }, m.result ? `${m.result.a}:${m.result.b}` : '–'), side(c, m, 'b')));
}
