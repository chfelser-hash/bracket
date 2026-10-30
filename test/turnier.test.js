import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rng, shuffle, groupCount, buildGroups, roundRobin, standings, seedOrder, roundName, qualifierSlots, slotLabel,
  koStructure, groupMatches, resolveGame, checkResult, winsNeeded, schedule, baseTime, gamePreview, groupName, matchMinutes,
} from '../public/js/turnier.js';

const ids = (n, p = 'p') => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
const game = (over = {}) => ({ id: 'g1', name: 'Testspiel', roundMin: 10, stations: ['S1'], groupSize: 4, advance: 2, koSize: 0, bestOf: 1, thirdPlace: true, ...over });
const MIN = 60000;

test('Zufall ist reproduzierbar, Mischen verliert nichts', () => {
  const a = shuffle(ids(10), rng(42));
  const b = shuffle(ids(10), rng(42));
  assert.deepEqual(a, b);
  assert.deepEqual([...a].sort(), ids(10).sort());
  assert.notDeepEqual(shuffle(ids(10), rng(1)), shuffle(ids(10), rng(2)));
});

test('Gruppen: so wenige wie möglich, Grössen unterscheiden sich höchstens um 1', () => {
  assert.equal(groupCount(0, 4), 0);
  assert.equal(groupCount(8, 4), 2);
  assert.equal(groupCount(9, 4), 3);
  assert.equal(groupCount(5, 0), 5);
  const gs = buildGroups(ids(10), 4, rng(7));
  assert.equal(gs.length, 3);
  assert.deepEqual(gs.map((g) => g.length).sort(), [3, 3, 4]);
  assert.equal(new Set(gs.flat()).size, 10);
  assert.equal(groupName(0), 'A');
  assert.equal(groupName(27), 'G28');
});

test('Jeder gegen jeden: alle Paare genau einmal, pro Runde jeder höchstens einmal', () => {
  for (const n of [2, 3, 4, 5, 6, 7]) {
    const rounds = roundRobin(ids(n));
    const pairs = rounds.flat().map((p) => [...p].sort().join('-'));
    assert.equal(pairs.length, (n * (n - 1)) / 2, `n=${n}`);
    assert.equal(new Set(pairs).size, pairs.length);
    for (const r of rounds) assert.equal(new Set(r.flat()).size, r.flat().length);
  }
  assert.deepEqual(roundRobin(['x']), []);
});

test('Tabelle: Punkte, Tordifferenz, Tore', () => {
  const ms = [
    { id: 'm1', a: 'A', b: 'B' }, { id: 'm2', a: 'A', b: 'C' }, { id: 'm3', a: 'B', b: 'C' },
  ];
  const res = { m1: { a: 2, b: 2 }, m2: { a: 3, b: 0 }, m3: { a: 1, b: 0 } };
  const t = standings(['A', 'B', 'C'], ms, res);
  assert.deepEqual(t.map((r) => r.id), ['A', 'B', 'C']);
  assert.equal(t[0].pts, 4);
  assert.equal(t[0].gd, 3);
  assert.equal(t[1].pts, 4);
  assert.equal(t[2].pts, 0);
  assert.equal(t[0].w, 1); assert.equal(t[0].d, 1);
});

test('Tabelle: Direktbegegnung entscheidet bei Gleichstand nach Punkten, Differenz und Toren', () => {
  // A und B: je 3 Punkte, Diff 0, Tore 2 – B hat A geschlagen
  const ms = [{ id: 'm1', a: 'A', b: 'B' }, { id: 'm2', a: 'A', b: 'C' }, { id: 'm3', a: 'B', b: 'C' }];
  const res = { m1: { a: 1, b: 2 }, m2: { a: 1, b: 0 }, m3: { a: 0, b: 1 } };
  const t = standings(['A', 'B', 'C'], ms, res);
  // alle 3 Punkte, Diff 0; Tore A2 B2 C1 → C letzter, A/B direkt: B
  assert.deepEqual(t.map((r) => r.id), ['B', 'A', 'C']);
  assert.equal(t[0].tie, 'direkt');
});

