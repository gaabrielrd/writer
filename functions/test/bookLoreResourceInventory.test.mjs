import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../src/workProgressContracts.mjs';
import { openBookLoreRecord, openBookLoreRelationPage } from '../src/bookLoreStorageRead.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { resourcePayloadChunkPath } from '../src/bookResourcePayloadPaths.mjs';
import {
  loadInventoryControl,
  prepareInventoryChange,
} from '../src/bookLoreResourceInventoryStore.mjs';
import { inventoryScope } from '../src/bookLoreResourceInventoryContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  resourceInventoryFixture,
  registerInventorySource,
  replaceInventorySource,
  retireInventoryGeneration,
  collectInventoryBody,
  drainInventoryBody,
  installInventoryRelationHead,
} from './helpers/bookLoreResourceInventoryFixture.mjs';
async function setup(options) {
  const f = adventureImportDb({ nativeUpdates: true });
  return { ...f, ...(await resourceInventoryFixture(f.db, options)) };
}
const bodyState = (f) => f.records.get(f.controlPath + '/state/current');
const partPath = (f, index = 0) => resourcePayloadChunkPath(f.bookId, f.bodyId, index);
test('source registration resumes without duplicate references or changing its active source', async () => {
  const f = await setup(),
    before = structuredClone(f.records.get(f.seed.path));
  assert.equal(
    (await f.factory().registerBookLoreSourceReference(f.uid, f.request)).phase,
    'generation-initialized',
  );
  assert.equal(
    (await f.factory().registerBookLoreSourceReference(f.uid, f.request)).phase,
    'body-initialized',
  );
  assert.equal((await collectInventoryBody(f)).reason, 'active-head');
  await registerInventorySource(f);
  const revision = bodyState(f).revision;
  await registerInventorySource(f);
  assert.equal(bodyState(f).revision, revision);
  assert.equal(bodyState(f).referenceRevision, 1);
  assert.deepEqual(f.records.get(f.seed.path), before);
  assert.equal((await collectInventoryBody(f)).reason, 'active-head');
  for (const [path, value] of f.records)
    if (path.startsWith(f.controlPath) || path.startsWith(f.generationPath))
      assert.equal(JSON.stringify(value).includes('PRIVATE_PROSE'), false);
  await assert.rejects(() => retireInventoryGeneration(f));
});
test('initializing body is protected after its head moved until its generation retires', async () => {
  const f = await setup();
  await f.factory().registerBookLoreSourceReference(f.uid, f.request);
  await f.factory().registerBookLoreSourceReference(f.uid, f.request);
  await replaceInventorySource(f);
  assert.equal((await collectInventoryBody(f)).reason, 'active-generation');
  await retireInventoryGeneration(f);
  await drainInventoryBody(f);
  assert.equal(bodyState(f).phase, 'collected');
  assert.equal(f.records.has(f.body.path), false);
});
test('retirement alone never skips reference inspection or removes the header', async () => {
  const f = await setup();
  await registerInventorySource(f);
  await replaceInventorySource(f);
  assert.equal((await collectInventoryBody(f)).reason, 'active-generation');
  await retireInventoryGeneration(f);
  const first = await collectInventoryBody(f);
  assert.equal(first.scanned, 1);
  assert.equal(first.processed, 0);
  assert.equal(bodyState(f).phase, 'collecting');
  assert.equal(f.records.has(f.body.path), true);
  assert.equal(f.records.has(partPath(f)), true);
});
test('large retired bodies use bounded metadata batches and remove the header last', async () => {
  const f = await setup({ data: { name: 'N', category: 'other', details: '🌙'.repeat(2300000) } });
  await registerInventorySource(f);
  await replaceInventorySource(f);
  await retireInventoryGeneration(f);
  f.metadataReads.length = 0;
  await collectInventoryBody(f);
  const count = f.body.prepared.manifest.chunkCount;
  let removed = 0;
  while (bodyState(f).cleanupIndex < count) {
    const result = await collectInventoryBody(f, 7);
    assert.ok(result.processed <= 7);
    removed += result.processed;
    assert.equal(f.records.has(f.body.path), true);
  }
  assert.equal(removed, count);
  assert.ok(count > 128);
  const reads = f.metadataReads.filter((r) => r.path.includes('/bookResourceChunks/'));
  assert.equal(reads.length, count);
  assert.ok(reads.every((r) => !r.fields.includes('bytes') && !r.fields.includes('proof')));
  assert.equal((await collectInventoryBody(f)).complete, true);
  assert.equal(f.records.has(f.body.path), false);
  assert.equal(bodyState(f).phase, 'collected');
  assert.equal(f.records.has(f.controlPath + '/references/' + f.generationId), true);
  const before = structuredClone([...f.records]);
  assert.equal((await collectInventoryBody(f)).complete, true);
  assert.deepEqual([...f.records], before);
});
for (const selector of [
  { section: 'field', field: 'name', page: 0 },
  { section: 'relations', page: 1 },
])
  test('v2 native field/page cutoffs survive collection: ' + selector.section, async () => {
    const f = await setup({
      mode: 'v2',
      selector,
      fields: { name: 'N'.repeat(90000) },
      relations: Array.from({ length: 65 }, () => ({
        targetEntityId: 't',
        relationType: 'r',
        description: 'literal',
      })),
    });
    await registerInventorySource(f);
    await replaceInventorySource(f);
    await retireInventoryGeneration(f);
    await drainInventoryBody(f, 1);
    assert.equal(f.records.has(f.body.path), false);
    assert.equal(f.records.has(f.seed.base.path), true);
  });
