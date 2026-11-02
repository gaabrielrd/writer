import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { rewriteCampaignBackupTestFile } from './helpers/campaignBackupRewrite.mjs';
import { createCampaignBackupFileScanner } from '../src/campaignBackupFileScanner.mjs';
import { validateCampaignBackupFile } from '../src/campaignBackupFileValidation.mjs';
import { createCampaignRestoreTransferService } from '../src/campaignRestoreTransfer.mjs';
import { createStudioService } from '../src/studio.mjs';
import { sha, digest } from '../src/campaignRestoreContracts.mjs';
import { restoredBackupFixture, uid } from './helpers/campaignRestoredBackup.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';

const rid = 'campaign-file-review-0001',
  path = 'users/' + uid + '/campaignRestores/' + rid;
let original;
async function signed() {
  original ??= restoredBackupFixture({ local: true, long: true }).then(async (f) => ({
    bytes: (await f.write()).bytes,
    keys: f.keys,
  }));
  return original;
}
function source(bytes, reads = []) {
  return {
    size: bytes.length,
    async read(offset, length) {
      reads.push([offset, length]);
      return bytes.subarray(offset, offset + length);
    },
  };
}
const mutation = (p, operationId, extra = {}) => ({
  restoreId: rid,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
const request = (p, n = 0, limit = 1) => mutation(p, 'campaign-review-step-' + n, { limit });
async function fixture(data) {
  const s = await signed(),
    f = adventureImportDb({ nativeUpdates: true }),
    bytes = data ?? s.bytes,
    keys = s.keys.map((k) => ({ ...k }));
  const api = createCampaignRestoreTransferService({ db: f.db, keys, now: () => 6000 });
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
        mutation(p, 'campaign-review-upload-' + n, {
          index: n,
          chunkHash: sha(b),
          chunkBase64: b.toString('base64'),
        }),
      )
    ).progress;
  }
  return { ...f, api, p, bytes, keys };
}
async function complete(f, p = f.p, limit = 25) {
  let n = 0;
  while (p.fileReview?.status !== 'verified' && n < 2000)
    p = (await f.api.advanceCampaignRestoreFileReview(uid, request(p, n++, limit))).progress;
  assert.equal(p.fileReview.status, 'verified');
  return p;
}
test('one-frame snapshots resume every byte-exact signed frame including a long field without rereading a prefix', async () => {
  const f = await signed(),
    reads = [],
    input = source(f.bytes, reads),
    expected = await validateCampaignBackupFile(uid, input, { keys: f.keys, now: () => 6000 });
  reads.length = 0;
  let checkpoint = null,
    previousOffset = 0,
    activeMidway = false,
    proof;
  for (let n = 0; n < 2000; n++) {
    const scan = await createCampaignBackupFileScanner(uid, input, {
      keys: f.keys,
      now: () => 6000,
      resumable: true,
      checkpoint,
    });
    const from = reads.length,
      next = await scan.next(),
      snapshot = scan.snapshot();
    assert.ok(reads.slice(from).every(([offset]) => offset >= previousOffset));
    assert.ok(reads.slice(from).length <= 4);
    assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 65536);
    if (snapshot.active?.index > 0) activeMidway = true;
    previousOffset = snapshot.cursor.offset;
    checkpoint = JSON.parse(JSON.stringify(snapshot));
    scan.dispose();
    if (next.done) {
      proof = next.result;
      break;
    }
  }
  assert.ok(activeMidway);
  assert.deepEqual(proof, expected);
  const resumed = await createCampaignBackupFileScanner(uid, input, {
    keys: f.keys,
    now: () => 6000,
    resumable: true,
    checkpoint,
  });
  const count = reads.length;
  assert.deepEqual(await resumed.result(), expected);
  assert.equal(reads.length, count);
  resumed.dispose();
});
test('checkpoint mode rejects callbacks and complete review cannot accept a host checkpoint', async () => {
  const f = await signed(),
    input = source(f.bytes);
  for (const k of ['onProgress', 'onOwnUnit', 'onDerivedUnit', 'onWitness'])
    await assert.rejects(
      createCampaignBackupFileScanner(uid, input, { resumable: true, [k]: () => {} }),
      TypeError,
    );
  await assert.rejects(validateCampaignBackupFile(uid, input, { checkpoint: {} }), TypeError);
  const scan = await createCampaignBackupFileScanner(uid, input, { keys: f.keys });
  await scan.next();
  assert.throws(() => scan.snapshot(), TypeError);
  scan.dispose();
  await assert.rejects(scan.next(), TypeError);
});
for (const [name, change] of [
  ['codec', (c) => (c.codec = 'unknown')],
  ['owner', (c) => (c.uid = 'other')],
  ['size', (c) => c.size++],
  ['unknown field', (c) => (c.extra = true)],
  ['cursor', (c) => (c.cursor.offset = 0)],
  ['hash', (c) => (c.contentHashState = '%%%%')],
  ['header', (c) => (c.header.contentVersion = 99)],
  ['counts', (c) => (c.units = Number.MAX_SAFE_INTEGER)],
  ['seal', (c) => (c.seal = { records: 0 })],
])
  test('host checkpoint rejects invalid ' + name + ' before source reads', async () => {
    const f = await signed(),
      scan = await createCampaignBackupFileScanner(uid, source(f.bytes), {
        keys: f.keys,
        resumable: true,
      });
    await scan.next();
    const c = scan.snapshot();
    scan.dispose();
    change(c);
    const reads = [];
    await assert.rejects(
      createCampaignBackupFileScanner(uid, source(f.bytes, reads), {
        keys: f.keys,
        resumable: true,
        checkpoint: c,
      }),
    );
    assert.equal(reads.length, 0);
  });
