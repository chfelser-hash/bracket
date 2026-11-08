// Erinnerung: das ganze Turnier als druckfertiges Dokument (A4) – im Browser «Als PDF speichern».
// Titelseite mit Siegern und Übersicht, danach pro Spiel Podest, Turnierbaum, Tabellen und alle Resultate.
import { h } from '../ui.js';
import { state } from '../app.js';
import { groupName } from '../turnier.js';
import { fmtDate, fmtTime } from './shared.js';
import { gameTables } from './tabellen.js';

const year = (t, c) => (t.date ? t.date.slice(0, 4) : String(new Date(c.base).getFullYear()));

/** Wie weit ist ein Spieler in einem Spiel gekommen? { text, place } */
export function placement(c, r, pid) {
  if (!r?.drawn || !r.groups.some((g) => g.includes(pid))) return null;
  const rk = r.ranking.find((x) => x.id === pid);
  if (rk) return { text: `${rk.place}.`, place: rk.place };
  const byId = new Map(c.list.map((m) => [m.id, m]));
  const lost = r.matches.filter((m) => m.phase === 'ko' && !m.third && (m.a === pid || m.b === pid)).map((m) => byId.get(m.id)).find((m) => {
    const res = m?.result;
    return res && res.a !== res.b && (res.a > res.b ? m.b : m.a) === pid;
  });
  if (lost) return { text: lost.roundName };
  const inKo = r.matches.some((m) => m.phase === 'ko' && (m.a === pid || m.b === pid));
  if (inKo) return { text: 'Finalrunde' };
  const t = r.tables.find((x) => x.rows.some((row) => row.id === pid));
  if (!t) return null;
  const row = t.rows.find((x) => x.id === pid);
  if (r.tables.length === 1 && !r.ko.matches.length) return { text: `${row.rank}.`, place: row.rank };
  return { text: `Gruppe ${row.rank}.` };
}

export function renderDruck(main, c) {
  const d = state.data;
  const t = d.tournament;
  const drawn = d.games.filter((g) => c.resolved.get(g.id)?.drawn);
  const played = c.list.filter((m) => m.result);
  const finished = c.list.length > 0 && played.length === c.list.length;
  document.title = `${t.name} ${year(t, c)} – Erinnerung`;

  const toolbar = h('div', { class: 'print-toolbar no-print' },
    h('a', { class: 'btn ghost', href: '#tabellen' }, 'Zurück'),
    h('div', { class: 'grow' },
      h('strong', null, 'Erinnerung als PDF'),
      h('p', { class: 'small muted' }, 'Im Druckfenster «Als PDF speichern» wählen. Am Handy: Teilen → Drucken → PDF.')),
    h('button', { class: 'btn primary', onclick: () => window.print() }, 'Als PDF speichern'));

  if (!drawn.length) {
    main.replaceChildren(toolbar, h('p', { class: 'empty' }, 'Noch nichts ausgelost – es gibt noch keine Resultate für eine Erinnerung.'));
    return;
  }

  main.replaceChildren(toolbar, h('article', { class: 'print-doc' },
    cover(c, d, drawn, played, finished),
    ...drawn.map((g) => gamePage(c, g))));
}

