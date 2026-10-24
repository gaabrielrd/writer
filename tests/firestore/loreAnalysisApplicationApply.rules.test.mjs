import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import {
  applicationPreparationFixture,
  prepareApplication,
} from '../../functions/test/helpers/loreAnalysisApplicationPreparationFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from '../../functions/test/helpers/bookLoreDeletionFixture.mjs';
import { createLoreAnalysisService } from '../../functions/src/loreAnalysis.mjs';
import { analysisApplicationFixture } from '../../functions/test/helpers/loreAnalysisApplicationFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-analysis-apply';
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated loopback emulator required');
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
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const data = async (path) => (await admin.doc(path).get()).data();
const apply = (f) => f.service.applyLoreAnalysis(f.uid, f.input);
const localNew = (i) => ({
  scope: 'local',
  input: { name: 'Local ' + i, category: 'location', summary: 'Harbour ' + i },
});
const globalNew = (i) => ({
  scope: 'global',
  input: { name: 'Global ' + i, category: 'concept', summary: 'Law ' + i },
});
const mixed = [
  { scope: 'local', entityId: 'arthur', input: { summary: 'Confirmed' } },
  localNew(1),
  { scope: 'global', entityId: 'universe:world:global', input: { summary: 'Global changed' } },
  globalNew(1),
];
test('SDK 50 mixed targets atomically apply once under concurrent retries, preserve native proofs through deletion and reject replacement', async () => {
  const changes = [...mixed, ...Array.from({ length: 46 }, (_, i) => globalNew(i + 2))],
    f = await applicationPreparationFixture(admin, { mode: 'v2', globals: true, changes });
  await prepareApplication(f);
  const original = await f.read();
  const [a, b] = await Promise.all([apply(f), apply(f)]);
  assert.deepEqual(a, { applied: 50, credits: 4 });
  assert.deepEqual(b, a);
  const logical = await f.read();
  assert.equal(logical.data.summary, 'Confirmed');
  for (const [k, v] of Object.entries(original.data))
    if (!['summary', 'updatedAt'].includes(k)) assert.deepEqual(logical.data[k], v);
  const state = await admin.doc(f.path + '/state/current').get(),
    receipt = await admin.doc(f.path + '/applied/current').get(),
    proof = await admin.doc(f.path + '/appliedProofs/current').get(),
    event = await admin
      .doc(f.path + '/events/' + String(state.data().revision).padStart(16, '0'))
      .get(),
    value = receipt.data(),
    context = await data(f.path),
    group = await admin
      .doc(
        'users/author/bookLoreEdits/' +
          value.localBatch.requests[0].editId +
          '/adoptionBatches/' +
          value.localBatch.batchId,
      )
      .get();
  for (const s of [proof, event, group])
    assert.equal(s.createTime.isEqual(receipt.createTime), true);
  assert.equal(state.updateTime.isEqual(receipt.createTime), true);
  for (const path of [
    'books/book',
    'users/author',
    'universes/world',
    'users/author/loreAnalyses/' + f.input.id,
    ...context.members.map(
      (m) => (m.scope === 'local' ? 'books/book' : 'universes/world') + '/lore/' + m.targetId,
    ),
  ]) {
    const s = await admin.doc(path).get();
    assert.equal(s.updateTime.isEqual(receipt.createTime), true, path);
    assert.equal(
      s.data().updatedAt === undefined || s.data().updatedAt === value.timestamp,
      true,
      path,
    );
  }
  assert.equal((await data('books/book')).localLoreVersion, 1);
  assert.equal((await data('universes/world')).loreVersion, 1);
  assert.equal((await data('users/author/campaignAuthorization/current')).epoch, 1);
  assert.equal((await data('books/book/lore/' + context.members[1].targetId)).isPublic, false);
  assert.equal((await data('universes/world/lore/' + context.members[3].targetId)).isPublic, false);
  for (const client of [
    env.authenticatedContext(f.uid).firestore(),
    env.unauthenticatedContext().firestore(),
  ]) {
    for (const path of [receipt.ref.path, proof.ref.path, group.ref.path]) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { forged: true }));
      await assertFails(deleteDoc(doc(client, path)));
    }
  }
  await assert.rejects(() => f.cancel());
  const deletion = bookLoreDeletionFixture(admin);
  await markBookDeleting(deletion);
  await finishBookLoreDeletion(deletion);
  assert.equal((await admin.doc('books/book').get()).exists, false);
  assert.equal((await admin.collection('books/book/bookResourceBodies').get()).empty, true);
  await admin.doc('users/author').update({ credits: 41 });
  await admin.doc('users/author/loreAnalyses/' + f.input.id).delete();
  assert.deepEqual(await apply(f), a);
  assert.equal((await f.get()).phase, 'applied');
  assert.equal(
    (await admin.doc(f.path + '/applied/current').get()).updateTime.isEqual(receipt.updateTime),
    true,
  );
  assert.equal((await data('users/author')).credits, 41);
  await group.ref.delete();
  await group.ref.create(group.data());
  await assert.rejects(() => apply(f));
  assert.equal((await data('users/author')).credits, 41);
  assert.equal((await admin.doc('books/book').get()).exists, false);
});

