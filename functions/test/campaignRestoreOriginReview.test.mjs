import test from 'node:test';
import assert from 'node:assert/strict';
import {
  uid,
  originRestoreId as rid,
  originRestoreRoot as root,
  originMutation as mut,
  signedOriginCampaign,
  originRestoreFixture,
  finishOriginReview,
  campaignOriginInput,
} from './helpers/campaignOriginRestore.mjs';
import { campaignBackupTestIndexes } from './helpers/campaignBackupTestIndexes.mjs';
import { rewriteCampaignBackupTestFile } from './helpers/campaignBackupRewrite.mjs';
import { createCampaignBackupOriginReviewService } from '../src/campaignBackupOriginReview.mjs';
import { createCampaignRestoreTransferService } from '../src/campaignRestoreTransfer.mjs';
import { prepareCampaignAuthorization } from '../src/campaignAuthorization.mjs';
let cached;
async function fixture(original) {
  cached ??= signedOriginCampaign();
  return originRestoreFixture(original ?? (await cached));
}
const proof = (f, p) =>
  f.api.getCampaignRestoreOriginReview(uid, { restoreId: rid, jobToken: p.jobToken });
async function reference(f) {
  return createCampaignBackupOriginReviewService({
    db: f.db,
    keys: f.keys,
    now: () => 6000,
  }).reviewCampaignBackupOrigins(uid, campaignOriginInput(f.bytes), {
    index: await campaignBackupTestIndexes([])('origins'),
  });
}
const changed = (e) => e.details?.reason === 'campaign-backup-origin-changed';
async function capture(f, p = f.p) {
  let n = 0;
  while (p.originReview?.phase !== 'recheck' && n++ < 1000)
    p = (
      await f.api.advanceCampaignRestoreOriginReview(
        uid,
        mut(p, 'origin-capture-' + p.checkpoint, { limit: 25 }),
      )
    ).progress;
  assert.equal(p.originReview.phase, 'recheck');
  return p;
}
async function sourceContext(f, p = f.p) {
  return (
    await f.api.openCampaignRestoreDerivedIndex(uid, { restoreId: rid, jobToken: p.jobToken })
  ).context;
}
test('real current origins resume at every event and produce exactly the full two-pass proof', async () => {
  const f = await fixture();
  let p = f.p;
  for (let n = 0; p.originReview?.phase !== 'verified' && n < 1000; n++) {
    p = (
      await f.api.advanceCampaignRestoreOriginReview(
        uid,
        mut(p, 'origin-one-event-' + p.checkpoint, { limit: 1 }),
      )
    ).progress;
    if (n === 30)
      f.api = createCampaignRestoreTransferService({ db: f.db, keys: f.keys, now: () => 7000 });
  }
  const result = await proof(f, p);
  assert.deepEqual(result, await reference(f));
  assert.ok(result.origins.available > 0);
  assert.equal(result.origins.organizationalUniverse.availability, 'available');
  assert.doesNotMatch(JSON.stringify(p), /payload|hashState|SECRET|activeBase|clock/);
  assert.doesNotMatch(
    JSON.stringify([...f.records].filter(([p]) => p.startsWith(root))),
    /SECRET ORIGIN TEXT/,
  );
});
test('clock change blocks the next step without progress; explicit restart preserves completed work', async () => {
  const f = await fixture();
  let p = (
    await f.api.advanceCampaignRestoreOriginReview(
      uid,
      mut(f.p, 'origin-clock-first-operation', { limit: 1 }),
    )
  ).progress;
  await f.db.runTransaction(async (tx) => {
    const change = await prepareCampaignAuthorization(tx, f.db, uid, { bump: true });
    change.commit();
  });
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreOriginReview(
      uid,
      mut(p, 'origin-clock-stale-operation', { limit: 25 }),
    ),
    changed,
  );
  assert.deepEqual([...f.records], before);
  const restart = mut(p, 'origin-clock-restart-operation'),
    r = await f.api.restartCampaignRestoreOriginReview(uid, restart);
  assert.deepEqual(await f.api.restartCampaignRestoreOriginReview(uid, restart), r);
  assert.equal(r.progress.originReview, undefined);
  assert.equal(r.progress.derivedCheck.phase, 'verified');
  assert.equal(r.progress.ownReview.phase, 'verified');
  p = await finishOriginReview(f, r.progress);
  assert.deepEqual(await proof(f, p), await reference(f));
});
test('native source change between passes withholds proof even without a clock bump, then restart reviews current denial', async () => {
  const f = await fixture(),
    ctx = await sourceContext(f);
  let p = await capture(f);
  f.records.get('adventures/' + ctx.active.adventure.id).ownerId = 'other';
  let failed = false;
  for (let n = 0; n < 1000; n++) {
    const before = structuredClone([...f.records]);
    try {
      p = (
        await f.api.advanceCampaignRestoreOriginReview(
          uid,
          mut(p, 'origin-native-changed-' + p.checkpoint, { limit: 7 }),
        )
      ).progress;
    } catch (e) {
      assert.ok(changed(e));
      assert.deepEqual([...f.records], before);
      failed = true;
      break;
    }
  }
  assert.ok(failed);
  assert.notEqual(p.originReview.phase, 'verified');
  const restarted = await f.api.restartCampaignRestoreOriginReview(
    uid,
    mut(p, 'origin-native-restart-operation'),
  );
  p = await finishOriginReview(f, restarted.progress);
  const result = await proof(f, p);
  assert.ok(result.origins.unavailable > 0);
  assert.deepEqual(result, await reference(f));
});
test('recreated same-value authorization clock cannot adopt a paused pass', async () => {
  const f = await fixture();
  await f.db.runTransaction(async (tx) => {
    const a = await prepareCampaignAuthorization(tx, f.db, uid);
    a.commit();
  });
  const p = (
      await f.api.advanceCampaignRestoreOriginReview(
        uid,
        mut(f.p, 'origin-birth-first-operation', { limit: 1 }),
      )
    ).progress,
    path = 'users/' + uid + '/campaignAuthorization/current',
    m = f.metadata.get(path);
  f.metadata.set(path, {
    ...m,
    createdAtNanoseconds: m.createdAtNanoseconds + 50000,
    updatedAt: m.createdAt,
    updatedAtNanoseconds: m.createdAtNanoseconds + 50000,
  });
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreOriginReview(
      uid,
      mut(p, 'origin-birth-stale-operation', { limit: 1 }),
    ),
    changed,
  );
  assert.deepEqual([...f.records], before);
});
test('removed universe and recreated local ficha cannot inherit available outcomes from the private file', async () => {
  const f = await fixture(),
    port = await f.api.openCampaignRestoreDerivedIndex(uid, {
      restoreId: rid,
      jobToken: f.p.jobToken,
    }),
    rows = [];
  for (let n = 0; n < port.certificate.rows; n += 25)
    rows.push(...(await port.read(n, Math.min(25, port.certificate.rows - n))));
  const world = port.context.active.universe;
  assert.equal(world.kind, 'reference');
  f.records.delete('universes/' + world.id);
  const local = rows.find(
      (r) => r.section === 'w:item' && r.value.record[3].origin?.kind === 'adventure-lore',
    ).value.record[3].origin,
    path = 'adventures/' + local.adventureId + '/lore/' + local.entityId,
    m = f.metadata.get(path);
  f.metadata.set(path, {
    ...m,
    createdAtNanoseconds: m.createdAtNanoseconds + 50000,
    updatedAt: m.createdAt,
    updatedAtNanoseconds: m.createdAtNanoseconds + 50000,
  });
  const p = await finishOriginReview(f),
    result = await proof(f, p);
  assert.ok(result.origins.unavailable > 0);
  assert.ok(result.origins.globalUnavailable > 0);
  assert.deepEqual(result, await reference(f));
});
test('legacy witness v1 remains unproven for organizational universe through both resumed passes', async () => {
  const s = await signedOriginCampaign();
  await rewriteCampaignBackupTestFile(s, (groups) => {
    groups[0].value.provenanceVersion = 1;
    for (let n = groups.length - 1; n >= 0; n--)
      if (groups[n].kind === 'witness' && groups[n].value[0] === 'project') groups.splice(n, 1);
  });
  const f = await fixture(s),
    p = await finishOriginReview(f, undefined, 3),
    result = await proof(f, p);
  assert.equal(result.origins.organizationalUniverse.availability, 'unproven');
  assert.deepEqual(result, await reference(f));
});
test('exported omissions remain unavailable when native sources become available again', async () => {
  const s = await signedOriginCampaign(),
    source = s.records.get('adventures/' + s.campaign.provenance.adventureId);
  source.ownerId = 'other';
  s.file = await s.makeFile();
  source.ownerId = uid;
  const f = await fixture(s),
    p = await finishOriginReview(f),
    result = await proof(f, p);
  assert.ok(result.origins.unavailable > 0);
  assert.deepEqual(result, await reference(f));
});
test('origin reads request only metadata masks and never original campaign/base records or prose', async () => {
  const f = await fixture(),
    run = f.db.runTransaction.bind(f.db);
  let sourceReads = 0;
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        getAll: async (ref, options) => {
          if (ref.path.startsWith('adventures/') || ref.path.startsWith('universes/')) {
            sourceReads++;
            assert.ok(Array.isArray(options.fieldMask));
            for (const field of [
              'title',
              'summary',
              'content',
              'details',
              'body',
              'structuredDetails',
            ])
              assert.ok(!options.fieldMask.includes(field));
          }
          return tx.getAll(ref, options);
        },
      }),
    );
  const p = await finishOriginReview(f);
  assert.ok(sourceReads > 0);
  assert.equal((await proof(f, p)).validation, 'campaign-origin-review-only');
});
test('old capture/restart receipts remain recoverable after a new review and key-revoking cancellation', async () => {
  const f = await fixture(),
    q = mut(f.p, 'origin-replay-first-operation', { limit: 1 }),
    first = await f.api.advanceCampaignRestoreOriginReview(uid, q),
    restart = mut(first.progress, 'origin-replay-restart-operation'),
    reset = await f.api.restartCampaignRestoreOriginReview(uid, restart);
  assert.deepEqual(await f.api.restartCampaignRestoreOriginReview(uid, restart), reset);
  const p = await finishOriginReview(f, reset.progress);
  assert.deepEqual((await f.api.advanceCampaignRestoreOriginReview(uid, q)).receipt, first.receipt);
  const c = await f.api.cancelCampaignRestore(uid, mut(p, 'origin-replay-cancel-operation'));
  assert.equal(f.records.get(root).originReview, null);
  assert.equal(f.records.has('users/' + uid + '/campaignRestoreKeys/' + rid), false);
  assert.deepEqual((await f.api.advanceCampaignRestoreOriginReview(uid, q)).receipt, first.receipt);
  assert.deepEqual(
    (await f.api.restartCampaignRestoreOriginReview(uid, restart)).receipt,
    reset.receipt,
  );
  await assert.rejects(proof(f, c.progress));
});
for (const point of [0, 1, 2])
  test(
    'origin checkpoint rollback ' + point + ' preserves the old pass and exact retry',
    async () => {
      const f = await fixture(),
        before = structuredClone([...f.records]),
        run = f.db.runTransaction.bind(f.db),
        q = mut(f.p, 'origin-rollback-first-operation', { limit: 3 });
      f.db.runTransaction = (fn) =>
        run((tx) => {
          let n = 0;
          const w = { ...tx };
          for (const method of ['create', 'set'])
            w[method] = (ref, ...args) => {
              const r = tx[method](ref, ...args);
              if (n++ === point) throw Error('origin-rollback');
              return r;
            };
          return fn(w);
        });
      await assert.rejects(f.api.advanceCampaignRestoreOriginReview(uid, q), /origin-rollback/);
      assert.deepEqual([...f.records], before);
      f.db.runTransaction = run;
      assert.ok((await f.api.advanceCampaignRestoreOriginReview(uid, q)).progress.originReview);
    },
  );