test('Tabelle: ohne Resultate entscheidet das Los (Reihenfolge der Auslosung)', () => {
  const t = standings(['X', 'Y'], [{ id: 'm', a: 'X', b: 'Y' }], {});
  assert.deepEqual(t.map((r) => r.id), ['X', 'Y']);
  assert.equal(t[0].tie, 'los');
  assert.equal(t[1].rank, 2);
});

test('Setzliste: 1 und 2 erst im Final', () => {
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.equal(roundName(2), 'Final');
  assert.equal(roundName(4), 'Halbfinal');
  assert.equal(roundName(8), 'Viertelfinal');
  assert.equal(roundName(16), 'Achtelfinal');
  assert.equal(roundName(32), 'Runde der 32');
});

test('Qualifikation: automatisch Gruppen × Weiterkommende', () => {
  const groups = [ids(4, 'a'), ids(4, 'b')];
  const s = qualifierSlots(game(), groups);
  assert.deepEqual(s.map(slotLabel), ['1. Gruppe A', '1. Gruppe B', '2. Gruppe A', '2. Gruppe B']);
});

test('Qualifikation: feste KO-Grösse mit besten Gruppendritten', () => {
  const groups = [ids(4, 'a'), ids(4, 'b'), ids(4, 'c')];
  const s = qualifierSlots(game({ koSize: 8 }), groups);
  assert.equal(s.length, 8);
  assert.equal(slotLabel(s[6]), '1. bester Gruppen-3.');
  assert.equal(slotLabel(null), 'Freilos');
  // kleiner als automatisch: nur ein Teil der Zweiten
  const s2 = qualifierSlots(game({ koSize: 4 }), groups);
  assert.equal(s2.length, 4);
  assert.equal(s2[3].best, 2);
});

test('KO-Baum: 4 aus 2 Gruppen ohne Duell aus derselben Gruppe im Halbfinal, mit Platz 3', () => {
  const groups = [ids(4, 'a'), ids(4, 'b')];
  const ko = koStructure(game(), groups);
  assert.equal(ko.size, 4);
  const names = ko.matches.map((m) => m.roundName);
  assert.deepEqual(names, ['Halbfinal', 'Halbfinal', 'Spiel um Platz 3', 'Final']);
  // HF1: Seed 1 (A1) gegen Seed 4 (B2)
  assert.deepEqual(ko.matches[0].src, [{ seed: 1 }, { seed: 4 }]);
});

test('KO-Baum: Freilose bei 3 Weiterkommenden, dann kein Spiel um Platz 3', () => {
  const groups = [ids(5)];
  const ko = koStructure(game({ advance: 3 }), groups);
  assert.equal(ko.size, 4);
  assert.deepEqual(ko.matches.map((m) => m.roundName), ['Halbfinal', 'Final']);
  assert.deepEqual(ko.matches[1].src[0], { seed: 1 });
});

test('KO-Baum: weniger als 2 Weiterkommende → kein KO', () => {
  const ko = koStructure(game({ advance: 1 }), [ids(4)]);
  assert.equal(ko.matches.length, 0);
  assert.equal(ko.size, 0);
});

test('Ganzes Spiel: Gruppen, Tabellen, KO mit Spielern und Rangliste', () => {
  const g = game({ thirdPlace: true });
  const groups = [['a1', 'a2', 'a3', 'a4'], ['b1', 'b2', 'b3', 'b4']];
  const state = { games: [g], draws: { g1: { groups } }, results: {} };
  let r = resolveGame(g, state);
  assert.equal(r.matches.filter((m) => m.phase === 'group').length, 12);
  assert.equal(r.groupsDone, false);
  const hf = r.matches.filter((m) => m.phase === 'ko');
  assert.equal(hf[0].a, null);
  assert.equal(hf[0].labelA, '1. Gruppe A');
  // Gruppen: Spieler mit kleinerer Nummer gewinnt immer
  for (const m of r.matches.filter((x) => x.phase === 'group')) {
    const win = m.a < m.b;
    state.results[m.id] = win ? { a: 2, b: 0 } : { a: 0, b: 2 };
  }
  r = resolveGame(g, state);
  assert.equal(r.groupsDone, true);
  const ko = r.matches.filter((m) => m.phase === 'ko');
  assert.equal(ko[0].a, 'a1'); assert.equal(ko[0].b, 'b2');
  assert.equal(ko[1].a, 'b1'); assert.equal(ko[1].b, 'a2');
  state.results[ko[0].id] = { a: 3, b: 1 };
  state.results[ko[1].id] = { a: 0, b: 1 };
  r = resolveGame(g, state);
  const [, , third, final] = r.matches.filter((m) => m.phase === 'ko');
  assert.equal(final.a, 'a1'); assert.equal(final.b, 'a2');
  assert.equal(third.a, 'b2'); assert.equal(third.b, 'b1');
  assert.equal(third.labelA, 'Verlierer Halbfinal 1');
  assert.equal(r.done, false);
  state.results[final.id] = { a: 1, b: 2 };
  state.results[third.id] = { a: 1, b: 0 };
  r = resolveGame(g, state);
  assert.deepEqual(r.ranking.map((x) => x.id), ['a2', 'a1', 'b2', 'b1']);
  assert.equal(r.done, true);
});

