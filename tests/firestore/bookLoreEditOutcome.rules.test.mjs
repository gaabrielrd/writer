import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import {
  adoptionFixture,
  adoptFixture,
  nextAdoptionFixture,
} from '../../functions/test/helpers/bookLoreEditAdoptionFixture.mjs';
import { createBookLoreEditOutcomeService } from '../../functions/src/bookLoreEditOutcome.mjs';
import { createBookLoreResourceInventoryService } from '../../functions/src/bookLoreResourceInventory.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-outcome';
let db, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
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
  db = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await db?.terminate();
  await env?.cleanup();
});
async function setup() {
  const i = { writeId: 'sdk-original', bookId: 'book', loreId: 'entity' },
    editId =
      'lore-edit-' +
      digest({
        domain: 'writer-book-lore-client-job',
        uid: 'author',
        ...i,
        kind: 'lore-edit',
        index: 0,
      }),
    f = await adoptionFixture(db, {
      editId,
      mode: 'inline',
      changes: [{ target: { field: 'isPublic' }, value: false }],
    });
  return {
    ...f,
    request: { ...i, editId, startHash: f.startHash, sourceToken: f.intent.sourceToken },
  };
}
function readOnlyApi(f, reads = []) {
  const wrapped = {
    doc: (path) => db.doc(path),
    collection: (path) => db.collection(path),
    runTransaction: (fn) =>
      db.runTransaction((tx) =>
        fn({
          get: (at) => {
            reads.push(at.path ?? at._queryOptions?.parentPath?.toString());
            return tx.get(at);
          },
          create: () => {
            throw Error('Unexpected write');
          },
          update: () => {
            throw Error('Unexpected write');
          },
          set: () => {
            throw Error('Unexpected write');
          },
          delete: () => {
            throw Error('Unexpected write');
          },
        }),
      ),
  };
  return (r) =>
    createBookLoreEditOutcomeService({ db: wrapped }).bookLoreEditOutcome(f.uid, r ?? f.request);
}
test('SDK outcome uses native receipt/event births, reads metadata only and keeps control Rules private', async () => {
  const f = await setup(),
    reads = [],
    query = readOnlyApi(f, reads);
  assert.equal((await query()).applied, false);
  await adoptFixture(f); // simulate original response lost
  const result = await query();
  assert.equal(result.applied, true);
  assert.deepEqual(result.changedFields, ['isPublic']);
  const pinned = { ...f.request, jobToken: result.jobToken, outcomeToken: result.outcomeToken };
  assert.deepEqual(await query(pinned), result);
  assert.equal(
    reads.some((path) => path === f.source.seed.path || path === f.source.seed.bookPath),
    false,
  );
  assert.equal(
    reads.some((path) => /bookResourceBodies|bookResourcePayloads|\/slots\//.test(path ?? '')),
    false,
  );
  for (const client of [
    env.authenticatedContext(f.uid).firestore(),
    env.unauthenticatedContext().firestore(),
  ])
    for (const path of [f.c.path, f.c.path + '/operations/' + f.adoptRequest.operationId])
      await assertFails(getDoc(doc(client, path)));
  await assert.rejects(
    createBookLoreEditOutcomeService({ db }).bookLoreEditOutcome('other', f.request),
    { code: 'failed-precondition' },
  );
});
test('SDK outcome remains the original receipt after replacement, GC and absent book/head', async () => {
  const f = await setup();
  await adoptFixture(f);
  const query = readOnlyApi(f),
    first = await query(),
    j = (await db.doc(f.c.path).get()).data(),
    pointer = j.adoption.storage.fields.isPublic,
    next = await nextAdoptionFixture(f, {
      changes: [{ target: { field: 'isPublic' }, value: true }],
    });
  await adoptFixture(next);
  const inventory = createBookLoreResourceInventoryService({ db });
  let complete = false;
  for (let n = 0; n < 100 && !complete; n++)
    complete = (
      await inventory.collectBookLoreInventoryBody(f.uid, {
        bookId: f.bookId,
        bodyId: pointer.manifest.bodyId,
      })
    ).complete;
  assert.equal(complete, true);
  assert.equal(
    (await db.doc('books/book/bookResourceBodies/' + pointer.manifest.bodyId).get()).exists,
    false,
  );
  await db.runTransaction(async (tx) => {
    tx.delete(db.doc(f.source.seed.path));
    tx.delete(db.doc(f.source.seed.bookPath));
  });
  assert.deepEqual(
    await query({
      ...f.request,
      jobToken: first.jobToken,
      outcomeToken: first.outcomeToken,
    }),
    first,
  );
});
test('SDK outcome rejects a receipt/proof recreated with identical data and later native births', async () => {
  for (const kind of ['operations', 'operationProofs']) {
    await env.clearFirestore();
    const f = await setup();
    await adoptFixture(f);
    const query = readOnlyApi(f),
      result = await query(),
      ref = db.doc(f.c.path + '/' + kind + '/' + f.adoptRequest.operationId),
      original = await ref.get();
    await ref.delete();
    await ref.create(original.data());
    assert.equal((await ref.get()).createTime.isEqual(original.createTime), false);
    await assert.rejects(query({ ...f.request, outcomeToken: result.outcomeToken }), {
      code: 'failed-precondition',
    });
  }
});
