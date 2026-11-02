import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { bookRestoreStorageBucket } from './helpers/bookRestoreStorageBucket.mjs';
import { createBookRestoreCoverStorage } from '../src/bookRestoreCoverStorage.mjs';
import { coverRestoreFixture } from './helpers/bookRestoreCoverFixture.mjs';
import { loreOnlyRecords, loreRecords } from './helpers/bookRestorePreparedLoreFixture.mjs';
import {
  readyAudit,
  finishAudit,
  fullAuditRecords,
  uid,
} from './helpers/bookRestoreAuditFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from './helpers/bookLegacyRestoreFixture.mjs';
import { readBookRestoreArtifact } from '../src/bookRestoreArtifacts.mjs';
import { BOOK_RESTORE_AUDIT_LAYOUT } from '../src/bookRestoreAuditInventory.mjs';
import { preparationProgress, jobShape } from '../src/bookRestoreUploadContracts.mjs';
const step = (f, p, id = f.id + '-first-audit') =>
  f.factory().advanceBookRestoreAudit(uid, mutation(f.id, p, id));
const sha = (value) =>
  createHash('sha256')
    .update(
      JSON.stringify(value, (_, v) =>
        v instanceof Uint8Array
          ? { bytes: v.length, hash: createHash('sha256').update(v).digest('hex') }
          : v,
      ),
    )
    .digest('hex');