test('SDK native commit precondition failures at each write boundary roll back real credit, targets and receipts before exact retry', async () => {
  const f = await applicationPreparationFixture(admin, { globals: true, changes: mixed });
  await prepareApplication(f);
  const context = await data(f.path),
    run = admin.runTransaction.bind(admin),
    collision = admin.doc('collisions/occupied'),
    paths = [
      'books/book/lore/arthur',
      'books/book',
      'universes/world/lore/global',
      'universes/world',
      'users/author',
      'users/author/loreAnalyses/' + f.input.id,
      f.path + '/applied/current',
      f.path + '/state/current',
    ],
    original = await Promise.all(paths.map(data));
  await collision.create({ occupied: true });
  for (const boundary of paths) {
    let injected = false;
    admin.runTransaction = (fn) =>
      run((tx) =>
        fn(
          new Proxy(tx, {
            get(target, key) {
              if (['create', 'set', 'update'].includes(key))
                return (ref, ...args) => {
                  target[key](ref, ...args);
                  if (ref.path === boundary && !injected) {
                    injected = true;
                    target.create(collision, { forceFailure: true });
                  }
                  return target;
                };
              const value = target[key];
              return typeof value === 'function' ? value.bind(target) : value;
            },
          }),
        ),
      );
    try {
      await assert.rejects(
        () => apply(f),
        (e) => e.code === 6,
      );
      assert.equal(injected, true);
    } finally {
      admin.runTransaction = run;
    }
    assert.deepEqual(await Promise.all(paths.map(data)), original, boundary);
    assert.equal(
      (await admin.doc('books/book/lore/' + context.members[1].targetId).get()).exists,
      false,
    );
    for (const m of context.members.filter((m) => m.scope === 'local'))
      assert.equal(
        (await data('users/author/bookLoreEdits/' + m.children.editId)).phase,
        'preparing',
      );
    assert.equal(
      (await admin.doc('users/author/campaignAuthorization/current').get()).exists,
      false,
    );
  }
  assert.deepEqual(await apply(f), { applied: 4, credits: 4 });
  assert.deepEqual(await apply(f), { applied: 4, credits: 4 });
});

test('SDK apply versus cancel serializes to one complete outcome without partial adoption or debit', async () => {
  const f = await applicationPreparationFixture(admin, { changes: [localNew(1)] });
  await prepareApplication(f);
  const [a, b] = await Promise.allSettled([apply(f), f.cancel()]),
    progress = await f.get(),
    member = (await data(f.path)).members[0],
    head = await admin.doc('books/book/lore/' + member.targetId).get();
  if (a.status === 'fulfilled') {
    assert.equal(b.status, 'rejected');
    assert.equal(progress.phase, 'applied');
    assert.deepEqual(a.value, { applied: 1, credits: 4 });
    assert.equal(head.exists, true);
    assert.equal((await data('users/author')).credits, 4);
  } else {
    assert.equal(b.status, 'fulfilled');
    assert.ok(['cancelling', 'cancelled'].includes(progress.phase));
    assert.equal(head.exists, false);
    assert.equal((await data('users/author')).credits, 5);
    assert.equal((await admin.doc(f.path + '/applied/current').get()).exists, false);
  }
});

