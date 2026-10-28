import {
  adventureImportMetadataFields,
  adventureImportProgress,
  adventureImportRequestHash,
} from './adventureImportContracts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import {
  adventureDeletionInconsistent as invalid,
  adventureDeletionImmutable as immutable,
  adventureDeletionSameBirth as sameBirth,
  adventureDeletionBorn as born,
  digest,
} from './adventureDeletionContracts.mjs';
const receiptFields = [
  'operationId',
  'action',
  'expectedCheckpoint',
  'checkpoint',
  'state',
  'phase',
  'index',
];
const opFields = [
  'schemaVersion',
  'ownerId',
  'importId',
  'fingerprint',
  'jobToken',
  ...receiptFields.map((k) => 'receipt.' + k),
];
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
async function originalOperation(tx, db, p, view, action, index = null) {
  let query = db
    .collection('users/' + p.ownerId + '/adventureImportOperations')
    .where('importId', '==', view.importId)
    .where('receipt.action', '==', action);
  if (index !== null) query = query.where('receipt.index', '==', index);
  const rows = await tx.get(
    query
      .select(...opFields)
      .orderBy('__name__')
      .limit(2),
  );
  if (rows.docs.length !== 1) invalid();
  const snapshot = rows.docs[0],
    v = snapshot.data(),
    r = v?.receipt;
  immutable(snapshot);
  if (
    v.schemaVersion !== 1 ||
    v.ownerId !== p.ownerId ||
    v.importId !== view.importId ||
    v.jobToken !== view.jobToken ||
    !hash(v.fingerprint) ||
    !r ||
    Object.keys(r).length !== receiptFields.length ||
    receiptFields.some((k) => !Object.hasOwn(r, k)) ||
    r.operationId !== snapshot.id ||
    r.action !== action ||
    r.index !== index ||
    !Number.isSafeInteger(r.expectedCheckpoint) ||
    r.expectedCheckpoint < 0 ||
    r.checkpoint !== r.expectedCheckpoint + 1
  )
    invalid();
  return { snapshot, value: v, receipt: r };
}
async function loadImport(tx, db, p) {
  const rows = await tx.get(
    db
      .collection('users/' + p.ownerId + '/adventureImports')
      .where('adventureId', '==', p.adventureId)
      .select(...adventureImportMetadataFields, 'startFingerprint')
      .orderBy('__name__')
      .limit(2),
  );
  if (!rows.docs.length) {
    const reserved = await readWorkMetadata(
      tx,
      db.doc('adventureImportReservations/' + p.adventureId),
      ['kind'],
    );
    if (reserved.exists && reserved.data()?.kind === 'job') invalid();
    return null;
  }
  if (rows.docs.length !== 1) invalid();
  const snapshot = rows.docs[0],
    job = snapshot.data(),
    view = adventureImportProgress(p.ownerId, snapshot.id, snapshot);
  if (view.state !== 'activated' || view.recoveryKeyReady || !hash(job.startFingerprint)) invalid();
  const reserved = await readWorkMetadata(
    tx,
    db.doc('adventureImportReservations/' + p.adventureId),
    ['schemaVersion', 'ownerId', 'importId', 'adventureId', 'startFingerprint', 'kind'],
  );
  if (!reserved.exists) invalid();
  immutable(reserved);
  const r = reserved.data();
  if (
    !sameBirth(snapshot, reserved) ||
    r.schemaVersion !== 1 ||
    r.ownerId !== p.ownerId ||
    r.importId !== view.importId ||
    r.adventureId !== p.adventureId ||
    r.kind !== 'job' ||
    r.startFingerprint !== job.startFingerprint
  )
    invalid();
  const activation = await originalOperation(tx, db, p, view, 'activateAdventureImport'),
    a = activation.receipt;
  if (
    a.state !== 'activated' ||
    a.phase !== 'complete' ||
    a.checkpoint !== view.checkpoint ||
    digest(born(activation.snapshot)) !== digest(p.sourceBirth) ||
    digest(born(snapshot, true)) !== digest(born(activation.snapshot)) ||
    activation.value.fingerprint !==
      adventureImportRequestHash('activateAdventureImport', {
        importId: view.importId,
        jobToken: view.jobToken,
        operationId: activation.snapshot.id,
        expectedCheckpoint: a.expectedCheckpoint,
      })
  )
    invalid();
  const keyRef = db.doc('users/' + p.ownerId + '/adventureImportRecoveryKeys/' + view.importId);
  if (
    (await readWorkMetadata(tx, keyRef, ['importId'])).exists ||
    (
      await tx.get(
        db
          .collection('users/' + p.ownerId + '/adventureImportRecoveryKeys')
          .where('importId', '==', view.importId)
          .select()
          .limit(1),
      )
    ).docs.length
  )
    invalid();
  return { snapshot, view };
}
/** Retire only this activated import's native section manifests, never its manuscript. */
export async function prepareAdventureDeletionImport(tx, db, p) {
  const loaded = await loadImport(tx, db, p);
  if (!loaded) {
    if (p.cursor !== null) invalid();
    return { ...p, part: 4, cursor: null };
  }
  const { view } = loaded;
  let count = 0;
  if (p.cursor !== null) {
    if (!/^[0-9]{16}$/.test(p.cursor)) invalid();
    count = Number(p.cursor) + 1;
    if (!Number.isSafeInteger(count) || count > view.uploadedSections) invalid();
  }
  const collection = db.collection(
    'users/' + p.ownerId + '/adventureImports/' + view.importId + '/sections',
  );
  let query = collection
    .select('index', 'bodyHash', 'bodyBytes', 'wordCount', 'chainHash')
    .orderBy('__name__')
    .limit(8);
  if (p.cursor !== null) query = query.startAfter(p.cursor);
  const rows = await tx.get(query);
  for (const snapshot of rows.docs) {
    const v = snapshot.data();
    immutable(snapshot);
    if (
      snapshot.id !== String(count).padStart(16, '0') ||
      v.index !== count ||
      count >= view.uploadedSections ||
      !hash(v.bodyHash) ||
      !hash(v.chainHash) ||
      !Number.isSafeInteger(v.bodyBytes) ||
      v.bodyBytes < 0 ||
      !Number.isSafeInteger(v.wordCount) ||
      v.wordCount < 0
    )
      invalid();
    const append = await originalOperation(tx, db, p, view, 'appendAdventureImportSection', count),
      expectedState = count + 1 === view.uploadedSections ? 'preparing' : 'uploading';
    if (
      !sameBirth(snapshot, append.snapshot) ||
      append.receipt.expectedCheckpoint !== count ||
      append.receipt.state !== expectedState ||
      append.receipt.phase !== (expectedState === 'preparing' ? 'materialize' : 'upload')
    )
      invalid();
    count++;
  }
  if (rows.docs.length > 0 && rows.docs.length < 8 && count !== view.uploadedSections) invalid();
  if (!rows.docs.length) {
    if (count !== view.uploadedSections || (await tx.get(collection.select().limit(1))).docs.length)
      invalid();
    return { ...p, part: 4, cursor: null };
  }
  for (const snapshot of rows.docs) tx.delete(snapshot.ref);
  return {
    ...p,
    cursor: rows.docs.at(-1).id,
    deletedDocuments: p.deletedDocuments + rows.docs.length,
  };
}