function data(f) {
  return [...f.records].filter(
    ([path]) =>
      path.startsWith('books/') ||
      path.includes('/prepared') ||
      path.includes('/aiPersonas/') ||
      path.includes('/aiPersonaRestoreBatches/'),
  );
}
async function anchor(f, p) {
  return f.db.runTransaction((tx) =>
    readBookRestoreArtifact(
      tx,
      f.db,
      { job: f.records.get(f.root), ref: f.db.doc(f.root), view: p },
      p.preparation.audit.anchor.kind,
      p.preparation.audit.anchor.id,
      { metadataOnly: true },
    ),
  );
}
test('full native inventory audits every prepared artifact and nested namespace with bounded metadata only, leaving root and all content unchanged', async () => {
  const f = await readyAudit({ records: fullAuditRecords() }),
    before = sha(data(f)),
    readStart = f.reads.length,
    metadataStart = f.metadataReads.length;
  let p = f.p,
    maxProgress = 0;
  for (let unit = 0; unit < 10000 && p.preparation.phase !== 'activation-ready'; unit++) {
    const next = (await step(f, p, f.id + '-bounded-' + unit)).progress;
    assert.equal(next.preparation.artifactCount, f.p.preparation.artifactCount);
    assert.equal(next.preparation.retiredArtifacts, f.p.preparation.retiredArtifacts);
    assert.equal(next.preparation.cleanedArtifacts, 0);
    assert.ok(
      next.preparation.audit.checkedArtifacts - (p.preparation.audit?.checkedArtifacts ?? 0) <= 8,
    );
    assert.ok(
      next.preparation.audit.checkedPhysical - (p.preparation.audit?.checkedPhysical ?? 0) <= 8,
    );
    maxProgress = Math.max(maxProgress, Buffer.byteLength(JSON.stringify(next.preparation.audit)));
    for (const w of f.commits.at(-1))
      assert.ok(w.path === f.root || w.path.startsWith('users/' + uid + '/bookRestoreOperations/'));
    assert.equal(f.records.has('books/' + p.bookId), false);
    p = next;
  }
  assert.equal(p.preparation.phase, 'activation-ready');
  assert.equal(p.preparation.audit.phase, 'done');
  assert.equal(p.preparation.audit.family, BOOK_RESTORE_AUDIT_LAYOUT.length);
  assert.equal(
    p.preparation.audit.checkedArtifacts,
    p.preparation.artifactCount - (p.preparation.retiredArtifacts ?? 0),
  );
  assert.equal(p.preparation.audit.checkedPhysical, p.preparation.audit.checkedArtifacts);
  assert.ok(p.preparation.audit.checkedArtifacts > 64);
  assert.ok(maxProgress < 2048);
  assert.ok(f.reads.slice(readStart).every((r) => r.maximum <= 8));
  const metadataFields = new Set([
    'schemaVersion',
    'ownerId',
    'bookId',
    'restoreId',
    'jobToken',
    'state',
    'profileCount',
    'createdByOperationId',
    'lastOperationId',
    'fingerprint',
    'receipt.schemaVersion',
    'receipt.operationId',
    'receipt.action',
    'receipt.state',
    'receipt.expectedCheckpoint',
    'receipt.checkpoint',
  ]);
  assert.ok(
    f.metadataReads
      .slice(metadataStart)
      .every((r) => r.fields.every((field) => metadataFields.has(field))),
  );
  assert.equal(sha(data(f)), before);
  assert.equal(f.records.get('books/' + p.bookId + '/workProgress/current').countReady, false);
});
test('audit rejects unfinished indexes, stale checkpoint, another account and forged cursor input; prior writers cannot leave the frozen phase', async () => {
  const early = await readyAudit({ finishIndexes: false });
  await assert.rejects(() => step(early, early.p));
  const f = await readyAudit(),
    first = await step(f, f.p);
  assert.equal(first.progress.preparation.schemaVersion, 13);
  await assert.rejects(() => step(f, f.p, f.id + '-stale'));
  await assert.rejects(() =>
    f.factory().advanceBookRestoreAudit('other', mutation(f.id, first.progress, f.id + '-other')),
  );
  await assert.rejects(() =>
    f.factory().advanceBookRestoreAudit(uid, {
      ...mutation(f.id, first.progress, f.id + '-cursor'),
      audit: { phase: 'done' },
    }),
  );
  await assert.rejects(() =>
    f
      .factory()
      .advanceBookRestoreSourceIndexes(uid, mutation(f.id, first.progress, f.id + '-late-source')),
  );
  assert.equal(f.records.has('books/' + f.p.bookId), false);
});
test('audit replay confirms one metadata advance and ready does not accept a fresh audit mutation', async () => {
  const f = await readyAudit(),
    request = mutation(f.id, f.p, f.id + '-first'),
    answer = await f.factory().advanceBookRestoreAudit(uid, request),
    before = sha([...f.records]);
  assert.deepEqual(await f.factory().advanceBookRestoreAudit(uid, request), answer);
  assert.equal(sha([...f.records]), before);
  const p = await finishAudit(f, answer.progress);
  await assert.rejects(() => step(f, p, f.id + '-after-ready'));
  const replay = await f.factory().advanceBookRestoreAudit(uid, request);
  assert.deepEqual(replay.receipt, answer.receipt);
  assert.deepEqual(replay.progress, p);
});
for (const phase of ['journals', 'ready'])
  test(
    'schema13 cancellation at ' +
      phase +
      ' preserves historical receipts and closes the exact artifact balance',
    async () => {
      const f = await readyAudit(),
        first = await step(f, f.p),
        p = phase === 'ready' ? await finishAudit(f, first.progress) : first.progress,
        terminal = await cleanupLegacyRestore(f.factory(), uid, f.id, p, {
          limit: 5,
          prefix: f.id + '-cancel-' + phase + '-',
        });
      assert.equal(terminal.state, 'cancelled');
      assert.equal(
        terminal.preparation.cleanedArtifacts + (terminal.preparation.retiredArtifacts ?? 0),
        terminal.preparation.artifactCount,
      );
      assert.equal(
        [...f.records.keys()].some((path) => path.startsWith('books/' + p.bookId + '/')),
        false,
      );
      const replay = await step(f, f.p);
      assert.deepEqual(replay.receipt, first.receipt);
      assert.deepEqual(replay.progress, terminal);
    },
  );
for (const kind of ['target', 'journal', 'receipt', 'missing-target'])
  test(
    'the persisted audit anchor refuses ' +
      kind +
      ' changed between pages and preserves uncertain data',
    async () => {
      const f = await readyAudit(),
        p = (await step(f, f.p)).progress,
        a = await anchor(f, p),
        path =
          kind === 'journal'
            ? a.journal.ref.path
            : kind === 'receipt'
              ? 'users/' + uid + '/bookRestoreOperations/' + a.journal.data().lastOperationId
              : a.ref.path,
        value = structuredClone(f.records.get(path));
      assert.ok(value);
      await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
      if (kind !== 'missing-target')
        await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
      const before = sha([...f.records]);
      await assert.rejects(() => step(f, p, f.id + '-bad-anchor'));
      assert.equal(sha([...f.records]), before);
    },
  );
