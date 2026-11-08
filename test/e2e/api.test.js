// Jeder API-Aufruf mit Erfolgs- und Fehlerfällen – nur erfundene Testdaten
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, apiClient, seed, PIN, NAMES } from './helpers.js';
import { resolveGame } from '../../public/js/turnier.js';

let srv, api, games;
const data = async () => (await api('GET', '/api/data')).data;

before(async () => {
  srv = await startServer();
  api = apiClient(srv.base);
});
after(() => srv.stop());

test('Einrichten: PIN festlegen, dann ist das Gerät freigeschaltet', async () => {
  let s = (await api('GET', '/api/status')).data;
  assert.equal(s.needsSetup, true);
  assert.equal(s.canEdit, false);
  assert.equal((await api('POST', '/api/setup', { pin: '12' })).status, 400);
  assert.equal((await api('POST', '/api/unlock', { pin: '1234' })).status, 400);
  games = await seed(api);
  s = (await api('GET', '/api/status')).data;
  assert.equal(s.needsSetup, false);
  assert.equal(s.canEdit, true);
  assert.equal((await api('POST', '/api/setup', { pin: '9999' })).status, 403);
  const d = await data();
  assert.equal(d.tournament.name, 'Testturnier');
  assert.equal(d.players.length, 8);
  assert.equal(d.games.length, 2);
  assert.equal(d.games[0].players.length, 8, 'neue Spiele: alle machen mit');
});

test('Ohne PIN: anschauen ja, ändern nein; falsche PIN wird gebremst', async () => {
  const anon = apiClient(srv.base);
  const d = (await anon('GET', '/api/data')).data;
  assert.equal(d.canEdit, false);
  assert.equal(d.players.length, 8);
  assert.equal((await anon('POST', '/api/players', { name: 'X' })).status, 401);
  assert.equal((await anon('POST', '/api/draw', {})).status, 401);
  assert.equal((await anon('POST', '/api/players', { name: 'X' }, { 'X-Bracket': '' })).status, 403);
  const other = apiClient(srv.base);
  for (let i = 0; i < 8; i++) assert.equal((await other('POST', '/api/unlock', { pin: '0000' }, { 'X-Forwarded-For': '10.9.9.9' })).status, 401);
  assert.equal((await other('POST', '/api/unlock', { pin: PIN }, { 'X-Forwarded-For': '10.9.9.9' })).status, 429);
  assert.equal((await anon('POST', '/api/unlock', { pin: PIN })).status, 200);
  assert.equal((await anon('GET', '/api/data')).data.canEdit, true);
  assert.equal((await anon('POST', '/api/lock')).status, 200);
  assert.equal((await anon('GET', '/api/status')).data.canEdit, false);
});

test('Daten nur bei Änderung neu senden', async () => {
  const d = await data();
  const same = (await api('GET', `/api/data?rev=${d.rev}&edit=true`)).data;
  assert.equal(same.same, true);
  const full = (await api('GET', `/api/data?rev=${d.rev}&edit=false`)).data;
  assert.ok(full.players, 'PIN-Status anders → alles neu');
});

test('Turnier-Einstellungen prüfen', async () => {
  assert.equal((await api('PUT', '/api/tournament', { date: '14.11.2030' })).status, 400);
  assert.equal((await api('PUT', '/api/tournament', { start: '25:00' })).status, 400);
  assert.equal((await api('PUT', '/api/tournament', { start: '9:05', changeMin: 999, name: '' })).status, 200);
  const t = (await data()).tournament;
  assert.equal(t.start, '09:05');
  assert.equal(t.changeMin, 120);
  assert.equal(t.name, 'Game-Turnier');
  await api('PUT', '/api/tournament', { start: '13:00', changeMin: 5 });
});

test('Teilnehmer: hinzufügen, doppelt, umbenennen, löschen', async () => {
  assert.equal((await api('POST', '/api/players', { name: '  ' })).status, 400);
  const r = (await api('POST', '/api/players', { names: ['anna', 'Ivo'], allGames: true })).data;
  assert.equal(r.added.length, 1, 'anna gibt es schon');
  const ivo = r.added[0];
  let d = await data();
  assert.ok(d.games.every((g) => g.players.includes(ivo.id)));
  assert.equal((await api('PUT', `/api/players/${ivo.id}`, { name: 'Ben' })).status, 400);
  assert.equal((await api('PUT', `/api/players/${ivo.id}`, { name: 'Ivo M.' })).status, 200);
  assert.equal((await api('PUT', '/api/players/nixda', { name: 'Y' })).status, 404);
  assert.equal((await api('DELETE', `/api/players/${ivo.id}`)).status, 200);
  d = await data();
  assert.equal(d.players.length, 8);
  assert.ok(d.games.every((g) => !g.players.includes(ivo.id)));
});

