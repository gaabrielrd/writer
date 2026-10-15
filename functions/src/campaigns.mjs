import { validateId } from './generation.mjs';
import { prepareUniverseProjectLink, universeDocumentId } from './universes.mjs';
import {
  workClosed,
  workId,
  workFail,
  workRevision,
  workDate,
  workTitle,
  workConflict,
  digest,
} from './workProgressContracts.mjs';

const statuses = ['planning', 'active', 'completed', 'archived'];
function campaignView(id, value) {
  return {
    id,
    ownerId: value.ownerId,
    schemaVersion: value.schemaVersion,
    revision: value.revision,
    title: value.title,
    description: value.description,
    provenance: { kind: 'independent' },
    status: value.status,
    universeId: value.universeId ?? null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}
function campaignPatch(value) {
  workClosed(value, ['title', 'description', 'status', 'universeId']);
  if (!Object.keys(value).length)
    workFail('invalid-argument', 'Informe uma alteração da campanha.');
  const result = {};
  if ('title' in value) result.title = workTitle(value.title);
  if ('description' in value) {
    if (typeof value.description !== 'string' || value.description.length > 4000)
      workFail('invalid-argument', 'Informe uma descrição de até 4.000 caracteres.');
    result.description = value.description.trim();
  }
  if ('status' in value) {
    if (!statuses.includes(value.status))
      workFail('invalid-argument', 'Estado da campanha inválido.');
    result.status = value.status;
  }
  if ('universeId' in value)
    result.universeId = value.universeId === null ? null : universeDocumentId(value.universeId);
  return result;
}
function available(value, uid) {
  if (!value || value.ownerId !== uid || value.deleting)
    workFail('not-found', 'Campanha indisponível.');
  if (
    value.schemaVersion !== 1 ||
    value.provenance?.kind !== 'independent' ||
    value.activeBaseId != null
  )
    workFail('failed-precondition', 'Esta procedência de campanha ainda não pode ser alterada.');
  if (!Number.isSafeInteger(value.revision) || value.revision < 1)
    workFail('failed-precondition', 'A revisão da campanha está inconsistente.');
  return value;
}
export function createCampaignsService({ db, now = Date.now }) {
  return {
    async updateCampaign(uid, data) {
      if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
      workClosed(data, ['campaignId', 'operationId', 'expectedRevision', 'patch']);
      const id = workId(data.campaignId),
        operationId = validateId(data.operationId),
        patch = campaignPatch(data.patch);
      workRevision(data.expectedRevision);
      const ref = db.doc('campaigns/' + id),
        receipt = db.doc('users/' + uid + '/campaignOperations/' + operationId),
        fingerprint = digest({ campaignId: id, expectedRevision: data.expectedRevision, patch });
      return db.runTransaction(async (tx) => {
        const current = available((await tx.get(ref)).data(), uid),
          prior = (await tx.get(receipt)).data();
        if (prior) {
          if (prior.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Operação usada com outros dados.');
          const result = campaignView(id, current);
          if (current.revision !== prior.revision || digest(result) !== prior.confirmationHash)
            workConflict();
          if ('universeId' in patch)
            await prepareUniverseProjectLink(
              tx,
              db,
              uid,
              { kind: 'campaign', id },
              current.universeId,
              current.universeId,
              now,
              { strict: true },
            );
          return result;
        }
        if (current.revision !== data.expectedRevision) workConflict();
        if (!Number.isFinite(current.updatedAt) || current.updatedAt < 0)
          workFail('failed-precondition', 'A data da campanha está inconsistente.');
        const timestamp = workDate(now, current.updatedAt),
          revision = current.revision + 1;
        if (!Number.isSafeInteger(revision))
          workFail('failed-precondition', 'A revisão da campanha está inconsistente.');
        const link =
            'universeId' in patch
              ? await prepareUniverseProjectLink(
                  tx,
                  db,
                  uid,
                  { kind: 'campaign', id },
                  current.universeId,
                  patch.universeId,
                  () => timestamp,
                  { strict: true },
                )
              : null,
          value = { ...current, ...patch, revision, updatedAt: timestamp },
          result = campaignView(id, value);
        link?.commit();
        tx.update(ref, { ...patch, revision, updatedAt: timestamp });
        tx.create(receipt, {
          fingerprint,
          campaignId: id,
          revision,
          confirmationHash: digest(result),
        });
        return result;
      });
    },
  };
}
