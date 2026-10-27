import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  readAvailablePersonaMetadata,
  readPersonaRestoreBatchProof,
} from '../src/personaAvailability.mjs';
import {
  parsePersonaRestoreOrigin,
  projectPersonaRestoreBatch,
  personaRestoreProjectId,
  isPersonaRestoreBatchAvailable,
  projectPersonaRestoreOrigin,
} from '../src/personaAvailabilityContracts.mjs';
import {
  adventurePersonaUid as uid,
  adventurePersonaId as id,
  adventurePersonaPaths as paths,
  adventurePersonaOrigin as origin,
  adventurePersonaValue,
  prepareAdventurePersonaBatch,
  activateAdventurePersonaBatch,
  cancelAdventurePersonaBatch,
} from './helpers/adventurePersonaAvailabilityFixture.mjs';
import { editorChatFixture } from './helpers/editorChatFixture.mjs';
import { readEditorChatSource, readEditorChatPersona } from '../src/editorChatContextRead.mjs';
import { createAdventureBackupSourceService } from '../src/adventureBackupSource.mjs';
import { createAdventureBackupPersonaService } from '../src/adventureBackupPersonaRead.mjs';
import { projectPortablePersonaProfile } from '../src/portablePersonaProfile.mjs';
const read = (f) =>
  f.db.runTransaction((tx) => readAvailablePersonaMetadata(tx, f.db, uid, id, ['revision']));
async function setup(active = false) {
  const f = adventureImportDb({ nativeUpdates: true });
  await prepareAdventurePersonaBatch(f.db);
  if (active) await activateAdventurePersonaBatch(f.db);
  return f;
}
test('closed adventure origin uses its own project identity and clones nested targets', async () => {
  const f = await setup(true),
    batch = f.records.get(paths.batch),
    parsed = parsePersonaRestoreOrigin(origin),
    projected = projectPersonaRestoreBatch(batch);
  assert.deepEqual(parsed, origin);
  assert.equal(personaRestoreProjectId(parsed), origin.target.id);
  assert.equal(isPersonaRestoreBatchAvailable(uid, origin, batch), true);
  parsed.target.id = 'different';
  projected.target.id = 'different';
  assert.equal(origin.target.id.startsWith('restore-a-'), true);
  assert.equal(batch.target.id, origin.target.id);
  assert.deepEqual(projectPersonaRestoreOrigin(adventurePersonaValue()), origin);
  assert.equal(
    Object.hasOwn(projectPortablePersonaProfile(adventurePersonaValue()), 'restoreOrigin'),
    false,
  );
});
test('adventure origin rejects book aliases, unsupported kinds and malformed or extra operational fields', () => {
  for (const patch of [
    { schemaVersion: 1 },
    { bookId: origin.target.id },
    { schemaVersion: 3 },
    { jobToken: 'bad' },
    { restoreId: '../other' },
    { target: { kind: 'book', id: origin.target.id } },
    { target: { kind: 'campaign', id: origin.target.id } },
    { target: { kind: 'adventure', id: 'restore-' + 'b'.repeat(64) } },
    { target: { ...origin.target, path: 'outside' } },
    { grant: 'owner' },
  ])
    assert.throws(() => parsePersonaRestoreOrigin({ ...origin, ...patch }));
  assert.equal(
    isPersonaRestoreBatchAvailable(uid, { ...origin, bookId: origin.target.id }, {}),
    false,
  );
});
test('preparing, cancelled and missing adventure batches never authorize a restored profile', async () => {
  for (const state of ['preparing', 'cancelled', 'missing']) {
    const f = await setup();
    if (state === 'cancelled') await cancelAdventurePersonaBatch(f.db);
    if (state === 'missing') await f.db.runTransaction((tx) => tx.delete(f.db.doc(paths.batch)));
    assert.equal(await read(f), null);
    assert.equal(
      f.metadataReads.some((v) => v.path === paths.profile && v.fields.includes('instructions')),
      false,
    );
  }
});
test('active proof uses only adventure receipts and masked metadata; profile revisions remain editable', async () => {
  const f = await setup(true);
  assert.equal((await read(f)).data().revision, 7);
  assert.equal(
    f.metadataReads.some((v) => v.path.includes('/bookRestoreOperations/')),
    false,
  );
  assert.ok(f.metadataReads.some((v) => v.path === paths.first));
  assert.ok(f.metadataReads.some((v) => v.path === paths.last));
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(paths.profile), { revision: 8, instructions: 'Edited' }),
  );
  assert.equal((await read(f)).data().revision, 8);
});
for (const which of ['batch', 'first', 'last'])
  test('recreated native adventure ' + which + ' cannot reauthorize identical fields', async () => {
    const f = await setup(true),
      value = f.records.get(paths[which]);
    await f.db.runTransaction((tx) => tx.delete(f.db.doc(paths[which])));
    await f.db.runTransaction((tx) => tx.create(f.db.doc(paths[which]), value));
    assert.equal(await read(f), null);
  });
