import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  applicationPreparationFixture,
  prepareApplication,
  cleanupApplication,
} from './helpers/loreAnalysisApplicationPreparationFixture.mjs';
import { applicationPaths } from '../src/loreAnalysisApplicationContracts.mjs';
import { loadApplication } from '../src/loreAnalysisApplicationStore.mjs';
import { readPreparedApplicationMember } from '../src/loreAnalysisApplicationProduction.mjs';
import { readBookResourcePayload } from '../src/bookResourcePayloadRead.mjs';
async function setup(options) {
  const d = adventureImportDb({ nativeUpdates: true });
  return { ...d, ...(await applicationPreparationFixture(d.db, options)) };
}
for (const mode of ['inline', 'v1', 'v2', 'created'])
  test(
    'prepare actual ' + mode + ' bytes to ready without source edits, debit or activation',
    async () => {
      const f = await setup({ mode }),
        head = structuredClone(f.records.get(f.seed.path)),
        before = f.records.get('books/book').localLoreVersion,
        ready = await prepareApplication(f);
      assert.equal(ready.preparedCount, 1);
      assert.deepEqual(f.records.get(f.seed.path), head);
      assert.equal(f.records.get('books/book').localLoreVersion, before);
      assert.equal(f.records.get('users/author').credits, 5);
      const reference = await f.db.runTransaction(async (tx) => {
          const l = await loadApplication(tx, applicationPaths(f.db, f.uid, f.control.id), {
            ...f.control,
            jobToken: ready.jobToken,
          });
          return readPreparedApplicationMember(tx, l, 0);
        }),
        j = f.records.get('users/author/bookLoreEdits/' + reference.edit.editId);
      assert.equal(j.phase, 'preparing');
      assert.equal(j.compilation.phase, 'ready');
      const pointer = j.compilation.storage.fields.summary;
      const body = await f.db.runTransaction((tx) =>
        readBookResourcePayload(tx, f.db, {
          uid: f.uid,
          bookId: f.bookId,
          resource: { kind: 'lore', parentId: null, id: f.entityId },
          ...pointer,
        }),
      );
      assert.equal(body, 'Confirmed');
      assert.equal((await cleanupApplication(f)).phase, 'cancelled');
      assert.deepEqual(f.records.get(f.seed.path), head);
      assert.equal(f.records.get('users/author').credits, 5);
    },
  );

import { createBookLoreFieldUploadService } from '../src/bookLoreFieldUpload.mjs';
import { createBookLoreEditAdoptionService } from '../src/bookLoreEditAdoption.mjs';
import { createBookLoreCreationReservationService } from '../src/bookLoreCreation.mjs';
import { fieldUploadIntent, fieldUploadOperationId } from '../src/bookLoreFieldUploadContracts.mjs';
import { prepareBookResourcePayload } from '../src/bookResourcePayload.mjs';
import { analysisChildPaths } from '../src/loreAnalysisApplicationChildContracts.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from './helpers/bookLoreDeletionFixture.mjs';
const context = (f) => f.records.get(f.path);
const bytes = (f) =>
  structuredClone([...f.records].filter(([p]) => /bookResource(Bodies|Chunks)/.test(p)));
