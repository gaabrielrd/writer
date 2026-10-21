import { readWorkMetadata } from './workProgressContracts.mjs';
import { basePath, baseImageKey, baseImageUseKey } from './campaignBaseContracts.mjs';
import {
  fail,
  digest,
  revision,
  deletionPhases,
  cleanupVersion,
} from './campaignDeletionContracts.mjs';

const own = (v, p) => {
  if (!v || v.ownerId !== p.ownerId || v.campaignId !== p.campaignId)
    fail('failed-precondition', 'O recurso da exclusão está inconsistente.');
};
const advancePhase = (p) => ({
  ...p,
  phase: deletionPhases[deletionPhases.indexOf(p.phase) + 1],
  part: 0,
  cursor: null,
  childId: null,
  childPart: 0,
  childCursor: null,
  certified: [...(p.certified ?? []), p.phase],
});
function page(tx, db, path, cursor, fields = [], size = 25, filter = null) {
  let q = db
    .collection(path)
    .orderBy('__name__')
    .limit(size + 1)
    .select(...fields);
  if (filter) q = q.where(filter[0], '==', filter[1]);
  if (cursor) q = q.startAfter(cursor);
  return tx.get(q);
}
const marker = (p, extra = {}) => ({
  schemaVersion: 1,
  ownerId: p.ownerId,
  campaignId: p.campaignId,
  deletionId: p.deletionId,
  state: 'deleted-campaign',
  ...extra,
});