test('scanner refuses simultaneous advances and never exports an in-flight state', async () => {
  const f = await signed();
  let release, entered;
  const gate = new Promise((r) => (release = r)),
    arrival = new Promise((r) => (entered = r));
  const input = {
    size: f.bytes.length,
    async read(o, n) {
      entered();
      await gate;
      return f.bytes.subarray(o, o + n);
    },
  };
  const scan = await createCampaignBackupFileScanner(uid, input, { keys: f.keys, resumable: true });
  const first = scan.next();
  await arrival;
  await assert.rejects(scan.next(), TypeError);
  assert.throws(() => scan.snapshot(), TypeError);
  release();
  await first;
  scan.dispose();
});
test('persistent integrity survives service recreation, bounded steps and original receipt retries', async () => {
  const f = await fixture();
  let p = f.p;
  const one = request(p),
    first = await f.api.advanceCampaignRestoreFileReview(uid, one);
  assert.equal(first.progress.fileReview.records, 1);
  assert.deepEqual(await f.api.advanceCampaignRestoreFileReview(uid, one), first);
  const current = f.records.get(path);
  assert.ok(current.fileReview.payload.data);
  assert.doesNotMatch(
    JSON.stringify(first),
    /payload|contentHashState|provenanceHashState|originCampaignId/,
  );
  f.api = createCampaignRestoreTransferService({ db: f.db, keys: f.keys, now: () => 7000 });
  p = (await f.api.getCampaignRestore(uid, { restoreId: rid, jobToken: p.jobToken })).progress;
  let n = 1,
    last = p.fileReview.records;
  while (p.fileReview.status !== 'verified') {
    p = (await f.api.advanceCampaignRestoreFileReview(uid, request(p, n++, 7))).progress;
    assert.ok(p.fileReview.records - last <= 7);
    last = p.fileReview.records;
  }
  const proof = await f.api.getCampaignRestoreFileIntegrity(uid, {
    restoreId: rid,
    jobToken: p.jobToken,
  });
  assert.deepEqual(
    proof,
    await validateCampaignBackupFile(uid, source(f.bytes), { keys: f.keys, now: () => 7000 }),
  );
  const replay = await f.api.advanceCampaignRestoreFileReview(uid, one);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.fileReview.status, 'verified');
  assert.equal(
    await createStudioService({ db: f.db }).getCampaign(uid, { id: p.campaignId }),
    null,
  );
  assert.equal(proof.validation, 'campaign-file-integrity-only');
});
test('complete integrity proof rechecks key revocation without reading archive payload or activating a campaign', async () => {
  const f = await fixture(),
    p = await complete(f);
  f.keys[0].state = 'revoked';
  const port = f.api.openCampaignRestoreSource.bind(f.api);
  let payloadReads = 0;
  f.api.openCampaignRestoreSource = async (...args) => {
    const s = await port(...args);
    return {
      size: s.size,
      async read(...range) {
        payloadReads++;
        return s.read(...range);
      },
    };
  };
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.getCampaignRestoreFileIntegrity(uid, { restoreId: rid, jobToken: p.jobToken }),
    (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
  );
  assert.deepEqual([...f.records], before);
  assert.equal(payloadReads, 0);
});
test('cancellation removes encrypted checkpoint/key atomically and preserves the historical review receipt', async () => {
  const f = await fixture(),
    q = request(f.p),
    first = await f.api.advanceCampaignRestoreFileReview(uid, q);
  let p = (
    await f.api.cancelCampaignRestore(uid, mutation(first.progress, 'campaign-review-cancel'))
  ).progress;
  assert.equal(f.records.get(path).fileReview, null);
  assert.equal(f.records.has('users/' + uid + '/campaignRestoreKeys/' + rid), false);
  assert.equal(Object.hasOwn(p, 'fileReview'), false);
  const historical = await f.api.advanceCampaignRestoreFileReview(uid, q);
  assert.deepEqual(historical.receipt, first.receipt);
  assert.equal(historical.progress.state, 'cancelling');
  for (let n = 0; p.state !== 'cancelled'; n++)
    p = (
      await f.api.advanceCampaignRestoreCleanup(
        uid,
        mutation(p, 'campaign-review-clean-' + n, { limit: 25 }),
      )
    ).progress;
  assert.equal(f.records.get(path).fileReview, null);
  await assert.rejects(
    f.api.getCampaignRestoreFileIntegrity(uid, { restoreId: rid, jobToken: p.jobToken }),
  );
});
test('two concurrent review writers commit one checkpoint, preserving the loser operation for explicit conflict', async () => {
  const f = await fixture(),
    outcomes = await Promise.allSettled([
      f.api.advanceCampaignRestoreFileReview(uid, request(f.p, 'race-a', 3)),
      f.api.advanceCampaignRestoreFileReview(uid, request(f.p, 'race-b', 3)),
    ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    outcomes.find((r) => r.status === 'rejected').reason.details.reason,
    'checkpoint-conflict',
  );
  assert.equal(
    (await f.api.getCampaignRestore(uid, { restoreId: rid })).progress.fileReview.records,
    3,
  );
});
test('a cancellation while a frame is being read prevents the late checkpoint commit', async () => {
  const f = await fixture(),
    port = f.api.openCampaignRestoreSource.bind(f.api);
  let entered, release;
  const arrival = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  f.api.openCampaignRestoreSource = async (...args) => {
    const s = await port(...args);
    return {
      size: s.size,
      async read(o, n) {
        entered();
        await gate;
        return s.read(o, n);
      },
    };
  };
  const pending = f.api.advanceCampaignRestoreFileReview(uid, request(f.p)).then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await arrival;
  const cancelled = await f.api.cancelCampaignRestore(uid, mutation(f.p, 'campaign-race-cancel'));
  release();
  assert.ok((await pending).error);
  assert.equal(f.records.get(path).state, 'cancelling');
  assert.equal(f.records.get(path).fileReview, undefined);
  assert.equal(cancelled.progress.checkpoint, f.p.checkpoint + 1);
});
test('recreated job identity refuses a previous review token before any checkpoint is adopted', async () => {
  const f = await fixture(),
    p = (await f.api.advanceCampaignRestoreFileReview(uid, request(f.p))).progress;
  const m = f.metadata.get(path);
  f.metadata.set(path, {
    ...m,
    createdAtNanoseconds: m.createdAtNanoseconds + 4000,
    updatedAtNanoseconds: m.createdAtNanoseconds + 4000,
  });
  await assert.rejects(
    f.api.advanceCampaignRestoreFileReview(uid, request(p, 1)),
    (e) => e.details?.reason === 'identity-conflict',
  );
});
for (const limit of [0, 26, 1.5, null, '1'])
  test(
    'review refuses invalid frame limit ' + String(limit) + ' without reading or writing',
    async () => {
      const f = await fixture(),
        before = structuredClone([...f.records]);
      await assert.rejects(f.api.advanceCampaignRestoreFileReview(uid, request(f.p, 0, limit)));
      assert.deepEqual([...f.records], before);
    },
  );
for (const point of [0, 1, 2])
  test(
    'review write rollback ' + point + ' leaves no checkpoint or receipt and exact retry succeeds',
    async () => {
      const f = await fixture(),
        before = structuredClone([...f.records]),
        run = f.db.runTransaction.bind(f.db);
      f.db.runTransaction = (fn) =>
        run((tx) => {
          let count = 0;
          const wrapped = { ...tx };
          for (const method of ['create', 'set'])
            wrapped[method] = (ref, ...args) => {
              const v = tx[method](ref, ...args);
              if (count++ === point) throw Error('review-rollback');
              return v;
            };
          return fn(wrapped);
        });
      const q = request(f.p);
      await assert.rejects(f.api.advanceCampaignRestoreFileReview(uid, q), /review-rollback/);
      assert.deepEqual([...f.records], before);
      f.db.runTransaction = run;
      assert.equal(
        (await f.api.advanceCampaignRestoreFileReview(uid, q)).progress.fileReview.records,
        1,
      );
    },
  );
test('a valid upload SHA cannot certify a corrupt archive and a failed step preserves the last durable prefix', async () => {
  const s = await signed(),
    bytes = Buffer.from(s.bytes);
  bytes[bytes.length - 1] ^= 1;
  const f = await fixture(bytes);
  let p = f.p,
    failed = false,
    n = 0;
  for (; n < 2000; n++) {
    const before = structuredClone([...f.records]);
    try {
      p = (await f.api.advanceCampaignRestoreFileReview(uid, request(p, n, 9))).progress;
    } catch {
      assert.deepEqual([...f.records], before);
      failed = true;
      break;
    }
  }
  assert.ok(failed);
  assert.equal(p.state, 'bytes-verified');
  assert.notEqual(p.fileReview?.status, 'verified');
  await assert.rejects(
    f.api.getCampaignRestoreFileIntegrity(uid, { restoreId: rid, jobToken: p.jobToken }),
    (e) => e.details?.reason === 'file-review-incomplete',
  );
});
test('C4 barrier prevents review and key/payload reads before any persistent checkpoint', async () => {
  const f = await fixture();
  f.records.set('campaignDeletionReservations/' + f.p.campaignId, { ownerId: uid });
  const before = structuredClone([...f.records]);
  f.metadataReads.length = 0;
  await assert.rejects(f.api.advanceCampaignRestoreFileReview(uid, request(f.p)));
  assert.deepEqual([...f.records], before);
  assert.ok(!f.metadataReads.some((r) => r.path.includes('campaignRestoreKeys')));
});
test('same operation cannot change its limit or bypass CAS and owner/job identity', async () => {
  const f = await fixture(),
    q = request(f.p),
    p = (await f.api.advanceCampaignRestoreFileReview(uid, q)).progress;
  await assert.rejects(
    f.api.advanceCampaignRestoreFileReview(uid, { ...q, limit: 2 }),
    (e) => e.details?.reason === 'operation-mismatch',
  );
  await assert.rejects(
    f.api.advanceCampaignRestoreFileReview(uid, request(f.p, 'stale')),
    (e) => e.details?.reason === 'checkpoint-conflict',
  );
  await assert.rejects(
    f.api.advanceCampaignRestoreFileReview('other', request(p, 'foreign')),
    (e) => e.code === 'not-found',
  );
  await assert.rejects(
    f.api.advanceCampaignRestoreFileReview(uid, {
      ...request(p, 'token'),
      jobToken: 'a'.repeat(64),
    }),
    (e) => e.details?.reason === 'identity-conflict',
  );
});
test('a corrupted stored checkpoint fails closed rather than resetting to the beginning', async () => {
  const f = await fixture(),
    p = (await f.api.advanceCampaignRestoreFileReview(uid, request(f.p))).progress;
  const job = f.records.get(path);
  job.fileReview.payload.tag = Buffer.alloc(16).toString('base64');
  // Keep metadata/receipt hashes coherent to exercise authenticated decryption itself.
  const opPath = 'users/' + uid + '/campaignRestoreOperations/' + job.lastOperationId,
    op = f.records.get(opPath);
  op.jobHash = digest(job);
  f.records.get(path + '/receipts/' + job.lastOperationId).opHash = digest(op);
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreFileReview(uid, request(p, 1)),
    (e) => e.details?.reason === 'restore-inconsistent',
  );
  assert.deepEqual([...f.records], before);
});