test('any lease is protected without trusting its claimed phase', async () => {
  const f = await setup();
  await registerInventorySource(f);
  await replaceInventorySource(f);
  await retireInventoryGeneration(f);
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('books/' + f.bookId + '/bookResourceLeases/' + f.bodyId), {
      phase: 'adopted',
      foreign: true,
    }),
  );
  assert.equal((await collectInventoryBody(f)).reason, 'lease');
  assert.equal(f.records.has(partPath(f)), true);
});
for (const change of ['owner', 'book-birth', 'deleting', 'absent'])
  test('current project control preserves bytes for ' + change, async () => {
    const f = await setup();
    await registerInventorySource(f);
    await replaceInventorySource(f);
    await retireInventoryGeneration(f);
    if (change === 'owner' || change === 'deleting')
      await f.db.runTransaction(async (tx) =>
        tx.update(
          f.db.doc(f.seed.bookPath),
          change === 'owner' ? { authorId: 'other' } : { deleting: true },
        ),
      );
    else {
      const old = structuredClone(f.records.get(f.seed.bookPath));
      await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(f.seed.bookPath)));
      if (change === 'book-birth')
        await f.db.runTransaction(async (tx) => tx.create(f.db.doc(f.seed.bookPath), old));
    }
    if (change === 'owner' || change === 'book-birth')
      await assert.rejects(() => collectInventoryBody(f));
    else assert.equal((await collectInventoryBody(f)).deferred, true);
    assert.equal(f.records.has(f.body.path), true);
    assert.equal(f.records.has(partPath(f)), true);
  });
for (const artifact of [
  'body-control',
  'body-state',
  'body-event',
  'body-proof',
  'generation-control',
  'reference',
  'header',
  'part',
])
  test('native recreation is preserved for ' + artifact, async () => {
    const f = await setup();
    await registerInventorySource(f);
    await replaceInventorySource(f);
    await retireInventoryGeneration(f);
    const path =
        artifact === 'body-control'
          ? f.controlPath
          : artifact === 'body-state'
            ? f.controlPath + '/state/current'
            : artifact === 'body-event'
              ? f.controlPath + '/events/0000000000000001'
              : artifact === 'body-proof'
                ? f.controlPath + '/proofs/0000000000000001'
                : artifact === 'generation-control'
                  ? f.generationPath
                  : artifact === 'reference'
                    ? f.controlPath + '/references/' + f.generationId
                    : artifact === 'header'
                      ? f.body.path
                      : partPath(f),
      value = structuredClone(f.records.get(path));
    await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
    if (['header', 'part'].includes(artifact)) await collectInventoryBody(f);
    await assert.rejects(() => collectInventoryBody(f));
    assert.equal(f.records.has(path), true);
    assert.equal(f.records.has(f.body.path), true);
  });
