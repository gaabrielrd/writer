import { adventureImportDb } from './adventureImportDb.mjs';
import { createBookRestoreUploadService } from '../../src/bookRestoreUpload.mjs';
import { emptyEditorialContract } from '../../src/literaryContracts.mjs';
import { record } from './bookContentFixture.mjs';
import { loreOnlyRecords } from './bookRestorePreparedLoreFixture.mjs';
import { uploadArchiveRestore } from './bookRestoreContentFixture.mjs';
import { finishLegacyRestore, legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
import { finishRestoreStructure } from './bookRestoreStructureFixture.mjs';
import { finishRestoreLore } from './bookRestoreLoreFixture.mjs';
import { finishRestoreResources } from './bookRestoreResourcesFixture.mjs';
import { finishRestoreCounts } from './bookRestoreCountsFixture.mjs';
import { finishRestorePersonas } from './bookRestorePersonasFixture.mjs';
import { finishRestoreHistory } from './bookRestoreHistoryFixture.mjs';
import { finishRestoreDraft } from './bookRestoreDraftFixture.mjs';
import { finishRestoreCover } from './bookRestoreCoverFixture.mjs';
import { finishRestorePersonaLibrary } from './bookRestorePersonaLibraryFixture.mjs';
import { finishRestoreSourceIndexes } from './bookRestoreSourceIndexesFixture.mjs';
import { finishAudit } from './bookRestoreAuditFixture.mjs';
export const uid = 'author';
export const contractId = 'c'.repeat(64),
  noteId = 'd'.repeat(64),
  linkId = 'e'.repeat(64);
export const reference = (id) => ({
  kind: 'artifact',
  id,
  parentId: null,
  scope: { kind: 'book', id: 'book' },
  revision: null,
  contentHash: null,
  state: 'recorded',
  purpose: 'source',
});
export const artifact = (id, kind, content) => ({
  schemaVersion: 1,
  id,
  kind,
  revision: 1,
  createdAt: 1,
  updatedAt: 2,
  provenance: 'author',
  availability: { state: 'included' },
  content,
});
export function editorialRecords({
  base = loreOnlyRecords([]),
  note = '\ufeffPrivate 🌙\r\noriginal',
  payload = null,
} = {}) {
  const contract = record(
    'book-editorial-artifact',
    contractId,
    artifact(contractId, 'contract', emptyEditorialContract()),
  );
  const document = record(
    'book-editorial-artifact',
    noteId,
    artifact(noteId, 'document', {
      role: 'progress',
      title: 'Private',
      sections: [{ label: 'Original', text: note }],
      references: [],
    }),
  );
  if (payload !== null) document.payload = Buffer.from(payload);
  const parts = [];
  // Keep normal 64 KiB nonterminal frames, matching the actual archive producer.
  for (let offset = 0; offset < document.payload.length; offset += 65536)
    parts.push({
      ...document,
      part: offset / 65536,
      payload: document.payload.subarray(offset, offset + 65536),
    });
  return [
    ...base,
    contract,
    ...parts,
    record('book-editorial-link', linkId, {
      schemaVersion: 1,
      id: linkId,
      from: reference(contractId),
      to: reference(noteId),
      relation: 'references',
    }),
    record('book-editorial', 'book', {
      schemaVersion: 1,
      bookId: 'book',
      presence: 'captured',
      artifacts: 2,
      links: 1,
    }),
  ];
}
/** Full native v2 upload, integrity, validation, preparation and base audit; no seeded restore grants. */
export async function readyEditorial({
  db: provided = null,
  id = 'editorial-restore-0001',
  records = editorialRecords(),
  editorialActivation = false,
} = {}) {
  const f = provided ? { db: provided } : adventureImportDb({ nativeUpdates: true });
  const apiWith = (enabled = true, db = f.db, allowActivation = editorialActivation) =>
    createBookRestoreUploadService({
      db,
      now: () => 1000,
      indexedLoreBodies: true,
      editorialPreparation: enabled,
      editorialActivation: allowActivation,
    });
  const factory = () => apiWith();
  let p = (await uploadArchiveRestore(factory(), uid, id, records, 2)).progress;
  p = await finishLegacyRestore(factory, uid, id, p);
  if (p.state !== 'content-verified')
    throw Error('Editorial fixture rejected: ' + p.validation?.failure);
  for (const finish of [
    finishRestoreStructure,
    finishRestoreLore,
    finishRestoreResources,
    finishRestoreCounts,
    finishRestorePersonas,
  ])
    p = await finish(factory, uid, id, p);
  p = (await factory().advanceBookRestoreUniverse(uid, mutation(id, p, id + '-universe'))).progress;
  p = await finishRestoreHistory(factory, uid, id, p);
  p = await finishRestoreDraft(factory, uid, id, p);
  p = (await factory().finalizeBookRestoreDraft(uid, mutation(id, p, id + '-draft-final')))
    .progress;
  p = await finishRestoreCover(factory, uid, id, p);
  p = (await factory().reserveBookRestoreCover(uid, mutation(id, p, id + '-cover-reserve')))
    .progress;
  p = (await factory().materializeBookRestoreCover(uid, mutation(id, p, id + '-cover-materialize')))
    .progress;
  p = await finishRestorePersonaLibrary(factory, uid, id, p);
  p = await finishRestoreSourceIndexes(factory, uid, id, p);
  p = await finishAudit({ ...f, factory, id, p });
  return {
    ...f,
    apiWith,
    factory,
    id,
    p,
    sourceRecords: records,
    root: 'users/' + uid + '/bookRestores/' + id,
  };
}
export async function finishEditorial(f, start = f.p, { onStep } = {}) {
  let p = start;
  for (let unit = 0; unit < 2000; unit++) {
    const before = await f
      .factory()
      .getBookRestoreEditorial(uid, { restoreId: f.id, jobToken: p.jobToken });
    if (before.phase === 'materialized') return p;
    const request = mutation(f.id, p, f.id + '-editorial-' + unit);
    const result = await f.factory().advanceBookRestoreEditorial(uid, request);
    p = result.progress;
    await onStep?.({ before, request, result, p });
  }
  throw Error('Editorial materialization did not finish');
}