test('Spiele: Einstellungen prüfen, verschieben', async () => {
  assert.equal((await api('POST', '/api/games', { name: '' })).status, 400);
  assert.equal((await api('PUT', `/api/games/${games.g1.id}`, { bestOf: 2 })).status, 400);
  assert.equal((await api('PUT', `/api/games/${games.g1.id}`, { koSize: 6 })).status, 400);
  assert.equal((await api('PUT', `/api/games/${games.g1.id}`, { stations: [] })).status, 200);
  assert.deepEqual((await data()).games[0].stations, ['Station 1']);
  await api('PUT', `/api/games/${games.g1.id}`, { stations: ['Tisch 1', 'Tisch 2'] });
  const { data: g3 } = await api('POST', '/api/games', { name: 'Darts', allPlayers: false });
  assert.deepEqual(g3.game.players, []);
  await api('POST', `/api/games/${g3.game.id}/move`, { dir: -1 });
  assert.equal((await data()).games[1].name, 'Darts');
  await api('POST', `/api/games/${g3.game.id}/move`, { dir: -1 });
  await api('POST', `/api/games/${g3.game.id}/move`, { dir: -1 }); // schon zuoberst
  assert.equal((await data()).games[0].name, 'Darts');
  assert.equal((await api('POST', '/api/games/nixda/move', { dir: 1 })).status, 404);
  assert.equal((await api('PUT', '/api/games/nixda', { name: 'x' })).status, 404);
  assert.equal((await api('DELETE', `/api/games/${g3.game.id}`)).status, 200);
  assert.equal((await data()).games.length, 2);
});

test('Wer spielt was: einzeln und alle', async () => {
  const d0 = await data();
  const p = d0.players[7];
  await api('POST', '/api/participation', { gameId: games.g2.id, playerId: p.id, on: false });
  let g2 = (await data()).games.find((g) => g.id === games.g2.id);
  assert.equal(g2.players.length, 7);
  await api('POST', '/api/participation', { gameId: games.g2.id, on: false });
  g2 = (await data()).games.find((g) => g.id === games.g2.id);
  assert.equal(g2.players.length, 0);
  await api('POST', '/api/participation', { gameId: games.g2.id, on: true });
  await api('POST', '/api/participation', { gameId: games.g2.id, playerId: p.id, on: false });
  g2 = (await data()).games.find((g) => g.id === games.g2.id);
  assert.equal(g2.players.length, 7);
  assert.equal((await api('POST', '/api/participation', { gameId: 'nix', on: true })).status, 404);
});

test('Auslosung: alle Spiele, Gruppen gemäss Einstellung, Tauschen', async () => {
  const r = (await api('POST', '/api/draw', {})).data;
  assert.equal(r.drawn.length, 2);
  const d = await data();
  assert.equal(d.draws[games.g1.id].groups.length, 2);
  assert.equal(d.draws[games.g2.id].groups.length, 3); // 7 Spieler, max 3 pro Gruppe
  const [ga, gb] = d.draws[games.g1.id].groups;
  assert.equal((await api('POST', `/api/draw/${games.g1.id}/swap`, { a: ga[0], b: gb[0] })).status, 200);
  const after = (await data()).draws[games.g1.id].groups;
  assert.equal(after[0][0], gb[0]);
  assert.equal((await api('POST', `/api/draw/${games.g1.id}/swap`, { a: ga[0], b: 'nix' })).status, 400);
  // Nochmals «alle» → nichts Neues (schon ausgelost)
  assert.equal((await api('POST', '/api/draw', {})).data.drawn.length, 0);
});

