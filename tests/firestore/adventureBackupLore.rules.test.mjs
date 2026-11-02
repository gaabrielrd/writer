import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createAdventureBackupSourceService } from '../../functions/src/adventureBackupSource.mjs';
import { createAdventureBackupLoreService } from '../../functions/src/adventureBackupLoreRead.mjs';
import { createAdventureLoreService } from '../../functions/src/adventureLore.mjs';
import { adventureIdentityToken } from '../../functions/src/adventureLoreContracts.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';

const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-adventure-lore',
  uid = 'author',
  id = 'adventure-backup-sdk-0001',
  path = 'adventures/' + id;
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use only the local demo emulator.');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});

const firstId = 'sdk-lore-backup-entry-0001',
  headPath = path + '/lore/' + firstId,
  bodyPath = path + '/loreBodies/' + firstId;
const entity = (n) => ({
  name: 'PRIVATE_NAME_' + n,
  aliases: ['PRIVATE_ALIAS'],
  category: 'character',
  summary: 'PRIVATE_SUMMARY',
  details: n === 1 ? '\ufeff🌙\n '.repeat(20000) : 'PRIVATE_DETAILS',
  structuredDetails: { appearance: '', personality: '', history: '', notes: ' PRIVATE_NOTE ' },
  relations:
    n === 1
      ? [
          {
            targetEntityId: 'universe:world:person',
            relationType: 'Conhece',
            description: ' PRIVATE_RELATION ',
          },
        ]
      : [],
  isPublic: false,
});
async function fixture(count = 1) {
  await admin
    .doc('universes/world')
    .create({ authorId: uid, loreVersion: 0, privacyVersion: 0, adventureCount: 0, updatedAt: 1 });
  await admin
    .doc('universes/world/lore/person')
    .create({ name: 'FORBIDDEN_GLOBAL_NAME', deleted: false });
  await createStudioService({ db: admin, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ROOT',
    universeId: 'world',
  });
  const adventureToken = adventureIdentityToken(uid, id, await admin.doc(path).get()),
    lore = createAdventureLoreService({ db: admin, now: () => 1200 }),
    loreScope = { adventureId: id, adventureToken };
  for (let n = 1; n <= count; n++) {
    const entityId = 'sdk-lore-backup-entry-' + String(n).padStart(4, '0');
    await lore.saveAdventureLore(uid, {
      ...loreScope,
      entityId,
      operationId: entityId,
      expectedRevision: 0,
      expectedCollectionRevision: n - 1,
      entity: entity(n),
    });
  }
  await lore.saveAdventureLore(uid, {
    ...loreScope,
    entityId: 'removed-sdk-lore-0001',
    operationId: 'removed-sdk-lore-0001',
    expectedRevision: 0,
    expectedCollectionRevision: count,
    entity: entity(99),
  });
  await lore.deleteAdventureLore(uid, {
    ...loreScope,
    entityId: 'removed-sdk-lore-0001',
    operationId: 'delete-sdk-lore-0001',
    expectedRevision: 1,
    expectedCollectionRevision: count + 1,
  });
  await admin.doc('universes/world/lore/person').delete();
  await admin.doc('universes/world').delete();
  const pin = await createAdventureBackupSourceService({ db: admin }).getAdventureBackupSource(
    uid,
    { adventureId: id },
  );
  return { pin, api: createAdventureBackupLoreService({ db: admin }) };
}
const list = (f, kind = 'lore', extra = {}) =>
  f.api.listAdventureBackupLore(uid, {
    adventureId: id,
    sourceToken: f.pin.sourceToken,
    kind,
    ...extra,
  });
const request = (f, kind, row) => ({
  adventureId: id,
  sourceToken: f.pin.sourceToken,
  kind,
  id: row.id,
  itemToken: row.itemToken,
  index: 0,
});

