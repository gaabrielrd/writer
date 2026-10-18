import { comparisonPath } from './campaignComparisonContracts.mjs';
import { readCampaignAuthorization } from './campaignAuthorization.mjs';
import { baseItemAvailable } from './campaignBaseContracts.mjs';
import { loreRecord, overlayRecord, readVariantEntity } from './campaignLoreContracts.mjs';
import { normalizedBodyBinding, loreOverlayFields, loreWindow } from './campaignLoreStorage.mjs';
import { candidateItem } from './campaignAdoptionRead.mjs';
import {
  adoptionPath,
  digest,
  fail,
  next,
  guardRecord,
  loreGuardPath,
  loreGenerationPath,
  certificateSeed,
  workDate,
  workRevision,
} from './campaignAdoptionContracts.mjs';

export const clock = (record) => (record ? { token: record.token, epoch: record.epoch } : null);
export async function authorizationClock(tx, db, p) {
  const value = await readCampaignAuthorization(tx, db, p.ownerId);
  if (!value.record || value.record.token !== p.authorizationToken)
    fail('failed-precondition', 'O relógio de autorização mudou.', 'authorization-changed');
  return clock(value.record);
}
export async function release(tx, db, p) {
  const ref = db.doc(loreGuardPath(p.ownerId, p.campaignId, p.campaignToken)),
    guard = (await tx.get(ref)).data();
  const cmpRef = db.doc(comparisonPath(p.ownerId, p.comparisonId)),
    cmp = (await tx.get(cmpRef)).data();
  if (guard?.adoptionId === p.id && guard.admissionEpoch === p.admissionEpoch)
    tx.set(ref, guardRecord(p, guard, false));
  if (
    cmp?.adoptionClaim?.adoptionId === p.id &&
    cmp.adoptionClaim.admissionEpoch === p.admissionEpoch &&
    cmp.state !== 'adopted'
  )
    tx.update(cmpRef, { adoptionClaim: null });
}
export async function abort(tx, db, p, now, reason) {
  await release(tx, db, p);
  return next(p, now, {
    state: 'aborted',
    reason,
    ...(reason === 'source-unavailable' ? { hasUnavailable: true } : {}),
  });
}
export function resetAuthorization(p, now, authorization, required = true) {
  return next(p, now, {
    state: 'preparing',
    phase: 'authorization',
    cursor: null,
    authorization,
    authorizationDigest: certificateSeed(p),
    authorizationComplete: false,
    reason: required ? 'reauthorization-required' : null,
  });
}
export function stagedContext(p, c) {
  return {
    ...c.current,
    ...c.candidate,
    campaignToken: p.campaignToken,
    lorePath: loreGenerationPath(p.campaignId, p.loreGenerationId),
    generationId: p.loreGenerationId,
    collectionRevision: p.expectedCollectionRevision + 1,
  };
}
async function operationStage(tx, db, p, now) {
  let q = db
    .collection(`users/${p.ownerId}/campaignVariantOperations`)
    .where('campaignId', '==', p.campaignId)
    .where('campaignToken', '==', p.campaignToken)
    .where('baseId', '==', p.currentBaseId)
    .orderBy('__name__')
    .limit(26)
    .select(
      'schemaVersion',
      'ownerId',
      'campaignId',
      'campaignToken',
      'baseId',
      'state',
      'closed',
      'revision',
    );
  if (p.cursor) q = q.startAfter(p.cursor);
  const docs = (await tx.get(q)).docs,
    scanned = docs.slice(0, 25);
  for (const doc of scanned) {
    const op = doc.data();
    if (
      op.schemaVersion !== 1 ||
      op.ownerId !== p.ownerId ||
      !['prepared', 'committed', 'canceled'].includes(op.state)
    )
      fail('failed-precondition', 'Pedido de lore inconsistente.');
    if (['prepared', 'committed'].includes(op.state) && op.closed !== true)
      return abort(tx, db, p, now, 'pending-operations');
  }
  return next(p, now, {
    processed: p.processed + scanned.length,
    cursor: docs.length > 25 ? scanned.at(-1).id : null,
    ...(docs.length <= 25 ? { phase: 'overlays' } : {}),
  });
}
async function overlayStage(tx, db, p, c, now) {
  let q = db
    .collection(c.current.lorePath + '/loreVariants')
    .orderBy('__name__')
    .limit(2)
    .select(...loreOverlayFields);
  if (p.cursor) q = q.startAfter(p.cursor);
  const docs = (await tx.get(q)).docs;
  if (!docs.length) return resetAuthorization(p, now, await authorizationClock(tx, db, p), false);
  const doc = docs[0],
    key = doc.id,
    old = overlayRecord(doc.data(), c.current, key);
  const record = await loreRecord(tx, db, { ...c.current, includeInactive: true }, key);
  const candidate = await candidateItem(tx, db, c.candidate, key);
  const decision = (
    await tx.get(db.doc(adoptionPath(p.ownerId, p.id) + '/decisions/' + key))
  ).data();
  if (decision && decision.revision !== old.revision)
    fail('failed-precondition', 'A ficha mudou.', 'revision-conflict');
  if (decision?.authorized && !record) return abort(tx, db, p, now, 'source-unavailable');
  const material =
    old.mode !== 'base' || old.participation === 'legacy' || old.retainedLegacy === true;
  if (record && material && !decision) return abort(tx, db, p, now, 'decision-required');
  const choice = decision?.choice ?? (candidate ? 'use-candidate' : 'discard-local');
  if (
    decision &&
    ((candidate && choice === 'discard-local') || (!candidate && choice === 'use-candidate'))
  )
    fail('failed-precondition', 'A escolha não corresponde à candidata.');
  const keep = choice === 'keep-local' || !record;
  const timestamp = workDate(now, old.updatedAt);
  const anchor = candidate
    ? { capturedBaseId: p.candidateBaseId, sourceKey: key }
    : (old.anchor ?? { capturedBaseId: c.current.base.id, sourceKey: key });
  const participation = candidate
    ? 'candidate'
    : keep &&
        (old.participation === 'legacy' || old.retainedLegacy === true || (record && material))
      ? 'legacy'
      : 'inactive';
  const bodyMode = keep ? old.mode : 'base';
  const value = {
    ...old,
    baseId: p.candidateBaseId,
    revision: workRevision(old.revision + 1),
    updatedAt: timestamp,
    participation,
    anchor,
    retainedLegacy: keep && (old.participation === 'legacy' || old.retainedLegacy === true),
    mode: bodyMode,
    manifest: keep ? (old.manifest ?? null) : null,
    authorizationObserved: Boolean(record) && participation !== 'inactive',
    ...(keep && old.manifest ? { bodyBinding: normalizedBodyBinding(c.current, old) } : {}),
  };
  if (!keep) {
    delete value.previousMode;
    delete value.bodyBinding;
  }
  if (
    candidate &&
    (bodyMode === 'base' || (bodyMode === 'removed' && old.previousMode === 'base'))
  ) {
    value.name = candidate.title;
    value.category = candidate.structured.category;
  }
  tx.create(
    db.doc(loreGenerationPath(p.campaignId, p.loreGenerationId) + '/loreVariants/' + key),
    value,
  );
  const stagedDigest = digest({ previous: p.stagedDigest, key, overlay: value });
  return next(p, now, {
    processed: p.processed + 1,
    cursor: key,
    stagedDigest,
    hasUnavailable: p.hasUnavailable === true || !record || participation === 'inactive',
  });
}
async function authorizationStage(tx, db, p, c, now) {
  const authorization = await authorizationClock(tx, db, p);
  if (digest(p.authorization) !== digest(authorization))
    return resetAuthorization(p, now, authorization);
  const context = stagedContext(p, c),
    window = await loreWindow(tx, db, context, p.cursor, 1);
  if (!window.keys.length)
    return next(p, now, {
      state: 'ready',
      phase: 'complete',
      cursor: null,
      authorizationComplete: true,
      reason: null,
    });
  const key = window.keys[0],
    record = await loreRecord(tx, db, context, key, window.items.get(key));
  const stored = (await tx.get(db.doc(context.lorePath + '/loreVariants/' + key))).data();
  if (stored?.authorizationObserved && !record) return abort(tx, db, p, now, 'source-unavailable');
  if (record && record.mode !== 'removed' && record.overlay?.manifest) {
    const entity = await readVariantEntity(tx, db, context, record.overlay);
    for (const relation of entity.relations) {
      const target = await loreRecord(tx, db, context, relation.targetKey);
      if (target && target.mode !== 'removed') continue;
      const oldTarget = await loreRecord(tx, db, c.current, relation.targetKey);
      if (oldTarget && oldTarget.mode !== 'removed')
        return abort(tx, db, p, now, 'relations-incompatible');
    }
  }
  if (record && record.mode === 'removed' && record.overlay?.previousMode === 'override') {
    const entity = await readVariantEntity(tx, db, context, record.overlay);
    for (const relation of entity.relations) {
      const target = await loreRecord(tx, db, context, relation.targetKey);
      if (!target || target.mode === 'removed') {
        const oldTarget = await loreRecord(tx, db, c.current, relation.targetKey);
        if (oldTarget && oldTarget.mode !== 'removed')
          return abort(tx, db, p, now, 'relations-incompatible');
      }
    }
  }
  if (record && !(await baseItemAvailable(tx, db, record.anchorContext ?? context, record.item)))
    return abort(tx, db, p, now, 'source-unavailable');
  return next(p, now, {
    processed: p.processed + 1,
    cursor: key,
    hasUnavailable: p.hasUnavailable === true || !record,
    authorizationDigest: digest({
      previous: p.authorizationDigest,
      key,
      available: Boolean(record),
      anchor: stored?.anchor ?? { capturedBaseId: p.candidateBaseId, sourceKey: key },
    }),
  });
}
export async function advanceStage(tx, db, p, c, now) {
  if (p.phase === 'operations') return operationStage(tx, db, p, now);
  if (p.phase === 'overlays') return overlayStage(tx, db, p, c, now);
  if (p.phase === 'authorization') return authorizationStage(tx, db, p, c, now);
  fail('failed-precondition', 'A fase não permite avanço.');
}
