import { workLimit, workDate } from './workProgressContracts.mjs';
import {
  closed,
  fail,
  workRevision,
  workConflict,
  readWorkMetadata,
  digest,
  safe,
  bounded,
  inconsistent,
  identity,
  operationPath,
  fencePath,
  itemFields,
  linkFields,
  scopeInput,
  sessionInput,
  requestInput,
  ownCampaign,
  activeSession,
  control,
  controlValue,
  storedItem,
  storedLink,
  itemSummary,
  linkSummary,
  storedBody,
  prior,
  confirmed,
  canceled,
  encodeCursor,
  decodeCursor,
  statuses,
} from './campaignPreparationContracts.mjs';
import { validateId } from './generation.mjs';

export function createCampaignPreparationService({ db, now = Date.now }) {
  const itemPath = (c, id) => c.path + '/preparationItems/' + id;
  const bodyPath = (c, id) => c.path + '/preparationBodies/' + id;
  const linkPath = (c, id) => c.path + '/sessionPreparationLinks/' + id;
  async function readItem(tx, c, id) {
    return storedItem(
      (await readWorkMetadata(tx, db.doc(itemPath(c, id)), itemFields)).data(),
      c,
      id,
    );
  }
  async function readLink(tx, c, id) {
    return storedLink(
      (await readWorkMetadata(tx, db.doc(linkPath(c, id)), linkFields)).data(),
      c,
      id,
    );
  }
  async function bodyHeader(tx, c, item) {
    const v = (
      await readWorkMetadata(tx, db.doc(bodyPath(c, item.id)), [
        'schemaVersion',
        'ownerId',
        'campaignId',
        'campaignToken',
        'id',
        'kind',
        'revision',
      ])
    ).data();
    if (
      !v ||
      v.schemaVersion !== 1 ||
      v.ownerId !== c.uid ||
      v.campaignId !== c.campaignId ||
      v.campaignToken !== c.campaignToken ||
      v.id !== item.id ||
      v.kind !== item.kind ||
      v.revision !== item.revision
    )
      inconsistent();
  }
  async function records(tx, c, request, action) {
    const fingerprint = digest({ action, request });
    const receiptRef = db.doc(operationPath(c.uid, request.operationId));
    const fenceRef = db.doc(fencePath(c.uid, request.operationId));
    const previous = prior(
      (await tx.get(receiptRef)).data(),
      c,
      request,
      action,
      fingerprint,
      true,
    );
    const fence = prior((await tx.get(fenceRef)).data(), c, request, action, fingerprint, false);
    if (previous && fence) inconsistent();
    return { fingerprint, receiptRef, fenceRef, previous, fence };
  }
  const operation = (c, p, request, action, receipt) => ({
    ...identity(c),
    action,
    operationId: request.operationId,
    fingerprint: p.fingerprint,
    ...(receipt ? { receipt } : {}),
  });
  function timestamp(previous = 0) {
    const value = workDate(now, previous);
    if (!safe(value) || value > 8640000000000000) inconsistent();
    return value;
  }
  const checked = (value) => {
    if (!safe(value, 1)) inconsistent();
    return value;
  };
  async function nextOrder(tx, c, links = false) {
    const next = links ? c.linkNextOrder : c.itemNextOrder;
    checked(next + 1);
    let query = db
      .collection(c.path + (links ? '/sessionPreparationLinks' : '/preparationItems'))
      .orderBy('order', 'desc')
      .orderBy('__name__', 'desc')
      .limit(1)
      .select('order');
    if (links) query = query.where('sessionId', '==', c.sessionId);
    const last = (await tx.get(query)).docs[0];
    if (last && (!safe(last.data().order, 1) || last.data().order >= next)) inconsistent();
    return next;
  }
  async function neighbor(tx, c, current, direction, links = false) {
    const sort = direction === 'up' ? 'desc' : 'asc';
    let query = db
      .collection(c.path + (links ? '/sessionPreparationLinks' : '/preparationItems'))
      .where('deleted', '==', false);
    query = links
      ? query.where('sessionId', '==', c.sessionId)
      : query.where('kind', '==', current.kind);
    const doc = (
      await tx.get(
        query
          .orderBy('order', sort)
          .orderBy('__name__', sort)
          .startAfter(current.order, current.id)
          .limit(1)
          .select(...(links ? linkFields : itemFields)),
      )
    ).docs[0];
    if (!doc) fail('failed-precondition', 'Não há item nesta direção.', 'order-boundary');
    const value = links ? storedLink(doc.data(), c, doc.id) : storedItem(doc.data(), c, doc.id);
    if (value.deleted || value.order === current.order || (!links && value.kind !== current.kind))
      inconsistent();
    checked(value.revision + 1);
    return { ref: doc.ref, value, updatedAt: timestamp(value.updatedAt) };
  }
  async function mutateItem(uid, data, action) {
    const request = requestInput(uid, data, action);
    return db.runTransaction(async (tx) => {
      const own = await ownCampaign(tx, db, uid, request);
      const p = await records(tx, own, request, action);
      if (p.previous) return confirmed(own, p.previous);
      if (p.fence) return canceled(own, request, action);
      const c = await control(tx, db, own);
      if (c.itemCollectionRevision !== request.expectedItemCollectionRevision) workConflict();
      const old = await readItem(tx, c, request.itemId);
      if ((old?.revision ?? 0) !== request.expectedRevision) workConflict();
      if (old?.deleted || (!old && action !== 'save-item'))
        fail('not-found', 'Item indisponível.', 'item-unavailable');
      if (old && action === 'save-item' && old.kind !== request.kind)
        fail('invalid-argument', 'O tipo do item não pode ser alterado.');
      if (old) await bodyHeader(tx, c, old);
      else if ((await readWorkMetadata(tx, db.doc(bodyPath(c, request.itemId)), [])).exists)
        inconsistent();
      const revision = checked(request.expectedRevision + 1);
      const itemCollectionRevision = checked(c.itemCollectionRevision + 1);
      let order = old?.order,
        next = c.itemNextOrder,
        adjacent = null;
      if (!old) {
        order = await nextOrder(tx, c);
        next++;
      }
      if (action === 'move-item') {
        adjacent = await neighbor(tx, c, old, request.direction);
        await bodyHeader(tx, c, adjacent.value);
        order = adjacent.value.order;
      }
      const updatedAt = timestamp(old?.updatedAt ?? 0);
      const metadata = {
        ...identity(c),
        id: request.itemId,
        kind: old?.kind ?? request.kind,
        revision,
        order,
        createdAt: old?.createdAt ?? updatedAt,
        updatedAt,
        deleted: action === 'delete-item',
      };
      const value =
        action === 'delete-item'
          ? metadata
          : {
              ...metadata,
              title: action === 'save-item' ? request.title : old.title,
              status: action === 'save-item' ? request.status : old.status,
            };
      const receipt = {
        operationId: request.operationId,
        action,
        itemId: request.itemId,
        expectedRevision: request.expectedRevision,
        revision,
        itemCollectionRevision,
      };
      tx.set(db.doc(itemPath(c, request.itemId)), value);
      if (action === 'save-item')
        tx.set(db.doc(bodyPath(c, request.itemId)), {
          ...identity(c),
          id: request.itemId,
          kind: request.kind,
          revision,
          body: request.body,
        });
      else if (action === 'delete-item') tx.delete(db.doc(bodyPath(c, request.itemId)));
      else tx.update(db.doc(bodyPath(c, request.itemId)), { revision });
      if (adjacent) {
        tx.update(adjacent.ref, {
          order: old.order,
          revision: adjacent.value.revision + 1,
          updatedAt: adjacent.updatedAt,
        });
        tx.update(db.doc(bodyPath(c, adjacent.value.id)), {
          revision: adjacent.value.revision + 1,
        });
      }
      tx.set(c.itemControlRef, controlValue(c, itemCollectionRevision, next));
      tx.create(p.receiptRef, operation(c, p, request, action, receipt));
      return confirmed(c, { receipt });
    });
  }
  async function mutateLink(uid, data, action) {
    const request = requestInput(uid, data, action);
    return db.runTransaction(async (tx) => {
      const own = await ownCampaign(tx, db, uid, request);
      const p = await records(tx, own, request, action);
      if (p.previous) return confirmed(own, p.previous);
      if (p.fence) return canceled(own, request, action);
      const c = await control(tx, db, await activeSession(tx, db, own, request), true);
      if (c.linkCollectionRevision !== request.expectedLinkCollectionRevision) workConflict();
      const old = await readLink(tx, c, request.linkId);
      if (action === 'add-link' && old)
        fail('already-exists', 'Identificador de vínculo já utilizado.');
      if (action !== 'add-link') {
        if (!old || old.deleted) fail('not-found', 'Vínculo indisponível.', 'link-unavailable');
        if (old.revision !== request.expectedRevision) workConflict();
      } else {
        const itemContext = await control(tx, db, c);
        const item = await readItem(tx, itemContext, request.itemId);
        if (!item || item.deleted) fail('not-found', 'Item indisponível.', 'item-unavailable');
        if (item.revision !== request.expectedItemRevision) workConflict();
        const duplicates = (
          await tx.get(
            db
              .collection(c.path + '/sessionPreparationLinks')
              .where('sessionId', '==', c.sessionId)
              .where('deleted', '==', false)
              .where('itemId', '==', request.itemId)
              .limit(1)
              .select(...linkFields),
          )
        ).docs;
        if (duplicates.length) {
          storedLink(duplicates[0].data(), c, duplicates[0].id);
          fail(
            'failed-precondition',
            'O item já está vinculado nesta sessão.',
            'preparation-already-linked',
          );
        }
      }
      const revision = checked(request.expectedRevision + 1);
      const linkCollectionRevision = checked(c.linkCollectionRevision + 1);
      let order = old?.order,
        next = c.linkNextOrder,
        adjacent = null;
      if (!old) {
        order = await nextOrder(tx, c, true);
        next++;
      }
      if (action === 'move-link') {
        adjacent = await neighbor(tx, c, old, request.direction, true);
        order = adjacent.value.order;
      }
      const updatedAt = timestamp(old?.updatedAt ?? 0);
      const value = {
        ...identity(c),
        id: request.linkId,
        sessionId: c.sessionId,
        revision,
        order,
        createdAt: old?.createdAt ?? updatedAt,
        updatedAt,
        deleted: action === 'remove-link',
        ...(action === 'remove-link' ? {} : { itemId: old?.itemId ?? request.itemId }),
      };
      const receipt = {
        operationId: request.operationId,
        action,
        linkId: request.linkId,
        sessionId: request.sessionId,
        expectedSessionRevision: request.expectedSessionRevision,
        expectedRevision: request.expectedRevision,
        revision,
        linkCollectionRevision,
      };
      tx.set(db.doc(linkPath(c, request.linkId)), value);
      if (adjacent)
        tx.update(adjacent.ref, {
          order: old.order,
          revision: adjacent.value.revision + 1,
          updatedAt: adjacent.updatedAt,
        });
      tx.set(c.linkControlRef, controlValue(c, linkCollectionRevision, next, true));
      tx.create(p.receiptRef, operation(c, p, request, action, receipt));
      return confirmed(c, { receipt });
    });
  }
  return {
    async listCampaignPreparationItems(uid, data) {
      scopeInput(uid, data, ['kind', 'view', 'cursor', 'limit'], true);
      if (!Object.hasOwn(statuses, data.kind) || !['all', 'pending'].includes(data.view))
        fail('invalid-argument', 'Tipo ou vista inválida.');
      const limit = workLimit(data.limit);
      return db.runTransaction(async (tx) => {
        const c = await control(tx, db, await ownCampaign(tx, db, uid, data, true));
        const scope = {
          ...identity(c),
          itemCollectionRevision: c.itemCollectionRevision,
          kind: data.kind,
          view: data.view,
        };
        const cursor = decodeCursor(data.cursor, scope);
        let query = db
          .collection(c.path + '/preparationItems')
          .where('deleted', '==', false)
          .where('kind', '==', data.kind);
        if (data.view === 'pending')
          query =
            data.kind === 'clue'
              ? query.where('status', '==', 'pending')
              : query.where('status', 'in', ['available', 'active']);
        query = query
          .orderBy('order')
          .orderBy('__name__')
          .limit(limit + 1)
          .select(...itemFields);
        if (cursor) query = query.startAfter(cursor.order, cursor.id);
        const docs = (await tx.get(query)).docs;
        const items = docs.slice(0, limit).map((doc) => {
          const value = storedItem(doc.data(), c, doc.id);
          if (
            value.deleted ||
            value.kind !== data.kind ||
            (data.view === 'pending' && !['pending', 'available', 'active'].includes(value.status))
          )
            inconsistent();
          return itemSummary(value);
        });
        return bounded({
          ...identity(c),
          itemCollectionRevision: c.itemCollectionRevision,
          items,
          nextCursor: docs.length > limit ? encodeCursor(scope, items.at(-1)) : null,
        });
      });
    },
    async getCampaignPreparationItem(uid, data) {
      scopeInput(uid, data, ['itemId', 'expectedRevision']);
      validateId(data.itemId);
      if (!workRevision(data.expectedRevision)) fail('invalid-argument', 'Revisão inválida.');
      return db.runTransaction(async (tx) => {
        const c = await control(tx, db, await ownCampaign(tx, db, uid, data));
        const item = await readItem(tx, c, data.itemId);
        if (!item || item.deleted) fail('not-found', 'Item indisponível.', 'item-unavailable');
        if (item.revision !== data.expectedRevision) workConflict();
        const body = storedBody((await tx.get(db.doc(bodyPath(c, item.id)))).data(), c, item);
        return bounded({
          ...identity(c),
          itemCollectionRevision: c.itemCollectionRevision,
          item: { ...itemSummary(item), body },
        });
      });
    },
    saveCampaignPreparationItem: (uid, data) => mutateItem(uid, data, 'save-item'),
    deleteCampaignPreparationItem: (uid, data) => mutateItem(uid, data, 'delete-item'),
    moveCampaignPreparationItem: (uid, data) => mutateItem(uid, data, 'move-item'),
    async listCampaignSessionPreparationLinks(uid, data) {
      scopeInput(uid, data, ['sessionId', 'expectedSessionRevision', 'cursor', 'limit']);
      sessionInput(data);
      const limit = workLimit(data.limit);
      return db.runTransaction(async (tx) => {
        const c = await control(
          tx,
          db,
          await control(
            tx,
            db,
            await activeSession(tx, db, await ownCampaign(tx, db, uid, data), data),
            true,
          ),
        );
        const scope = {
          ...identity(c),
          sessionId: c.sessionId,
          sessionRevision: c.sessionRevision,
          itemCollectionRevision: c.itemCollectionRevision,
          linkCollectionRevision: c.linkCollectionRevision,
        };
        const cursor = decodeCursor(data.cursor, scope);
        let query = db
          .collection(c.path + '/sessionPreparationLinks')
          .where('sessionId', '==', c.sessionId)
          .where('deleted', '==', false)
          .orderBy('order')
          .orderBy('__name__')
          .limit(limit + 1)
          .select(...linkFields);
        if (cursor) query = query.startAfter(cursor.order, cursor.id);
        const docs = (await tx.get(query)).docs;
        const items = [];
        for (const doc of docs.slice(0, limit)) {
          const link = storedLink(doc.data(), c, doc.id);
          if (link.deleted) inconsistent();
          const item = await readItem(tx, c, link.itemId);
          if (!item) inconsistent();
          items.push({
            ...linkSummary(link),
            ...(item.deleted
              ? { available: false }
              : { available: true, target: itemSummary(item) }),
          });
        }
        return bounded({
          ...scope,
          items,
          nextCursor: docs.length > limit ? encodeCursor(scope, items.at(-1)) : null,
        });
      });
    },
    addCampaignSessionPreparationLink: (uid, data) => mutateLink(uid, data, 'add-link'),
    removeCampaignSessionPreparationLink: (uid, data) => mutateLink(uid, data, 'remove-link'),
    moveCampaignSessionPreparationLink: (uid, data) => mutateLink(uid, data, 'move-link'),
    async resolveCampaignPreparationOperation(uid, data) {
      closed(data, ['action', 'request', 'intent']);
      if (data.intent !== 'cancel') fail('invalid-argument', 'Intenção inválida.');
      const request = requestInput(uid, data.request, data.action);
      return db.runTransaction(async (tx) => {
        const c = await ownCampaign(tx, db, uid, request);
        const p = await records(tx, c, request, data.action);
        if (p.previous) return confirmed(c, p.previous);
        if (!p.fence) tx.create(p.fenceRef, operation(c, p, request, data.action));
        return canceled(c, request, data.action);
      });
    },
  };
}