test('extra chunks prevent removing the header and are preserved', async () => {
  const f = await setup();
  await registerInventorySource(f);
  await replaceInventorySource(f);
  await retireInventoryGeneration(f);
  const path = partPath(f, 999);
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc(path), {
      schemaVersion: 1,
      ownerId: f.uid,
      bookId: f.bookId,
      bodyId: f.bodyId,
      index: 999,
      bytes: Buffer.from('foreign'),
      proof: [],
    }),
  );
  await collectInventoryBody(f);
  await collectInventoryBody(f);
  await assert.rejects(() => collectInventoryBody(f));
  assert.equal(f.records.has(path), true);
  assert.equal(f.records.has(f.body.path), true);
});
test('a head introduced after collection claim is checked before deleting any chunk', async () => {
  const f = await setup();
  await registerInventorySource(f);
  await replaceInventorySource(f);
  await retireInventoryGeneration(f);
  await collectInventoryBody(f);
  const storage = { ...f.seed.storage, generationId: digest('late-head') };
  await f.db.runTransaction(async (tx) =>
    tx.set(f.db.doc(f.seed.path), {
      bookId: f.bookId,
      createdAt: 1000,
      updatedAt: 1000,
      payloadStorage: storage,
    }),
  );
  assert.equal((await collectInventoryBody(f)).reason, 'active-head');
  assert.equal(f.records.has(partPath(f)), true);
  const v = await createBookLoreReadService({ db: f.db }).getBookLoreRead(f.uid, {
    bookId: f.bookId,
    id: f.id,
  });
  await assert.rejects(() =>
    registerInventorySource(f, { ...f.request, sourceToken: v.readToken }),
  );
  assert.equal(
    f.records.has('books/' + f.bookId + '/bookLoreGenerations/' + storage.generationId),
    false,
  );
});
test('new references invalidate a partial scan and restart its cursor', async () => {
  const f = await setup();
  await registerInventorySource(f);
  let previous = f.generationId;
  for (let i = 0; i < 18; i++) {
    const storage = { ...f.seed.storage, generationId: digest('generation-' + i) };
    await f.db.runTransaction(async (tx) =>
      tx.set(f.db.doc(f.seed.path), {
        bookId: f.bookId,
        createdAt: 1000,
        updatedAt: 1000,
        payloadStorage: storage,
      }),
    );
    await retireInventoryGeneration(f, previous);
    const view = await createBookLoreReadService({ db: f.db }).getBookLoreRead(f.uid, {
      bookId: f.bookId,
      id: f.id,
    });
    await registerInventorySource(f, { ...f.request, sourceToken: view.readToken });
    previous = storage.generationId;
  }
  await replaceInventorySource(f);
  await retireInventoryGeneration(f, previous);
  await collectInventoryBody(f, 4);
  assert.equal(bodyState(f).phase, 'scanning');
  const revision = bodyState(f).referenceRevision,
    storage = { ...f.seed.storage, generationId: digest('new-after-scan') };
  await f.db.runTransaction(async (tx) =>
    tx.set(f.db.doc(f.seed.path), {
      bookId: f.bookId,
      createdAt: 1000,
      updatedAt: 1000,
      payloadStorage: storage,
    }),
  );
  const view = await createBookLoreReadService({ db: f.db }).getBookLoreRead(f.uid, {
    bookId: f.bookId,
    id: f.id,
  });
  await registerInventorySource(f, { ...f.request, sourceToken: view.readToken });
  assert.equal(bodyState(f).phase, 'live');
  assert.equal(bodyState(f).cursor, null);
  assert.equal(bodyState(f).referenceRevision, revision + 1);
  assert.equal((await collectInventoryBody(f)).reason, 'active-head');
});
test('retired generations and collected body controls cannot be revived', async () => {
  const f = await setup();
  await registerInventorySource(f);
  await replaceInventorySource(f);
  await retireInventoryGeneration(f);
  const c = inventoryScope(f.db, f.uid, f.bookId);
  await assert.rejects(() =>
    f.db.runTransaction(async (tx) => {
      const g = await loadInventoryControl(tx, c, 'generation', f.generationId);
      await prepareInventoryChange(tx, g, 'retire', { phase: 'active' });
    }),
  );
  await assert.rejects(() =>
    f.db.runTransaction(async (tx) => {
      const b = await loadInventoryControl(tx, c, 'body', f.bodyId);
      await prepareInventoryChange(tx, b, 'scan', {
        phase: 'collecting',
        scanRevision: b.state.referenceRevision,
        cursor: null,
      });
    }),
  );
  await drainInventoryBody(f);
  await assert.rejects(() =>
    f.db.runTransaction(async (tx) => {
      const b = await loadInventoryControl(tx, c, 'body', f.bodyId);
      await prepareInventoryChange(
        tx,
        b,
        'register',
        {
          phase: 'live',
          referenceRevision: b.state.referenceRevision + 1,
          scanRevision: null,
          cursor: null,
        },
        digest('fake'),
      );
    }),
  );
});
test('concurrent registrations create one reference revision', async () => {
  const f = await setup();
  await f.factory().registerBookLoreSourceReference(f.uid, f.request);
  await f.factory().registerBookLoreSourceReference(f.uid, f.request);
  const results = await Promise.all([registerInventorySource(f), registerInventorySource(f)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(bodyState(f).referenceRevision, 1);
});
test('rollback preserves collector cursor, chunks and event together', async () => {
  const f = await setup();
  await registerInventorySource(f);
  await replaceInventorySource(f);
  await retireInventoryGeneration(f);
  await collectInventoryBody(f);
  const before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        update(ref, value) {
          tx.update(ref, value);
          if (ref.path === f.controlPath + '/state/current')
            throw Error('injected collector failure');
        },
      }),
    );
  await assert.rejects(() => collectInventoryBody(f), /injected collector failure/);
  assert.deepEqual([...f.records], before);
});
test('unmanaged and malformed controls cannot be adopted or collected through input injection', async () => {
  const f = await setup();
  assert.equal((await collectInventoryBody(f)).reason, 'unmanaged');
  for (const extra of [
    { pointer: {} },
    { generationId: 'a'.repeat(64) },
    { sourceToken: 'bad' },
    { selector: { section: 'field', field: 'unknown', page: 0 } },
  ])
    await assert.rejects(() =>
      f.factory().registerBookLoreSourceReference(f.uid, { ...f.request, ...extra }),
    );
  await assert.rejects(() => f.factory().registerBookLoreSourceReference('', f.request));
});

