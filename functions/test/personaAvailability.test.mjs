import test from 'node:test';
import { createBookBackupDraftService } from '../src/bookBackupDraftRead.mjs';
import { editorChatConversationFixture } from './helpers/editorChatConversationFixture.mjs';
import { readEditorChatPersona } from '../src/editorChatContextRead.mjs';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';
import { createBookBackupPersonaService } from '../src/bookBackupPersonaRead.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import assert from 'node:assert/strict';
import { readAvailablePersonaMetadata } from '../src/personaAvailability.mjs';
import {
  projectPersonaRestoreOrigin,
  projectPersonaRestoreBatch,
  isPersonaRestoreBatchAvailable,
} from '../src/personaAvailabilityContracts.mjs';
import { projectBookBackupPersona } from '../src/bookBackupPersonas.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  personaRestoreUid as uid,
  personaRestoreProfile as id,
  personaRestorePaths as paths,
  personaRestoreOrigin as origin,
  personaRestoreValue,
  preparePersonaRestoreBatch,
  activatePersonaRestoreBatch,
} from './helpers/personaRestoreAvailabilityFixture.mjs';
const read = (f) =>
  f.db.runTransaction((tx) => readAvailablePersonaMetadata(tx, f.db, uid, id, ['revision']));
async function setup(active = false) {
  const f = adventureImportDb({ nativeUpdates: true });
  await preparePersonaRestoreBatch(f.db);
  if (active) await activatePersonaRestoreBatch(f.db);
  return f;
}
test('legacy persona keeps existing availability and snapshots without a restoration marker', async () => {
  const f = adventureImportDb({ nativeUpdates: true }),
    profile = personaRestoreValue();
  delete profile.restoreOrigin;
  await f.db.runTransaction((tx) => tx.create(f.db.doc(paths.profile), profile));
  assert.equal((await read(f)).data().revision, 7);
  assert.equal(projectPersonaRestoreOrigin(profile), null);
  assert.equal(isPersonaRestoreBatchAvailable(uid, null, undefined), true);
  assert.equal(
    f.metadataReads.some((v) => v.path.includes('aiPersonaRestoreBatches')),
    false,
  );
});
test('preparing, missing and cancelled batches cannot authorize a restored profile', async () => {
  for (const state of ['preparing', 'missing', 'cancelled']) {
    const f = await setup();
    if (state === 'missing') await f.db.runTransaction((tx) => tx.delete(f.db.doc(paths.batch)));
    if (state === 'cancelled')
      await f.db.runTransaction((tx) => tx.update(f.db.doc(paths.batch), { state: 'cancelled' }));
    assert.equal(await read(f), null);
    assert.equal(
      f.metadataReads.some((v) => v.path === paths.profile && v.fields.includes('instructions')),
      false,
    );
  }
});
test('active batch requires native first and activation receipts; portable profile excludes operational origin', async () => {
  const f = await setup(true),
    snapshot = await read(f);
  assert.equal(snapshot.data().revision, 7);
  assert.equal(Object.hasOwn(snapshot.data(), 'instructions'), false);
  assert.deepEqual(projectPersonaRestoreOrigin(personaRestoreValue()), origin);
  const portable = projectBookBackupPersona(personaRestoreValue());
  assert.equal(Object.hasOwn(portable, 'restoreOrigin'), false);
  assert.equal(portable.revision, 7);
});
for (const what of ['batch', 'first', 'last'])
  test(
    'native ' + what + ' recreated with identical data does not reauthorize the old batch',
    async () => {
      const f = await setup(true),
        path = paths[what],
        value = structuredClone(f.records.get(path));
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      assert.equal(await read(f), null);
      assert.deepEqual(f.records.get(path), value);
    },
  );
