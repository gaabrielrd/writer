import { assertLoreItemOrigin } from './campaignLoreOrigin.mjs';
import {
  baseItemAvailable,
  encodeBaseCursor,
  decodeBaseCursor,
  limit,
} from './campaignBaseContracts.mjs';
import { loreRecord, overlayRecord } from './campaignLoreContracts.mjs';
import { loreOverlayFields } from './campaignLoreStorage.mjs';
import {
  digest,
  identity,
  adoptionPath,
  readWorkMetadata,
  fail,
} from './campaignAdoptionContracts.mjs';

export async function rawOverlay(tx, db, context, key) {
  return overlayRecord(
    (
      await readWorkMetadata(
        tx,
        db.doc(context.lorePath + '/loreVariants/' + key),
        loreOverlayFields,
      )
    ).data(),
    context,
    key,
  );
}
export async function candidateItem(tx, db, context, key) {
  const item = (
    await readWorkMetadata(tx, db.doc(context.path + '/items/' + key), [
      'sourceKey',
      'kind',
      'origin',
      'originAdventureToken',
      'title',
      'structured.category',
    ])
  ).data();
  if (item && (item.kind !== 'lore' || item.sourceKey !== key))
    fail('failed-precondition', 'Ficha candidata inconsistente.');
  if (item) assertLoreItemOrigin(item, context.base);
  return item ?? null;
}
export async function decisionRow(tx, db, p, c, key, suppliedOverlay) {
  const overlay = suppliedOverlay ?? (await rawOverlay(tx, db, c.current, key));
  if (
    !overlay ||
    (overlay.participation === 'inactive' && overlay.mode === 'base' && !overlay.retainedLegacy)
  )
    return null;
  const record = await loreRecord(tx, db, { ...c.current, includeInactive: true }, key);
  if (!record) return null;
  const item = await candidateItem(tx, db, c.candidate, key);
  if (item && !(await baseItemAvailable(tx, db, c.candidate, item))) return null;
  const material = record.mode !== 'base' || record.legacy || overlay.retainedLegacy === true;
  if (!item && !material) return null;
  const choice = (await tx.get(db.doc(adoptionPath(p.ownerId, p.id) + '/decisions/' + key))).data();
  if (choice && (choice.sourceKey !== key || choice.revision !== record.revision))
    fail('failed-precondition', 'A revisão da escolha mudou.', 'revision-conflict');
  return {
    sourceKey: key,
    revision: record.revision,
    mode: record.mode,
    legacy: record.legacy ?? false,
    current: { name: record.name, category: record.category },
    candidate: item
      ? { present: true, name: item.title, category: item.structured.category }
      : { present: false },
    choice: choice?.choice ?? (material ? null : 'use-candidate'),
    required: material,
    impediments: [],
  };
}
export function decisionEnvelope(p, c) {
  return {
    ...identity(p),
    checkpoint: p.checkpoint,
    currentCapturedAt: c.current.base.capturedAt,
    candidateCapturedAt: c.candidate.base.capturedAt,
    projectionToken: digest({
      identity: identity(p),
      comparison: c.comparisonContext.envelope.comparisonToken,
    }),
  };
}
export async function decisionPage(tx, db, p, c, data) {
  const size = limit(data.limit),
    envelope = decisionEnvelope(p, c),
    scope = { uid: p.ownerId, adoptionId: p.id, projectionToken: envelope.projectionToken };
  const cursor = decodeBaseCursor(data.cursor, scope);
  let q = db
    .collection(c.current.lorePath + '/loreVariants')
    .orderBy('__name__')
    .limit(size + 1)
    .select(...loreOverlayFields);
  if (cursor) q = q.startAfter(cursor.key);
  const docs = (await tx.get(q)).docs,
    items = [];
  for (const doc of docs.slice(0, size)) {
    const row = await decisionRow(
      tx,
      db,
      p,
      c,
      doc.id,
      overlayRecord(doc.data(), c.current, doc.id),
    );
    if (row) items.push(row);
  }
  return {
    ...envelope,
    items,
    nextCursor:
      docs.length > size ? encodeBaseCursor({ version: 1, scope, key: docs[size - 1].id }) : null,
  };
}
