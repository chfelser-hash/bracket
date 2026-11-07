// Setup: Turnier, Teilnehmer, Spiele mit Modus, wer spielt was, Auslosung, PIN, Sicherung, Update.
import { h, modal, toast, confirmDialog } from '../ui.js';
import { state, api, act, refresh, askPin, lockDevice, render } from '../app.js';
import { gamePreview, groupName, winsNeeded } from '../turnier.js';
import { fmtTime, fmtDate, empty } from './shared.js';

const field = (label, input, hint) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);

export function renderSetup(main, c) {
  const d = state.data;
  if (d.needsSetup) return main.replaceChildren(firstRun());
  if (!d.canEdit) {
    main.replaceChildren(
      h('h1', { class: 'page-title' }, 'Setup'),
      empty('Teilnehmer, Spiele und Modus ändern geht nur mit der Turnier-PIN.', h('button', { class: 'btn primary', onclick: askPin }, 'Mit PIN entsperren')),
      about());
    return;
  }
  const sub = location.hash.split('/')[1];
  main.replaceChildren(
    h('h1', { class: 'page-title' }, 'Setup'),
    h('nav', { class: 'toc' }, [['turnier', 'Turnier'], ['teilnehmer', 'Teilnehmer'], ['spiele', 'Spiele'], ['wer', 'Wer spielt was'], ['auslosung', 'Auslosung'], ['mehr', 'PIN & Sicherung']]
      .map(([id, l]) => h('a', { href: '#setup/' + id, onclick: (e) => { e.preventDefault(); document.getElementById('s-' + id)?.scrollIntoView({ behavior: 'smooth' }); } }, l))),
    tournamentBlock(d, c),
    playersBlock(d),
    gamesBlock(d, c),
    matrixBlock(d, c),
    drawBlock(d, c),
    pinBlock(),
    backupBlock(),
    about());
  if (sub && main.dataset.jumped !== location.hash) {
    main.dataset.jumped = location.hash;
    setTimeout(() => document.getElementById('s-' + sub)?.scrollIntoView(), 0);
  }
}

const block = (id, title, ...children) => h('section', { class: 'block setup', id: 's-' + id }, h('h2', null, title), ...children);

// ---------- Erster Start ----------
function firstRun() {
  const name = h('input', { name: 'name', value: 'Game-Turnier', maxlength: 60, required: true });
  const pin = h('input', { name: 'pin', type: 'password', inputmode: 'numeric', autocomplete: 'new-password', placeholder: '4 bis 12 Ziffern' });
  const pin2 = h('input', { name: 'pin2', type: 'password', inputmode: 'numeric', autocomplete: 'new-password' });
  const err = h('p', { class: 'form-error', hidden: true });
  const form = h('form', {
    class: 'first-run',
    onsubmit: async (e) => {
      e.preventDefault();
      if (pin.value !== pin2.value) { err.textContent = 'Die beiden PINs stimmen nicht überein'; err.hidden = false; return; }
      try {
        await api('POST', '/api/setup', { name: name.value, pin: pin.value });
        await refresh(true);
        toast('Eingerichtet – jetzt Teilnehmer und Spiele erfassen');
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    },
  },
  h('img', { src: '/icons/icon.svg', alt: '', class: 'first-logo' }),
  h('h1', null, 'Turnier einrichten'),
  h('p', null, 'Anschauen kann jeder mit dem Link. Zum Eintragen und Einrichten braucht es eine PIN – die gibst du den Mitspielenden am Turnier.'),
  field('Name des Turniers', name),
  field('Turnier-PIN', pin),
  field('PIN wiederholen', pin2),
  err,
  h('button', { class: 'btn primary', type: 'submit' }, 'Einrichten'));
  return form;
}

// ---------- Turnier ----------
function tournamentBlock(d, c) {
  const t = d.tournament;
  const save = (k) => async (e) => {
    const v = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    await act('PUT', '/api/tournament', { [k]: v });
  };
  return block('turnier', 'Turnier',
    h('div', { class: 'form-grid' },
      field('Name', h('input', { value: t.name, maxlength: 60, onchange: save('name') })),
      field('Datum', h('input', { type: 'date', value: t.date, onchange: save('date') }), t.date ? null : 'Ohne Datum: heute'),
      field('Startzeit', h('input', { type: 'time', value: t.start, onchange: save('start') })),
      field('Wechselzeit', h('span', { class: 'unit' }, h('input', { type: 'number', min: 0, max: 120, value: t.changeMin, onchange: save('changeMin') }), 'min'), 'Zwischen zwei Matches, für Spieler und Station'),
      field('Pause vor der Finalrunde', h('span', { class: 'unit' }, h('input', { type: 'number', min: 0, max: 600, value: t.breakMin, onchange: save('breakMin') }), 'min'))),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: t.openResults !== false, onchange: (e) => act('PUT', '/api/tournament', { openResults: e.target.checked }, { done: e.target.checked ? 'Resultate gehen jetzt ohne PIN' : 'Resultate nur noch mit PIN' }) }),
      'Spieler dürfen Resultate ohne PIN eintragen und Matches starten'),
    h('p', { class: 'hint' }, 'Ändern oder Löschen eines Resultats und das ganze Setup brauchen immer die PIN.'),
    c.list.length ? h('p', { class: 'hint' }, `Mit dem aktuellen Plan: Start ${fmtTime(c.base)}${t.date ? ' am ' + fmtDate(t.date) : ''}, Ende ca. ${fmtTime(c.sc.end)}.`) : null);
}

