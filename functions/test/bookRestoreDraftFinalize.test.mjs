import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import { createWorkHistoryService } from '../src/workHistory.mjs';
import { BOOK_RESTORE_METHODS } from '../src/bookRestoreUploadContracts.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { validateBookBackupContent } from '../src/bookBackupContent.mjs';
import { versionSummary } from '../src/workHistoryContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  readyRestoreDraft,
  finishRestoreDraft,
  draftRestoreFixture,
} from './helpers/bookRestoreDraftFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from './helpers/bookLegacyRestoreFixture.mjs';
import { record, utf8, hashPort, indexFixture, source } from './helpers/bookContentFixture.mjs';
const uid = 'author',
  id = 'finalize-draft001',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
const ready = async (f, options = {}) =>
  finishRestoreDraft(
    f.factory,
    uid,
    id,
    await readyRestoreDraft(f.factory, uid, id, draftRestoreFixture(options)),
  );
const finalize = async (f, p, op = 'finalize-draft-0001') =>
  f.api.finalizeBookRestoreDraft(uid, mutation(id, p, op));
test('finalizes exact counted text and original metadata/style as a private manual version before cover', async () => {
  const f = setup(),
    content = '\ufeff<p>Um <b>dois</b></p><script>hidden words</script><p>três 🌙</p>',
    initial = await ready(f, { content }),
    result = await finalize(f, initial),
    p = result.progress,
    d = f.records.get(root + '/preparedDrafts/current'),
    version = f.records.get('books/' + p.bookId + '/workVersions/' + d.versionId);
  assert.equal(p.preparation.phase, 'cover');
  assert.equal(p.preparation.itemIndex, initial.preparation.itemIndex);
  assert.equal(p.preparation.draft.finalized.wordCount, 3);
  assert.equal(version.wordCount, 3);
  assert.equal(version.reason, 'manual');
  assert.equal(version.label, 'Rascunho recuperado do backup');
  assert.equal(version.createdAt, p.updatedAt);
  assert.equal(version.draft.chapter.title, '  Draft title 🌙  ');
  assert.equal(version.draft.chapter.createdAt, 111);
  assert.equal(version.draft.persona.instructions, '\ufeff  Draft exact\nOnly here  ');
  assert.equal(version.resource.id, version.draft.chapter.id);
  assert.equal(p.preparation.wordCount, initial.preparation.wordCount);
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.equal(f.records.get('books/' + p.bookId + '/workProgress/current').countReady, false);
  assert.equal(BOOK_RESTORE_METHODS.includes('finalizeBookRestoreDraft'), true);
  const reader = await f.api.openVerifiedBookRestoreContent(uid, {
    restoreId: id,
    jobToken: p.jobToken,
  });
  assert.equal((await reader.readMappedItem(p.preparation.itemIndex)).record.kind, 'book-cover');
  f.records.set('books/' + p.bookId, { authorId: uid, title: 'Synthetic root' });
  const response = await createWorkHistoryService({ db: f.db }).readWorkVersion(uid, {
    target: { kind: 'book', id: p.bookId },
    versionId: version.id,
  });
  assert.equal(response.chunks.map((v) => v.content).join(''), content);
  assert.deepEqual(response.version.draft, version.draft);
});
test('none and text already saved finish without inventing a manual version or count', async () => {
  for (const options of [
    { none: true },
    { content: 'Saved', savedContent: 'Saved', chapterId: 'legacy-chapter' },
  ]) {
    const f = setup(),
      initial = await ready(f, options),
      before = structuredClone([...f.records].filter(([k]) => k.startsWith('books/'))),
      p = (await finalize(f, initial)).progress;
    assert.equal(p.preparation.phase, 'cover');
    assert.equal(p.preparation.draft.finalized.wordCount, null);
    assert.equal(p.preparation.artifactCount, initial.preparation.artifactCount);
    assert.deepEqual(
      [...f.records].filter(([k]) => k.startsWith('books/')),
      before,
    );
  }
});
test('empty and multipart drafts use real count and preserve their body without new body writes', async () => {
  for (const content of ['', '\ufeff' + 'palavra '.repeat(150000)]) {
    const f = setup(),
      initial = await ready(f, { content }),
      before = structuredClone([...f.records].filter(([k]) => k.includes('/workVersionBodies/'))),
      p = (await finalize(f, initial)).progress,
      version = f.records.get(
        'books/' + p.bookId + '/workVersions/' + p.preparation.draft.versionId,
      );
    assert.equal(version.wordCount, content === '' ? 0 : 150000);
    assert.equal(version.byteLength, Buffer.byteLength(content));
    assert.deepEqual(
      [...f.records].filter(([k]) => k.includes('/workVersionBodies/')),
      before,
    );
  }
});
test('a body recreated after counted reading fails the final masked proof without header or receipt', async () => {
  const f = setup(),
    initial = await ready(f, { content: 'a'.repeat(70000) }),
    run = f.db.runTransaction.bind(f.db),
    versionId = initial.preparation.draft.versionId,
    path = 'books/' + initial.bookId + '/workVersions/' + versionId,
    request = mutation(id, initial, 'draft-finalize-aba01');
  let injected = false;
  f.db.runTransaction = async (operation) => {
    const result = await run(operation);
    if (!injected && result?.ref?.path?.includes('/workVersionBodies/')) {
      injected = true;
      const ref = result.ref,
        value = structuredClone(result.value);
      await run((tx) => tx.delete(ref));
      await run((tx) => tx.create(ref, value));
    }
    return result;
  };
  await assert.rejects(() => f.api.finalizeBookRestoreDraft(uid, request));
  assert.equal(injected, true);
  assert.equal(f.records.has(path), false);
  assert.equal(
    f.records.has('users/' + uid + '/bookRestoreOperations/' + request.operationId),
    false,
  );
  assert.equal(f.records.get(root).checkpoint, initial.checkpoint);
});
test('header rollback and automatic callback retry keep one version, one receipt and historical replay', async () => {
  const f = setup(),
    initial = await ready(f),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]),
    failure = new Error('version header failed'),
    request = mutation(id, initial, 'draft-finalize-retry01');
  let inject = true,
    automatic = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) => {
        const create = tx.create;
        tx.create = (ref, ...args) => {
          if (inject && ref.path.includes('/workVersions/')) throw failure;
          return create(ref, ...args);
        };
        return operation(tx);
      });
    } catch (error) {
      if (error === failure && automatic) {
        inject = false;
        return run(operation);
      }
      throw error;
    }
  };
  await assert.rejects(
    () => f.api.finalizeBookRestoreDraft(uid, request),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  automatic = true;
  const result = await f.api.finalizeBookRestoreDraft(uid, request);
  assert.deepEqual(await f.api.finalizeBookRestoreDraft(uid, request), result);
  const terminal = await cleanupLegacyRestore(f.api, uid, id, result.progress, { limit: 5 });
  assert.equal(terminal.state, 'cancelled');
  assert.deepEqual((await f.api.finalizeBookRestoreDraft(uid, request)).receipt, result.receipt);
});
test('portable recovered metadata validates and remaps again without treating a historical style as an active profile', async () => {
  const f = setup(),
    content = '\ufefftexto histórico',
    initial = await ready(f, { content }),
    p = (await finalize(f, initial)).progress,
    native = f.records.get('books/' + p.bookId + '/workVersions/' + p.preparation.draft.versionId),
    portable = versionSummary(native),
    mapper = createBookRestoreRemapper({
      schemaVersion: 1,
      jobToken: 'a'.repeat(64),
      sourceBookId: p.bookId,
      bookId: 'second-restored-copy',
    }),
    mapped = mapper.mapJSON({ kind: 'work-version', id: native.id, part: 0 }, portable);
  assert.notEqual(mapped.value.id, native.id);
  assert.equal(mapped.value.resource.id, mapped.value.draft.chapter.id);
  assert.equal(
    mapped.value.draft.persona.id,
    mapped.value.draft.chapter.personaComplement.personaId,
  );
  assert.equal(mapped.value.draft.chapter.createdAt, 111);
  const records = draftRestoreFixture({ none: true }),
    start = records.findIndex((r) => r.kind === 'work-version'),
    end = records.findIndex((r) => r.kind === 'work-history');
  portable.target.id = 'book';
  records.splice(
    start,
    end - start + 1,
    record('work-version', portable.id, portable),
    { kind: 'work-version-text', id: portable.id, part: 0, payload: utf8(content) },
    record('work-history', 'book', {
      schemaVersion: 1,
      versions: 1,
      byteLength: Buffer.byteLength(content),
      chunkCount: 1,
    }),
  );
  const report = await validateBookBackupContent(await source(records), {
    hash: hashPort,
    index: indexFixture(),
  });
  assert.equal(report.totals.versions, 1);
  assert.equal(report.totals.profiles, 2);
});
test('history listing budgets large recovered metadata and resumes from the last delivered identity', async () => {
  const f = setup(),
    target = { kind: 'book', id: 'book' },
    history = createWorkHistoryService({ db: f.db });
  f.records.set('books/book', { authorId: uid });
  for (let i = 0; i < 3; i++)
    f.records.set('books/book/workVersions/version-' + i, {
      id: 'version-' + i,
      target,
      resource: { kind: 'chapter', id: 'gone' },
      createdAt: i + 1,
      reason: 'manual',
      label: null,
      wordCount: 0,
      byteLength: 0,
      contentHash: digest(''),
      chunkCount: 1,
      deleting: false,
      draft: {
        schemaVersion: 1,
        chapter: { id: 'gone', title: 'é'.repeat(200000), order: 1, createdAt: 1, updatedAt: 2 },
        persona: null,
      },
    });
  const first = await history.listWorkVersions(uid, { target, order: 'id', limit: 50 });
  assert.equal(first.items.length, 1);
  assert.ok(first.nextCursor);
  const second = await history.listWorkVersions(uid, {
    target,
    order: 'id',
    limit: 50,
    cursor: first.nextCursor,
  });
  assert.equal(second.items[0].id, 'version-1');
  const third = await history.listWorkVersions(uid, {
    target,
    order: 'id',
    limit: 50,
    cursor: second.nextCursor,
  });
  assert.equal(third.items[0].id, 'version-2');
  assert.equal(third.nextCursor, null);
});
