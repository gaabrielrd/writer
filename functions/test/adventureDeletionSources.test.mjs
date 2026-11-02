import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdventureDeletionService } from '../src/adventureDeletion.mjs';
import { mediaFixture } from './helpers/adventureRestoreMediaFixture.mjs';
import {
  archiveCleanupFixture,
  archiveStep,
  finishArchiveCleanup,
} from './helpers/adventureRestoreArchiveCleanupFixture.mjs';
import { emptyAdventureArchive } from './helpers/adventureRestoreArchiveFixture.mjs';
import { ARCHIVE_NAMES } from '../src/adventureRestoreArchiveContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { createAdventureImportService } from '../src/adventureImport.mjs';
import {
  adventureImportSeed,
  adventureImportSection,
  adventureImportChain,
  adventureImportReviewHash,
} from '../src/adventureImportContracts.mjs';
const uid = 'author';
const jobPath = (p) => 'users/' + uid + '/adventureDeletions/' + p.deletionId;
const step = (p) => ({
  deletionId: p.deletionId,
  deletionToken: p.deletionToken,
  operationId: 'source-deletion-step-' + String(p.checkpoint).padStart(8, '0'),
  expectedCheckpoint: p.checkpoint,
});
async function start(f, source) {
  const api = createAdventureDeletionService({ db: f.db, assets: f.assets, now: () => 9000 });
  const s = await api.getAdventureDeletionSource(uid, { adventureId: source.adventureId });
  const request = {
    adventureId: s.adventureId,
    adventureToken: s.adventureToken,
    sourceToken: s.sourceToken,
    expectedRevision: s.revision,
    operationId: 'source-deletion-start-0001',
  };
  let p = (await api.startAdventureDeletion(uid, request)).progress;
  for (let n = 0; n < 2; n++) p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  return { api, p };
}
async function finish(f, api, p) {
  for (let n = 0; p.phase === 'quiescence'; n++) {
    assert.ok(n < 1000, 'source collection must finish');
    p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  }
  assert.equal(p.phase, 'media');
  assert.deepEqual(f.records.get(jobPath(p)).certified, ['quiescence']);
  return p;
}
function assertCollected(f) {
  for (const name of ARCHIVE_NAMES)
    assert.equal(
      [...f.records.keys()].some((k) => k.startsWith(f.path + '/' + name + '/')),
      false,
      name,
    );
  assert.equal(f.records.has('users/' + uid + '/adventureRestoreRecoveryKeys/' + f.id), false);
}
const ownImage = (f) =>
  [...f.records].find(
    ([k]) => k.startsWith('users/' + uid + '/imageLibrary/') && !k.includes('/uses/'),
  );

test('deletion physically retires pending restored media, collects private sources and preserves activated parent and independent copies', async () => {
  const { f, p: source } = await mediaFixture(),
    parent = structuredClone(f.records.get(f.path)),
    image = ownImage(f),
    path = image[1].path,
    gen = image[1].restoreStorage.proof.generation;
  const kept = new Map([
    [
      'users/' + uid + '/imageLibrary/independent-image-0001',
      { state: 'active', useCount: 0, url: 'https://example.test/own.png' },
    ],
    ['users/' + uid + '/aiPersonas/independent-persona-0001', { name: 'Own persona' }],
    ['campaigns/independent-campaign/notes/own-note', { text: 'Own private note' }],
  ]);
  for (const [key, value] of kept) f.records.set(key, structuredClone(value));
  const b = await start(f, source),
    marked = structuredClone(f.records.get('adventures/' + source.adventureId));
  f.storage.events.length = 0;
  const p = await finish(f, b.api, b.p);
  assert.equal(f.records.get(image[0]).state, 'deleted');
  assert.equal(f.records.get(image[0]).useCount, 0);
  assert.equal(f.storage.version(path).bytes.length, 0);
  assert.equal(f.storage.versions.get(path).has(gen), false);
  assert.equal(
    f.storage.events.some((e) => e.method === 'patch'),
    false,
  );
  assert.deepEqual(f.records.get(f.path), parent);
  assert.deepEqual(f.records.get('adventures/' + source.adventureId), marked);
  for (const [key, value] of kept) assert.deepEqual(f.records.get(key), value);
  assertCollected(f);
  assert.ok(p.deletedDocuments > 10);
  assert.equal(
    f.metadataReads
      .filter((r) => r.path.includes('/adventureRestoreRecoveryKeys/'))
      .some((r) => r.fields.includes('keyBase64')),
    false,
  );
  assert.equal(
    (await f.api.getAdventureRestore(uid, { restoreId: source.restoreId })).state,
    'activated',
  );
});