test('batch ABA and receipt updates invalidate the native proof even after fields return to their old values', async () => {
  const f = await setup(true),
    original = f.records.get(paths.batch).profileCount;
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(paths.batch), { profileCount: original + 1 }),
  );
  await f.db.runTransaction((tx) => tx.update(f.db.doc(paths.batch), { profileCount: original }));
  assert.equal(await read(f), null);
  const g = await setup(true);
  await g.db.runTransaction((tx) =>
    tx.update(g.db.doc(paths.last), { fingerprint: 'e'.repeat(64) }),
  );
  await g.db.runTransaction((tx) =>
    tx.update(g.db.doc(paths.last), { fingerprint: 'd'.repeat(64) }),
  );
  assert.equal(await read(g), null);
});
test('foreign ownership, action, token and malformed operational data fail closed', async () => {
  for (const [path, change] of [
    [paths.batch, (v) => (v.ownerId = 'other')],
    [paths.batch, (v) => (v.jobToken = 'f'.repeat(64))],
    [paths.last, (v) => (v.receipt.action = 'cancelBookRestore')],
    [paths.profile, (v) => (v.restoreOrigin.jobToken = 'f'.repeat(64))],
    [paths.profile, (v) => (v.restoreOrigin.extra = 'private')],
    [paths.batch, (v) => (v.profileCount = -1)],
  ]) {
    const f = await setup(true),
      value = structuredClone(f.records.get(path));
    change(value);
    f.records.set(path, value);
    assert.equal(await read(f), null);
  }
});
test('legitimate profile revision after batch activation remains available without modifying the batch', async () => {
  const f = await setup(true);
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(paths.profile), { revision: 8, instructions: 'Revised privately' }),
  );
  assert.equal((await read(f)).data().revision, 8);
});
test('closed shared contracts refuse unknown fields, unsafe scopes and invalid generations', () => {
  const value = personaRestoreValue();
  for (const change of [
    (v) => (v.id = 'custom-old'),
    (v) => (v.restoreOrigin = null),
    (v) => (v.restoreOrigin.bookId = '../outside'),
    (v) => (v.restoreOrigin.restoreId = 'bad'),
    (v) => (v.restoreOrigin.jobToken = 'bad'),
    (v) => (v.restoreOrigin.url = 'outside'),
  ]) {
    const record = structuredClone(value);
    change(record);
    assert.throws(() => projectPersonaRestoreOrigin(record));
  }
  assert.throws(() =>
    projectPersonaRestoreBatch({
      ...origin,
      ownerId: uid,
      state: 'active',
      profileCount: 1,
      createdByOperationId: 'persona-install-0001',
      lastOperationId: 'persona-activate-001',
      unknown: true,
    }),
  );
});

