import { born, closed } from './bookRestoreUploadContracts.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
import { BookBackupFormatError } from './bookBackupContainer.mjs';
import { GenerationError } from './generation.mjs';
import { BOOK_LORE_BASE_FIELDS } from './bookLoreBaseIndex.mjs';
import { validateBookBackupJSONItem } from './bookBackupSchema.mjs';
import { projectBookBackupResource } from './bookBackupResources.mjs';
import { readBookResourcePayload } from './bookResourcePayloadRead.mjs';
import { openBookLoreRecord, openBookLoreRelationPage } from './bookLoreStorageRead.mjs';
import { loreChanged } from './bookLoreReadContracts.mjs';
import { loreGenerationDates } from './bookLoreGenerationContracts.mjs';
const exhausted = () =>
  workFail(
    'resource-exhausted',
    'Compêndio grande demais para esta análise.',
    'book-lore-context-budget',
  );
/** Server context budget, never an authoring, C1 or portability limit. */
export function createBookLoreLogicalBudget({ bytes = 300000, parts = 512, pages = 512 } = {}) {
  const limit = { bytes, parts, pages },
    used = { bytes: 0, parts: 0, pages: 0 };
  for (const n of Object.values(limit))
    if (!Number.isSafeInteger(n) || n < 0)
      workFail('invalid-argument', 'Orçamento de contexto inválido.');
  return {
    reserve(cost) {
      for (const key of Object.keys(cost))
        if (!Object.hasOwn(limit, key) || !Number.isSafeInteger(cost[key]) || cost[key] < 0)
          workFail('invalid-argument', 'Orçamento de contexto inválido.');
      for (const key of Object.keys(limit))
        if ((cost[key] ?? 0) > limit[key] - used[key]) exhausted();
      for (const key of Object.keys(limit)) used[key] += cost[key] ?? 0;
    },
    get used() {
      return { ...used };
    },
  };
}
export const bookLoreLogicalOrigin = (snapshot, representation) => ({
  birth: born(snapshot),
  update: born({ createTime: snapshot.updateTime }),
  representationHash: digest(representation),
});
const scoped = (c, id) => ({
  uid: c.uid,
  bookId: c.bookId,
  resource: { kind: 'lore', parentId: null, id },
});
async function body(tx, c, id, pointer, budget) {
  budget.reserve({ bytes: pointer.manifest.byteLength, parts: pointer.manifest.chunkCount });
  return readBookResourcePayload(tx, c.db, { ...scoped(c, id), ...pointer });
}
/** Caller must authorize the original book in this transaction before opening. */
export async function readBookLoreLogical(tx, c, snapshot, budget) {
  try {
    const opened = await openBookLoreRecord(tx, c, snapshot);
    let data;
    if (opened.mode === 'inline') {
      budget.reserve({ bytes: opened.bytes.length });
      data = structuredClone(opened.data);
    } else {
      const storage = opened.storage;
      budget.reserve({ pages: storage.relations.pages });
      data = storage.base === null ? {} : await body(tx, c, opened.id, storage.base, budget);
      if (storage.base !== null) {
        closed(
          data,
          ['name', 'category', 'bookId', 'createdAt', 'updatedAt'],
          BOOK_LORE_BASE_FIELDS.filter(
            (k) => !['name', 'category', 'bookId', 'createdAt', 'updatedAt'].includes(k),
          ),
        );
        if (data.bookId !== c.bookId) loreChanged();
        delete data.bookId;
      }
      if (storage.schemaVersion === 2) {
        for (const [field, pointer] of Object.entries(storage.fields)) {
          if (pointer === null) delete data[field];
          else data[field] = await body(tx, c, opened.id, pointer, budget);
        }
        const logicalDates = loreGenerationDates(storage);
        for (const key of ['createdAt', 'updatedAt'])
          if (Object.hasOwn(logicalDates, key)) data[key] = logicalDates[key];
          else delete data[key];
      }
      if (storage.relations.present) {
        data.relations = [];
        for (let page = 0; page < storage.relations.pages; page++) {
          const segment = await openBookLoreRelationPage(tx, opened, page),
            values = await body(tx, c, opened.id, segment.pointer, budget);
          if (!Array.isArray(values) || values.length !== segment.count) loreChanged();
          data.relations.push(...values);
        }
        if (data.relations.length !== storage.relations.count) loreChanged();
      } else delete data.relations;
      if (
        Object.hasOwn(opened.value, 'isPublic') &&
        (!Object.hasOwn(data, 'isPublic') || data.isPublic !== opened.value.isPublic)
      )
        loreChanged();
    }
    validateBookBackupJSONItem(
      'book-lore',
      {
        schemaVersion: 1,
        kind: 'lore',
        parentId: null,
        id: opened.id,
        data,
      },
      c.bookId,
    );
    data = projectBookBackupResource('lore', data);
    return {
      data,
      mode: opened.mode,
      origin: bookLoreLogicalOrigin(
        snapshot,
        opened.mode === 'payload' ? opened.storage : opened.data,
      ),
    };
  } catch (error) {
    if (
      error instanceof BookBackupFormatError ||
      (error instanceof GenerationError && error.code !== 'resource-exhausted')
    )
      loreChanged();
    throw error;
  }
}