test('Nach der Auslosung: Änderungen am Feld brauchen Bestätigung', async () => {
  const d = await data();
  const p = d.players[7];
  let r = await api('POST', '/api/participation', { gameId: games.g2.id, playerId: p.id, on: true });
  assert.equal(r.status, 409);
  assert.equal(r.data.needsForce, true);
  r = await api('PUT', `/api/games/${games.g1.id}`, { groupSize: 3 });
  assert.equal(r.status, 409);
  r = await api('PUT', `/api/games/${games.g1.id}`, { roundMin: 12, advance: 2 });
  assert.equal(r.status, 200, 'Dauer ändern geht immer');
  r = await api('DELETE', `/api/players/${p.id}`);
  assert.equal(r.status, 409);
  // Mit Bestätigung: neu auslosen nötig
  r = await api('POST', '/api/participation', { gameId: games.g2.id, playerId: p.id, on: true, force: true });
  assert.equal(r.status, 200);
  assert.equal((await data()).draws[games.g2.id], undefined);
  await api('POST', '/api/draw', { gameId: games.g2.id });
  assert.equal((await data()).draws[games.g2.id].groups.length, 3);
});

test('Ohne PIN: neue Resultate und «Start» ja, ändern, löschen und Setup nein', async () => {
  const anon = apiClient(srv.base);
  let d = await data();
  assert.equal(d.tournament.openResults, true, 'Standard: offen');
  const g1 = d.games.find((g) => g.id === games.g1.id);
  const [m1, m2] = resolveGame(g1, d).matches.filter((m) => m.phase === 'group');
  assert.equal((await anon('POST', `/api/live/${m1.id}`, { station: 0 })).status, 200);
  assert.equal((await anon('DELETE', `/api/live/${m1.id}`)).status, 200);
  assert.equal((await anon('POST', `/api/results/${m1.id}`, { a: 3, b: 1 })).status, 200);
  assert.deepEqual([(await data()).results[m1.id].a, (await data()).results[m1.id].b], [3, 1]);
  let r = await anon('POST', `/api/results/${m1.id}`, { a: 1, b: 3 });
  assert.equal(r.status, 401);
  assert.match(r.data.error, /ändern geht nur mit der Turnier-PIN/);
  assert.equal((await anon('DELETE', `/api/results/${m1.id}`)).status, 401);
  assert.equal((await anon('PUT', '/api/tournament', { openResults: false })).status, 401);
  assert.equal((await anon('POST', '/api/players', { name: 'Zoe' })).status, 401);
  // Im Setup ausgeschaltet: alles nur mit PIN
  assert.equal((await api('PUT', '/api/tournament', { openResults: false })).status, 200);
  assert.equal((await anon('POST', `/api/results/${m2.id}`, { a: 1, b: 0 })).status, 401);
  assert.equal((await anon('POST', `/api/live/${m2.id}`, {})).status, 401);
  assert.equal((await api('POST', `/api/results/${m2.id}`, { a: 1, b: 0 })).status, 200, 'mit PIN geht es');
  await api('PUT', '/api/tournament', { openResults: true });
  // Aufräumen für die folgenden Tests
  await api('DELETE', `/api/results/${m1.id}`);
  await api('DELETE', `/api/results/${m2.id}`);
  d = await data();
  assert.deepEqual(d.results, {});
});

