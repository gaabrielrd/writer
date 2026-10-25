import { adventureImportDb } from './adventureImportDb.mjs';
import { record, resource, source } from './bookContentFixture.mjs';
import { BOOK_RESOURCE_KINDS } from '../../src/bookBackupResources.mjs';
import { createBookRestoreUploadService } from '../../src/bookRestoreUpload.mjs';
import { createBookRestoreRemapper } from '../../src/bookRestoreRemap.mjs';
import { uploadSealedArchiveRestore } from './bookRestoreContentFixture.mjs';
import { finishLegacyRestore, legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
import { finishRestoreStructure } from './bookRestoreStructureFixture.mjs';
import { finishRestoreResources } from './bookRestoreResourcesFixture.mjs';
import { finishRestoreCounts } from './bookRestoreCountsFixture.mjs';
export const uid = 'author';
/** A complete, minimal archive fixture with only lore. Does not represent the original book's other resources. */
export function loreOnlyRecords(parts, bookId = 'book') {
  const zero = { book: 0, chapter: 0, 'scene-source': 0 };
  return [
    record('book-metadata', bookId, {
      book: { title: 'Lore roundtrip', universeId: null },
      progress: { wordGoal: null },
      cover: { kind: 'none' },
    }),
    ...parts,
    record('book-resources', bookId, {
      schemaVersion: 1,
      counts: Object.fromEntries(
        BOOK_RESOURCE_KINDS.map((kind) => [
          kind,
          kind === 'lore' ? parts.filter((v) => v.part === 0).length : 0,
        ]),
      ),
    }),
    record('book-personas', bookId, {
      schemaVersion: 1,
      owners: { ...zero, book: 1 },
      bindings: zero,
    }),
    record('book-universe', bookId, { schemaVersion: 1, origin: { kind: 'none' } }),
    record('work-history', bookId, { schemaVersion: 1, versions: 0, byteLength: 0, chunkCount: 0 }),
    record('book-draft', bookId, { schemaVersion: 1, state: 'none' }),
    record('book-cover', bookId, { schemaVersion: 1, cover: { kind: 'none' } }),
  ];
}
export function loreRecords(data, sourceLoreId = 'entity') {
  const r = resource('lore', sourceLoreId, data),
    parts = [];
  for (let offset = 0; offset < r.payload.length; offset += 65536)
    parts.push({ ...r, part: offset / 65536, payload: r.payload.subarray(offset, offset + 65536) });
  return parts;
}
/** Real upload/validation/materialization/reconciliation/drain; no synthetic project root. */
export async function preparedLoreFixture(
  data,
  {
    db: provided = null,
    restoreId = 'prepared-lore-0001',
    sourceBookId = 'book',
    sourceLoreId = 'entity',
    records = null,
    indexedLoreBodies = true,
  } = {},
) {
  const f = provided ? { db: provided } : adventureImportDb({ nativeUpdates: true }),
    factory = () =>
      createBookRestoreUploadService({ db: f.db, now: () => 1000, indexedLoreBodies }),
    src = await source(
      records ?? loreOnlyRecords(loreRecords(data, sourceLoreId), sourceBookId),
      sourceBookId,
    );
  let p = await uploadSealedArchiveRestore(factory(), uid, restoreId, await src.read(0, src.size));
  p = await finishLegacyRestore(factory, uid, restoreId, p);
  if (p.state !== 'content-verified')
    throw Error('Archive fixture rejected: ' + p.validation?.failure);
  p = await finishRestoreStructure(factory, uid, restoreId, p);
  for (let unit = 0; p.preparation.phase !== 'scenes'; unit++) {
    if (unit > 20000) throw Error('Lore materialization did not finish');
    p = (
      await factory().advanceBookRestoreLore(
        uid,
        mutation(restoreId, p, restoreId + '-lore-' + unit),
      )
    ).progress;
  }
  p = await finishRestoreResources(factory, uid, restoreId, p);
  p = await finishRestoreCounts(factory, uid, restoreId, p);
  const mapper = createBookRestoreRemapper({
      schemaVersion: 1,
      jobToken: p.jobToken,
      sourceBookId,
      bookId: p.bookId,
    }),
    open = () => factory().openPreparedBookRestoreLore(uid, { restoreId, jobToken: p.jobToken }),
    reader = await open();
  return {
    ...f,
    p,
    factory,
    mapper,
    id: restoreId,
    entityId: mapper.identity('lore', sourceLoreId),
    open,
    reader,
  };
}