test('a checkpoint ciphertext from an earlier CAS cannot replace the current checkpoint', async () => {
  const f = await fixture();
  let p = (await f.api.advanceCampaignRestoreFileReview(uid, request(f.p, 0))).progress;
  const oldPayload = structuredClone(f.records.get(path).fileReview.payload);
  p = (await f.api.advanceCampaignRestoreFileReview(uid, request(p, 1))).progress;
  const job = f.records.get(path);
  job.fileReview.payload = oldPayload;
  const opPath = 'users/' + uid + '/campaignRestoreOperations/' + job.lastOperationId,
    op = f.records.get(opPath);
  op.jobHash = digest(job);
  f.records.get(path + '/receipts/' + job.lastOperationId).opHash = digest(op);
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreFileReview(uid, request(p, 2)),
    (e) => e.details?.reason === 'restore-inconsistent',
  );
  assert.deepEqual([...f.records], before);
});
test('truncation before the final seal never becomes a complete persistent integrity proof', async () => {
  const s = await signed(),
    f = await fixture(s.bytes.subarray(0, s.bytes.length - 40));
  let p = f.p,
    failed = false;
  for (let n = 0; n < 2000; n++) {
    const before = structuredClone([...f.records]);
    try {
      p = (await f.api.advanceCampaignRestoreFileReview(uid, request(p, n, 25))).progress;
    } catch {
      failed = true;
      assert.deepEqual([...f.records], before);
      break;
    }
  }
  assert.ok(failed);
  assert.notEqual(p.fileReview?.status, 'verified');
});
test('revocation before the seal preserves the running checkpoint and refuses a verified proof', async () => {
  const f = await fixture();
  let p = (await f.api.advanceCampaignRestoreFileReview(uid, request(f.p))).progress;
  f.keys[0].state = 'revoked';
  let failed = false;
  for (let n = 1; n < 2000; n++) {
    const before = structuredClone([...f.records]);
    try {
      p = (await f.api.advanceCampaignRestoreFileReview(uid, request(p, n, 25))).progress;
    } catch (e) {
      assert.equal(e.details?.reason, 'campaign-backup-invalid-attestation');
      assert.deepEqual([...f.records], before);
      failed = true;
      break;
    }
  }
  assert.ok(failed);
  assert.equal(p.fileReview.status, 'running');
});
test('unverified semantic content is never returned as a completed review or an activation grant', async () => {
  const f = await fixture(),
    p = await complete(f),
    proof = await f.api.getCampaignRestoreFileIntegrity(uid, {
      restoreId: rid,
      jobToken: p.jobToken,
    });
  assert.deepEqual(Object.keys(proof).sort(), ['attestation', 'manifest', 'seal', 'validation']);
  assert.equal(proof.validation, 'campaign-file-integrity-only');
  await assert.rejects(
    f.api.advanceCampaignRestoreFileReview(uid, request(p, 'after-seal')),
    (e) => e.details?.reason === 'state-conflict',
  );
});

