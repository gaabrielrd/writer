import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { createSHA256 } from 'hash-wasm';
import { restoredBackupFixture, uid } from './helpers/campaignRestoredBackup.mjs';
import { entity } from './helpers/campaignBackupLore.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { campaignBackupTestIndexes } from './helpers/campaignBackupTestIndexes.mjs';
import { rewriteCampaignBackupTestFile } from './helpers/campaignBackupRewrite.mjs';
import { createCampaignBackupFileService } from '../src/campaignBackupFile.mjs';
import { createCampaignBackupDerivedSemanticsService } from '../src/campaignBackupDerivedSemantics.mjs';
import {
  advanceCampaignDerivedRow,
  createCampaignDerivedRowState,
  campaignDerivedCounts,
} from '../src/campaignBackupDerivedRowWalk.mjs';
import { baseBodyKey } from '../src/campaignBaseContracts.mjs';
import { keyFor } from '../src/campaignBackupDerivedStaging.mjs';
import { createCampaignRestoreTransferService } from '../src/campaignRestoreTransfer.mjs';
import { sha, digest } from '../src/campaignRestoreContracts.mjs';
const rid = 'campaign-derived-check-0001',
  root = 'users/' + uid + '/campaignRestores/' + rid,
  input = (b) => ({ size: b.length, read: async (o, n) => b.subarray(o, o + n) }),
  mut = (p, operationId, extra = {}) => ({
    restoreId: rid,
    jobToken: p.jobToken,
    operationId,
    expectedCheckpoint: p.checkpoint,
    ...extra,
  });
let cached;
async function signed() {
  const f = await restoredBackupFixture({ local: true, long: true });
  await f.save('derived-check-variant', 0, entity({ details: 'SECRET DERIVED CHECK' }));
  f.pair = generateKeyPairSync('ed25519');
  f.keys = [{ id: 'derived-check-test', state: 'active', publicKey: f.pair.publicKey }];
  const frames = [];
  await createCampaignBackupFileService({
    db: f.db,
    storage: f.storage,
    keys: f.keys,
    keyId: f.keys[0].id,
    privateKey: f.pair.privateKey,
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
  f.file = Buffer.concat(frames);
  f.source = () => input(f.file);
  return f;
}
async function fixture(original) {
  cached ??= signed();
  const s = original ?? (await cached),
    f = adventureImportDb({ nativeUpdates: true }),
    bytes = s.file,
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
        mut(p, 'derived-check-upload-' + n, {
          index: n,
          chunkHash: sha(b),
          chunkBase64: b.toString('base64'),
        }),
      )
    ).progress;
  }
  for (const [method, field, phase] of [
    ['advanceCampaignRestoreFileReview', 'fileReview', 'verified'],
    ['advanceCampaignRestoreOwnReview', 'ownReview', 'verified'],
    ['advanceCampaignRestoreDerivedIndex', 'derivedReview', 'indexed'],
  ]) {
    let n = 0;
    while ((p[field]?.phase ?? p[field]?.status) !== phase && n < 2000)
      p = (await api[method](uid, mut(p, 'derived-prepare-' + field + '-' + n++, { limit: 25 })))
        .progress;
    assert.equal(p[field].phase ?? p[field].status, phase);
  }
  return { ...f, api, p, keys, bytes, original: s };
}
async function finish(f, p = f.p, limit = 25) {
  let n = 0;
  while (p.derivedCheck?.phase !== 'verified' && n < 10000)
    p = (
      await f.api.advanceCampaignRestoreDerivedSemantics(
        uid,
        mut(p, 'derived-check-step-' + n++, { limit }),
      )
    ).progress;
  assert.equal(p.derivedCheck.phase, 'verified');
  return p;
}
const proof = (f, p) =>
  f.api.getCampaignRestoreDerivedSemantics(uid, { restoreId: rid, jobToken: p.jobToken });