async function bookConsumerFixture(active = false) {
  const f = await setup(active),
    bookId = 'existing-persona-book001';
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('books/' + bookId), {
      authorId: uid,
      title: 'Existing book',
      personaId: id,
      status: 'draft',
      createdAt: 1,
      updatedAt: 2,
      wordCount: 0,
    }),
  );
  return { ...f, bookId };
}
test('scene AI cannot compile a pending restored persona and only receives it after native activation proof', async () => {
  const f = await bookConsumerFixture(),
    compile = () =>
      f.db.runTransaction(async (tx) => {
        const snapshot = await tx.get(f.db.doc('books/' + f.bookId));
        return readEditorChatPersona(
          tx,
          f.db,
          {
            uid,
            target: { kind: 'book', id: f.bookId },
            root: snapshot.data(),
            snapshot,
            scene: null,
          },
          { full: true },
        );
      });
  await assert.rejects(
    () => compile(),
    (e) => e.details?.reason === 'provenance-revoked',
  );
  await activatePersonaRestoreBatch(f.db);
  assert.ok((await compile()).snapshot);
  const value = structuredClone(f.records.get(paths.batch));
  await f.db.runTransaction(async (tx) => tx.delete(f.db.doc(paths.batch)));
  await f.db.runTransaction(async (tx) => tx.create(f.db.doc(paths.batch), value));
  await assert.rejects(
    () => compile(),
    (e) => e.details?.reason === 'provenance-revoked',
  );
});
test('backup bindings refuse a pending batch and serialize the active profile without operational metadata', async () => {
  const f = await bookConsumerFixture(),
    root = createBookBackupReadService({ db: f.db }),
    api = createBookBackupPersonaService({ db: f.db }),
    pin = await root.getBookBackupSource(uid, { bookId: f.bookId }),
    input = { bookId: f.bookId, sourceToken: pin.sourceToken, kind: 'book', limit: 10 },
    list = () => api.listBookBackupPersonaBindings(uid, input);
  await assert.rejects(() => list());
  await activatePersonaRestoreBatch(f.db);
  const row = (await list()).items[0],
    raw = await api.readBookBackupPersona(uid, {
      bookId: f.bookId,
      sourceToken: pin.sourceToken,
      kind: 'book',
      id: row.id,
      itemToken: row.itemToken,
      index: 0,
    }),
    record = JSON.parse(Buffer.from(raw.chunkBase64, 'base64').toString('utf8'));
  assert.equal(record.profile.id, id);
  assert.equal(Object.hasOwn(record.profile, 'restoreOrigin'), false);
});
test('legacy chapter writer cannot bind a pending restored profile but accepts it after activation', async () => {
  const f = await bookConsumerFixture(),
    api = createWorkProgressService({ db: f.db, now: () => 1000 }),
    request = {
      bookId: f.bookId,
      operationId: 'persona-chapter-create01',
      input: {
        title: 'Chapter',
        content: 'Saved text',
        order: 1,
        actId: null,
        personaComplement: { personaId: id, overrides: [] },
      },
    };
  await assert.rejects(
    () => api.createLegacyChapter(uid, request),
    (e) => e.code === 'invalid-argument',
  );
  assert.equal(f.records.has('books/' + f.bookId + '/chapters/' + request.operationId), false);
  await activatePersonaRestoreBatch(f.db);
  const chapter = await api.createLegacyChapter(uid, request);
  assert.equal(chapter.personaComplement.personaId, id);
});

test('draft-only style cannot bypass batch availability and keeps operational metadata out of the backup', async () => {
  const f = await bookConsumerFixture(),
    root = createBookBackupReadService({ db: f.db }),
    api = createBookBackupDraftService({ db: f.db }),
    pin = await root.getBookBackupSource(uid, { bookId: f.bookId }),
    request = { bookId: f.bookId, sourceToken: pin.sourceToken, personaId: id };
  await assert.rejects(() => api.getBookBackupDraftPersona(uid, request));
  await activatePersonaRestoreBatch(f.db);
  const result = await api.getBookBackupDraftPersona(uid, request);
  assert.equal(result.profile.id, id);
  assert.equal(Object.hasOwn(result.profile, 'restoreOrigin'), false);
});
test('unavailable restored batch hides an old chat answer before reading its body and preserves the own question', async () => {
  const native = await setup(true);
  const f = await editorChatConversationFixture({
    setup: async (f) => {
      for (const [path, value] of native.records) f.records.set(path, structuredClone(value));
      for (const [path, value] of native.metadata) f.metadata.set(path, structuredClone(value));
      f.records.get(f.path).personaId = id;
    },
  });
  await f.seedTurn('restored');
  assert.equal((await f.get('restored')).presentation, 'available');
  f.metadata.set(paths.batch, { ...f.metadata.get(paths.batch), createdAtNanoseconds: 999 });
  f.events.length = 0;
  const result = await f.get('restored');
  assert.equal(result.presentation, 'blocked');
  assert.equal(result.question, 'Pergunta restored');
  assert.equal(result.answer, null);
  assert.equal(
    f.events.some((e) => e.method === 'get' && e.path?.includes('/turnBodies/')),
    false,
  );
});
