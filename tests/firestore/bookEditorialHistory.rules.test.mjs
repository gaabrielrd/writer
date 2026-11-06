import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  readyEditorialHistory,
  finishEditorialSourceCleanup,
  historyInput,
  uid,
} from '../../functions/test/helpers/bookEditorialHistoryFixture.mjs';
import {
  editorialRecords,
  noteId,
} from '../../functions/test/helpers/bookRestoreEditorialFixture.mjs';
const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-editorial-history';
let environment, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use somente o emulador demo local.');
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(() => environment.clearFirestore());
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
});
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function bytes(f, id) {
  const source = await f
    .history()
    .openVerifiedBookEditorialHistory(uid, { bookId: f.p.bookId, id });
  const parts = [];
  for (let index = 0; index < source.chunkCount; index++) {
    const part = await source.readPart(index);
    parts.push(part.bytes);
    await admin.runTransaction((tx) => part.verify(tx));
  }
  const value = Buffer.concat(parts);
  assert.equal(sha(value), source.contentHash);
  await admin.runTransaction((tx) => source.verify(tx));
  return value;
}
// Internal services with real Admin native timestamps/Rules; not HTTP Auth/AppCheck or public UI.
test('real native source cleanup preserves authorized bounded history and SDK privacy', async () => {
  const records = editorialRecords({ note: '\ufeffPrivate 🌙\r\n"quoted" '.repeat(5000) });
  const f = await readyEditorialHistory({ db: admin, records });
  const page = await f.history().listBookEditorialHistory(uid, historyInput(f));
  const item = page.items.find((value) => value.artifact?.kind === 'document');
  const expected = Buffer.concat(
    records.filter((row) => row.id === noteId).map((row) => Buffer.from(row.payload)),
  );
  assert.deepEqual(await bytes(f, item.id), expected);
  const before = await f
    .history()
    .getBookEditorialHistory(uid, { bookId: f.p.bookId, id: item.id });
  for (const actor of [uid, 'other']) {
    const sdk = environment.authenticatedContext(actor).firestore();
    for (const collection of ['literaryArchive', 'literaryArchiveBodies', 'literaryArchiveParts']) {
      const id = collection === 'literaryArchiveParts' ? item.id + ':000000000000000' : item.id;
      await assertFails(getDoc(doc(sdk, 'books/' + f.p.bookId + '/' + collection + '/' + id)));
      await assertFails(
        setDoc(doc(sdk, 'books/' + f.p.bookId + '/' + collection + '/injected'), { forged: true }),
      );
    }
  }
  assert.equal((await finishEditorialSourceCleanup(f)).phase, 'done');
  assert.equal(
    (
      await admin
        .collection(f.root + '/materializationArtifacts')
        .limit(1)
        .get()
    ).empty,
    true,
  );
  assert.equal(
    (
      await admin
        .collection(f.root + '/chunks')
        .limit(1)
        .get()
    ).empty,
    true,
  );
  assert.equal((await admin.doc(f.root + '/preparedEditorial/current').get()).exists, true);
  assert.deepEqual(
    await f.history().getBookEditorialHistory(uid, { bookId: f.p.bookId, id: item.id }),
    before,
  );
  assert.deepEqual(await bytes(f, item.id), expected);
});

test('real current native root and recreated resource guards revoke held consumption without consumer writes', async () => {
  const f = await readyEditorialHistory({ db: admin });
  const page = await f.history().listBookEditorialHistory(uid, historyInput(f));
  const item = page.items.find((value) => value.artifact?.kind === 'document');
  const source = await f
    .history()
    .openVerifiedBookEditorialHistory(uid, { bookId: f.p.bookId, id: item.id });
  const part = await source.readPart(0),
    root = admin.doc('books/' + f.p.bookId);
  const saved = (await root.get()).data();
  await root.update({ authorId: 'other' });
  await assert.rejects(() =>
    admin.runTransaction(async (tx) => {
      await part.verify(tx);
      tx.create(admin.doc('users/' + uid + '/consumer/blocked'), { accepted: true });
    }),
  );
  assert.equal((await admin.doc('users/' + uid + '/consumer/blocked').get()).exists, false);
  await root.delete();
  await root.create(saved);
  await assert.rejects(() =>
    f.history().getBookEditorialHistory(uid, { bookId: f.p.bookId, id: item.id }),
  );
  await assert.rejects(() => admin.runTransaction((tx) => source.verify(tx)));
});
