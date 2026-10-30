// Bracket – Turnier-Logik. Wird von Browser, Server und Tests gemeinsam genutzt (keine Abhängigkeiten).
//
// Ablauf pro Spiel: Teilnehmer → Gruppen (zufällig) → jeder gegen jeden → Tabellen → KO-Baum.
// Der Zeitplan verteilt alle Matches aller Spiele auf die Stationen (parallel), ohne dass jemand gleichzeitig
// an zwei Orten spielt. Erst alle Gruppenphasen, dann die Pause, dann alle Finalrunden.

export const POINTS = { win: 3, draw: 1, loss: 0 };

/** Regel bei Punktgleichheit – wird in der App so angezeigt */
export const TIEBREAK_RULES = [
  'Punkte (Sieg 3, Unentschieden 1, Niederlage 0)',
  'Tordifferenz',
  'Mehr erzielte Tore',
  'Direktbegegnung (Punkte, Tordifferenz, Tore nur unter den Punktgleichen)',
  'Los (Reihenfolge der Auslosung)',
];

export const DEFAULT_GAME = { roundMin: 10, stations: ['Station 1'], groupSize: 4, advance: 2, koSize: 0, bestOf: 1, thirdPlace: true };
export const DEFAULT_TOURNAMENT = { name: 'Game-Turnier', date: '', start: '13:00', changeMin: 5, breakMin: 30 };

// ---------- Zufall (reproduzierbar, damit Tests stabil sind) ----------
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Gruppen ----------
/** Anzahl Gruppen: so wenige wie möglich, keine grösser als groupSize; Grössen unterscheiden sich höchstens um 1 */
export function groupCount(n, groupSize) {
  const size = Math.max(1, Number(groupSize) || 1);
  return n ? Math.ceil(n / size) : 0;
}

export function buildGroups(playerIds, groupSize, rand = Math.random) {
  const ids = shuffle(playerIds, rand);
  const g = groupCount(ids.length, groupSize);
  const groups = Array.from({ length: g }, () => []);
  ids.forEach((id, i) => groups[i % g].push(id));
  return groups;
}

export const groupName = (i) => (i < 26 ? String.fromCharCode(65 + i) : 'G' + (i + 1));

