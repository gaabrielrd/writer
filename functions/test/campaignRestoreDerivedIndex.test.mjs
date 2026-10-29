import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { restoredBackupFixture, uid } from './helpers/campaignRestoredBackup.mjs';
import { entity } from './helpers/campaignBackupLore.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { campaignBackupTestIndexes } from './helpers/campaignBackupTestIndexes.mjs';
import { rewriteCampaignBackupTestFile } from './helpers/campaignBackupRewrite.mjs';
import { createCampaignBackupFileService } from '../src/campaignBackupFile.mjs';
import { createCampaignBackupDerivedSemanticsService } from '../src/campaignBackupDerivedSemantics.mjs';
import { createCampaignRestoreTransferService } from '../src/campaignRestoreTransfer.mjs';
import { sha, chunkId } from '../src/campaignRestoreContracts.mjs';
const rid = 'campaign-derived-index-0001',
  root = 'users/' + uid + '/campaignRestores/' + rid;
const input = (b) => ({ size: b.length, read: async (o, n) => b.subarray(o, o + n) });
const mut = (p, operationId, extra = {}) => ({
  restoreId: rid,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
let cached;
async function signed({ long = true, large = false } = {}) {
  const f = await restoredBackupFixture({ local: true, long });
  const value = entity({ details: large ? 'x'.repeat(150000) : 'SECRET DERIVED VARIANT' });
  if (large)
    Object.assign(value.structuredDetails, {
      appearance: 'x'.repeat(150000),
      personality: 'x'.repeat(150000),
      history: 'x'.repeat(150000),
    });
  await f.save('derived-index-variant', 0, value);
  const pair = generateKeyPairSync('ed25519');
  f.pair = pair;
  f.keys = [{ id: 'derived-index-test', state: 'active', publicKey: pair.publicKey }];
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
  f.source = () => input(f.file ?? f.bytes);
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
        mut(p, 'derived-index-upload-' + n, {
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
        mut(p, 'derived-file-step-' + n, { limit: 25 }),
      )
    ).progress;
  for (let n = 0; p.ownReview?.phase !== 'verified' && n < 2000; n++)
    p = (
      await api.advanceCampaignRestoreOwnReview(uid, mut(p, 'derived-own-step-' + n, { limit: 25 }))
    ).progress;
  assert.equal(p.ownReview.phase, 'verified');
  return { ...f, api, p, keys, bytes, original: s };
}
async function finish(f, p = f.p, limit = 25) {
  for (let n = 0; p.derivedReview?.phase !== 'indexed' && n < 2000; n++)
    p = (
      await f.api.advanceCampaignRestoreDerivedIndex(
        uid,
        mut(p, 'derived-index-step-' + n, { limit }),
      )
    ).progress;
  assert.equal(p.derivedReview.phase, 'indexed');
  return p;
}
const open = (f, p) =>
  f.api.openCampaignRestoreDerivedIndex(uid, { restoreId: rid, jobToken: p.jobToken });
async function readAll(port) {
  const rows = [];
  for (let n = 0; n < port.certificate.rows; n += 25)
    rows.push(...(await port.read(n, Math.min(25, port.certificate.rows - n))));
  return rows;
}
async function originalRows(f) {
  const rows = [],
    port = await campaignBackupTestIndexes([])('derived'),
    write = port.write;
  port.write = async (r) => {
    rows.push({
      index: r.index,
      section: r.section,
      key: r.key,
      position: r.position,
      value: JSON.parse(Buffer.from(r.payload).toString('utf8')),
    });
    await write(r);
  };
  await createCampaignBackupDerivedSemanticsService({
    keys: f.keys,
    now: () => 6000,
  }).reviewCampaignBackupDerivedContent(uid, input(f.bytes), { index: port });
  return rows;
}
test('rich signed derived index resumes per frame and equals all metadata staged by the real semantic reviewer', async () => {
  const f = await fixture(),
    p = await finish(f, undefined, 1);
  f.api = createCampaignRestoreTransferService({ db: f.db, keys: f.keys, now: () => 7000 });
  const port = await open(f, p),
    rows = await readAll(port);
  assert.deepEqual(rows, await originalRows(f));
  for (const section of [
    'base:item',
    'base:field',
    'base:bodies',
    'base:links',
    'base:loreReferences',
    'image',
    'variant',
    'anchor',
    'anchor:field',
    'w:base',
    'w:item',
    'w:anchor',
  ])
    assert.ok(
      rows.some((r) => r.section === section),
      section,
    );
  assert.equal(port.certificate.validation, 'campaign-derived-index-only');
  assert.doesNotMatch(JSON.stringify(p), /payload|SECRET DERIVED|sourceKey|anchorKey/);
  assert.doesNotMatch(JSON.stringify([...f.records]), /SECRET DERIVED VARIANT/);
});
test('persistent lookups, absence neighbors and reverse witnesses drive the unchanged complete semantic checker', async () => {
  const f = await fixture(),
    p = await finish(f),
    port = await open(f, p),
    tags = new Map();
  const wrap = ({ index, section, key, position, value }) => ({
      index,
      section,
      key,
      position,
      payload: Buffer.from(JSON.stringify(value)),
      tag: tags.get(index),
    }),
    adapter = {
      async write(r) {
        const [actual] = await port.read(r.index, 1);
        assert.equal(JSON.stringify(actual.value), Buffer.from(r.payload).toString('utf8'));
        tags.set(r.index, r.tag);
      },
      async seal() {},
      async read(start, limit) {
        return (await port.read(start, limit)).map(wrap);
      },
      async lookup(section, key) {
        const r = await port.lookup(section, key);
        return 'before' in r
          ? { before: r.before ? wrap(r.before) : null, after: r.after ? wrap(r.after) : null }
          : wrap(r);
      },
      async reverse(kind, key) {
        return wrap(await port.reverse(kind, key));
      },
      async dispose() {
        tags.clear();
      },
    };
  const result = await createCampaignBackupDerivedSemanticsService({
    keys: f.keys,
    now: () => 6000,
  }).reviewCampaignBackupDerivedContent(uid, input(f.bytes), { index: adapter });
  assert.equal(result.validation, 'campaign-derived-semantics-only');
  assert.ok(result.derived.items > 0);
  assert.ok(result.derived.variants > 0);
  assert.equal(port.certificate.validation, 'campaign-derived-index-only');
});
test('optional absence is certified by adjacent authenticated positions including beginning and end', async () => {
  const f = await fixture(),
    p = await finish(f),
    port = await open(f, p),
    rows = await readAll(port);
  for (const key of [
    JSON.stringify(['0'.repeat(64), null]),
    JSON.stringify(['f'.repeat(64), null]),
  ]) {
    const r = await port.lookup('base:item', key);
    assert.ok('before' in r);
    assert.equal(
      r.before ? r.before.position + 1 : 0,
      r.after ? r.after.position : port.certificate.sizes['base:item'],
    );
  }
  const item = rows.find((r) => r.section === 'base:item');
  assert.deepEqual(await port.lookup('base:item', item.key), item);
});
test('an empty hash query cannot hide membership authenticated by the positional index', async () => {
  const f = await fixture(),
    p = await finish(f),
    port = await open(f, p),
    rows = await readAll(port),
    item = rows.find((r) => r.section === 'base:item'),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        get: async (ref) => {
          if (
            ref.collectionPath?.endsWith('/derivedRows') &&
            ref.filters?.some((r) => r[0] === 'identityHash')
          )
            return { docs: [] };
          return tx.get(ref);
        },
      }),
    );
  await assert.rejects(port.lookup('base:item', item.key));
});
test('native variant above 512 KiB is parsed without copying its body into checkpoint or row metadata', async () => {
  const f = await fixture(await signed({ large: true, long: false })),
    p = await finish(f, undefined, 3),
    rows = await readAll(await open(f, p));
  assert.ok(f.bytes.length > 512 * 1024);
  assert.deepEqual(rows, await originalRows(f));
  assert.ok(Buffer.byteLength(JSON.stringify(f.records.get(root).derivedReview)) < 350000);
  assert.ok(rows.find((r) => r.section === 'variant').value.meta);
});
test('cancel removes checkpoints/key and collects native row-position pairs before own rows and chunks', async () => {
  const f = await fixture(),
    p = await finish(f),
    port = await open(f, p),
    q = mut(p, 'derived-index-cancel-operation'),
    cancelled = await f.api.cancelCampaignRestore(uid, q);
  let current = cancelled.progress,
    n = 0;
  assert.equal(f.records.get(root).derivedReview, null);
  await assert.rejects(port.read(0, 1));
  const first = (
    await f.api.advanceCampaignRestoreCleanup(
      uid,
      mut(current, 'derived-clean-first', { limit: 2 }),
    )
  ).progress;
  assert.equal(first.derivedIndex.cleanedRows, 2);
  assert.equal(first.reviewIndex.cleanedRows, 0);
  assert.equal(first.cleanedChunks, 0);
  current = first;
  while (current.state !== 'cancelled' && n < 500)
    current = (
      await f.api.advanceCampaignRestoreCleanup(
        uid,
        mut(current, 'derived-clean-next-' + n++, { limit: 3 }),
      )
    ).progress;
  assert.equal(current.state, 'cancelled');
  for (const part of ['/derivedRows/', '/derivedPositions/', '/reviewRows/', '/chunks/'])
    assert.equal([...f.records.keys()].filter((p) => p.includes(part)).length, 0);
  assert.equal(current.derivedIndex.cleanedRows, current.derivedIndex.rows);
});
for (const kind of ['row', 'position'])
  test(
    'native recreation of derived ' + kind + ' refuses read and cleanup without adopting values',
    async () => {
      const f = await fixture(),
        p = await finish(f),
        port = await open(f, p),
        path =
          kind === 'row'
            ? root + '/derivedRows/' + chunkId(0)
            : [...f.records.keys()].find((p) => p.startsWith(root + '/derivedPositions/')),
        m = f.metadata.get(path);
      f.metadata.set(path, { ...m, createdAtNanoseconds: 50000, updatedAtNanoseconds: 50000 });
      await assert.rejects(port.read(0, 1));
      const c = (await f.api.cancelCampaignRestore(uid, mut(p, 'derived-recreate-cancel')))
          .progress,
        before = structuredClone([...f.records]);
      await assert.rejects(
        f.api.advanceCampaignRestoreCleanup(uid, mut(c, 'derived-recreate-clean', { limit: 25 })),
      );
      assert.deepEqual([...f.records], before);
    },
  );
