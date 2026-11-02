import { born, date, integer } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata, workFail } from './workProgressContracts.mjs';
import { patch } from './loreAnalysisFields.mjs';
import {
  applicationConflict as conflict,
  reserveApplicationInput,
} from './loreAnalysisApplicationContracts.mjs';
import {
  assertApplicationOpening,
  reserveApplicationCommit,
} from './loreAnalysisApplicationStore.mjs';
import { authorizeApplicationSource } from './loreAnalysisApplicationSource.mjs';
import { grantApplicationAdoption } from './loreAnalysisApplicationChildBindings.mjs';
import { applicationWorkflowState } from './loreAnalysisApplicationWorkflowContracts.mjs';
import {
  applicationApplyOperation,
  applicationSuccessPaths,
  validateApplicationSuccess,
} from './loreAnalysisApplicationApplyContracts.mjs';
import { prepareBookLoreEditAdoptionBatch } from './bookLoreEditAdoption.mjs';
import { prepareCampaignAuthorization } from './campaignAuthorization.mjs';

/** Same transaction as the legacy route: all plans/read proofs precede every write. */
export async function applyPreparedAnalysisInTransaction(tx, { db, now }, l, data) {
  assertApplicationOpening(tx, l);
  const request = reserveApplicationInput(l.c.uid, {
    id: data.id,
    text: data.text,
    changes: data.changes,
  });
  if (request.id !== l.c.id || request.requestHash !== l.context.requestHash) conflict();
  if (l.state.phase === 'applied') return l.success.record.result;
  if (l.state.phase !== 'ready') conflict();
  const current = await authorizeApplicationSource(tx, l, now),
    r = {
      id: l.c.id,
      requestHash: l.context.requestHash,
      jobToken: l.token,
      operationId: applicationApplyOperation(l.token),
      expectedRevision: l.state.revision,
    },
    at = applicationSuccessPaths(l.c);
  for (const ref of [at.record, at.proof]) if ((await tx.get(ref)).exists) conflict();
  const finish = await reserveApplicationCommit(tx, l, 'applyLoreAnalysisApplication', r),
    userRef = db.doc('users/' + l.c.uid),
    userSnapshot = await readWorkMetadata(tx, userRef, ['credits']),
    user = userSnapshot.data(),
    cost = l.context.provider === 'platform' ? 1 : 0;
  if (!userSnapshot.exists || !Number.isSafeInteger(user.credits) || user.credits < cost)
    workFail('resource-exhausted', 'Saldo insuficiente para aplicar o lote.');
  const { localBatch } = await grantApplicationAdoption(tx, l),
    globals = [];
  for (const member of l.context.members) {
    const change = request.changes[member.index],
      value = patch(change.input);
    if (
      change.scope !== member.scope ||
      digest(value) !== member.patchHash ||
      (change.entityId ?? null) !== (member.source?.id ?? null)
    )
      conflict();
    if (member.scope !== 'global') continue;
    const existing = member.source
      ? current.entities.find((e) => e.scope === 'global' && e.id === member.source.id)
      : null;
    if (
      member.source &&
      (!existing ||
        existing.path !== current.worldRef.path + '/lore/' + member.targetId ||
        digest(existing.origin) !== digest(member.source.origin))
    )
      conflict();
    const target = db.doc(current.worldRef.path + '/lore/' + member.targetId);
    if (!existing && (await tx.get(target)).exists) conflict();
    globals.push({ target, value, existing });
  }
  const previousDates = [
    current.book.updatedAt,
    ...(globals.length
      ? [current.world.updatedAt, ...globals.map((g) => g.existing?.data.updatedAt)]
      : []),
  ].filter((v) => v !== undefined);
  for (const value of previousDates) {
    integer(value);
    if (!Number.isFinite(new Date(value).getTime())) conflict();
  }
  const minimumTimestamp = date(now, Math.max(-1, ...previousDates)),
    local = localBatch
      ? await prepareBookLoreEditAdoptionBatch(
          tx,
          { db, now: () => minimumTimestamp },
          l.c.uid,
          localBatch,
        )
      : null,
    timestamp = local?.result.timestamp ?? minimumTimestamp;
  let globalVersion = null,
    authorization = null;
  if (globals.length) {
    const previous = current.world.loreVersion ?? 0;
    integer(previous);
    globalVersion = previous + 1;
    integer(globalVersion, 1);
    authorization = await prepareCampaignAuthorization(tx, db, l.c.uid, { bump: true });
  }
  const result = { applied: l.context.members.length, credits: user.credits - cost },
    receipt = validateApplicationSuccess(l, {
      schemaVersion: 1,
      ownerId: l.c.uid,
      applicationId: l.c.id,
      applicationToken: l.token,
      contextHash: digest(l.context),
      requestHash: request.requestHash,
      operationId: r.operationId,
      readyRevision: l.state.revision,
      timestamp,
      provider: l.context.provider,
      cost,
      balanceBefore: user.credits,
      userBirth: born(userSnapshot),
      result,
      localCount: localBatch?.requests.length ?? 0,
      globalCount: globals.length,
      localBatch,
      localLoreVersion: local?.result.localLoreVersion ?? null,
      publicationPrivacyVersion: local?.result.publicationPrivacyVersion ?? null,
      globalVersion,
    }),
    receiptHash = digest(receipt),
    next = applicationWorkflowState(l);
  next.phase = 'applied';
  next.application = { operationId: r.operationId, receiptHash, timestamp, result };
  const parent = finish(next);
  local?.commit();
  authorization?.commit();
  for (const g of globals) {
    if (g.existing) tx.update(g.target, { ...g.value, updatedAt: timestamp });
    else
      tx.create(g.target, {
        ...g.value,
        aliases: g.value.aliases ?? [],
        details: g.value.details ?? '',
        relations: [],
        isPublic: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
  }
  if (globals.length)
    tx.update(current.worldRef, { loreVersion: globalVersion, updatedAt: timestamp });
  if (cost) tx.update(userRef, { credits: result.credits, updatedAt: timestamp });
  tx.update(db.doc('users/' + l.c.uid + '/loreAnalyses/' + l.c.id), {
    state: 'applied',
    requestHash: request.requestHash,
    result,
    application: { id: l.c.id, token: l.token, receiptHash },
  });
  tx.create(at.record, receipt);
  tx.create(at.proof, { schemaVersion: 1, receiptHash });
  parent.commit();
  return result;
}