test('adventure proof rejects account, generation, target, receipt action and state mismatches', async () => {
  for (const [path, change] of [
    [paths.batch, (v) => (v.ownerId = 'other')],
    [paths.batch, (v) => (v.target.id = 'restore-a-' + 'a'.repeat(64))],
    [paths.batch, (v) => (v.target.kind = 'book')],
    [paths.batch, (v) => (v.jobToken = 'e'.repeat(64))],
    [paths.first, (v) => (v.receipt.action = 'advanceBookRestorePersonaLibrary')],
    [paths.last, (v) => (v.receipt.action = 'activateBookRestore')],
    [paths.last, (v) => (v.receipt.state = 'content-verified')],
    [paths.last, (v) => (v.restoreId = 'different-restore-0001')],
    [paths.last, (v) => (v.jobToken = 'e'.repeat(64))],
    [paths.profile, (v) => (v.restoreOrigin.target.id = 'restore-a-' + 'a'.repeat(64))],
  ]) {
    const f = await setup(true),
      value = structuredClone(f.records.get(path));
    change(value);
    f.records.set(path, value);
    assert.equal(await read(f), null);
  }
});
test('book operation paths cannot substitute valid-looking adventure receipts', async () => {
  const f = await setup(true);
  for (const path of [paths.first, paths.last]) {
    const value = f.records.get(path);
    await f.db.runTransaction((tx) => {
      tx.create(
        f.db.doc(path.replace('/adventureRestoreOperations/', '/bookRestoreOperations/')),
        value,
      );
      tx.delete(f.db.doc(path));
    });
  }
  assert.equal(await read(f), null);
});
test('ABA batch edits and receipt rewrites fail the native identity proof', async () => {
  for (const path of [paths.batch, paths.last]) {
    const f = await setup(true),
      value = f.records.get(path);
    await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { profileCount: 5 }));
    await f.db.runTransaction((tx) => tx.set(f.db.doc(path), value));
    assert.equal(await read(f), null);
  }
});
test('cancelled batch proof belongs to adventure cleanup and never permits available reads', async () => {
  const f = await setup(true);
  await cancelAdventurePersonaBatch(f.db);
  const proof = await f.db.runTransaction((tx) =>
    readPersonaRestoreBatchProof(tx, f.db, uid, origin, 'cancelled'),
  );
  assert.ok(proof);
  assert.equal(await read(f), null);
});
test('real adventure AI and backup consumers require active proof and remove operational origin from output', async () => {
  const f = await editorChatFixture('adventure', true, adventureImportDb({ nativeUpdates: true }));
  await prepareAdventurePersonaBatch(f.db);
  await f.db.runTransaction((tx) => tx.update(f.db.doc(f.path), { personaId: id }));
  const backup = createAdventureBackupPersonaService({ db: f.db }),
    pin = await createAdventureBackupSourceService({ db: f.db }).getAdventureBackupSource(uid, {
      adventureId: f.target.id,
    }),
    input = { adventureId: f.target.id, sourceToken: pin.sourceToken, scope: 'adventure' },
    compile = () =>
      f.db.runTransaction(async (tx) =>
        readEditorChatPersona(tx, f.db, await readEditorChatSource(tx, f.db, uid, f.scope), {
          full: true,
        }),
      );
  await assert.rejects(() => compile());
  await assert.rejects(() => backup.listAdventureBackupPersonaBindings(uid, input));
  await activateAdventurePersonaBatch(f.db);
  assert.ok((await compile()).snapshot);
  const row = (await backup.listAdventureBackupPersonaBindings(uid, input)).items[0],
    raw = await backup.readAdventureBackupPersona(uid, {
      ...input,
      id: row.id,
      itemToken: row.itemToken,
      index: 0,
    }),
    value = JSON.parse(Buffer.from(raw.chunkBase64, 'base64').toString('utf8'));
  assert.equal(value.profile.id, id);
  assert.equal(Object.hasOwn(value.profile, 'restoreOrigin'), false);
  assert.equal(value.profile.revision, 7);
  const batch = f.records.get(paths.batch);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(paths.batch)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(paths.batch), batch));
  await assert.rejects(() => compile());
  await assert.rejects(() => backup.listAdventureBackupPersonaBindings(uid, input));
});
