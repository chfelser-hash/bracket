// Eingaben prüfen und bereinigen, bevor sie gespeichert werden.
import { httpError } from './auth.js';
import { DEFAULT_GAME, DEFAULT_TOURNAMENT } from '../public/js/turnier.js';

export const str = (v, max = 80) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function int(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function cleanName(v, what = 'Name') {
  const s = str(v, 40);
  if (!s) throw httpError(400, `${what} fehlt`);
  return s;
}

export function cleanTournament(b, cur = DEFAULT_TOURNAMENT) {
  const out = { ...cur };
  if (b.name !== undefined) out.name = str(b.name, 60) || DEFAULT_TOURNAMENT.name;
  if (b.date !== undefined) {
    const d = str(b.date, 10);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw httpError(400, 'Datum ungültig');
    out.date = d;
  }
  if (b.start !== undefined) {
    const s = str(b.start, 5);
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw httpError(400, 'Startzeit ungültig (z.B. 13:00)');
    out.start = m[1].padStart(2, '0') + ':' + m[2];
  }
  if (b.changeMin !== undefined) out.changeMin = int(b.changeMin, 0, 120, cur.changeMin);
  if (b.breakMin !== undefined) out.breakMin = int(b.breakMin, 0, 600, cur.breakMin);
  if (b.openResults !== undefined) out.openResults = !!b.openResults;
  return out;
}

/** Spiel-Einstellungen; Teilnehmer separat */
export function cleanGame(b, cur = { ...DEFAULT_GAME }) {
  const out = { ...cur };
  if (b.name !== undefined || !cur.name) out.name = cleanName(b.name, 'Name des Spiels');
  if (b.roundMin !== undefined) out.roundMin = int(b.roundMin, 1, 600, cur.roundMin ?? DEFAULT_GAME.roundMin);
  if (b.groupSize !== undefined) out.groupSize = int(b.groupSize, 1, 64, cur.groupSize ?? DEFAULT_GAME.groupSize);
  if (b.advance !== undefined) out.advance = int(b.advance, 1, 64, cur.advance ?? DEFAULT_GAME.advance);
  if (b.koSize !== undefined) {
    const k = int(b.koSize, 0, 128, 0);
    if (k && ![2, 4, 8, 16, 32, 64, 128].includes(k)) throw httpError(400, 'KO-Grösse: automatisch, 2, 4, 8, 16, 32 …');
    out.koSize = k;
  }
  if (b.bestOf !== undefined) {
    const bo = int(b.bestOf, 1, 9, 1);
    if (bo % 2 === 0) throw httpError(400, '«Best of» braucht eine ungerade Zahl (1, 3, 5 …)');
    out.bestOf = bo;
  }
  if (b.thirdPlace !== undefined) out.thirdPlace = !!b.thirdPlace;
  if (b.stations !== undefined) {
    const list = (Array.isArray(b.stations) ? b.stations : []).map((s) => str(s, 30)).filter(Boolean).slice(0, 20);
    out.stations = list.length ? list : ['Station 1'];
  }
  if (b.icon !== undefined) out.icon = str(b.icon, 8);
  return out;
}

/** Ändert sich durch diese Einstellungen die Auslosung (Gruppen) oder nur der Baum/Zeitplan? */
export const drawRelevant = (before, after) => before.groupSize !== after.groupSize;