test('Resultate: Gruppe, KO, Regeln und Abhängigkeiten', async () => {
  let d = await data();
  const g1 = d.games.find((g) => g.id === games.g1.id);
  let r = resolveGame(g1, d);
  const groupMs = r.matches.filter((m) => m.phase === 'group');
  assert.equal(groupMs.length, 12);
  const ko0 = r.matches.find((m) => m.phase === 'ko');
  assert.equal((await api('POST', `/api/results/${ko0.id}`, { a: 1, b: 0 })).status, 400, 'Gegner noch offen');
  assert.equal((await api('POST', `/api/results/${groupMs[0].id}`, { a: -1, b: 0 })).status, 400);
  assert.equal((await api('POST', '/api/results/nix:G0:a:b', { a: 1, b: 0 })).status, 404);
  assert.equal((await api('POST', `/api/results/${games.g1.id}:G9:a:b`, { a: 1, b: 0 })).status, 404);
  // Läuft …
  assert.equal((await api('POST', `/api/live/${groupMs[0].id}`, { station: 1 })).status, 200);
  d = await data();
  assert.equal(d.live[groupMs[0].id].station, 1);
  assert.equal((await api('DELETE', `/api/live/${groupMs[0].id}`)).status, 200);
  await api('POST', `/api/live/${groupMs[0].id}`, { station: 99 });
  assert.equal((await data()).live[groupMs[0].id].station, null);
  // Alle Gruppenspiele: wer zuerst in der Liste steht, gewinnt
  for (const m of groupMs) assert.equal((await api('POST', `/api/results/${m.id}`, { a: 2, b: 1 })).status, 200);
  assert.equal((await api('POST', `/api/live/${groupMs[0].id}`, {})).status, 400, 'hat schon Resultat');
  d = await data();
  r = resolveGame(g1, d);
  assert.equal(r.groupsDone, true);
  const ko = r.matches.filter((m) => m.phase === 'ko');
  assert.ok(ko[0].a && ko[0].b);
  assert.equal((await api('POST', `/api/results/${ko[0].id}`, { a: 1, b: 1 })).status, 400, 'kein Unentschieden im KO');
  assert.equal((await api('POST', `/api/results/${ko[0].id}`, { a: 3, b: 1 })).status, 200);
  assert.equal((await api('POST', `/api/results/${ko[1].id}`, { a: 0, b: 2 })).status, 200);
  d = await data();
  r = resolveGame(g1, d);
  const final = r.matches.find((m) => m.roundName === 'Final');
  assert.equal((await api('POST', `/api/results/${final.id}`, { a: 1, b: 0 })).status, 200);
  // Halbfinal ändern: gleicher Sieger geht, anderer Sieger nur mit Bestätigung
  assert.equal((await api('POST', `/api/results/${ko[0].id}`, { a: 4, b: 1 })).status, 200);
  let res = await api('POST', `/api/results/${ko[0].id}`, { a: 1, b: 4 });
  assert.equal(res.status, 409);
  assert.equal(res.data.affected, 1);
  res = await api('POST', `/api/results/${ko[0].id}`, { a: 1, b: 4, force: true });
  assert.equal(res.status, 200);
  d = await data();
  assert.equal(d.results[final.id], undefined, 'Final wurde gelöscht');
  assert.ok(d.results[ko[0].id].editedAt);
  // Gruppenresultat ändern, wenn KO schon läuft → Bestätigung, dann KO weg
  res = await api('POST', `/api/results/${groupMs[0].id}`, { a: 0, b: 0 });
  assert.equal(res.status, 409);
  res = await api('POST', `/api/results/${groupMs[0].id}`, { a: 0, b: 0, force: true });
  assert.equal(res.status, 200);
  d = await data();
  assert.ok(!Object.keys(d.results).some((k) => k.startsWith(games.g1.id + ':K')));
  // Löschen
  assert.equal((await api('DELETE', `/api/results/${groupMs[1].id}`)).status, 200);
  assert.equal((await api('DELETE', `/api/results/${groupMs[1].id}`)).status, 200, 'zweimal ist egal');
  assert.equal((await data()).results[groupMs[1].id], undefined);
});

test('KO-Löschung mit Folgespielen und Best of 3', async () => {
  let d = await data();
  const g2 = d.games.find((g) => g.id === games.g2.id);
  let r = resolveGame(g2, d);
  // Eindeutige Tabelle (kein Stechen): wer zuerst erfasst wurde, gewinnt
  const order = d.players.map((p) => p.id);
  for (const m of r.matches.filter((x) => x.phase === 'group')) {
    await api('POST', `/api/results/${m.id}`, order.indexOf(m.a) < order.indexOf(m.b) ? { a: 1, b: 0 } : { a: 0, b: 1 });
  }
  d = await data();
  r = resolveGame(g2, d);
  assert.equal(r.matches.filter((m) => m.stechen).length, 0);
  const [s1, s2] = r.matches.filter((m) => m.roundName === 'Halbfinal');
  assert.equal((await api('POST', `/api/results/${s1.id}`, { a: 3, b: 0 })).status, 400, 'Best of 3: zuerst 2');
  await api('POST', `/api/results/${s1.id}`, { a: 2, b: 1 });
  await api('POST', `/api/results/${s2.id}`, { a: 0, b: 2 });
  d = await data();
  r = resolveGame(g2, d);
  const third = r.matches.find((m) => m.third);
  await api('POST', `/api/results/${third.id}`, { a: 2, b: 0 });
  assert.equal((await api('DELETE', `/api/results/${s1.id}`)).status, 409);
  assert.equal((await api('DELETE', `/api/results/${s1.id}?force=1`)).status, 200);
  d = await data();
  assert.equal(d.results[third.id], undefined);
});

