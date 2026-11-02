import { FUNCTION_DOMAINS, FUNCTION_ROUTES } from '../src/functionDomains.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ADVENTURE_BACKUP_METHODS as methods,
  invokeAdventureBackupCallable as invoke,
  setAdventureBackupHeaders as headers,
} from '../src/adventureBackupCallable.mjs';
import { adventureBackupExportFixture } from './helpers/adventureBackupExportFixture.mjs';
const expected = [
  'getAdventureBackupSource',
  'listAdventureBackupStructure',
  'readAdventureBackupStructure',
  'listAdventureBackupResources',
  'readAdventureBackupResource',
  'listAdventureBackupLore',
  'readAdventureBackupLore',
  'listAdventureBackupPersonaBindings',
  'readAdventureBackupPersona',
  'listAdventureBackupHistory',
  'readAdventureBackupHistory',
  'readAdventureBackupHistoryText',
  'listAdventureBackupImageBindings',
  'getAdventureBackupImage',
  'readAdventureBackupImageChunk',
  'verifyAdventureBackupImage',
  'getAdventureBackupUniverse',
];
test('17 literal immutable read methods match the sector registry and exclude private ports', async () => {
  assert.deepEqual(methods, expected);
  assert.ok(Object.isFrozen(methods));
  assert.equal(new Set(methods).size, 17);
  const source = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');
  for (const method of methods)
    assert.equal(FUNCTION_DOMAINS[FUNCTION_ROUTES[method]].actions[method], method);
  assert.ok(
    source.indexOf('if (ADVENTURE_BACKUP_METHODS.includes(method))') <
      source.indexOf('for (const handler of sectorServices(domain))'),
  );
  assert.match(source, /createAdventureBackupService\(\{ db, assets: backupStorage \}\)/);
});
for (const method of methods)
  test('explicit dispatch, private headers, and no payload method: ' + method, async () => {
    const payload = { method: 'getAdventureRestoreRecoveryKey' },
      calls = [];
    const port = {
      [method](uid, input) {
        calls.push({ uid, input });
        return { sentinel: method };
      },
    };
    assert.deepEqual(await invoke(port, method, 'author', payload), { sentinel: method });
    assert.deepEqual(calls, [{ uid: 'author', input: payload }]);
    const h = new Map();
    headers(method, { rawRequest: { res: { setHeader: (k, v) => h.set(k, v) } } });
    assert.equal(h.get('Cache-Control'), 'private, no-store');
    assert.equal(h.get('Vary'), 'Authorization');
  });
for (const uid of [null, undefined, '', 4])
  test('UID is required before any port access: ' + uid, async () => {
    let touched = false;
    const port = new Proxy(
      {},
      {
        get() {
          touched = true;
          throw Error('NO');
        },
      },
    );
    await assert.rejects(() => invoke(port, methods[0], uid, {}), { code: 'unauthenticated' });
    assert.equal(touched, false);
  });
test('unknown, inherited, non-function and helper names cannot dispatch', async () => {
  for (const method of [
    'constructor',
    'toString',
    '__proto__',
    'getAdventureRestoreRecoveryKey',
    'readAdventureBackupSource',
    null,
    {},
  ])
    await assert.rejects(() => invoke({}, method, 'author', {}), { code: 'invalid-argument' });
  await assert.rejects(
    () =>
      invoke(
        Object.create({
          getAdventureBackupSource() {
            throw Error('NO');
          },
        }),
        methods[0],
        'author',
        {},
      ),
    { code: 'invalid-argument' },
  );
  await assert.rejects(() => invoke({ getAdventureBackupSource: 4 }, methods[0], 'author', {}), {
    code: 'invalid-argument',
  });
  let changed = false;
  headers('getAdventureRestoreRecoveryKey', {
    rawRequest: {
      res: {
        setHeader() {
          changed = true;
        },
      },
    },
  });
  assert.equal(changed, false);
});
test('the composed real source is readonly, account-bound and rejects payload-selected helper data', async () => {
  const f = await adventureBackupExportFixture(),
    before = structuredClone(f.records);
  assert.deepEqual(Object.keys(f.api).sort(), [...methods].sort());
  assert.ok(Object.isFrozen(f.api));
  const source = await invoke(f.api, 'getAdventureBackupSource', f.uid, { adventureId: f.id });
  assert.equal(source.adventureId, f.id);
  assert.match(source.sourceToken, /^[a-f0-9]{64}$/);
  const page = await invoke(f.api, 'listAdventureBackupStructure', f.uid, {
    adventureId: f.id,
    sourceToken: source.sourceToken,
    kind: 'part',
    limit: 25,
    cursor: null,
  });
  assert.equal(page.items.length, 1);
  await assert.rejects(
    () => invoke(f.api, 'getAdventureBackupSource', 'other', { adventureId: f.id }),
    (e) => ['permission-denied', 'not-found'].includes(e.code),
  );
  await assert.rejects(
    () =>
      invoke(f.api, 'getAdventureBackupSource', f.uid, {
        adventureId: f.id,
        method: 'read-secret',
      }),
    { code: 'invalid-argument' },
  );
  assert.deepEqual(f.records, before);
  assert.equal(f.io.length, 0);
});
