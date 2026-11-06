import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { workScope, digest } from '../../functions/src/workProgressContracts.mjs';
import { normalizeLiteraryReaderGuide } from '../../functions/src/literaryReaderGuideProtocol.mjs';
import { readLiteraryPublicationBook } from '../../functions/src/literaryPublicationContracts.mjs';
import {
  createLiteraryGuideDependencyIndex,
  guideDependencyVersionId,
  readLiteraryGuideDependencyIndex,
  readLiteraryGuideDependencyBackfillSource,
  backfillLiteraryGuideDependencyIndex,
} from '../../functions/src/literaryPublicationGuideDependencies.mjs';
const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-literary-guide-dependencies';
let environment, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
    throw new Error('Use somente o emulador demo local.');
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
beforeEach(async () => environment.clearFirestore());
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
});
async function seed({ legacy = false } = {}) {
  await admin.doc('books/book').set({
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 10,
    updatedAt: 10,
    wordCount: 0,
  });
  const c = workScope(admin, 'author', { target: { kind: 'book', id: 'book' } }, []);
  const { bookToken } = await admin.runTransaction((tx) => readLiteraryPublicationBook(tx, c));
  await admin
    .doc('books/book/literaryPublications/edition')
    .set({ schemaVersion: 1, jobId: 'edition', bookToken });
  const guide = normalizeLiteraryReaderGuide({
    name: 'Nome privado',
    aliases: [],
    category: 'concept',
    summary: 'Texto privado',
    certainty: 'uncertain',
    disambiguation: '',
    revealAfterChapterId: 'chapter',
    evidence: [{ chapterId: 'chapter', quote: 'Citação privada' }],
    facts: [],
    relationships: [],
    appearances: [],
  });
  const value = {
    version: 1,
    jobId: 'edition',
    id: 'guide',
    revision: 1,
    bookToken,
    deleted: false,
    guide,
    entryHash: digest(guide),
  };
  const versionId = guideDependencyVersionId(value),
    index = createLiteraryGuideDependencyIndex(value),
    source = admin.doc('books/book/literaryPublicationGuideVersions/' + versionId),
    target = admin.doc('books/book/literaryPublicationGuideDependencies/' + versionId);
  if (legacy) await source.create(value);
  else
    await admin.runTransaction(async (tx) => {
      await tx.get(source);
      tx.create(source, { ...value, dependencyIndexHash: index.indexHash });
      tx.create(target, index);
    });
  const read = () =>
    admin.runTransaction((tx) => readLiteraryGuideDependencyIndex(tx, c, versionId));
  return { c, versionId, source, target, read };
}

test('native SDK atomic guide/index birth verifies without source prose and index remains private for every SDK actor', async () => {
  const f = await seed();
  const checked = await f.read();
  assert.equal(checked.sourceRepresentation, 'native-co-created-index');
  const [source, index] = await admin.getAll(f.source, f.target);
  assert.ok(source.createTime.isEqual(index.createTime));
  assert.ok(index.createTime.isEqual(index.updateTime));
  assert.equal(JSON.stringify(index.data()).includes('Citação privada'), false);
  for (const uid of ['author', 'other', null]) {
    const db = uid
      ? environment.authenticatedContext(uid).firestore()
      : environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, f.target.path)));
    await assertFails(setDoc(doc(db, f.target.path), index.data()));
  }
});

test('native SDK backfill seals existing version and index atomically, replays original preflight and refuses later source changes', async () => {
  const f = await seed({ legacy: true });
  const preflight = await admin.runTransaction((tx) =>
    readLiteraryGuideDependencyBackfillSource(tx, f.c, f.versionId),
  );
  assert.equal(await f.read(), null);
  const write = () =>
    admin.runTransaction((tx) =>
      backfillLiteraryGuideDependencyIndex(tx, f.c, {
        versionId: f.versionId,
        expectedSourceToken: preflight.sourceToken,
      }),
    );
  assert.equal((await write()).created, true);
  const [source, index] = await admin.getAll(f.source, f.target);
  assert.ok(source.updateTime.isEqual(index.createTime));
  assert.equal(source.data().dependencyIndexHash, index.data().indexHash);
  assert.equal((await write()).created, false);
  assert.equal((await f.read()).sourceRepresentation, 'explicit-native-backfill');
  await f.source.update({ extraMetadata: 'changed' });
  await assert.rejects(f.read(), { code: 'failed-precondition' });
  await assert.rejects(write(), { code: 'failed-precondition' });
});

test('native SDK cannot reuse a co-created dependency proof after the same index ID is recreated', async () => {
  const f = await seed();
  const value = (await f.target.get()).data();
  await f.target.delete();
  await f.target.create(value);
  await assert.rejects(f.read(), { code: 'failed-precondition' });
});
