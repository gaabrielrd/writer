import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import {
  preparedLoreFixture,
  uid,
} from '../../functions/test/helpers/bookRestorePreparedLoreFixture.mjs';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-prepared-lore';
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
const scope = (f) => ({ bookId: f.p.bookId, id: f.entityId });
async function read(f, h, section, field, page = 0) {
  const parts = [];
  for (let index = 0; ; index++) {
    const part = await f.reader.readBookLorePart(uid, {
      ...scope(f),
      readToken: h.readToken,
      section,
      ...(field ? { field } : {}),
      page,
      index,
    });
    parts.push(Buffer.from(part.chunkBase64, 'base64'));
    if (index + 1 === part.manifest.chunkCount) break;
  }
  return JSON.parse(Buffer.concat(parts).toString());
}
test('SDK prepared lore: native authorized port reads only the private prepared generation and cancellation revokes the next unit', async () => {
  const data = {
      name: '',
      category: 'other',
      details: '\ufeff' + 'literal 🌙'.repeat(15000),
      updatedAt: 0,
      relations: Array.from({ length: 65 }, (_, i) => ({
        targetEntityId: 'entity',
        relationType: '',
        ...(i === 63 ? { description: 'after target 🌙' } : {}),
      })),
    },
    f = await preparedLoreFixture(data, { db: admin }),
    list = await f.reader.listBookLoreRead(uid, { bookId: f.p.bookId, tokenVersion: 2, limit: 10 }),
    h = await f.reader.getBookLoreRead(uid, { ...scope(f), readToken: list.items[0].readToken });
  assert.equal(list.items.length, 1);
  assert.deepEqual(h.dates, { updatedAt: 0 });
  assert.equal(await read(f, h, 'field', 'name'), '');
  assert.equal(await read(f, h, 'field', 'details'), data.details);
  const relations = [
    ...(await read(f, h, 'relations', null, 0)),
    ...(await read(f, h, 'relations', null, 1)),
  ];
  assert.deepEqual(
    relations,
    data.relations.map((r) => ({ ...r, targetEntityId: f.entityId })),
  );
  assert.equal((await admin.doc('books/' + f.p.bookId).get()).exists, false);
  await assert.rejects(() =>
    createBookLoreReadService({ db: admin }).getBookLoreRead(uid, scope(f)),
  );
  const head = await admin.doc('books/' + f.p.bookId + '/lore/' + f.entityId).get(),
    bodyId = head.data().payloadStorage.fields.details.manifest.bodyId,
    paths = [
      head.ref.path,
      'books/' + f.p.bookId + '/bookResourceBodies/' + bodyId,
      'books/' + f.p.bookId + '/bookResourceChunks/' + bodyId + ':000000000000000',
    ];
  for (const path of paths) {
    assert.equal((await admin.doc(path).get()).exists, true);
    for (const actor of [
      env.authenticatedContext(uid),
      env.authenticatedContext('other'),
      env.unauthenticatedContext(),
    ])
      await assertFails(getDoc(doc(actor.firestore(), path)));
  }
  const cancelled = (
    await f.factory().cancelBookRestore(uid, mutation(f.id, f.p, f.id + '-sdk-cancel'))
  ).progress;
  await assert.rejects(() =>
    f.reader.readBookLorePart(uid, {
      ...scope(f),
      readToken: h.readToken,
      section: 'field',
      field: 'details',
      page: 0,
      index: 1,
    }),
  );
  const done = await cleanupLegacyRestore(f.factory(), uid, f.id, cancelled, { limit: 8 });
  assert.equal(done.state, 'cancelled');
  assert.equal(
    done.preparation.cleanedArtifacts + done.preparation.retiredArtifacts,
    done.preparation.artifactCount,
  );
});
test('SDK prepared lore: valid physical part cannot be read through a recreated original journal', async () => {
  const f = await preparedLoreFixture({ name: 'Literal', category: 'other' }, { db: admin }),
    h = await f.reader.getBookLoreRead(uid, { ...scope(f), tokenVersion: 2 }),
    head = (await admin.doc('books/' + f.p.bookId + '/lore/' + f.entityId).get()).data(),
    bodyId = head.payloadStorage.fields.name.manifest.bodyId,
    journal = admin.doc(
      'users/' +
        uid +
        '/bookRestores/' +
        f.id +
        '/materializationArtifacts/' +
        digest(['payload-chunk', bodyId + ':000000000000000']),
    ),
    original = await journal.get(),
    part = admin.doc('books/' + f.p.bookId + '/bookResourceChunks/' + bodyId + ':000000000000000'),
    bytes = (await part.get()).data();
  assert.equal(original.exists, true);
  await journal.delete();
  await journal.create(original.data());
  await assert.rejects(() =>
    f.reader.readBookLorePart(uid, {
      ...scope(f),
      readToken: h.readToken,
      section: 'field',
      field: 'name',
      page: 0,
      index: 0,
    }),
  );
  assert.deepEqual((await part.get()).data(), bytes);
  assert.deepEqual((await journal.get()).data(), original.data());
  assert.equal((await admin.doc('books/' + f.p.bookId).get()).exists, false);
});
