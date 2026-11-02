import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { createCampaignRestoreTransferService } from '../src/campaignRestoreTransfer.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createCampaignDeletionService } from '../src/campaignDeletion.mjs';
import { sha, digest, fingerprint, startInput, chunkId } from '../src/campaignRestoreContracts.mjs';
import { restoredBackupFixture } from './helpers/campaignRestoredBackup.mjs';
import { campaignBackupTestIndexes } from './helpers/campaignBackupTestIndexes.mjs';
import { createCampaignBackupReviewService } from '../src/campaignBackupReview.mjs';
const uid = 'author',
  rid = 'campaign-restore-test-0001';
function fixture(bytes = Buffer.from('SECRET-UPLOAD-PROSE-'.repeat(7000))) {
  const f = adventureImportDb({ nativeUpdates: true });
  return {
    ...f,
    bytes,
    input: {
      operationId: rid,
      source: {
        format: 'writer-campaign-backup',
        version: 1,
        byteLength: bytes.length,
        sha256: sha(bytes),
      },
    },
    api: createCampaignRestoreTransferService({ db: f.db, now: () => 2000 }),
    path: 'users/' + uid + '/campaignRestores/' + rid,
  };
}
const mut = (p, oid, extra = {}) => ({
  restoreId: rid,
  jobToken: p.jobToken,
  operationId: oid,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
const append = (f, p, index, oid = 'campaign-upload-chunk-' + index) => {
  const b = f.bytes.subarray(index * 65536, (index + 1) * 65536);
  return mut(p, oid, { index, chunkHash: sha(b), chunkBase64: b.toString('base64') });
};
async function upload(f, p) {
  p ??= (await f.api.startCampaignRestore(uid, f.input)).progress;
  for (let n = p.uploadedChunks; n < Math.ceil(f.bytes.length / 65536); n++)
    p = (await f.api.appendCampaignRestoreChunk(uid, append(f, p, n))).progress;
  return p;
}
async function cleanup(f, p) {
  if (p.state !== 'cancelling')
    p = (await f.api.cancelCampaignRestore(uid, mut(p, 'campaign-cancel-operation'))).progress;
  for (let n = 0; p.state !== 'cancelled' && n < 200; n++)
    p = (
      await f.api.advanceCampaignRestoreCleanup(
        uid,
        mut(p, 'campaign-cleanup-operation-' + n, { limit: 25 }),
      )
    ).progress;
  assert.equal(p.state, 'cancelled');
  return p;
}
function cloneNative(f, path) {
  const m = f.metadata.get(path);
  f.metadata.set(path, {
    ...m,
    createdAtNanoseconds: m.createdAtNanoseconds + 50000,
    updatedAtNanoseconds: m.createdAtNanoseconds + 50000,
  });
}

test('atomic private reservation is invisible in Studio and exact start replay preserves the native identity', async () => {
  const f = fixture(),
    one = await f.api.startCampaignRestore(uid, f.input),
    p = one.progress;
  assert.deepEqual(await f.api.startCampaignRestore(uid, f.input), one);
  const paths = [
    f.path,
    'campaigns/' + p.campaignId,
    'campaignRestoreReservations/' + p.campaignId,
    'users/' + uid + '/campaignRestoreOperations/' + rid,
    'users/' + uid + '/campaignRestoreKeys/' + rid,
    f.path + '/receipts/' + rid,
  ];
  assert.equal(new Set(paths.map((path) => digest(f.metadata.get(path)))).size, 1);
  assert.equal(Object.hasOwn(f.records.get('campaigns/' + p.campaignId), 'ownerId'), false);
  const studio = createStudioService({ db: f.db });
  assert.equal(await studio.getCampaign(uid, { id: p.campaignId }), null);
  assert.deepEqual((await studio.listStudioProjects(uid, { kind: 'campaign' })).items, []);
  assert.equal(
    await createCampaignDeletionService({ db: f.db }).getCampaignDeletionSource(uid, {
      campaignId: p.campaignId,
    }),
    null,
  );
  await assert.rejects(
    studio.createCampaign(uid, { operationId: p.campaignId, title: 'Collision' }),
    (e) => e.details?.reason === 'campaign-restore-reserved',
  );
  assert.doesNotMatch(JSON.stringify(one), /keyBase64|hashState|SECRET-UPLOAD-PROSE/);
});

test('encrypted upload resumes in a new service and returns the exact bytes across native chunk boundaries', async () => {
  const f = fixture(),
    start = await f.api.startCampaignRestore(uid, f.input),
    r = append(f, start.progress, 0),
    first = await f.api.appendCampaignRestoreChunk(uid, r);
  assert.deepEqual(await f.api.appendCampaignRestoreChunk(uid, r), first);
  assert.doesNotMatch(JSON.stringify([...f.records]), /SECRET-UPLOAD-PROSE/);
  f.api = createCampaignRestoreTransferService({ db: f.db, now: () => 3000 });
  const resumed = (
    await f.api.getCampaignRestore(uid, { restoreId: rid, jobToken: first.progress.jobToken })
  ).progress;
  assert.equal(resumed.uploadedChunks, 1);
  const p = await upload(f, resumed);
  assert.equal(p.state, 'bytes-verified');
  assert.equal(p.computedHash, sha(f.bytes));
  const source = await f.api.openCampaignRestoreSource(uid, {
    restoreId: rid,
    jobToken: p.jobToken,
  });
  assert.deepEqual(await source.read(65530, 48), f.bytes.subarray(65530, 65578));
  assert.deepEqual(await source.read(0, f.bytes.length), f.bytes);
});

test('source fingerprint mismatch rejects the complete upload without authorizing an archive reader', async () => {
  const f = fixture();
  f.input.source.sha256 = '0'.repeat(64);
  const p = await upload(f);
  assert.equal(p.state, 'rejected');
  assert.notEqual(p.computedHash, p.source.sha256);
  await assert.rejects(
    f.api.openCampaignRestoreSource(uid, { restoreId: rid, jobToken: p.jobToken }),
    { code: 'failed-precondition' },
  );
  await cleanup(f, p);
});

test('a real signed long UTF8 campaign is uploaded and completely reviewed from the persistent encrypted source', async () => {
  const original = await restoredBackupFixture({ local: true, long: true }),
    bytes = (await original.write()).bytes,
    f = fixture(bytes),
    p = await upload(f),
    source = await f.api.openCampaignRestoreSource(uid, { restoreId: rid, jobToken: p.jobToken }),
    opened = [];
  const review = await createCampaignBackupReviewService({
    db: original.db,
    keys: original.keys,
    now: () => 6000,
    createIndex: campaignBackupTestIndexes(opened),
  }).reviewCampaignBackup(uid, source);
  assert.equal(review.validation, 'campaign-backup-review-only');
  assert.equal(review.manifest.contentVersion, 3);
  assert.ok(opened.every((i) => i.disposed === 1));
  assert.equal(
    await createStudioService({ db: f.db }).getCampaign(uid, { id: p.campaignId }),
    null,
  );
});

test('unknown start cancellation fences the delayed start and keeps a permanent retired reservation', async () => {
  const f = fixture(),
    fp = fingerprint('start', startInput(f.input));
  const cancelled = await f.api.resolveCampaignRestoreStart(uid, {
    operationId: rid,
    requestHash: fp,
    intent: 'cancel',
  });
  assert.equal(cancelled.kind, 'cancelled');
  assert.deepEqual(await f.api.startCampaignRestore(uid, f.input), cancelled);
  assert.ok(!f.records.has(f.path));
  assert.ok(!f.records.has('users/' + uid + '/campaignRestoreKeys/' + rid));
  const studio = createStudioService({ db: f.db });
  f.records.delete('campaigns/' + cancelled.campaignId);
  await assert.rejects(
    studio.createCampaign(uid, { operationId: cancelled.campaignId, title: 'No reuse' }),
    (e) => e.details?.reason === 'campaign-restore-reserved',
  );
});

test('resolving an acknowledged start confirms history without cancelling the existing job', async () => {
  const f = fixture(),
    r = await f.api.startCampaignRestore(uid, f.input);
  assert.deepEqual(
    await f.api.resolveCampaignRestoreStart(uid, {
      operationId: rid,
      requestHash: fingerprint('start', startInput(f.input)),
      intent: 'cancel',
    }),
    r,
  );
  assert.equal(f.records.get(f.path).state, 'uploading');
});

test('cancel revokes the key immediately, invalidates an opened source and cleans by metadata in batches of at most 25', async () => {
  const f = fixture(Buffer.alloc(27 * 65536 + 17, 66)),
    p = await upload(f),
    source = await f.api.openCampaignRestoreSource(uid, { restoreId: rid, jobToken: p.jobToken }),
    request = mut(p, 'campaign-cancel-large'),
    r = await f.api.cancelCampaignRestore(uid, request);
  assert.ok(!f.records.has('users/' + uid + '/campaignRestoreKeys/' + rid));
  assert.deepEqual(await f.api.cancelCampaignRestore(uid, request), r);
  await assert.rejects(source.read(0, 16), { code: 'failed-precondition' });
  f.metadataReads.length = 0;
  const step = mut(r.progress, 'campaign-cleanup-large-1', { limit: 25 }),
    one = await f.api.advanceCampaignRestoreCleanup(uid, step);
  assert.equal(one.progress.cleanedChunks, 25);
  assert.deepEqual(await f.api.advanceCampaignRestoreCleanup(uid, step), one);
  const done = await cleanup(f, one.progress);
  assert.equal(done.cleanedChunks, 28);
  assert.ok(![...f.records.keys()].some((p) => p.startsWith(f.path + '/chunks/')));
  assert.ok(
    f.metadataReads.every((r) => !r.fields.includes('payload') && !r.fields.includes('keyBase64')),
  );
  assert.ok(!JSON.stringify([...f.records]).includes('"hashState":{"'));
  assert.equal(f.records.get('campaigns/' + done.campaignId).kind, 'campaign-restore-retired');
});

test('a stale append or changed input cannot advance counters or write a second chunk', async () => {
  const f = fixture(),
    p = (await f.api.startCampaignRestore(uid, f.input)).progress,
    request = append(f, p, 0),
    first = await f.api.appendCampaignRestoreChunk(uid, request);
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.appendCampaignRestoreChunk(uid, append(f, p, 1, 'campaign-stale-operation')),
    (e) => e.details?.reason === 'checkpoint-conflict',
  );
  const changed = append(f, first.progress, 1, request.operationId);
  await assert.rejects(
    f.api.appendCampaignRestoreChunk(uid, changed),
    (e) => e.details?.reason === 'operation-mismatch',
  );
  assert.deepEqual([...f.records], before);
});

test('foreign users and stale native tokens cannot read status or append bytes', async () => {
  const f = fixture(),
    p = (await f.api.startCampaignRestore(uid, f.input)).progress,
    before = structuredClone([...f.records]);
  await assert.rejects(f.api.getCampaignRestore('other', { restoreId: rid }), {
    code: 'not-found',
  });
  await assert.rejects(f.api.appendCampaignRestoreChunk('other', append(f, p, 0)), {
    code: 'not-found',
  });
  await assert.rejects(
    f.api.getCampaignRestore(uid, { restoreId: rid, jobToken: '0'.repeat(64) }),
    (e) => e.details?.reason === 'identity-conflict',
  );
  assert.deepEqual([...f.records], before);
});

for (const name of ['job', 'root', 'reservation', 'key', 'start-receipt', 'receipt-index'])
  test('native recreation of ' + name + ' is not adopted despite identical values', async () => {
    const f = fixture(),
      p = (await f.api.startCampaignRestore(uid, f.input)).progress;
    const path = {
      job: f.path,
      root: 'campaigns/' + p.campaignId,
      reservation: 'campaignRestoreReservations/' + p.campaignId,
      key: 'users/' + uid + '/campaignRestoreKeys/' + rid,
      'start-receipt': 'users/' + uid + '/campaignRestoreOperations/' + rid,
      'receipt-index': f.path + '/receipts/' + rid,
    }[name];
    cloneNative(f, path);
    const before = structuredClone([...f.records]);
    await assert.rejects(f.api.getCampaignRestore(uid, { restoreId: rid }));
    assert.deepEqual([...f.records], before);
  });

for (const name of ['chunk', 'append-receipt', 'append-index'])
  test(
    'native recreation of ' + name + ' blocks payload reuse and metadata collection',
    async () => {
      const f = fixture(),
        p = await upload(f),
        oid = 'campaign-upload-chunk-0',
        path =
          name === 'chunk'
            ? f.path + '/chunks/' + chunkId(0)
            : name === 'append-receipt'
              ? 'users/' + uid + '/campaignRestoreOperations/' + oid
              : f.path + '/receipts/' + oid;
      cloneNative(f, path);
      const source = await f.api.openCampaignRestoreSource(uid, {
        restoreId: rid,
        jobToken: p.jobToken,
      });
      await assert.rejects(source.read(0, 16));
      const cancelled = (
          await f.api.cancelCampaignRestore(uid, mut(p, 'campaign-cancel-recreated'))
        ).progress,
        before = structuredClone([...f.records]);
      await assert.rejects(
        f.api.advanceCampaignRestoreCleanup(
          uid,
          mut(cancelled, 'campaign-collect-recreated', { limit: 25 }),
        ),
      );
      assert.deepEqual([...f.records], before);
    },
  );

test('an extra or missing chunk cannot be silently collected or certified as an empty upload', async () => {
  const f = fixture(),
    p = await upload(f),
    c = (await f.api.cancelCampaignRestore(uid, mut(p, 'campaign-cancel-orphan'))).progress;
  f.records.set(f.path + '/chunks/' + chunkId(99), { ownerId: 'other', payload: 'PRESERVE' });
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreCleanup(uid, mut(c, 'campaign-cleanup-orphan', { limit: 25 })),
  );
  assert.deepEqual([...f.records], before);
});