async function sanitize(tx, db, p, specs) {
  const part = p.part ?? 0,
    spec = specs[part];
  if (!Number.isSafeInteger(part) || part < 0 || part > specs.length)
    fail('failed-precondition', 'Cursor de limpeza inconsistente.');
  if (!spec) return advancePhase(p);
  const docs = (
    await page(
      tx,
      db,
      `users/${p.ownerId}/${spec.collection}`,
      p.cursor,
      [...spec.fields, 'schemaVersion'],
      25,
      [spec.filter ?? 'campaignId', p.campaignId],
    )
  ).docs;
  for (const doc of docs.slice(0, 25)) {
    const v = doc.data();
    if (v.ownerId !== p.ownerId || v.schemaVersion !== 1)
      fail('failed-precondition', 'Dono ou versão do controle inconsistente.');
    const value = spec.value ? spec.value(v, doc.id) : {};
    tx.set(doc.ref, marker(p, value));
  }
  return docs.length > 25 ? { ...p, cursor: docs[24].id } : { ...p, part: part + 1, cursor: null };
}
async function controls(tx, db, p) {
  const part = p.part ?? 0;
  if (part !== 2)
    return sanitize(tx, db, p, [
      {
        collection: 'campaignPreparations',
        fields: ['ownerId', 'campaignId', 'id'],
        value: (v, id) => ({ id, captureId: id }),
      },
      {
        collection: 'campaignComparisons',
        fields: ['ownerId', 'campaignId', 'id'],
        value: (v, id) => ({ id, comparisonId: id }),
      },
      null,
      { collection: 'campaignAdoptionGuards', fields: ['ownerId', 'campaignId'] },
    ]);
  let adoptionId = p.childId;
  if (!adoptionId) {
    const first = (
      await page(
        tx,
        db,
        `users/${p.ownerId}/campaignAdoptions`,
        p.cursor,
        ['ownerId', 'campaignId'],
        1,
        ['campaignId', p.campaignId],
      )
    ).docs[0];
    if (!first) return { ...p, part: 3, cursor: null };
    own(first.data(), p);
    adoptionId = first.id;
  }
  const childPart = p.childPart ?? 0;
  if (childPart === 0) {
    const docs = (
      await page(tx, db, `users/${p.ownerId}/campaignAdoptions/${adoptionId}/decisions`, null)
    ).docs;
    for (const doc of docs.slice(0, 25)) tx.delete(doc.ref);
    return { ...p, childId: adoptionId, childPart: docs.length > 25 ? 0 : 1 };
  }
  const docs = (
    await page(
      tx,
      db,
      `users/${p.ownerId}/campaignAdoptionOperations`,
      p.childCursor,
      [
        'schemaVersion',
        'ownerId',
        'adoptionId',
        'fingerprint',
        'receipt.operationId',
        'receipt.action',
        'receipt.expectedCheckpoint',
        'receipt.confirmedCheckpoint',
        'receipt.outcome',
      ],
      25,
      ['adoptionId', adoptionId],
    )
  ).docs;
  for (const doc of docs.slice(0, 25)) {
    const v = doc.data();
    if (v.ownerId !== p.ownerId) fail('failed-precondition', 'Recibo de outra identidade.');
    tx.set(doc.ref, marker(p, { adoptionId, fingerprint: v.fingerprint, receipt: v.receipt }));
  }
  if (docs.length > 25) return { ...p, childId: adoptionId, childPart, childCursor: docs[24].id };
  tx.set(
    db.doc(`users/${p.ownerId}/campaignAdoptions/${adoptionId}`),
    marker(p, { id: adoptionId, adoptionId }),
  );
  return { ...p, cursor: adoptionId, childId: null, childPart: 0, childCursor: null };
}
async function image(tx, db, p, path) {
  const doc = (
    await page(tx, db, path + '/images', null, ['imageKey', 'imageId', 'state', 'useKey'], 1)
  ).docs[0];
  if (!doc) return false;
  const v = doc.data();
  if (
    typeof v.imageId !== 'string' ||
    !v.imageId ||
    v.imageId.includes('/') ||
    v.imageKey !== doc.id ||
    v.imageKey !== baseImageKey(v.imageId)
  )
    fail('failed-precondition', 'A identidade da imagem capturada está inconsistente.');
  const key = baseImageUseKey(p.childId, v.imageId),
    libraryRef = db.doc(`users/${p.ownerId}/imageLibrary/${v.imageId}`),
    useRef = db.doc(libraryRef.path + '/uses/' + key),
    use = (await readWorkMetadata(tx, useRef, ['kind', 'campaignId', 'baseId'])).data();
  if (v.state === 'pending') {
    if (use) fail('failed-precondition', 'Uma imagem pendente possui um uso inesperado.');
  } else if (v.state === 'ready') {
    if (v.useKey !== key) fail('failed-precondition', 'A chave do uso está inconsistente.');
    const library = (await readWorkMetadata(tx, libraryRef, ['useCount'])).data();
    if (
      use &&
      (use.kind !== 'campaign-base' || use.campaignId !== p.campaignId || use.baseId !== p.childId)
    )
      fail('failed-precondition', 'O uso da imagem pertence a outro recurso.');
    if (library) {
      if (!use || !Number.isSafeInteger(library.useCount) || library.useCount < 1)
        fail('failed-precondition', 'O contador ou vínculo da imagem está inconsistente.');
      tx.update(libraryRef, { useCount: library.useCount - 1 });
    }
    if (use) tx.delete(useRef);
  } else fail('failed-precondition', 'Estado de imagem não suportado.');
  tx.delete(doc.ref);
  return true;
}
async function tree(tx, db, p, generation = false) {
  const collection = generation
    ? `campaigns/${p.campaignId}/loreGenerations`
    : `users/${p.ownerId}/campaignBases`;
  let childId = p.childId;
  if (!childId) {
    const doc = (
      await page(
        tx,
        db,
        collection,
        null,
        ['ownerId', 'campaignId', 'id'],
        1,
        generation ? null : ['campaignId', p.campaignId],
      )
    ).docs[0];
    if (!doc) return advancePhase(p);
    own(doc.data(), p);
    childId = doc.id;
  }
  const path = generation ? `${collection}/${childId}` : basePath(p.ownerId, childId),
    collections = generation
      ? ['loreVariants', 'loreVariantBodies']
      : ['images', 'bodies', 'links', 'loreReferences', 'items'],
    childPart = p.childPart ?? 0,
    working = { ...p, childId, childPart };
  if (!Number.isSafeInteger(childPart) || childPart < 0 || childPart >= collections.length)
    fail('failed-precondition', 'Cursor da geração inconsistente.');
  const root = (
    await readWorkMetadata(tx, db.doc(path), ['schemaVersion', 'ownerId', 'campaignId', 'id'])
  ).data();
  if (root) {
    own(root, p);
    if (root.schemaVersion !== 1 || root.id !== childId)
      fail('failed-precondition', 'A versão da geração não é suportada.');
  }
  if (!generation && childPart === 0) {
    if (await image(tx, db, working, path)) return working;
    return { ...working, childPart: 1 };
  }
  const docs = (await page(tx, db, `${path}/${collections[childPart]}`, null)).docs;
  for (const doc of docs.slice(0, 25)) tx.delete(doc.ref);
  if (docs.length > 25) return working;
  if (childPart + 1 === collections.length) {
    tx.delete(db.doc(path));
    return { ...p, childId: null, childPart: 0 };
  }
  return { ...working, childPart: childPart + 1 };
}
export async function cleanupCampaignStep(tx, db, p) {
  const version = cleanupVersion(p);
  if (p.phase === 'recovery')
    return sanitize(tx, db, p, [
      {
        collection: 'campaignVariantOperations',
        fields: ['ownerId', 'campaignId', 'descriptorHash', 'fingerprint'],
        value: (v) => ({
          ...(v.descriptorHash ? { descriptorHash: v.descriptorHash } : {}),
          ...(v.fingerprint ? { fingerprint: v.fingerprint } : {}),
        }),
      },
      {
        collection: 'campaignVariantResolutionOperations',
        filter: 'result.request.campaignId',
        fields: ['ownerId', 'fingerprint'],
        value: (v) => ({ fingerprint: v.fingerprint }),
      },
      {
        collection: 'campaignComparisonStartFences',
        filter: 'request.campaignId',
        fields: ['ownerId', 'fingerprint'],
        value: (v) => ({ fingerprint: v.fingerprint }),
      },
      ...(version >= 2
        ? [{ collection: 'campaignSessionOperations', fields: ['ownerId', 'campaignId'] }]
        : []),
      ...(version >= 3
        ? [
            { collection: 'campaignSessionReferenceOperations', fields: ['ownerId', 'campaignId'] },
            { collection: 'campaignSessionReferenceFences', fields: ['ownerId', 'campaignId'] },
          ]
        : []),
      ...(version === 4
        ? [
            { collection: 'campaignPreparationOperations', fields: ['ownerId', 'campaignId'] },
            { collection: 'campaignPreparationFences', fields: ['ownerId', 'campaignId'] },
          ]
        : []),
    ]);
  if (p.phase === 'controls') return controls(tx, db, p);
  if (p.phase === 'bases') return tree(tx, db, p);
  if (p.phase === 'lore-generations') return tree(tx, db, p, true);
  if (p.phase === 'campaign-children') {
    const collections = [
        'notes',
        'noteState',
        'workChecklist',
        'workProgress',
        'loreVariants',
        'loreVariantBodies',
        'loreVariantState',
        ...(version >= 2 ? ['sessions', 'sessionState'] : []),
        ...(version >= 3 ? ['sessionReferences', 'sessionReferenceState'] : []),
        ...(version === 4
          ? [
              'preparationItems',
              'preparationBodies',
              'preparationState',
              'sessionPreparationLinks',
              'sessionPreparationState',
            ]
          : []),
      ],
      part = p.part ?? 0;
    if (part >= collections.length) return advancePhase(p);
    const docs = (await page(tx, db, `campaigns/${p.campaignId}/${collections[part]}`, null)).docs;
    for (const doc of docs.slice(0, 25)) tx.delete(doc.ref);
    return docs.length > 25 ? p : { ...p, part: part + 1 };
  }
  if (p.phase === 'activity') {
    const ref = db.doc(
        `users/${p.ownerId}/workActivity/${digest({ kind: 'campaign', id: p.campaignId })}`,
      ),
      row = (await readWorkMetadata(tx, ref, ['target'])).data();
    if (row) {
      if (row.target?.kind !== 'campaign' || row.target.id !== p.campaignId)
        fail('failed-precondition', 'A retomada pertence a outro projeto.');
      const stateRef = db.doc(`users/${p.ownerId}/workActivityState/current`),
        state = (await readWorkMetadata(tx, stateRef, ['revision'])).data();
      if (!state || !Number.isSafeInteger(state.revision) || state.revision < 0)
        fail('failed-precondition', 'O controle de retomada está inconsistente.');
      tx.update(stateRef, { revision: revision(state.revision + 1) });
      tx.delete(ref);
    }
    return advancePhase(p);
  }
  fail('failed-precondition', 'Fase de exclusão não suportada.');
}