test('Einstellungen nach Resultaten: KO-Modus ändern löscht nur KO, Gruppengrösse alles', async () => {
  let d = await data();
  const g2 = d.games.find((g) => g.id === games.g2.id);
  const r = resolveGame(g2, d);
  const [s1] = r.matches.filter((m) => m.roundName === 'Halbfinal');
  await api('POST', `/api/results/${s1.id}`, { a: 2, b: 0 });
  assert.equal((await api('PUT', `/api/games/${g2.id}`, { thirdPlace: false })).status, 409);
  assert.equal((await api('PUT', `/api/games/${g2.id}`, { thirdPlace: false, force: true })).status, 200);
  d = await data();
  assert.ok(!Object.keys(d.results).some((k) => k.startsWith(g2.id + ':K')));
  assert.ok(Object.keys(d.results).some((k) => k.startsWith(g2.id + ':G')));
  await api('PUT', `/api/games/${g2.id}`, { stations: ['Konsole'] });
  assert.equal((await api('POST', '/api/draw', { gameId: g2.id })).status, 409);
  assert.equal((await api('DELETE', `/api/draw/${g2.id}`)).status, 409);
  assert.equal((await api('PUT', `/api/games/${g2.id}`, { groupSize: 4, force: true })).status, 200);
  d = await data();
  assert.equal(d.draws[g2.id], undefined);
  assert.ok(!Object.keys(d.results).some((k) => k.startsWith(g2.id + ':')));
  // Zu wenig Teilnehmer
  await api('POST', '/api/participation', { gameId: g2.id, on: false });
  assert.equal((await api('POST', '/api/draw', { gameId: g2.id })).data.drawn[0].skipped, 'zu wenig Teilnehmer');
  await api('POST', '/api/participation', { gameId: g2.id, on: true });
  assert.equal((await api('POST', '/api/draw', { gameId: g2.id })).status, 200);
  assert.equal((await api('DELETE', `/api/draw/${g2.id}`)).status, 200);
  assert.equal((await api('POST', `/api/draw/${g2.id}/swap`, { a: 'x', b: 'y' })).status, 400);
});

test('Stechen über die API: eintragen, kein Unentschieden, wird bei Gruppenänderung gelöscht', async () => {
  const { data: gx } = await api('POST', '/api/games', { name: 'Stechtest', groupSize: 3, advance: 1, stations: ['S'] });
  const g = gx.game;
  await api('POST', '/api/participation', { gameId: g.id, on: false });
  let d = await data();
  for (const p of d.players.slice(0, 3)) await api('POST', '/api/participation', { gameId: g.id, playerId: p.id, on: true });
  await api('POST', '/api/draw', { gameId: g.id });
  d = await data();
  let r = resolveGame(d.games.find((x) => x.id === g.id), d);
  // Alle Gruppenspiele 1:1 → dreifacher Gleichstand
  for (const m of r.matches) await api('POST', `/api/results/${m.id}`, { a: 1, b: 1 });
  d = await data();
  r = resolveGame(d.games.find((x) => x.id === g.id), d);
  const st = r.matches.filter((m) => m.stechen);
  assert.equal(st.length, 3);
  assert.equal((await api('POST', `/api/results/${st[0].id}`, { a: 1, b: 1 })).status, 400);
  const anon = apiClient(srv.base);
  assert.equal((await anon('POST', `/api/results/${st[0].id}`, { a: 2, b: 1 })).status, 200, 'Stechen ohne PIN eintragbar');
  // Gruppenresultat ändern → Stechen hinfällig, nur mit Bestätigung
  const gm = r.matches.find((m) => !m.stechen);
  const res = await api('POST', `/api/results/${gm.id}`, { a: 2, b: 1 });
  assert.equal(res.status, 409);
  assert.match(res.data.error, /Stechen/);
  assert.equal((await api('POST', `/api/results/${gm.id}`, { a: 2, b: 1, force: true })).status, 200);
  d = await data();
  assert.ok(!Object.keys(d.results).some((k) => k.includes(':S0:')));
  // Löschen eines Stechens mit späteren Runden
  await api('POST', `/api/results/${gm.id}`, { a: 1, b: 1 });
  d = await data();
  r = resolveGame(d.games.find((x) => x.id === g.id), d);
  const s0 = r.matches.filter((m) => m.stechen);
  for (const m of s0) await api('POST', `/api/results/${m.id}`, { a: 1, b: 0 }); // a gewinnt je nach Paarung – evtl. Kreis
  d = await data();
  r = resolveGame(d.games.find((x) => x.id === g.id), d);
  const s1 = r.matches.filter((m) => m.stechen && m.stechenRound === 1);
  if (s1.length) {
    await api('POST', `/api/results/${s1[0].id}`, { a: 1, b: 0 });
    assert.equal((await api('DELETE', `/api/results/${s0[0].id}`)).status, 409);
    assert.equal((await api('DELETE', `/api/results/${s0[0].id}?force=1`)).status, 200);
    d = await data();
    assert.equal(d.results[s1[0].id], undefined);
  } else {
    assert.equal((await api('DELETE', `/api/results/${s0[0].id}`)).status, 200);
  }
  await api('DELETE', `/api/games/${g.id}`);
});

