import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { uid, note, session, preparation, link, reference } from './helpers/campaignBackup.mjs';
import { restoredBackupFixture } from './helpers/campaignRestoredBackup.mjs';
import { createCampaignNotesService } from '../src/campaignNotes.mjs';
import { createCampaignSessionsService } from '../src/campaignSessions.mjs';
import { createCampaignPreparationService } from '../src/campaignPreparation.mjs';
import { createCampaignSessionReferencesService } from '../src/campaignSessionReferences.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { baseSourceKey } from '../src/campaignBaseContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { campaignBackupTestIndexes } from './helpers/campaignBackupTestIndexes.mjs';
import { rewriteCampaignBackupTestFile } from './helpers/campaignBackupRewrite.mjs';
import { createCampaignBackupFileService } from '../src/campaignBackupFile.mjs';
import { createCampaignBackupOwnSemanticsService } from '../src/campaignBackupOwnSemantics.mjs';
import { createCampaignRestoreTransferService } from '../src/campaignRestoreTransfer.mjs';
import { sha, chunkId } from '../src/campaignRestoreContracts.mjs';
const rid = 'campaign-own-review-0001',
  root = 'users/' + uid + '/campaignRestores/' + rid;
const source = (b) => ({ size: b.length, read: async (o, n) => b.subarray(o, o + n) });
const mut = (p, operationId, extra = {}) => ({
  restoreId: rid,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
let cached;
async function signed({ large = false, pages = false } = {}) {
  const f = await restoredBackupFixture({ local: true }),
    pair = generateKeyPairSync('ed25519');
  Object.assign(f, {
    scope: { campaignId: f.id, campaignToken: f.campaignToken },
    notes: createCampaignNotesService({ db: f.db }),
    sessions: createCampaignSessionsService({ db: f.db }),
    preparation: createCampaignPreparationService({ db: f.db }),
    references: createCampaignSessionReferencesService({ db: f.db }),
    progress: createWorkProgressService({ db: f.db }),
    sceneKey: baseSourceKey({
      kind: 'scene',
      adventureId: f.campaign.provenance.adventureId,
      id: f.scene.id,
    }),
  });
  f.noteId = await note(f, 'own-native-note');
  f.sessionId = await session(f, 'own-native-session');
  f.itemId = await preparation(f, 'own-native-clue');
  f.questId = await preparation(f, 'own-native-quest', 'quest');
  await link(f, 'own-native-link', f.sessionId, f.itemId);
  await reference(f, 'own-native-reference', f.sessionId);
  await f.progress.createWorkChecklistItem(uid, {
    target: { kind: 'campaign', id: f.id },
    operationId: 'own-native-checklist',
    title: 'PRIVATE TASK',
  });
  f.pair = pair;
  f.keys = [{ id: 'own-review-test', state: 'active', publicKey: pair.publicKey }];
  if (pages) for (let n = 0; n < 28; n++) await note(f, 'own-page-' + String(n).padStart(2, '0'));
  if (large) {
    const part = '\u0000'.repeat(150000);
    await f.db.runTransaction((tx) =>
      tx.update(f.db.doc(f.path + '/preparationBodies/' + f.itemId), {
        body: { text: part, condition: part, recipient: part },
      }),
    );
  }
  const frames = [];
  await createCampaignBackupFileService({
    db: f.db,
    storage: f.storage,
    keys: f.keys,
    keyId: f.keys[0].id,
    privateKey: pair.privateKey,
    now: () => 5000,
  }).writeCampaignBackupFile(
    uid,
    { campaignId: f.id },
    {
      sink: {
        async write(b) {
          frames.push(Buffer.from(b));
        },
        async commit() {},
        async abort() {
          frames.length = 0;
        },
      },
    },
  );
  f.bytes = Buffer.concat(frames);
  f.source = () => source(f.file ?? f.bytes);
  return f;
}
async function fixture(original) {
  cached ??= signed();
  const s = original ?? (await cached),
    f = adventureImportDb({ nativeUpdates: true }),
    bytes = s.file ?? s.bytes,
    keys = s.keys.map((k) => ({ ...k })),
    api = createCampaignRestoreTransferService({ db: f.db, keys, now: () => 6000 });
  let p = (
    await api.startCampaignRestore(uid, {
      operationId: rid,
      source: {
        format: 'writer-campaign-backup',
        version: 1,
        byteLength: bytes.length,
        sha256: sha(bytes),
      },
    })
  ).progress;
  for (let n = 0; n < Math.ceil(bytes.length / 65536); n++) {
    const b = bytes.subarray(n * 65536, (n + 1) * 65536);
    p = (
      await api.appendCampaignRestoreChunk(
        uid,
        mut(p, 'own-upload-' + String(n).padStart(6, '0'), {
          index: n,
          chunkHash: sha(b),
          chunkBase64: b.toString('base64'),
        }),
      )
    ).progress;
  }
  for (let n = 0; p.fileReview?.status !== 'verified' && n < 2000; n++)
    p = (
      await api.advanceCampaignRestoreFileReview(
        uid,
        mut(p, 'own-integrity-step-' + n, { limit: 25 }),
      )
    ).progress;
  assert.equal(p.fileReview.status, 'verified');
  return { ...f, api, p, keys, original: s, bytes };
}
async function indexOwn(f, p = f.p, limit = 25) {
  let n = 0;
  while ((!p.ownReview || p.ownReview.phase === 'indexing') && n < 2000)
    p = (
      await f.api.advanceCampaignRestoreOwnReview(uid, mut(p, 'own-index-step-' + n++, { limit }))
    ).progress;
  assert.equal(p.ownReview.phase, 'checking');
  return p;
}
async function finish(f, p, limit = 25) {
  p ??= await indexOwn(f);
  let n = 0;
  while (p.ownReview.phase === 'checking' && n < 2000)
    p = (
      await f.api.advanceCampaignRestoreOwnReview(uid, mut(p, 'own-check-step-' + n++, { limit }))
    ).progress;
  assert.equal(p.ownReview.phase, 'verified');
  return p;
}
async function proof(f, p) {
  return f.api.getCampaignRestoreOwnSemantics(uid, { restoreId: rid, jobToken: p.jobToken });
}
async function originalProof(f) {
  return createCampaignBackupOwnSemanticsService({
    keys: f.keys,
    now: () => 6000,
  }).reviewCampaignBackupOwnContent(uid, source(f.bytes), {
    index: await campaignBackupTestIndexes([])('own'),
  });
}
test('signed rich own review resumes frame by frame and equals the real semantic proof for all own families', async () => {
  const f = await fixture();
  let p = await indexOwn(f, undefined, 1);
  f.api = createCampaignRestoreTransferService({ db: f.db, keys: f.keys, now: () => 7000 });
  p = await finish(f, p, 1);
  assert.deepEqual(await proof(f, p), await originalProof(f));
  const counts = (await proof(f, p)).own;
  assert.equal(counts.notes, 1);
  assert.equal(counts.sessions, 1);
  assert.equal(counts.preparationItems, 2);
  assert.equal(counts.preparationBodies, 2);
  assert.equal(counts.sessionReferences, 1);
  assert.equal(counts.sessionLinks, 1);
  assert.doesNotMatch(JSON.stringify(p), /payload|PRIVATE|hashState|sourceKey/);
  assert.doesNotMatch(
    JSON.stringify([...f.records]),
    /PRIVATE OWN TEXT|PRIVATE CLUE|PRIVATE SESSION/,
  );
  assert.ok([...f.records.keys()].filter((p) => p.includes('/reviewRows/')).length > 10);
});
test('expanded DTO above two MiB is parsed without placing text or its parts in the checkpoint', async () => {
  const s = await signed({ large: true }),
    f = await fixture(s);
  assert.ok(f.bytes.length > 2 * 1024 * 1024);
  const p = await finish(f, await indexOwn(f, undefined, 1), 3);
  assert.deepEqual(await proof(f, p), await originalProof(f));
  const job = f.records.get(root);
  assert.ok(Buffer.byteLength(JSON.stringify(job.ownReview)) < 100000);
  assert.equal((await proof(f, p)).own.preparationBodies, 2);
});
test('more than 25 authenticated rows are checked and cleaned in bounded contiguous pages', async () => {
  const f = await fixture(await signed({ pages: true }));
  let p = await finish(f, await indexOwn(f), 7);
  assert.ok(p.reviewIndex.rows > 25);
  assert.equal((await proof(f, p)).own.notes, 29);
  p = (await f.api.cancelCampaignRestore(uid, mut(p, 'own-pagination-cancel'))).progress;
  assert.equal(f.records.get(root).ownReview, null);
  let n = 0;
  while (p.state !== 'cancelled' && n < 100) {
    const before = p.reviewIndex.cleanedRows;
    p = (
      await f.api.advanceCampaignRestoreCleanup(
        uid,
        mut(p, 'own-pagination-clean-' + n++, { limit: 7 }),
      )
    ).progress;
    assert.ok(p.reviewIndex.cleanedRows - before <= 7);
  }
  assert.equal(p.state, 'cancelled');
  assert.equal(p.reviewIndex.cleanedRows, p.reviewIndex.rows);
  assert.equal([...f.records.keys()].filter((p) => p.includes('/reviewRows/')).length, 0);
});
test('original operation receipt survives later indexing, verification and cancellation', async () => {
  const f = await fixture(),
    q = mut(f.p, 'own-replay-original', { limit: 3 }),
    first = await f.api.advanceCampaignRestoreOwnReview(uid, q);
  assert.deepEqual(await f.api.advanceCampaignRestoreOwnReview(uid, q), first);
  const p = await finish(f, await indexOwn(f, first.progress));
  const replay = await f.api.advanceCampaignRestoreOwnReview(uid, q);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.ownReview.phase, 'verified');
  await f.api.cancelCampaignRestore(uid, mut(p, 'own-replay-cancel'));
  const late = await f.api.advanceCampaignRestoreOwnReview(uid, q);
  assert.deepEqual(late.receipt, first.receipt);
  assert.equal(late.progress.state, 'cancelling');
  assert.equal(f.records.get(root).ownReview, null);
});
test('a re-signed file with an absent session passes integrity and is refused by both own semantic reviewers', async () => {
  const original = await signed();
  await rewriteCampaignBackupTestFile(original, (groups) => {
    const i = groups.findIndex((g) => g.kind === 'unit' && g.unit.section === 'own:session');
    assert.ok(i > 0);
    groups.splice(i, 1);
  });
  const f = await fixture(original),
    p = await indexOwn(f),
    before = structuredClone([...f.records]);
  await assert.rejects(originalProof(f));
  await assert.rejects(
    f.api.advanceCampaignRestoreOwnReview(uid, mut(p, 'own-invalid-join', { limit: 25 })),
  );
  assert.deepEqual([...f.records], before);
});
test('same metadata under a recreated index row is refused before any semantic checkpoint', async () => {
  const f = await fixture(),
    p = await indexOwn(f),
    path = root + '/reviewRows/' + chunkId(0),
    m = f.metadata.get(path),
    before = structuredClone([...f.records]);
  f.metadata.set(path, { ...m, createdAtNanoseconds: 40000, updatedAtNanoseconds: 40000 });
  await assert.rejects(
    f.api.advanceCampaignRestoreOwnReview(uid, mut(p, 'own-recreated-row', { limit: 25 })),
  );
  assert.deepEqual([...f.records], before);
});
test('corrupt later row authenticates no dependent lookup and does not advance the semantic checkpoint', async () => {
  const f = await fixture(),
    p = await indexOwn(f);
  const row = f.records.get(root + '/reviewRows/' + chunkId(p.reviewIndex.rows - 1));
  row.payload.tag = Buffer.alloc(16).toString('base64');
  const before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  let lookups = 0;
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        get: async (ref) => {
          if (
            ref.collectionPath?.endsWith('/reviewRows') &&
            ref.filters?.some((f) => f[0] === 'identityHash')
          )
            lookups++;
          return tx.get(ref);
        },
      }),
    );
  await assert.rejects(
    f.api.advanceCampaignRestoreOwnReview(uid, mut(p, 'own-corrupt-page', { limit: 25 })),
  );
  assert.equal(lookups, 0);
  assert.deepEqual([...f.records], before);
});
test('duplicate lookup identity is refused rather than selecting one row or following a forged relationship', async () => {
  const f = await fixture(),
    p = await indexOwn(f);
  const session = [...f.records.entries()].find(
    ([p, v]) => p.includes('/reviewRows/') && v.index === 3,
  );
  // Duplicate every logical identity to ensure any required join cannot select a forged row.
  for (const [p, v] of [...f.records])
    if (p.includes('/reviewRows/')) f.records.set(p + '-foreign', structuredClone(v));
  assert.ok(session);
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreOwnReview(uid, mut(p, 'own-duplicate-identity', { limit: 25 })),
  );
  assert.deepEqual([...f.records], before);
});
test('cancelling partial indexing removes keys/state and metadata cleanup preserves foreign orphan rows without progress', async () => {
  const f = await fixture();
  let p = await indexOwn(f);
  p = (await f.api.cancelCampaignRestore(uid, mut(p, 'own-orphan-cancel'))).progress;
  f.records.set(root + '/reviewRows/foreign', { ownerId: 'other', payload: 'PRESERVE' });
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreCleanup(uid, mut(p, 'own-orphan-clean', { limit: 25 })),
  );
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.has('users/' + uid + '/campaignRestoreKeys/' + rid), false);
});
test('two semantic writers publish one checkpoint and the other receives a CAS conflict', async () => {
  const f = await fixture(),
    p = await indexOwn(f),
    r = await Promise.allSettled([
      f.api.advanceCampaignRestoreOwnReview(uid, mut(p, 'own-race-check-first', { limit: 3 })),
      f.api.advanceCampaignRestoreOwnReview(uid, mut(p, 'own-race-check-second', { limit: 3 })),
    ]);
  assert.equal(r.filter((v) => v.status === 'fulfilled').length, 1);
  assert.equal(r.find((v) => v.status === 'rejected').reason.details.reason, 'checkpoint-conflict');
});
test('cancel while indexing is reading a frame prevents both late rows and the checkpoint', async () => {
  const f = await fixture(),
    open = f.api.openCampaignRestoreSource.bind(f.api);
  let entered, release;
  const arrival = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  f.api.openCampaignRestoreSource = async (...a) => {
    const s = await open(...a);
    return {
      size: s.size,
      async read(o, n) {
        entered();
        await gate;
        return s.read(o, n);
      },
    };
  };
  const pending = f.api
    .advanceCampaignRestoreOwnReview(uid, mut(f.p, 'own-pending-index', { limit: 25 }))
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  await arrival;
  await f.api.cancelCampaignRestore(uid, mut(f.p, 'own-interrupt-index'));
  release();
  assert.ok((await pending).error);
  assert.equal([...f.records.keys()].filter((p) => p.includes('/reviewRows/')).length, 0);
  assert.equal(f.records.get(root).state, 'cancelling');
});
for (const point of [0, 1, 2, 3])
  test(
    'index production rollback ' + point + ' keeps the old job and exact request can resume',
    async () => {
      const f = await fixture(),
        q = mut(f.p, 'own-rollback-index', { limit: 25 }),
        before = structuredClone([...f.records]),
        run = f.db.runTransaction.bind(f.db);
      f.db.runTransaction = (fn) =>
        run((tx) => {
          let count = 0;
          const w = { ...tx };
          for (const method of ['create', 'set'])
            w[method] = (ref, ...args) => {
              const result = tx[method](ref, ...args);
              if (count++ === point) throw Error('own-rollback');
              return result;
            };
          return fn(w);
        });
      await assert.rejects(f.api.advanceCampaignRestoreOwnReview(uid, q), /own-rollback/);
      assert.deepEqual([...f.records], before);
      f.db.runTransaction = run;
      assert.ok(
        (await f.api.advanceCampaignRestoreOwnReview(uid, q)).progress.reviewIndex.rows > 0,
      );
    },
  );