// ---------- Teilnehmer ----------
function playersBlock(d) {
  const input = h('textarea', { rows: 1, placeholder: 'Name – mehrere mit Komma oder je Zeile', 'aria-label': 'Neue Teilnehmer' });
  const all = h('input', { type: 'checkbox', checked: true });
  const add = async () => {
    const names = input.value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const r = await act('POST', '/api/players', { names, allGames: all.checked });
    if (r) {
      const skipped = names.length - r.added.length;
      toast(`${r.added.length} hinzugefügt${skipped ? `, ${skipped} gab es schon` : ''}`);
      setTimeout(() => document.querySelector('#s-teilnehmer textarea')?.focus(), 50);
    }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); } });
  return block('teilnehmer', `Teilnehmer (${d.players.length})`,
    d.players.length ? h('ul', { class: 'people' }, d.players.map((p) => h('li', null,
      h('span', null, p.name),
      h('button', { class: 'icon-btn', 'aria-label': `${p.name} umbenennen`, onclick: () => renamePlayer(p) }, '✎'),
      h('button', { class: 'icon-btn', 'aria-label': `${p.name} löschen`, onclick: () => deletePlayer(p) }, '✕')))) : h('p', { class: 'muted' }, 'Noch niemand erfasst.'),
    h('div', { class: 'add-row' }, input, h('button', { class: 'btn primary', onclick: add }, 'Hinzufügen')),
    h('label', { class: 'check' }, all, 'Neue spielen bei allen noch nicht ausgelosten Spielen mit'));
}

async function renamePlayer(p) {
  const input = h('input', { value: p.name, maxlength: 40 });
  const r = await modal('Umbenennen', field('Name', input), [{ label: 'Abbrechen', value: null }, { label: 'Speichern', primary: true, onClick: () => input.value }]);
  if (r) await act('PUT', `/api/players/${p.id}`, { name: r });
}

async function deletePlayer(p) {
  if (!(await confirmDialog('Teilnehmer löschen', `${p.name} aus dem Turnier löschen?`, 'Löschen', true))) return;
  await act('DELETE', `/api/players/${p.id}`, undefined, { confirmTitle: 'Auslosung betroffen', confirmLabel: 'Löschen', done: 'Gelöscht' });
}

// ---------- Spiele ----------
function gameSummary(g) {
  const st = g.stations.length;
  return [
    `${g.roundMin} min pro Runde`,
    st > 1 ? `${st} Stationen` : g.stations[0],
    g.groupSize === 1 ? 'nur KO' : `Gruppen à ${g.groupSize}, ${g.advance} weiter`,
    g.koSize ? `KO mit ${g.koSize}` : null,
    g.bestOf > 1 ? `KO Best of ${g.bestOf}` : null,
    g.thirdPlace ? 'Spiel um Platz 3' : null,
    `${g.players.length} Teilnehmer`,
  ].filter(Boolean).join(' · ');
}

