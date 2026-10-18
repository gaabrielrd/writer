import { workLimit, workDate, workConflict } from './workProgressContracts.mjs';
import {
  decodeBaseCursor,
  encodeBaseCursor,
  CAPTURE_WRITE_BYTES,
} from './campaignBaseContracts.mjs';
import {
  closed,
  fail,
  digest,
  hashId,
  headerFields,
  operationDescriptor,
  operationRef,
  verifyOperation,
  operationMetadata,
  budget,
  loreContext,
  loreEnvelope,
  loreRecord,
  requireTargets,
  entityInput,
  loreState,
  bodyPlan,
  bodyRefs,
  variantChunkId,
  confirmationHash,
} from './campaignLoreContracts.mjs';
import { sealedRequest, decryptEntity, activeOperation } from './campaignVariantRecovery.mjs';

const listFields = ['sourceKey', 'origin', 'kind', 'title', 'structured.category'];
export function createCampaignLoreService({ db, now = Date.now }) {
  async function mutate(uid, data, action) {
    if (!uid) fail('unauthenticated', 'Entre na sua conta.');
    closed(data, [...headerFields, ...(action === 'save' ? ['relatedSourceKeys', 'sealed'] : [])]);
    const descriptor = operationDescriptor(uid, data, action),
      sealed = action === 'save' ? sealedRequest(data.sealed) : null,
      fingerprint = digest({ descriptor, ...(sealed ? { sealed } : {}) });
    return db.runTransaction(async (tx) => {
      const context = await loreContext(tx, db, uid, data),
        record = await loreRecord(tx, db, context, descriptor.sourceKey);
      if (!record) fail('not-found', 'Ficha indisponível.');
      if (action === 'save') await requireTargets(tx, db, context, descriptor.relatedSourceKeys);
      const opRef = operationRef(db, uid, descriptor.operationId),
        previous = verifyOperation((await tx.get(opRef)).data(), descriptor);
      if (previous?.state === 'canceled') activeOperation(previous);
      if (previous?.fingerprint && previous.fingerprint !== fingerprint)
        fail('invalid-argument', 'Operação utilizada com outros bytes ou ação.');
      if (previous?.state === 'committed') {
        if (
          record.revision !== previous.revision ||
          confirmationHash(record.overlay) !== previous.confirmationHash
        )
          workConflict();
        return budget({ ...loreEnvelope(context), item: await loreState(tx, db, context, record) });
      }
      if (record.revision !== descriptor.expectedRevision) workConflict();
      const allowed = {
        save: ['base', 'override'],
        remove: ['base', 'override'],
        restore: ['removed'],
        discard: ['override'],
      };
      if (!allowed[action].includes(record.mode))
        fail('failed-precondition', 'Esta ação não se aplica ao estado atual da ficha.');
      let entity, preparedBody;
      const revision = record.revision + 1,
        collectionRevision = context.collectionRevision + 1;
      if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(collectionRevision))
        fail('failed-precondition', 'As revisões do lore estão inconsistentes.');
      if (action === 'save') {
        if (!previous || previous.closed || !previous.key)
          fail('failed-precondition', 'Prepare o pedido antes de salvar.', 'operation-unconfirmed');
        entity = entityInput(decryptEntity(previous, descriptor, sealed), descriptor.sourceKey);
        const actualKeys = [
          ...new Set(entity.relations.map((relation) => relation.targetKey)),
        ].sort();
        if (digest(actualKeys) !== digest(descriptor.relatedSourceKeys))
          fail('invalid-argument', 'Os alvos não correspondem à preparação imutável.');
        preparedBody = bodyPlan(context, descriptor.sourceKey, revision, entity);
      }
      const timestamp = workDate(now, record.overlay?.updatedAt ?? 0),
        mode =
          action === 'save'
            ? 'override'
            : action === 'remove'
              ? 'removed'
              : action === 'restore'
                ? record.overlay.previousMode
                : 'base';
      const overlay = {
        schemaVersion: 1,
        ownerId: uid,
        campaignId: context.campaignId,
        campaignToken: context.campaignToken,
        baseId: context.base.id,
        sourceKey: descriptor.sourceKey,
        revision,
        mode,
        createdAt: record.overlay?.createdAt ?? timestamp,
        updatedAt: timestamp,
        name:
          action === 'save' ? entity.name : action === 'discard' ? record.item.title : record.name,
        category:
          action === 'save'
            ? entity.category
            : action === 'discard'
              ? record.item.structured.category
              : record.category,
        manifest:
          action === 'save'
            ? preparedBody.manifest
            : action === 'discard'
              ? null
              : (record.overlay?.manifest ?? null),
        ...(action === 'remove' ? { previousMode: record.mode } : {}),
      };
      const nextRecord = {
          ...record,
          overlay,
          revision,
          mode,
          name: overlay.name,
          category: overlay.category,
        },
        nextContext = { ...context, collectionRevision };
      const result = budget({
        ...loreEnvelope(nextContext),
        item: await loreState(tx, db, nextContext, nextRecord, entity),
      });
      const receipt = {
        ...(previous ?? operationMetadata(descriptor)),
        state: 'committed',
        fingerprint,
        revision,
        confirmationHash: confirmationHash(overlay),
      };
      const control = {
        schemaVersion: 1,
        ownerId: uid,
        campaignId: context.campaignId,
        campaignToken: context.campaignToken,
        baseId: context.base.id,
        revision: collectionRevision,
      };
      const chunks = (preparedBody?.chunks ?? []).map((value, index) => ({
        ref: db.doc(
          context.lorePath +
            '/loreVariantBodies/' +
            variantChunkId(context, descriptor.sourceKey, revision, index),
        ),
        value,
      }));
      const oldRefs = ['save', 'discard'].includes(action)
        ? bodyRefs(db, context, record.overlay)
        : [];
      budget(
        {
          overlay,
          receipt,
          control,
          chunks: chunks.map(({ ref, value }) => ({ path: ref.path, value })),
          deletes: oldRefs.map((ref) => ref.path),
        },
        CAPTURE_WRITE_BYTES,
      );
      for (const ref of oldRefs) tx.delete(ref);
      for (const { ref, value } of chunks) tx.create(ref, value);
      tx.set(db.doc(context.lorePath + '/loreVariants/' + descriptor.sourceKey), overlay);
      tx.set(context.controlRef, control);
      tx.set(opRef, receipt);
      return result;
    });
  }
  return {
    async listCampaignLore(uid, data) {
      if (!uid) fail('unauthenticated', 'Entre na sua conta.');
      closed(data, ['campaignId', 'campaignToken', 'baseId', 'view', 'cursor', 'limit']);
      const size = workLimit(data.limit),
        view = data.view ?? 'active';
      if (!['active', 'removed'].includes(view))
        fail('invalid-argument', 'Filtro de lore inválido.');
      return db.runTransaction(async (tx) => {
        const context = await loreContext(tx, db, uid, data, true),
          envelope = loreEnvelope(context),
          scope = {
            uid,
            campaignId: context.campaignId,
            campaignToken: context.campaignToken,
            baseId: context.base.id,
            view,
            projectionToken: envelope.projectionToken,
            collectionRevision: context.collectionRevision,
          },
          cursor = decodeBaseCursor(data.cursor, scope);
        if (cursor) hashId(cursor.key);
        let query = db
          .collection(context.path + '/items')
          .where('kind', '==', 'lore')
          .orderBy('__name__')
          .limit(size + 1)
          .select(...listFields);
        if (cursor) query = query.startAfter(cursor.key);
        const docs = (await tx.get(query)).docs,
          items = [];
        for (const snapshot of docs.slice(0, size)) {
          const record = await loreRecord(tx, db, context, snapshot.id, snapshot.data());
          if (!record || (record.mode === 'removed') !== (view === 'removed')) continue;
          items.push({
            sourceKey: record.sourceKey,
            revision: record.revision,
            mode: record.mode,
            name: record.name,
            category: record.category,
          });
        }
        const nextCursor =
          docs.length > size
            ? encodeBaseCursor({ version: 1, scope, key: docs[size - 1].id })
            : null;
        return budget({ ...envelope, items, nextCursor });
      });
    },
    async getCampaignLore(uid, data) {
      if (!uid) fail('unauthenticated', 'Entre na sua conta.');
      closed(data, ['campaignId', 'campaignToken', 'baseId', 'sourceKey']);
      const key = hashId(data.sourceKey);
      return db.runTransaction(async (tx) => {
        const context = await loreContext(tx, db, uid, data),
          record = await loreRecord(tx, db, context, key);
        return budget({
          ...loreEnvelope(context),
          item: record ? await loreState(tx, db, context, record) : null,
        });
      });
    },
    saveCampaignLoreVariant: (uid, data) => mutate(uid, data, 'save'),
    removeCampaignLore: (uid, data) => mutate(uid, data, 'remove'),
    restoreCampaignLore: (uid, data) => mutate(uid, data, 'restore'),
    discardCampaignLoreVariant: (uid, data) => mutate(uid, data, 'discard'),
  };
}