test('revoked issuance key withholds a completed own proof and index checking without mutating data', async () => {
  const f = await fixture(),
    p = await finish(f);
  f.keys[0].state = 'revoked';
  const before = structuredClone([...f.records]);
  await assert.rejects(
    proof(f, p),
    (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
  );
  assert.deepEqual([...f.records], before);
});
test('closed inputs, stale operations, foreign accounts and C4 cannot adopt or advance own indexes', async () => {
  const f = await fixture();
  await assert.rejects(
    f.api.advanceCampaignRestoreOwnReview(uid, mut(f.p, 'own-invalid-limit', { limit: 26 })),
  );
  await assert.rejects(
    f.api.advanceCampaignRestoreOwnReview(uid, {
      ...mut(f.p, 'own-invalid-cursor', { limit: 1 }),
      cursor: {},
    }),
  );
  await assert.rejects(
    f.api.advanceCampaignRestoreOwnReview('other', mut(f.p, 'own-foreign-account', { limit: 1 })),
  );
  const p = (
    await f.api.advanceCampaignRestoreOwnReview(
      uid,
      mut(f.p, 'own-cas-first-operation', { limit: 1 }),
    )
  ).progress;
  await assert.rejects(
    f.api.advanceCampaignRestoreOwnReview(uid, mut(f.p, 'own-cas-stale-operation', { limit: 1 })),
    (e) => e.details?.reason === 'checkpoint-conflict',
  );
  f.records.set('campaignDeletionReservations/' + p.campaignId, { ownerId: uid });
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreOwnReview(uid, mut(p, 'own-blocked-c4-operation', { limit: 1 })),
  );
  assert.deepEqual([...f.records], before);
});

