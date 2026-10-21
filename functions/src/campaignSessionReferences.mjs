import { workLimit, workDate, workConflict, workRevision } from './workProgressContracts.mjs';
import { encodeBaseCursor, decodeBaseCursor } from './campaignBaseContracts.mjs';
import { loreRecord, loreState } from './campaignLoreContracts.mjs';
import { loreWindow } from './campaignLoreStorage.mjs';
import { validateId } from './generation.mjs';
import { token } from './campaignSessionsContracts.mjs';
import {
  closed,
  fail,
  readWorkMetadata,
  digest,
  safe,
  bounded,
  scopeFields,
  sourceContextInput,
  scopeInput,
  requestInput,
  ownCampaign,
  activeSession,
  referenceControl,
  identity,
  envelope,
  referenceFields,
  storedReference,
  referenceMetadata,
  optionalLore,
  projectedContext,
  compareSource,
  operationPath,
  fencePath,
  priorRecord,
  confirmed,
  canceled,
  inconsistent,
  sceneFields,
  sceneRecord,
  sceneCandidate,
} from './campaignSessionReferenceContracts.mjs';

export function createCampaignSessionReferencesService({ db, now = Date.now }) {
  const active = async (tx, uid, request) =>
    referenceControl(
      tx,
      db,
      await activeSession(tx, db, await ownCampaign(tx, db, uid, request), request),
    );
  async function records(tx, c, request, action) {
    const fingerprint = digest({ action, request });
    const receiptRef = db.doc(operationPath(c.uid, request.operationId)),
      fenceRef = db.doc(fencePath(c.uid, request.operationId));
    const previous = priorRecord((await tx.get(receiptRef)).data(), c, fingerprint),
      fence = priorRecord((await tx.get(fenceRef)).data(), c, fingerprint);
    if (previous && fence) inconsistent();
    return { fingerprint, receiptRef, fenceRef, previous, fence };
  }
  async function mutate(uid, data, action) {
    const request = requestInput(uid, data, action);
    return db.runTransaction(async (tx) => {
      const own = await ownCampaign(tx, db, uid, request),
        prior = await records(tx, own, request, action);
      if (prior.previous) return confirmed(own, prior.previous, request, action);
      if (prior.fence) return canceled(own, request, action);
      const c = await referenceControl(tx, db, await activeSession(tx, db, own, request));
      if (c.referenceCollectionRevision !== request.expectedReferenceCollectionRevision)
        workConflict();
      const ref = db.doc(c.path + '/sessionReferences/' + request.referenceId);
      const old = storedReference(
        (await readWorkMetadata(tx, ref, referenceFields)).data(),
        c,
        request.referenceId,
      );
      if (action === 'add' && old) fail('already-exists', 'Identificador de vínculo já utilizado.');
      if (action === 'remove') {
        if (!old || old.deleted) fail('not-found', 'Vínculo indisponível.');
        if (old.revision !== request.expectedRevision) workConflict();
      } else {
        const context = await optionalLore(tx, db, c),
          sourceContext = projectedContext(context);
        compareSource(request.sourceContext, sourceContext);
        if (!context) fail('not-found', 'Material indisponível.');
        const target =
          request.target.kind === 'scene'
            ? await sceneRecord(tx, db, context, request.target.sourceKey)
            : await loreRecord(tx, db, context, request.target.sourceKey);
        if (!target || target.mode === 'removed') fail('not-found', 'Ficha indisponível.');
        const duplicate = await tx.get(
          db
            .collection(c.path + '/sessionReferences')
            .where('sessionId', '==', c.sessionId)
            .where('deleted', '==', false)
            .where('target.kind', '==', request.target.kind)
            .where('target.sourceKey', '==', request.target.sourceKey)
            .limit(1)
            .select(...referenceFields),
        );
        if (duplicate.docs.length) {
          storedReference(duplicate.docs[0].data(), c, duplicate.docs[0].id);
          fail(
            'failed-precondition',
            'A ficha já está vinculada nesta sessão.',
            'reference-already-linked',
          );
        }
      }
      const revision = action === 'add' ? 1 : old.revision + 1,
        referenceCollectionRevision = c.referenceCollectionRevision + 1;
      if (!safe(revision, 1) || !safe(referenceCollectionRevision, 1)) inconsistent();
      const timestamp = workDate(now, old?.updatedAt ?? 0);
      if (!safe(timestamp)) inconsistent();
      const value = {
        ...identity(c),
        id: request.referenceId,
        revision,
        createdAt: old?.createdAt ?? timestamp,
        updatedAt: timestamp,
        deleted: action === 'remove',
        ...(action === 'add' ? { target: request.target } : {}),
      };
      const receipt = {
        operationId: request.operationId,
        action,
        referenceId: request.referenceId,
        sessionId: request.sessionId,
        expectedSessionRevision: request.expectedSessionRevision,
        expectedReferenceCollectionRevision: request.expectedReferenceCollectionRevision,
        revision,
        referenceCollectionRevision,
      };
      tx.set(ref, value);
      tx.set(c.controlRef, { ...identity(c), revision: referenceCollectionRevision });
      tx.create(prior.receiptRef, { ...identity(c), fingerprint: prior.fingerprint, receipt });
      return { ...identity(c), kind: 'confirmed', receipt };
    });
  }
  return {
    async listCampaignSessionReferences(uid, data) {
      if (!['references', 'candidates'].includes(data?.view))
        fail('invalid-argument', 'Vista inválida.');
      const kind = data.kind ?? 'lore';
      if (!['lore', 'scene'].includes(kind)) fail('invalid-argument', 'Tipo inválido.');
      const sceneCandidates = data.view === 'candidates' && kind === 'scene';
      scopeInput(uid, data, [
        ...scopeFields,
        'view',
        'cursor',
        'limit',
        'kind',
        ...(sceneCandidates ? ['archive'] : []),
        ...(data.view === 'candidates' ? ['sourceContext'] : []),
      ]);
      if (data.view === 'candidates') sourceContextInput(data.sourceContext);
      const archive = sceneCandidates ? (data.archive ?? 'active') : null;
      if (sceneCandidates && !['active', 'archived', 'all'].includes(archive))
        fail('invalid-argument', 'Arquivo inválido.');
      const size = workLimit(data.limit);
      return db.runTransaction(async (tx) => {
        const c = await active(tx, uid, data),
          context = await optionalLore(tx, db, c),
          sourceContext = projectedContext(context);
        if (data.view === 'candidates') compareSource(data.sourceContext, sourceContext);
        const scope = {
          ...envelope(c),
          view: data.view,
          kind,
          ...(sceneCandidates ? { archive } : {}),
          sourceContext,
        };
        const cursor = decodeBaseCursor(
          data.cursor,
          scope,
          data.view === 'references'
            ? ['key', 'date']
            : sceneCandidates
              ? ['key', 'order']
              : ['key'],
        );
        if (cursor) {
          if (data.view === 'candidates') {
            token(cursor.key);
            if (
              sceneCandidates &&
              (typeof cursor.order !== 'string' ||
                !cursor.order ||
                Buffer.byteLength(cursor.order) > 1500)
            )
              fail('invalid-argument', 'Página inválida.');
          } else {
            validateId(cursor.key);
            if (!safe(cursor.date) || cursor.date > 8640000000000000)
              fail('invalid-argument', 'Página inválida.');
          }
        }
        const items = [];
        let nextCursor = null;
        if (data.view === 'references') {
          if (cursor) workRevision(cursor.date);
          let query = db
            .collection(c.path + '/sessionReferences')
            .where('sessionId', '==', c.sessionId)
            .where('deleted', '==', false)
            .where('target.kind', '==', kind)
            .orderBy('createdAt')
            .orderBy('__name__')
            .limit(size + 1)
            .select(...referenceFields);
          if (cursor) query = query.startAfter(cursor.date, cursor.key);
          const docs = (await tx.get(query)).docs;
          for (const doc of docs.slice(0, size)) {
            const value = storedReference(doc.data(), c, doc.id);
            if (value.deleted) inconsistent();
            if (value.target.kind !== kind) inconsistent();
            const target = context
              ? kind === 'scene'
                ? await sceneRecord(tx, db, context, value.target.sourceKey)
                : await loreRecord(tx, db, context, value.target.sourceKey)
              : null;
            items.push(
              !target || target.mode === 'removed'
                ? { ...referenceMetadata(value), available: false }
                : {
                    ...referenceMetadata(value),
                    available: true,
                    target:
                      kind === 'scene'
                        ? sceneCandidate(target, context, target.sourceKey)
                        : {
                            kind: 'lore',
                            sourceKey: target.sourceKey,
                            name: target.name,
                            category: target.category,
                            revision: target.revision,
                            mode: target.mode,
                            legacy: target.legacy ?? false,
                          },
                  },
            );
          }
          if (docs.length > size) {
            const last = docs[size - 1];
            nextCursor = encodeBaseCursor({
              version: 1,
              scope,
              key: last.id,
              date: last.data().createdAt,
            });
          }
        } else if (context && sceneCandidates) {
          if (cursor) {
            const after = await sceneRecord(tx, db, context, cursor.key);
            if (
              !after ||
              after.orderKey !== cursor.order ||
              (archive !== 'all' && after.archived !== (archive === 'archived'))
            )
              fail('invalid-argument', 'Página inválida.');
          }
          let query = db.collection(context.path + '/items').where('kind', '==', 'scene');
          if (archive !== 'all') query = query.where('archived', '==', archive === 'archived');
          query = query
            .orderBy('orderKey')
            .orderBy('__name__')
            .limit(size + 1)
            .select(...sceneFields);
          if (cursor) query = query.startAfter(cursor.order, cursor.key);
          const docs = (await tx.get(query)).docs;
          for (const doc of docs.slice(0, size))
            items.push(sceneCandidate(doc.data(), context, doc.id));
          if (docs.length > size) {
            const last = docs[size - 1];
            nextCursor = encodeBaseCursor({
              version: 1,
              scope,
              key: last.id,
              order: last.data().orderKey,
            });
          }
        } else if (context) {
          const window = await loreWindow(tx, db, context, cursor?.key, size);
          for (const key of window.keys) {
            const target = await loreRecord(tx, db, context, key, window.items.get(key));
            if (target && target.mode !== 'removed')
              items.push({
                sourceKey: target.sourceKey,
                name: target.name,
                category: target.category,
                revision: target.revision,
                mode: target.mode,
                legacy: target.legacy ?? false,
              });
          }
          if (window.more)
            nextCursor = encodeBaseCursor({ version: 1, scope, key: window.keys.at(-1) });
        }
        return bounded({ ...envelope(c), view: data.view, sourceContext, items, nextCursor });
      });
    },
    addCampaignSessionReference: (uid, data) => mutate(uid, data, 'add'),
    removeCampaignSessionReference: (uid, data) => mutate(uid, data, 'remove'),
    async readCampaignSessionLoreReference(uid, data) {
      scopeInput(uid, data, [
        ...scopeFields,
        'referenceId',
        'expectedRevision',
        'expectedReferenceCollectionRevision',
        'sourceContext',
      ]);
      sourceContextInput(data.sourceContext);
      if (
        typeof data.referenceId !== 'string' ||
        !/^[a-zA-Z0-9-]{16,80}$/.test(data.referenceId) ||
        !workRevision(data.expectedRevision)
      )
        fail('invalid-argument', 'Vínculo inválido.');
      workRevision(data.expectedReferenceCollectionRevision);
      return db.runTransaction(async (tx) => {
        const c = await active(tx, uid, data);
        if (c.referenceCollectionRevision !== data.expectedReferenceCollectionRevision)
          workConflict();
        const value = storedReference(
          (
            await readWorkMetadata(
              tx,
              db.doc(c.path + '/sessionReferences/' + data.referenceId),
              referenceFields,
            )
          ).data(),
          c,
          data.referenceId,
        );
        if (!value || value.deleted) fail('not-found', 'Vínculo indisponível.');
        if (value.revision !== data.expectedRevision) workConflict();
        if (value.target.kind !== 'lore') fail('invalid-argument', 'O vínculo não é de lore.');
        const context = await optionalLore(tx, db, c),
          sourceContext = projectedContext(context);
        compareSource(data.sourceContext, sourceContext);
        const target = context ? await loreRecord(tx, db, context, value.target.sourceKey) : null;
        let material = null;
        if (target && target.mode !== 'removed') {
          const projected = await loreState(tx, db, context, target);
          material = {
            kind: 'lore',
            sourceKey: projected.sourceKey,
            revision: projected.revision,
            mode: projected.mode,
            legacy: projected.legacy,
            entity: projected.entity,
          };
        }
        return bounded({
          ...envelope(c),
          referenceId: value.id,
          referenceRevision: value.revision,
          sourceContext,
          material,
        });
      });
    },
    async resolveCampaignSessionReferenceOperation(uid, data) {
      if (!uid) fail('unauthenticated', 'Entre na sua conta.');
      closed(data, ['action', 'request', 'intent']);
      if (!['add', 'remove'].includes(data.action) || data.intent !== 'cancel')
        fail('invalid-argument', 'Intenção inválida.');
      const request = requestInput(uid, data.request, data.action);
      return db.runTransaction(async (tx) => {
        const c = await ownCampaign(tx, db, uid, request),
          prior = await records(tx, c, request, data.action);
        if (prior.previous) return confirmed(c, prior.previous, request, data.action);
        if (!prior.fence)
          tx.create(prior.fenceRef, { ...identity(c), fingerprint: prior.fingerprint });
        return canceled(c, request, data.action);
      });
    },
  };
}
