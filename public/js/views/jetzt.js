// «Jetzt»: was läuft, was kommt als Nächstes – pro Spiel und Station. Hier werden Resultate eingetragen.
import { h } from '../ui.js';
import { state, now, render } from '../app.js';
import { fmtTime, fmtDur, relTime, isMine, stationName, matchTitle, gameTag, side, section, empty } from './shared.js';
import { openScore, toggleLive } from './score.js';

/** Wo steht das Turnier? */
export function phaseInfo(c) {
  const { sc, list, base } = c;
  const t = now();
  if (!list.length) return { key: 'none', text: 'Noch nicht ausgelost' };
  const open = list.filter((m) => !m.result);
  if (!open.length) return { key: 'done', text: 'Turnier fertig' };
  const groupOpen = open.some((m) => m.phase === 'group');
  const koStarted = list.some((m) => m.phase === 'ko' && (m.result || m.live));
  if (t < base && !list.some((m) => m.result || m.live)) return { key: 'before', text: `Start um ${fmtTime(base)}`, sub: `in ${fmtDur(base - t)}` };
  if (groupOpen) return { key: 'group', text: 'Gruppenphase', sub: `fertig ca. ${fmtTime(sc.groupEnd)}` };
  if (!koStarted && t < sc.koStart) return { key: 'break', text: 'Pause', sub: `Finalrunde ab ${fmtTime(sc.koStart)}` };
  return { key: 'ko', text: 'Finalrunde', sub: `Ende ca. ${fmtTime(sc.end)}` };
}

export function matchRow(c, m, opts = {}) {
  const game = c.game(m.gameId);
  const s = m.slot;
  const ready = m.a && m.b;
  const canAct = ready && !opts.readonly;
  const st = stationName(game, s);
  const when = s.status === 'done' ? 'fertig' : s.status === 'running' ? relTime(s) : `${fmtTime(s.start)}${relTime(s) ? ' · ' + relTime(s) : ''}`;
  return h('article', {
    class: `match ${s.status}` + (isMine(m) ? ' mine' : '') + (opts.big ? ' big' : ''),
    style: { '--c': c.color(m.gameId) },
  },
    h('div', { class: 'match-meta' },
      opts.showGame ? gameTag(c, m.gameId) : null,
      h('span', null, matchTitle(m)),
      st ? h('span', { class: 'station' }, st) : null,
      h('span', { class: 'when' + (s.status === 'running' ? ' live' : '') }, when)),
    opts.note ? h('p', { class: 'match-note' + (opts.noteOk ? ' ok' : '') }, opts.note) : null,
    h('div', { class: 'match-players' },
      side(c, m, 'a'),
      m.result ? h('span', { class: 'score-small' }, `${m.result.a} : ${m.result.b}`) : h('span', { class: 'vs' }, 'gegen'),
      side(c, m, 'b')),
    canAct ? h('div', { class: 'match-actions' },
      !m.result ? h('button', { class: 'btn ghost small', onclick: () => toggleLive(m, opts.startStation) }, m.live ? 'Doch nicht gestartet' : opts.early ? 'Jetzt starten' : 'Start') : null,
      h('button', { class: 'btn ' + (m.result ? 'ghost small' : 'primary'), onclick: () => openScore(c, m) }, m.result ? 'Ändern' : 'Resultat')) : null
  );
}