test('SDK BYOK prepared global confirmation at zero balance preserves user updateTime and remains idempotent', async () => {
  const f = await analysisApplicationFixture(admin, {
    analyze: false,
    globals: true,
    changes: [globalNew(1)],
  });
  await f.service.prepareBYOKLore(f.uid, { ...f.request, entities: [] });
  const p = await f.reserve();
  await f.service.advanceLoreAnalysisApplication(f.uid, {
    ...f.input,
    jobToken: p.jobToken,
    operationId: 'prepare-global',
    expectedRevision: p.revision,
  });
  await admin.doc('users/author').update({ credits: 0 });
  const user = await admin.doc('users/author').get();
  assert.deepEqual(await apply(f), { applied: 1, credits: 0 });
  const afterUser = await admin.doc('users/author').get();
  assert.equal(afterUser.updateTime.isEqual(user.updateTime), true);
  assert.equal((await data(f.path + '/applied/current')).cost, 0);
  // A cold service with an expired clock replays metadata without reauthorization or provider I/O.
  const cold = createLoreAnalysisService({
    db: admin,
    now: () => 999999999,
    generator() {
      throw Error('No provider replay');
    },
  });
  assert.deepEqual(await cold.applyLoreAnalysis(f.uid, f.input), { applied: 1, credits: 0 });
});

test('SDK legacy apply versus reservation has exactly one winner and cannot bypass the preparation barrier', async () => {
  const f = await analysisApplicationFixture(admin, { mode: 'inline' }),
    original = await data(f.seed.path),
    [a, b] = await Promise.allSettled([apply(f), f.reserve()]);
  if (a.status === 'fulfilled') {
    assert.deepEqual(a.value, { applied: 1, credits: 4 });
    assert.equal(b.status, 'rejected');
    assert.equal((await admin.doc(f.path).get()).exists, false);
    assert.equal((await data('users/author')).credits, 4);
    assert.equal((await data(f.seed.path)).summary, 'Confirmed');
  } else {
    assert.equal(b.status, 'fulfilled');
    assert.equal(b.value.phase, 'preparing');
    assert.equal((await data('users/author')).credits, 5);
    assert.deepEqual(await data(f.seed.path), original);
    await assert.rejects(() => apply(f));
  }
});

test('SDK native writer barrier permits native mixed adoption while inline siblings stay protected', async () => {
  const f = await applicationPreparationFixture(admin, {
    mode: 'inline',
    globals: true,
    changes: [localNew(1), globalNew(1)],
  });
  await admin.doc('books/book').update({ hasLoreResources: true, status: 'draft' });
  const client = env.authenticatedContext(f.uid).firestore();
  // Positive root control prevents an unrelated root rule from masking the lore deny.
  await assertSucceeds(updateDoc(doc(client, 'books/book'), { localLoreVersion: 0 }));
  const mutate = () => {
    const b = writeBatch(client);
    b.update(doc(client, 'books/book'), { localLoreVersion: 1 });
    b.update(doc(client, 'books/book/lore/arthur'), { summary: 'Old SDK' });
    return b.commit();
  };
  const original = await data('books/book/lore/arthur');
  await assertFails(mutate());
  await prepareApplication(f);
  assert.deepEqual(await apply(f), { applied: 2, credits: 4 });
  const context = await data(f.path);
  assert.ok((await data('books/book/lore/' + context.members[0].targetId)).payloadStorage);
  assert.deepEqual(await data('books/book/lore/arthur'), original);
  await assertSucceeds(updateDoc(doc(client, 'books/book'), { localLoreVersion: 1 }));
  const beforeBook = await data('books/book');
  const beforeUser = await data('users/author');
  const before = await f.get();
  const b = writeBatch(client);
  b.update(doc(client, 'books/book'), { localLoreVersion: 2 });
  b.update(doc(client, 'books/book/lore/arthur'), { summary: 'After native adoption' });
  await assertFails(b.commit());
  await assertFails(updateDoc(doc(client, 'books/book'), { hasLoreResources: false }));
  assert.deepEqual(await data('books/book/lore/arthur'), original);
  assert.deepEqual(await data('books/book'), beforeBook);
  assert.deepEqual(await data('users/author'), beforeUser);
  assert.deepEqual(await apply(f), { applied: 2, credits: 4 });
  assert.deepEqual(await f.get(), before);
  assert.equal(
    (await getDoc(doc(client, 'books/book/lore/arthur'))).data().summary,
    original.summary,
  );
});