const all = (f) => structuredClone([...f.records]);
async function until(f, predicate, p = f.initial) {
  for (let i = 0; i < 3000; i++) {
    if (predicate(p, f)) return p;
    p = (await f.step(p)).progress;
  }
  throw Error('Preparation milestone not reached');
}
test('mixed existing/new local/global members prepare private defaults and preserve all original material', async () => {
  const f = await setup({
      globals: true,
      changes: [
        { scope: 'local', entityId: 'arthur', input: { summary: 'Confirmed' } },
        { scope: 'local', input: { name: 'New local', category: 'location', summary: 'Harbour' } },
        {
          scope: 'global',
          entityId: 'universe:world:global',
          input: { summary: 'Global changed' },
        },
        { scope: 'global', input: { name: 'New global', category: 'concept', summary: 'Law' } },
      ],
    }),
    originalBytes = bytes(f),
    originalGlobal = structuredClone(f.records.get('universes/world/lore/global')),
    ready = await prepareApplication(f),
    local = context(f).members[1];
  assert.equal(ready.preparedCount, 4);
  assert.equal(f.records.has('books/book/lore/' + local.targetId), false);
  assert.deepEqual(f.records.get('universes/world/lore/global'), originalGlobal);
  const j = f.records.get('users/author/bookLoreEdits/' + local.children.editId),
    s = j.compilation.storage;
  assert.deepEqual(
    { present: s.relations.present, count: s.relations.count },
    { present: true, count: 0 },
  );
  for (const [field, expected] of [
    ['name', 'New local'],
    ['summary', 'Harbour'],
    ['isPublic', false],
    ['aliases', []],
    ['details', ''],
  ]) {
    const value = await f.db.runTransaction((tx) =>
      readBookResourcePayload(tx, f.db, {
        uid: f.uid,
        bookId: f.bookId,
        resource: { kind: 'lore', parentId: null, id: local.targetId },
        ...s.fields[field],
      }),
    );
    assert.deepEqual(value, expected);
  }
  assert.equal((await cleanupApplication(f)).phase, 'cancelled');
  assert.deepEqual(bytes(f), originalBytes);
  assert.deepEqual(f.records.get('universes/world/lore/global'), originalGlobal);
  assert.equal(f.records.get('users/author').credits, 5);
});
test('50 new local members all prepare without lowering the contract and can all be cleaned', async () => {
  const f = await setup({
      mode: 'inline',
      changes: Array.from({ length: 50 }, (_, index) => ({
        scope: 'local',
        input: { name: 'Entity ' + index, category: 'other', summary: 'Summary ' + index },
      })),
    }),
    originalBytes = bytes(f),
    ready = await prepareApplication(f);
  assert.equal(ready.memberCount, 50);
  assert.equal(ready.preparedCount, 50);
  for (const m of context(f).members) {
    assert.equal(f.records.has('books/book/lore/' + m.targetId), false);
    assert.equal(
      f.records.get('users/author/bookLoreEdits/' + m.children.editId).compilation.phase,
      'ready',
    );
  }
  assert.equal(f.records.get('users/author').credits, 5);
  assert.equal((await cleanupApplication(f)).phase, 'cancelled');
  assert.deepEqual(bytes(f), originalBytes);
});
test('concurrent exact units commit once, stale CAS fails and old unit replay stays metadata after ready and revocation', async () => {
  const f = await setup(),
    [a, b] = await Promise.all([f.step(f.initial), f.step(f.initial)]);
  assert.deepEqual(a, b);
  const after = all(f);
  await assert.rejects(() => f.step(f.initial, 'different-stale-operation'));
  assert.deepEqual(all(f), after);
  const ready = await prepareApplication(f, a.progress);
  await f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { authorId: 'other' }));
  const before = all(f),
    replay = await f.step(f.initial);
  assert.deepEqual(replay.receipt, a.receipt);
  assert.equal(replay.progress.phase, ready.phase);
  assert.deepEqual(all(f), before);
  assert.equal((await cleanupApplication(f)).phase, 'cancelled');
});
for (const defect of [
  'owner',
  'deleting',
  'chapter-recreated',
  'analysis-recreated',
  'provider',
  'expiry',
  'universe-link',
])
  test(
    'after bytes exist, ' + defect + ' blocks another unit while native cleanup remains available',
    async () => {
      const f = await setup(),
        originalBytes = bytes(f);
      const p = await until(
        f,
        (view) => view.nextStage === 'fields' && bytes(f).length > originalBytes.length,
      );
      const path =
        defect === 'chapter-recreated'
          ? 'books/book/chapters/chapter'
          : defect === 'analysis-recreated'
            ? 'users/author/loreAnalyses/' + f.control.id
            : null;
      if (path) {
        const value = structuredClone(f.records.get(path));
        await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
        await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      } else
        await f.db.runTransaction((tx) => {
          if (defect === 'owner') tx.update(f.db.doc('books/book'), { authorId: 'other' });
          if (defect === 'deleting') tx.update(f.db.doc('books/book'), { deleting: true });
          if (defect === 'provider')
            tx.update(f.db.doc('users/author/loreAnalyses/' + f.control.id), { provider: 'byok' });
          if (defect === 'expiry')
            tx.update(f.db.doc('users/author/loreAnalyses/' + f.control.id), { expiresAt: 1 });
          if (defect === 'universe-link')
            tx.update(f.db.doc('books/book'), { universeId: 'unavailable' });
        });
      const before = all(f);
      await assert.rejects(() => f.step(p));
      assert.deepEqual(all(f), before);
      assert.equal((await cleanupApplication(f)).phase, 'cancelled');
      assert.deepEqual(bytes(f), originalBytes);
      assert.equal(f.records.get('users/author').credits, 5);
    },
  );
