import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { validateBookBackupContent } from '../../functions/src/bookBackupContent.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';
import {
  source,
  indexFixture,
  hashPort,
} from '../../functions/test/helpers/bookContentFixture.mjs';
import { uploadArchiveRestore } from '../../functions/test/helpers/bookRestoreContentFixture.mjs';
import { bookLegacyFixture } from '../../functions/test/helpers/bookLegacyFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  legacyMutation as mutation,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
import {
  collectMappedRestore,
  qualifiedLoreRestoreFixture,
} from '../../functions/test/helpers/bookRestoreRemapFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-restore-remap',
  uid = 'author',
  id = 'restore-remap-sdk01',
  root = 'users/' + uid + '/bookRestores/' + id;
let env, admin, api;
const factory = () => createBookRestoreUploadService({ db: admin });
before(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(host ?? '')) throw new Error('Use a local demo emulator.');
  const [address, port] = host.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: address,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host, ssl: false, universeDomain: 'googleapis.com' });
  api = factory();
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
test('native mapped archive preserves semantics/raw and local qualified IDs while relation-index ABA blocks atomic consumption', async () => {
  const input = qualifiedLoreRestoreFixture(),
    original = await validateBookBackupContent(await source(input), {
      index: indexFixture(),
      hash: hashPort,
    }),
    { progress } = await uploadArchiveRestore(api, uid, id, input),
    done = await finishLegacyRestore(factory, uid, id, progress),
    reader = await factory().openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: done.jobToken,
    }),
    records = await collectMappedRestore(reader, (item) => admin.runTransaction(item.verify)),
    report = await validateBookBackupContent(await source(records, done.bookId), {
      index: indexFixture(),
      hash: hashPort,
    });
  assert.deepEqual(report.totals, original.totals);
  assert.deepEqual(report.warnings, original.warnings);
  let lore;
  for (let i = 0; i < reader.itemCount; i++) {
    const item = await reader.readMappedItem(i);
    if (item.record.kind === 'book-lore') lore = item;
  }
  const page = await lore.loreRelations.read(0);
  assert.equal(page.values[0].targetEntityId, lore.value.id);
  assert.equal(page.values[1].targetEntityId, 'universe:other:external');
  assert.equal(page.values[0].description, 'literal universe:shared:local');
  const sentinel = admin.doc('privateProofs/remap');
  await admin.runTransaction(async (tx) => {
    await page.verify(tx);
    tx.create(sentinel, { accepted: true });
  });
  assert.equal((await sentinel.get()).data().accepted, true);
  assert.equal((await admin.doc('books/' + done.bookId).get()).exists, false);
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ])
    await assertFails(getDoc(doc(actor.firestore(), root + '/validationItems/000000000000000')));
  const ref = admin.doc(
      root + '/validationIndex/' + digest(['node', 'lore', '', 'universe:shared:local']),
    ),
    saved = await ref.get();
  await ref.delete();
  await ref.create(saved.data());
  await assert.rejects(() => admin.runTransaction(page.verify));
  await assert.rejects(() => lore.loreRelations.read(0));
  assert.equal((await admin.doc('books/' + done.bookId).get()).exists, false);
});
test('native legacy mapping keeps missing style neutral, uses fresh-instance IDs and revokes prepared reads on cancel', async () => {
  const { progress } = await uploadLegacyRestore(api, uid, id, bookLegacyFixture(6)),
    done = await finishLegacyRestore(factory, uid, id, progress),
    request = { restoreId: id, jobToken: done.jobToken },
    reader = await factory().openVerifiedBookRestoreContent(uid, request),
    second = await factory().openVerifiedBookRestoreContent(uid, request),
    records = await collectMappedRestore(reader, (item) => admin.runTransaction(item.verify)),
    source = records.find((r) => r.kind === 'book-scene-source'),
    value = JSON.parse(new TextDecoder().decode(source.payload)),
    personaId = value.data.original.personaComplement.personaId;
  assert.match(personaId, /^custom-[a-f0-9]{64}$/);
  assert.equal(
    records
      .filter((r) => r.kind === 'book-persona')
      .some((r) => JSON.parse(new TextDecoder().decode(r.payload)).personaId === personaId),
    false,
  );
  for (let i = 0; i < reader.itemCount; i++) {
    const a = await reader.readMappedItem(i),
      b = await second.readMappedItem(i);
    assert.deepEqual(a.record, b.record);
    assert.deepEqual(a.value, b.value);
  }
  const prepared = await reader.readMappedItem(0);
  await api.cancelBookRestore(uid, mutation(id, done, 'remap-sdk-cancel01'));
  await assert.rejects(() => admin.runTransaction(prepared.verify));
  await assert.rejects(() => reader.readMappedItem(0));
  assert.equal((await admin.doc('books/' + done.bookId).get()).exists, false);
});
