import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioService } from '../src/studio.mjs';
import { createAdventureLoreService } from '../src/adventureLore.mjs';
import { adventureIdentityToken } from '../src/adventureLoreContracts.mjs';
import { createAdventureBackupSourceService } from '../src/adventureBackupSource.mjs';
import { createAdventureBackupLoreService } from '../src/adventureBackupLoreRead.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { digest } from '../src/workProgressContracts.mjs';

const uid = 'author',
  id = 'adventure-lore-backup-0001',
  path = 'adventures/' + id,
  firstId = 'adventure-lore-entry-0001',
  headPath = path + '/lore/' + firstId,
  bodyPath = path + '/loreBodies/' + firstId;
const entity = (n = 1) => ({
  name: 'PRIVATE_NAME_' + n,
  aliases: ['PRIVATE_ALIAS'],
  category: 'character',
  summary: 'PRIVATE_SUMMARY',
  details: '  PRIVATE_DETAILS 🌙\n',
  structuredDetails: { appearance: '', personality: '', history: '', notes: '  PRIVATE_NOTES  ' },
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
async function fixture(count = 1, tombstone = false) {
  const f = adventureImportDb({ nativeUpdates: true });
  f.records.set('universes/world', {
    authorId: uid,
    deleting: false,
    loreVersion: 0,
    privacyVersion: 0,
    adventureCount: 0,
    updatedAt: 1,
  });
  f.records.set('universes/world/lore/person', { name: 'FORBIDDEN_GLOBAL_NAME', deleted: false });
  await createStudioService({ db: f.db, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ADVENTURE',
    universeId: 'world',
  });
  const lore = createAdventureLoreService({ db: f.db, now: () => 1200 }),
    adventureToken = await f.db.runTransaction(async (tx) =>
      adventureIdentityToken(uid, id, await tx.get(f.db.doc(path))),
    ),
    loreScope = { adventureId: id, adventureToken };
  for (let n = 1; n <= count; n++) {
    const entityId = 'adventure-lore-entry-' + String(n).padStart(4, '0');
    await lore.saveAdventureLore(uid, {
      ...loreScope,
      entityId,
      operationId: entityId,
      expectedRevision: 0,
      expectedCollectionRevision: n - 1,
      entity: entity(n),
    });
  }
  if (tombstone) {
    await lore.saveAdventureLore(uid, {
      ...loreScope,
      entityId: 'removed-lore-entry-0001',
      operationId: 'removed-lore-entry-0001',
      expectedRevision: 0,
      expectedCollectionRevision: count,
      entity: entity(99),
    });
    await lore.deleteAdventureLore(uid, {
      ...loreScope,
      entityId: 'removed-lore-entry-0001',
      operationId: 'delete-lore-entry-0001',
      expectedRevision: 1,
      expectedCollectionRevision: count + 1,
    });
  }
  f.records.delete('universes/world');
  f.records.delete('universes/world/lore/person');
  const pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  return { ...f, lore, loreScope, pin, api: createAdventureBackupLoreService(f) };
}
const list = (f, kind = 'lore', extra = {}, actor = uid) =>
  f.api.listAdventureBackupLore(actor, {
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
async function readAll(f, input) {
  const chunks = [];
  let header;
  for (let index = 0; ; index++) {
    const r = await f.api.readAdventureBackupLore(uid, { ...input, index });
    header ??= r;
    assert.equal(r.contentHash, header.contentHash);
    const bytes = Buffer.from(r.chunkBase64, 'base64');
    assert.ok(bytes.length > 0 && bytes.length <= 65536);
    chunks.push(bytes);
    if (index + 1 === r.chunkCount) break;
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.length, header.byteLength);
  assert.equal(digest(bytes.toString('utf8')), header.contentHash);
  return { dto: JSON.parse(bytes.toString('utf8')), header };
}
const update = (f, p, patch) => f.db.runTransaction((tx) => tx.update(f.db.doc(p), patch));
const remove = (f, p) => f.db.runTransaction((tx) => tx.delete(f.db.doc(p)));

test('real lore producers retain own metadata, literal body and neutral relationships after global target disappears', async () => {
  const f = await fixture(1, true),
    before = structuredClone([...f.records]),
    start = f.commits.length;
  f.reads.length = 0;
  f.metadataReads.length = 0;
  const heads = await list(f),
    bodies = await list(f, 'lore-body');
  assert.equal(heads.items.length, 2);
  assert.equal(bodies.items.length, 1);
  assert.equal(JSON.stringify([heads, bodies]).includes('PRIVATE_'), false);
  assert.ok(
    f.reads.every((r) => r.fields && !r.fields.includes('name') && !r.fields.includes('details')),
  );
  assert.ok(
    f.metadataReads.every(
      (r) =>
        !r.path.startsWith('universes/') &&
        !r.fields.includes('summary') &&
        !r.fields.includes('name') &&
        !r.fields.includes('details'),
    ),
  );
  const head = (
    await readAll(
      f,
      request(
        f,
        'lore',
        heads.items.find((r) => r.id === firstId),
      ),
    )
  ).dto.data;
  assert.equal(head.name, 'PRIVATE_NAME_1');
  assert.equal(head.isPublic, false);
  assert.equal(head.deleted, false);
  assert.deepEqual(head.aliases, ['PRIVATE_ALIAS']);
  for (const key of ['revision', 'ownerId', 'adventureToken', 'relationCount', 'entityId'])
    assert.equal(Object.hasOwn(head, key), false);
  const body = (await readAll(f, request(f, 'lore-body', bodies.items[0]))).dto.data;
  assert.equal(body.details, entity().details);
  assert.deepEqual(body.structuredDetails, entity().structuredDetails);
  assert.deepEqual(body.relations, entity().relations);
  assert.equal(JSON.stringify(body).includes('FORBIDDEN'), false);
  const tombstoneRow = heads.items.find((r) => r.deleted),
    tombstone = (await readAll(f, request(f, 'lore', tombstoneRow))).dto.data;
  assert.deepEqual(Object.keys(tombstone).sort(), ['createdAt', 'deleted', 'updatedAt']);
  assert.equal(tombstone.deleted, true);
  assert.ok(f.metadataReads.every((r) => !r.path.startsWith('universes/')));
  assert.deepEqual([...f.records], before);
  assert.ok(f.commits.slice(start).every((writes) => writes.length === 0));
});

test('fifty-three native metadata/body pairs page independently without a hidden item cap', async () => {
  const f = await fixture(53);
  for (const kind of ['lore', 'lore-body']) {
    const a = await list(f, kind, { limit: 50 }),
      b = await list(f, kind, { limit: 50, cursor: a.nextCursor });
    assert.equal(a.items.length, 50);
    assert.equal(b.items.length, 3);
    assert.equal(b.nextCursor, null);
    assert.equal(new Set([...a.items, ...b.items].map((r) => r.id)).size, 53);
  }
});

test('large actual lore update preserves Unicode, BOM, whitespace and structured text across chunks/reopening', async () => {
  const f = await fixture(),
    details = '\ufeff🌙\n  '.repeat(18000);
  await f.lore.saveAdventureLore(uid, {
    ...f.loreScope,
    entityId: firstId,
    operationId: 'large-lore-update-0001',
    expectedRevision: 1,
    expectedCollectionRevision: 1,
    entity: { ...entity(), details },
  });
  f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  const row = (await list(f, 'lore-body')).items[0];
  f.api = createAdventureBackupLoreService(f);
  const result = await readAll(f, request(f, 'lore-body', row));
  assert.equal(result.dto.data.details, details);
  assert.ok(result.header.chunkCount > 1);
  await assert.rejects(
    f.api.readAdventureBackupLore(uid, {
      ...request(f, 'lore-body', row),
      index: result.header.chunkCount,
    }),
    { code: 'invalid-argument' },
  );
});

for (const kind of ['lore', 'lore-body'])
  for (const dependency of [headPath, bodyPath])
    for (const mutation of ['change', 'recreate'])
      test(
        kind + ' pins native ' + dependency.split('/').at(-2) + ' against ' + mutation,
        async () => {
          const f = await fixture(),
            row = (await list(f, kind)).items[0],
            value = structuredClone(f.records.get(dependency));
          if (mutation === 'change') await update(f, dependency, { ignoredMetadata: true });
          else {
            await remove(f, dependency);
            await f.db.runTransaction((tx) => tx.create(f.db.doc(dependency), value));
          }
          await assert.rejects(f.api.readAdventureBackupLore(uid, request(f, kind, row)), {
            code: 'failed-precondition',
          });
        },
      );

for (const [dependency, patch] of [
  [headPath, { ownerId: 'other' }],
  [bodyPath, { ownerId: 'other' }],
  [headPath, { adventureId: id + '-other' }],
  [bodyPath, { adventureToken: '0'.repeat(64) }],
  [headPath, { entityId: 'another-id' }],
  [bodyPath, { revision: 2 }],
  [headPath, { revision: 99 }],
  [headPath, { schemaVersion: 2 }],
  [bodyPath, { schemaVersion: 2 }],
  [headPath, { deleted: true }],
  [headPath, { contentStorage: null }],
  [bodyPath, { payloadStorage: null }],
  [bodyPath, { bodyStorage: { version: 2 } }],
])
  test(
    'invalid lore pair refuses both lists/read without partial response: ' +
      dependency +
      JSON.stringify(patch),
    async () => {
      const f = await fixture(),
        row = (await list(f)).items[0];
      await update(f, dependency, patch);
      const before = structuredClone([...f.records]);
      for (const kind of ['lore', 'lore-body']) await assert.rejects(list(f, kind));
      await assert.rejects(f.api.readAdventureBackupLore(uid, request(f, 'lore', row)));
      assert.deepEqual([...f.records], before);
    },
  );

test('missing active body, orphan body and a body reappearing under a tombstone are refused', async () => {
  for (const scenario of ['missing-body', 'orphan-body', 'removed-body']) {
    const f = await fixture(1, scenario === 'removed-body');
    if (scenario === 'missing-body') await remove(f, bodyPath);
    else if (scenario === 'orphan-body') await remove(f, headPath);
    else
      await f.db.runTransaction((tx) =>
        tx.create(f.db.doc(path + '/loreBodies/removed-lore-entry-0001'), {
          ...f.records.get(bodyPath),
          entityId: 'removed-lore-entry-0001',
        }),
      );
    await assert.rejects(list(f, scenario === 'missing-body' ? 'lore' : 'lore-body'));
  }
});

test('recreated root cannot adopt old lore even with a newly authorized source token', async () => {
  const f = await fixture(),
    value = structuredClone(f.records.get(path)),
    oldPin = f.pin.sourceToken;
  await remove(f, path);
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  await assert.rejects(list(f), { code: 'failed-precondition' });
  f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  assert.notEqual(f.pin.sourceToken, oldPin);
  for (const kind of ['lore', 'lore-body'])
    await assert.rejects(list(f, kind), { code: 'failed-precondition' });
});

for (const [p, patch] of [
  [headPath, { name: '  invalid untrimmed  ' }],
  [headPath, { aliases: ['\ud800'] }],
  [headPath, { relationCount: 2 }],
  [bodyPath, { details: '\ud800' }],
  [bodyPath, { structuredDetails: { appearance: '', personality: '', history: '' } }],
  [
    bodyPath,
    { relations: [{ targetEntityId: 'unsafe/path', relationType: 'a', description: '' }] },
  ],
])
  test(
    'full content contracts refuse corrupt prose without silently normalizing: ' +
      JSON.stringify(patch),
    async () => {
      const f = await fixture();
      await update(f, p, patch);
      const row = (await list(f, 'lore-body')).items[0];
      await assert.rejects(f.api.readAdventureBackupLore(uid, request(f, 'lore-body', row)), {
        code: 'failed-precondition',
      });
    },
  );

test('cursor is scoped to kind/project/source and requests never accept arbitrary paths', async () => {
  const f = await fixture(2),
    first = await list(f, 'lore', { limit: 1 }),
    cursor = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString());
  for (const patch of [
    { kind: 'lore-body' },
    { adventureId: id + '-other' },
    { sourceToken: '0'.repeat(64) },
    { version: 2 },
    { path: 'users/other' },
  ])
    await assert.rejects(
      list(f, 'lore', {
        cursor: Buffer.from(JSON.stringify({ ...cursor, ...patch })).toString('base64url'),
      }),
      { code: 'invalid-argument' },
    );
  for (const patch of [
    { limit: 0 },
    { limit: 51 },
    { parentId: 'anything' },
    { kind: 'global-lore' },
  ])
    await assert.rejects(list(f, 'lore', patch), { code: 'invalid-argument' });
  const input = request(f, 'lore', first.items[0]);
  for (const patch of [{ index: -1 }, { index: 0.5 }, { id: 'unsafe/path' }, { scope: 'universe' }])
    await assert.rejects(f.api.readAdventureBackupLore(uid, { ...input, ...patch }), {
      code: 'invalid-argument',
    });
});

for (const actor of [null, 'other'])
  test('both lore operations reauthorize account ' + actor, async () => {
    const f = await fixture(),
      row = (await list(f)).items[0],
      code = actor ? 'not-found' : 'unauthenticated';
    await assert.rejects(list(f, 'lore', {}, actor), { code });
    await assert.rejects(f.api.readAdventureBackupLore(actor, request(f, 'lore', row)), { code });
  });

test('captured request intent survives an awaited pause and injected failure retries without writes', async () => {
  const f = await fixture(),
    row = (await list(f, 'lore-body')).items[0],
    input = request(f, 'lore-body', row),
    before = structuredClone([...f.records]);
  let paused = false;
  const port = {
    ...f.db,
    runTransaction: (op) =>
      f.db.runTransaction((tx) =>
        op({
          ...tx,
          async getAll(ref, options) {
            if (!paused) {
              paused = true;
              await Promise.resolve();
              Object.assign(input, {
                kind: 'lore',
                id: 'other-id',
                index: 99,
                sourceToken: '0'.repeat(64),
              });
            }
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  const result = await createAdventureBackupLoreService({ db: port }).readAdventureBackupLore(
    uid,
    input,
  );
  assert.equal(result.kind, 'lore-body');
  assert.equal(result.id, firstId);
  assert.equal(result.index, 0);
  const failing = {
    ...f.db,
    runTransaction: (op) =>
      f.db.runTransaction((tx) =>
        op({
          ...tx,
          getAll(ref, options) {
            if (ref.path === bodyPath) throw Error('injected lore read failure');
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  await assert.rejects(
    createAdventureBackupLoreService({ db: failing }).readAdventureBackupLore(
      uid,
      request(f, 'lore-body', row),
    ),
    /injected lore read failure/,
  );
  assert.equal((await readAll(f, request(f, 'lore-body', row))).dto.data.details, entity().details);
  assert.deepEqual([...f.records], before);
});

test('empty own lore has no fabricated ficha/body or collection clock writes', async () => {
  const f = await fixture(0),
    before = structuredClone([...f.records]);
  assert.deepEqual((await list(f)).items, []);
  assert.deepEqual((await list(f, 'lore-body')).items, []);
  assert.deepEqual([...f.records], before);
});