test('deletion preserves an already active image and resumes original archive cleanup receipts', async () => {
  const { f, p: source, progress } = await archiveCleanupFixture();
  const prior = await archiveStep(f, source, progress),
    image = structuredClone(ownImage(f)),
    parent = structuredClone(f.records.get(f.path));
  assert.equal(image[1].state, 'active');
  const b = await start(f, source),
    ioBefore = f.storage.events.length;
  await finish(f, b.api, b.p);
  assert.deepEqual(f.records.get(image[0]), image[1]);
  assert.equal(f.storage.events.length, ioBefore);
  assert.deepEqual(f.records.get(f.path), parent);
  assertCollected(f);
  const replay = await f.api.advanceAdventureRestoreArchiveCleanup(uid, {
    restoreId: source.restoreId,
    jobToken: source.jobToken,
    operationId: prior.progress.firstOperationId,
    expectedCheckpoint: 0,
  });
  assert.equal(replay.progress.phase, 'done');
  assert.equal(replay.receipt.checkpoint, 1);
});

test('an already collected source remains provable and deletion resumes without the original root', async () => {
  const { f, p: source, progress } = await archiveCleanupFixture(await emptyAdventureArchive());
  await finishArchiveCleanup(f, source, progress);
  const b = await start(f, source);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc('adventures/' + source.adventureId)));
  await finish(f, b.api, b.p);
  assertCollected(f);
});

async function imported(count = 11) {
  const f = adventureImportDb({ nativeUpdates: true }),
    api = createAdventureImportService({ db: f.db, now: () => 2000 });
  const sections = Array.from({ length: count }, (_, n) => ({
    title: 'Private section ' + n,
    content: '<p>Exact private prose ' + n + '</p>',
  }));
  let chain = adventureImportSeed,
    totalBodyBytes = 0;
  for (let n = 0; n < sections.length; n++) {
    const text = adventureImportSection(sections[n]);
    chain = adventureImportChain(chain, n, text);
    totalBodyBytes += text.bodyBytes;
  }
  const input = {
    operationId: 'deletion-import-start-0001',
    project: { title: 'Own imported', synopsis: 'Private synopsis', universeId: null },
    source: { mediaType: 'text/markdown', sha256: 'a'.repeat(64), byteLength: 100 },
    sectionCount: count,
    totalBodyBytes,
  };
  let p = (
    await api.startAdventureImport(uid, {
      ...input,
      reviewHash: adventureImportReviewHash(input, chain),
    })
  ).progress;
  await api.getAdventureImportRecoveryKey(uid, {
    importId: p.importId,
    jobToken: p.jobToken,
    reviewHash: p.reviewHash,
  });
  const request = (name) => ({
    importId: p.importId,
    jobToken: p.jobToken,
    expectedCheckpoint: p.checkpoint,
    operationId: name,
  });
  for (let n = 0; n < count; n++)
    p = (
      await api.appendAdventureImportSection(uid, {
        ...request('deletion-import-append-' + n),
        index: n,
        section: sections[n],
      })
    ).progress;
  for (let n = 0; n < count; n++)
    p = (await api.advanceAdventureImport(uid, request('deletion-import-prepare-' + n))).progress;
  p = (await api.activateAdventureImport(uid, request('deletion-import-activate-0001'))).progress;
  return { ...f, source: p, api };
}
test('activated import retires only native manifests in bounded pages without reading manuscript or erasing receipts', async () => {
  const f = await imported(),
    source = f.source,
    parentPath = 'users/' + uid + '/adventureImports/' + source.importId,
    parent = structuredClone(f.records.get(parentPath)),
    bodies = structuredClone(
      [...f.records].filter(
        ([key]) =>
          key.startsWith('adventures/' + source.adventureId + '/') && key.includes('/body/'),
      ),
    );
  const b = await start(f, source);
  let p = (await b.api.advanceAdventureDeletion(uid, step(b.p))).progress;
  assert.equal(f.records.get(jobPath(p)).part, 3);
  const removed = [];
  for (let n = 0; n < 3; n++) {
    const before = p.deletedDocuments;
    p = (await b.api.advanceAdventureDeletion(uid, step(p))).progress;
    removed.push(p.deletedDocuments - before);
  }
  assert.deepEqual(removed, [8, 3, 0]);
  await finish(f, b.api, p);
  assert.deepEqual(f.records.get(parentPath), parent);
  for (const [key, value] of bodies) assert.deepEqual(f.records.get(key), value);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith(parentPath + '/sections/')),
    false,
  );
  assert.ok(
    f.records.has('users/' + uid + '/adventureImportOperations/deletion-import-activate-0001'),
  );
  assert.ok(
    f.reads
      .filter((r) => r.collectionPath === parentPath + '/sections')
      .every((r) => !r.fields.includes('title') && !r.fields.includes('content')),
  );
});