test('orphan positional metadata prevents final cleanup and survives without letting own rows or chunks be collected', async () => {
  const f = await fixture(),
    p = await finish(f);
  f.records.set(root + '/derivedPositions/foreign', { ownerId: 'other', secret: 'PRESERVE' });
  let c = (await f.api.cancelCampaignRestore(uid, mut(p, 'derived-orphan-cancel-operation')))
      .progress,
    n = 0;
  while (c.derivedIndex.cleanedRows < c.derivedIndex.rows)
    c = (
      await f.api.advanceCampaignRestoreCleanup(
        uid,
        mut(c, 'derived-orphan-owned-' + n++, { limit: 25 }),
      )
    ).progress;
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreCleanup(uid, mut(c, 'derived-orphan-final', { limit: 25 })),
  );
  assert.deepEqual([...f.records], before);
  assert.equal(c.reviewIndex.cleanedRows, 0);
  assert.equal(c.cleanedChunks, 0);
});
for (const point of [0, 1, 2, 3, 4])
  test(
    'derived production rollback ' +
      point +
      ' preserves counts, both index families and original retry',
    async () => {
      const f = await fixture(),
        before = structuredClone([...f.records]),
        run = f.db.runTransaction.bind(f.db),
        q = mut(f.p, 'derived-rollback-production', { limit: 25 });
      f.db.runTransaction = (fn) =>
        run((tx) => {
          let n = 0;
          const w = { ...tx };
          for (const method of ['create', 'set'])
            w[method] = (ref, ...args) => {
              const r = tx[method](ref, ...args);
              if (n++ === point) throw Error('derived-rollback');
              return r;
            };
          return fn(w);
        });
      await assert.rejects(f.api.advanceCampaignRestoreDerivedIndex(uid, q), /derived-rollback/);
      assert.deepEqual([...f.records], before);
      f.db.runTransaction = run;
      assert.ok(
        (await f.api.advanceCampaignRestoreDerivedIndex(uid, q)).progress.derivedIndex.rows > 0,
      );
    },
  );