async function reference(f) {
  return createCampaignBackupDerivedSemanticsService({
    keys: f.keys,
    now: () => 6000,
  }).reviewCampaignBackupDerivedContent(uid, input(f.bytes), {
    index: await campaignBackupTestIndexes([])('derived'),
  });
}
test('a thousand body dependencies resume inside one item without replay, growing state or changing canonical bytes', async () => {
  const key = sha(Buffer.from('scene')),
    baseId = sha(Buffer.from('base')),
    parts = 1000,
    context = {
      active: { baseId, adventure: { id: 'adventure' }, universe: { kind: 'none' } },
      baseWitness: null,
    },
    field = {
      field: 'content',
      bodySourceKey: key,
      chunkCount: parts,
      bytes: 65536 * parts,
      sha256: sha(Buffer.from('text')),
    },
    row = {
      index: 0,
      section: 'base:item',
      key: keyFor(key),
      position: 0,
      value: {
        unit: { id: key, outcome: 'available' },
        meta: {
          sourceKey: key,
          kind: 'scene',
          origin: { kind: 'scene', adventureId: 'adventure', id: 'scene' },
          parentKey: null,
          fields: [field],
          image: null,
          relations: [],
        },
      },
    },
    witness = {
      section: 'w:item',
      key: keyFor(key),
      value: {
        record: [
          'item',
          key,
          'available',
          {
            baseId,
            sourceKey: key,
            availability: 'available',
            origin: { kind: 'adventure', adventureId: 'adventure' },
          },
        ],
      },
    },
    logicalField = {
      section: 'base:field',
      key: keyFor(key, 'content'),
      value: { unit: { outcome: 'available' }, meta: null },
    },
    bodies = Array.from({ length: parts }, (_, index) => ({
      section: 'base:bodies',
      key: keyFor(baseBodyKey(key, 'content', index)),
      value: { unit: { outcome: 'available' }, meta: { sourceKey: key, field: 'content', index } },
    })),
    byId = new Map(bodies.map((r, i) => [baseBodyKey(key, 'content', i), r])),
    visits = [],
    readers = {
      async find(section, id) {
        if (section === 'w:item') return witness;
        if (section === 'base:field') return logicalField;
        if (section === 'base:bodies') {
          const b = byId.get(id);
          visits.push(b.value.meta.index);
          return b;
        }
        assert.fail(section);
      },
      async reverse() {
        assert.fail('No reverse for scene');
      },
    };
  let s = createCampaignDerivedRowState(row),
    counts = campaignDerivedCounts(),
    h = await createSHA256(),
    reads = 0;
  h.init();
  while (s.phase !== 'item-body' || s.body !== 350) {
    const before = visits.length;
    await advanceCampaignDerivedRow({
      row,
      context,
      counts,
      state: s,
      readers,
      write: (b) => h.update(b),
    });
    assert.ok(visits.length - before <= 1);
    reads++;
  }
  assert.ok(reads > 350);
  const checkpoint = JSON.parse(
    JSON.stringify({ s, counts, hash: Buffer.from(h.save()).toString('base64') }),
  );
  assert.ok(JSON.stringify(checkpoint).length < 5000);
  assert.equal(Object.hasOwn(checkpoint.s, 'deps'), false);
  s = checkpoint.s;
  counts = checkpoint.counts;
  h = await createSHA256();
  h.load(Buffer.from(checkpoint.hash, 'base64'));
  visits.length = 0;
  while (!s.done)
    await advanceCampaignDerivedRow({
      row,
      context,
      counts,
      state: s,
      readers,
      write: (b) => h.update(b),
    });
  assert.equal(visits[0], 350);
  assert.deepEqual(
    visits,
    Array.from({ length: 650 }, (_, n) => n + 350),
  );
  const deps = [witness, logicalField, ...bodies].map((r) => [r.section, r.key, r.value]),
    expected = createHash('sha256')
      .update(JSON.stringify([row.section, row.key, row.value, deps]) + '\n')
      .digest('hex');
  assert.equal(h.digest('hex'), expected);
  assert.equal(counts.items, 1);
  assert.equal(counts.records, 1);
});
test('signed rich verification resumes every semantic step and returns exactly the complete proof', async () => {
  const f = await fixture();
  let p = f.p,
    last = 0;
  for (let n = 0; n < 10000 && p.derivedCheck?.phase !== 'verified'; n++) {
    p = (
      await f.api.advanceCampaignRestoreDerivedSemantics(
        uid,
        mut(p, 'derived-single-step-' + n, { limit: 1 }),
      )
    ).progress;
    assert.equal(p.derivedCheck.steps, last + 1);
    last = p.derivedCheck.steps;
    if (n === 40)
      f.api = createCampaignRestoreTransferService({ db: f.db, keys: f.keys, now: () => 7000 });
  }
  assert.equal(p.derivedCheck.phase, 'verified');
  assert.deepEqual(await proof(f, p), await reference(f));
  assert.doesNotMatch(JSON.stringify(p), /payload|hashState|parent|proof|SECRET DERIVED/);
  assert.doesNotMatch(JSON.stringify([...f.records]), /SECRET DERIVED CHECK/);
});
test('bounded calls never process more steps than requested and can finish in a new service', async () => {
  const f = await fixture();
  let p = f.p,
    last = 0,
    n = 0;
  while (p.derivedCheck?.phase !== 'verified') {
    p = (
      await f.api.advanceCampaignRestoreDerivedSemantics(
        uid,
        mut(p, 'derived-budget-step-' + n++, { limit: 7 }),
      )
    ).progress;
    assert.ok(p.derivedCheck.steps - last <= 7);
    last = p.derivedCheck.steps;
  }
  f.api = createCampaignRestoreTransferService({ db: f.db, keys: f.keys, now: () => 7000 });
  assert.deepEqual(await proof(f, p), await reference(f));
});
test('re-signed late missing-body violation preserves the last durable row/part checkpoint and cannot issue proof', async () => {
  const s = await signed();
  await rewriteCampaignBackupTestFile(s, (groups) => {
    const all = groups
      .map((g, i) => [g, i])
      .filter(([g]) => g.kind === 'unit' && g.unit.section === 'base:bodies');
    assert.ok(all.length > 2);
    groups.splice(all.at(-1)[1], 1);
  });
  const f = await fixture(s);
  let p = f.p,
    failed = false;
  for (let n = 0; n < 10000; n++) {
    const before = structuredClone([...f.records]);
    try {
      p = (
        await f.api.advanceCampaignRestoreDerivedSemantics(
          uid,
          mut(p, 'derived-late-body-step-' + n, { limit: 7 }),
        )
      ).progress;
    } catch {
      assert.deepEqual([...f.records], before);
      failed = true;
      break;
    }
  }
  assert.ok(failed);
  assert.notEqual(p.derivedCheck?.phase, 'verified');
  await assert.rejects(reference(f));
  await assert.rejects(proof(f, p));
});
test('explicit unresolved v3 relations remain unresolved and contribute the same semantic digest', async () => {
  const s = await signed();
  await rewriteCampaignBackupTestFile(s, (groups) => {
    const g = groups.find((g) => g.kind === 'unit' && g.unit.section === 'variant'),
      v = JSON.parse(Buffer.concat(g.chunks).toString('utf8'));
    v.entity.relations.push({ targetKey: 'e'.repeat(64), available: false, unresolved: true });
    g.chunks = [Buffer.from(JSON.stringify(v))];
  });
  const f = await fixture(s),
    p = await finish(f),
    result = await proof(f, p);
  assert.equal(result.derived.unresolvedRelations, 1);
  assert.deepEqual(result, await reference(f));
});
test('legacy content and witness v1 preserve proof bytes and policy through resumed checks', async () => {
  const s = await signed();
  await rewriteCampaignBackupTestFile(s, (groups) => {
    groups[0].value.contentVersion = 1;
    groups[0].value.provenanceVersion = 1;
    for (let n = groups.length - 1; n >= 0; n--)
      if (groups[n].kind === 'witness' && groups[n].value[0] === 'project') groups.splice(n, 1);
    for (const g of groups)
      if (g.kind === 'unit' && ['base:field', 'anchor:field'].includes(g.unit.section)) {
        const b = Buffer.concat(g.chunks);
        g.chunks = [];
        for (let n = 0; n < b.length; n += 65536) g.chunks.push(b.subarray(n, n + 65536));
        if (!g.chunks.length) g.chunks.push(Buffer.alloc(0));
      }
  });
  const f = await fixture(s),
    p = await finish(f, undefined, 3);
  assert.deepEqual(await proof(f, p), await reference(f));
});
test('original receipt replay remains available after verification and key-revoking cancellation', async () => {
  const f = await fixture(),
    q = mut(f.p, 'derived-check-replay-first', { limit: 3 }),
    first = await f.api.advanceCampaignRestoreDerivedSemantics(uid, q);
  assert.deepEqual(await f.api.advanceCampaignRestoreDerivedSemantics(uid, q), first);
  const p = await finish(f, first.progress),
    replay = await f.api.advanceCampaignRestoreDerivedSemantics(uid, q);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.derivedCheck.phase, 'verified');
  const c = await f.api.cancelCampaignRestore(uid, mut(p, 'derived-check-replay-cancel'));
  assert.equal(f.records.get(root).derivedCheck, null);
  assert.equal(f.records.has('users/' + uid + '/campaignRestoreKeys/' + rid), false);
  assert.deepEqual(
    (await f.api.advanceCampaignRestoreDerivedSemantics(uid, q)).receipt,
    first.receipt,
  );
  await assert.rejects(proof(f, c.progress));
});
for (const point of [0, 1, 2])
  test(
    'semantic checkpoint rollback ' + point + ' leaves no receipt/state and exact retry succeeds',
    async () => {
      const f = await fixture(),
        before = structuredClone([...f.records]),
        run = f.db.runTransaction.bind(f.db),
        q = mut(f.p, 'derived-check-rollback-first', { limit: 3 });
      f.db.runTransaction = (fn) =>
        run((tx) => {
          let n = 0;
          const w = { ...tx };
          for (const method of ['create', 'set'])
            w[method] = (ref, ...args) => {
              const r = tx[method](ref, ...args);
              if (n++ === point) throw Error('semantic-rollback');
              return r;
            };
          return fn(w);
        });
      await assert.rejects(
        f.api.advanceCampaignRestoreDerivedSemantics(uid, q),
        /semantic-rollback/,
      );
      assert.deepEqual([...f.records], before);
      f.db.runTransaction = run;
      assert.equal(
        (await f.api.advanceCampaignRestoreDerivedSemantics(uid, q)).progress.derivedCheck.steps,
        3,
      );
    },
  );
