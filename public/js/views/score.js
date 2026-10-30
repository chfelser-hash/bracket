// Resultat eintragen: zwei grosse Hälften – Namen antippen zählt hoch, Zahl lässt sich auch direkt tippen.
import { h, modal, toast } from '../ui.js';
import { api, refresh, state, askPin } from '../app.js';
import { checkResult, winsNeeded } from '../turnier.js';
import { matchTitle, stationName } from './shared.js';

export async function openScore(c, m) {
  if (!state.data.canEdit && !(await askPin())) return;
  const game = c.game(m.gameId);
  const r = m.result;
  const val = { a: r?.a ?? 0, b: r?.b ?? 0 };
  const err = h('p', { class: 'form-error', hidden: true, role: 'alert' });
  const need = m.phase === 'ko' ? winsNeeded(game.bestOf) : null;

  const half = (k) => {
    const input = h('input', {
      class: 'score-num', type: 'number', inputmode: 'numeric', min: 0, max: 999, value: String(val[k]),
      'aria-label': `Punkte ${c.name(m[k])}`,
      oninput: () => { val[k] = Math.max(0, Math.round(Number(input.value) || 0)); update(); },
      onfocus: () => input.select(),
    });
    const set = (v) => { val[k] = Math.max(0, Math.min(999, v)); input.value = String(val[k]); update(); };
    return h('div', { class: 'score-half', dataset: { side: k } },
      h('button', { type: 'button', class: 'score-name', onclick: () => set(val[k] + 1), title: 'Antippen: +1' }, c.name(m[k])),
      input,
      h('div', { class: 'score-steps' },
        h('button', { type: 'button', class: 'sstep', 'aria-label': 'minus 1', onclick: () => set(val[k] - 1) }, '−'),
        h('button', { type: 'button', class: 'sstep', 'aria-label': 'plus 1', onclick: () => set(val[k] + 1) }, '+')));
  };
  const A = half('a'), B = half('b');
  const verdict = h('p', { class: 'score-verdict' });
  function update() {
    A.classList.toggle('lead', val.a > val.b);
    B.classList.toggle('lead', val.b > val.a);
    const e = checkResult(game, m, val.a, val.b);
    verdict.textContent = e && m.phase === 'ko' ? e
      : val.a === val.b ? 'Unentschieden – je 1 Punkt'
      : `${c.name(val.a > val.b ? m.a : m.b)} gewinnt${m.phase === 'group' ? ' – 3 Punkte' : ''}`;
    verdict.classList.toggle('bad', !!e);
    err.hidden = true;
  }
  update();

  const where = [c.game(m.gameId)?.name, matchTitle(m), stationName(game, m.slot)].filter(Boolean).join(' · ');
  const body = h('div', { class: 'score' },
    h('p', { class: 'score-where', style: { '--c': c.color(m.gameId) } }, where),
    need ? h('p', { class: 'hint' }, `Best of ${game.bestOf}: Runden zählen – wer zuerst ${need} hat, ist weiter.`)
      : m.phase === 'ko' ? h('p', { class: 'hint' }, 'KO: Es braucht einen Sieger, kein Unentschieden.') : null,
    h('div', { class: 'score-board' }, A, h('span', { class: 'score-colon', 'aria-hidden': 'true' }, ':'), B),
    verdict, err);

  const save = async (force = false) => {
    const e = checkResult(game, m, val.a, val.b);
    if (e) { err.textContent = e; err.hidden = false; return false; }
    try {
      const res = await api('POST', `/api/results/${m.id}`, { a: val.a, b: val.b, ...(force ? { force } : {}) }, { confirmTitle: 'Resultat ändern', confirmLabel: 'Ändern' });
      if (res === null) return false;
    } catch (ex) { err.textContent = ex.message; err.hidden = false; return false; }
    return true;
  };
  const buttons = [{ label: 'Abbrechen', value: null }];
  if (r) buttons.push({
    label: 'Löschen', danger: true, onClick: async () => {
      try {
        const res = await api('DELETE', `/api/results/${m.id}`, undefined, { confirmTitle: 'Resultat löschen', confirmLabel: 'Löschen' });
        return res === null ? false : 'deleted';
      } catch (ex) { err.textContent = ex.message; err.hidden = false; return false; }
    },
  });
  buttons.push({ label: 'Resultat speichern', primary: true, onClick: async () => ((await save()) ? 'saved' : false) });
  const out = await modal(r ? 'Resultat ändern' : 'Resultat eintragen', body, buttons);
  if (out === 'saved') toast(`Gespeichert: ${c.name(m.a)} ${val.a} : ${val.b} ${c.name(m.b)}`);
  if (out === 'deleted') toast('Resultat gelöscht');
  if (out) await refresh(true);
}

/** Match als «läuft» markieren (für den Live-Zeitplan) oder wieder zurücknehmen */
export async function toggleLive(m, station) {
  if (!state.data.canEdit && !(await askPin())) return;
  try {
    if (m.live) await api('DELETE', `/api/live/${m.id}`);
    else await api('POST', `/api/live/${m.id}`, { station: station ?? m.slot?.station ?? null });
    await refresh(true);
  } catch (e) { toast(e.message, { error: true }); }
}