test('an owned upload cannot append through the singular service even while its application is preparing', async () => {
  const f = await setup(),
    m = context(f).members[0],
    id = m.children.uploads[0].uploadId,
    path = 'users/author/bookLoreFieldUploads/' + id,
    p = await until(f, () => f.records.get(path)?.phase === 'uploading'),
    j = f.records.get(path),
    api = createBookLoreFieldUploadService({ db: f.db, now: () => 5000 }),
    field = await api.getBookLoreFieldUpload(f.uid, { uploadId: id, startHash: j.startHash }),
    prepared = prepareBookResourcePayload({
      uid: f.uid,
      bookId: f.bookId,
      resource: { kind: 'lore', parentId: null, id: m.targetId },
      operationId: fieldUploadOperationId(f.uid, f.bookId, m.targetId, id, { field: 'summary' }),
      timestamp: 5000,
      value: 'Confirmed',
    }),
    part = prepared.part(0),
    before = all(f);
  await assert.rejects(() =>
    api.appendBookLoreFieldUpload(f.uid, {
      uploadId: id,
      startHash: j.startHash,
      jobToken: field.jobToken,
      expectedRevision: field.revision,
      operationId: 'bypass-parent',
      index: 0,
      chunkBase64: part.bytes.toString('base64'),
      proof: part.proof,
    }),
  );
  assert.deepEqual(all(f), before);
  assert.equal((await f.step(p)).progress.phase, 'preparing');
});
test('creation source cannot spawn an unplanned upload and prepared members cannot be adopted individually', async () => {
  const f = await setup({
      changes: [{ scope: 'local', input: { name: 'New', category: 'other', summary: 'S' } }],
    }),
    m = context(f).members[0];
  await until(f, (p) => p.nextStage === 'fields');
  const parent = await createBookLoreCreationReservationService({
      db: f.db,
    }).getBookLoreCreationReservation(f.uid, {
      bookId: f.bookId,
      creationId: m.children.creationId,
    }),
    id = 'unplanned-upload',
    target = { field: 'summary' },
    prepared = prepareBookResourcePayload({
      uid: f.uid,
      bookId: f.bookId,
      resource: { kind: 'lore', parentId: null, id: m.targetId },
      operationId: fieldUploadOperationId(f.uid, f.bookId, m.targetId, id, target),
      timestamp: 5000,
      value: 'Unplanned',
    }),
    intent = fieldUploadIntent(f.uid, {
      bookId: f.bookId,
      loreId: m.targetId,
      uploadId: id,
      sourceToken: parent.jobToken,
      target,
      manifest: prepared.manifest,
      creation: {
        creationId: parent.creationId,
        startHash: parent.startHash,
        jobToken: parent.jobToken,
      },
    }),
    before = all(f);
  await assert.rejects(() =>
    createBookLoreFieldUploadService({ db: f.db }).startBookLoreFieldUpload(f.uid, intent),
  );
  assert.deepEqual(all(f), before);
  const ready = await prepareApplication(f, await f.get()),
    j = f.records.get('users/author/bookLoreEdits/' + m.children.editId),
    ref = await f.db.runTransaction(async (tx) => {
      const l = await loadApplication(tx, applicationPaths(f.db, f.uid, f.control.id), {
        ...f.control,
        jobToken: ready.jobToken,
      });
      return readPreparedApplicationMember(tx, l, 0);
    }),
    beforeAdopt = all(f);
  await assert.rejects(() =>
    createBookLoreEditAdoptionService({ db: f.db }).adoptBookLoreEditGeneration(f.uid, ref.edit),
  );
  assert.deepEqual(all(f), beforeAdopt);
  assert.equal(j.phase, 'preparing');
  assert.equal(f.records.has('books/book/lore/' + m.targetId), false);
});
for (const artifact of ['root', 'owner', 'proof', 'owner-and-proof', 'parent-operation'])
  test(
    'recreated ' +
      artifact +
      ' blocks another unit and never grants cleanup of a foreign replacement',
    async () => {
      const f = await setup(),
        first = (await f.step(f.initial)).progress,
        m = context(f).members[0],
        at = analysisChildPaths(f.db, f.uid, { kind: 'inspection', id: m.children.inspectionId }),
        paths =
          artifact === 'root'
            ? [at.root.path]
            : artifact === 'owner'
              ? [at.owner.path]
              : artifact === 'proof'
                ? [at.proof.path]
                : artifact === 'owner-and-proof'
                  ? [at.owner.path, at.proof.path]
                  : [f.path + '/operations/prepare-0'],
        values = paths.map((p) => structuredClone(f.records.get(p)));
      await f.db.runTransaction((tx) => paths.forEach((p) => tx.delete(f.db.doc(p))));
      await f.db.runTransaction((tx) => paths.forEach((p, i) => tx.create(f.db.doc(p), values[i])));
      const before = all(f);
      await assert.rejects(() => f.step(first));
      assert.deepEqual(all(f), before);
    },
  );
