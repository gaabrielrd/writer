import { randomBytes } from 'node:crypto';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { assertCampaignNotDeleted } from './campaignDeletionGuard.mjs';
import { RESTORE_RESERVATION_FIELDS } from './campaignRestoreGuard.mjs';
import {
  closed,
  authorize,
  id,
  hash,
  bad,
  fail,
  digest,
  sha,
  parseJob,
  native,
  immutable,
  sameBirth,
  sameUpdateBirth,
  jobToken,
  pendingRoot,
  progress,
  date,
  chunkId,
} from './campaignRestoreContracts.mjs';
export const KEY_FIELDS = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'campaignId',
  'startFingerprint',
  'keyFingerprint',
];
export const CHUNK_META = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'campaignId',
  'jobToken',
  'createdByOperationId',
  'index',
  'byteLength',
  'chunkHash',
  'cipherHash',
];
const ROOT_FIELDS = [
  'schemaVersion',
  'kind',
  'restoreOwnerId',
  'restoreId',
  'startFingerprint',
  'ownerId',
];
export function createCampaignRestoreStore({ db, now = Date.now }) {
  const refs = {
    job: (uid, rid) => db.doc('users/' + uid + '/campaignRestores/' + rid),
    op: (uid, oid) => db.doc('users/' + uid + '/campaignRestoreOperations/' + oid),
    key: (uid, rid) => db.doc('users/' + uid + '/campaignRestoreKeys/' + rid),
    fence: (uid, rid) => db.doc('users/' + uid + '/campaignRestoreStartFences/' + rid),
    root: (cid) => db.doc('campaigns/' + cid),
    reservation: (cid) => db.doc('campaignRestoreReservations/' + cid),
  };
  const marker = (l, oid) => db.doc(l.ref.path + '/receipts/' + oid);
  const chunk = (l, index) => db.doc(l.ref.path + '/chunks/' + chunkId(index));
  function writeOperation(tx, uid, rid, job, action, requestHash, expected, effect = null) {
    const record = {
      schemaVersion: 1,
      ownerId: uid,
      restoreId: rid,
      campaignId: job.campaignId,
      startFingerprint: job.startFingerprint,
      operationId: job.lastOperationId,
      action,
      requestHash,
      jobHash: digest(job),
      receipt: {
        operationId: job.lastOperationId,
        action,
        expectedCheckpoint: expected,
        confirmedCheckpoint: job.checkpoint,
        state: job.state,
      },
      effect,
    };
    tx.create(refs.op(uid, job.lastOperationId), record);
    tx.create(db.doc(refs.job(uid, rid).path + '/receipts/' + job.lastOperationId), {
      schemaVersion: 1,
      operationId: job.lastOperationId,
      opHash: digest(record),
    });
    return record;
  }
  async function operation(tx, l, oid, expected) {
    const [snap, index] = await Promise.all([tx.get(refs.op(l.uid, oid)), tx.get(marker(l, oid))]);
    if (!snap.exists && !index.exists) return null;
    if (!snap.exists || !index.exists) bad();
    const v = closed(snap.data(), [
      'schemaVersion',
      'ownerId',
      'restoreId',
      'campaignId',
      'startFingerprint',
      'operationId',
      'action',
      'requestHash',
      'jobHash',
      'receipt',
      'effect',
    ]);
    const m = closed(index.data(), ['schemaVersion', 'operationId', 'opHash']);
    immutable(snap);
    immutable(index);
    if (
      !sameBirth(snap, index) ||
      m.schemaVersion !== 1 ||
      m.operationId !== oid ||
      m.opHash !== digest(v) ||
      v.schemaVersion !== 1 ||
      v.ownerId !== l.uid ||
      v.restoreId !== l.rid ||
      v.campaignId !== l.job.campaignId ||
      v.startFingerprint !== l.job.startFingerprint ||
      v.operationId !== oid ||
      ![
        'start',
        'append',
        'cancel',
        'cleanup',
        'review-file',
        'review-own-index',
        'review-own-check',
        'index-derived',
      ].includes(v.action)
    )
      bad();
    hash(v.requestHash);
    hash(v.jobHash);
    const r = closed(v.receipt, [
      'operationId',
      'action',
      'expectedCheckpoint',
      'confirmedCheckpoint',
      'state',
    ]);
    if (
      r.operationId !== oid ||
      r.action !== v.action ||
      !Number.isSafeInteger(r.confirmedCheckpoint) ||
      r.confirmedCheckpoint < 0 ||
      r.confirmedCheckpoint > l.job.checkpoint ||
      (v.action === 'start'
        ? oid !== l.rid || r.confirmedCheckpoint !== 0 || r.expectedCheckpoint !== null
        : r.confirmedCheckpoint < 1 || r.expectedCheckpoint !== r.confirmedCheckpoint - 1)
    )
      bad();
    if (expected !== undefined && v.requestHash !== expected)
      fail('invalid-argument', 'operation-mismatch');
    return { snapshot: snap, value: v };
  }
  async function key(tx, l, full = false) {
    const ref = refs.key(l.uid, l.rid),
      snapshot = full ? await tx.get(ref) : await readWorkMetadata(tx, ref, KEY_FIELDS);
    const retired = ['cancelling', 'cancelled'].includes(l.job.state);
    if (retired) {
      if (snapshot.exists) bad();
      return null;
    }
    if (!snapshot.exists) bad();
    const v = closed(snapshot.data(), full ? [...KEY_FIELDS, 'keyBase64'] : KEY_FIELDS);
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== l.uid ||
      v.restoreId !== l.rid ||
      v.campaignId !== l.job.campaignId ||
      v.startFingerprint !== l.job.startFingerprint ||
      v.keyFingerprint !== l.job.keyFingerprint ||
      !sameBirth(snapshot, l.snapshot)
    )
      bad();
    immutable(snapshot);
    if (!full) return { ref, snapshot, value: v };
    if (typeof v.keyBase64 !== 'string' || v.keyBase64.length !== 44) bad();
    const bytes = Buffer.from(v.keyBase64, 'base64');
    if (
      bytes.length !== 32 ||
      bytes.toString('base64') !== v.keyBase64 ||
      sha(bytes) !== v.keyFingerprint
    )
      bad();
    return { ref, snapshot, value: v, bytes };
  }
  async function load(tx, uid, rid, token) {
    authorize(uid);
    id(rid);
    const ref = refs.job(uid, rid),
      snapshot = await tx.get(ref);
    if (!snapshot.exists || snapshot.data()?.ownerId !== uid)
      fail('not-found', 'restore-unavailable');
    let job;
    try {
      job = parseJob(snapshot.data(), uid, rid);
    } catch {
      bad();
    }
    const tokenValue = jobToken(uid, rid, snapshot, job.startFingerprint);
    if (token !== undefined && hash(token) !== tokenValue)
      fail('failed-precondition', 'identity-conflict');
    const l = { uid, rid, ref, snapshot, job, token: tokenValue };
    if (!['cancelled'].includes(job.state))
      await assertCampaignNotDeleted(tx, db, uid, job.campaignId);
    const [reserved, root, start, latest] = await Promise.all([
      tx.get(refs.reservation(job.campaignId)),
      readWorkMetadata(tx, refs.root(job.campaignId), ROOT_FIELDS),
      operation(tx, l, rid, job.startFingerprint),
      operation(tx, l, job.lastOperationId, job.lastRequestHash),
    ]);
    if (!reserved.exists || !root.exists || !start || !latest) bad();
    const r = closed(reserved.data(), RESTORE_RESERVATION_FIELDS);
    immutable(reserved);
    if (
      r.schemaVersion !== 1 ||
      r.ownerId !== uid ||
      r.restoreId !== rid ||
      r.campaignId !== job.campaignId ||
      r.startFingerprint !== job.startFingerprint ||
      r.kind !== 'job' ||
      !sameBirth(reserved, snapshot) ||
      !sameBirth(root, snapshot) ||
      !sameBirth(start.snapshot, snapshot) ||
      start.value.action !== 'start' ||
      digest(root.data()) !==
        digest(pendingRoot(uid, rid, job.startFingerprint, job.state === 'cancelled')) ||
      latest.value.jobHash !== digest(job) ||
      latest.value.receipt.confirmedCheckpoint !== job.checkpoint ||
      !sameUpdateBirth(snapshot, latest.snapshot)
    )
      bad();
    if (job.state === 'cancelled') {
      if (!sameUpdateBirth(root, latest.snapshot)) bad();
    } else immutable(root);
    const fullRoot = await tx.get(refs.root(job.campaignId));
    if (
      digest(native(fullRoot)) !== digest(native(root)) ||
      digest(fullRoot.data()) !== digest(root.data())
    )
      bad();
    await key(tx, l);
    return l;
  }
  const confirm = (l, op) => ({
    receipt: structuredClone(op.value.receipt),
    progress: progress(l),
  });
  async function empty(tx, uid, rid) {
    for (const name of ['chunks', 'receipts', 'reviewRows', 'derivedRows', 'derivedPositions'])
      if (
        (
          await tx.get(
            db
              .collection(refs.job(uid, rid).path + '/' + name)
              .select()
              .limit(1),
          )
        ).docs.length
      )
        bad();
    if (
      (
        await tx.get(
          db
            .collection('users/' + uid + '/campaignRestoreOperations')
            .where('restoreId', '==', rid)
            .select()
            .limit(1),
        )
      ).docs.length
    )
      bad();
  }
  function commit(tx, l, request, action, fp, patch, effect = null, retire = false) {
    if (request.expectedCheckpoint !== l.job.checkpoint)
      fail('failed-precondition', 'checkpoint-conflict');
    const job = parseJob(
      {
        ...l.job,
        ...patch,
        checkpoint: l.job.checkpoint + 1,
        lastOperationId: request.operationId,
        lastRequestHash: fp,
        updatedAt: date(now, l.job.updatedAt),
      },
      l.uid,
      l.rid,
    );
    const op = writeOperation(
      tx,
      l.uid,
      l.rid,
      job,
      action,
      fp,
      request.expectedCheckpoint,
      effect,
    );
    tx.set(l.ref, job);
    if (retire)
      tx.set(refs.root(job.campaignId), pendingRoot(l.uid, l.rid, job.startFingerprint, true));
    return { job, op };
  }
  async function after(uid, rid, oid, fp) {
    return db.runTransaction(async (tx) => {
      const l = await load(tx, uid, rid);
      return confirm(l, await operation(tx, l, oid, fp));
    });
  }
  async function verifyChunk(tx, l, snapshot, full = false) {
    const v = closed(snapshot.data(), full ? [...CHUNK_META, 'payload'] : CHUNK_META);
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== l.uid ||
      v.restoreId !== l.rid ||
      v.campaignId !== l.job.campaignId ||
      v.jobToken !== l.token ||
      snapshot.id !== chunkId(v.index) ||
      v.index >= l.job.uploadedChunks ||
      v.byteLength !== Math.min(65536, l.job.source.byteLength - v.index * 65536)
    )
      bad();
    hash(v.chunkHash);
    hash(v.cipherHash);
    immutable(snapshot);
    const op = await operation(tx, l, id(v.createdByOperationId));
    const metadata = Object.fromEntries(CHUNK_META.map((k) => [k, v[k]]));
    if (
      !op ||
      op.value.action !== 'append' ||
      !sameBirth(snapshot, op.snapshot) ||
      digest(op.value.effect) !== digest({ index: v.index, metadataHash: digest(metadata) })
    )
      bad();
    return v;
  }
  const newKey = (uid, rid, cid, fp) => {
    const bytes = randomBytes(32);
    return {
      schemaVersion: 1,
      ownerId: uid,
      restoreId: rid,
      campaignId: cid,
      startFingerprint: fp,
      keyFingerprint: sha(bytes),
      keyBase64: bytes.toString('base64'),
    };
  };
  return {
    db,
    now,
    refs,
    marker,
    chunk,
    writeOperation,
    operation,
    key,
    load,
    confirm,
    empty,
    commit,
    after,
    verifyChunk,
    newKey,
  };
}
