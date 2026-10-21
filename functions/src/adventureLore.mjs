import {
  fail,
  workId,
  digest,
  limit,
  conflict,
  safe,
  token,
  identity,
  metadataFields,
  globalMetadataFields,
  structuredKeys,
  categories,
  canonicalId,
  referenceInput,
  relationReference,
  scopeInput,
  mutationInput,
  resolverInput,
  adventureLoreRequestHash,
  adventureIdentityToken,
  inconsistent,
  changed,
  storedMetadata,
  storedBody,
  operationPath,
  fencePath,
  prior,
  confirmed,
  canceled,
  bounded,
} from './adventureLoreContracts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { preciseStamp } from './campaignBaseContracts.mjs';
import {
  readCampaignAuthorization,
  prepareCampaignAuthorization,
} from './campaignAuthorization.mjs';

export async function readAdventureLoreContext(
  tx,
  db,
  uid,
  data,
  optionalToken = false,
  withWorld = true,
) {
  const path = 'adventures/' + data.adventureId;
  const snapshot = await readWorkMetadata(tx, db.doc(path), [
    'ownerId',
    'schemaVersion',
    'deleting',
    'universeId',
    'loreVersion',
    'updatedAt',
  ]);
  const root = snapshot.data();
  if (!root || root.ownerId !== uid || root.deleting) fail('not-found', 'Aventura indisponível.');
  if (root.schemaVersion !== 1) inconsistent();
  const adventureToken = adventureIdentityToken(uid, data.adventureId, snapshot);
  if (
    (!optionalToken || data.adventureToken !== undefined) &&
    data.adventureToken !== adventureToken
  )
    fail('failed-precondition', 'A identidade da aventura mudou.', 'adventure-changed');
  let collectionRevision = root.loreVersion;
  if (collectionRevision === undefined) {
    if (
      (
        await tx.get(
          db
            .collection(path + '/lore')
            .orderBy('__name__')
            .limit(1)
            .select(),
        )
      ).docs.length
    )
      inconsistent();
    collectionRevision = 0;
  }
  if (!safe(collectionRevision)) inconsistent();
  const c = { uid, adventureId: data.adventureId, adventureToken, path, root, collectionRevision };
  if (!withWorld) return c;
  let worldSnapshot = null,
    world = null,
    worldAvailable = false;
  if (root.universeId != null) {
    workId(root.universeId);
    worldSnapshot = await readWorkMetadata(tx, db.doc('universes/' + root.universeId), [
      'authorId',
      'deleting',
      'loreVersion',
      'privacyVersion',
    ]);
    world = worldSnapshot.data() ?? null;
    worldAvailable = !!world && world.authorId === uid && !world.deleting;
    if (
      worldAvailable &&
      ![world.loreVersion ?? 0, world.privacyVersion ?? 0].every((v) => safe(v))
    )
      inconsistent();
  }
  const authorization = await readCampaignAuthorization(tx, db, uid);
  const contextToken = digest({
    version: 1,
    uid,
    adventureToken,
    collectionRevision,
    universeId: root.universeId ?? null,
    worldAvailable,
    world: worldSnapshot?.exists ? preciseStamp(worldSnapshot) : null,
    worldIdentity: worldSnapshot?.exists
      ? adventureIdentityToken(uid, root.universeId, worldSnapshot)
      : null,
    loreVersion: worldAvailable ? (world.loreVersion ?? 0) : null,
    privacyVersion: worldAvailable ? (world.privacyVersion ?? 0) : null,
    authorization: authorization.record
      ? { token: authorization.record.token, epoch: authorization.epoch }
      : null,
  });
  return { ...c, world, worldAvailable, contextToken };
}
const localRef = (c, id) => ({ kind: 'adventure', scopeId: c.adventureId, entityId: id });
const entityToken = (c, reference, stamp) =>
  digest({ reference, contextToken: c.contextToken, ...stamp });