test('cancel and index cleanup rollback preserve the last checkpoint, key and every row', async () => {
  const f = await fixture(),
    p = await indexOwn(f);
  const inject = (point) => {
    const run = f.db.runTransaction.bind(f.db);
    f.db.runTransaction = (fn) =>
      run((tx) => {
        let count = 0;
        const w = { ...tx };
        for (const method of ['create', 'set', 'delete'])
          w[method] = (ref, ...args) => {
            const r = tx[method](ref, ...args);
            if (count++ === point) throw Error('own-cleanup-rollback');
            return r;
          };
        return fn(w);
      });
    return () => (f.db.runTransaction = run);
  };
  let before = structuredClone([...f.records]),
    restore = inject(3);
  await assert.rejects(
    f.api.cancelCampaignRestore(uid, mut(p, 'own-rollback-cancel-operation')),
    /own-cleanup-rollback/,
  );
  assert.deepEqual([...f.records], before);
  restore();
  const c = (await f.api.cancelCampaignRestore(uid, mut(p, 'own-rollback-cancel-operation')))
    .progress;
  before = structuredClone([...f.records]);
  restore = inject(3);
  await assert.rejects(
    f.api.advanceCampaignRestoreCleanup(
      uid,
      mut(c, 'own-rollback-cleanup-operation', { limit: 2 }),
    ),
    /own-cleanup-rollback/,
  );
  assert.deepEqual([...f.records], before);
  restore();
});
test('index cleanup reads only bounded metadata and confirms row absence before touching chunks', async () => {
  const f = await fixture(),
    p = await indexOwn(f),
    c = (await f.api.cancelCampaignRestore(uid, mut(p, 'own-private-cleanup-cancel'))).progress,
    run = f.db.runTransaction.bind(f.db);
  let selected = 0;
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        get: async (ref) => {
          if (ref.collectionPath?.endsWith('/reviewRows')) {
            assert.ok(ref.maximum <= 26);
            assert.ok(!ref.fields.includes('payload'));
            selected++;
          }
          if (ref.path?.includes('/reviewRows/')) assert.fail('No full row read during cleanup');
          return tx.get(ref);
        },
      }),
    );
  const next = (
    await f.api.advanceCampaignRestoreCleanup(uid, mut(c, 'own-private-cleanup-step', { limit: 2 }))
  ).progress;
  assert.equal(next.reviewIndex.cleanedRows, 2);
  assert.equal(next.cleanedChunks, 0);
  assert.ok(selected > 0);
});
test('own staging requires completed file integrity and cannot start from an unverified upload', async () => {
  const f = adventureImportDb({ nativeUpdates: true }),
    api = createCampaignRestoreTransferService({ db: f.db }),
    bytes = Buffer.alloc(16, 1),
    p = (
      await api.startCampaignRestore(uid, {
        operationId: rid,
        source: {
          format: 'writer-campaign-backup',
          version: 1,
          byteLength: bytes.length,
          sha256: sha(bytes),
        },
      })
    ).progress,
    before = structuredClone([...f.records]);
  await assert.rejects(
    api.advanceCampaignRestoreOwnReview(
      uid,
      mut(p, 'own-before-integrity-operation', { limit: 1 }),
    ),
    (e) => e.details?.reason === 'state-conflict',
  );
  assert.deepEqual([...f.records], before);
});

test('signed legacy own data resumes with provenance v1 and preserves the unproven organizational universe policy', async () => {
  const s = await signed();
  await rewriteCampaignBackupTestFile(s, (groups) => {
    groups[0].value.contentVersion = 1;
    groups[0].value.provenanceVersion = 1;
    for (let n = groups.length - 1; n >= 0; n--)
      if (groups[n].kind === 'witness' && groups[n].value[0] === 'project') groups.splice(n, 1);
  });
  const f = await fixture(s),
    p = await finish(f, await indexOwn(f, undefined, 3), 3),
    result = await proof(f, p);
  assert.equal(result.manifest.contentVersion, 1);
  assert.equal(result.own.organizationalUniverse, 'unproven');
  assert.deepEqual(result, await originalProof(f));
});
