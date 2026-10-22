import { digest } from './sceneContracts.mjs';
import {
  inconsistent,
  closed,
  bornEqual,
  restoreId,
  integer,
  sum,
} from './bookRestoreUploadContracts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { validationContext } from './bookRestoreValidationStore.mjs';

export const BOOK_RESTORE_NATIVE_V4 = Object.freeze({
  act: 'acts',
  chapter: 'chapters',
  'work-control': 'workProgress',
  'word-group': 'workWordGroups',
  'word-source': 'workWordSources',
});
const journalPath = (loaded) => loaded.ref.path + '/materializationArtifacts';
const context = (loaded) => ({
  schemaVersion: 1,
  ownerId: loaded.job.ownerId,
  restoreId: loaded.job.restoreId,
  jobToken: loaded.view.jobToken,
});
function address(db, loaded, kind, id) {
  if (!Object.hasOwn(BOOK_RESTORE_NATIVE_V4, kind)) inconsistent();
  if (
    kind === 'work-control'
      ? id !== 'current'
      : ['act', 'chapter'].includes(kind)
        ? !/^restore-[a-f0-9]{64}$/.test(id)
        : !/^[a-f0-9]{64}$/.test(id)
  )
    inconsistent();
  return {
    ref: db.doc('books/' + loaded.job.bookId + '/' + BOOK_RESTORE_NATIVE_V4[kind] + '/' + id),
    journal: db.doc(journalPath(loaded) + '/' + digest([kind, id])),
  };
}
async function receipt(tx, db, loaded, id) {
  restoreId(id);
  const snapshot = await tx.get(
      db.doc('users/' + loaded.job.ownerId + '/bookRestoreOperations/' + id),
    ),
    value = snapshot.data();
  if (
    !value ||
    value.ownerId !== loaded.job.ownerId ||
    value.restoreId !== loaded.job.restoreId ||
    value.jobToken !== loaded.view.jobToken ||
    value.receipt?.action !== 'advanceBookRestoreStructure' ||
    value.receipt.operationId !== id ||
    value.receipt.checkpoint > loaded.job.checkpoint ||
    !bornEqual(snapshot, { createTime: snapshot.updateTime })
  )
    inconsistent();
  return snapshot;
}
async function authentic(tx, db, loaded, snapshot, target) {
  const data = snapshot.data();
  validationContext(data, loaded);
  closed(data, [
    'schemaVersion',
    'ownerId',
    'restoreId',
    'jobToken',
    'kind',
    'id',
    'createdByOperationId',
    'lastOperationId',
  ]);
  const expected = address(db, loaded, data.kind, data.id);
  if (
    expected.journal.path !== snapshot.ref.path ||
    expected.ref.path !== target.ref.path ||
    !target.exists
  )
    inconsistent();
  const first = await receipt(tx, db, loaded, data.createdByOperationId),
    last =
      data.lastOperationId === data.createdByOperationId
        ? first
        : await receipt(tx, db, loaded, data.lastOperationId);
  if (
    !bornEqual(snapshot, target) ||
    !bornEqual(snapshot, first) ||
    !bornEqual({ createTime: snapshot.updateTime }, { createTime: target.updateTime }) ||
    !bornEqual({ createTime: snapshot.updateTime }, last)
  )
    inconsistent();
  return data;
}
/** Prepare bounded native writes; all reads finish before the caller commits anything. */
export async function prepareBookRestoreArtifacts(tx, db, loaded, operationId, writes) {
  restoreId(operationId);
  if (writes.length > 8) inconsistent();
  const effects = [],
    paths = new Set();
  let created = 0;
  for (const write of writes) {
    const at = address(db, loaded, write.kind, write.id);
    if (paths.has(at.ref.path)) inconsistent();
    paths.add(at.ref.path);
    const [snapshot, target] = await Promise.all([
      tx.get(at.journal),
      readWorkMetadata(tx, at.ref, []),
    ]);
    let first = operationId;
    if (snapshot.exists || target.exists) {
      if (!snapshot.exists || !target.exists || !write.replace) inconsistent();
      first = (await authentic(tx, db, loaded, snapshot, target)).createdByOperationId;
    } else created++;
    effects.push({
      ...at,
      exists: snapshot.exists,
      value: write.value,
      metadata: {
        ...context(loaded),
        kind: write.kind,
        id: write.id,
        createdByOperationId: first,
        lastOperationId: operationId,
      },
    });
  }
  return {
    created,
    commit() {
      for (const effect of effects) {
        if (effect.exists) {
          tx.set(effect.ref, effect.value);
          tx.set(effect.journal, effect.metadata);
        } else {
          tx.create(effect.ref, effect.value);
          tx.create(effect.journal, effect.metadata);
        }
      }
    },
  };
}
export async function assertBookRestoreArtifactsEmpty(tx, db, loaded) {
  const journal = await tx.get(db.collection(journalPath(loaded)).select('schemaVersion').limit(1));
  if (journal.docs.length) inconsistent();
  for (const name of Object.values(BOOK_RESTORE_NATIVE_V4)) {
    const page = await tx.get(
      db
        .collection('books/' + loaded.job.bookId + '/' + name)
        .select('id')
        .limit(1),
    );
    if (page.docs.length) inconsistent();
  }
}
export async function prepareBookRestoreArtifactsCleanup(tx, db, loaded, limit) {
  if (loaded.job.cleanupVersion !== 4 || loaded.job.cleanupPhase !== 'artifacts') inconsistent();
  const page = await tx.get(
      db
        .collection(journalPath(loaded))
        .select(
          'schemaVersion',
          'ownerId',
          'restoreId',
          'jobToken',
          'kind',
          'id',
          'createdByOperationId',
          'lastOperationId',
        )
        .orderBy('__name__')
        .limit(limit + 1),
    ),
    selected = page.docs.slice(0, limit),
    remove = [];
  for (const snapshot of selected) {
    const data = snapshot.data(),
      at = address(db, loaded, data?.kind, data?.id),
      target = await readWorkMetadata(tx, at.ref, []);
    await authentic(tx, db, loaded, snapshot, target);
    remove.push(target.ref, snapshot.ref);
  }
  const preparation = structuredClone(loaded.job.preparation);
  preparation.cleanedArtifacts = sum(preparation.cleanedArtifacts, selected.length);
  if (preparation.cleanedArtifacts > preparation.artifactCount) inconsistent();
  // Certify emptiness in a separate zero-delete unit: transactional queries cannot see staged deletes.
  if (selected.length === 0) {
    if (preparation.cleanedArtifacts !== preparation.artifactCount) inconsistent();
    await assertBookRestoreArtifactsEmpty(tx, db, loaded);
  }
  integer(limit, 1);
  return {
    remove,
    patch: {
      preparation,
      state: 'cancelling',
      cleanupPhase: selected.length === 0 ? 'chunks' : 'artifacts',
    },
  };
}