test('Ohne Platz-3-Spiel: beide Halbfinal-Verlierer sind Dritte', () => {
  const g = game({ thirdPlace: false, groupSize: 1 }); // Gruppengrösse 1 = reines KO
  const state = { games: [g], draws: { g1: { groups: [['p1'], ['p2'], ['p3'], ['p4']] } }, results: {} };
  let r = resolveGame(g, state);
  assert.equal(r.groupsDone, true);
  const [s1, s2] = r.matches;
  state.results[s1.id] = { a: 1, b: 0 };
  state.results[s2.id] = { a: 1, b: 0 };
  r = resolveGame(g, state);
  state.results[r.matches[2].id] = { a: 0, b: 1 };
  r = resolveGame(g, state);
  assert.deepEqual(r.ranking.map((x) => x.place), [1, 2, 3, 3]);
});

test('Nur Gruppenphase (1 Gruppe, 1 weiter): Rangliste aus der Tabelle', () => {
  const g = game({ advance: 1 });
  const state = { games: [g], draws: { g1: { groups: [['x', 'y', 'z']] } }, results: {} };
  let r = resolveGame(g, state);
  for (const m of r.matches) state.results[m.id] = { a: 1, b: 0 };
  r = resolveGame(g, state);
  assert.equal(r.ranking.length, 3);
  assert.equal(r.done, true);
  assert.equal(resolveGame(game({ id: 'nix' }), state).drawn, false);
});

test('Beste Gruppendritte werden pro Match verglichen', () => {
  const g = game({ koSize: 8 });
  const groups = [['a1', 'a2', 'a3', 'a4'], ['b1', 'b2', 'b3', 'b4'], ['c1', 'c2', 'c3']];
  const state = { games: [g], draws: { g1: { groups } }, results: {} };
  let r = resolveGame(g, state);
  for (const m of r.matches.filter((x) => x.phase === 'group')) {
    // Kleinere Nummer gewinnt; c3 gewinnt aber gegen c2 → c3 wird Zweiter? nein: c1 schlägt alle
    state.results[m.id] = m.a < m.b ? { a: 1, b: 0 } : { a: 0, b: 1 };
  }
  r = resolveGame(g, state);
  const ko = r.matches.filter((m) => m.phase === 'ko');
  const inKo = new Set(ko.filter((m) => m.round === 0).flatMap((m) => [m.a, m.b]));
  assert.equal(inKo.size, 8);
  assert.ok(inKo.has('a3') || inKo.has('b3'));
});

test('Resultat prüfen', () => {
  const g = game({ bestOf: 3 });
  assert.equal(checkResult(g, { phase: 'group' }, 1, 1), null);
  assert.match(checkResult(g, { phase: 'group' }, -1, 1), /ganze Zahlen/);
  assert.match(checkResult(g, { phase: 'group' }, 1.5, 1), /ganze Zahlen/);
  assert.match(checkResult(g, { phase: 'group' }, 1000, 1), /zu gross/);
  assert.match(checkResult(g, { phase: 'ko' }, 1, 1), /kein Unentschieden/);
  assert.equal(checkResult(g, { phase: 'ko' }, 2, 1), null);
  assert.match(checkResult(g, { phase: 'ko' }, 3, 1), /zuerst 2/);
  assert.equal(checkResult(game(), { phase: 'ko' }, 5, 4), null);
  assert.match(checkResult(game({ bestOf: 4 }), { phase: 'ko' }, 3, 2), /höchstens 4/);
  assert.equal(winsNeeded(1), null);
  assert.equal(winsNeeded(3), 2);
  assert.equal(winsNeeded(5), 3);
  assert.equal(winsNeeded(4), 3);
});