test('SDK adventure lore native producers page masked pairs, tombstones and exact body without global lookup', async () => {
  const f = await fixture(52);
  const port = {
    doc: (p) => {
      assert.equal(p.startsWith('universes/'), false);
      assert.equal(p.startsWith('users/'), false);
      return admin.doc(p);
    },
    collection: (p) => {
      assert.equal(p.startsWith('universes/'), false);
      return admin.collection(p);
    },
    runTransaction: (op) =>
      admin.runTransaction((tx) =>
        op({
          async getAll(ref, options) {
            const snapshots = await tx.getAll(ref, options);
            for (const snapshot of snapshots)
              if (snapshot.exists)
                for (const key of [
                  'name',
                  'aliases',
                  'summary',
                  'details',
                  'structuredDetails',
                  'relations',
                ])
                  if (!options.fieldMask.includes(key))
                    assert.equal(Object.hasOwn(snapshot.data(), key), false);
            return snapshots;
          },
          async get(query) {
            const page = await tx.get(query);
            for (const snapshot of page.docs)
              for (const key of ['name', 'aliases', 'summary', 'details', 'relations'])
                assert.equal(Object.hasOwn(snapshot.data(), key), false);
            return page;
          },
        }),
      ),
  };
  f.api = createAdventureBackupLoreService({ db: port });
  let tombstone;
  for (const [kind, total] of [
    ['lore', 53],
    ['lore-body', 52],
  ]) {
    const a = await list(f, kind, { limit: 50 }),
      b = await list(f, kind, { limit: 50, cursor: a.nextCursor });
    assert.equal(a.items.length, 50);
    assert.equal(b.items.length, total - 50);
    assert.equal(b.nextCursor, null);
    assert.equal(JSON.stringify([a, b]).includes('PRIVATE_'), false);
    if (kind === 'lore') tombstone = [...a.items, ...b.items].find((r) => r.deleted);
  }
  const row = (await list(f, 'lore-body')).items.find((r) => r.id === firstId),
    chunks = [];
  let header;
  for (let index = 0; ; index++) {
    const r = await f.api.readAdventureBackupLore(uid, { ...request(f, 'lore-body', row), index });
    header ??= r;
    assert.equal(r.contentHash, header.contentHash);
    const bytes = Buffer.from(r.chunkBase64, 'base64');
    assert.ok(bytes.length <= 65536);
    chunks.push(bytes);
    if (index + 1 === r.chunkCount) break;
  }
  const bytes = Buffer.concat(chunks),
    data = JSON.parse(bytes.toString('utf8')).data;
  assert.ok(header.chunkCount > 1);
  assert.equal(bytes.length, header.byteLength);
  assert.equal(digest(bytes.toString('utf8')), header.contentHash);
  assert.equal(data.details, entity(1).details);
  assert.deepEqual(data.relations, entity(1).relations);
  assert.ok(tombstone);
  const r = await f.api.readAdventureBackupLore(uid, request(f, 'lore', tombstone));
  assert.deepEqual(
    Object.keys(JSON.parse(Buffer.from(r.chunkBase64, 'base64').toString()).data).sort(),
    ['createdAt', 'deleted', 'updatedAt'],
  );
});

test('SDK adventure lore native births, account gates, root recreation and failure retry preserve the pair', async () => {
  const f = await fixture();
  for (const p of [headPath, bodyPath]) {
    const row = (await list(f, 'lore-body')).items[0],
      ref = admin.doc(p),
      before = await ref.get();
    await ref.delete();
    await ref.create(before.data());
    assert.equal((await ref.get()).createTime.isEqual(before.createTime), false);
    await assert.rejects(f.api.readAdventureBackupLore(uid, request(f, 'lore-body', row)), {
      code: 'failed-precondition',
    });
  }
  const row = (await list(f, 'lore-body')).items[0],
    input = request(f, 'lore-body', row),
    before = await admin.doc(bodyPath).get(),
    failing = {
      doc: (p) => admin.doc(p),
      collection: (p) => admin.collection(p),
      runTransaction: (op) =>
        admin.runTransaction((tx) =>
          op({
            getAll(ref, options) {
              if (ref.path === bodyPath) throw Error('injected lore SDK failure');
              return tx.getAll(ref, options);
            },
          }),
        ),
    };
  await assert.rejects(
    createAdventureBackupLoreService({ db: failing }).readAdventureBackupLore(uid, input),
    /injected lore SDK failure/,
  );
  await f.api.readAdventureBackupLore(uid, input);
  assert.ok((await admin.doc(bodyPath).get()).updateTime.isEqual(before.updateTime));
  for (const actor of [null, 'other'])
    await assert.rejects(f.api.readAdventureBackupLore(actor, input), {
      code: actor ? 'not-found' : 'unauthenticated',
    });
  await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), bodyPath)));
  await assertFails(
    setDoc(doc(env.authenticatedContext(uid).firestore(), bodyPath), { details: 'bypass' }),
  );
  const root = admin.doc(path),
    old = await root.get();
  await root.delete();
  await root.create(old.data());
  f.pin = await createAdventureBackupSourceService({ db: admin }).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  await assert.rejects(list(f), { code: 'failed-precondition' });
});
