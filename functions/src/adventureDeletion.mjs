import { validateId } from './generation.mjs';
import { advanceAdventureQuiescence } from './adventureDeletionQuiescence.mjs';
import { advanceAdventureDeletionCleanup } from './adventureDeletionCleanup.mjs';
import {
  readWorkMetadata,
  workDate,
  workFail,
  workId,
  workLimit,
} from './workProgressContracts.mjs';
import { prepareUniverseProjectLink } from './universes.mjs';
import { meteredTransaction } from './campaignAdoptionContracts.mjs';
import { adventureIdentityToken } from './campaignLoreOrigin.mjs';
import {
  createAdventureDeletionSourceService,
  readAdventureDeletionSource,
} from './adventureDeletionSource.mjs';
import {
  readAdventureDeletionReservation,
  deletedAdventureError,
} from './adventureDeletionGuard.mjs';
import {
  ADVENTURE_DELETION_JOB_FIELDS,
  ADVENTURE_DELETION_OPERATION_READ_FIELDS,
  ADVENTURE_DELETION_FENCE_FIELDS,
  ADVENTURE_DELETION_START_FIELDS,
  adventureDeletionPath,
  adventureDeletionOperationPath,
  adventureDeletionFencePath,
  adventureDeletionInconsistent as inconsistent,
  adventureDeletionScope as scope,
  adventureDeletionStartInput as startInput,
  adventureDeletionAdvanceInput as advanceInput,
  adventureDeletionJobToken as jobToken,
  adventureDeletionFingerprint as fingerprint,
  adventureDeletionOwned as owned,
  adventureDeletionIdentity as identity,
  adventureDeletionProgress as progress,
  adventureDeletionBorn as born,
  adventureDeletionSameBirth as sameBirth,
  adventureDeletionOperation as operation,
  adventureDeletionFence as fence,
  adventureDeletionCanceled as canceled,
  adventureDeletionCursor,
  encodeAdventureDeletionCursor,
  initialAdventureDeletion,
  digest,
} from './adventureDeletionContracts.mjs';