export function renderJetzt(main, c) {
  const d = state.data;
  if (d.needsSetup || !d.games.length) {
    main.replaceChildren(empty('Noch keine Spiele erfasst. Unter Setup legst du Teilnehmer, Spiele und den Modus fest.', h('a', { class: 'btn primary', href: '#setup' }, 'Zum Setup')));
    return;
  }
  if (!c.list.length) {
    main.replaceChildren(empty('Die Gruppen sind noch nicht ausgelost.', h('a', { class: 'btn primary', href: '#setup/auslosung' }, 'Zur Auslosung')));
    return;
  }
  const phase = phaseInfo(c);
  const parts = [
    h('div', { class: 'phase phase-' + phase.key }, h('strong', null, phase.text), phase.sub ? h('span', null, phase.sub) : null),
  ];

  // Dein nächstes Match
  if (state.me) {
    const mine = c.list.filter((m) => isMine(m) && !m.result);
    const next = mine[0];
    parts.push(section(null, h('div', { class: 'mine-box' },
      h('h2', null, next ? 'Dein nächstes Match' : 'Du hast keine offenen Matches mehr'),
      next ? matchRow(c, next, { showGame: true, big: true }) : null,
      mine.length > 1 ? h('p', { class: 'hint' }, `Danach noch ${mine.length - 1} weitere – siehe `, h('a', { href: '#plan' }, 'Zeitplan'), '.') : null)));
  }

  // Pro Spiel: jede Station mit «läuft» oder «als Nächstes», darunter das übernächste Match
  for (const game of d.games) {
    const ms = c.list.filter((m) => m.gameId === game.id);
    if (!ms.length) continue;
    const open = ms.filter((m) => !m.result);
    if (!open.length) {
      const r = c.resolved.get(game.id);
      const champ = r?.ranking?.[0]?.id;
      parts.push(h('section', { class: 'block game-block', style: { '--c': c.color(game.id) } },
        h('h2', null, game.name),
        h('p', { class: 'muted' }, champ ? `Fertig – gewonnen hat ${c.name(champ)}.` : 'Alle Matches gespielt.')));
      continue;
    }
    const rows = [];
    const stations = game.stations.length ? game.stations : ['Station 1'];
    stations.forEach((_, i) => {
      const here = open.filter((m) => m.slot.station === i);
      const cur = here.find((m) => m.slot.status === 'running') || here[0];
      if (!cur) return;
      rows.push(matchRow(c, cur, { big: true }));
      (rows.shown ||= new Set()).add(cur.id);
      const after = here.filter((m) => m !== cur)[0];
      if (after) rows.push(h('p', { class: 'after' }, 'Danach: ', after.a ? c.name(after.a) : after.labelA, ' – ', after.b ? c.name(after.b) : after.labelB, ` · ca. ${fmtTime(after.slot.start)}`));
    });
    // Läuft ohne bekannte Station
    for (const m of open.filter((x) => x.slot.status === 'running' && x.slot.station == null)) rows.push(matchRow(c, m, { big: true }));
    parts.push(h('section', { class: 'block game-block', style: { '--c': c.color(game.id) } },
      h('h2', null, game.name, h('span', { class: 'count' }, `${ms.length - open.length} von ${ms.length} gespielt`)),
      ...rows,
      moreMatches(c, game, open, rows.shown)));
  }

  // Zuletzt gespielt
  const recent = c.list.filter((m) => m.result).sort((a, b) => (b.result.at || 0) - (a.result.at || 0)).slice(0, 5);
  if (recent.length) parts.push(section('Zuletzt gespielt', ...recent.map((m) => matchRow(c, m, { showGame: true }))));

  main.replaceChildren(...parts);
}

// ---------- Weitere Matches (wenn man dem Zeitplan voraus ist) ----------
const expanded = new Set();

/** Wer spielt gerade irgendwo? */
function busyPlayers(c) {
  const busy = new Map();
  for (const m of c.list) if (m.slot.status === 'running') for (const p of [m.a, m.b]) if (p) busy.set(p, m);
  return busy;
}

function moreMatches(c, game, open, shown = new Set()) {
  const rest = open.filter((m) => !shown.has(m.id) && m.slot.status !== 'running' && m.a && m.b);
  if (!rest.length) return null;
  const busy = busyPlayers(c);
  const stations = game.stations.length ? game.stations : ['Station 1'];
  const runningOn = new Set(open.filter((m) => m.slot.status === 'running').map((m) => m.slot.station));
  const freeStation = stations.findIndex((_, i) => !runningOn.has(i));
  const isOpen = expanded.has(game.id);
  const toggle = h('button', {
    class: 'btn ghost small more-btn', 'aria-expanded': String(isOpen),
    onclick: () => { if (expanded.has(game.id)) expanded.delete(game.id); else expanded.add(game.id); render(); },
  }, isOpen ? 'Weniger anzeigen' : `Weitere Matches vorziehen (${rest.length})`);
  if (!isOpen) return h('div', { class: 'more' }, toggle);
  return h('div', { class: 'more' },
    toggle,
    h('p', { class: 'hint' }, 'Wer dem Zeitplan voraus ist, kann hier ein späteres Match vorziehen – «Jetzt starten» oder gleich das Resultat eintragen. Der Zeitplan rechnet danach neu.'),
    ...rest.map((m) => {
      const blocking = [m.a, m.b].filter((p) => busy.has(p));
      const note = blocking.length
        ? `${blocking.map((p) => c.name(p)).join(' und ')} ${blocking.length > 1 ? 'spielen' : 'spielt'} gerade (${c.game(busy.get(blocking[0]).gameId)?.name})`
        : freeStation < 0 ? 'Beide frei – alle Stationen besetzt' : 'Beide frei – kann vorgezogen werden';
      return matchRow(c, m, { early: true, note, noteOk: !blocking.length && freeStation >= 0, startStation: freeStation >= 0 ? freeStation : null });
    }));
}