test('a held acceptance of Storage cannot publish after deletion physically retires its original generation', async () => {
  const { f, p: source, media } = await mediaFixture();
  const original = f.assets.accept.bind(f.assets);
  let enter, release;
  const entered = new Promise((resolve) => {
      enter = resolve;
    }),
    held = new Promise((resolve) => {
      release = resolve;
    });
  f.assets.accept = async (...args) => {
    const result = await original(...args);
    enter();
    await held;
    return result;
  };
  const inflight = f.api
    .advanceAdventureRestoreMedia(uid, {
      restoreId: source.restoreId,
      jobToken: source.jobToken,
      expectedCheckpoint: media.checkpoint,
      operationId: 'accept-held-before-deletion-0001',
    })
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  await entered;
  const b = await start(f, source);
  try {
    await finish(f, b.api, b.p);
  } finally {
    release();
  }
  const late = await inflight;
  assert.ok(late.error);
  assert.equal(ownImage(f)[1].state, 'deleted');
  assert.equal(ownImage(f)[1].url, null);
  assert.equal(f.storage.version(ownImage(f)[1].path).bytes.length, 0);
  assertCollected(f);
});

test('a lost physical-retirement acknowledgement leaves the checkpoint intact and retries the same fence', async () => {
  const { f, p: source } = await mediaFixture(),
    original = f.assets.retire.bind(f.assets);
  let once = true;
  f.assets.retire = async (...args) => {
    const proof = await original(...args);
    if (once) {
      once = false;
      throw Error('Lost retirement acknowledgement');
    }
    return proof;
  };
  const b = await start(f, source),
    request = step(b.p),
    before = structuredClone(f.records);
  await assert.rejects(() => b.api.advanceAdventureDeletion(uid, request), /Lost retirement/);
  assert.deepEqual(f.records, before);
  assert.equal(f.storage.version(ownImage(f)[1].path).bytes.length, 0);
  const first = await b.api.advanceAdventureDeletion(uid, request),
    io = f.storage.events.length;
  assert.equal(first.progress.checkpoint, b.p.checkpoint + 1);
  assert.deepEqual(await b.api.advanceAdventureDeletion(uid, request), first);
  assert.equal(f.storage.events.length, io);
  await finish(f, b.api, first.progress);
});

for (const boundary of ['image', 'media-receipt', 'deletion-job', 'deletion-receipt'])
  test(
    'atomic media retirement rolls back every document at the ' +
      boundary +
      ' boundary and recovers without republishing',
    async () => {
      const { f, p: source } = await mediaFixture(),
        b = await start(f, source),
        original = f.db.runTransaction.bind(f.db),
        before = structuredClone(f.records);
      let failed = false;
      f.db.runTransaction = (callback) =>
        original((tx) =>
          callback(
            new Proxy(tx, {
              get(target, key) {
                if (!['set', 'create', 'update', 'delete'].includes(key)) return target[key];
                return (ref, ...args) => {
                  const fail =
                    boundary === 'image'
                      ? ref.path === ownImage(f)[0]
                      : boundary === 'media-receipt'
                        ? ref.path.includes('/adventureRestoreMediaOperations/')
                        : boundary === 'deletion-job'
                          ? ref.path === jobPath(b.p)
                          : ref.path.includes('/adventureDeletionOperations/');
                  if (fail) {
                    failed = true;
                    throw Error('Atomic source rollback');
                  }
                  return target[key](ref, ...args);
                };
              },
            }),
          ),
        );
      await assert.rejects(
        () => b.api.advanceAdventureDeletion(uid, step(b.p)),
        /Atomic source rollback/,
      );
      assert.equal(failed, true);
      assert.deepEqual(f.records, before);
      f.db.runTransaction = original;
      const recovered = await b.api.advanceAdventureDeletion(uid, step(b.p));
      assert.equal(ownImage(f)[1].state, 'deleted');
      await finish(f, b.api, recovered.progress);
    },
  );