for (const milestone of ['source', 'fields', 'edit', 'reserve', 'compile', 'ready'])
  test(
    'cancel at ' +
      milestone +
      ' cleans preparation bytes and preserves original bytes, heads and credit',
    async () => {
      const f = await setup({ mode: 'inline' }),
        originalBytes = bytes(f),
        head = structuredClone(f.records.get(f.seed.path));
      const p =
        milestone === 'ready'
          ? await prepareApplication(f)
          : await until(f, (v) =>
              milestone === 'source' ? v.revision >= 1 : v.nextStage === milestone,
            );
      assert.ok(p.revision >= 1);
      assert.equal((await cleanupApplication(f)).phase, 'cancelled');
      assert.deepEqual(bytes(f), originalBytes);
      assert.deepEqual(f.records.get(f.seed.path), head);
      assert.equal(f.records.get('users/author').credits, 5);
      const before = all(f);
      await assert.rejects(() => f.step(p, 'late-producer'));
      assert.deepEqual(all(f), before);
    },
  );
for (const failure of ['child', 'owner', 'parent', 'bytes', 'certificate'])
  test(
    'rollback at ' +
      failure +
      ' preserves parent, bindings and byte journal together before exact retry',
    async () => {
      const f = await setup(),
        m = context(f).members[0],
        fieldPath = 'users/author/bookLoreFieldUploads/' + m.children.uploads[0].uploadId;
      let p = f.initial;
      if (failure === 'bytes')
        p = await until(f, () => f.records.get(fieldPath)?.phase === 'uploading');
      else if (failure !== 'certificate') p = await until(f, (v) => v.nextStage === 'fields');
      const run = f.db.runTransaction.bind(f.db);
      let injected = false;
      f.db.runTransaction = (fn) =>
        run((tx) => {
          const proxy = { ...tx };
          for (const method of ['create', 'update', 'set'])
            proxy[method] = (ref, value) => {
              tx[method](ref, value);
              const hit =
                failure === 'child'
                  ? ref.path === fieldPath
                  : failure === 'owner'
                    ? ref.path.includes('/loreAnalysisChildOwners/')
                    : failure === 'parent'
                      ? ref.path === f.path + '/state/current'
                      : failure === 'bytes'
                        ? ref.path.includes('/bookResourceChunks/')
                        : ref.path.includes('/prepared/0000');
              if (hit) {
                injected = true;
                throw Error('injected unit rollback');
              }
            };
          return fn(proxy);
        });
      let before;
      for (let count = 0; count < 1000 && !injected; count++) {
        before = all(f);
        try {
          p = (await f.step(p)).progress;
        } catch (error) {
          assert.match(error.message, /injected unit rollback/);
        }
      }
      assert.equal(injected, true);
      assert.deepEqual(all(f), before);
      f.db.runTransaction = run;
      const result = await f.step(p);
      assert.ok(result.progress.revision > p.revision);
    },
  );
test('full-book deletion closes a partially uploaded application, cleans all bytes and preserves metadata-only replays', async () => {
  const f = await setup(),
    originalBytes = bytes(f),
    first = await f.step(f.initial);
  await until(f, () => bytes(f).length > originalBytes.length, first.progress);
  const deletion = bookLoreDeletionFixture(f.db);
  await markBookDeleting(deletion);
  assert.equal((await finishBookLoreDeletion(deletion)).complete, true);
  assert.equal((await f.get()).phase, 'cancelled');
  assert.equal(bytes(f).length, 0);
  assert.equal(f.records.has('books/book'), false);
  const before = all(f),
    replay = await f.step(f.initial);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.phase, 'cancelled');
  assert.deepEqual(all(f), before);
});

test('cancel while inline materialization has an unsealed part cleans the descendant after revocation', async () => {
  const f = await setup({ mode: 'inline' }),
    originalBytes = bytes(f),
    originalHead = structuredClone(f.records.get(f.seed.path)),
    m = context(f).members[0];
  await until(f, () => {
    const job = f.records.get('users/author/bookLoreEdits/' + m.children.editId),
      work = job?.compilation?.inlineWork;
    return (
      work && f.records.get('users/author/bookLoreFieldUploads/' + work.uploadId)?.nextIndex > 0
    );
  });
  assert.ok(bytes(f).length > originalBytes.length);
  await f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { authorId: 'other' }));
  assert.equal((await cleanupApplication(f)).phase, 'cancelled');
  assert.deepEqual(bytes(f), originalBytes);
  assert.deepEqual(f.records.get(f.seed.path), originalHead);
  assert.equal(f.records.get('users/author').credits, 5);
});
test('cancel a partially uploaded new creation after revocation without activating its reserved head', async () => {
  const f = await setup({
      changes: [
        {
          scope: 'local',
          input: { name: 'Partial creation', category: 'other', summary: 'Private' },
        },
      ],
    }),
    originalBytes = bytes(f),
    m = context(f).members[0];
  await until(f, () => bytes(f).length > originalBytes.length);
  await f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { authorId: 'other' }));
  assert.equal((await cleanupApplication(f)).phase, 'cancelled');
  assert.deepEqual(bytes(f), originalBytes);
  assert.equal(f.records.has('books/book/lore/' + m.targetId), false);
  assert.equal(f.records.get('users/author').credits, 5);
});