function globalDate(v) {
  const n = v?.toMillis?.() ?? v ?? 0;
  if (!safe(n) || n > 8640000000000000) inconsistent();
  return n;
}
function localSummary(c, v) {
  const reference = localRef(c, v.entityId);
  return {
    id: canonicalId(reference),
    reference,
    entityToken: entityToken(c, reference, { revision: v.revision }),
    name: v.name,
    aliases: v.aliases,
    category: v.category,
    summary: v.summary,
    isPublic: false,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    revision: v.revision,
    relationCount: v.relationCount,
  };
}
function globalSummary(c, snapshot, v) {
  if (
    typeof v.name !== 'string' ||
    !Array.isArray(v.aliases ?? []) ||
    (v.aliases ?? []).some((a) => typeof a !== 'string') ||
    !categories.includes(v.category) ||
    typeof (v.summary ?? '') !== 'string' ||
    (v.isPublic !== undefined && typeof v.isPublic !== 'boolean')
  )
    inconsistent();
  const reference = { kind: 'universe', scopeId: c.root.universeId, entityId: snapshot.id };
  return {
    id: canonicalId(reference),
    reference,
    entityToken: entityToken(c, reference, { stamp: preciseStamp(snapshot) }),
    name: v.name,
    aliases: v.aliases ?? [],
    category: v.category,
    summary: v.summary ?? '',
    isPublic: v.isPublic ?? false,
    createdAt: globalDate(v.createdAt),
    updatedAt: globalDate(v.updatedAt),
  };
}
export async function adventureLoreTargetAvailable(tx, db, c, reference) {
  if (reference.kind === 'adventure') {
    if (reference.scopeId !== c.adventureId) return false;
    const v = storedMetadata(
      (
        await readWorkMetadata(tx, db.doc(c.path + '/lore/' + reference.entityId), metadataFields)
      ).data(),
      c,
      reference.entityId,
    );
    return !!v && !v.deleted;
  }
  if (reference.kind !== 'universe' || reference.scopeId !== c.root.universeId || !c.worldAvailable)
    return false;
  const v = (
    await readWorkMetadata(
      tx,
      db.doc('universes/' + reference.scopeId + '/lore/' + reference.entityId),
      ['deleting', 'deleted'],
    )
  ).data();
  return !!v && !v.deleting && !v.deleted;
}
async function relationViews(tx, db, c, relations) {
  if (!Array.isArray(relations) || relations.length > 50) inconsistent();
  const values = [];
  for (const r of relations) {
    if (
      typeof r?.targetEntityId !== 'string' ||
      typeof r.relationType !== 'string' ||
      typeof (r.description ?? '') !== 'string'
    )
      inconsistent();
    let reference = null;
    try {
      reference = relationReference(r.targetEntityId);
    } catch {
      /* Legacy descriptors outside this context remain neutral. */
    }
    values.push({
      targetEntityId: r.targetEntityId,
      relationType: r.relationType,
      description: r.description ?? '',
      available: reference ? await adventureLoreTargetAvailable(tx, db, c, reference) : false,
    });
  }
  return values;
}
function cursorDecode(raw, scope) {
  if (raw == null) return null;
  let v;
  try {
    if (typeof raw !== 'string' || raw.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(raw))
      throw Error();
    v = JSON.parse(Buffer.from(raw, 'base64url').toString());
    if (!v || Object.keys(v).length !== 3 || typeof v.name !== 'string' || typeof v.id !== 'string')
      throw Error();
    workId(v.id);
  } catch {
    fail('invalid-argument', 'Página inválida.');
  }
  if (digest(v.scope) !== digest(scope)) changed();
  return v;
}
export function createAdventureLoreService({ db, now = Date.now }) {
  async function records(tx, c, r, action, requestHash) {
    const receiptRef = db.doc(operationPath(c.uid, r.operationId)),
      fenceRef = db.doc(fencePath(c.uid, r.operationId));
    const previous = prior((await tx.get(receiptRef)).data(), c, r, action, requestHash, true);
    const fence = prior((await tx.get(fenceRef)).data(), c, r, action, requestHash, false);
    if (previous && fence) inconsistent();
    return { receiptRef, fenceRef, previous, fence };
  }
  const operation = (c, r, action, requestHash, receipt) => ({
    ...identity(c),
    action,
    operationId: r.operationId,
    entityId: r.entityId,
    expectedRevision: r.expectedRevision,
    expectedCollectionRevision: r.expectedCollectionRevision,
    requestHash,
    ...(receipt ? { receipt } : {}),
  });
  async function mutate(uid, data, action) {
    const r = mutationInput(uid, data, action),
      requestHash = adventureLoreRequestHash(action, r);
    return db.runTransaction(async (tx) => {
      let c = await readAdventureLoreContext(tx, db, uid, r, false, false);
      const p = await records(tx, c, r, action, requestHash);
      if (p.previous) return confirmed(c, p.previous);
      if (p.fence) return canceled(c, r, action);
      if (c.collectionRevision !== r.expectedCollectionRevision) conflict();
      const ref = db.doc(c.path + '/lore/' + r.entityId),
        bodyRef = db.doc(c.path + '/loreBodies/' + r.entityId);
      const old = storedMetadata(
        (await readWorkMetadata(tx, ref, metadataFields)).data(),
        c,
        r.entityId,
      );
      if ((old?.revision ?? 0) !== r.expectedRevision) conflict();
      if (old?.deleted || (!old && action === 'delete')) fail('not-found', 'Ficha indisponível.');
      let previousBody = null;
      if (old) previousBody = storedBody((await tx.get(bodyRef)).data(), c, old);
      else if ((await readWorkMetadata(tx, bodyRef, [])).exists) inconsistent();
      if (action === 'save' && r.entity.relations.length) {
        c = await readAdventureLoreContext(tx, db, uid, r, false, true);
        const retained = new Map();
        for (const relation of previousBody?.relations ?? []) {
          const k = digest(relation);
          retained.set(k, (retained.get(k) ?? 0) + 1);
        }
        for (const relation of r.entity.relations) {
          const reference = relationReference(relation.targetEntityId);
          if (reference.kind === 'adventure' && reference.scopeId !== c.adventureId)
            fail('permission-denied', 'Destino fora da aventura.');
          if (
            reference.kind === 'adventure' &&
            reference.scopeId === c.adventureId &&
            reference.entityId === r.entityId
          )
            fail('invalid-argument', 'Uma ficha não pode se relacionar consigo mesma.');
          const k = digest(relation),
            count = retained.get(k) ?? 0;
          if (count) {
            retained.set(k, count - 1);
            continue;
          }
          if (!(await adventureLoreTargetAvailable(tx, db, c, reference)))
            fail('permission-denied', 'Destino da relação indisponível.');
        }
      }
      const revision = r.expectedRevision + 1,
        collectionRevision = c.collectionRevision + 1;
      if (!safe(revision, 1) || !safe(collectionRevision, 1)) inconsistent();
      const timestamp = Math.max(now(), (old?.updatedAt ?? 0) + 1, (c.root.updatedAt ?? 0) + 1);
      if (!safe(timestamp) || timestamp > 8640000000000000) inconsistent();
      const authorization = await prepareCampaignAuthorization(tx, db, uid, { bump: true });
      const common = {
        ...identity(c),
        entityId: r.entityId,
        revision,
        createdAt: old?.createdAt ?? timestamp,
        updatedAt: timestamp,
        deleted: action === 'delete',
      };
      const receipt = {
        operationId: r.operationId,
        action,
        entityId: r.entityId,
        expectedRevision: r.expectedRevision,
        revision,
        collectionRevision,
      };
      if (action === 'save') {
        const e = r.entity;
        tx.set(ref, {
          ...common,
          name: e.name,
          aliases: e.aliases,
          category: e.category,
          summary: e.summary,
          relationCount: e.relations.length,
          isPublic: false,
        });
        tx.set(bodyRef, {
          ...identity(c),
          entityId: r.entityId,
          revision,
          details: e.details,
          structuredDetails: e.structuredDetails,
          relations: e.relations,
        });
      } else {
        tx.set(ref, common);
        tx.delete(bodyRef);
      }
      tx.update(db.doc(c.path), { loreVersion: collectionRevision, updatedAt: timestamp });
      authorization.commit();
      const record = operation(c, r, action, requestHash, receipt);
      tx.create(p.receiptRef, record);
      return confirmed(c, record);
    });
  }
  return {
    async listAdventureLore(uid, data) {
      scopeInput(uid, data, ['scope', 'category', 'cursor', 'limit'], true);
      if (
        !['adventure', 'universe'].includes(data.scope) ||
        (data.category !== undefined && !categories.includes(data.category))
      )
        fail('invalid-argument', 'Escopo ou categoria inválida.');
      const count = limit(data.limit);
      return db.runTransaction(async (tx) => {
        const c = await readAdventureLoreContext(tx, db, uid, data, true);
        const scope = {
          uid,
          adventureId: c.adventureId,
          adventureToken: c.adventureToken,
          scope: data.scope,
          category: data.category ?? null,
          contextToken: c.contextToken,
        };
        const cursor = cursorDecode(data.cursor, scope);
        const result = {
          ...identity(c),
          scope: data.scope,
          collectionRevision: c.collectionRevision,
          contextToken: c.contextToken,
          items: [],
          nextCursor: null,
        };
        if (data.scope === 'universe' && !c.worldAvailable) return result;
        let q = db.collection(
          data.scope === 'adventure'
            ? c.path + '/lore'
            : 'universes/' + c.root.universeId + '/lore',
        );
        if (data.scope === 'adventure') q = q.where('deleted', '==', false);
        if (data.category !== undefined) q = q.where('category', '==', data.category);
        q = q
          .orderBy('name')
          .orderBy('__name__')
          .limit(count + 1)
          .select(...(data.scope === 'adventure' ? metadataFields : globalMetadataFields));
        if (cursor) q = q.startAfter(cursor.name, cursor.id);
        const docs = (await tx.get(q)).docs;
        for (const doc of docs.slice(0, count)) {
          const v = doc.data();
          if (data.scope === 'adventure') {
            const item = storedMetadata(v, c, doc.id);
            if (item.deleted) inconsistent();
            result.items.push(localSummary(c, item));
          } else if (!v.deleting && !v.deleted) result.items.push(globalSummary(c, doc, v));
        }
        if (docs.length > count) {
          const last = docs[count - 1];
          result.nextCursor = Buffer.from(
            JSON.stringify({ scope, name: last.data().name, id: last.id }),
          ).toString('base64url');
        }
        return bounded(result);
      });
    },
    async getAdventureLore(uid, data) {
      scopeInput(uid, data, ['reference', 'expectedContextToken', 'expectedEntityToken']);
      const reference = referenceInput(data.reference);
      token(data.expectedContextToken);
      token(data.expectedEntityToken);
      return db.runTransaction(async (tx) => {
        const c = await readAdventureLoreContext(tx, db, uid, data);
        if (c.contextToken !== data.expectedContextToken) changed();
        let item;
        if (reference.kind === 'adventure') {
          if (reference.scopeId !== c.adventureId)
            fail('permission-denied', 'Ficha fora da aventura.');
          const meta = storedMetadata(
            (
              await readWorkMetadata(
                tx,
                db.doc(c.path + '/lore/' + reference.entityId),
                metadataFields,
              )
            ).data(),
            c,
            reference.entityId,
          );
          if (!meta || meta.deleted) fail('not-found', 'Ficha indisponível.');
          const summary = localSummary(c, meta);
          if (summary.entityToken !== data.expectedEntityToken) conflict();
          const body = storedBody(
            (await tx.get(db.doc(c.path + '/loreBodies/' + reference.entityId))).data(),
            c,
            meta,
          );
          item = { ...summary, ...body, relations: await relationViews(tx, db, c, body.relations) };
        } else {
          if (reference.scopeId !== c.root.universeId || !c.worldAvailable)
            fail('not-found', 'Ficha indisponível.');
          const ref = db.doc('universes/' + reference.scopeId + '/lore/' + reference.entityId);
          const snap = await readWorkMetadata(tx, ref, globalMetadataFields),
            meta = snap.data();
          if (!meta || meta.deleting || meta.deleted) fail('not-found', 'Ficha indisponível.');
          const summary = globalSummary(c, snap, meta);
          if (summary.entityToken !== data.expectedEntityToken) conflict();
          const v = (await tx.get(ref)).data();
          if (
            typeof (v.details ?? '') !== 'string' ||
            structuredKeys.some((k) => typeof (v.structuredDetails?.[k] ?? '') !== 'string')
          )
            inconsistent();
          item = {
            ...summary,
            details: v.details ?? '',
            structuredDetails: Object.fromEntries(
              structuredKeys.map((k) => [k, v.structuredDetails?.[k] ?? '']),
            ),
            relations: await relationViews(tx, db, c, v.relations ?? []),
          };
        }
        return bounded({
          ...identity(c),
          collectionRevision: c.collectionRevision,
          contextToken: c.contextToken,
          item,
        });
      });
    },
    saveAdventureLore: (uid, data) => mutate(uid, data, 'save'),
    deleteAdventureLore: (uid, data) => mutate(uid, data, 'delete'),
    async resolveAdventureLoreOperation(uid, data) {
      const r = resolverInput(uid, data);
      return db.runTransaction(async (tx) => {
        const c = await readAdventureLoreContext(tx, db, uid, r, false, false);
        const p = await records(tx, c, r, data.action, data.requestHash);
        if (p.previous) return confirmed(c, p.previous);
        if (!p.fence) tx.create(p.fenceRef, operation(c, r, data.action, data.requestHash));
        return canceled(c, r, data.action);
      });
    },
  };
}
