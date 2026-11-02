import { adventureImportDb } from './adventureImportDb.mjs';
import { indexedLoreArchive, indexedLoreData } from './bookLoreContentFixture.mjs';
import { uploadArchiveRestore } from './bookRestoreContentFixture.mjs';
import { finishLegacyRestore, legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
import { finishRestoreStructure } from './bookRestoreStructureFixture.mjs';
import { createBookRestoreUploadService } from '../../src/bookRestoreUpload.mjs';
import { progress, integrityProgress, requestHash } from '../../src/bookRestoreUploadContracts.mjs';
import { digest } from '../../src/sceneContracts.mjs';
import {
  prepareBookRestoreArtifacts,
  assertBookRestorePayloadNamespacesEmpty,
} from '../../src/bookRestoreArtifacts.mjs';
import { prepareBookRestoreStreamBody } from '../../src/bookRestoreStreamBody.mjs';
/** Native coordinator harness, not the production advanceLore integration. */
export async function streamBodyFixture(
  value,
  { field = 'details', db: supplied = null, fragmentLimit = 65536 } = {},
) {
  const fake = supplied ? null : adventureImportDb({ nativeUpdates: true }),
    db = supplied ?? fake.db,
    uid = 'author',
    id = 'restore-stream-body-0001',
    path = 'users/' + uid + '/bookRestores/' + id,
    ref = db.doc(path),
    factory = () => createBookRestoreUploadService({ db, now: () => 1000 }),
    data = { ...indexedLoreData({ count: 0 }), [field]: value },
    uploaded = await uploadArchiveRestore(factory(), uid, id, indexedLoreArchive(data)),
    validated = await finishLegacyRestore(factory, uid, id, uploaded.progress);
  let view = await finishRestoreStructure(factory, uid, id, validated),
    controlId = null,
    serial = 0;
  const pointer = (
      await db
        .collection(path + '/validationItems')
        .where('record.kind', '==', 'book-lore')
        .limit(1)
        .get()
    ).docs[0],
    reader = await factory().openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: view.jobToken,
    }),
    lore = await reader.openMappedIndexedLore(pointer.data().index),
    generationOperationId = id + '-enroll-0001';
  function receipt(tx, request, job, token) {
    tx.create(db.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId), {
      schemaVersion: 1,
      ownerId: uid,
      restoreId: id,
      jobToken: token,
      fingerprint: requestHash('advanceBookRestoreLore', request),
      receipt: {
        schemaVersion: 1,
        operationId: request.operationId,
        action: 'advanceBookRestoreLore',
        expectedCheckpoint: request.expectedCheckpoint,
        checkpoint: job.checkpoint,
        state: job.state,
        sequence: null,
        uploadedChunks: job.uploadedChunks,
        uploadedBytes: job.uploadedBytes,
        cleanedChunks: job.cleanedChunks,
        integrity: integrityProgress(job),
        validation: job.validationMeta,
        preparation: job.preparation,
      },
    });
  }
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref),
      job = snapshot.data(),
      loaded = { ref, snapshot, job, view: progress(uid, id, snapshot) };
    await assertBookRestorePayloadNamespacesEmpty(tx, db, loaded);
    const preparation = {
        ...job.preparation,
        schemaVersion: 2,
        loreCount: 0,
        loreRelationCount: 0,
        relationOffset: 0,
        loreItemIndex: job.preparation.itemIndex,
        lorePayload: {
          schemaVersion: 1,
          entityId: lore.id,
          generationOperationId,
          generationId: digest({
            domain: 'book-lore-payload',
            jobToken: view.jobToken,
            entityId: lore.id,
            operationId: generationOperationId,
          }),
          base: null,
          pages: 0,
          sealOperationId: null,
          segment: null,
        },
      },
      next = {
        ...job,
        cleanupVersion: 6,
        payloadInventoryVersion: 1,
        preparation,
        checkpoint: job.checkpoint + 1,
        updatedAt: job.updatedAt + 1,
      },
      request = mutation(id, view, generationOperationId);
    tx.update(ref, next);
    receipt(tx, request, next, view.jobToken);
  });
  view = await factory().getBookRestore(uid, { restoreId: id, jobToken: view.jobToken });
  const input = {
    entityId: lore.id,
    generationOperationId,
    sourceToken: lore.sourceToken,
    target: field === 'relations' ? { field, page: 0, count: value.length } : { field },
    timestamp: view.preparation.timestamp,
  };
  async function state() {
    if (controlId === null) return null;
    const snapshot = await db
      .doc('books/' + view.bookId + '/bookResourceBodies/' + controlId)
      .get();
    return snapshot.exists ? snapshot.data().progress : null;
  }
  async function step({
    mutate = null,
    duringPrepare = null,
    request: suppliedRequest = null,
  } = {}) {
    view = await factory().getBookRestore(uid, { restoreId: id, jobToken: view.jobToken });
    const before = await state(),
      request = suppliedRequest ?? mutation(id, view, id + '-body-' + serial++);
    let unit = null;
    if (!before || before.phase === 'stage') {
      const fresh = await factory().openVerifiedBookRestoreContent(uid, {
          restoreId: id,
          jobToken: view.jobToken,
        }),
        mapped = await fresh.openMappedIndexedLore(pointer.data().index);
      unit = await mapped.readField(field, {
        cursor: before?.cursor ?? null,
        limit: fragmentLimit,
      });
      if (mutate) await mutate(unit);
    }
    const result = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref),
        job = snapshot.data(),
        loaded = { ref, snapshot, job, view: progress(uid, id, snapshot) };
      const pending = prepareBookRestoreStreamBody(tx, db, loaded, request, input, unit);
      duringPrepare?.(unit, request);
      const plan = await pending,
        effects = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          plan.writes,
        );
      const next = {
        ...job,
        preparation: {
          ...job.preparation,
          artifactCount: job.preparation.artifactCount + effects.created,
        },
        checkpoint: job.checkpoint + 1,
        updatedAt: job.updatedAt + 1,
      };
      effects.commit();
      tx.update(ref, next);
      receipt(tx, request, next, view.jobToken);
      return plan;
    });
    controlId = result.controlId;
    view = await factory().getBookRestore(uid, { restoreId: id, jobToken: view.jobToken });
    return result;
  }
  return {
    ...fake,
    db,
    uid,
    id,
    path,
    factory,
    input,
    field,
    value,
    step,
    state,
    get view() {
      return view;
    },
    async finish(onStep = () => {}) {
      for (let i = 0; i < 20000; i++) {
        const result = await step();
        await onStep(result, i);
        if (result.pointer) return result;
      }
      throw Error('Stream body did not complete');
    },
  };
}