function cover(c, d, drawn, played, finished) {
  const t = d.tournament;
  const champs = drawn.map((g) => {
    const r = c.resolved.get(g.id);
    const by = (p) => r.ranking.filter((x) => x.place === p && x.id).map((x) => c.name(x.id));
    return { g, gold: by(1), silver: by(2), bronze: by(3) };
  });
  const goals = played.reduce((s, m) => s + m.result.a + m.result.b, 0);
  const first = played.length ? Math.min(...played.map((m) => m.slot.start)) : c.base;
  const last = played.length ? Math.max(...played.map((m) => m.slot.end)) : c.sc.end;

  return h('section', { class: 'print-cover' },
    h('header', { class: 'pc-head' },
      h('img', { src: '/icons/icon.svg', alt: '', class: 'pc-logo' }),
      h('div', null,
        h('p', { class: 'pc-year' }, year(t, c)),
        h('h1', null, t.name),
        h('p', { class: 'pc-date' }, [t.date ? fmtDate(t.date) : null, `${fmtTime(first)} – ${fmtTime(last)}`].filter(Boolean).join(', ')))),
    !finished ? h('p', { class: 'pc-note' }, `Zwischenstand: ${played.length} von ${c.list.length} Matches gespielt.`) : null,
    h('div', { class: 'pc-champs' }, champs.map((x) => h('div', { class: 'pc-champ', style: { '--c': c.color(x.g.id) } },
      h('span', { class: 'pc-game' }, x.g.name),
      h('strong', { class: 'pc-winner' }, x.gold.join(', ') || 'offen'),
      x.silver.length || x.bronze.length ? h('span', { class: 'pc-rest' },
        x.silver.length ? `2. ${x.silver.join(', ')}` : null, x.silver.length && x.bronze.length ? '   ' : null, x.bronze.length ? `3. ${x.bronze.join(', ')}` : null) : null))),
    h('dl', { class: 'pc-stats' },
      stat('Teilnehmer', d.players.length),
      stat('Spiele', drawn.length),
      stat('Matches', played.length),
      stat('Tore/Punkte', goals)),
    overview(c, d, drawn));
}

const stat = (label, value) => h('div', null, h('dt', null, label), h('dd', null, value));

/** Wer ist wo gelandet – alle Teilnehmer über alle Spiele */
function overview(c, d, drawn) {
  const rows = d.players.map((p) => {
    const cells = drawn.map((g) => placement(c, c.resolved.get(g.id), p.id));
    const medals = cells.filter((x) => x?.place && x.place <= 3).length;
    const golds = cells.filter((x) => x?.place === 1).length;
    return { p, cells, medals, golds };
  }).sort((a, b) => b.golds - a.golds || b.medals - a.medals || a.p.name.localeCompare(b.p.name, 'de'));
  return h('section', { class: 'pc-overview' },
    h('h2', null, 'Wer ist wie weit gekommen'),
    h('table', { class: 'ov' },
      h('thead', null, h('tr', null, h('th', { class: 'name' }, ''), drawn.map((g) => h('th', { style: { '--c': c.color(g.id) } }, g.name)))),
      h('tbody', null, rows.map((r) => h('tr', null,
        h('th', { class: 'name', scope: 'row' }, r.p.name),
        r.cells.map((x) => h('td', { class: x?.place && x.place <= 3 ? 'medal m' + x.place : '' }, x ? x.text : '–')))))));
}

function gamePage(c, g) {
  const r = c.resolved.get(g.id);
  const byId = new Map(c.list.map((m) => [m.id, m]));
  const groupMs = r.matches.filter((m) => m.phase === 'group').map((m) => byId.get(m.id)).filter(Boolean);
  const mode = [
    `${g.players.length} Teilnehmer`,
    g.groupSize === 1 ? 'direkt KO' : `${r.tables.length} ${r.tables.length === 1 ? 'Gruppe' : 'Gruppen'}`,
    r.ko.slots.length ? `${r.ko.slots.length} in der Finalrunde` : null,
    g.bestOf > 1 ? `KO Best of ${g.bestOf}` : null,
  ].filter(Boolean).join(' · ');
  return h('section', { class: 'print-game', style: { '--c': c.color(g.id) } },
    h('header', { class: 'pg-head' }, h('h2', null, g.name), h('p', null, mode)),
    ...gameTables(c, g.id, { tv: true, print: true }),
    groupMs.length ? h('div', { class: 'pg-results' },
      h('h3', null, 'Alle Gruppenspiele'),
      h('div', { class: 'pg-cols' }, r.tables.filter((tb) => tb.matches.length).map((tb) => h('div', { class: 'pg-group' },
        r.tables.length > 1 ? h('h4', null, `Gruppe ${groupName(tb.group)}`) : null,
        h('ul', null, groupMs.filter((m) => m.group === tb.group).sort((a, b) => a.slot.start - b.slot.start).map((m) => h('li', null,
          h('span', null, c.name(m.a)),
          h('span', { class: 'res' }, m.result ? `${m.result.a} : ${m.result.b}` : '–'),
          h('span', null, c.name(m.b))))))))) : null);
}
