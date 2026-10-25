import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { BOOK_RESTORE_METHODS, preparationProgress } from '../src/bookRestoreUploadContracts.mjs';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  draftRestoreFixture,
  readyRestoreDraft,
  finishRestoreDraft,
} from './helpers/bookRestoreDraftFixture.mjs';
import {
  cleanupLegacyRestore,
  legacyMutation as mutation,
} from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'draft-restore001',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
const stage = async (f, p, op = 'draft-stage-0001') =>
  (await f.api.advanceBookRestoreDraft(uid, mutation(id, p, op))).progress;
const map = (p) =>
  createBookRestoreRemapper({
    schemaVersion: 1,
    jobToken: p.jobToken,
    sourceBookId: 'book',
    bookId: p.bookId,
  });
test('removed chapter draft preserves exact metadata, body and exclusive profile without root or version header', async () => {
  const f = setup(),
    initial = await readyRestoreDraft(f.factory, uid, id),
    words = initial.preparation.wordCount,
    p = await finishRestoreDraft(f.factory, uid, id, initial),
    d = f.records.get(root + '/preparedDrafts/current'),
    body = f.records.get(
      'books/' + p.bookId + '/workVersionBodies/' + digest({ versionId: d.versionId, index: 0 }),
    ),
    profile = f.records.get(root + '/preparedPersonas/' + d.personaId);
  assert.equal(p.preparation.schemaVersion, 8);
  assert.equal(f.records.get(root).cleanupVersion, 11);
  assert.equal(p.preparation.phase, 'draft-finalize');
  assert.equal(d.outcome, 'version');
  assert.equal(d.chapter.id, map(p).identity('chapter', 'removed-draft'));
  assert.equal(d.chapter.title, '  Draft title 🌙  ');
  assert.equal(d.chapter.order, 9);
  assert.equal(d.chapter.createdAt, 111);
  assert.equal(d.chapter.updatedAt, 222);
  assert.equal(body.content, '\ufeff  Draft 🌙  ');
  assert.equal(profile.profileHash, d.profileHash);
  assert.equal(profile.profile.instructions, '\ufeff  Draft exact\nOnly here  ');
  assert.equal(p.preparation.personas.draftProfileId, d.personaId);
  assert.equal(p.preparation.wordCount, words);
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.equal(f.records.has('books/' + p.bookId + '/chapters/' + d.chapter.id), false);
  assert.equal(f.records.has('books/' + p.bookId + '/workVersions/' + d.versionId), false);
  assert.equal(f.records.get('books/' + p.bookId + '/workProgress/current').countReady, false);
  assert.equal(BOOK_RESTORE_METHODS.includes('advanceBookRestoreDraft'), true);
});
test('identical saved legacy text is recognized without duplicate draft bodies or a replacement chapter', async () => {
  const f = setup(),
    initial = await readyRestoreDraft(
      f.factory,
      uid,
      id,
      draftRestoreFixture({
        chapterId: 'legacy-chapter',
        content: 'Saved exact 🌙',
        savedContent: 'Saved exact 🌙',
      }),
    ),
    chapterPath =
      'books/' + initial.bookId + '/chapters/' + map(initial).identity('chapter', 'legacy-chapter'),
    before = structuredClone(f.records.get(chapterPath)),
    p = await stage(f, initial),
    d = f.records.get(root + '/preparedDrafts/current');
  assert.equal(d.outcome, 'saved');
  assert.equal(d.versionId, null);
  assert.equal(d.chunkCount, 0);
  assert.equal(p.preparation.draft.bodyCount, 0);
  assert.deepEqual(f.records.get(chapterPath), before);
});
test('explicit empty draft stays distinct from none and from a nonempty saved manuscript', async () => {
  const f = setup(),
    initial = await readyRestoreDraft(
      f.factory,
      uid,
      id,
      draftRestoreFixture({ content: '', chapterId: 'legacy-chapter', savedContent: 'Keep me' }),
    ),
    p = await stage(f, initial),
    d = f.records.get(root + '/preparedDrafts/current');
  assert.equal(d.outcome, 'version');
  assert.equal(d.byteLength, 0);
  assert.equal(d.chunkCount, 1);
  assert.equal(
    f.records.get(
      'books/' + p.bookId + '/workVersionBodies/' + digest({ versionId: d.versionId, index: 0 }),
    ).content,
    '',
  );
  assert.equal(f.records.get('books/' + p.bookId + '/chapters/' + d.chapter.id).content, 'Keep me');
});
test('none prepares an absent descriptor without any raw body or exclusive profile', async () => {
  const f = setup(),
    initial = await readyRestoreDraft(f.factory, uid, id, draftRestoreFixture({ none: true })),
    p = await stage(f, initial);
  assert.deepEqual(f.records.get(root + '/preparedDrafts/current'), {
    schemaVersion: 1,
    state: 'none',
  });
  assert.equal(p.preparation.draft.outcome, 'none');
  assert.equal(p.preparation.draft.parts, 0);
  assert.equal(p.preparation.artifactCount, initial.preparation.artifactCount + 1);
});
test('large multipart draft advances one frame at a time and resumes with exact bytes', async () => {
  const content = '\ufeff' + '🌙'.repeat(280000),
    f = setup(),
    initial = await readyRestoreDraft(f.factory, uid, id, draftRestoreFixture({ content })),
    first = await stage(f, initial),
    p = await finishRestoreDraft(f.factory, uid, id, first),
    d = f.records.get(root + '/preparedDrafts/current'),
    bodies = [...f.records]
      .filter(
        ([k, v]) =>
          k.startsWith('books/' + p.bookId + '/workVersionBodies/') && v.versionId === d.versionId,
      )
      .map(([, v]) => v)
      .sort((a, b) => a.index - b.index);
  assert.equal(first.preparation.itemIndex, initial.preparation.itemIndex);
  assert.equal(first.preparation.draft.parts, 1);
  assert.equal(first.preparation.draft.bodyCount, 1);
  assert.equal(bodies.map((v) => v.content).join(''), content);
  assert.equal(d.contentHash, digest(content));
  assert.equal(p.preparation.itemIndex, initial.preparation.itemIndex + 1);
  assert.ok(bodies.every((v) => Buffer.byteLength(v.content) <= 65536));
  assert.ok(
    f.commits.every(
      (writes) =>
        writes.filter((w) => w.method === 'create' && w.path.includes('/workVersionBodies/'))
          .length <= 1,
    ),
  );
});
test('large saved chapter is compared by its proved logical manifest without duplicating content', async () => {
  const content = 'é'.repeat(300000),
    f = setup(),
    initial = await readyRestoreDraft(
      f.factory,
      uid,
      id,
      draftRestoreFixture({ content, savedContent: content, chapterId: 'legacy-chapter' }),
    ),
    p = await finishRestoreDraft(f.factory, uid, id, initial),
    d = f.records.get(root + '/preparedDrafts/current');
  assert.equal(d.outcome, 'saved');
  assert.equal(p.preparation.draft.bodyCount, 0);
  assert.equal(f.records.get('books/' + p.bookId + '/chapters/' + d.chapter.id).content, null);
});
test('a composed chapter frozen field is not mistaken for its current saved manuscript', async () => {
  const f = setup(),
    initial = await readyRestoreDraft(
      f.factory,
      uid,
      id,
      draftRestoreFixture({ chapterId: 'chapter', content: 'Frozen', savedContent: 'Frozen' }),
    ),
    p = await stage(f, initial);
  assert.equal(f.records.get(root + '/preparedDrafts/current').outcome, 'version');
  assert.equal(p.preparation.draft.bodyCount, 1);
});
test('CAS and replay keep one draft contribution while original history and source-only profile remain distinct', async () => {
  const f = setup(),
    initial = await readyRestoreDraft(f.factory, uid, id),
    a = mutation(id, initial, 'draft-race-one01'),
    b = mutation(id, initial, 'draft-race-two01'),
    results = await Promise.allSettled([
      f.api.advanceBookRestoreDraft(uid, a),
      f.factory().advanceBookRestoreDraft(uid, b),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const won = results[0].status === 'fulfilled' ? a : b,
    first = results.find((r) => r.status === 'fulfilled').value,
    original = map(first.progress).identity('version', 'version'),
    d = f.records.get(root + '/preparedDrafts/current');
  assert.notEqual(d.versionId, original);
  assert.deepEqual(await f.factory().advanceBookRestoreDraft(uid, won), first);
  assert.equal(f.records.has('books/' + first.progress.bookId + '/workVersions/' + original), true);
});
test('namespace occupation and atomic body failure do not advance the job or expose a profile', async () => {
  const f = setup(),
    initial = await readyRestoreDraft(f.factory, uid, id),
    path = root + '/preparedDrafts/foreign';
  f.records.set(path, { foreign: true });
  const before = structuredClone([...f.records]);
  await assert.rejects(() => stage(f, initial));
  assert.deepEqual([...f.records], before);
  f.records.delete(path);
  const run = f.db.runTransaction.bind(f.db),
    failure = new Error('draft body failure'),
    baseline = structuredClone([...f.records]);
  let inject = true;
  f.db.runTransaction = (operation) =>
    run(async (tx) => {
      const create = tx.create;
      tx.create = (ref, ...args) => {
        if (inject && ref.path.includes('/workVersionBodies/')) throw failure;
        return create(ref, ...args);
      };
      return operation(tx);
    });
  await assert.rejects(
    () => stage(f, initial),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], baseline);
  inject = false;
  const p = await stage(f, initial);
  assert.equal(p.preparation.draft.outcome, 'version');
});
test('partial cleanup removes draft bodies and exclusive profile without changing another copy or the library', async () => {
  const f = setup(),
    initial = await readyRestoreDraft(
      f.factory,
      uid,
      id,
      draftRestoreFixture({ content: 'a'.repeat(70000) }),
    ),
    first = await stage(f, initial),
    library = 'users/' + uid + '/aiPersonas/' + first.preparation.personas.draftProfileId;
  f.records.set(library, { keep: true });
  f.records.set('books/other/workVersionBodies/own', { keep: true });
  assert.equal(f.records.has(root + '/preparedDrafts/current'), false);
  const p = await cleanupLegacyRestore(f.api, uid, id, first, { limit: 2 });
  assert.equal(p.state, 'cancelled');
  assert.equal(p.preparation.cleanedArtifacts, first.preparation.artifactCount);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/' + p.bookId + '/workVersionBodies/')),
    false,
  );
  assert.equal(f.records.get(library).keep, true);
  assert.equal(f.records.get('books/other/workVersionBodies/own').keep, true);
});
test('closed v8 progress rejects premature finalization and altered cursor/body counts', async () => {
  const f = setup(),
    initial = await readyRestoreDraft(
      f.factory,
      uid,
      id,
      draftRestoreFixture({ content: 'a'.repeat(70000) }),
    ),
    p = await stage(f, initial);
  for (const change of [
    (v) => (v.phase = 'draft-finalize'),
    (v) => v.draft.startIndex--,
    (v) => (v.draft.pending.cursor.previous = 'bad'),
    (v) => (v.draft.bodyCount = 0),
    (v) => (v.draft = null),
  ]) {
    const value = structuredClone(p.preparation);
    change(value);
    assert.throws(
      () => preparationProgress(value),
      (e) => e.code === 'failed-precondition' && e.details.reason === 'identity-conflict',
    );
  }
});

test('cancellation while the draft item is read blocks its body, profile and receipt', async () => {
  const f = setup(),
    initial = await readyRestoreDraft(f.factory, uid, id),
    doc = f.db.doc.bind(f.db),
    path = root + '/validationItems/' + String(initial.preparation.itemIndex).padStart(15, '0'),
    request = mutation(id, initial, 'draft-reading-request01');
  let intercepted = false;
  f.db.doc = (value) => {
    const ref = doc(value);
    if (value === path)
      return {
        ...ref,
        get: async () => {
          const snapshot = await ref.get();
          if (!intercepted) {
            intercepted = true;
            await f.api.cancelBookRestore(uid, mutation(id, initial, 'draft-reading-cancel01'));
          }
          return snapshot;
        },
      };
    return ref;
  };
  await assert.rejects(() => f.api.advanceBookRestoreDraft(uid, request));
  assert.equal(intercepted, true);
  assert.equal(f.records.has(root + '/preparedDrafts/current'), false);
  assert.equal(
    f.records.has(root + '/preparedPersonas/' + initial.preparation.personas.draftProfileId),
    false,
  );
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/' + request.operationId),
    false,
  );
});
