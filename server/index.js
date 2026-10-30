// Bracket – Game-Turnier. Server ohne externe Abhängigkeiten (nur Node.js >= 20), Aufbau wie Kässeli und Reisli.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, newId, migrate } from './store.js';
import { Auth, httpError } from './auth.js';
import { cleanName, cleanTournament, cleanGame, str } from './clean.js';
import { createUpdater, parseChangelog } from './update.js';
import { resolveGame, buildGroups, checkResult, DEFAULT_GAME } from '../public/js/turnier.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT || 8082);
const HOST = process.env.HOST || '0.0.0.0';
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
let CHANGELOG = [];
try { CHANGELOG = parseChangelog(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')); } catch { /* ohne */ }
const VERSION_DATE = CHANGELOG.find((x) => x.version === VERSION)?.date || '';
const updater = createUpdater({ root: process.env.UPDATE_ROOT || ROOT, version: VERSION, enabled: process.env.UPDATE_ENABLED !== 'false' });
const RESTART_ON_UPDATE = process.env.RESTART_ON_UPDATE === 'true';

const store = new Store(DATA_DIR);
const auth = new Auth(DATA_DIR);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// ---------- Hilfsfunktionen ----------
function send(res, status, body, headers = {}) {
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(httpError(413, 'Zu gross')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (!buf.length) return resolve({});
      try { resolve(JSON.parse(buf.toString('utf8'))); } catch { reject(httpError(400, 'Ungültiges JSON')); }
    });
    req.on('error', reject);
  });
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(req, token, maxAge) {
  const secure = process.env.COOKIE_SECURE === 'true' || req.headers['x-forwarded-proto'] === 'https';
  return `bsid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

const clientIp = (req) => String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const attachment = (name) => `attachment; filename="${name.replace(/[^\w.\- ]/g, '_')}"`;

function publicData(canEdit) {
  const { rev, updatedAt, tournament, players, games, draws, results, live } = store.data;
  return { rev, updatedAt, tournament, players, games, draws, results, live, canEdit, needsSetup: !auth.hasPin, version: VERSION, versionDate: VERSION_DATE, serverTime: Date.now() };
}

const findGame = (d, id) => d.games.find((g) => g.id === id) || (() => { throw httpError(404, 'Spiel nicht gefunden'); })();
const findPlayer = (d, id) => d.players.find((p) => p.id === id) || (() => { throw httpError(404, 'Teilnehmer nicht gefunden'); })();
const ofGame = (gid, phase) => (mid) => mid.startsWith(gid + ':' + (phase === 'ko' ? 'K' : phase === 'group' ? 'G' : ''));
const hasResults = (d, gid, phase) => Object.keys(d.results).some(ofGame(gid, phase));

function clearGame(d, gid, phase) {
  const hit = ofGame(gid, phase);
  for (const k of Object.keys(d.results)) if (hit(k)) delete d.results[k];
  for (const k of Object.keys(d.live)) if (hit(k)) delete d.live[k];
}

function undraw(d, gid) {
  delete d.draws[gid];
  clearGame(d, gid);
}

/** Konflikt melden, den man mit force:true bewusst übersteuern kann */
const conflict = (message, extra = {}) => httpError(409, message, { needsForce: true, ...extra });

/** Alle Matches, die (direkt oder indirekt) vom Ergebnis eines KO-Matches abhängen */
function dependents(matches, id) {
  const out = new Set();
  let added = true;
  while (added) {
    added = false;
    for (const m of matches) {
      if (out.has(m.id) || !(m.deps || []).some((dd) => dd === id || out.has(dd))) continue;
      out.add(m.id);
      added = true;
    }
  }
  return out;
}

function findMatch(d, mid) {
  const gid = mid.split(':')[0];
  const game = findGame(d, gid);
  const r = resolveGame(game, d);
  const m = r.matches.find((x) => x.id === mid);
  if (!m) throw httpError(404, 'Match nicht gefunden (neu ausgelost?)');
  return { game, r, m };
}

/** Prüft, ob ein Resultat geändert/gelöscht werden darf; mit force werden betroffene Resultate gelöscht */
function guardResultChange(d, game, r, m, force, newRes) {
  const res = d.results;
  if (m.phase === 'group') {
    if (!hasResults(d, game.id, 'ko')) return;
    if (!force) throw conflict(`${game.name}: Die Finalrunde hat schon Resultate. Eine Änderung in der Gruppe kann die Paarungen verändern – die KO-Resultate werden dann gelöscht.`);
    clearGame(d, game.id, 'ko');
    return;
  }
  const old = res[m.id];
  const sameWinner = old && newRes && (old.a > old.b) === (newRes.a > newRes.b);
  if (sameWinner) return;
  const deps = [...dependents(r.matches, m.id)].filter((id) => res[id] || d.live[id]);
  if (!deps.length) return;
  if (!force) throw conflict('Danach wurde schon weitergespielt. Wenn der Sieger ändert, werden die Resultate der folgenden Runden gelöscht.', { affected: deps.length });
  for (const id of deps) { delete res[id]; delete d.live[id]; }
}

// ---------- API ----------
async function api(req, res, url) {
  const method = req.method;
  const p = url.pathname;
  const token = cookies(req).bsid;
  const canEdit = auth.canEdit(token);

  // Schutz gegen Cross-Site-Requests: alle schreibenden Aufrufe brauchen diesen Header
  if (method !== 'GET' && req.headers['x-bracket'] !== '1') throw httpError(403, 'Fehlender Header');

  if (p === '/api/status' && method === 'GET') return send(res, 200, { needsSetup: !auth.hasPin, canEdit, version: VERSION });
  if (p === '/api/data' && method === 'GET') {
    const since = Number(url.searchParams.get('rev'));
    if (since && since === store.rev && url.searchParams.get('edit') === String(canEdit)) return send(res, 200, { rev: store.rev, same: true, serverTime: Date.now() });
    return send(res, 200, publicData(canEdit));
  }
  if (p === '/api/setup' && method === 'POST') {
    if (auth.hasPin) throw httpError(403, 'Bereits eingerichtet');
    const b = await readBody(req);
    auth.setPin(b.pin);
    if (b.name !== undefined) store.mutate((d) => { d.tournament = cleanTournament({ name: b.name }, d.tournament); });
    const t = auth.unlock(b.pin, clientIp(req));
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, t, 30 * 86400) });
  }
  if (p === '/api/unlock' && method === 'POST') {
    const b = await readBody(req);
    const t = auth.unlock(b.pin, clientIp(req));
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, t, 30 * 86400) });
  }
  if (p === '/api/lock' && method === 'POST') {
    auth.lock(token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  // Ab hier: nur mit PIN
  if (!canEdit) throw httpError(401, auth.hasPin ? 'Zum Eintragen bitte die Turnier-PIN eingeben' : 'Bitte zuerst einrichten');

  if (p === '/api/pin' && method === 'POST') {
    const b = await readBody(req);
    auth.setPin(b.pin);
    const t = auth.unlock(b.pin, clientIp(req));
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, t, 30 * 86400) });
  }

  if (p === '/api/tournament' && method === 'PUT') {
    const b = await readBody(req);
    store.mutate((d) => { d.tournament = cleanTournament(b, d.tournament); });
    return send(res, 200, { rev: store.rev });
  }

  // ----- Teilnehmer -----
  if (p === '/api/players' && method === 'POST') {
    const b = await readBody(req);
    const names = (Array.isArray(b.names) ? b.names : [b.name]).map((n) => str(n, 40)).filter(Boolean);
    if (!names.length) throw httpError(400, 'Name fehlt');
    const added = store.mutate((d) => {
      const out = [];
      for (const name of names) {
        if (d.players.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
        const pl = { id: newId(), name };
        d.players.push(pl);
        out.push(pl);
        // Neue Teilnehmer machen bei allen noch nicht ausgelosten Spielen mit, wenn gewünscht
        if (b.allGames) for (const g of d.games) if (!d.draws[g.id]) g.players.push(pl.id);
      }
      return out;
    });
    return send(res, 200, { rev: store.rev, added });
  }
  let m = p.match(/^\/api\/players\/([\w]+)$/);
  if (m && method === 'PUT') {
    const b = await readBody(req);
    store.mutate((d) => {
      const pl = findPlayer(d, m[1]);
      const name = cleanName(b.name);
      if (d.players.some((x) => x.id !== pl.id && x.name.toLowerCase() === name.toLowerCase())) throw httpError(400, 'Diesen Namen gibt es schon');
      pl.name = name;
    });
    return send(res, 200, { rev: store.rev });
  }
  if (m && method === 'DELETE') {
    const force = url.searchParams.get('force') === '1';
    store.mutate((d) => {
      findPlayer(d, m[1]);
      const drawn = d.games.filter((g) => d.draws[g.id] && g.players.includes(m[1]));
      if (drawn.length && !force) throw conflict(`Ist schon ausgelost bei: ${drawn.map((g) => g.name).join(', ')}. Diese Auslosungen (und Resultate) werden gelöscht.`);
      for (const g of drawn) undraw(d, g.id);
      d.players = d.players.filter((x) => x.id !== m[1]);
      for (const g of d.games) g.players = g.players.filter((x) => x !== m[1]);
    });
    return send(res, 200, { rev: store.rev });
  }

  // ----- Spiele -----
  if (p === '/api/games' && method === 'POST') {
    const b = await readBody(req);
    const game = store.mutate((d) => {
      const g = { id: newId(), ...cleanGame(b, { ...DEFAULT_GAME, stations: [...DEFAULT_GAME.stations], name: '' }), players: b.allPlayers === false ? [] : d.players.map((x) => x.id) };
      d.games.push(g);
      return g;
    });
    return send(res, 200, { rev: store.rev, game });
  }
  m = p.match(/^\/api\/games\/([\w]+)$/);
  if (m && method === 'PUT') {
    const b = await readBody(req);
    const force = !!b.force;
    store.mutate((d) => {
      const g = findGame(d, m[1]);
      const next = cleanGame(b, g);
      if (d.draws[g.id]) {
        if (next.groupSize !== g.groupSize) {
          if (!force) throw conflict(`${g.name} ist schon ausgelost. Eine neue Gruppengrösse braucht eine neue Auslosung – die bisherigen Gruppen${hasResults(d, g.id) ? ' und Resultate' : ''} werden gelöscht.`);
          undraw(d, g.id);
        } else if ((next.advance !== g.advance || next.koSize !== g.koSize || next.thirdPlace !== g.thirdPlace) && hasResults(d, g.id, 'ko')) {
          if (!force) throw conflict(`${g.name}: Die Finalrunde hat schon Resultate. Mit dem neuen Modus werden diese gelöscht.`);
          clearGame(d, g.id, 'ko');
        }
        // Weniger Stationen: laufende Matches auf gestrichenen Stationen behalten keine Station
        for (const [mid, lv] of Object.entries(d.live)) if (mid.startsWith(g.id + ':') && lv.station >= next.stations.length) lv.station = null;
      }
      Object.assign(g, next);
    });
    return send(res, 200, { rev: store.rev });
  }
  if (m && method === 'DELETE') {
    store.mutate((d) => {
      findGame(d, m[1]);
      undraw(d, m[1]);
      d.games = d.games.filter((g) => g.id !== m[1]);
    });
    return send(res, 200, { rev: store.rev });
  }
  m = p.match(/^\/api\/games\/([\w]+)\/move$/);
  if (m && method === 'POST') {
    const b = await readBody(req);
    store.mutate((d) => {
      const i = d.games.findIndex((g) => g.id === m[1]);
      if (i < 0) throw httpError(404, 'Spiel nicht gefunden');
      const j = i + (b.dir < 0 ? -1 : 1);
      if (j < 0 || j >= d.games.length) return;
      [d.games[i], d.games[j]] = [d.games[j], d.games[i]];
    });
    return send(res, 200, { rev: store.rev });
  }

  // ----- Wer spielt was -----
  if (p === '/api/participation' && method === 'POST') {
    const b = await readBody(req);
    store.mutate((d) => {
      const g = findGame(d, b.gameId);
      const ids = b.playerId ? [findPlayer(d, b.playerId).id] : d.players.map((x) => x.id);
      const next = new Set(g.players);
      for (const id of ids) if (b.on) next.add(id); else next.delete(id);
      const changed = next.size !== g.players.length || g.players.some((x) => !next.has(x));
      if (!changed) return;
      if (d.draws[g.id]) {
        if (!b.force) throw conflict(`${g.name} ist schon ausgelost. Wer mitspielt, ändert die Gruppen – das Spiel muss neu ausgelost werden${hasResults(d, g.id) ? ' (bisherige Resultate werden gelöscht)' : ''}.`);
        undraw(d, g.id);
      }
      g.players = d.players.map((x) => x.id).filter((id) => next.has(id));
    });
    return send(res, 200, { rev: store.rev });
  }

  // ----- Auslosung -----
  if (p === '/api/draw' && method === 'POST') {
    const b = await readBody(req);
    const r = store.mutate((d) => {
      const games = b.gameId ? [findGame(d, b.gameId)] : d.games.filter((g) => !d.draws[g.id]);
      const withResults = games.filter((g) => hasResults(d, g.id) || Object.keys(d.live).some(ofGame(g.id)));
      if (withResults.length && !b.force) throw conflict(`Es gibt schon Resultate bei: ${withResults.map((g) => g.name).join(', ')}. Eine neue Auslosung löscht sie.`);
      const out = [];
      for (const g of games) {
        if (g.players.length < 2) { out.push({ id: g.id, skipped: 'zu wenig Teilnehmer' }); continue; }
        undraw(d, g.id);
        d.draws[g.id] = { groups: buildGroups(g.players, g.groupSize), at: new Date().toISOString() };
        out.push({ id: g.id, groups: d.draws[g.id].groups.length });
      }
      return out;
    });
    return send(res, 200, { rev: store.rev, drawn: r });
  }
  m = p.match(/^\/api\/draw\/([\w]+)$/);
  if (m && method === 'DELETE') {
    const force = url.searchParams.get('force') === '1';
    store.mutate((d) => {
      findGame(d, m[1]);
      if (hasResults(d, m[1]) && !force) throw conflict('Es gibt schon Resultate – sie werden mit der Auslosung gelöscht.');
      undraw(d, m[1]);
    });
    return send(res, 200, { rev: store.rev });
  }
  // Gruppen von Hand anpassen: zwei Spieler tauschen
  m = p.match(/^\/api\/draw\/([\w]+)\/swap$/);
  if (m && method === 'POST') {
    const b = await readBody(req);
    store.mutate((d) => {
      const draw = d.draws[m[1]];
      if (!draw) throw httpError(400, 'Noch nicht ausgelost');
      if (hasResults(d, m[1]) || Object.keys(d.live).some(ofGame(m[1]))) throw httpError(409, 'Es wird schon gespielt – Tauschen geht nur vor dem ersten Resultat');
      const pos = (id) => { for (const [gi, g] of draw.groups.entries()) { const k = g.indexOf(id); if (k >= 0) return [gi, k]; } throw httpError(400, 'Spieler nicht in diesem Spiel'); };
      const [ga, ka] = pos(b.a), [gb, kb] = pos(b.b);
      [draw.groups[ga][ka], draw.groups[gb][kb]] = [draw.groups[gb][kb], draw.groups[ga][ka]];
    });
    return send(res, 200, { rev: store.rev });
  }

  // ----- Resultate -----
  m = p.match(/^\/api\/results\/([\w:]+)$/);
  if (m && method === 'POST') {
    const b = await readBody(req);
    const a = Number(b.a), bb = Number(b.b);
    store.mutate((d) => {
      const { game, r, m: match } = findMatch(d, m[1]);
      if (!match.a || !match.b) throw httpError(400, 'Die Gegner stehen noch nicht fest');
      const err = checkResult(game, match, a, bb);
      if (err) throw httpError(400, err);
      guardResultChange(d, game, r, match, !!b.force, { a, b: bb });
      const old = d.results[match.id];
      d.results[match.id] = { a, b: bb, at: old?.at || Date.now() };
      if (old) d.results[match.id].editedAt = Date.now();
    });
    return send(res, 200, { rev: store.rev });
  }
  if (m && method === 'DELETE') {
    const force = url.searchParams.get('force') === '1';
    store.mutate((d) => {
      const { game, r, m: match } = findMatch(d, m[1]);
      if (!d.results[match.id]) return;
      guardResultChange(d, game, r, match, force, null);
      delete d.results[match.id];
      delete d.live[match.id];
    });
    return send(res, 200, { rev: store.rev });
  }
  // Match läuft (für den Live-Zeitplan)
  m = p.match(/^\/api\/live\/([\w:]+)$/);
  if (m && method === 'POST') {
    const b = await readBody(req);
    store.mutate((d) => {
      const { game, m: match } = findMatch(d, m[1]);
      if (!match.a || !match.b) throw httpError(400, 'Die Gegner stehen noch nicht fest');
      if (d.results[match.id]) throw httpError(400, 'Dieses Match hat schon ein Resultat');
      const st = Number.isInteger(b.station) && b.station >= 0 && b.station < game.stations.length ? b.station : null;
      d.live[match.id] = { startedAt: Date.now(), station: st };
    });
    return send(res, 200, { rev: store.rev });
  }
  if (m && method === 'DELETE') {
    store.mutate((d) => { delete d.live[m[1]]; });
    return send(res, 200, { rev: store.rev });
  }

  // ----- Neues Turnier, Sicherung -----
  if (p === '/api/reset' && method === 'POST') {
    const b = await readBody(req);
    const backup = store.snapshot('vor-neuem-turnier');
    store.mutate((d) => {
      d.draws = {}; d.results = {}; d.live = {};
      if (b.mode === 'all') { d.players = []; d.games = []; }
    });
    return send(res, 200, { rev: store.rev, backup });
  }
  if (p === '/api/backup' && method === 'GET') {
    const { tournament, players, games, draws, results, live } = store.data;
    const body = { app: 'bracket', schema: 1, exportedAt: new Date().toISOString(), tournament, players, games, draws, results, live };
    return send(res, 200, JSON.stringify(body), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': attachment(`bracket-sicherung-${new Date().toISOString().slice(0, 10)}.json`) });
  }
  if (p === '/api/restore' && method === 'POST') {
    const b = await readBody(req);
    if (!b || b.app !== 'bracket' || !Array.isArray(b.players) || !Array.isArray(b.games)) throw httpError(400, 'Keine gültige Bracket-Sicherung');
    const { tournament, players, games, draws, results, live } = b;
    store.replaceAll(migrate({ tournament, players, games, draws, results, live }));
    return send(res, 200, { rev: store.rev });
  }
  if (p === '/api/backups' && method === 'GET') return send(res, 200, { backups: store.listBackups() });
  if (p === '/api/backups' && method === 'POST') return send(res, 200, { name: store.snapshot('manuell'), backups: store.listBackups() });
  m = p.match(/^\/api\/backups\/([\w.-]+\.json)$/);
  if (m && method === 'GET') {
    const data = store.readBackup(m[1]);
    if (!data) throw httpError(404, 'Sicherung nicht gefunden');
    return send(res, 200, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': attachment(m[1]) });
  }
  m = p.match(/^\/api\/backups\/([\w.-]+\.json)\/restore$/);
  if (m && method === 'POST') {
    const data = store.readBackup(m[1]);
    if (!data) throw httpError(404, 'Sicherung nicht gefunden');
    store.replaceAll(data);
    return send(res, 200, { rev: store.rev });
  }

  // ----- Aktualisieren -----
  if (p === '/api/update' && method === 'GET') return send(res, 200, await updater.check());
  if (p === '/api/update' && method === 'POST') {
    const b = await readBody(req);
    const backup = store.snapshot('vor-update-' + String(b.version || '').replace(/[^\d.]/g, ''));
    const r = await updater.apply(b.version);
    send(res, 200, { ...r, backup, restart: RESTART_ON_UPDATE });
    // Docker startet den Container neu (restart: unless-stopped) – mit dem neuen Programmcode
    if (RESTART_ON_UPDATE) setTimeout(() => process.exit(0), 500);
    return;
  }

  throw httpError(404, 'Unbekannter API-Aufruf');
}

// ---------- Statische Dateien ----------
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Verboten');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Nicht gefunden');
    const ext = path.extname(file);
    // Service Worker: Cache-Name an die Version koppeln → jede neue Version lädt die Oberfläche frisch
    if (rel === '/sw.js') buf = Buffer.from(buf.toString('utf8').replaceAll('__VERSION__', VERSION));
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'");
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Interner Fehler' : e.message, ...(e.extra || {}) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Bracket läuft auf http://localhost:${PORT}  (Daten: ${DATA_DIR})`);
  if (!auth.hasPin) console.log('Noch keine Turnier-PIN – beim ersten Aufruf wird sie festgelegt.');
});

// Sauber beenden (Docker stop, Ctrl+C): laufende Anfragen fertig, dann aus
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

export { server };