test('two derived index writers publish one checkpoint and preserve loser operation as a CAS conflict', async () => {
  const f = await fixture(),
    outcomes = await Promise.allSettled([
      f.api.advanceCampaignRestoreDerivedIndex(
        uid,
        mut(f.p, 'derived-race-producer-a', { limit: 25 }),
      ),
      f.api.advanceCampaignRestoreDerivedIndex(
        uid,
        mut(f.p, 'derived-race-producer-b', { limit: 25 }),
      ),
    ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    outcomes.find((r) => r.status === 'rejected').reason.details.reason,
    'checkpoint-conflict',
  );
});
test('original operation replay survives completed index and subsequent cancellation', async () => {
  const f = await fixture(),
    q = mut(f.p, 'derived-replay-first-operation', { limit: 1 }),
    first = await f.api.advanceCampaignRestoreDerivedIndex(uid, q);
  assert.deepEqual(await f.api.advanceCampaignRestoreDerivedIndex(uid, q), first);
  const p = await finish(f, first.progress),
    r = await f.api.advanceCampaignRestoreDerivedIndex(uid, q);
  assert.deepEqual(r.receipt, first.receipt);
  assert.equal(r.progress.derivedReview.phase, 'indexed');
  await f.api.cancelCampaignRestore(uid, mut(p, 'derived-replay-cancel-operation'));
  assert.deepEqual((await f.api.advanceCampaignRestoreDerivedIndex(uid, q)).receipt, first.receipt);
});
test('cancel while a frame read is pending prevents late rows and positions', async () => {
  const f = await fixture(),
    source = f.api.openCampaignRestoreSource.bind(f.api);
  let entered, release;
  const arrival = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  f.api.openCampaignRestoreSource = async (...a) => {
    const s = await source(...a);
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
    .advanceCampaignRestoreDerivedIndex(
      uid,
      mut(f.p, 'derived-pending-step-operation', { limit: 25 }),
    )
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  await arrival;
  await f.api.cancelCampaignRestore(uid, mut(f.p, 'derived-pending-cancel-operation'));
  release();
  assert.ok((await pending).error);
  assert.equal(
    [...f.records.keys()].filter(
      (p) => p.includes('/derivedRows/') || p.includes('/derivedPositions/'),
    ).length,
    0,
  );
});
test('revoked issuance key withholds index ports and does not change the completed certificate', async () => {
  const f = await fixture(),
    p = await finish(f),
    before = structuredClone([...f.records]);
  f.keys[0].state = 'revoked';
  await assert.rejects(
    open(f, p),
    (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
  );
  assert.deepEqual([...f.records], before);
});
test('C4, malformed requests, owner isolation and oversized read cannot bypass the derived-index frontier', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreDerivedIndex(
      uid,
      mut(f.p, 'derived-bad-limit-operation', { limit: 26 }),
    ),
  );
  await assert.rejects(
    f.api.advanceCampaignRestoreDerivedIndex(
      'other',
      mut(f.p, 'derived-foreign-operation', { limit: 1 }),
    ),
    (e) => e.code === 'not-found',
  );
  assert.deepEqual([...f.records], before);
  const p = await finish(f),
    port = await open(f, p);
  await assert.rejects(port.read(0, 26));
  await assert.rejects(port.read(port.certificate.rows, 1));
  f.records.set('campaignDeletionReservations/' + p.campaignId, { ownerId: uid });
  await assert.rejects(port.read(0, 1));
});
async function legacy(badUtf8 = false) {
  const s = await signed();
  await rewriteCampaignBackupTestFile(s, (groups) => {
    groups[0].value.contentVersion = 1;
    for (const g of groups)
      if (g.kind === 'unit' && ['base:field', 'anchor:field'].includes(g.unit.section)) {
        const b = Buffer.concat(g.chunks);
        g.chunks = [];
        if (badUtf8 && g.unit.field === 'content' && b.length > 65536) b[0] = 0xff;
        for (let n = 0; n < b.length; n += 65536) g.chunks.push(b.subarray(n, n + 65536));
        if (!g.chunks.length) g.chunks.push(Buffer.alloc(0));
      }
  });
  return s;
}
test('signed legacy v1 preserves a multibyte UTF8 character split across frames and pause checkpoints', async () => {
  const f = await fixture(await legacy()),
    p = await finish(f, undefined, 1);
  assert.deepEqual(await readAll(await open(f, p)), await originalRows(f));
});
test('a re-signed legacy field with invalid UTF8 is refused although file integrity and own data pass', async () => {
  const f = await fixture(await legacy(true));
  let p = f.p,
    failed = false;
  for (let n = 0; n < 2000; n++) {
    const before = structuredClone([...f.records]);
    try {
      p = (
        await f.api.advanceCampaignRestoreDerivedIndex(
          uid,
          mut(p, 'derived-invalid-utf8-' + n, { limit: 5 }),
        )
      ).progress;
    } catch {
      assert.deepEqual([...f.records], before);
      failed = true;
      break;
    }
  }
  assert.ok(failed);
  assert.notEqual(p.derivedReview?.phase, 'indexed');
  await assert.rejects(originalRows(f));
});

test('persisted v3 metadata preserves explicit unresolved relations without turning them into target access', async () => {
  const s = await signed({ long: false }),
    target = sha(Buffer.from('external-unresolved-target'));
  await rewriteCampaignBackupTestFile(s, (groups) => {
    const g = groups.find((g) => g.kind === 'unit' && g.unit.section === 'variant'),
      v = JSON.parse(Buffer.concat(g.chunks).toString('utf8'));
    v.entity.relations.push({ targetKey: target, available: false, unresolved: true });
    g.chunks = [Buffer.from(JSON.stringify(v))];
  });
  const f = await fixture(s),
    p = await finish(f),
    rows = await readAll(await open(f, p)),
    relation = rows
      .find((r) => r.section === 'variant')
      .value.meta.relations.find((r) => r.targetKey === target);
  assert.deepEqual(relation, { targetKey: target, available: false, unresolved: true });
  assert.deepEqual(rows, await originalRows(f));
});
test('cleanup rollback after deleting a row and its pointer preserves the complete native pair and checkpoint', async () => {
  const f = await fixture(),
    p = await finish(f),
    c = (await f.api.cancelCampaignRestore(uid, mut(p, 'derived-cleanup-rollback-cancel')))
      .progress,
    before = structuredClone([...f.records]),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (fn) =>
    run((tx) => {
      let n = 0;
      const w = { ...tx };
      for (const method of ['create', 'set', 'delete'])
        w[method] = (ref, ...args) => {
          const r = tx[method](ref, ...args);
          if (n++ === 4) throw Error('derived-cleanup-rollback');
          return r;
        };
      return fn(w);
    });
  await assert.rejects(
    f.api.advanceCampaignRestoreCleanup(uid, mut(c, 'derived-cleanup-rollback-step', { limit: 1 })),
    /derived-cleanup-rollback/,
  );
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  const next = (
    await f.api.advanceCampaignRestoreCleanup(
      uid,
      mut(c, 'derived-cleanup-rollback-step', { limit: 1 }),
    )
  ).progress;
  assert.equal(next.derivedIndex.cleanedRows, 1);
});
