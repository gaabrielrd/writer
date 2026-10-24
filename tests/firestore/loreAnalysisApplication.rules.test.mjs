import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { analysisApplicationFixture } from '../../functions/test/helpers/loreAnalysisApplicationFixture.mjs';
import {
  applicationChildPaths,
  applicationPaths,
} from '../../functions/src/loreAnalysisApplicationContracts.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from '../../functions/test/helpers/bookLoreDeletionFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-analysis-application';
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
test('SDK 50-target native manifest is private, concurrent, byte-free and closed by full-book deletion', async () => {
  const changes = [
      { scope: 'local', entityId: 'arthur', input: { summary: 'Local changed' } },
      { scope: 'global', entityId: 'universe:world:global', input: { summary: 'Global changed' } },
      ...Array.from({ length: 48 }, (_, i) => ({
        scope: i % 2 ? 'global' : 'local',
        input: { name: 'New ' + i, category: 'other', summary: 'Summary ' + i },
      })),
    ],
    f = await analysisApplicationFixture(admin, { globals: true, changes }),
    source = await data(f.seed.path),
    [a, b] = await Promise.all([f.reserve(), f.reserve()]),
    manifest = await admin.doc(f.path).get(),
    c = manifest.data(),
    paths = applicationChildPaths(applicationPaths(admin, f.uid, f.control.id), c);
  assert.deepEqual(a, b);
  assert.equal(a.memberCount, 50);
  assert.equal(c.members.length, 50);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.length > 100);
  for (const suffix of ['/state/current', '/events/0000000000000000', '/proofs/0000000000000000'])
    assert.equal(
      (await admin.doc(f.path + suffix).get()).createTime.isEqual(manifest.createTime),
      true,
    );
  assert.deepEqual(await data(f.seed.path), source);
  assert.equal((await data('users/author')).credits, 5);
  assert.equal((await data('books/book')).localLoreVersion, 0);
  assert.equal((await data('universes/world')).loreVersion, 0);
  assert.ok(!JSON.stringify(c).includes('Literal'));
  assert.equal((await admin.collection('books/book/bookLoreEdits').limit(1).get()).empty, true);
  assert.ok((await Promise.all(paths.map((p) => admin.doc(p).get()))).every((s) => !s.exists));
  for (const client of [
    env.authenticatedContext(f.uid).firestore(),
    env.unauthenticatedContext().firestore(),
  ]) {
    await assertFails(getDoc(doc(client, f.path)));
    await assertFails(setDoc(doc(client, f.path), { forged: true }));
    await assertFails(setDoc(doc(client, f.path + '/state/current'), { forged: true }));
    await assertFails(deleteDoc(doc(client, f.path + '/proofs/0000000000000000')));
  }
  const deletion = bookLoreDeletionFixture(admin);
  await markBookDeleting(deletion);
  assert.equal((await finishBookLoreDeletion(deletion)).complete, true);
  assert.equal((await admin.doc('books/book').get()).exists, false);
  assert.equal((await f.get()).phase, 'cancelled');
  assert.equal((await f.reserve()).phase, 'cancelled');
  assert.equal((await data('users/author')).credits, 5);
  assert.deepEqual(await data('universes/world/lore/global'), {
    name: 'Global original',
    category: 'other',
    summary: 'Global summary',
    details: 'Global private body',
    createdAt: 1000,
    updatedAt: 1000,
  });
});
test('SDK cancel-before-start and original native proof reject delayed starts and recreated metadata', async () => {
  const f = await analysisApplicationFixture(admin, { mode: 'inline' }),
    fence = await f.cancel();
  assert.equal(fence.phase, 'cancelled');
  assert.equal(fence.memberCount, 0);
  assert.deepEqual(await f.reserve(), fence);
  const other = await analysisApplicationFixtureOnExisting();
  await other.reserve();
  const proof = admin.doc(other.path + '/proofs/0000000000000000'),
    old = await proof.get();
  await proof.delete();
  await proof.create(old.data());
  await assert.rejects(() => other.get());
  await assert.rejects(() => other.cancel());
  assert.equal((await data('users/author')).credits, 5);
});
async function analysisApplicationFixtureOnExisting() {
  // Reuse the seeded book while issuing a genuinely different native analysis.
  const { createLoreAnalysisService } = await import('../../functions/src/loreAnalysis.mjs'),
    { digest } = await import('../../functions/src/workProgressContracts.mjs'),
    service = createLoreAnalysisService({
      db: admin,
      now: () => 5000,
      generator: async () => JSON.stringify({ entities: [] }),
    }),
    id = 'second-native-analysis',
    input = {
      id,
      text: 'Arthur chegou ao porto.',
      changes: [{ scope: 'local', entityId: 'arthur', input: { summary: 'Another summary' } }],
    },
    control = { id, requestHash: digest([input.text, input.changes]) };
  await service.analyzeChapterLore('author', {
    bookId: 'book',
    chapterId: 'chapter',
    requestId: id,
    text: input.text,
    content: input.text,
    loreVersions: [['arthur', 1000]],
  });
  const path = 'users/author/loreAnalysisApplications/' + id;
  return {
    path,
    reserve: () => service.reserveLoreAnalysisApplication('author', input),
    get: () => service.getLoreAnalysisApplication('author', control),
    cancel: () =>
      service.cancelLoreAnalysisApplication('author', { ...control, operationId: 'cancel-second' }),
  };
}
test('SDK native final-write failure rolls back the entire manifest and flag, then exact retry succeeds', async () => {
  const f = await analysisApplicationFixture(admin, { mode: 'inline' }),
    before = await data('books/book'),
    originalRun = admin.runTransaction.bind(admin),
    collision = admin.doc('collisions/already');
  await collision.create({ occupied: true });
  admin.runTransaction = (fn) =>
    originalRun((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'create')
              return (ref, value) => {
                target.create(ref, value);
                if (ref.path === f.path + '/proofs/0000000000000000')
                  target.create(collision, { mustFail: true });
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
      () => f.reserve(),
      (error) => error.code === 6,
    );
  } finally {
    admin.runTransaction = originalRun;
  }
  assert.equal((await admin.doc(f.path).get()).exists, false);
  assert.equal((await admin.doc(f.path + '/state/current').get()).exists, false);
  assert.equal((await admin.doc(f.path + '/proofs/0000000000000000').get()).exists, false);
  assert.deepEqual(await data('books/book'), before);
  assert.equal((await data('users/author')).credits, 5);
  assert.equal((await f.reserve()).phase, 'preparing');
  await admin.doc('books/book').update({ authorId: 'other', deleting: true });
  assert.equal((await f.cancel()).phase, 'cancelled');
});