function gamesBlock(d, c) {
  return block('spiele', `Spiele (${d.games.length})`,
    d.games.length ? h('ul', { class: 'games' }, d.games.map((g, i) => h('li', { style: { '--c': c.color(g.id) } },
      h('div', { class: 'grow' }, h('strong', null, g.name), h('p', { class: 'small muted' }, gameSummary(g))),
      h('button', { class: 'icon-btn', 'aria-label': 'nach oben', disabled: i === 0, onclick: () => act('POST', `/api/games/${g.id}/move`, { dir: -1 }) }, '↑'),
      h('button', { class: 'icon-btn', 'aria-label': 'nach unten', disabled: i === d.games.length - 1, onclick: () => act('POST', `/api/games/${g.id}/move`, { dir: 1 }) }, '↓'),
      h('button', { class: 'btn small', onclick: () => editGame(g) }, 'Bearbeiten')))) : h('p', { class: 'muted' }, 'Noch keine Spiele. Pro Spiel legst du Rundendauer, Stationen und Modus fest.'),
    h('button', { class: 'btn primary', onclick: () => editGame(null) }, '+ Spiel'));
}

async function editGame(g) {
  const d = state.data;
  const cur = g || { name: '', roundMin: 10, stations: ['Station 1'], groupSize: 4, advance: 2, koSize: 0, bestOf: 1, thirdPlace: true, players: d.players.map((p) => p.id) };
  const name = h('input', { value: cur.name, maxlength: 40, placeholder: 'z.B. Mario Kart, Tischfussball' });
  const roundMin = h('input', { type: 'number', min: 1, max: 600, value: cur.roundMin });
  const groupSize = h('input', { type: 'number', min: 1, max: 64, value: cur.groupSize });
  const advance = h('input', { type: 'number', min: 1, max: 64, value: cur.advance });
  const koSize = h('select', null, [[0, 'automatisch'], [2, '2 (nur Final)'], [4, '4 (ab Halbfinal)'], [8, '8 (ab Viertelfinal)'], [16, '16 (ab Achtelfinal)'], [32, '32']]
    .map(([v, l]) => h('option', { value: v, selected: Number(cur.koSize) === v }, l)));
  const bestOf = h('select', null, [1, 3, 5, 7].map((v) => h('option', { value: v, selected: Number(cur.bestOf) === v }, v === 1 ? '1 Runde' : `Best of ${v} (wer zuerst ${winsNeeded(v)} hat)`)));
  const third = h('input', { type: 'checkbox', checked: !!cur.thirdPlace });
  const stations = [...cur.stations];
  const stList = h('div', { class: 'stations' });
  const drawStations = () => stList.replaceChildren(
    ...stations.map((s, i) => h('div', { class: 'station-row' },
      h('input', { value: s, maxlength: 30, 'aria-label': `Station ${i + 1}`, oninput: (e) => { stations[i] = e.target.value; preview(); } }),
      stations.length > 1 ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Station entfernen', onclick: () => { stations.splice(i, 1); drawStations(); preview(); } }, '✕') : null)),
    h('button', { type: 'button', class: 'btn small', onclick: () => { stations.push(`Station ${stations.length + 1}`); drawStations(); preview(); } }, '+ Station'));
  drawStations();
  const info = h('div', { class: 'preview' });
  const err = h('p', { class: 'form-error', hidden: true });
  const values = () => ({ name: name.value, roundMin: Number(roundMin.value), groupSize: Number(groupSize.value), advance: Number(advance.value), koSize: Number(koSize.value), bestOf: Number(bestOf.value), thirdPlace: third.checked, stations: stations.map((s) => s.trim()).filter(Boolean) });
  function preview() {
    const v = values();
    const n = cur.players.length;
    if (n < 2) { info.textContent = 'Für eine Vorschau braucht es mindestens 2 Teilnehmer (unter «Wer spielt was»).'; return; }
    const p = gamePreview(v, n);
    const groupsText = v.groupSize === 1 ? 'Keine Gruppenphase – direkt KO.' : `${p.groups} ${p.groups === 1 ? 'Gruppe' : 'Gruppen'} (${p.sizes.join(', ')} Spieler), ${p.groupGames} Gruppenspiele.`;
    const koText = p.koMatches ? `Finalrunde: ${p.qualifiers} Spieler, ${p.koFirst ? 'ab ' + p.koFirst : ''}${p.byes ? `, ${p.byes} Freilos${p.byes > 1 ? 'e' : ''}` : ''}, ${p.koMatches} KO-Matches.` : 'Keine Finalrunde – die Gruppe entscheidet.';
    const mins = (p.groupGames * v.roundMin + p.koMatches * v.roundMin * v.bestOf) / Math.max(1, v.stations.length || 1);
    info.replaceChildren(h('p', null, `${n} Teilnehmer: ${groupsText}`), h('p', null, koText), h('p', { class: 'muted small' }, `Reine Spielzeit ca. ${Math.round(mins)} min (ohne Wechselzeiten, auf ${v.stations.length || 1} Station${v.stations.length > 1 ? 'en' : ''}).`));
  }
  for (const el of [roundMin, groupSize, advance, koSize, bestOf, third]) el.addEventListener('input', preview);
  preview();
  const body = h('div', { class: 'game-form' },
    field('Name', name),
    h('div', { class: 'form-grid' },
      field('Dauer einer Runde', h('span', { class: 'unit' }, roundMin, 'min'), 'Ungefähr, inkl. Einstellen'),
      field('Spieler pro Gruppe', groupSize, 'Höchstens; 1 = reines KO'),
      field('Weiter pro Gruppe', advance),
      field('Grösse der Finalrunde', koSize, 'Automatisch = Gruppen × Weiter'),
      field('Runden im KO', bestOf)),
    h('label', { class: 'check' }, third, 'Spiel um Platz 3'),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Stationen'), h('span', { class: 'hint' }, 'Wie viele Matches gleichzeitig laufen können – z.B. 2 Konsolen.'), stList),
    info, err);
  const buttons = [{ label: 'Abbrechen', value: null }];
  if (g) buttons.push({
    label: 'Löschen', danger: true, onClick: async () => {
      if (!(await confirmDialog('Spiel löschen', `${g.name} mit Auslosung und Resultaten löschen?`, 'Löschen', true))) return false;
      await act('DELETE', `/api/games/${g.id}`, undefined, { done: 'Spiel gelöscht' });
      return 'x';
    },
  });
  buttons.push({
    label: g ? 'Speichern' : 'Spiel anlegen', primary: true, onClick: async () => {
      try {
        const r = g ? await api('PUT', `/api/games/${g.id}`, values(), { confirmTitle: 'Modus ändern', confirmLabel: 'Ändern' }) : await api('POST', '/api/games', values());
        if (r === null) return false;
        return 'ok';
      } catch (ex) { err.textContent = ex.message; err.hidden = false; return false; }
    },
  });
  const r = await modal(g ? g.name : 'Neues Spiel', body, buttons);
  if (r === 'ok') { await refresh(true); toast(g ? 'Gespeichert' : 'Spiel angelegt – alle Teilnehmer spielen mit'); }
}

// ---------- Wer spielt was ----------
function matrixBlock(d, c) {
  if (!d.players.length || !d.games.length) return block('wer', 'Wer spielt was', h('p', { class: 'muted' }, 'Zuerst Teilnehmer und Spiele erfassen.'));
  const toggle = (gid, pid, on) => act('POST', '/api/participation', { gameId: gid, playerId: pid, on }, { confirmTitle: 'Neu auslosen nötig', confirmLabel: 'Ändern' });
  return block('wer', 'Wer spielt was',
    h('div', { class: 'matrix-wrap' }, h('table', { class: 'matrix' },
      h('thead', null, h('tr', null, h('th', null, ''), d.games.map((g) => h('th', { style: { '--c': c.color(g.id) } }, h('span', null, g.name))))),
      h('tbody', null,
        d.players.map((p) => h('tr', null, h('th', { scope: 'row' }, p.name), d.games.map((g) => {
          const on = g.players.includes(p.id);
          return h('td', null, h('input', { type: 'checkbox', checked: on, 'aria-label': `${p.name} bei ${g.name}`, onchange: () => toggle(g.id, p.id, !on) }));
        }))),
        h('tr', { class: 'sum' }, h('th', { scope: 'row' }, 'Alle / keine'), d.games.map((g) => h('td', null,
          h('button', { class: 'link', onclick: () => act('POST', '/api/participation', { gameId: g.id, on: g.players.length < d.players.length }, { confirmTitle: 'Neu auslosen nötig', confirmLabel: 'Ändern' }) }, `${g.players.length}/${d.players.length}`)))))))
  );
}

// ---------- Auslosung ----------
let swapPick = null; // {gameId, playerId}

function drawBlock(d, c) {
  const open = d.games.filter((g) => !d.draws[g.id] && g.players.length >= 2);
  const rows = d.games.map((g) => {
    const r = c.resolved.get(g.id);
    const draw = d.draws[g.id];
    const started = draw && c.list.some((m) => m.gameId === g.id && (m.result || m.live));
    const head = h('div', { class: 'draw-head' },
      h('strong', null, g.name),
      h('span', { class: 'muted small' }, draw ? `ausgelost ${new Date(draw.at).toLocaleString('de-CH', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}${started ? ' · wird gespielt' : ''}` : g.players.length < 2 ? 'zu wenig Teilnehmer' : 'noch nicht ausgelost'),
      h('span', { class: 'spacer' }),
      g.players.length >= 2 ? h('button', { class: 'btn small', onclick: () => act('POST', '/api/draw', { gameId: g.id }, { confirmTitle: 'Neu auslosen', confirmLabel: 'Neu auslosen', done: `${g.name} ausgelost` }) }, draw ? 'Neu auslosen' : 'Auslosen') : null,
      draw ? h('button', { class: 'btn small ghost', onclick: () => act('DELETE', `/api/draw/${g.id}`, undefined, { confirmTitle: 'Auslosung löschen', confirmLabel: 'Löschen', done: 'Auslosung gelöscht' }) }, 'Löschen') : null);
    if (!draw) return h('li', { style: { '--c': c.color(g.id) } }, head);
    const groups = h('div', { class: 'draw-groups' }, r.groups.map((ids, gi) => h('div', { class: 'draw-group' },
      r.groups.length > 1 || ids.length > 1 ? h('span', { class: 'gname' }, g.groupSize === 1 ? '' : `Gruppe ${groupName(gi)}`) : null,
      ids.map((pid) => {
        const picked = swapPick && swapPick.gameId === g.id && swapPick.playerId === pid;
        return h('button', {
          type: 'button', class: 'pchip' + (picked ? ' picked' : ''), disabled: started,
          onclick: async () => {
            if (!swapPick || swapPick.gameId !== g.id) { swapPick = { gameId: g.id, playerId: pid }; renderAgain(); return; }
            if (swapPick.playerId === pid) { swapPick = null; renderAgain(); return; }
            const a = swapPick.playerId;
            swapPick = null;
            await act('POST', `/api/draw/${g.id}/swap`, { a, b: pid }, { done: 'Getauscht' });
          },
        }, c.name(pid));
      }))));
    return h('li', { style: { '--c': c.color(g.id) } }, head, groups);
  });
  return block('auslosung', 'Auslosung',
    h('p', { class: 'hint' }, 'Die Gruppen werden zufällig zusammengestellt. Vor dem ersten Resultat kannst du zwei Spieler tauschen: zuerst den einen antippen, dann den anderen.'),
    open.length ? h('button', { class: 'btn primary', onclick: () => act('POST', '/api/draw', {}, { done: open.length > 1 ? `${open.length} Spiele ausgelost` : 'Ausgelost' }) }, open.length === d.games.length ? 'Alle Spiele auslosen' : `Restliche ${open.length} auslosen`) : null,
    d.games.length ? h('ul', { class: 'draws' }, rows) : h('p', { class: 'muted' }, 'Noch keine Spiele.'));
}

const renderAgain = () => render();

// ---------- PIN ----------
function pinBlock() {
  return block('mehr', 'PIN & Geräte',
    h('p', null, state.data.tournament.openResults !== false
      ? 'Wer den Link hat, kann alles anschauen und neue Resultate eintragen. Resultate ändern und das Setup gehen nur auf Geräten, auf denen die PIN eingegeben wurde.'
      : 'Wer den Link hat, kann alles anschauen. Eintragen geht nur auf Geräten, auf denen die PIN eingegeben wurde.'),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn', onclick: changePin }, 'PIN ändern'),
      h('button', { class: 'btn ghost', onclick: lockDevice }, 'Dieses Gerät sperren'),
      h('a', { class: 'btn ghost', href: '#tv' }, 'TV-Ansicht öffnen')));
}

async function changePin() {
  const pin = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'new-password', placeholder: '4 bis 12 Ziffern' });
  const err = h('p', { class: 'form-error', hidden: true });
  const r = await modal('PIN ändern', h('div', null, field('Neue PIN', pin), h('p', { class: 'hint' }, 'Alle anderen Geräte müssen die neue PIN danach eingeben.'), err), [
    { label: 'Abbrechen', value: null },
    { label: 'Ändern', primary: true, onClick: async () => { try { await api('POST', '/api/pin', { pin: pin.value }); return true; } catch (ex) { err.textContent = ex.message; err.hidden = false; return false; } } },
  ]);
  if (r === true) toast('PIN geändert');
}