const metadata = (tx, db, path, fields) => {
  if (typeof tx.getAll !== 'function') inconsistent();
  return readWorkMetadata(tx, db.doc(path), fields);
};
export async function readAdventureDeletionJob(tx, db, uid, id, supplied) {
  const snapshot =
    supplied ??
    (await metadata(tx, db, adventureDeletionPath(uid, id), ADVENTURE_DELETION_JOB_FIELDS));
  if (!snapshot.exists) workFail('not-found', 'Exclusão indisponível.');
  if (snapshot.ref?.path !== adventureDeletionPath(uid, id) || snapshot.id !== id) inconsistent();
  const p = owned(snapshot.data(), uid, id);
  const reservation = await readAdventureDeletionReservation(tx, db, p.adventureId),
    r = reservation.record;
  if (
    !r ||
    r.state !== p.state ||
    Object.entries(identity(p)).some(([key, v]) => r[key] !== v) ||
    r.createdAt !== p.createdAt ||
    r.updatedAt > p.updatedAt ||
    (p.state === 'deleted' && r.updatedAt !== p.updatedAt)
  )
    inconsistent();
  const reserved = await metadata(tx, db, reservation.ref.path, ['schemaVersion']);
  const first = await metadata(
    tx,
    db,
    adventureDeletionOperationPath(uid, p.deletionId),
    ADVENTURE_DELETION_OPERATION_READ_FIELDS,
  );
  const receipt = operation(first, uid);
  const retired = await metadata(
    tx,
    db,
    adventureDeletionFencePath(uid, p.deletionId),
    ADVENTURE_DELETION_FENCE_FIELDS,
  );
  const original = initialAdventureDeletion(
    uid,
    {
      adventureId: p.adventureId,
      adventureToken: p.adventureToken,
      sourceToken: p.sourceToken,
      expectedRevision: p.expectedRevision,
      operationId: p.deletionId,
    },
    p.title,
    p.createdAt,
    p.sourceBirth,
  );
  if (
    retired.exists ||
    !receipt ||
    receipt.fingerprint !== p.startFingerprint ||
    receipt.deletionId !== p.deletionId ||
    receipt.receipt.action !== 'start' ||
    receipt.jobHash !== digest(original) ||
    !sameBirth(snapshot, reserved) ||
    !sameBirth(snapshot, first)
  )
    inconsistent();
  const latest =
    p.lastOperationId === p.deletionId
      ? first
      : await metadata(
          tx,
          db,
          adventureDeletionOperationPath(uid, p.lastOperationId),
          ADVENTURE_DELETION_OPERATION_READ_FIELDS,
        );
  const last = operation(latest, uid);
  if (
    !last ||
    last.fingerprint !== p.lastRequestHash ||
    last.deletionId !== p.deletionId ||
    last.receipt.confirmedCheckpoint !== p.checkpoint ||
    last.jobHash !== digest(p) ||
    digest(born(latest)) !== digest(born(snapshot, true)) ||
    (p.checkpoint === 0 ? last.receipt.action !== 'start' : last.receipt.action !== 'advance')
  )
    inconsistent();
  const loaded = { p, snapshot, reservation, first, latest };
  if (p.state !== 'deleted') loaded.root = await readAdventureDeletionRoot(tx, db, loaded);
  return { ...loaded, progress: progress(p, snapshot) };
}
/** Revocation is retained even if an external removal has already removed the root. */
export async function readAdventureDeletionRoot(tx, db, loaded) {
  const { p, first } = loaded,
    ref = db.doc('adventures/' + p.adventureId),
    snapshot = await metadata(tx, db, ref.path, [
      'ownerId',
      'schemaVersion',
      'revision',
      'universeId',
      'deleting',
      'deletionId',
    ]),
    root = snapshot.data();
  if (
    snapshot.exists &&
    (!root ||
      root.ownerId !== p.ownerId ||
      root.schemaVersion !== 1 ||
      root.deleting !== true ||
      root.deletionId !== p.deletionId ||
      root.universeId !== null ||
      root.revision !== p.expectedRevision + 1 ||
      adventureIdentityToken(p.ownerId, p.adventureId, snapshot) !== p.adventureToken ||
      digest(born(snapshot, true)) !== digest(born(first)))
  )
    inconsistent();
  return { ref, snapshot, root };
}