test('missing native source head cannot skip a reserved restoration or import and certify quiescence', async () => {
  const r = await mediaFixture(await emptyAdventureArchive()),
    b = await start(r.f, r.p);
  r.f.records.delete(r.f.path);
  const before = structuredClone(r.f.records);
  await assert.rejects(() => b.api.advanceAdventureDeletion(uid, step(b.p)), {
    code: 'failed-precondition',
  });
  assert.deepEqual(r.f.records, before);
  const i = await imported(1),
    d = await start(i, i.source);
  const p = (await d.api.advanceAdventureDeletion(uid, step(d.p))).progress;
  i.records.delete('users/' + uid + '/adventureImports/' + i.source.importId);
  const unchanged = structuredClone(i.records);
  await assert.rejects(() => d.api.advanceAdventureDeletion(uid, step(p)), {
    code: 'failed-precondition',
  });
  assert.deepEqual(i.records, unchanged);
});

for (const corrupt of ['section-birth', 'activation-birth', 'key-reappeared', 'section-missing'])
  test(
    'an import with ' + corrupt + ' preserves the whole page and its deletion checkpoint',
    async () => {
      const f = await imported(2),
        b = await start(f, f.source);
      const p = (await b.api.advanceAdventureDeletion(uid, step(b.p))).progress;
      const path =
        corrupt === 'activation-birth'
          ? 'users/' + uid + '/adventureImportOperations/deletion-import-activate-0001'
          : 'users/' +
            uid +
            '/adventureImports/' +
            f.source.importId +
            '/sections/0000000000000001';
      if (corrupt === 'key-reappeared') {
        f.records.set('users/' + uid + '/adventureImportRecoveryKeys/' + f.source.importId, {
          keyBase64: 'DO_NOT_READ',
        });
      } else {
        const value = structuredClone(f.records.get(path));
        await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
        if (corrupt !== 'section-missing')
          await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      }
      const before = structuredClone(f.records);
      await assert.rejects(() => b.api.advanceAdventureDeletion(uid, step(p)), {
        code: 'failed-precondition',
      });
      assert.deepEqual(f.records, before);
    },
  );

test('a source artifact that reappears after archive collection cannot certify the source as empty', async () => {
  const { f, p: source, progress } = await archiveCleanupFixture(await emptyAdventureArchive());
  await finishArchiveCleanup(f, source, progress);
  const b = await start(f, source);
  f.records.set(f.path + '/preparedRoot/orphan', { privateText: 'DO_NOT_READ_OR_DELETE' });
  const before = structuredClone(f.records);
  await assert.rejects(() => b.api.advanceAdventureDeletion(uid, step(b.p)), {
    code: 'failed-precondition',
  });
  assert.deepEqual(f.records, before);
});

test('a lost final database acknowledgement replays the composed source receipt without repeating Storage', async () => {
  const { f, p: source } = await mediaFixture(),
    b = await start(f, source),
    original = f.db.runTransaction.bind(f.db);
  let lose = true;
  f.db.runTransaction = async (callback) => {
    let committed = false;
    const result = await original((tx) =>
      callback(
        new Proxy(tx, {
          get(target, key) {
            if (key !== 'create') return target[key];
            return (ref, value) => {
              if (ref.path.includes('/adventureDeletionOperations/')) committed = true;
              return target.create(ref, value);
            };
          },
        }),
      ),
    );
    if (committed && lose) {
      lose = false;
      throw Error('Lost composed commit acknowledgement');
    }
    return result;
  };
  const request = step(b.p);
  await assert.rejects(() => b.api.advanceAdventureDeletion(uid, request), /Lost composed commit/);
  const before = structuredClone(f.records),
    io = f.storage.events.length;
  const replay = await b.api.advanceAdventureDeletion(uid, request);
  assert.equal(replay.progress.checkpoint, b.p.checkpoint + 1);
  assert.equal(f.storage.events.length, io);
  assert.deepEqual(f.records, before);
});

test('a recovery key with an orphan ID blocks the final quiescence certificate without reading its secret', async () => {
  const f = await imported(1),
    b = await start(f, f.source);
  let p = b.p;
  for (let n = 0; f.records.get(jobPath(p)).part !== 4; n++)
    p = (await b.api.advanceAdventureDeletion(uid, step(p))).progress;
  const keyPath = 'users/' + uid + '/adventureRestoreRecoveryKeys/orphan-key-0001';
  f.records.set(keyPath, { adventureId: f.source.adventureId, keyBase64: 'DO_NOT_READ' });
  const before = structuredClone(f.records);
  await assert.rejects(() => b.api.advanceAdventureDeletion(uid, step(p)), {
    code: 'failed-precondition',
  });
  assert.deepEqual(f.records, before);
  assert.equal(
    f.reads
      .filter((r) => r.collectionPath.endsWith('/adventureRestoreRecoveryKeys'))
      .some((r) => r.fields.includes('keyBase64')),
    false,
  );
});
