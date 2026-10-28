import { readWorkMetadata } from './workProgressContracts.mjs';
import { inconsistent, sum } from './adventureRestoreContracts.mjs';
import {
  readAdventureStageJournal,
  readAdventureStageArtifact,
  ADVENTURE_STAGE_ARTIFACT_FIELDS,
} from './adventureRestoreArtifacts.mjs';
import {
  archivePage,
  archiveArtifactFields,
  archiveChunkFields,
  archiveStateFields,
  readArchiveArtifact,
  readArchiveChunkPair,
  readArchiveIndex,
  readArchiveValidationState,
} from './adventureRestoreArchiveRead.mjs';
import { ARCHIVE_NAMES, archiveLimits } from './adventureRestoreArchiveContracts.mjs';
export async function prepareAdventureRestoreArchiveUnit(store, tx, l, p) {
  const remove = [],
    limits = archiveLimits(l);
  const move = (phase) => {
    p.phase = phase;
    p.after = null;
  };
  const increment = (key, n = 1) => {
    p.removed[key] = sum(p.removed[key], n);
    if (p.removed[key] > limits[key]) inconsistent();
  };
  const empty = async (name) => {
    if ((await tx.get(archivePage(store, l, name, null, [], 1))).docs.length) inconsistent();
  };
  if (p.phase === 'journals') {
    const rows = await tx.get(
      archivePage(store, l, 'stagingArtifacts', p.after, ADVENTURE_STAGE_ARTIFACT_FIELDS),
    );
    for (const snap of rows.docs) {
      const journal = await readAdventureStageJournal(store, tx, l, snap);
      if (journal.address.scope === 'job') {
        const target = await readAdventureStageArtifact(store, tx, l, snap);
        if (!target.targetRef.path.startsWith(l.ref.path + '/preparedRoot/')) inconsistent();
        remove.push(target.targetRef);
        increment('privateArtifacts');
      }
      remove.push(snap.ref);
      increment('journals');
      p.after = snap.id;
    }
    if (!rows.docs.length) {
      if (p.removed.journals !== limits.journals) inconsistent();
      move('prepared-root');
    }
  } else if (p.phase === 'prepared-root') {
    await empty('preparedRoot');
    move('chunks');
  } else if (p.phase === 'chunks') {
    const rows = await tx.get(archivePage(store, l, 'chunks', p.after, archiveChunkFields));
    for (const snap of rows.docs) {
      const pair = await readArchiveChunkPair(store, tx, l, snap, p.removed.chunks);
      remove.push(snap.ref, pair.proof.ref);
      increment('chunks');
      increment('proofs');
      increment('bytes', pair.byteLength);
      p.after = snap.id;
    }
    if (!rows.docs.length) {
      if (['chunks', 'bytes', 'proofs'].some((k) => p.removed[k] !== limits[k])) inconsistent();
      move('proofs');
    }
  } else if (p.phase === 'proofs') {
    await empty('integrityProofs');
    move('integrity-states');
  } else if (p.phase === 'integrity-states') {
    const rows = await tx.get(
      archivePage(store, l, 'integrityStates', p.after, [
        ...archiveArtifactFields,
        'checkpoint',
        'checkedChunks',
        'checkedBytes',
        'chainHash',
      ]),
    );
    for (const snap of rows.docs) {
      const { value: v, receipt } = await readArchiveArtifact(
        store,
        tx,
        l,
        'integrityStates',
        snap,
        'advanceAdventureRestoreIntegrity',
      );
      if (
        snap.id !== v.createdByOperationId ||
        v.checkpoint !== receipt.checkpoint ||
        v.checkedChunks !== receipt.checkedChunks ||
        v.checkedBytes !== receipt.checkedBytes ||
        v.checkedChunks >= l.job.checkedChunks
      )
        inconsistent();
      remove.push(snap.ref);
      increment('integrityStates');
      p.after = snap.id;
    }
    if (!rows.docs.length) {
      if (p.removed.integrityStates !== limits.integrityStates) inconsistent();
      move('validation-index');
    }
  } else if (['validation-index', 'validation-items'].includes(p.phase)) {
    const isIndex = p.phase === 'validation-index',
      name = isIndex ? 'validationIndex' : 'validationItems',
      key = isIndex ? 'index' : 'items',
      rows = await tx.get(
        archivePage(store, l, name, p.after, [
          ...archiveArtifactFields,
          ...(isIndex ? ['key', 'sourceItemIndex'] : ['index']),
        ]),
      );
    for (const snap of rows.docs) {
      await readArchiveIndex(store, tx, l, snap, name);
      if (!isIndex && snap.data().index !== p.removed.items) inconsistent();
      remove.push(snap.ref);
      increment(key);
      p.after = snap.id;
    }
    if (!rows.docs.length) {
      if (p.removed[key] !== limits[key]) inconsistent();
      move(isIndex ? 'validation-items' : 'validation-state');
    }
  } else if (p.phase === 'validation-state') {
    const rows = await tx.get(
      archivePage(store, l, 'validationState', null, archiveStateFields, 2),
    );
    if (rows.docs.length !== limits.validationStates) inconsistent();
    for (const snap of rows.docs) {
      await readArchiveValidationState(store, tx, l, snap);
      remove.push(snap.ref);
      increment('validationStates');
    }
    move('verify');
  } else if (p.phase === 'verify') {
    for (const name of ARCHIVE_NAMES) await empty(name);
    const key = store.db
      .collection('users/' + l.uid + '/adventureRestoreRecoveryKeys')
      .where('restoreId', '==', l.id)
      .select()
      .limit(1);
    if (
      (await tx.get(key)).docs.length ||
      (
        await readWorkMetadata(
          tx,
          store.db.doc('users/' + l.uid + '/adventureRestoreRecoveryKeys/' + l.id),
          ['restoreId'],
        )
      ).exists
    )
      inconsistent();
    move('done');
  } else inconsistent();
  const unique = new Set();
  for (const ref of remove) {
    const relative = ref.path.slice(l.ref.path.length + 1),
      pieces = relative.split('/');
    if (
      !ref.path.startsWith(l.ref.path + '/') ||
      pieces.length !== 2 ||
      !ARCHIVE_NAMES.includes(pieces[0]) ||
      unique.has(ref.path)
    )
      inconsistent();
    unique.add(ref.path);
  }
  return remove;
}
