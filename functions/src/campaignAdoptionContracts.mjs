import { validateId } from './generation.mjs';
import {
  workRevision,
  workDate,
  workConflict,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import {
  digest,
  fail,
  captureScope,
  captureToken,
  basePath,
  BASE_PAGE_BYTES,
  CAPTURE_WRITE_BYTES,
} from './campaignBaseContracts.mjs';
import {
  readComparisonContext,
  ownedComparison,
  comparisonPath,
  observeCampaign,
} from './campaignComparisonContracts.mjs';
import { loreContext } from './campaignLoreContracts.mjs';
import { loreGenerationPath, loreGuardPath } from './campaignLoreStorage.mjs';

export {
  digest,
  fail,
  captureToken as hashId,
  validateId,
  workRevision,
  workDate,
  workConflict,
  readWorkMetadata,
  basePath,
  loreGenerationPath,
  loreGuardPath,
};
export const states = [
  'reviewing',
  'preparing',
  'ready',
  'adopted',
  'aborted',
  'deleting',
  'deleted',
];
export const choices = ['keep-local', 'use-candidate', 'discard-local'];
export const adoptionPath = (uid, id) => `users/${uid}/campaignAdoptions/${id}`;
export const operationPath = (uid, id) => `users/${uid}/campaignAdoptionOperations/${id}`;
export const startFencePath = (uid, id) => `users/${uid}/campaignAdoptionStartFences/${id}`;
export const generationId = (uid, campaignToken, adoptionId) =>
  digest({ kind: 'campaign-lore-generation', uid, campaignToken, adoptionId });
export const startFields = [
  'operationId',
  'campaignId',
  'campaignToken',
  'comparisonId',
  'currentBaseId',
  'candidateBaseId',
  'expectedCollectionRevision',
];
export function startInput(uid, data) {
  captureScope(uid, data, startFields);
  return {
    operationId: validateId(data.operationId),
    campaignId: validateId(data.campaignId),
    campaignToken: captureToken(data.campaignToken),
    comparisonId: validateId(data.comparisonId),
    currentBaseId: captureToken(data.currentBaseId),
    candidateBaseId: captureToken(data.candidateBaseId),
    expectedCollectionRevision: workRevision(data.expectedCollectionRevision),
  };
}
export function stepInput(uid, data, extra = []) {
  captureScope(uid, data, ['adoptionId', 'operationId', 'expectedCheckpoint', ...extra]);
  return {
    adoptionId: validateId(data.adoptionId),
    operationId: validateId(data.operationId),
    expectedCheckpoint: workRevision(data.expectedCheckpoint),
    ...(extra.length
      ? {
          sourceKey: captureToken(data.sourceKey),
          expectedRevision: workRevision(data.expectedRevision),
          choice: data.choice,
        }
      : {}),
  };
}
export const fingerprint = (action, input) => digest({ action, input });
export const identity = (p) => ({
  schemaVersion: 1,
  ownerId: p.ownerId,
  adoptionId: p.id,
  campaignId: p.campaignId,
  campaignToken: p.campaignToken,
  comparisonId: p.comparisonId,
  currentBaseId: p.currentBaseId,
  candidateBaseId: p.candidateBaseId,
  loreGenerationId: p.loreGenerationId,
  expectedCollectionRevision: p.expectedCollectionRevision,
});
export function owned(p, uid, id) {
  if (!p || p.ownerId !== uid) fail('not-found', 'Revisão de adoção indisponível.');
  if (
    p.schemaVersion !== 1 ||
    p.id !== id ||
    !states.includes(p.state) ||
    p.loreGenerationId !== generationId(uid, p.campaignToken, id)
  )
    fail('failed-precondition', 'Revisão de adoção inconsistente.');
  workRevision(p.checkpoint);
  workRevision(p.expectedCollectionRevision);
  return p;
}
export const next = (p, now, patch = {}) => ({
  ...p,
  ...patch,
  checkpoint: workRevision(p.checkpoint + 1),
  updatedAt: workDate(now, p.updatedAt),
});
export function progress(p, observed) {
  return {
    ...identity(p),
    state: p.state,
    phase: p.phase,
    checkpoint: p.checkpoint,
    processed: observed.available && !p.hasUnavailable ? p.processed : null,
    sourceAvailable: observed.available,
    cleanupComplete: p.state === 'deleted',
    reason: observed.reason ?? p.reason ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
export async function observation(tx, db, p) {
  return observeCampaign(tx, db, p.ownerId, p.campaignId, {
    campaignToken: p.campaignToken,
    currentBaseId: p.state === 'adopted' ? p.candidateBaseId : p.currentBaseId,
    adventureId: p.adventureId,
  });
}
export async function adoptionContext(tx, db, p) {
  const comparison = ownedComparison(
    (await tx.get(db.doc(comparisonPath(p.ownerId, p.comparisonId)))).data(),
    p.ownerId,
    p.comparisonId,
  );
  if (
    comparison.currentBaseId !== p.currentBaseId ||
    comparison.baseId !== p.candidateBaseId ||
    comparison.campaignId !== p.campaignId ||
    comparison.campaignToken !== p.campaignToken
  )
    fail('failed-precondition', 'A identidade da candidata mudou.', 'base-changed');
  const comparisonContext = await readComparisonContext(tx, db, p.ownerId, comparison);
  if (comparisonContext.envelope.collectionRevision !== p.expectedCollectionRevision)
    workConflict();
  const current = await loreContext(tx, db, p.ownerId, {
    campaignId: p.campaignId,
    campaignToken: p.campaignToken,
    baseId: p.currentBaseId,
  });
  const generation = (
    await readWorkMetadata(tx, db.doc(loreGenerationPath(p.campaignId, p.loreGenerationId)), [
      'schemaVersion',
      'id',
      'ownerId',
      'campaignId',
      'campaignToken',
      'baseId',
      'state',
    ])
  ).data();
  if (
    !generation ||
    generation.schemaVersion !== 1 ||
    generation.id !== p.loreGenerationId ||
    generation.ownerId !== p.ownerId ||
    generation.campaignId !== p.campaignId ||
    generation.campaignToken !== p.campaignToken ||
    generation.baseId !== p.candidateBaseId ||
    generation.state !== 'preparing'
  )
    fail('failed-precondition', 'A geração preparada está inconsistente.');
  return { comparison, comparisonContext, current, candidate: comparisonContext.candidate };
}
export function verifyReceipt(value, hash) {
  if (value && value.fingerprint !== hash)
    fail('invalid-argument', 'Operação utilizada com outros dados.');
  return value;
}
export const receipt = (action, input, p, outcome = 'confirmed') => ({
  operationId: input.operationId,
  action,
  expectedCheckpoint: action === 'start' ? null : input.expectedCheckpoint,
  confirmedCheckpoint: p.checkpoint,
  outcome,
  ...(action === 'decide'
    ? { sourceKey: input.sourceKey, expectedRevision: input.expectedRevision, choice: input.choice }
    : {}),
});
export function saveReceipt(tx, db, uid, hash, value, p) {
  tx.create(db.doc(operationPath(uid, value.operationId)), {
    schemaVersion: 1,
    ownerId: uid,
    adoptionId: p.id,
    fingerprint: hash,
    receipt: value,
  });
}
export function guardRecord(p, guard, active) {
  return {
    schemaVersion: 1,
    ownerId: p.ownerId,
    campaignId: p.campaignId,
    campaignToken: p.campaignToken,
    admissionEpoch: workRevision((guard?.admissionEpoch ?? 0) + 1),
    adoptionId: active ? p.id : null,
  };
}
export function requireGuard(p, guard) {
  if (
    !guard ||
    guard.adoptionId !== p.id ||
    guard.admissionEpoch !== p.admissionEpoch ||
    guard.campaignToken !== p.campaignToken
  )
    fail('failed-precondition', 'A reserva da adoção mudou.', 'adoption-changed');
}
export function certificateSeed(p) {
  return digest({
    identity: identity(p),
    admissionEpoch: p.admissionEpoch,
    decisionCheckpoint: p.decisionCheckpoint,
  });
}
// Queued writes preserve Firestore's reads-before-writes rule while composing bounded stages.
export function meteredTransaction(raw) {
  let reads = 0,
    readBytes = 0,
    writeBytes = 0;
  const writes = [],
    cache = new Map();
  function charge(snapshot) {
    const docs = snapshot.docs ?? [snapshot];
    reads += docs.length;
    for (const d of docs) readBytes += Buffer.byteLength(JSON.stringify(d.data() ?? null));
    if (reads > 384 || readBytes > BASE_PAGE_BYTES)
      fail('resource-exhausted', 'A etapa excede o orçamento de leitura.');
    return snapshot;
  }
  function write(method, ref, value) {
    writeBytes += Buffer.byteLength(
      JSON.stringify({ path: ref.path, ...(value === undefined ? {} : { value }) }),
    );
    if (writes.length >= 64 || writeBytes > CAPTURE_WRITE_BYTES)
      fail('resource-exhausted', 'A etapa excede o orçamento de escrita.');
    writes.push({ method, ref, value });
  }
  return {
    async get(ref) {
      const key = ref.path && ref.path + '|all';
      if (key && cache.has(key)) return cache.get(key);
      const snap = charge(await raw.get(ref));
      if (key) cache.set(key, snap);
      return snap;
    },
    async getAll(ref, options) {
      const key = ref.path + '|' + JSON.stringify(options.fieldMask);
      if (!cache.has(key)) cache.set(key, charge((await raw.getAll(ref, options))[0]));
      return [cache.get(key)];
    },
    create: (ref, v) => write('create', ref, v),
    set: (ref, v) => write('set', ref, v),
    update: (ref, v) => write('update', ref, v),
    delete: (ref) => write('delete', ref),
    finish(result, final = false) {
      if (
        Buffer.byteLength(JSON.stringify(result)) > BASE_PAGE_BYTES ||
        (final && writes.length > 10)
      )
        fail('resource-exhausted', 'Resposta ou commit excede o orçamento.');
      for (const w of writes)
        w.method === 'delete' ? raw.delete(w.ref) : raw[w.method](w.ref, w.value);
      return result;
    },
    usage: () => ({ reads, readBytes, writes: writes.length, writeBytes }),
  };
}