test('two semantic writers publish one checkpoint and report a conflict for the other operation', async () => {
  const f = await fixture(),
    results = await Promise.allSettled([
      f.api.advanceCampaignRestoreDerivedSemantics(
        uid,
        mut(f.p, 'derived-check-race-first', { limit: 7 }),
      ),
      f.api.advanceCampaignRestoreDerivedSemantics(
        uid,
        mut(f.p, 'derived-check-race-second', { limit: 7 }),
      ),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.details.reason,
    'checkpoint-conflict',
  );
});
test('cancellation during an index dependency lookup prevents a late checkpoint', async () => {
  const f = await fixture(),
    open = f.api.openCampaignRestoreDerivedIndex.bind(f.api);
  let entered, release;
  const arrival = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  f.api.openCampaignRestoreDerivedIndex = async (...a) => {
    const port = await open(...a);
    return {
      ...port,
      async lookup(...args) {
        entered();
        await gate;
        return port.lookup(...args);
      },
    };
  };
  const pending = f.api
    .advanceCampaignRestoreDerivedSemantics(
      uid,
      mut(f.p, 'derived-check-pending-step', { limit: 25 }),
    )
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  await arrival;
  await f.api.cancelCampaignRestore(uid, mut(f.p, 'derived-check-pending-cancel'));
  release();
  assert.ok((await pending).error);
  assert.equal(f.records.get(root).derivedCheck, undefined);
});
test('current key revocation and C4 withhold completed semantic proof without modifying history', async () => {
  const f = await fixture(),
    p = await finish(f),
    before = structuredClone([...f.records]);
  f.keys[0].state = 'revoked';
  await assert.rejects(
    proof(f, p),
    (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
  );
  assert.deepEqual([...f.records], before);
  f.keys[0].state = 'active';
  f.records.set('campaignDeletionReservations/' + p.campaignId, { ownerId: uid });
  await assert.rejects(proof(f, p));
});
test('malformed or stale requests and foreign account/token cannot consume or advance the checkpoint', async () => {
  const f = await fixture();
  for (const limit of [0, 26, 1.5, null])
    await assert.rejects(
      f.api.advanceCampaignRestoreDerivedSemantics(
        uid,
        mut(f.p, 'derived-check-invalid-operation', { limit }),
      ),
    );
  await assert.rejects(
    f.api.advanceCampaignRestoreDerivedSemantics(
      'other',
      mut(f.p, 'derived-check-foreign-operation', { limit: 1 }),
    ),
    (e) => e.code === 'not-found',
  );
  await assert.rejects(
    f.api.advanceCampaignRestoreDerivedSemantics(uid, {
      ...mut(f.p, 'derived-check-token-operation', { limit: 1 }),
      jobToken: 'a'.repeat(64),
    }),
    (e) => e.details?.reason === 'identity-conflict',
  );
  await f.api.advanceCampaignRestoreDerivedSemantics(
    uid,
    mut(f.p, 'derived-check-valid-first', { limit: 1 }),
  );
  await assert.rejects(
    f.api.advanceCampaignRestoreDerivedSemantics(
      uid,
      mut(f.p, 'derived-check-stale-second', { limit: 1 }),
    ),
    (e) => e.details?.reason === 'checkpoint-conflict',
  );
});
test('corrupt encrypted continuation is refused without restarting or changing its frontier', async () => {
  const f = await fixture(),
    p = (
      await f.api.advanceCampaignRestoreDerivedSemantics(
        uid,
        mut(f.p, 'derived-check-corrupt-first', { limit: 7 }),
      )
    ).progress,
    job = f.records.get(root);
  job.derivedCheck.payload.tag = Buffer.alloc(16).toString('base64');
  const op = f.records.get('users/' + uid + '/campaignRestoreOperations/' + job.lastOperationId);
  op.jobHash = digest(job);
  f.records.get(root + '/receipts/' + job.lastOperationId).opHash = digest(op);
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreDerivedSemantics(
      uid,
      mut(p, 'derived-check-corrupt-next', { limit: 1 }),
    ),
  );
  assert.deepEqual([...f.records], before);
});