test('a body moved to a different page is protected even before its new reference is registered', async () => {
  const f = await setup({
    mode: 'v2',
    selector: { section: 'relations', page: 1 },
    relations: Array.from({ length: 65 }, (_, i) => ({
      targetEntityId: 't',
      relationType: 'r' + i,
    })),
  });
  await registerInventorySource(f);
  await installInventoryRelationHead(f, [
    { pointer: f.seed.newSegments[1].body.pointer, count: 1 },
  ]);
  await retireInventoryGeneration(f);
  assert.equal((await collectInventoryBody(f)).reason, 'active-head');
  assert.equal(f.records.has(partPath(f)), true);
  const api = createBookLoreReadService({ db: f.db }),
    view = await api.getBookLoreRead(f.uid, { bookId: f.bookId, id: f.id }),
    part = await api.readBookLorePart(f.uid, {
      bookId: f.bookId,
      id: f.id,
      readToken: view.readToken,
      section: 'relations',
      page: 0,
      index: 0,
    });
  assert.equal(
    JSON.parse(Buffer.from(part.chunkBase64, 'base64').toString())[0].relationType,
    'r64',
  );
  await registerInventorySource(f, {
    ...f.request,
    sourceToken: view.readToken,
    selector: { section: 'relations', page: 0 },
  });
  assert.equal(bodyState(f).referenceRevision, 2);
});
test('head reachability scans are bounded and restart after a native head change', async () => {
  const f = await setup({
    mode: 'v2',
    fields: { name: 'N', category: 'other' },
    relations: Array.from({ length: 1216 }, () => ({ targetEntityId: 't', relationType: 'r' })),
  });
  await registerInventorySource(f);
  const storage = { ...f.seed.storage, base: null, generationId: digest('without-old-base') };
  await f.db.runTransaction(async (tx) =>
    tx.set(f.db.doc(f.seed.path), {
      bookId: f.bookId,
      ...storage.dates,
      payloadStorage: storage,
    }),
  );
  await retireInventoryGeneration(f);
  const first = await collectInventoryBody(f, 4);
  assert.equal(first.headScanned, 4);
  assert.equal(bodyState(f).headPage, 4);
  const oldToken = bodyState(f).headToken;
  const sameHead = structuredClone(f.records.get(f.seed.path));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(f.seed.path)));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(f.seed.path), sameHead));
  assert.deepEqual(f.records.get(f.seed.path), sameHead);
  const next = await collectInventoryBody(f, 4);
  assert.equal(next.headScanned, 4);
  assert.equal(bodyState(f).headPage, 4);
  assert.notEqual(bodyState(f).headToken, oldToken);
  assert.equal(f.records.has(partPath(f)), true);
  await drainInventoryBody(f, 4);
  assert.equal(f.records.has(f.body.path), false);
});
test('a late reference beyond the first head-scan batch blocks every chunk delete after collection claim', async () => {
  const f = await setup({
    mode: 'v2',
    selector: { section: 'relations', page: 0 },
    relations: Array.from({ length: 1216 }, () => ({ targetEntityId: 't', relationType: 'r' })),
  });
  await registerInventorySource(f);
  await replaceInventorySource(f);
  await retireInventoryGeneration(f);
  await collectInventoryBody(f);
  assert.equal(bodyState(f).phase, 'collecting');
  const other = f.seed.newSegments[1].body.pointer,
    target = f.seed.newSegments[0].body.pointer;
  await installInventoryRelationHead(
    f,
    Array.from({ length: 19 }, (_, page) => ({ pointer: page === 18 ? target : other, count: 64 })),
    'late-19-pages',
  );
  for (let unit = 0; unit < 4; unit++) {
    const result = await collectInventoryBody(f, 4);
    assert.equal(result.headScanned, 4);
    assert.equal(result.processed, 0);
    assert.equal(bodyState(f).cleanupIndex, 0);
    assert.equal(f.records.has(partPath(f)), true);
  }
  assert.equal((await collectInventoryBody(f, 4)).reason, 'active-head');
  assert.equal(f.records.has(partPath(f)), true);
  assert.equal(f.records.has(f.body.path), true);
});

test('native relation-page openings reject cloned lore objects and another transaction', async () => {
  const f = await setup({
      mode: 'v2',
      selector: { section: 'relations', page: 0 },
      relations: [{ targetEntityId: 't', relationType: 'r' }],
    }),
    c = inventoryScope(f.db, f.uid, f.bookId);
  let opened;
  await f.db.runTransaction(async (tx) => {
    opened = await openBookLoreRecord(tx, c, await tx.get(f.db.doc(f.seed.path)));
    const page = await openBookLoreRelationPage(tx, opened, 0);
    assert.equal(page.count, 1);
    await assert.rejects(() => openBookLoreRelationPage(tx, { ...opened }, 0));
  });
  await assert.rejects(() => f.db.runTransaction((tx) => openBookLoreRelationPage(tx, opened, 0)));
});
