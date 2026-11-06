import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope, digest, readWorkMetadata } from '../src/workProgressContracts.mjs';
import { readHistorySource } from '../src/workHistoryContracts.mjs';
import { createLiteraryImpactSourceVerifier } from '../src/literaryImpactVerification.mjs';
import {
  literaryProseOriginToken,
  literaryAutocompleteChapterIdentity,
} from '../src/literarySourceOrigins.mjs';
import { prepareRestoredChapterText } from '../src/bookChapterText.mjs';
const target = { kind: 'book', id: 'book' },
  text = '<p>A carta chegou.</p>';
const node = (kind, id) => ({ kind, id, scopeKind: 'book', scopeId: 'book' });
const link = (kind, id, capture, recordId = 'request') => ({
  from: node(kind, id),
  to: node('prose', recordId),
  relation: 'source',
  record: { collection: 'literaryProseRequests', id: recordId },
  capture,
});
function fixture() {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', updatedAt: 10 });
  f.records.set('books/book/chapters/c', {
    bookId: 'book',
    title: 'PRIVATE TITLE',
    contentMode: 'scenes',
    assemblyRevision: 1,
  });
  f.records.set('books/book/scenes/s', {
    ownerId: 'author',
    parentId: 'c',
    archived: false,
    revision: 1,
    bodyHash: digest(text),
  });
  f.records.set('books/book/scenes/s/body/current', { content: text, hash: digest(text) });
  const c = workScope(f.db, 'author', { target }, []);
  const verify = (value) =>
    f.db.runTransaction(async (tx) =>
      (await createLiteraryImpactSourceVerifier(tx, c, { bookId: 'book' }))(value),
    );
  return { ...f, c, verify };
}
async function sceneProof(f) {
  return f.db.runTransaction(async (tx) => {
    const book = await readWorkMetadata(tx, f.c.ref, []),
      chapter = await readWorkMetadata(tx, f.db.doc('books/book/chapters/c'), []);
    const scene = await readWorkMetadata(tx, f.db.doc('books/book/scenes/s'), []);
    const native = await readHistorySource(tx, f.db, f.c, { kind: 'scene', id: 's' });
    const origin = literaryProseOriginToken(f.c, {
      book,
      chapterId: 'c',
      chapter,
      sceneId: 's',
      scene,
    });
    return { origin, token: native.source.sourceToken };
  });
}
test('scene proof matches the native history token using only headers during verification', async () => {
  const f = fixture(),
    proof = await sceneProof(f),
    start = f.metadataReads.length;
  const value = await f.verify(
    link('scene', 's', {
      scheme: 'history-source',
      originToken: proof.origin,
      identityToken: null,
      versionToken: proof.token,
      revision: 1,
    }),
  );
  assert.equal(value.status, 'current');
  assert.equal(value.sourceIdentityVerified, true);
  assert.equal(value.manuscriptRead, false);
  assert.equal(value.byteIntegrityChecked, false);
  assert.equal(value.contentVerification, 'native-scene-header');
  assert.equal(value.editorialReview, false);
  assert.ok(f.metadataReads.slice(start).every((row) => !row.fields.includes('content')));
});
test('changed native scene body/version is detected while stable origin remains identified', async () => {
  const f = fixture(),
    proof = await sceneProof(f);
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book/scenes/s'));
    await tx.get(f.db.doc('books/book/scenes/s/body/current'));
    tx.update(f.db.doc('books/book/scenes/s'), { revision: 2, bodyHash: digest('new') });
    tx.update(f.db.doc('books/book/scenes/s/body/current'), {
      content: 'new',
      hash: digest('new'),
    });
  });
  const value = await f.verify(
    link('scene', 's', {
      scheme: 'history-source',
      originToken: proof.origin,
      identityToken: null,
      versionToken: proof.token,
      revision: 1,
    }),
  );
  assert.equal(value.status, 'changed');
  assert.equal(value.sourceIdentityVerified, true);
});
test('recreated parent or corrupted scene hash cannot be substituted for the captured source', async () => {
  const f = fixture(),
    proof = await sceneProof(f),
    edge = link('scene', 's', {
      scheme: 'history-source',
      originToken: proof.origin,
      identityToken: null,
      versionToken: proof.token,
      revision: 1,
    });
  f.metadata.set('books/book/chapters/c', { createdAt: 800, updatedAt: 800 });
  assert.equal((await f.verify(edge)).status, 'origin-mismatch');
  f.metadata.delete('books/book/chapters/c');
  f.records.set('books/book/scenes/s/body/current', { content: text, hash: digest('wrong') });
  assert.equal((await f.verify(edge)).status, 'unavailable');
});
async function inlineProof(f) {
  f.records.set('books/book/chapters/legacy', { bookId: 'book', content: text, updatedAt: 1 });
  return f.db.runTransaction(async (tx) => {
    const book = await readWorkMetadata(tx, f.c.ref, []),
      chapter = await readWorkMetadata(tx, f.db.doc('books/book/chapters/legacy'), []);
    return link('chapter', 'legacy', {
      scheme: 'content-hash',
      originToken: null,
      identityToken: literaryAutocompleteChapterIdentity(f.c, {
        book,
        chapterId: 'legacy',
        chapter,
      }),
      versionToken: digest(text),
      revision: null,
    });
  });
}
test('inline chapter hash is checked only after its incarnation, without implying editorial review', async () => {
  const f = fixture(),
    edge = await inlineProof(f),
    value = await f.verify(edge);
  assert.equal(value.status, 'current');
  assert.equal(value.manuscriptRead, true);
  assert.equal(value.contentVerification, 'inline-hash');
  assert.equal(value.byteIntegrityChecked, true);
  assert.equal(value.wholeUnitRead, false);
  assert.equal(value.editorialReview, false);
  f.records.set('books/book/chapters/legacy', {
    bookId: 'book',
    content: 'different',
    updatedAt: 2,
  });
  assert.equal((await f.verify(edge)).status, 'changed');
  f.metadata.set('books/book/chapters/legacy', { createdAt: 900, updatedAt: 900 });
  const start = f.metadataReads.length,
    recreated = await f.verify(edge);
  assert.equal(recreated.status, 'recreated');
  assert.equal(recreated.manuscriptRead, false);
  assert.ok(f.metadataReads.slice(start).every((row) => !row.fields.includes('content')));
});
test('a legacy chapter hash alone cannot identify a recreated or still-current source', async () => {
  const f = fixture(),
    edge = await inlineProof(f);
  edge.capture.identityToken = null;
  const value = await f.verify(edge);
  assert.equal(value.status, 'unverified');
  assert.equal(value.sourceIdentityVerified, false);
  assert.equal(value.manuscriptRead, false);
});
test('chunked chapter uses the native sealed body binding without claiming a byte audit', async () => {
  const f = fixture(),
    large = 'x'.repeat(600000);
  const prepared = prepareRestoredChapterText({
    uid: 'author',
    bookId: 'book',
    chapterId: 'legacy',
    operationId: 'text-identity-restore-0001',
    timestamp: 20,
    content: large,
  });
  f.records.set('books/book/chapters/legacy', {
    bookId: 'book',
    ownerId: 'author',
    ...prepared.patch,
  });
  for (const row of prepared.writes) {
    const [body, index] = row.id.split(':');
    const path =
      row.kind === 'text-body'
        ? 'books/book/bookTextBodies/' + row.id
        : 'books/book/bookTextBodies/' + body + '/chunks/' + index;
    f.records.set(path, row.value);
  }
  const edge = await f.db.runTransaction(async (tx) => {
    const book = await readWorkMetadata(tx, f.c.ref, []),
      chapter = await readWorkMetadata(tx, f.db.doc('books/book/chapters/legacy'), []);
    return link('chapter', 'legacy', {
      scheme: 'content-hash',
      originToken: null,
      identityToken: literaryAutocompleteChapterIdentity(f.c, {
        book,
        chapterId: 'legacy',
        chapter,
      }),
      versionToken: digest(large),
      revision: null,
    });
  });
  const value = await f.verify(edge);
  assert.equal(value.status, 'current');
  assert.equal(value.contentVerification, 'native-chapter-manifest');
  assert.equal(value.manuscriptRead, false);
  assert.equal(value.byteIntegrityChecked, false);
});
test('prose chapter composition is an independent versioned dependency', async () => {
  const f = fixture(),
    proof = await sceneProof(f);
  const assembly = await f.db.runTransaction(async (tx) => {
    const row = await readWorkMetadata(tx, f.db.doc('books/book/chapters/c'), ['assemblyRevision']);
    return digest({
      assemblyRevision: 1,
      updated: [row.updateTime.seconds, row.updateTime.nanoseconds],
    });
  });
  f.records.set('books/book/literaryProseRequests/request', {
    chapterId: 'c',
    sceneId: 's',
    originToken: proof.origin,
    assemblyToken: assembly,
  });
  const edge = link('chapter', 'c', {
    scheme: 'prose-assembly',
    originToken: proof.origin,
    identityToken: null,
    versionToken: assembly,
    revision: null,
  });
  assert.equal((await f.verify(edge)).status, 'current');
  await f.db.runTransaction(async (tx) => {
    await tx.get(f.db.doc('books/book/chapters/c'));
    tx.update(f.db.doc('books/book/chapters/c'), { assemblyRevision: 2 });
  });
  const value = await f.verify(edge);
  assert.equal(value.status, 'changed');
  assert.equal(value.sourceIdentityVerified, true);
  assert.equal(value.manuscriptRead, false);
  assert.equal(value.editorialReview, false);
});