test('C4 reservation blocks an active upload before any key or payload read', async () => {
  const f = fixture(),
    p = (await f.api.startCampaignRestore(uid, f.input)).progress,
    cid = p.campaignId,
    path = 'campaignDeletionReservations/' + cid;
  f.records.set(path, {
    schemaVersion: 1,
    ownerId: uid,
    campaignId: cid,
    campaignToken: 'a'.repeat(64),
    deletionId: 'campaign-delete-operation',
    state: 'deleting',
    createdAt: 1,
    updatedAt: 1,
  });
  f.metadataReads.length = 0;
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.appendCampaignRestoreChunk(uid, append(f, p, 0)),
    (e) => e.details?.reason === 'campaign-deleting',
  );
  assert.ok(f.metadataReads.every((r) => !r.fields.includes('keyBase64')));
  assert.deepEqual([...f.records], before);
});

for (const change of [
  (r) => {
    r.source.version = 2;
  },
  (r) => {
    r.source.byteLength = 15;
  },
  (r) => {
    r.source.path = 'untrusted';
  },
  (r) => {
    r.campaignId = 'untrusted';
  },
])
  test('closed source/start input is rejected before allocating any persistent resource', async () => {
    const f = fixture(),
      input = structuredClone(f.input);
    change(input);
    await assert.rejects(f.api.startCampaignRestore(uid, input), { code: 'invalid-argument' });
    assert.equal(f.records.size, 0);
  });

