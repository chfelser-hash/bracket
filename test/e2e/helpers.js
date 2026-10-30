// Hilfsfunktionen für die End-to-End-Tests: Server mit leerem Datenordner starten, API-Zugriff, Testdaten.
// Es werden ausschliesslich erfundene Beispieldaten verwendet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Startet Bracket auf einem freien Port mit leerem Datenordner – im selben Prozess, damit die
 * Testabdeckung auch den Server-Code erfasst. Pro Testdatei genau einmal aufrufen.
 */
export async function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bracket-e2e-'));
  const port = 18000 + Math.floor(Math.random() * 20000);
  Object.assign(process.env, { PORT: String(port), DATA_DIR: dataDir, HOST: '127.0.0.1' });
  const log = [];
  const orig = console.log;
  console.log = (...a) => log.push(a.join(' '));
  const mod = await import(path.join(ROOT, 'server/index.js'));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + '/api/status')).ok) break;
    } catch { /* noch nicht bereit */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  return {
    base,
    dataDir,
    log: () => log.join('\n'),
    readData: () => JSON.parse(fs.readFileSync(path.join(dataDir, 'bracket.json'), 'utf8')),
    async stop() {
      mod.server.closeAllConnections?.();
      await new Promise((r) => mod.server.close(() => r()));
      console.log = orig;
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Kleiner API-Client mit Geräte-Cookie */
export function apiClient(base) {
  let cookie = '';
  return async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'X-Bracket': '1', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
}

export const PIN = '4711';
export const NAMES = ['Anna', 'Ben', 'Carla', 'Dario', 'Elif', 'Finn', 'Gina', 'Hugo'];

/** PIN, Teilnehmer und zwei Spiele anlegen */
export async function seed(api) {
  await api('POST', '/api/setup', { pin: PIN, name: 'Testturnier' });
  await api('PUT', '/api/tournament', { date: '2030-11-14', start: '13:00', changeMin: 5, breakMin: 30 });
  await api('POST', '/api/players', { names: NAMES });
  const { data: g1 } = await api('POST', '/api/games', { name: 'Tischfussball', roundMin: 10, groupSize: 4, advance: 2, stations: ['Tisch 1', 'Tisch 2'] });
  const { data: g2 } = await api('POST', '/api/games', { name: 'Rennspiel', roundMin: 8, groupSize: 3, advance: 1, koSize: 4, bestOf: 3, stations: ['Konsole'] });
  return { g1: g1.game, g2: g2.game };
}
