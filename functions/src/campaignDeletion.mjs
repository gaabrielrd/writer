import { availableCampaign } from './campaigns.mjs';
import { prepareUniverseProjectLink } from './universes.mjs';
import { campaignIdentityToken } from './campaignIdentity.mjs';
import { readWorkMetadata, workLimit, workConflict } from './workProgressContracts.mjs';
import { encodeBaseCursor, decodeBaseCursor } from './campaignBaseContracts.mjs';
import {
  campaignReservationPath,
  readCampaignDeletionReservation,
} from './campaignDeletionGuard.mjs';
import { cleanupCampaignStep } from './campaignDeletionCleanup.mjs';
import {
  fail,
  id,
  revision,
  date,
  digest,
  meteredTransaction,
  deletionPath,
  deletionOperationPath,
  deletionFencePath,
  deletionPhases,
  scope,
  startFields,
  startInput,
  identity,
  progress,
  owned,
  fingerprint,
  prior,
  next,
  checkpointConflict,
} from './campaignDeletionContracts.mjs';
import { validateId } from './generation.mjs';

const rootFields = [
  'ownerId',
  'schemaVersion',
  'revision',
  'title',
  'universeId',
  'deleting',
  'deletionId',
  'provenance',
  'activeBaseId',
  'updatedAt',
];
const progressFields = [
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'deletionId',
  'state',
  'phase',
  'checkpoint',
  'createdAt',
  'updatedAt',
];
export function createCampaignDeletionService({ db, now = Date.now }) {
  const transaction = (fn) =>
    db.runTransaction(async (raw) => {
      const tx = meteredTransaction(raw);
      return tx.finish(await fn(tx));
    });
  const job = async (tx, uid, deletionId) =>
    owned((await tx.get(db.doc(deletionPath(uid, deletionId)))).data(), uid, deletionId);
  const canceled = (uid, request) => ({
    kind: 'canceled',
    schemaVersion: 1,
    ownerId: uid,
    request,
  });
  const saveReceipt = (tx, uid, input, action, p) => {
    const receipt = {
      operationId: input.operationId,
      action,
      expectedCheckpoint: action === 'start' ? null : input.expectedCheckpoint,
      confirmedCheckpoint: p.checkpoint,
    };
    tx.create(db.doc(deletionOperationPath(uid, input.operationId)), {
      schemaVersion: 1,
      ownerId: uid,
      deletionId: p.deletionId,
      fingerprint: fingerprint(action, input),
      receipt,
    });
    return receipt;
  };
  async function reservationForJob(tx, p, supplied) {
    const value = supplied ?? (await readCampaignDeletionReservation(tx, db, p.campaignId));
    if (
      !value.record ||
      value.record.state !== p.state ||
      Object.entries(identity(p)).some(([key, v]) => value.record[key] !== v)
    )
      fail('failed-precondition', 'A reserva da exclusão mudou.');
    return value;
  }
  function acknowledged(previous, input, action, p) {
    const r = previous.receipt;
    if (
      previous.deletionId !== p.deletionId ||
      !r ||
      r.operationId !== input.operationId ||
      r.action !== action ||
      r.expectedCheckpoint !== (action === 'start' ? null : input.expectedCheckpoint) ||
      r.confirmedCheckpoint !== (action === 'start' ? 0 : input.expectedCheckpoint + 1) ||
      r.confirmedCheckpoint > p.checkpoint
    )
      fail('failed-precondition', 'O recibo da exclusão está inconsistente.');
    return { receipt: r, progress: progress(p) };
  }
  async function replayStart(tx, uid, previous, input) {
    const p = await job(tx, uid, previous.deletionId);
    if (
      p.deletionId !== input.operationId ||
      p.campaignId !== input.campaignId ||
      p.campaignToken !== input.campaignToken
    )
      fail('failed-precondition', 'A identidade do início mudou.');
    await reservationForJob(tx, p);
    return acknowledged(previous, input, 'start', p);
  }
  async function currentRoot(tx, p) {
    const ref = db.doc('campaigns/' + p.campaignId),
      snapshot = await readWorkMetadata(tx, ref, rootFields),
      root = snapshot.data();
    if (
      root &&
      (root.ownerId !== p.ownerId ||
        root.schemaVersion !== 1 ||
        campaignIdentityToken(p.ownerId, p.campaignId, snapshot) !== p.campaignToken ||
        root.deleting !== true ||
        root.deletionId !== p.deletionId)
    )
      fail('failed-precondition', 'A encarnação da campanha mudou.', 'campaign-changed');
    return { ref, root };
  }
  return {
    async getCampaignDeletionSource(uid, data) {
      scope(uid, data, ['campaignId']);
      const campaignId = id(data.campaignId);
      return transaction(async (tx) => {
        const { record } = await readCampaignDeletionReservation(tx, db, campaignId);
        if (record) return null;
        const snap = await readWorkMetadata(tx, db.doc('campaigns/' + campaignId), rootFields),
          v = snap.data();
        if (!v || v.ownerId !== uid || v.deleting) return null;
        availableCampaign(v, uid);
        return {
          schemaVersion: 1,
          ownerId: uid,
          campaignId,
          campaignToken: campaignIdentityToken(uid, campaignId, snap),
          revision: v.revision,
          title: v.title,
        };
      });
    },
    async startCampaignDeletion(uid, data) {
      const input = startInput(uid, data),
        fp = fingerprint('start', input);
      return transaction(async (tx) => {
        const previous = prior(
            (await tx.get(db.doc(deletionOperationPath(uid, input.operationId)))).data(),
            uid,
            fp,
          ),
          fence = prior(
            (await tx.get(db.doc(deletionFencePath(uid, input.operationId)))).data(),
            uid,
            fp,
          );
        if (previous && fence) fail('failed-precondition', 'Início inconsistente.');
        if (fence) return canceled(uid, input);
        if (previous) return replayStart(tx, uid, previous, input);
        const reservation = await readCampaignDeletionReservation(tx, db, input.campaignId);
        if (reservation.record)
          fail('failed-precondition', 'A campanha já está em exclusão.', 'campaign-deleting');
        const rootRef = db.doc('campaigns/' + input.campaignId),
          snap = await readWorkMetadata(tx, rootRef, rootFields),
          root = availableCampaign(snap.data(), uid);
        if (
          campaignIdentityToken(uid, input.campaignId, snap) !== input.campaignToken ||
          root.revision !== input.expectedRevision
        )
          workConflict();
        const link = await prepareUniverseProjectLink(
            tx,
            db,
            uid,
            { kind: 'campaign', id: input.campaignId },
            root.universeId ?? null,
            null,
            now,
            { strict: true },
          ),
          createdAt = date(now, root.updatedAt ?? 0),
          p = {
            schemaVersion: 1,
            ownerId: uid,
            campaignId: input.campaignId,
            campaignToken: input.campaignToken,
            deletionId: input.operationId,
            state: 'deleting',
            phase: 'recovery',
            checkpoint: 0,
            createdAt,
            updatedAt: createdAt,
            part: 0,
            cursor: null,
            childId: null,
            childPart: 0,
            childCursor: null,
            certified: [],
          };
        if ((await tx.get(db.doc(deletionPath(uid, p.deletionId)))).exists)
          fail('already-exists', 'Identificador utilizado.');
        link.commit();
        tx.create(reservation.ref, {
          ...identity(p),
          state: 'deleting',
          createdAt,
          updatedAt: createdAt,
        });
        tx.create(db.doc(deletionPath(uid, p.deletionId)), p);
        tx.update(rootRef, {
          deleting: true,
          deletionId: p.deletionId,
          universeId: null,
          revision: revision(root.revision + 1),
          updatedAt: createdAt,
        });
        return { receipt: saveReceipt(tx, uid, input, 'start', p), progress: progress(p) };
      });
    },
    async resolveCampaignDeletionStart(uid, data) {
      scope(uid, data, [...startFields, 'intent']);
      if (data.intent !== 'cancel') fail('invalid-argument', 'Intenção inválida.');
      const input = startInput(uid, Object.fromEntries(startFields.map((key) => [key, data[key]]))),
        fp = fingerprint('start', input);
      return transaction(async (tx) => {
        const previous = prior(
            (await tx.get(db.doc(deletionOperationPath(uid, input.operationId)))).data(),
            uid,
            fp,
          ),
          fenceRef = db.doc(deletionFencePath(uid, input.operationId)),
          fence = prior((await tx.get(fenceRef)).data(), uid, fp);
        if (previous && fence) fail('failed-precondition', 'Início inconsistente.');
        if (previous) return replayStart(tx, uid, previous, input);
        if (!fence) tx.create(fenceRef, { schemaVersion: 1, ownerId: uid, fingerprint: fp });
        return canceled(uid, input);
      });
    },
    async getCampaignDeletion(uid, data) {
      scope(uid, data, ['campaignId', 'captureId']);
      if (Object.keys(data).length !== 1)
        fail('invalid-argument', 'Informe somente campanha ou captura.');
      const lookup =
          'campaignId' in data
            ? { campaignId: id(data.campaignId) }
            : { captureId: validateId(data.captureId) },
        campaignId =
          'campaignId' in lookup
            ? lookup.campaignId
            : digest({ uid, captureId: lookup.captureId, kind: 'campaign' });
      return transaction(async (tx) => {
        const found = await readCampaignDeletionReservation(tx, db, campaignId);
        let deletion = null;
        if (found.record?.ownerId === uid) {
          const p = await job(tx, uid, found.record.deletionId);
          await reservationForJob(tx, p, found);
          deletion = progress(p);
        }
        return { schemaVersion: 1, ownerId: uid, lookup, deletion };
      });
    },
    async listCampaignDeletions(uid, data = {}) {
      scope(uid, data, ['cursor', 'limit']);
      const size = workLimit(data.limit),
        cursorScope = { uid },
        cursor = decodeBaseCursor(data.cursor, cursorScope, ['key', 'date']);
      return transaction(async (tx) => {
        let q = db
          .collection(`users/${uid}/campaignDeletions`)
          .orderBy('createdAt', 'desc')
          .orderBy('__name__')
          .limit(size + 1)
          .select(...progressFields);
        if (cursor) {
          revision(cursor.date);
          id(cursor.key);
          q = q.startAfter(cursor.date, cursor.key);
        }
        const docs = (await tx.get(q)).docs,
          selected = docs.slice(0, size);
        return {
          items: selected.map((d) => {
            const p = d.data();
            if (p.ownerId !== uid || p.deletionId !== d.id)
              fail('failed-precondition', 'Identidade da listagem inconsistente.');
            return progress(p);
          }),
          nextCursor:
            docs.length > size
              ? encodeBaseCursor({
                  version: 1,
                  scope: cursorScope,
                  date: selected.at(-1).data().createdAt,
                  key: selected.at(-1).id,
                })
              : null,
        };
      });
    },
    async advanceCampaignDeletion(uid, data) {
      scope(uid, data, ['deletionId', 'operationId', 'expectedCheckpoint']);
      const input = {
        deletionId: validateId(data.deletionId),
        operationId: validateId(data.operationId),
        expectedCheckpoint: revision(data.expectedCheckpoint),
      };
      return transaction(async (tx) => {
        const p = await job(tx, uid, input.deletionId),
          previous = prior(
            (await tx.get(db.doc(deletionOperationPath(uid, input.operationId)))).data(),
            uid,
            fingerprint('advance', input),
          );
        await reservationForJob(tx, p);
        if (previous) return acknowledged(previous, input, 'advance', p);
        if (p.checkpoint !== input.expectedCheckpoint) checkpointConflict();
        if (p.state !== 'deleting') fail('failed-precondition', 'A exclusão já foi concluída.');
        const root = await currentRoot(tx, p);
        let value;
        if (p.phase === 'finalizing') {
          if (digest(p.certified) !== digest(deletionPhases.slice(0, -2)))
            fail('failed-precondition', 'A limpeza não foi certificada.');
          value = progress(next(p, now, { state: 'deleted', phase: 'complete' }));
          if (root.root) tx.delete(root.ref);
          tx.update(db.doc(campaignReservationPath(p.campaignId)), {
            state: 'deleted',
            updatedAt: value.updatedAt,
          });
        } else value = next(await cleanupCampaignStep(tx, db, p), now);
        tx.set(db.doc(deletionPath(uid, p.deletionId)), value);
        return {
          receipt: saveReceipt(tx, uid, input, 'advance', value),
          progress: progress(value),
        };
      });
    },
  };
}