test('a missing journal is rejected by the exact original artifact total', async () => {
  const f = await readyAudit(),
    path = [...f.records.keys()].find((v) => v.startsWith(f.root + '/materializationArtifacts/'));
  assert.ok(path);
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  await assert.rejects(() => finishAudit(f));
  assert.equal(f.records.has('books/' + f.p.bookId), false);
});
test('a foreign physical document and an unknown private stage marker cannot be adopted by the inventory', async () => {
  for (const stageKind of [null, 'restore-lore-foreign']) {
    const f = await readyAudit(),
      path = 'books/' + f.p.bookId + '/lore/restore-' + 'f'.repeat(64),
      value = { name: 'Foreign', category: 'other', ...(stageKind ? { stageKind } : {}) };
    await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
    await assert.rejects(() => finishAudit(f));
    assert.deepEqual(f.records.get(path), value);
    assert.equal(f.records.has('books/' + f.p.bookId), false);
  }
});
test('unregistered nested child is preserved and blocks physical certification', async () => {
  const f = await readyAudit({ records: fullAuditRecords() }),
    scene = [...f.records.keys()].find((v) => /^books\/[^/]+\/scenes\/[^/]+$/.test(v)),
    path = scene + '/references/' + 'f'.repeat(64),
    value = { kind: 'book', scopeId: 'other', entityId: 'other' };
  assert.ok(scene);
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(path), value));
  await assert.rejects(() => finishAudit(f));
  assert.deepEqual(f.records.get(path), value);
});
test('persona scan excludes unrelated profiles and refuses a foreign profile using the same restore book scope', async () => {
  const f = await readyAudit(),
    unrelated = 'users/' + uid + '/aiPersonas/custom-unrelated',
    profile = { id: 'custom-unrelated', name: 'Untouched' };
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(unrelated), profile));
  await finishAudit(f);
  assert.deepEqual(f.records.get(unrelated), profile);
  const g = await readyAudit(),
    path = 'users/' + uid + '/aiPersonas/custom-' + 'f'.repeat(64),
    foreign = {
      id: 'custom-' + 'f'.repeat(64),
      name: 'Foreign',
      restoreOrigin: { bookId: g.p.bookId },
    };
  await g.db.runTransaction(async (tx) => tx.create(g.db.doc(path), foreign));
  await assert.rejects(() => finishAudit(g));
  assert.deepEqual(g.records.get(path), foreign);
});
test('audit write failure and SDK-style callback retry advance one copied cursor', async () => {
  const f = await readyAudit(),
    run = f.db.runTransaction.bind(f.db),
    before = sha([...f.records]),
    failure = new Error('audit write failure');
  let inject = true,
    automatic = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) => {
        const update = tx.update;
        tx.update = (ref, ...args) => {
          if (inject && ref.path === f.root) throw failure;
          return update(ref, ...args);
        };
        return operation(tx);
      });
    } catch (error) {
      if (error === failure && automatic) {
        inject = false;
        return run(operation);
      }
      throw error;
    }
  };
  await assert.rejects(
    () => step(f, f.p),
    (error) => error === failure,
  );
  assert.equal(sha([...f.records]), before);
  automatic = true;
  const answer = await step(f, f.p);
  assert.equal(answer.progress.checkpoint, f.p.checkpoint + 1);
  assert.ok(answer.progress.preparation.audit.checkedArtifacts <= 8);
  assert.deepEqual(await step(f, f.p), answer);
});
test('closed audit progress rejects bad context, phases, counts, cursor and premature completion', async () => {
  const f = await readyAudit(),
    p = (await step(f, f.p)).progress;
  for (const change of [
    (v) => {
      v.audit.contextToken = 'bad';
    },
    (v) => {
      v.audit.phase = 'unknown';
    },
    (v) => {
      v.audit.checkedArtifacts = v.artifactCount + 1;
    },
    (v) => {
      v.audit.after = '../foreign';
    },
    (v) => {
      v.audit.anchor.nativeToken = 'bad';
    },
    (v) => {
      v.audit.extra = true;
    },
    (v) => {
      v.audit.phase = 'done';
      v.phase = 'activation-ready';
    },
    (v) => {
      v.sourceIndexes.complete = false;
    },
  ]) {
    const value = structuredClone(p.preparation);
    change(value);
    assert.throws(() => preparationProgress(value));
  }
  const job = structuredClone(f.records.get(f.root));
  job.preparation.audit.contextToken = 'a'.repeat(64);
  jobShape(uid, f.id, job);
  f.records.set(f.root, job);
  await assert.rejects(() => step(f, p, f.id + '-bad-context'));
});