// ---------- Sicherung, neues Turnier ----------
function backupBlock() {
  const list = h('ul', { class: 'backups' });
  const loadList = async () => {
    try {
      const { backups } = await api('GET', '/api/backups');
      list.replaceChildren(...backups.slice(0, 15).map((b) => h('li', null,
        h('span', { class: 'grow' }, b.name.replace(/\.json$/, ''), h('span', { class: 'muted small' }, ` · ${new Date(b.at).toLocaleString('de-CH')}`)),
        h('a', { class: 'btn small ghost', href: `/api/backups/${b.name}`, download: b.name }, 'Laden'),
        h('button', { class: 'btn small ghost', onclick: async () => { if (await confirmDialog('Wiederherstellen', `Stand «${b.name}» wiederherstellen? Der aktuelle Stand wird vorher gesichert.`, 'Wiederherstellen', true)) act('POST', `/api/backups/${b.name}/restore`, {}, { done: 'Wiederhergestellt' }); } }, 'Wiederherstellen'))));
      if (!backups.length) list.replaceChildren(h('li', { class: 'muted' }, 'Noch keine Sicherungen.'));
    } catch (e) { list.replaceChildren(h('li', { class: 'form-error' }, e.message)); }
  };
  const file = h('input', {
    type: 'file', accept: '.json,application/json', hidden: true, onchange: async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const json = JSON.parse(await f.text());
        if (await confirmDialog('Sicherung einspielen', 'Alles durch diese Sicherung ersetzen? Der aktuelle Stand wird vorher auf dem Server gesichert.', 'Einspielen', true)) await act('POST', '/api/restore', json, { done: 'Sicherung eingespielt' });
      } catch { toast('Das ist keine Bracket-Sicherung', { error: true }); }
      file.value = '';
    },
  });
  return block('sicherung', 'Sicherung & neues Turnier',
    h('p', { class: 'hint' }, 'Bracket sichert jeden Tag automatisch (30 Tage) und vor jeder grösseren Änderung.'),
    h('div', { class: 'row gap wrap' },
      h('a', { class: 'btn', href: '/api/backup', download: '' }, 'Sicherung herunterladen'),
      h('button', { class: 'btn', onclick: () => file.click() }, 'Sicherung einspielen'), file,
      h('button', { class: 'btn ghost', onclick: async () => { await api('POST', '/api/backups'); loadList(); toast('Gesichert'); } }, 'Jetzt sichern')),
    h('details', { class: 'help', ontoggle: (e) => { if (e.target.open) loadList(); } }, h('summary', null, 'Sicherungen auf dem Server'), list),
    h('div', { class: 'danger-zone' },
      h('h3', null, 'Neues Turnier'),
      h('p', { class: 'small' }, 'Fürs nächste Jahr: Auslosung und Resultate löschen. Teilnehmer und Spiele bleiben – oder auf Wunsch auch die.'),
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn danger', onclick: () => reset('results') }, 'Resultate löschen'),
        h('button', { class: 'btn ghost danger', onclick: () => reset('all') }, 'Alles löschen'))));
}