test('Sicherung, Wiederherstellung, neues Turnier, PIN ändern', async () => {
  const backup = (await api('GET', '/api/backup')).data;
  assert.equal(backup.app, 'bracket');
  assert.equal(backup.players.length, NAMES.length);
  assert.equal((await api('POST', '/api/restore', { app: 'x' })).status, 400);
  assert.equal((await api('POST', '/api/backups')).status, 200);
  const list = (await api('GET', '/api/backups')).data.backups;
  assert.ok(list.length >= 1);
  assert.equal((await api('GET', `/api/backups/${list[0].name}`)).status, 200);
  assert.equal((await api('GET', '/api/backups/nix.json')).status, 404);
  assert.equal((await api('POST', '/api/backups/nix.json/restore')).status, 404);
  // Neues Turnier: Resultate weg, Teilnehmer und Spiele bleiben
  let r = await api('POST', '/api/reset', { mode: 'results' });
  assert.match(r.data.backup, /^vor-neuem-turnier/);
  let d = await data();
  assert.deepEqual(d.results, {});
  assert.deepEqual(d.draws, {});
  assert.equal(d.players.length, NAMES.length);
  // Wiederherstellen aus Datei
  assert.equal((await api('POST', '/api/restore', backup)).status, 200);
  d = await data();
  assert.ok(Object.keys(d.results).length > 0);
  // Aus Server-Sicherung
  assert.equal((await api('POST', `/api/backups/${r.data.backup}/restore`)).status, 200);
  // Alles löschen
  await api('POST', '/api/reset', { mode: 'all' });
  d = await data();
  assert.equal(d.players.length, 0);
  assert.equal(d.games.length, 0);
  // PIN ändern: dieses Gerät bleibt freigeschaltet, andere nicht
  const other = apiClient(srv.base);
  await other('POST', '/api/unlock', { pin: PIN });
  assert.equal((await api('POST', '/api/pin', { pin: 'abc' })).status, 400);
  assert.equal((await api('POST', '/api/pin', { pin: '2468' })).status, 200);
  assert.equal((await api('GET', '/api/status')).data.canEdit, true);
  assert.equal((await other('GET', '/api/status')).data.canEdit, false);
});

test('Unbekannte Aufrufe, Oberfläche und Service Worker', async () => {
  assert.equal((await api('GET', '/api/nix')).status, 404);
  assert.equal((await api('POST', '/api/data', {})).status, 404);
  const html = await fetch(srv.base + '/irgendwo');
  assert.equal(html.status, 200);
  assert.match(await html.text(), /<title>Bracket<\/title>/);
  const sw = await (await fetch(srv.base + '/sw.js')).text();
  assert.ok(!sw.includes('__VERSION__'));
  assert.equal((await fetch(srv.base + '/nix.css')).status, 404);
  assert.equal((await fetch(srv.base + '/..%2fpackage.json')).status, 403);
  const bad = await fetch(srv.base + '/api/unlock', { method: 'POST', headers: { 'X-Bracket': '1' }, body: '{kaputt' });
  assert.equal(bad.status, 400);
});