test('a recreated native parent blocks resuming its nested physical page', async () => {
  const f = await readyAudit({ records: fullAuditRecords() });
  let p = f.p;
  for (let unit = 0; unit < 1000; unit++) {
    p = (await step(f, p, f.id + '-to-parent-' + unit)).progress;
    if (p.preparation.audit.phase === 'physical' && p.preparation.audit.parent !== null) break;
  }
  const audit = p.preparation.audit,
    family = BOOK_RESTORE_AUDIT_LAYOUT[audit.family];
  assert.ok(audit.parent);
  const parent = await f.db.runTransaction((tx) =>
      readBookRestoreArtifact(
        tx,
        f.db,
        { job: f.records.get(f.root), ref: f.db.doc(f.root), view: p },
        family.parentKind,
        audit.parent,
        { metadataOnly: true },
      ),
    ),
    value = structuredClone(f.records.get(parent.ref.path));
  await f.db.runTransaction(async (tx) => tx.delete(parent.ref));
  await f.db.runTransaction(async (tx) => tx.create(parent.ref, value));
  await assert.rejects(() => step(f, p, f.id + '-bad-parent'));
  assert.deepEqual(f.records.get(parent.ref.path), value);
  assert.equal(f.records.has('books/' + p.bookId), false);
});
test('schema13 audit preserves a staged library cover without Storage I/O and cancellation keeps the permanent fence', async () => {
  const png = await sharp({
      create: { width: 3, height: 4, channels: 4, background: { r: 30, g: 60, b: 90, alpha: 0.5 } },
    })
      .png()
      .toBuffer(),
    storage = bookRestoreStorageBucket(),
    assets = createBookRestoreCoverStorage(storage.bucket),
    f = await readyAudit({ records: coverRestoreFixture({ bytes: png }), restoreAssets: assets }),
    path = 'book-covers/' + uid + '/' + f.p.preparation.cover.imageId + '.png',
    value = structuredClone(storage.version(path)),
    events = storage.events.length,
    p = await finishAudit(f);
  assert.equal(p.preparation.phase, 'activation-ready');
  assert.equal(storage.events.length, events);
  assert.deepEqual(storage.version(path).bytes, Buffer.from(value.bytes));
  assert.deepEqual(storage.version(path).metadata, value.metadata);
  assert.equal(storage.version(path).metadata.metadata.accepted, 'false');
  const terminal = await cleanupLegacyRestore(f.factory(), uid, f.id, p, {
    limit: 5,
    prefix: f.id + '-cover-audit-cancel-',
  });
  assert.equal(terminal.state, 'cancelled');
  assert.equal(storage.version(path).bytes.length, 0);
  assert.equal(
    terminal.preparation.cleanedArtifacts + (terminal.preparation.retiredArtifacts ?? 0),
    terminal.preparation.artifactCount,
  );
  assert.equal(f.records.has('books/' + p.bookId), false);
});

test('previous monolithic lore representation remains intact through schema13 inventory', async () => {
  const f = await readyAudit({
      indexedLoreBodies: false,
      records: loreOnlyRecords(
        loreRecords({
          name: 'Old',
          category: 'other',
          details: 'x'.repeat(530000),
        }),
      ),
    }),
    path = [...f.records.keys()].find((key) => /^books\/[^/]+\/lore\/[^/]+$/.test(key)),
    before = structuredClone(f.records.get(path)),
    p = await finishAudit(f);
  assert.equal(before.payloadStorage.schemaVersion, 1);
  assert.deepEqual(f.records.get(path), before);
  assert.equal(p.preparation.phase, 'activation-ready');
  assert.equal(p.preparation.retiredArtifacts, 0);
  assert.equal(p.preparation.audit.checkedArtifacts, p.preparation.artifactCount);
});