async function reset(mode) {
  const text = mode === 'all' ? 'Teilnehmer, Spiele, Auslosung und Resultate löschen? Turnier-Name, Zeiten und PIN bleiben.' : 'Auslosung und alle Resultate löschen? Teilnehmer und Spiele bleiben.';
  if (!(await confirmDialog('Neues Turnier', text + ' Vorher wird gesichert.', 'Löschen', true))) return;
  await act('POST', '/api/reset', { mode }, { done: 'Bereit fürs neue Turnier' });
}

// ---------- Über Bracket / Aktualisieren ----------
function about() {
  const d = state.data;
  const box = h('div', { class: 'update-box' });
  const btn = h('button', { class: 'btn small', onclick: () => checkUpdates(box, btn) }, 'Nach Updates suchen');
  return block('about', 'Über Bracket',
    h('p', null, h('strong', null, `Version ${d.version}`), d.versionDate ? h('span', { class: 'muted' }, ` vom ${fmtDate(d.versionDate)}`) : null),
    d.canEdit ? h('div', { class: 'row gap wrap' }, btn) : null,
    box);
}

async function checkUpdates(box, btn) {
  btn.disabled = true;
  box.replaceChildren(h('p', { class: 'muted small' }, 'Frage GitHub nach neuen Versionen …'));
  let r;
  try { r = await api('GET', '/api/update'); } catch (ex) { btn.disabled = false; return box.replaceChildren(h('p', { class: 'form-error' }, ex.message)); }
  btn.disabled = false;
  if (!r) return box.replaceChildren();
  if (!r.enabled) return box.replaceChildren(h('p', { class: 'muted small' }, r.reason));
  const parts = [];
  if (r.dirty?.length) parts.push(h('p', { class: 'warn small' }, `Achtung: ${r.dirty.length} Programmdatei(en) wurden auf der NAS von Hand geändert – eine Aktualisierung überschreibt sie.`));
  if (r.newer.length) {
    const target = r.newer[0];
    parts.push(
      h('p', null, h('strong', null, `Version ${target} verfügbar`)),
      r.changelog.length ? h('div', { class: 'changelog' }, r.changelog.map((x) => h('div', null, h('strong', null, x.version), h('span', { class: 'muted small' }, ' vom ' + fmtDate(x.date)), h('ul', null, x.changes.map((y) => h('li', null, y)))))) : null,
      h('button', { class: 'btn primary', onclick: () => applyUpdate(box, target, false) }, `Jetzt auf ${target} aktualisieren`));
  } else parts.push(h('p', { class: 'pos small' }, `Bracket ist aktuell (${r.current}).`));
  const others = r.versions.filter((x) => x !== r.current && !r.newer.includes(x));
  if (others.length) {
    const sel = h('select', null, others.map((x) => h('option', { value: x }, x)));
    parts.push(h('details', { class: 'help' }, h('summary', null, 'Zu einer früheren Version zurück'),
      h('div', { class: 'row gap' }, sel, h('button', { class: 'btn small', onclick: () => applyUpdate(box, sel.value, true) }, 'Wechseln'))));
  }
  box.replaceChildren(...parts.filter(Boolean));
}