test('two origin workers publish one checkpoint and report the other operation as a conflict', async () => {
  const f = await fixture(),
    results = await Promise.allSettled([
      f.api.advanceCampaignRestoreOriginReview(
        uid,
        mut(f.p, 'origin-race-first-operation', { limit: 3 }),
      ),
      f.api.advanceCampaignRestoreOriginReview(
        uid,
        mut(f.p, 'origin-race-second-operation', { limit: 3 }),
      ),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.details.reason,
    'checkpoint-conflict',
  );
});
test('cancelling after an origin read transaction finishes prevents a late checkpoint', async () => {
  const f = await fixture(),
    port = await f.api.openCampaignRestoreDerivedIndex(uid, {
      restoreId: rid,
      jobToken: f.p.jobToken,
    });
  let firstBase;
  for (let n = 0; n < port.certificate.rows; n += 25) {
    firstBase = (await port.read(n, Math.min(25, port.certificate.rows - n))).find(
      (r) => r.section === 'w:base',
    );
    if (firstBase) break;
  }
  let p = f.p;
  while (!p.originReview || p.originReview.scannedRows < firstBase.index)
    p = (
      await f.api.advanceCampaignRestoreOriginReview(
        uid,
        mut(p, 'origin-before-race-' + p.checkpoint, { limit: 1 }),
      )
    ).progress;
  const run = f.db.runTransaction.bind(f.db);
  let entered,
    release,
    blocked = false;
  const arrival = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  f.db.runTransaction = (fn) => {
    let source = false;
    return run((tx) =>
      fn({
        ...tx,
        getAll: async (ref, options) => {
          if (ref.path.startsWith('adventures/')) source = true;
          return tx.getAll(ref, options);
        },
      }),
    ).then(async (result) => {
      if (source && !blocked) {
        blocked = true;
        entered();
        await gate;
      }
      return result;
    });
  };
  const pending = f.api
    .advanceCampaignRestoreOriginReview(uid, mut(p, 'origin-race-pending-operation', { limit: 1 }))
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  await arrival;
  await f.api.cancelCampaignRestore(uid, mut(p, 'origin-race-cancel-operation'));
  release();
  assert.ok((await pending).error);
  assert.equal(f.records.get(root).originReview, null);
});
test('signature revocation, stale clock and C4 withhold a completed review without modifying state', async () => {
  const f = await fixture(),
    p = await finishOriginReview(f),
    before = structuredClone([...f.records]);
  f.keys[0].state = 'revoked';
  await assert.rejects(
    proof(f, p),
    (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
  );
  assert.deepEqual([...f.records], before);
  f.keys[0].state = 'active';
  await f.db.runTransaction(async (tx) => {
    const a = await prepareCampaignAuthorization(tx, f.db, uid, { bump: true });
    a.commit();
  });
  await assert.rejects(proof(f, p), changed);
  f.records.set('campaignDeletionReservations/' + p.campaignId, { ownerId: uid });
  await assert.rejects(proof(f, p));
});
test('client clock/cursor, invalid bounds, foreign identity and stale operations cannot select an authorization result', async () => {
  const f = await fixture();
  for (const extra of [
    { limit: 0 },
    { limit: 26 },
    { limit: 1, clock: 'a'.repeat(64) },
    { limit: 1, cursor: 0 },
  ])
    await assert.rejects(
      f.api.advanceCampaignRestoreOriginReview(
        uid,
        mut(f.p, 'origin-invalid-input-operation', extra),
      ),
    );
  await assert.rejects(
    f.api.advanceCampaignRestoreOriginReview(
      'other',
      mut(f.p, 'origin-foreign-input-operation', { limit: 1 }),
    ),
    (e) => e.code === 'not-found',
  );
  const q = mut(f.p, 'origin-valid-first-operation', { limit: 1 });
  await f.api.advanceCampaignRestoreOriginReview(uid, q);
  await assert.rejects(
    f.api.advanceCampaignRestoreOriginReview(
      uid,
      mut(f.p, 'origin-stale-next-operation', { limit: 1 }),
    ),
    (e) => e.details?.reason === 'checkpoint-conflict',
  );
});

test('clock bump after the source read is rejected by the checkpoint transaction without advancing the job', async () => {
  const f = await fixture(),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone(f.records.get(root)),
    operationId = 'origin-late-clock-operation';
  let bumped = false;
  f.db.runTransaction = (fn) => {
    let sourceRead = false;
    return run((tx) =>
      fn({
        ...tx,
        getAll: async (ref, options) => {
          if (ref.path.startsWith('universes/')) sourceRead = true;
          return tx.getAll(ref, options);
        },
      }),
    ).then(async (result) => {
      if (sourceRead && !bumped) {
        bumped = true;
        await run(async (tx) => {
          const a = await prepareCampaignAuthorization(tx, f.db, uid, { bump: true });
          a.commit();
        });
      }
      return result;
    });
  };
  const request = mut(f.p, operationId, { limit: 1 });
  await assert.rejects(f.api.advanceCampaignRestoreOriginReview(uid, request), changed);
  assert.equal(bumped, true);
  assert.deepEqual(f.records.get(root), before);
  assert.equal(f.records.has('users/' + uid + '/campaignRestoreOperations/' + operationId), false);
  f.db.runTransaction = run;
  const retry = await f.api.advanceCampaignRestoreOriginReview(uid, request);
  assert.equal(retry.progress.checkpoint, f.p.checkpoint + 1);
});