test('start refuses orphan payloads instead of adopting or deleting them', async () => {
  const f = fixture(),
    path = f.path + '/chunks/' + chunkId(0);
  f.records.set(path, { ownerId: 'other', payload: 'PRESERVE' });
  const before = structuredClone([...f.records]);
  await assert.rejects(f.api.startCampaignRestore(uid, f.input));
  assert.deepEqual([...f.records], before);
});

function injectWrite(f, point) {
  const run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) => {
      let writes = 0;
      const wrapped = { ...tx };
      for (const method of ['create', 'set', 'update', 'delete'])
        wrapped[method] = (ref, ...args) => {
          const result = tx[method](ref, ...args);
          if (writes++ === point) throw new Error('injected-rollback');
          return result;
        };
      return fn(wrapped);
    });
  return () => {
    f.db.runTransaction = run;
  };
}
for (const point of [0, 1, 2, 3, 4, 5])
  test(
    'start rollback after write ' + point + ' leaves no key, reservation or pending root',
    async () => {
      const f = fixture(),
        restore = injectWrite(f, point);
      await assert.rejects(f.api.startCampaignRestore(uid, f.input), /injected-rollback/);
      assert.equal(f.records.size, 0);
      restore();
      assert.equal((await f.api.startCampaignRestore(uid, f.input)).progress.checkpoint, 0);
    },
  );
