import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import {
  readyAudit,
  finishAudit,
  uid,
} from '../../functions/test/helpers/bookRestoreAuditFixture.mjs';
import { sourceIndexesRecords } from '../../functions/test/helpers/bookRestoreSourceIndexesFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
import { readBookRestoreArtifact } from '../../functions/src/bookRestoreArtifacts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-restore-audit';
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated loopback demo emulator required');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('SDK restore audit: complete native inventory freezes preparation and preserves all sampled native identities before cancellation', async () => {
  const f = await readyAudit({
      db: admin,
      records: sourceIndexesRecords({ content: 'SDK frozen literal 🌙', sources: 1 }),
    }),
    rows = await admin
      .collection('books/' + f.p.bookId + '/lore')
      .limit(1)
      .get(),
    head = rows.docs[0],
    control = await admin.doc('books/' + f.p.bookId + '/workProgress/current').get(),
    request = mutation(f.id, f.p, f.id + '-sdk-first'),
    first = await f.factory().advanceBookRestoreAudit(uid, request);
  assert.equal(head?.exists, true);
  assert.equal(first.progress.preparation.phase, 'resources-audit');
  assert.deepEqual(await f.factory().advanceBookRestoreAudit(uid, request), first);
  const p = await finishAudit(f, first.progress),
    afterHead = await head.ref.get(),
    afterControl = await control.ref.get();
  assert.equal(p.preparation.phase, 'activation-ready');
  assert.equal(
    p.preparation.audit.checkedArtifacts,
    p.preparation.artifactCount - (p.preparation.retiredArtifacts ?? 0),
  );
  assert.equal(p.preparation.audit.checkedPhysical, p.preparation.audit.checkedArtifacts);
  assert.equal(p.preparation.audit.phase, 'done');
  assert.deepEqual(afterHead.data(), head.data());
  assert.equal(afterHead.createTime.isEqual(head.createTime), true);
  assert.equal(afterHead.updateTime.isEqual(head.updateTime), true);
  assert.deepEqual(afterControl.data(), control.data());
  assert.equal(afterControl.data().countReady, false);
  assert.equal(afterControl.updateTime.isEqual(control.updateTime), true);
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ])
    await assertFails(getDoc(doc(actor.firestore(), head.ref.path)));
  const cancelled = await cleanupLegacyRestore(f.factory(), uid, f.id, p, {
    limit: 8,
    prefix: f.id + '-sdk-audit-clean-',
  });
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(
    cancelled.preparation.cleanedArtifacts + (cancelled.preparation.retiredArtifacts ?? 0),
    cancelled.preparation.artifactCount,
  );
  const replay = await f.factory().advanceBookRestoreAudit(uid, request);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.deepEqual(replay.progress, cancelled);
});
test('SDK restore audit: a recreated original anchor journal is rejected by the next page and preserved by cleanup', async () => {
  const f = await readyAudit({ db: admin, id: 'audit-sdk-negative-0002' }),
    p = (await f.factory().advanceBookRestoreAudit(uid, mutation(f.id, f.p, f.id + '-sdk-first')))
      .progress,
    job = await admin.doc(f.root).get(),
    a = p.preparation.audit.anchor,
    original = await admin.runTransaction((tx) =>
      readBookRestoreArtifact(
        tx,
        admin,
        { job: job.data(), ref: job.ref, snapshot: job, view: p },
        a.kind,
        a.id,
        { metadataOnly: true },
      ),
    ),
    journal = original.journal.ref,
    value = original.journal.data(),
    target = await original.ref.get();
  assert.equal(target.exists, true);
  await journal.delete();
  await journal.create(value);
  await assert.rejects(() =>
    f.factory().advanceBookRestoreAudit(uid, mutation(f.id, p, f.id + '-sdk-refused')),
  );
  const current = await f.factory().getBookRestore(uid, { restoreId: f.id, jobToken: p.jobToken });
  assert.equal(current.checkpoint, p.checkpoint);
  await assert.rejects(() =>
    cleanupLegacyRestore(f.factory(), uid, f.id, p, { limit: 8, prefix: f.id + '-sdk-aba-clean-' }),
  );
  assert.deepEqual((await journal.get()).data(), value);
  assert.deepEqual((await target.ref.get()).data(), target.data());
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
});