/** Internal only until quiescence/cleanup and the client recovery flow are complete. */
export function createAdventureDeletionService({ db, assets, now = Date.now }) {
  const source = createAdventureDeletionSourceService({ db });
  const transaction = (fn) =>
    db.runTransaction(async (raw) => {
      if (typeof raw.getAll !== 'function') inconsistent();
      const tx = meteredTransaction(raw);
      return tx.finish(await fn(tx));
    });
  async function readStart(tx, uid, input) {
    const fp = fingerprint('start', input);
    const snap = await metadata(
      tx,
      db,
      adventureDeletionOperationPath(uid, input.operationId),
      ADVENTURE_DELETION_OPERATION_READ_FIELDS,
    );
    const previous = operation(snap, uid, fp),
      retired = await metadata(
        tx,
        db,
        adventureDeletionFencePath(uid, input.operationId),
        ADVENTURE_DELETION_FENCE_FIELDS,
      );
    const stopped = fence(retired, uid, fp);
    if (previous && stopped) inconsistent();
    if (stopped) return { answer: canceled(uid, input) };
    if (!previous) return { answer: null };
    if (previous.receipt.action !== 'start' || previous.deletionId !== input.operationId)
      inconsistent();
    const loaded = await readAdventureDeletionJob(tx, db, uid, input.operationId);
    if (loaded.p.startFingerprint !== fp) inconsistent();
    return { answer: { receipt: previous.receipt, progress: loaded.progress } };
  }
  return {
    getAdventureDeletionSource: source.getAdventureDeletionSource,
    async startAdventureDeletion(uid, data) {
      const input = startInput(uid, data);
      const outcome = await transaction(async (tx) => {
        const prior = await readStart(tx, uid, input);
        if (prior.answer) return prior;
        const reservation = await readAdventureDeletionReservation(tx, db, input.adventureId);
        if (reservation.record) deletedAdventureError(reservation.record, uid);
        const current = await readAdventureDeletionSource(tx, db, uid, input.adventureId);
        if (!current) workFail('not-found', 'Aventura indisponível.');
        if (
          current.source.adventureToken !== input.adventureToken ||
          current.source.sourceToken !== input.sourceToken ||
          current.source.revision !== input.expectedRevision
        )
          workFail(
            'failed-precondition',
            'A aventura mudou. Confira novamente antes de excluir.',
            'adventure-deletion-source-changed',
          );
        if (!Number.isSafeInteger(input.expectedRevision + 1)) inconsistent();
        const path = adventureDeletionPath(uid, input.operationId);
        if ((await metadata(tx, db, path, ['ownerId'])).exists) inconsistent();
        const timestamp = workDate(now, current.root.updatedAt ?? 0);
        if (!Number.isSafeInteger(timestamp) || timestamp > 8640000000000000) inconsistent();
        const p = initialAdventureDeletion(
          uid,
          input,
          current.source.title,
          timestamp,
          born(current.snapshot),
        );
        owned(p, uid, p.deletionId);
        const unlink = await prepareUniverseProjectLink(
          tx,
          db,
          uid,
          { kind: 'adventure', id: input.adventureId },
          current.root.universeId ?? null,
          null,
          now,
          { strict: true },
        );
        const receipt = {
          operationId: input.operationId,
          action: 'start',
          expectedCheckpoint: null,
          confirmedCheckpoint: 0,
        };
        unlink.commit();
        tx.create(reservation.ref, {
          ...identity(p),
          state: 'deleting',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        tx.create(db.doc(path), p);
        tx.create(db.doc(adventureDeletionOperationPath(uid, input.operationId)), {
          schemaVersion: 1,
          ownerId: uid,
          deletionId: p.deletionId,
          fingerprint: p.startFingerprint,
          receipt,
          jobHash: digest(p),
        });
        tx.update(current.ref, {
          deleting: true,
          deletionId: p.deletionId,
          universeId: null,
          revision: input.expectedRevision + 1,
          updatedAt: timestamp,
        });
        return { answer: null };
      });
      if (outcome.answer) return outcome.answer;
      // Creation metadata is observable only after commit. Lost read acknowledgement
      // is resolved by the same original start request, never by another start.
      return transaction(async (tx) => {
        const found = await readStart(tx, uid, input);
        if (!found.answer) inconsistent();
        return found.answer;
      });
    },
    async advanceAdventureDeletion(uid, data) {
      const input = advanceInput(uid, data),
        fp = fingerprint('advance', input);
      const attempt = (io) =>
        transaction(async (tx) => {
          const loaded = await readAdventureDeletionJob(tx, db, uid, input.deletionId),
            p = loaded.p;
          if (jobToken(p, loaded.snapshot) !== input.deletionToken)
            workFail(
              'failed-precondition',
              'A identidade da exclusão mudou.',
              'adventure-deletion-identity-changed',
            );
          const ref = db.doc(adventureDeletionOperationPath(uid, input.operationId));
          const previous = operation(
            await metadata(tx, db, ref.path, ADVENTURE_DELETION_OPERATION_READ_FIELDS),
            uid,
            fp,
          );
          if (previous) {
            if (
              previous.deletionId !== p.deletionId ||
              previous.receipt.action !== 'advance' ||
              previous.receipt.expectedCheckpoint !== input.expectedCheckpoint ||
              previous.receipt.confirmedCheckpoint > p.checkpoint
            )
              inconsistent();
            return { receipt: previous.receipt, progress: loaded.progress };
          }
          if (p.state !== 'deleting' || p.checkpoint !== input.expectedCheckpoint)
            workFail(
              'failed-precondition',
              'O progresso mudou. Consulte a exclusão antes de continuar.',
              'checkpoint-conflict',
            );
          if (!Number.isSafeInteger(p.checkpoint + 1)) inconsistent();
          const unit =
            p.phase === 'quiescence'
              ? await advanceAdventureQuiescence(tx, db, p, now, input.operationId, io)
              : { value: await advanceAdventureDeletionCleanup(tx, db, p, now) };
          if (unit.pending) return { pending: unit.pending };
          const value = {
            ...unit.value,
            checkpoint: p.checkpoint + 1,
            updatedAt: workDate(now, p.updatedAt),
            lastOperationId: input.operationId,
            lastRequestHash: fp,
          };
          owned(value, uid, p.deletionId);
          const receipt = {
            operationId: input.operationId,
            action: 'advance',
            expectedCheckpoint: input.expectedCheckpoint,
            confirmedCheckpoint: value.checkpoint,
          };
          tx.set(db.doc(adventureDeletionPath(uid, p.deletionId)), value);
          tx.create(ref, {
            schemaVersion: 1,
            ownerId: uid,
            deletionId: p.deletionId,
            fingerprint: fp,
            receipt,
            jobHash: digest(value),
          });
          return { receipt, progress: progress(value, loaded.snapshot) };
        });
      const initial = await attempt(null);
      if (!initial.pending) return initial;
      if (typeof assets?.retire !== 'function')
        workFail(
          'failed-precondition',
          'A retirada da mídia está indisponível.',
          'adventure-deletion-storage-unavailable',
        );
      const proof = await assets.retire(initial.pending.context, initial.pending.sourceProof);
      return attempt({ ...initial.pending, proof });
    },
    async resolveAdventureDeletionStart(uid, data) {
      scope(uid, data, [...ADVENTURE_DELETION_START_FIELDS, 'intent']);
      if (data.intent !== 'cancel') workFail('invalid-argument', 'Intenção inválida.');
      const input = startInput(
        uid,
        Object.fromEntries(ADVENTURE_DELETION_START_FIELDS.map((k) => [k, data[k]])),
      );
      return transaction(async (tx) => {
        const found = await readStart(tx, uid, input);
        if (found.answer) return found.answer;
        tx.create(db.doc(adventureDeletionFencePath(uid, input.operationId)), {
          schemaVersion: 1,
          ownerId: uid,
          fingerprint: fingerprint('start', input),
        });
        return canceled(uid, input);
      });
    },
    async getAdventureDeletion(uid, data) {
      scope(uid, data, ['adventureId']);
      const adventureId = workId(data.adventureId);
      return transaction(async (tx) => {
        const reservation = await readAdventureDeletionReservation(tx, db, adventureId);
        let deletion = null;
        if (reservation.record?.ownerId === uid)
          deletion = (await readAdventureDeletionJob(tx, db, uid, reservation.record.deletionId))
            .progress;
        return { schemaVersion: 1, ownerId: uid, lookup: { adventureId }, deletion };
      });
    },
    async listAdventureDeletions(uid, data = {}) {
      scope(uid, data, ['cursor', 'limit']);
      const limit = workLimit(data.limit),
        cursor = adventureDeletionCursor(data.cursor, uid);
      return transaction(async (tx) => {
        let query = db
          .collection('users/' + uid + '/adventureDeletions')
          .orderBy('createdAt', 'desc')
          .orderBy('__name__')
          .select(...ADVENTURE_DELETION_JOB_FIELDS)
          .limit(limit + 1);
        if (cursor) query = query.startAfter(cursor.createdAt, cursor.deletionId);
        const page = await tx.get(query),
          items = [];
        for (const snapshot of page.docs.slice(0, limit))
          items.push(
            (await readAdventureDeletionJob(tx, db, uid, validateId(snapshot.id), snapshot))
              .progress,
          );
        const last = items.at(-1);
        return {
          schemaVersion: 1,
          ownerId: uid,
          items,
          nextCursor: page.docs.length > limit ? encodeAdventureDeletionCursor(uid, last) : null,
        };
      });
    },
  };
}