async function applyUpdate(box, target, back) {
  if (!(await confirmDialog(back ? 'Frühere Version' : 'Aktualisieren', `Bracket auf Version ${target} umstellen? Vorher wird gesichert. Bracket startet danach neu (ein paar Sekunden).`, back ? 'Wechseln' : 'Aktualisieren', back))) return;
  box.replaceChildren(h('p', null, `Stelle auf ${target} um …`));
  let r;
  try { r = await api('POST', '/api/update', { version: target }); } catch (ex) { return box.replaceChildren(h('p', { class: 'form-error' }, ex.message)); }
  if (!r?.restart) return box.replaceChildren(h('p', { class: 'warn' }, `Version ${target} ist eingespielt. Bitte Bracket jetzt neu starten.`));
  box.replaceChildren(h('p', null, 'Bracket startet neu …'));
  for (let i = 0; i < 60; i++) {
    await new Promise((res) => setTimeout(res, 2000));
    try {
      const st = await (await fetch('/api/status', { cache: 'no-store' })).json();
      if (st.version === target) { location.reload(); return; }
    } catch { /* startet noch */ }
  }
  box.replaceChildren(h('p', { class: 'warn' }, 'Bracket antwortet noch nicht mit der neuen Version. Seite in einer Minute neu laden.'));
}