for (const version of [1, 2])
  test(
    'resumable scanner preserves genuinely signed content version ' +
      version +
      ' and its native chunk grammar',
    async () => {
      const original = await signed(),
        pair = generateKeyPairSync('ed25519'),
        f = { source: () => source(original.bytes), pair };
      await rewriteCampaignBackupTestFile(f, (groups) => {
        groups[0].value.contentVersion = version;
        if (version === 1) {
          groups[0].value.provenanceVersion = 1;
          for (let i = groups.length - 1; i >= 0; i--)
            if (groups[i].kind === 'witness' && groups[i].value[0] === 'project')
              groups.splice(i, 1);
          for (const g of groups)
            if (g.kind === 'unit' && g.unit.outcome === 'available') {
              const b = Buffer.concat(g.chunks);
              g.chunks = [];
              for (let i = 0; i < b.length; i += 65536) g.chunks.push(b.subarray(i, i + 65536));
              if (!g.chunks.length) g.chunks.push(Buffer.alloc(0));
            }
        }
        groups.at(-1).value.attestation.keyId = 'checkpoint-legacy-test';
      });
      const keys = [
          { id: 'checkpoint-legacy-test', state: 'verify-only', publicKey: pair.publicKey },
        ],
        input = source(f.file),
        expected = await validateCampaignBackupFile(uid, input, { keys, now: () => 6000 });
      let checkpoint = null,
        result;
      for (let n = 0; n < 2000; n++) {
        const scan = await createCampaignBackupFileScanner(uid, input, {
            keys,
            now: () => 6000,
            resumable: true,
            checkpoint,
          }),
          next = await scan.next();
        checkpoint = JSON.parse(JSON.stringify(scan.snapshot()));
        scan.dispose();
        if (next.done) {
          result = next.result;
          break;
        }
      }
      assert.equal(result.manifest.contentVersion, version);
      assert.deepEqual(result, expected);
    },
  );