for (const point of [0, 1, 2, 3])
  test(
    'append rollback after write ' +
      point +
      ' keeps the old hash/counter and resumes the same request',
    async () => {
      const f = fixture(),
        p = (await f.api.startCampaignRestore(uid, f.input)).progress,
        request = append(f, p, 0),
        before = structuredClone([...f.records]),
        restore = injectWrite(f, point);
      await assert.rejects(f.api.appendCampaignRestoreChunk(uid, request), /injected-rollback/);
      assert.deepEqual([...f.records], before);
      restore();
      assert.equal(
        (await f.api.appendCampaignRestoreChunk(uid, request)).progress.uploadedChunks,
        1,
      );
    },
  );
test('cancel rollback retains the key and cleanup rollback retains every chunk and the pending root', async () => {
  const f = fixture(),
    p = await upload(f),
    before = structuredClone([...f.records]);
  let restore = injectWrite(f, 3);
  await assert.rejects(
    f.api.cancelCampaignRestore(uid, mut(p, 'campaign-rollback-cancel')),
    /injected-rollback/,
  );
  assert.deepEqual([...f.records], before);
  restore();
  const c = (await f.api.cancelCampaignRestore(uid, mut(p, 'campaign-rollback-cancel'))).progress,
    state = structuredClone([...f.records]);
  restore = injectWrite(f, 4);
  await assert.rejects(
    f.api.advanceCampaignRestoreCleanup(uid, mut(c, 'campaign-rollback-cleanup', { limit: 25 })),
    /injected-rollback/,
  );
  assert.deepEqual([...f.records], state);
  restore();
  await cleanup(f, c);
});
test('concurrent append requests commit one prefix and report a checkpoint conflict to the other writer', async () => {
  const f = fixture(),
    p = (await f.api.startCampaignRestore(uid, f.input)).progress,
    results = await Promise.allSettled([
      f.api.appendCampaignRestoreChunk(uid, append(f, p, 0, 'campaign-concurrent-op-a')),
      f.api.appendCampaignRestoreChunk(uid, append(f, p, 0, 'campaign-concurrent-op-b')),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.details.reason,
    'checkpoint-conflict',
  );
  const current = (await f.api.getCampaignRestore(uid, { restoreId: rid })).progress;
  assert.equal(current.uploadedChunks, 1);
  assert.equal((await upload(f, current)).state, 'bytes-verified');
});
test('map property order never changes receipt, reservation or encrypted chunk identity', async () => {
  const f = fixture(),
    p = await upload(f);
  for (const [path, value] of f.records)
    f.records.set(path, Object.fromEntries(Object.entries(value).reverse()));
  const source = await f.api.openCampaignRestoreSource(uid, {
    restoreId: rid,
    jobToken: p.jobToken,
  });
  assert.deepEqual(await source.read(0, f.bytes.length), f.bytes);
  await cleanup(f, p);
});

for (const size of [16, 65536])
  test(
    'exact ' +
      size +
      '-byte boundary uploads, verifies and cancels without an empty trailing chunk',
    async () => {
      const f = fixture(Buffer.alloc(size, 68)),
        p = await upload(f);
      assert.equal(p.uploadedChunks, 1);
      assert.equal(p.state, 'bytes-verified');
      const source = await f.api.openCampaignRestoreSource(uid, {
        restoreId: rid,
        jobToken: p.jobToken,
      });
      assert.deepEqual(await source.read(0, size), f.bytes);
      await cleanup(f, p);
    },
  );
test('cancelling before the first chunk revokes the key and certifies an empty cleanup', async () => {
  const f = fixture(),
    p = (await f.api.startCampaignRestore(uid, f.input)).progress;
  await assert.rejects(
    f.api.openCampaignRestoreSource(uid, { restoreId: rid, jobToken: p.jobToken }),
  );
  const done = await cleanup(f, p);
  assert.equal(done.uploadedChunks, 0);
  assert.equal(done.cleanedChunks, 0);
});
test('the existing 128-character Unicode account contract is preserved without truncating its UTF8 identity', async () => {
  const f = fixture(),
    owner = 'á'.repeat(128),
    p = (await f.api.startCampaignRestore(owner, f.input)).progress;
  assert.equal(p.ownerId, owner);
  assert.equal(
    (await f.api.getCampaignRestore(owner, { restoreId: rid })).progress.jobToken,
    p.jobToken,
  );
});
test('malformed account identities are rejected before any storage access', async () => {
  const f = fixture();
  for (const owner of ['', '.', '..', 'a/b', 'a\\b', 'a\nb', 'a'.repeat(129), '\ud800'])
    await assert.rejects(f.api.startCampaignRestore(owner, f.input), { code: 'unauthenticated' });
  assert.equal(f.records.size, 0);
  await assert.rejects(f.api.cancelCampaignRestore('', {}), { code: 'unauthenticated' });
});
for (const change of [
  (r) => {
    r.chunkBase64 = ' ' + r.chunkBase64;
  },
  (r) => {
    r.path = 'not-allowed';
  },
  (r) => {
    r.chunkHash = '0'.repeat(64);
  },
  (r) => {
    r.index = -1;
  },
])
  test('invalid append metadata or bytes cannot allocate a chunk or consume a checkpoint', async () => {
    const f = fixture(),
      p = (await f.api.startCampaignRestore(uid, f.input)).progress,
      r = append(f, p, 0),
      before = structuredClone([...f.records]);
    change(r);
    await assert.rejects(f.api.appendCampaignRestoreChunk(uid, r), { code: 'invalid-argument' });
    assert.deepEqual([...f.records], before);
  });
test('a stored unknown incremental hash codec fails closed instead of attempting recovery with another algorithm', async () => {
  const f = fixture();
  await f.api.startCampaignRestore(uid, f.input);
  f.records.get(f.path).hashAlgorithm = 'future-hash-state';
  await assert.rejects(
    f.api.getCampaignRestore(uid, { restoreId: rid }),
    (e) => e.code === 'failed-precondition' && e.details?.reason === 'restore-inconsistent',
  );
});
test('archive source read bounds reject oversized units and EOF without touching stored payload', async () => {
  const f = fixture(),
    p = await upload(f),
    source = await f.api.openCampaignRestoreSource(uid, { restoreId: rid, jobToken: p.jobToken });
  const count = f.metadataReads.length;
  await assert.rejects(source.read(0, 278529), { code: 'invalid-argument' });
  await assert.rejects(source.read(source.size, 1), { code: 'invalid-argument' });
  await assert.rejects(source.read(0, 0), { code: 'invalid-argument' });
  assert.equal(f.metadataReads.length, count);
});