test('Zeitplan: parallele Spiele, niemand an zwei Orten, Wechselzeit und Pause', () => {
  const g1 = game({ id: 'g1', roundMin: 10, stations: ['A', 'B'], groupSize: 4 });
  const g2 = game({ id: 'g2', roundMin: 15, stations: ['X'], groupSize: 3 });
  const players = ids(8);
  const state = {
    games: [g1, g2],
    draws: { g1: { groups: [players.slice(0, 4), players.slice(4)] }, g2: { groups: [players.slice(0, 3), players.slice(3, 6)] } },
    results: {},
  };
  const base = Date.UTC(2026, 10, 14, 12, 0);
  const sc = schedule(state, { base, changeMin: 5, breakMin: 30 });
  const list = sc.matches.map((m) => ({ ...m, ...sc.slots.get(m.id) }));
  assert.equal(list.length, sc.slots.size);
  assert.ok(list.every((m) => m.start >= base));
  // Niemand doppelt: Matches eines Spielers überlappen nicht (inkl. Wechselzeit)
  for (const p of players) {
    const mine = list.filter((m) => m.a === p || m.b === p).sort((x, y) => x.start - y.start);
    for (let i = 1; i < mine.length; i++) assert.ok(mine[i].start >= mine[i - 1].end + 5 * MIN, `${p} doppelt gebucht`);
  }
  // Stationen: nie zwei Matches gleichzeitig auf derselben Station
  for (const g of [g1, g2]) {
    g.stations.forEach((_, st) => {
      const on = list.filter((m) => m.gameId === g.id && m.station === st).sort((x, y) => x.start - y.start);
      for (let i = 1; i < on.length; i++) assert.ok(on[i].start >= on[i - 1].end + 5 * MIN);
    });
  }
  // Zwei Stationen werden wirklich parallel genutzt
  const g1group = list.filter((m) => m.gameId === 'g1' && m.phase === 'group');
  assert.ok(g1group.some((m) => m.station === 1));
  // KO erst nach der Pause
  const ko = list.filter((m) => m.phase === 'ko');
  assert.ok(ko.length > 0);
  assert.ok(ko.every((m) => m.start >= sc.groupEnd + 30 * MIN));
  assert.equal(sc.koStart, sc.groupEnd + 30 * MIN);
  // Final nach den Halbfinals
  const fin = ko.find((m) => m.gameId === 'g1' && m.roundName === 'Final');
  const semis = ko.filter((m) => m.gameId === 'g1' && m.roundName === 'Halbfinal');
  assert.ok(semis.every((s) => fin.start >= s.end + 5 * MIN));
  assert.ok(sc.end >= fin.end);
});

test('Zeitplan: Best of 3 plant drei Runden ein', () => {
  const g = game({ bestOf: 3, groupSize: 1, roundMin: 10 });
  assert.equal(matchMinutes(g, { phase: 'ko' }), 30);
  assert.equal(matchMinutes(g, { phase: 'group' }), 10);
  const state = { games: [g], draws: { g1: { groups: [['a'], ['b']] } }, results: {} };
  const sc = schedule(state, { base: 0, changeMin: 0, breakMin: 30 });
  const s = sc.slots.get(sc.matches[0].id);
  assert.equal(s.start, 0); // keine Gruppenphase → keine Pause
  assert.equal(s.end, 30 * MIN);
});

