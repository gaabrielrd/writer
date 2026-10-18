import { validateId } from './generation.mjs';
import { workRevision, workLimit, workDate, workConflict } from './workProgressContracts.mjs';
import {
  closed,
  fail,
  id,
  digest,
  sessionFields,
  inconsistent,
  safe,
  form,
  sessionContext,
  envelope,
  storedSession,
  sessionSummary,
  sessionView,
  readSessionMetadata,
  bounded,
  encodeCursor,
  decodeCursor,
  validateReceipt,
} from './campaignSessionsContracts.mjs';

export function createCampaignSessionsService({ db, now = Date.now }) {
  async function mutate(uid, data, action) {
    if (!uid) fail('unauthenticated', 'Entre na sua conta.');
    const keys = [
      'sessionId',
      'operationId',
      'expectedRevision',
      ...(action === 'save'
        ? ['title', 'scheduledDate', 'status', 'summary']
        : action === 'move'
          ? ['expectedCollectionRevision', 'direction']
          : []),
    ];
    closed(data, ['campaignId', 'campaignToken', ...keys]);
    const input = {
      ...data,
      sessionId: validateId(data.sessionId),
      operationId: validateId(data.operationId),
      expectedRevision: workRevision(data.expectedRevision),
    };
    if (action === 'save') {
      Object.assign(input, form(data));
      if (
        input.expectedRevision === 0 &&
        (input.sessionId !== input.operationId || input.status !== 'planned')
      )
        fail('invalid-argument', 'Crie uma sessão Planejada com o identificador da operação.');
    }
    if (action === 'move') {
      workRevision(input.expectedCollectionRevision);
      if (!['up', 'down'].includes(input.direction)) fail('invalid-argument', 'Direção inválida.');
    }
    const fingerprint = digest({ action, input });
    return db.runTransaction(async (tx) => {
      const c = await sessionContext(tx, db, uid, input, keys),
        ref = db.doc(c.path + '/sessions/' + input.sessionId),
        receiptRef = db.doc(`users/${uid}/campaignSessionOperations/${input.operationId}`),
        previous = (await tx.get(receiptRef)).data(),
        current = await readSessionMetadata(tx, ref, c, input.sessionId);
      if (previous) {
        const receipt = validateReceipt(previous, c, input, action, fingerprint);
        if (!current || current.revision < receipt.revision) inconsistent();
        let session = null;
        if (current.revision === receipt.revision) {
          const confirmation = current.deleted
            ? current
            : sessionView(storedSession((await tx.get(ref)).data(), c, input.sessionId));
          if (
            (action === 'delete') !== current.deleted ||
            digest(confirmation) !== previous.confirmationHash
          )
            inconsistent();
          if (!current.deleted) session = confirmation;
        }
        return bounded({ ...envelope(c), receipt, session });
      }
      if (
        current?.revision !== input.expectedRevision &&
        !(current === null && input.expectedRevision === 0)
      )
        workConflict();
      if (current?.deleted || (!current && action !== 'save'))
        fail('not-found', 'Sessão indisponível.');
      if (action === 'move' && c.collectionRevision !== input.expectedCollectionRevision)
        workConflict();
      const revision = input.expectedRevision + 1,
        collectionRevision = c.collectionRevision + 1;
      if (!safe(revision, 1) || !safe(collectionRevision, 1)) inconsistent();
      const timestamp = workDate(now, current?.updatedAt ?? 0);
      if (!safe(timestamp)) inconsistent();
      let order = current?.order ?? c.nextOrder,
        nextOrder = c.nextOrder,
        neighbor = null;
      if (!current) {
        if (!safe(nextOrder + 1, 1)) inconsistent();
        const last = (
          await tx.get(
            db
              .collection(c.path + '/sessions')
              .orderBy('order', 'desc')
              .orderBy('__name__', 'desc')
              .limit(1)
              .select('order'),
          )
        ).docs[0];
        if (last && (!safe(last.data().order, 1) || nextOrder <= last.data().order)) inconsistent();
        nextOrder++;
      }
      if (action === 'move') {
        const direction = input.direction === 'up' ? 'desc' : 'asc';
        const doc = (
          await tx.get(
            db
              .collection(c.path + '/sessions')
              .where('deleted', '==', false)
              .orderBy('order', direction)
              .orderBy('__name__', direction)
              .startAfter(current.order, current.id)
              .limit(1)
              .select(...sessionFields),
          )
        ).docs[0];
        if (!doc) fail('failed-precondition', 'Não há sessão nesta direção.', 'order-boundary');
        const value = storedSession(doc.data(), c, doc.id);
        if (value.deleted || value.order === current.order || !safe(value.revision + 1, 1))
          inconsistent();
        const updatedAt = workDate(now, value.updatedAt);
        if (!safe(updatedAt)) inconsistent();
        neighbor = {
          ref: doc.ref,
          patch: { order: current.order, revision: value.revision + 1, updatedAt },
        };
        order = value.order;
      }
      const metadata = {
        id: input.sessionId,
        schemaVersion: 1,
        ownerId: uid,
        campaignId: c.campaignId,
        campaignToken: c.campaignToken,
        revision,
        order,
        createdAt: current?.createdAt ?? timestamp,
        updatedAt: timestamp,
        deleted: action === 'delete',
      };
      let value = metadata,
        session = null;
      if (action === 'save') value = { ...metadata, ...form(input) };
      else if (action === 'move')
        value = { ...storedSession((await tx.get(ref)).data(), c, input.sessionId), ...metadata };
      if (action !== 'delete') session = sessionView(value);
      const receipt = {
        operationId: input.operationId,
        action,
        sessionId: input.sessionId,
        expectedRevision: input.expectedRevision,
        revision,
        collectionRevision,
      };
      tx.set(ref, value);
      if (neighbor) tx.update(neighbor.ref, neighbor.patch);
      tx.set(c.controlRef, {
        schemaVersion: 1,
        ownerId: uid,
        campaignId: c.campaignId,
        campaignToken: c.campaignToken,
        revision: collectionRevision,
        nextOrder,
      });
      tx.create(receiptRef, {
        schemaVersion: 1,
        ownerId: uid,
        campaignId: c.campaignId,
        campaignToken: c.campaignToken,
        fingerprint,
        receipt,
        confirmationHash: digest(session ?? metadata),
      });
      return bounded({ ...envelope({ ...c, collectionRevision }), receipt, session });
    });
  }
  return {
    async listCampaignSessions(uid, data) {
      const size = workLimit(data?.limit);
      return db.runTransaction(async (tx) => {
        const c = await sessionContext(tx, db, uid, data, ['cursor', 'limit'], true),
          cursor = decodeCursor(data.cursor, c);
        let query = db
          .collection(c.path + '/sessions')
          .where('deleted', '==', false)
          .orderBy('order')
          .orderBy('__name__')
          .limit(size + 1)
          .select(...sessionFields);
        if (cursor) query = query.startAfter(cursor.order, cursor.id);
        const docs = (await tx.get(query)).docs;
        const items = docs.slice(0, size).map((doc) => {
          const value = storedSession(doc.data(), c, doc.id);
          if (value.deleted) inconsistent();
          return sessionSummary(value);
        });
        const last = items.at(-1);
        return bounded({
          ...envelope(c),
          items,
          nextCursor:
            docs.length > size
              ? encodeCursor({
                  version: 1,
                  uid,
                  campaignId: c.campaignId,
                  campaignToken: c.campaignToken,
                  collectionRevision: c.collectionRevision,
                  order: last.order,
                  id: last.id,
                })
              : null,
        });
      });
    },
    async getCampaignSession(uid, data) {
      const sessionId = id(data?.sessionId);
      return db.runTransaction(async (tx) => {
        const c = await sessionContext(tx, db, uid, data, ['sessionId']),
          ref = db.doc(c.path + '/sessions/' + sessionId),
          current = await readSessionMetadata(tx, ref, c, sessionId);
        return bounded({
          ...envelope(c),
          session:
            !current || current.deleted
              ? null
              : sessionView(storedSession((await tx.get(ref)).data(), c, sessionId)),
        });
      });
    },
    saveCampaignSession: (uid, data) => mutate(uid, data, 'save'),
    moveCampaignSession: (uid, data) => mutate(uid, data, 'move'),
    deleteCampaignSession: (uid, data) => mutate(uid, data, 'delete'),
  };
}
