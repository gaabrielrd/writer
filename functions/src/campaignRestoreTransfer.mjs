import { CAMPAIGN_BACKUP_LIMITS } from './campaignBackupContainer.mjs';
import { createSHA256 } from 'hash-wasm';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { assertCampaignNotDeleted } from './campaignDeletionGuard.mjs';
import { createCampaignRestoreStore, KEY_FIELDS } from './campaignRestoreStore.mjs';
import { createCampaignRestoreCleanup } from './campaignRestoreCleanup.mjs';
import { seal, open } from './campaignRestoreCrypto.mjs';
import {
  RESTORE_DOMAIN,
  RESTORE_HASH_ALGORITHM,
  RESTORE_CHUNK_BYTES,
  authorize,
  closed,
  id,
  hash,
  integer,
  sha,
  digest,
  fingerprint,
  campaignId,
  startInput,
  mutation,
  pendingRoot,
  sameBirth,
  immutable,
  bad,
  fail,
  date,
  progress,
} from './campaignRestoreContracts.mjs';
const aad = (l, kind, index) => [RESTORE_DOMAIN, l.uid, l.rid, l.token, kind, index];
const retired = (uid, rid, cid) => ({
  schemaVersion: 1,
  kind: 'cancelled',
  ownerId: uid,
  restoreId: rid,
  campaignId: cid,
});
export function createCampaignRestoreTransferService(options) {
  const store = createCampaignRestoreStore(options),
    { db, refs } = store;
  const reservation = (uid, rid, cid, fp, kind) => ({
    schemaVersion: 1,
    ownerId: uid,
    restoreId: rid,
    campaignId: cid,
    startFingerprint: fp,
    kind,
  });
  async function fence(tx, uid, rid, cid, fp, snapshot) {
    immutable(snapshot);
    const v = closed(snapshot.data(), [
      'schemaVersion',
      'ownerId',
      'restoreId',
      'campaignId',
      'startFingerprint',
    ]);
    if (
      digest(v) !==
      digest({
        schemaVersion: 1,
        ownerId: uid,
        restoreId: rid,
        campaignId: cid,
        startFingerprint: fp,
      })
    )
      fail('invalid-argument', 'operation-mismatch');
    const [r, root] = await Promise.all([tx.get(refs.reservation(cid)), tx.get(refs.root(cid))]);
    if (
      !r.exists ||
      !root.exists ||
      !sameBirth(r, snapshot) ||
      !sameBirth(root, snapshot) ||
      digest(r.data()) !== digest(reservation(uid, rid, cid, fp, 'fence')) ||
      digest(root.data()) !== digest(pendingRoot(uid, rid, fp, true))
    )
      bad();
    immutable(r);
    immutable(root);
    return retired(uid, rid, cid);
  }
  const service = {
    async startCampaignRestore(uid, input) {
      authorize(uid);
      const request = startInput(input),
        rid = request.operationId,
        fp = fingerprint('start', request),
        cid = campaignId(uid, rid, fp);
      const secret = store.newKey(uid, rid, cid, fp);
      const prior = await db.runTransaction(async (tx) => {
        const [job, op, f, reserved, root, key] = await Promise.all([
          tx.get(refs.job(uid, rid)),
          tx.get(refs.op(uid, rid)),
          tx.get(refs.fence(uid, rid)),
          tx.get(refs.reservation(cid)),
          readWorkMetadata(tx, refs.root(cid), ['restoreOwnerId', 'ownerId']),
          readWorkMetadata(tx, refs.key(uid, rid), KEY_FIELDS),
        ]);
        if (f.exists) {
          if (job.exists || op.exists || key.exists) bad();
          return fence(tx, uid, rid, cid, fp, f);
        }
        if (job.exists || op.exists) {
          if (!job.exists || !op.exists) bad();
          const l = await store.load(tx, uid, rid);
          return store.confirm(l, await store.operation(tx, l, rid, fp));
        }
        await assertCampaignNotDeleted(tx, db, uid, cid);
        if (reserved.exists || root.exists || key.exists) bad();
        await store.empty(tx, uid, rid);
        const time = date(store.now),
          j = {
            schemaVersion: 1,
            ownerId: uid,
            restoreId: rid,
            campaignId: cid,
            startFingerprint: fp,
            source: request.source,
            state: 'uploading',
            checkpoint: 0,
            uploadedChunks: 0,
            uploadedBytes: 0,
            computedHash: null,
            hashState: null,
            keyFingerprint: secret.keyFingerprint,
            hashAlgorithm: RESTORE_HASH_ALGORITHM,
            cleanedChunks: 0,
            lastOperationId: rid,
            lastRequestHash: fp,
            createdAt: time,
            updatedAt: time,
          };
        tx.create(refs.job(uid, rid), j);
        tx.create(refs.reservation(cid), reservation(uid, rid, cid, fp, 'job'));
        tx.create(refs.root(cid), pendingRoot(uid, rid, fp));
        tx.create(refs.key(uid, rid), secret);
        store.writeOperation(tx, uid, rid, j, 'start', fp, null);
        return null;
      });
      return prior ?? store.after(uid, rid, rid, fp);
    },
    async resolveCampaignRestoreStart(uid, input) {
      authorize(uid);
      closed(input, ['operationId', 'requestHash', 'intent']);
      const rid = id(input.operationId),
        fp = hash(input.requestHash),
        cid = campaignId(uid, rid, fp);
      if (input.intent !== 'cancel') fail('invalid-argument', 'invalid-intent');
      return db.runTransaction(async (tx) => {
        const [job, op, f, r, root, key] = await Promise.all([
          tx.get(refs.job(uid, rid)),
          tx.get(refs.op(uid, rid)),
          tx.get(refs.fence(uid, rid)),
          tx.get(refs.reservation(cid)),
          readWorkMetadata(tx, refs.root(cid), ['restoreOwnerId', 'ownerId']),
          readWorkMetadata(tx, refs.key(uid, rid), KEY_FIELDS),
        ]);
        if (job.exists || op.exists) {
          if (!job.exists || !op.exists || f.exists) bad();
          const l = await store.load(tx, uid, rid);
          return store.confirm(l, await store.operation(tx, l, rid, fp));
        }
        if (f.exists) return fence(tx, uid, rid, cid, fp, f);
        await assertCampaignNotDeleted(tx, db, uid, cid);
        if (r.exists || root.exists || key.exists) bad();
        await store.empty(tx, uid, rid);
        tx.create(refs.fence(uid, rid), {
          schemaVersion: 1,
          ownerId: uid,
          restoreId: rid,
          campaignId: cid,
          startFingerprint: fp,
        });
        tx.create(refs.reservation(cid), reservation(uid, rid, cid, fp, 'fence'));
        tx.create(refs.root(cid), pendingRoot(uid, rid, fp, true));
        return retired(uid, rid, cid);
      });
    },
    async getCampaignRestore(uid, input) {
      authorize(uid);
      closed(input, ['restoreId'], ['jobToken']);
      const rid = id(input.restoreId),
        token = input.jobToken === undefined ? undefined : hash(input.jobToken);
      return db.runTransaction(async (tx) => ({
        progress: progress(await store.load(tx, uid, rid, token)),
      }));
    },
    async appendCampaignRestoreChunk(uid, input) {
      authorize(uid);
      const request = mutation(input, ['index', 'chunkHash', 'chunkBase64']),
        index = integer(input.index),
        chunkHash = hash(input.chunkHash),
        encoded = input.chunkBase64;
      if (
        typeof encoded !== 'string' ||
        !encoded ||
        encoded.length > 4 * Math.ceil(RESTORE_CHUNK_BYTES / 3)
      )
        fail('invalid-argument', 'invalid-chunk');
      const bytes = Buffer.from(encoded, 'base64');
      if (
        bytes.toString('base64') !== encoded ||
        bytes.length > RESTORE_CHUNK_BYTES ||
        sha(bytes) !== chunkHash
      )
        fail('invalid-argument', 'invalid-chunk');
      const fp = fingerprint('append', { ...request, index, chunkHash, byteLength: bytes.length }),
        h = await createSHA256();
      const prior = await db.runTransaction(async (tx) => {
        const l = await store.load(tx, uid, request.restoreId, request.jobToken),
          op = await store.operation(tx, l, request.operationId, fp);
        if (op) return store.confirm(l, op);
        if (request.expectedCheckpoint !== l.job.checkpoint)
          fail('failed-precondition', 'checkpoint-conflict');
        const j = l.job;
        if (j.state !== 'uploading') fail('failed-precondition', 'state-conflict');
        if (
          index !== j.uploadedChunks ||
          bytes.length !== Math.min(RESTORE_CHUNK_BYTES, j.source.byteLength - j.uploadedBytes)
        )
          fail('invalid-argument', 'chunk-order-or-size');
        const ref = store.chunk(l, index);
        if ((await readWorkMetadata(tx, ref, ['index'])).exists) bad();
        const key = await store.key(tx, l, true);
        try {
          h.init();
          if (j.uploadedChunks) {
            try {
              h.load(open(key.bytes, j.hashState, aad(l, 'sha-state', j.uploadedChunks), 4096));
            } catch {
              bad();
            }
          }
          h.update(bytes);
          const count = index + 1,
            total = j.uploadedBytes + bytes.length,
            complete = total === j.source.byteLength,
            computedHash = complete ? h.digest('hex') : null,
            state = complete
              ? computedHash === j.source.sha256
                ? 'bytes-verified'
                : 'rejected'
              : 'uploading',
            stateBytes = complete ? null : seal(key.bytes, h.save(), aad(l, 'sha-state', count)),
            payload = seal(key.bytes, bytes, aad(l, 'chunk', index)),
            meta = {
              schemaVersion: 1,
              ownerId: uid,
              restoreId: l.rid,
              campaignId: j.campaignId,
              jobToken: l.token,
              createdByOperationId: request.operationId,
              index,
              byteLength: bytes.length,
              chunkHash,
              cipherHash: digest(payload),
            };
          store.commit(
            tx,
            l,
            request,
            'append',
            fp,
            {
              uploadedChunks: count,
              uploadedBytes: total,
              computedHash,
              state,
              hashState: stateBytes,
            },
            { index, metadataHash: digest(meta) },
          );
          tx.create(ref, { ...meta, payload });
        } finally {
          key.bytes.fill(0);
        }
        return null;
      });
      return prior ?? store.after(uid, request.restoreId, request.operationId, fp);
    },
    async openCampaignRestoreSource(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken']);
      const rid = id(input.restoreId),
        token = hash(input.jobToken);
      const size = await db.runTransaction(async (tx) => {
        const l = await store.load(tx, uid, rid, token);
        if (l.job.state !== 'bytes-verified') fail('failed-precondition', 'state-conflict');
        return l.job.source.byteLength;
      });
      return Object.freeze({
        size,
        read: async (offset, length) => {
          integer(offset);
          integer(
            length,
            1,
            CAMPAIGN_BACKUP_LIMITS.maxMetadataBytes + CAMPAIGN_BACKUP_LIMITS.maxPayloadBytes,
          );
          if (offset + length > size) fail('invalid-argument', 'invalid-range');
          return db.runTransaction(async (tx) => {
            const l = await store.load(tx, uid, rid, token);
            if (l.job.state !== 'bytes-verified' || l.job.source.byteLength !== size)
              fail('failed-precondition', 'state-conflict');
            const key = await store.key(tx, l, true),
              parts = [];
            try {
              for (
                let n = Math.floor(offset / RESTORE_CHUNK_BYTES);
                n <= Math.floor((offset + length - 1) / RESTORE_CHUNK_BYTES);
                n++
              ) {
                const snapshot = await tx.get(store.chunk(l, n));
                if (!snapshot.exists) bad();
                const v = await store.verifyChunk(tx, l, snapshot, true);
                if (v.cipherHash !== digest(v.payload)) bad();
                const bytes = open(key.bytes, v.payload, aad(l, 'chunk', n), RESTORE_CHUNK_BYTES);
                if (bytes.length !== v.byteLength || sha(bytes) !== v.chunkHash) bad();
                parts.push(bytes);
              }
              return Buffer.concat(parts).subarray(
                offset % RESTORE_CHUNK_BYTES,
                (offset % RESTORE_CHUNK_BYTES) + length,
              );
            } finally {
              key.bytes.fill(0);
            }
          });
        },
      });
    },
    ...createCampaignRestoreCleanup(store),
  };
  return service;
}