test('Zeitplan verschiebt sich live: Verspätung schiebt die nächsten Matches', () => {
  const g = game({ stations: ['S'], groupSize: 3, advance: 1 });
  const state = { games: [g], draws: { g1: { groups: [['a', 'b', 'c']] } }, results: {}, live: {} };
  const base = 1_000_000_000_000;
  const plan0 = schedule(state, { base, changeMin: 5, breakMin: 0 });
  const first = plan0.matches.find((m) => plan0.slots.get(m.id).start === base);
  // Erstes Match läuft seit Beginn, jetzt ist es 25 Minuten später (geplant waren 10)
  state.live[first.id] = { startedAt: base, station: 0 };
  const now = base + 25 * MIN;
  const plan1 = schedule(state, { base, now, changeMin: 5, breakMin: 0 });
  const s1 = plan1.slots.get(first.id);
  assert.equal(s1.status, 'running');
  assert.equal(s1.end, now);
  const others = plan1.matches.filter((m) => m.id !== first.id).map((m) => plan1.slots.get(m.id));
  assert.ok(others.every((s) => s.start >= now + 5 * MIN));
  // Fertig: Resultat mit Zeitpunkt
  state.results[first.id] = { a: 1, b: 0, at: now };
  const plan2 = schedule(state, { base, now: now + MIN, changeMin: 5, breakMin: 0 });
  assert.equal(plan2.slots.get(first.id).status, 'done');
  assert.equal(plan2.slots.get(first.id).start, base);
  // Ohne «Start» erfasst: Beginn wird aus der Dauer geschätzt
  const second = plan2.matches.find((m) => m.id !== first.id);
  state.results[second.id] = { a: 0, b: 0, at: now + 20 * MIN };
  const plan3 = schedule(state, { base, now: now + 21 * MIN, changeMin: 5, breakMin: 0 });
  assert.equal(plan3.slots.get(second.id).start, now + 10 * MIN);
  assert.equal(plan3.slots.get(second.id).station, null);
});

test('Zeitplan ohne Spiele und ohne Auslosung', () => {
  const sc = schedule({ games: [game()], draws: {}, results: {} }, { base: 5, changeMin: 5, breakMin: 5 });
  assert.equal(sc.slots.size, 0);
  assert.equal(sc.end, 5);
  assert.equal(schedule({}, { base: 7 }).end, 7);
});

test('Startzeit aus Datum und Uhrzeit', () => {
  const t = baseTime({ date: '2026-11-14', start: '9:30' });
  const d = new Date(t);
  assert.equal(d.getHours(), 9);
  assert.equal(d.getMinutes(), 30);
  assert.equal(d.getDate(), 14);
  const today = new Date(2026, 0, 2, 8);
  const t2 = new Date(baseTime({ start: 'x' }, today));
  assert.equal(t2.getDate(), 2);
  assert.equal(t2.getHours(), 13);
});

test('Vorschau für die Einstellungen', () => {
  const p = gamePreview(game(), 10);
  assert.equal(p.groups, 3);
  assert.deepEqual(p.sizes, [4, 3, 3]);
  assert.equal(p.groupGames, 6 + 3 + 3);
  assert.equal(p.qualifiers, 6);
  assert.equal(p.koFirst, 'Viertelfinal');
  assert.equal(p.byes, 2);
  assert.equal(gamePreview(game(), 0).groups, 0);
});

test('Gruppen-Matches haben stabile IDs', () => {
  const ms = groupMatches(game(), [['a', 'b', 'c']]);
  assert.equal(ms.length, 3);
  assert.ok(ms.every((m) => m.id.startsWith('g1:G0:')));
});

test('KO-Baum: in der ersten Runde nie zwei aus derselben Gruppe (3 Gruppen, je 2 weiter)', () => {
  const groups = [ids(4, 'a'), ids(3, 'b'), ids(3, 'c')];
  const ko = koStructure(game(), groups);
  const first = ko.matches.filter((m) => m.round === 0);
  assert.equal(first.length, 2);
  for (const m of first) {
    const [x, y] = m.src.map((s) => ko.slots[s.seed - 1].group);
    assert.notEqual(x, y);
  }
  assert.deepEqual(first.map((m) => m.num), [1, 2]);
  // Freilos-Gewinner im Halbfinal: Label nummeriert die echten Viertelfinals der Reihe nach
  const state = { games: [game()], draws: { g1: { groups } }, results: {} };
  const labels = resolveGame(game(), state).matches.filter((m) => m.roundName === 'Halbfinal').flatMap((m) => [m.labelA, m.labelB]);
  assert.ok(labels.includes('Sieger Viertelfinal 1'));
  assert.ok(labels.includes('Sieger Viertelfinal 2'));
  // Nur eine Gruppe: nicht lösbar, bleibt wie gesetzt
  assert.equal(koStructure(game({ advance: 4 }), [ids(4)]).matches.length, 4);
});
