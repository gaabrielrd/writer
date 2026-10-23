import { digest } from './sceneContracts.mjs';
import {
  BOOK_RESTORE_RESOURCE_FLAT,
  BOOK_RESTORE_RESOURCE_CHILDREN,
  BOOK_RESTORE_RESOURCE_TYPES,
  bookRestoreResourcePath,
  bookRestoreParentCollections,
} from './bookRestoreResourcePaths.mjs';
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
function address(db, loaded, kind, id, version = loaded.job.cleanupVersion) {
  if (version >= 13 && kind === 'cover-storage') {
    if (id !== 'current') inconsistent();
    return {
      ref: db.doc(loaded.ref.path + '/preparedCoverStorage/current'),
      journal: db.doc(journalPath(loaded) + '/' + digest([kind, id])),
    };
  }
  if (version >= 12 && ['cover-definition', 'cover-chunk'].includes(kind)) {
    if (
      kind === 'cover-definition'
        ? id !== 'current'
        : typeof id !== 'string' || !/^[0-9]{15}$/.test(id) || Number(id) >= 256
    )
      inconsistent();
    return {
      ref: db.doc(
        loaded.ref.path +
          '/' +
          (kind === 'cover-definition' ? 'preparedCovers' : 'preparedCoverChunks') +
          '/' +
          id,
      ),
      journal: db.doc(journalPath(loaded) + '/' + digest([kind, id])),
    };
  }
  if (version >= 11 && kind === 'draft-definition') {
    if (id !== 'current') inconsistent();
    return {
      ref: db.doc(loaded.ref.path + '/preparedDrafts/current'),
      journal: db.doc(journalPath(loaded) + '/' + digest([kind, id])),
    };
  }
  if (version >= 10 && ['history-version', 'history-body'].includes(kind)) {
    if (
      typeof id !== 'string' ||
      !(kind === 'history-version' ? /^restore-[a-f0-9]{64}$/ : /^[a-f0-9]{64}$/).test(id)
    )
      inconsistent();
    return {
      ref: db.doc(
        'books/' +
          loaded.job.bookId +
          '/' +
          (kind === 'history-version' ? 'workVersions' : 'workVersionBodies') +
          '/' +
          id,
      ),
      journal: db.doc(journalPath(loaded) + '/' + digest([kind, id])),
    };
  }
  if (version >= 9 && ['persona-definition', 'persona-binding'].includes(kind)) {
    if (
      typeof id !== 'string' ||
      !(kind === 'persona-definition' ? /^custom-[a-f0-9]{64}$/ : /^[a-f0-9]{64}$/).test(id)
    )
      inconsistent();
    return {
      ref: db.doc(
        loaded.ref.path +
          '/' +
          (kind === 'persona-definition' ? 'preparedPersonas' : 'personaBindings') +
          '/' +
          id,
      ),
      journal: db.doc(journalPath(loaded) + '/' + digest([kind, id])),
    };
  }
  if (version >= 8 && kind === 'entity-index-control') {
    if (id !== 'entity-scenes') inconsistent();
    return {
      ref: db.doc('books/' + loaded.job.bookId + '/narrativeControls/entity-scenes'),
      journal: db.doc(journalPath(loaded) + '/' + digest([kind, id])),
    };
  }
  if (version >= 7) {
    const suffix = bookRestoreResourcePath(kind, id);
    if (suffix)
      return {
        ref: db.doc('books/' + loaded.job.bookId + '/' + suffix),
        journal: db.doc(journalPath(loaded) + '/' + digest([kind, id])),
      };
  }
  if (version >= 5 && ['text-body', 'text-chunk'].includes(kind)) {
    const match = typeof id === 'string' && /^([a-f0-9]{64})(?::([0-9]{15}))?$/.exec(id);
    if (
      !match ||
      (kind === 'text-chunk') !== Boolean(match[2]) ||
      (match[2] && Number(match[2]) >= 128)
    )
      inconsistent();
    return {
      ref: db.doc(
        'books/' +
          loaded.job.bookId +
          '/bookTextBodies/' +
          match[1] +
          (match[2] ? '/chunks/' + match[2] : ''),
      ),
      journal: db.doc(journalPath(loaded) + '/' + digest([kind, id])),
    };
  }
  if (version >= 6 && kind === 'lore') {
    if (typeof id !== 'string' || !/^restore-[a-f0-9]{64}$/.test(id)) inconsistent();
    return {
      ref: db.doc('books/' + loaded.job.bookId + '/lore/' + id),
      journal: db.doc(journalPath(loaded) + '/' + digest([kind, id])),
    };
  }
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
    ![
      'advanceBookRestoreStructure',
      ...(loaded.job.cleanupVersion >= 6 ? ['advanceBookRestoreLore'] : []),
      ...(loaded.job.cleanupVersion >= 7 ? ['advanceBookRestoreResources'] : []),
      ...(loaded.job.cleanupVersion >= 8 ? ['advanceBookRestoreCounts'] : []),
      ...(loaded.job.cleanupVersion >= 9 ? ['advanceBookRestorePersonas'] : []),
      ...(loaded.job.cleanupVersion >= 10 ? ['advanceBookRestoreHistory'] : []),
      ...(loaded.job.cleanupVersion >= 12 ? ['advanceBookRestoreCover'] : []),
      ...(loaded.job.cleanupVersion >= 13
        ? ['reserveBookRestoreCover', 'materializeBookRestoreCover', 'advanceBookRestoreCleanup']
        : []),
      ...(loaded.job.cleanupVersion >= 11
        ? ['advanceBookRestoreDraft', 'finalizeBookRestoreDraft']
        : []),
    ].includes(value.receipt?.action) ||
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
export async function prepareBookRestoreArtifacts(
  tx,
  db,
  loaded,
  operationId,
  writes,
  version = loaded.job.cleanupVersion,
) {
  restoreId(operationId);
  if (
    ![4, 5, 6, 7, 8, 9, 10, 11, 12, 13].includes(version) ||
    writes.length > (version >= 5 ? 136 : 8)
  )
    inconsistent();
  const effects = [],
    paths = new Set();
  let created = 0;
  for (const write of writes) {
    const at = address(db, loaded, write.kind, write.id, version);
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
      if (version >= 8) {
        const current = await tx.get(at.ref);
        if (digest(current.data()) === digest(write.value)) continue;
      }
      if (
        version >= 7 &&
        [
          'scene-reference',
          'scene-lore-link',
          'narrative-link',
          ...(version >= 9 ? ['persona-definition', 'persona-binding'] : []),
        ].includes(write.kind)
      ) {
        // Firestore preserves native updateTime on a no-op. Keep both artifact and journal unchanged.
        const existing = await tx.get(at.ref);
        if (digest(existing.data()) !== digest(write.value)) inconsistent();
        continue;
      }
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
export async function assertBookRestoreArtifactsEmpty(
  tx,
  db,
  loaded,
  version = loaded.job.cleanupVersion,
) {
  const journal = await tx.get(db.collection(journalPath(loaded)).select('schemaVersion').limit(1));
  if (journal.docs.length) inconsistent();
  if (version >= 9) await assertBookRestorePersonaNamespacesEmpty(tx, db, loaded);
  if (version >= 11) await assertBookRestoreDraftNamespaceEmpty(tx, db, loaded);
  if (version >= 12) await assertBookRestoreCoverNamespacesEmpty(tx, db, loaded);
  if (version >= 13) await assertBookRestoreCoverStorageNamespaceEmpty(tx, db, loaded);
  for (const name of [
    ...Object.values(BOOK_RESTORE_NATIVE_V4),
    ...(version >= 5 ? ['bookTextBodies'] : []),
    ...(version >= 6 ? ['lore'] : []),
    ...(version >= 7 ? Object.values(BOOK_RESTORE_RESOURCE_FLAT) : []),
    ...(version >= 10 ? ['workVersions', 'workVersionBodies'] : []),
  ]) {
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
  if (
    ![4, 5, 6, 7, 8, 9, 10, 11, 12, 13].includes(loaded.job.cleanupVersion) ||
    loaded.job.cleanupPhase !== 'artifacts'
  )
    inconsistent();
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
    const data = snapshot.data();
    if (
      ['text-body', 'text-chunk'].includes(data?.kind) ||
      Object.hasOwn(BOOK_RESTORE_RESOURCE_CHILDREN, data?.kind)
    )
      inconsistent();
    const at = address(db, loaded, data?.kind, data?.id),
      target = await readWorkMetadata(tx, at.ref, []);
    await authentic(tx, db, loaded, snapshot, target);
    for (const name of bookRestoreParentCollections(data.kind)) {
      const children = await tx.get(
        db
          .collection(target.ref.path + '/' + name)
          .select()
          .limit(1),
      );
      if (children.docs.length) inconsistent();
    }
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

export async function assertBookRestoreBodyNamespaceEmpty(tx, db, loaded) {
  const bodies = await tx.get(
      db
        .collection('books/' + loaded.job.bookId + '/bookTextBodies')
        .select()
        .limit(1),
    ),
    journals = await tx.get(
      db
        .collection(journalPath(loaded))
        .where('kind', 'in', ['text-body', 'text-chunk'])
        .select('kind')
        .limit(1),
    );
  if (bodies.docs.length || journals.docs.length) inconsistent();
}
export async function prepareBookRestoreBodyArtifactsCleanup(tx, db, loaded, limit) {
  if (
    ![5, 6, 7, 8, 9, 10, 11, 12, 13].includes(loaded.job.cleanupVersion) ||
    loaded.job.cleanupPhase !== 'body-artifacts'
  )
    inconsistent();
  integer(limit, 1);
  const bodies = await tx.get(
      db
        .collection('books/' + loaded.job.bookId + '/bookTextBodies')
        .orderBy('__name__')
        .select()
        .limit(1),
    ),
    remove = [];
  let count = 0,
    phase = 'body-artifacts';
  if (!bodies.docs.length) {
    await assertBookRestoreBodyNamespaceEmpty(tx, db, loaded);
    phase = 'artifacts';
  } else {
    const body = bodies.docs[0],
      at = address(db, loaded, 'text-body', body.id),
      journal = await tx.get(at.journal);
    await authentic(tx, db, loaded, journal, body);
    const children = await tx.get(
      db
        .collection(body.ref.path + '/chunks')
        .orderBy('__name__')
        .select()
        .limit(limit + 1),
    );
    if (children.docs.length) {
      for (const child of children.docs.slice(0, limit)) {
        const key = body.id + ':' + child.id,
          part = address(db, loaded, 'text-chunk', key),
          metadata = await tx.get(part.journal);
        await authentic(tx, db, loaded, metadata, child);
        remove.push(child.ref, part.journal);
        count++;
      }
    } else {
      remove.push(body.ref, at.journal);
      count++;
    }
  }
  const preparation = structuredClone(loaded.job.preparation);
  preparation.cleanedArtifacts = sum(preparation.cleanedArtifacts, count);
  if (preparation.cleanedArtifacts > preparation.artifactCount) inconsistent();
  return { remove, patch: { preparation, state: 'cancelling', cleanupPhase: phase } };
}

/** Certify the new family before upgrading a job that could not previously own lore. */
export async function assertBookRestoreLoreNamespaceEmpty(tx, db, loaded) {
  const [native, journals] = await Promise.all([
    tx.get(
      db
        .collection('books/' + loaded.job.bookId + '/lore')
        .select()
        .limit(1),
    ),
    tx.get(db.collection(journalPath(loaded)).where('kind', '==', 'lore').select('kind').limit(1)),
  ]);
  if (native.docs.length || journals.docs.length) inconsistent();
}

export async function assertBookRestoreResourceNamespacesEmpty(tx, db, loaded) {
  for (const name of Object.values(BOOK_RESTORE_RESOURCE_FLAT)) {
    const page = await tx.get(
      db
        .collection('books/' + loaded.job.bookId + '/' + name)
        .select()
        .limit(1),
    );
    if (page.docs.length) inconsistent();
  }
  const journals = await tx.get(
    db
      .collection(journalPath(loaded))
      .where('kind', 'in', BOOK_RESTORE_RESOURCE_TYPES)
      .select('kind')
      .limit(1),
  );
  if (journals.docs.length) inconsistent();
}
/** Drain journaled nested children even when their parent has not been prepared yet. */
export async function prepareBookRestoreResourceChildrenCleanup(tx, db, loaded, limit) {
  if (
    ![7, 8, 9, 10, 11, 12, 13].includes(loaded.job.cleanupVersion) ||
    loaded.job.cleanupPhase !== 'resource-children'
  )
    inconsistent();
  integer(limit, 1);
  const page = await tx.get(
    db
      .collection(journalPath(loaded))
      .where('kind', 'in', Object.keys(BOOK_RESTORE_RESOURCE_CHILDREN))
      .orderBy('__name__')
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
      .limit(limit + 1),
  );
  const selected = page.docs.slice(0, limit),
    remove = [];
  for (const snapshot of selected) {
    const data = snapshot.data();
    const at = address(db, loaded, data?.kind, data?.id),
      target = await readWorkMetadata(tx, at.ref, []);
    await authentic(tx, db, loaded, snapshot, target);
    remove.push(target.ref, snapshot.ref);
  }
  const preparation = structuredClone(loaded.job.preparation);
  preparation.cleanedArtifacts = sum(preparation.cleanedArtifacts, selected.length);
  if (preparation.cleanedArtifacts > preparation.artifactCount) inconsistent();
  return {
    remove,
    patch: {
      preparation,
      state: 'cancelling',
      cleanupPhase: selected.length === 0 ? 'body-artifacts' : 'resource-children',
    },
  };
}

/** Read only artifacts born with their journal/receipt and last updated together. */
export async function readBookRestoreArtifact(tx, db, loaded, kind, id, { optional = false } = {}) {
  const at = address(db, loaded, kind, id),
    [target, journal] = await Promise.all([tx.get(at.ref), tx.get(at.journal)]);
  if (!target.exists && !journal.exists && optional) return null;
  await authentic(tx, db, loaded, journal, target);
  const observed = { createTime: target.createTime, updateTime: target.updateTime };
  return {
    ref: at.ref,
    value: target.data(),
    async verify(tx) {
      const [current, metadata] = await Promise.all([
        readWorkMetadata(tx, at.ref, []),
        tx.get(at.journal),
      ]);
      await authentic(tx, db, loaded, metadata, current);
      if (
        !bornEqual(current, observed) ||
        !bornEqual({ createTime: current.updateTime }, { createTime: observed.updateTime })
      )
        inconsistent();
    },
  };
}
export async function assertBookRestoreEntityIndexEmpty(tx, db, loaded) {
  const at = address(db, loaded, 'entity-index-control', 'entity-scenes', 8),
    [target, journal] = await Promise.all([readWorkMetadata(tx, at.ref, []), tx.get(at.journal)]);
  if (target.exists || journal.exists) inconsistent();
}

export async function assertBookRestorePersonaNamespacesEmpty(tx, db, loaded) {
  for (const name of ['preparedPersonas', 'personaBindings']) {
    const page = await tx.get(
      db
        .collection(loaded.ref.path + '/' + name)
        .select()
        .limit(1),
    );
    if (page.docs.length) inconsistent();
  }
  const journals = await tx.get(
    db
      .collection(journalPath(loaded))
      .where('kind', 'in', ['persona-definition', 'persona-binding'])
      .select('kind')
      .limit(1),
  );
  if (journals.docs.length) inconsistent();
}

/** Certify both flat history families before upgrading a job's cleanup inventory. */
export async function assertBookRestoreHistoryNamespacesEmpty(tx, db, loaded) {
  for (const name of ['workVersions', 'workVersionBodies']) {
    const page = await tx.get(
      db
        .collection('books/' + loaded.job.bookId + '/' + name)
        .select()
        .limit(1),
    );
    if (page.docs.length) inconsistent();
  }
  const journals = await tx.get(
    db
      .collection(journalPath(loaded))
      .where('kind', 'in', ['history-version', 'history-body'])
      .select('kind')
      .limit(1),
  );
  if (journals.docs.length) inconsistent();
}

export async function assertBookRestoreDraftNamespaceEmpty(tx, db, loaded) {
  const [native, journals] = await Promise.all([
    tx.get(
      db
        .collection(loaded.ref.path + '/preparedDrafts')
        .select()
        .limit(1),
    ),
    tx.get(
      db
        .collection(journalPath(loaded))
        .where('kind', '==', 'draft-definition')
        .select('kind')
        .limit(1),
    ),
  ]);
  if (native.docs.length || journals.docs.length) inconsistent();
}

export async function assertBookRestoreCoverNamespacesEmpty(tx, db, loaded) {
  for (const name of ['preparedCovers', 'preparedCoverChunks']) {
    const page = await tx.get(
      db
        .collection(loaded.ref.path + '/' + name)
        .select()
        .limit(1),
    );
    if (page.docs.length) inconsistent();
  }
  const journals = await tx.get(
    db
      .collection(journalPath(loaded))
      .where('kind', 'in', ['cover-definition', 'cover-chunk'])
      .select('kind')
      .limit(1),
  );
  if (journals.docs.length) inconsistent();
}

export async function assertBookRestoreCoverStorageNamespaceEmpty(tx, db, loaded) {
  const [native, journals] = await Promise.all([
    tx.get(
      db
        .collection(loaded.ref.path + '/preparedCoverStorage')
        .select()
        .limit(1),
    ),
    tx.get(
      db
        .collection(journalPath(loaded))
        .where('kind', '==', 'cover-storage')
        .select('kind')
        .limit(1),
    ),
  ]);
  if (native.docs.length || journals.docs.length) inconsistent();
}
