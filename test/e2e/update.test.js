// «Nach Updates suchen / Aktualisieren» über die API – mit lokalem Git-Repo als «GitHub»
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeRepos } from '../git-helpers.js';
import { startServer, apiClient, PIN } from './helpers.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const [ma, mi] = pkg.version.split('.').map(Number);
const next = `${ma}.${mi + 1}.0`;
let repos, srv, api;

before(async () => {
  repos = makeRepos([pkg.version, next]);
  process.env.UPDATE_ROOT = repos.clone;
  srv = await startServer();
  api = apiClient(srv.base);
  await api('POST', '/api/setup', { pin: PIN });
});
after(async () => {
  await srv?.stop();
  repos?.cleanup();
});

test('Neuere Version finden und einspielen; ohne PIN kein Zugriff', { timeout: 60000 }, async () => {
  assert.equal((await apiClient(srv.base)('GET', '/api/update')).status, 401);
  const c = (await api('GET', '/api/update')).data;
  assert.equal(c.enabled, true);
  assert.equal(c.current, pkg.version);
  assert.deepEqual(c.newer, [next]);
  assert.equal(c.changelog[0].changes[0], `Änderung in ${next}`);
  assert.equal((await api('POST', '/api/update', { version: '0.0.1' })).status, 400);
  assert.equal((await api('POST', '/api/update', { version: 'x' })).status, 400);
  const r = await api('POST', '/api/update', { version: next });
  assert.equal(r.status, 200);
  assert.equal(r.data.restart, false);
  assert.equal(repos.version(), next);
  assert.ok((await api('GET', '/api/backups')).data.backups.some((b) => b.name.startsWith('vor-update-' + next)));
});