/** Jeder gegen jeden (Kreis-Methode): Runden, in denen jeder höchstens einmal spielt */
export function roundRobin(ids) {
  const list = [...ids];
  if (list.length < 2) return [];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      if (a !== null && b !== null) pairs.push(r % 2 && i === 0 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

// ---------- Tabellen ----------
function emptyRow(id, order) {
  return { id, order, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
}

function tally(ids, matches, results) {
  const rows = new Map(ids.map((id, i) => [id, emptyRow(id, i)]));
  for (const m of matches) {
    const r = results[m.id];
    if (!r || !rows.has(m.a) || !rows.has(m.b)) continue;
    const A = rows.get(m.a), B = rows.get(m.b);
    A.played++; B.played++;
    A.gf += r.a; A.ga += r.b; B.gf += r.b; B.ga += r.a;
    if (r.a > r.b) { A.w++; B.l++; A.pts += POINTS.win; B.pts += POINTS.loss; }
    else if (r.a < r.b) { B.w++; A.l++; B.pts += POINTS.win; A.pts += POINTS.loss; }
    else { A.d++; B.d++; A.pts += POINTS.draw; B.pts += POINTS.draw; }
  }
  for (const row of rows.values()) row.gd = row.gf - row.ga;
  return rows;
}

const cmpMain = (x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf;

/** Tabelle einer Gruppe, sortiert nach TIEBREAK_RULES. ids = Reihenfolge der Auslosung (= Los). */
export function standings(ids, matches, results) {
  const rows = [...tally(ids, matches, results).values()];
  rows.sort(cmpMain);
  // Gleichstand nach Punkten/Tordifferenz/Toren → Direktbegegnung unter genau diesen Teams, dann Los
  const out = [];
  for (let i = 0; i < rows.length;) {
    let j = i + 1;
    while (j < rows.length && cmpMain(rows[i], rows[j]) === 0) j++;
    const tied = rows.slice(i, j);
    if (tied.length > 1) {
      const sub = tally(tied.map((t) => t.id), matches, results);
      tied.sort((x, y) => {
        const a = sub.get(x.id), b = sub.get(y.id);
        return cmpMain(a, b) || x.order - y.order;
      });
      const h2hDecides = tied.some((t, k) => k > 0 && cmpMain(sub.get(tied[k - 1].id), sub.get(t.id)) !== 0);
      for (const t of tied) t.tie = h2hDecides ? 'direkt' : 'los';
    }
    out.push(...tied);
    i = j;
  }
  out.forEach((r, i) => { r.rank = i + 1; });
  return out;
}

// ---------- KO-Baum ----------
const nextPow2 = (n) => { let p = 1; while (p < n) p *= 2; return p; };

/** Reihenfolge der Setzplätze im Baum: 1 und 2 treffen sich erst im Final */
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const m = order.length * 2;
    order = order.flatMap((s) => [s, m + 1 - s]);
  }
  return order;
}

export function roundName(teams) {
  if (teams === 2) return 'Final';
  if (teams === 4) return 'Halbfinal';
  if (teams === 8) return 'Viertelfinal';
  if (teams === 16) return 'Achtelfinal';
  return `Runde der ${teams}`;
}

/** Wer kommt weiter? Liste der Setzplätze als {group, place} oder {best: place, rank} */
export function qualifierSlots(game, groups) {
  const sizes = groups.map((g) => g.length);
  const n = sizes.reduce((a, b) => a + b, 0);
  const advance = Math.max(1, Number(game.advance) || 1);
  const auto = sizes.reduce((a, s) => a + Math.min(advance, s), 0);
  const want = Math.min(n, Number(game.koSize) > 0 ? Number(game.koSize) : auto);
  const slots = [];
  for (let place = 1; slots.length < want && place <= Math.max(0, ...sizes); place++) {
    const withPlace = groups.map((_, gi) => gi).filter((gi) => sizes[gi] >= place);
    const left = want - slots.length;
    if (left >= withPlace.length) for (const gi of withPlace) slots.push({ group: gi, place });
    else for (let k = 1; k <= left; k++) slots.push({ best: place, rank: k });
  }
  return slots;
}

export function slotLabel(slot) {
  if (!slot) return 'Freilos';
  if (slot.best) return `${slot.rank}. bester Gruppen-${slot.best}.`;
  return `${slot.place}. Gruppe ${groupName(slot.group)}`;
}

/**
 * In der ersten KO-Runde sollen sich nicht zwei aus derselben Gruppe treffen. Wo das passiert, wird der
 * schlechter Gesetzte mit einem Gleichplatzierten (z.B. einem anderen Gruppenzweiten) eines anderen Duells getauscht.
 */
function avoidSameGroup(slots, order, q) {
  const pairs = [];
  for (let i = 0; i < order.length; i += 2) if (order[i] <= q && order[i + 1] <= q) pairs.push([Math.min(order[i], order[i + 1]), Math.max(order[i], order[i + 1])]);
  const grp = (s) => slots[s - 1]?.group;
  const clash = (a, b) => grp(a) !== undefined && grp(a) === grp(b);
  for (let guard = 0; guard < 50; guard++) {
    const bad = pairs.find(([a, b]) => clash(a, b));
    if (!bad) return;
    const [s, t] = bad;
    let done = false;
    for (const other of pairs) {
      if (other === bad) continue;
      for (const k of [1, 0]) {
        const u = other[k], v = other[1 - k];
        if (slots[u - 1].place !== slots[t - 1].place || grp(u) === undefined) continue;
        if (grp(s) === grp(u) || grp(v) === grp(t)) continue;
        [slots[t - 1], slots[u - 1]] = [slots[u - 1], slots[t - 1]];
        done = true;
        break;
      }
      if (done) break;
    }
    if (!done) return; // nicht lösbar (z.B. nur eine Gruppe)
  }
}

/**
 * KO-Matches (Struktur, ohne Spieler): Freilose entfallen, ihr Gewinner rückt direkt nach.
 * Quellen: {seed: n} | {w: matchId} | {l: matchId}
 */
export function koStructure(game, groups) {
  const slots = qualifierSlots(game, groups);
  const q = slots.length;
  if (q < 2) return { slots, size: 0, rounds: [], matches: [] };
  const size = nextPow2(q);
  const order = seedOrder(size);
  avoidSameGroup(slots, order, q);
  let feed = order.map((s) => (s <= q ? { seed: s } : null)); // null = Freilos
  const matches = [];
  const rounds = [];
  let r = 0;
  while (feed.length > 1) {
    const teams = feed.length;
    const next = [];
    const roundIds = [];
    for (let i = 0; i < feed.length; i += 2) {
      const a = feed[i], b = feed[i + 1];
      if (!a || !b) { next.push(a || b); continue; }
      const id = `${game.id}:K${r}:${i / 2}`;
      matches.push({ id, gameId: game.id, phase: 'ko', round: r, idx: i / 2, num: roundIds.length + 1, roundName: roundName(teams), src: [a, b] });
      roundIds.push(id);
      next.push({ w: id });
    }
    rounds.push({ round: r, name: roundName(teams), ids: roundIds });
    feed = next;
    r++;
  }
  // Spiel um Platz 3: nur wenn beide Halbfinals echte Matches sind
  const semis = rounds.find((x) => x.name === 'Halbfinal');
  if (game.thirdPlace && semis && semis.ids.length === 2) {
    const final = matches[matches.length - 1];
    const id = `${game.id}:K3`;
    matches.splice(matches.length - 1, 0, { id, gameId: game.id, phase: 'ko', round: final.round, idx: 1, roundName: 'Spiel um Platz 3', src: semis.ids.map((m) => ({ l: m })), third: true });
  }
  return { slots, size, rounds, matches };
}

// ---------- Alle Matches eines Spiels (mit Spielern, soweit bekannt) ----------
export function groupMatches(game, groups) {
  const out = [];
  groups.forEach((ids, gi) => {
    roundRobin(ids).forEach((pairs, r) => {
      for (const [a, b] of pairs) out.push({ id: `${game.id}:G${gi}:${a}:${b}`, gameId: game.id, phase: 'group', group: gi, round: r, a, b });
    });
  });
  return out;
}

/** Dauer eines Matches in Minuten (KO mit «Best of» → Rundendauer × Anzahl möglicher Runden) */
export const matchMinutes = (game, m) => (Number(game.roundMin) || 1) * (m.phase === 'ko' ? Math.max(1, Number(game.bestOf) || 1) : 1);

/** Sieger im KO: wer mehr hat (Unentschieden ist dort nicht erlaubt) */
const koWinner = (m, r) => (!r || r.a === r.b ? null : r.a > r.b ? m.a : m.b);
const koLoser = (m, r) => (!r || r.a === r.b ? null : r.a > r.b ? m.b : m.a);

/**
 * Löst ein Spiel komplett auf: Gruppen, Tabellen, KO mit Spielern, Schlussrangliste.
 * state: { games, draws, results }
 */
export function resolveGame(game, state) {
  const draw = state.draws?.[game.id];
  const results = state.results || {};
  if (!draw) return { game, drawn: false, groups: [], tables: [], matches: [], ko: null, ranking: [] };
  const groups = draw.groups;
  const gm = groupMatches(game, groups);
  const tables = groups.map((ids, gi) => {
    const ms = gm.filter((m) => m.group === gi);
    const rows = standings(ids, ms, results);
    return { group: gi, name: groupName(gi), rows, complete: ms.every((m) => results[m.id]), matches: ms };
  });
  const groupsDone = tables.every((t) => t.complete);
  const ko = koStructure(game, groups);

  // Setzplätze auflösen, sobald alle Gruppen fertig sind
  const seedPlayer = {};
  if (groupsDone) {
    const best = {};
    ko.slots.forEach((slot, i) => {
      if (slot.group !== undefined) seedPlayer[i + 1] = tables[slot.group].rows[slot.place - 1]?.id ?? null;
      else {
        if (!best[slot.best]) {
          // Beste Gruppen-x.: pro Match gerechnet (Gruppen können verschieden gross sein)
          best[slot.best] = tables
            .map((t) => t.rows[slot.best - 1])
            .filter(Boolean)
            .map((row) => ({ row, pts: row.pts / Math.max(1, row.played), gd: row.gd / Math.max(1, row.played), gf: row.gf / Math.max(1, row.played) }))
            .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.row.order - y.row.order);
        }
        seedPlayer[i + 1] = best[slot.best][slot.rank - 1]?.row.id ?? null;
      }
    });
  }

  const byId = new Map();
  const koMatches = ko.matches.map((m) => {
    const side = (src) => {
      if (src.seed) return { id: seedPlayer[src.seed] ?? null, label: slotLabel(ko.slots[src.seed - 1]) };
      const ref = byId.get(src.w || src.l);
      const r = results[ref.id];
      const id = src.w ? koWinner(ref, r) : koLoser(ref, r);
      const single = ko.rounds.find((x) => x.round === ref.round)?.ids.length === 1;
      return { id, label: `${src.w ? 'Sieger' : 'Verlierer'} ${ref.roundName}${single ? '' : ' ' + ref.num}` };
    };
    const A = side(m.src[0]), B = side(m.src[1]);
    const full = { ...m, a: A.id, b: B.id, labelA: A.label, labelB: B.label, deps: m.src.filter((s) => !s.seed).map((s) => s.w || s.l) };
    byId.set(m.id, full);
    return full;
  });

  // Schlussrangliste
  let ranking = [];
  if (koMatches.length) {
    const final = koMatches.find((m) => m.roundName === 'Final');
    const third = koMatches.find((m) => m.third);
    const rf = results[final.id];
    if (rf) {
      ranking.push({ place: 1, id: koWinner(final, rf) }, { place: 2, id: koLoser(final, rf) });
      if (third && results[third.id]) ranking.push({ place: 3, id: koWinner(third, results[third.id]) }, { place: 4, id: koLoser(third, results[third.id]) });
      else if (!third) {
        const semis = koMatches.filter((m) => m.roundName === 'Halbfinal');
        for (const s of semis) if (results[s.id]) ranking.push({ place: 3, id: koLoser(s, results[s.id]) });
      }
    }
  } else if (groupsDone && tables.length === 1) {
    ranking = tables[0].rows.slice(0, 3).map((r, i) => ({ place: i + 1, id: r.id }));
  }

  return {
    game, drawn: true, groups, tables, groupsDone, ko, ranking,
    matches: [...gm, ...koMatches],
    done: ranking.length > 0 && ranking[0].id != null,
  };
}

// ---------- Resultat prüfen ----------
/** Fehlertext oder null. KO: kein Unentschieden; bei «Best of X» muss jemand die nötigen Siege haben. */
export function checkResult(game, match, a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 'Bitte ganze Zahlen ab 0 eingeben';
  if (a > 999 || b > 999) return 'Resultat zu gross';
  if (match.phase !== 'ko') return null;
  if (a === b) return 'Im KO gibt es kein Unentschieden';
  const bo = Math.max(1, Number(game.bestOf) || 1);
  if (bo > 1) {
    const need = Math.ceil(bo / 2) + (bo % 2 ? 0 : 1);
    if (Math.max(a, b) !== need) return `Best of ${bo}: Gewonnen hat, wer zuerst ${need} Runden hat`;
    if (a + b > bo) return `Best of ${bo}: höchstens ${bo} Runden`;
  }
  return null;
}

/** Wie viele Siege braucht es bei «Best of X» */
export const winsNeeded = (bestOf) => { const bo = Math.max(1, Number(bestOf) || 1); return bo === 1 ? null : Math.ceil(bo / 2) + (bo % 2 ? 0 : 1); };

// ---------- Zeitplan ----------
/**
 * Plant alle Matches aller Spiele.
 * opts: { base (ms, Turnierstart), now (ms, optional: ab dann wird live verschoben), changeMin, breakMin }
 * state: { games, draws, results, live: { [matchId]: { startedAt, station } } }
 * Liefert: { slots: Map(id → {start, end, station, status}), groupEnd, koStart, end, resolved: [resolveGame…] }
 */
export function schedule(state, opts) {
  const MIN = 60000;
  const change = (Number(opts.changeMin) || 0) * MIN;
  const pause = (Number(opts.breakMin) || 0) * MIN;
  const base = opts.base;
  const results = state.results || {};
  const live = state.live || {};
  const games = state.games || [];
  const resolved = games.map((g) => resolveGame(g, state));
  const started = Object.keys(results).length > 0 || Object.keys(live).length > 0;
  const now = opts.now != null && started ? opts.now : null;
  const lb0 = now != null ? Math.max(base, now) : base;

  const gameById = new Map(games.map((g) => [g.id, g]));
  const stationFree = new Map(games.map((g) => [g.id, (g.stations?.length ? g.stations : ['Station 1']).map(() => base)]));
  const playerFree = new Map();
  const slots = new Map();
  const bumpPlayer = (id, t) => { if (id) playerFree.set(id, Math.max(playerFree.get(id) || 0, t)); };

  const all = resolved.flatMap((r, gi) => r.matches.map((m) => ({ ...m, gi })));
  // Fixe Matches: fertig oder laufend
  for (const m of all) {
    const g = gameById.get(m.gameId);
    const dur = matchMinutes(g, m) * MIN;
    const res = results[m.id], lv = live[m.id];
    if (!res && !lv) continue;
    let start, end, status;
    if (res) {
      end = res.at || (lv?.startedAt ? lv.startedAt + dur : base);
      start = lv?.startedAt ?? end - dur;
      status = 'done';
    } else {
      start = lv.startedAt;
      end = Math.max(start + dur, now ?? start + dur);
      status = 'running';
    }
    const st = Number.isInteger(lv?.station) ? lv.station : null;
    if (st !== null && stationFree.get(m.gameId)[st] !== undefined) {
      const arr = stationFree.get(m.gameId);
      arr[st] = Math.max(arr[st], end + change);
    }
    bumpPlayer(m.a, end + change);
    bumpPlayer(m.b, end + change);
    slots.set(m.id, { start, end, station: st, status });
  }

  const plan = (list, lb) => {
    // Reihenfolge: Runde → Spiel → Gruppe/Position, damit alle Spiele gleichmässig vorankommen
    const pending = list.filter((m) => !slots.has(m.id)).sort((x, y) => x.round - y.round || x.gi - y.gi || (y.third ? 1 : 0) - (x.third ? 1 : 0) || (x.group ?? 0) - (y.group ?? 0) || (x.idx ?? 0) - (y.idx ?? 0));
    while (pending.length) {
      let best = null, bestT = Infinity, bestSt = 0;
      for (let k = 0; k < pending.length; k++) {
        const m = pending[k];
        let t = lb;
        let ready = true;
        for (const d of m.deps || []) {
          const s = slots.get(d);
          if (!s) { ready = false; break; }
          t = Math.max(t, s.end + change);
        }
        if (!ready) continue;
        t = Math.max(t, playerFree.get(m.a) || 0, playerFree.get(m.b) || 0);
        const arr = stationFree.get(m.gameId);
        let st = 0;
        for (let i = 1; i < arr.length; i++) if (arr[i] < arr[st]) st = i;
        t = Math.max(t, arr[st]);
        if (t < bestT) { best = k; bestT = t; bestSt = st; }
      }
      if (best === null) break; // sollte nicht vorkommen
      const m = pending.splice(best, 1)[0];
      const g = gameById.get(m.gameId);
      const end = bestT + matchMinutes(g, m) * MIN;
      stationFree.get(m.gameId)[bestSt] = end + change;
      bumpPlayer(m.a, end + change);
      bumpPlayer(m.b, end + change);
      slots.set(m.id, { start: bestT, end, station: bestSt, status: 'open' });
    }
  };

  const groupList = all.filter((m) => m.phase === 'group');
  const koList = all.filter((m) => m.phase === 'ko');
  plan(groupList, lb0);
  const groupEnd = groupList.length ? Math.max(...groupList.map((m) => slots.get(m.id)?.end ?? base)) : base;
  const anyKoStarted = koList.some((m) => results[m.id] || live[m.id]);
  const koStart = groupList.length ? groupEnd + pause : base;
  plan(koList, Math.max(anyKoStarted ? lb0 : koStart, lb0));
  const end = all.length ? Math.max(...all.map((m) => slots.get(m.id)?.end ?? base)) : base;
  return { slots, groupEnd, koStart, end, resolved, matches: all };
}

/** Basis-Zeitpunkt aus Datum + Startzeit (lokale Zeit) */
export function baseTime(t, today = new Date()) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(t?.date || '') ? t.date : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const s = /^\d{1,2}:\d{2}$/.test(t?.start || '') ? t.start.padStart(5, '0') : '13:00';
  return new Date(`${d}T${s}:00`).getTime();
}

/** Kurze Übersicht für die Einstellungen: Gruppen, Matches, KO-Grösse */
export function gamePreview(game, nPlayers) {
  const g = groupCount(nPlayers, game.groupSize);
  const sizes = Array.from({ length: g }, (_, i) => Math.floor(nPlayers / g) + (i < nPlayers % g ? 1 : 0));
  const groupGames = sizes.reduce((a, s) => a + (s * (s - 1)) / 2, 0);
  const fake = sizes.map((s, gi) => Array.from({ length: s }, (_, k) => `${gi}-${k}`));
  const ko = koStructure({ ...game, id: 'x' }, fake);
  return { groups: g, sizes, groupGames, qualifiers: ko.slots.length, koMatches: ko.matches.length, koFirst: ko.rounds[0]?.name || null, byes: ko.size ? ko.size - ko.slots.length : 0 };
}
