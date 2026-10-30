// «Jetzt»: was läuft, was kommt als Nächstes – pro Spiel und Station. Hier werden Resultate eingetragen.
import { h } from '../ui.js';
import { state, now } from '../app.js';
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
    h('div', { class: 'match-players' },
      side(c, m, 'a'),
      m.result ? h('span', { class: 'score-small' }, `${m.result.a} : ${m.result.b}`) : h('span', { class: 'vs' }, 'gegen'),
      side(c, m, 'b')),
    canAct ? h('div', { class: 'match-actions' },
      !m.result ? h('button', { class: 'btn ghost small', onclick: () => toggleLive(m) }, m.live ? 'Doch nicht gestartet' : 'Start') : null,
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
      const after = here.filter((m) => m !== cur)[0];
      if (after) rows.push(h('p', { class: 'after' }, 'Danach: ', after.a ? c.name(after.a) : after.labelA, ' – ', after.b ? c.name(after.b) : after.labelB, ` · ca. ${fmtTime(after.slot.start)}`));
    });
    // Läuft ohne bekannte Station
    for (const m of open.filter((x) => x.slot.status === 'running' && x.slot.station == null)) rows.push(matchRow(c, m, { big: true }));
    parts.push(h('section', { class: 'block game-block', style: { '--c': c.color(game.id) } },
      h('h2', null, game.name, h('span', { class: 'count' }, `${ms.length - open.length} von ${ms.length} gespielt`)),
      ...rows));
  }

  // Zuletzt gespielt
  const recent = c.list.filter((m) => m.result).sort((a, b) => (b.result.at || 0) - (a.result.at || 0)).slice(0, 5);
  if (recent.length) parts.push(section('Zuletzt gespielt', ...recent.map((m) => matchRow(c, m, { showGame: true }))));

  main.replaceChildren(...parts);
}
