import { digest } from './sceneContracts.mjs';
import {
  bornEqual,
  closed,
  inconsistent,
  integer,
  sum,
  chunkId,
  restoreHash,
  restoreId,
  bookRestoreArtifactBalance,
  validateBookRestoreLoreStaging,
} from './bookRestoreUploadContracts.mjs';
import { readBookRestoreArtifact } from './bookRestoreArtifacts.mjs';
import { loreFieldPointer, BOOK_LORE_GENERATION_FIELDS } from './bookLoreGenerationContracts.mjs';

const stream = 'restore-lore-stream',
  families = [
    {
      kind: 'payload-chunk',
      collection: 'bookResourceChunks',
      step: 'chunks',
      stages: [stream + '/fragment', stream + '/packed'],
    },
    {
      kind: 'payload-body',
      collection: 'bookResourceBodies',
      step: 'bodies',
      stages: [
        stream + '/node',
        stream + '/control',
        'restore-lore-generation',
        'restore-lore-reconcile',
      ],
    },
  ];
const same = (a, b) => digest(a) === digest(b);
function stage(artifact, loaded, family) {
  const v = artifact.value,
    kind = v.stageKind;
  if (!Object.hasOwn(v, 'stageKind')) return false;
  if (
    !family.stages.includes(kind) ||
    v.schemaVersion !== 1 ||
    v.ownerId !== loaded.job.ownerId ||
    v.bookId !== loaded.job.bookId
  )
    inconsistent();
  const id = artifact.snapshot.id;
  if (kind.startsWith(stream + '/')) {
    restoreHash(v.streamId);
    const type = kind.slice(stream.length + 1),
      keys = {
        fragment: ['bodyId', 'index', 'offset', 'bytes'],
        packed: ['bodyId', 'index', 'closed', 'bytes'],
        node: ['level', 'index', 'hash'],
        control: ['progress'],
      }[type];
    closed(v, ['schemaVersion', 'stageKind', 'ownerId', 'bookId', 'streamId', ...keys]);
    if (type === 'fragment' || type === 'packed') {
      integer(v.index);
      const bodyId = digest([stream, v.streamId, type === 'fragment' ? 'fragments' : 'packed']);
      if (
        v.bodyId !== bodyId ||
        id !== bodyId + ':' + chunkId(v.index) ||
        !(v.bytes instanceof Uint8Array) ||
        v.bytes.length > (type === 'fragment' ? 81920 : 65536)
      )
        inconsistent();
      if (type === 'fragment') {
        integer(v.offset);
        if (!bornEqual(artifact.snapshot, { createTime: artifact.snapshot.updateTime }))
          inconsistent();
      } else if (v.closed !== true) inconsistent();
    } else if (type === 'node') {
      integer(v.level);
      integer(v.index);
      restoreHash(v.hash);
      if (
        v.level > 48 ||
        id !== digest([stream, v.streamId, 'node', v.level, v.index]) ||
        !bornEqual(artifact.snapshot, { createTime: artifact.snapshot.updateTime })
      )
        inconsistent();
    } else {
      if (id !== digest([stream, v.streamId, 'control']) || v.progress?.phase !== 'done')
        inconsistent();
      const pointer = loreFieldPointer(v.progress.pointer);
      if (
        !same(v.progress.manifest, pointer.manifest) ||
        v.progress.emitIndex !== pointer.manifest.chunkCount ||
        v.progress.verifyIndex !== pointer.manifest.chunkCount ||
        v.progress.summary?.contentHash !== pointer.manifest.contentHash ||
        v.progress.summary?.byteLength !== pointer.manifest.byteLength
      )
        inconsistent();
    }
  } else {
    if (
      v.jobToken !== loaded.view.jobToken ||
      !/^restore-[a-f0-9]{64}$/.test(v.entityId) ||
      v.phase !== 'done' ||
      v.fieldIndex !== BOOK_LORE_GENERATION_FIELDS.length
    )
      inconsistent();
    restoreHash(v.sourceToken);
    integer(v.page);
    if (kind === 'restore-lore-generation') {
      closed(v, [
        'schemaVersion',
        'stageKind',
        'ownerId',
        'bookId',
        'jobToken',
        'entityId',
        'sourceToken',
        'generationId',
        'phase',
        'fieldIndex',
        'fields',
        'page',
        'relationSource',
        'sealOperationId',
      ]);
      const operationId = artifact.journal.data().createdByOperationId;
      restoreId(operationId);
      restoreId(v.sealOperationId);
      if (
        id !== digest([kind, loaded.view.jobToken, v.entityId, operationId]) ||
        v.generationId !==
          digest({
            domain: 'book-lore-payload',
            jobToken: loaded.view.jobToken,
            entityId: v.entityId,
            operationId,
          })
      )
        inconsistent();
    } else {
      closed(v, [
        'schemaVersion',
        'stageKind',
        'ownerId',
        'bookId',
        'jobToken',
        'entityId',
        'sourceToken',
        'headToken',
        'phase',
        'fieldIndex',
        'page',
        'cursor',
        'relationSource',
      ]);
      restoreHash(v.headToken);
      if (
        v.cursor !== null ||
        id !== digest([kind, loaded.view.jobToken, v.sourceToken, v.entityId])
      )
        inconsistent();
    }
  }
  return true;
}
/** Scan journals so a missing/recreated target cannot disappear from the retirement audit. */
export async function prepareBookRestoreLoreStagingDrain(tx, db, loaded, preparation) {
  if (loaded.job.payloadInventoryVersion !== 1) {
    if (Object.hasOwn(preparation, 'loreStaging')) inconsistent();
    return { remove: [], complete: true };
  }
  if (
    loaded.job.state !== 'content-verified' ||
    preparation.phase !== 'resource-counts' ||
    preparation.counts.step !== 'finish' ||
    loaded.job.cleanupVersion < 8
  )
    inconsistent();
  if (!Object.hasOwn(preparation, 'loreStaging')) {
    preparation.loreStaging = { schemaVersion: 1, step: 'chunks', after: null, scanned: 0 };
    preparation.retiredArtifacts = 0;
  }
  const p = validateBookRestoreLoreStaging(preparation.loreStaging);
  if (p.step === 'done') return { remove: [], complete: true };
  const checking = p.step.startsWith('check-'),
    family = families.find((v) => v.step === (checking ? p.step.slice(6) : p.step)),
    remove = [];
  if (checking) {
    let query = db
      .collection('books/' + loaded.job.bookId + '/' + family.collection)
      .orderBy('__name__')
      .select('stageKind')
      .limit(8);
    if (p.after !== null) query = query.startAfter(p.after);
    const page = await tx.get(query);
    for (const snapshot of page.docs) {
      if (Object.hasOwn(snapshot.data(), 'stageKind')) inconsistent();
      p.after = snapshot.id;
      p.scanned = sum(p.scanned, 1);
    }
    if (!page.docs.length) {
      p.step = p.step === 'check-chunks' ? 'check-bodies' : 'done';
      p.after = null;
    }
    bookRestoreArtifactBalance(preparation);
    return { remove, complete: p.step === 'done' };
  }
  let query = db
    .collection(loaded.ref.path + '/materializationArtifacts')
    .where('kind', '==', family.kind)
    .orderBy('__name__')
    .select('kind', 'id')
    .limit(8);
  if (p.after !== null) query = query.startAfter(p.after);
  const page = await tx.get(query);
  for (const snapshot of page.docs) {
    const v = snapshot.data();
    if (v.kind !== family.kind || snapshot.id !== digest([v.kind, v.id])) inconsistent();
    const artifact = await readBookRestoreArtifact(tx, db, loaded, v.kind, v.id);
    if (stage(artifact, loaded, family)) {
      remove.push(artifact.ref, artifact.journal.ref);
      preparation.retiredArtifacts = sum(preparation.retiredArtifacts, 1);
    }
    p.after = snapshot.id;
    p.scanned = sum(p.scanned, 1);
  }
  if (!page.docs.length) {
    p.step = p.step === 'chunks' ? 'bodies' : 'check-chunks';
    p.after = null;
  }
  bookRestoreArtifactBalance(preparation);
  return { remove, complete: p.step === 'done' };
}
