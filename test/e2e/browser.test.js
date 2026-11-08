// Die wichtigsten Wege im Browser (Handy-Grösse): einrichten, erfassen, auslosen, Resultat eintragen, TV.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, apiClient } from './helpers.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
let srv, browser, page;
const errors = [];

before(async () => {
  srv = await startServer();
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept());
});
after(async () => {
  await browser?.close();
  await srv?.stop();
});

test('Erster Start: PIN festlegen, Teilnehmer und Spiel erfassen, auslosen', { timeout: 60000 }, async () => {
  await page.goto(srv.base + '/');
  await page.waitForSelector('text=Turnier einrichten');
  await page.fill('input[name=name]', 'Testturnier');
  await page.fill('input[name=pin]', '4711');
  await page.fill('input[name=pin2]', '4711');
  await page.click('button:has-text("Einrichten")');
  await page.waitForSelector('#s-teilnehmer');
  await page.fill('#s-teilnehmer textarea', 'Anna, Ben, Carla, Dario');
  await page.click('#s-teilnehmer button:has-text("Hinzufügen")');
  await page.waitForSelector('text=Teilnehmer (4)');
  await page.click('button:has-text("+ Spiel")');
  await page.fill('dialog[open] input[placeholder^="z.B."]', 'Tischfussball');
  assert.match(await page.textContent('dialog[open] .preview'), /4 Teilnehmer: 1 Gruppe/);
  await page.click('dialog[open] button:has-text("Spiel anlegen")');
  await page.waitForSelector('text=Spiele (1)');
  await page.click('button:has-text("Alle Spiele auslosen")');
  await page.waitForSelector('text=Neu auslosen');
  assert.equal((await apiClient(srv.base)('GET', '/api/data')).data.games[0].players.length, 4);
});

test('Resultat eintragen mit den grossen Knöpfen, Tabelle und Zeitplan', { timeout: 60000 }, async () => {
  await page.click('.tab:has-text("Jetzt")');
  await page.waitForSelector('.match.big');
  await page.click('.match.big >> text=Start');
  await page.waitForSelector('.when.live');
  await page.click('.match.big >> button:has-text("Resultat")');
  await page.click('.score-half[data-side=a] .score-name');
  await page.click('.score-half[data-side=a] .score-name');
  await page.click('.score-half[data-side=b] .sstep:last-child');
  assert.match(await page.textContent('.score-verdict'), /gewinnt – 3 Punkte/);
  await page.click('dialog[open] button:has-text("Resultat speichern")');
  await page.waitForSelector('text=Gespeichert');
  const d = (await apiClient(srv.base)('GET', '/api/data')).data;
  const r = Object.values(d.results)[0];
  assert.deepEqual([r.a, r.b], [2, 1]);
  await page.click('.tab:has-text("Tabellen")');
  await page.waitForSelector('table.standings');
  assert.match(await page.textContent('table.standings tbody tr:first-child .pts'), /3/);
  await page.click('.tab:has-text("Zeitplan")');
  await page.waitForSelector('.plan-row');
  assert.ok((await page.$$('.plan-row')).length >= 6);
});

test('Dem Zeitplan voraus: weitere Matches anzeigen und vorziehen', { timeout: 60000 }, async () => {
  await page.click('.tab:has-text("Jetzt")');
  await page.click('button:has-text("Weitere Matches vorziehen")');
  await page.waitForSelector('.more .match');
  assert.equal((await page.$$('.more .match')).length, 4);
  assert.match(await page.textContent('.more .match-note'), /Beide frei/);
  await page.click('.more .match >> nth=0 >> button:has-text("Jetzt starten")');
  await page.waitForFunction(async () => Object.keys((await (await fetch('/api/data')).json()).live).length === 1);
  await page.click('button:has-text("Weniger anzeigen")');
  assert.equal((await page.$$('.more .match')).length, 0);
  // Noch ein Match vorziehen (alle Stationen besetzt): beide laufenden bleiben sichtbar, auch eingeklappt
  await page.click('button:has-text("Weitere Matches vorziehen")');
  assert.match(await page.textContent('.more .match-note'), /Stationen besetzt|spielt gerade|spielen gerade/);
  await page.click('.more .match >> nth=0 >> button:has-text("Jetzt starten")');
  await page.waitForFunction(() => document.querySelectorAll('.game-block > .match.running').length === 2);
  await page.click('button:has-text("Weniger anzeigen")');
  assert.equal((await page.$$('.game-block > .match.running')).length, 2);
  assert.ok(await page.$('.game-block > .after'), 'Danach-Hinweis bleibt');
});

test('Ohne PIN: neue Resultate ja, ändern fragt nach der PIN', { timeout: 60000 }, async () => {
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p2.on('pageerror', (e) => errors.push(String(e)));
  await p2.goto(srv.base + '/#jetzt');
  await p2.waitForSelector('.match.big');
  // Neues Resultat geht ohne PIN, mit Hinweis
  await p2.click('.match.big >> button:has-text("Resultat")');
  await p2.waitForSelector('text=ändern geht danach nur noch mit der Turnier-PIN');
  await p2.click('dialog[open] button:has-text("Abbrechen")');
  // Ein bestehendes Resultat ändern fragt nach der PIN
  await p2.click('.match.done >> button:has-text("Ändern")');
  await p2.waitForSelector('text=Turnier-PIN');
  await p2.fill('input[name=pin]', '0000');
  await p2.click('dialog[open] button:has-text("Entsperren")');
  await p2.waitForSelector('text=PIN falsch');
  await p2.fill('input[name=pin]', '4711');
  await p2.click('dialog[open] button:has-text("Entsperren")');
  await p2.waitForSelector('dialog[open] >> text=Resultat ändern');
  await p2.close();
});

test('Erinnerung als PDF', { timeout: 60000 }, async () => {
  await page.goto(srv.base + '/#tabellen');
  await page.click('a:has-text("Erinnerung als PDF")');
  await page.waitForSelector('.print-doc .pc-head h1');
  assert.match(await page.title(), /Testturnier \d{4} – Erinnerung/);
  assert.match(await page.textContent('.pc-note'), /Zwischenstand/);
  assert.ok(await page.$('.print-game .standings'));
  assert.ok(await page.$('.pc-overview table.ov'));
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  assert.ok(pdf.length > 10000, 'PDF wird erzeugt');
  assert.equal(String.fromCharCode(...pdf.subarray(0, 4)), '%PDF');
});

test('TV-Ansicht', { timeout: 30000 }, async () => {
  const tv = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  tv.on('pageerror', (e) => errors.push(String(e)));
  await tv.goto(srv.base + '/#tv');
  await tv.waitForSelector('.tv-now .tv-match');
  assert.match(await tv.textContent('.tv-head h1'), /Testturnier/);
  assert.ok(await tv.$('.tv-side table.standings'));
  await tv.close();
  assert.deepEqual(errors, []);
});
