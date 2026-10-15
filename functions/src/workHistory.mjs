import { validateId } from './generation.mjs';
import { countVisibleWords } from './visibleWordCount.mjs';
import { assertSceneEnvelope } from './sceneContracts.mjs';
import { createWorkProgressService } from './workProgress.mjs';
import { createWorkProgressLedger } from './workProgressLedger.mjs';
import { prepareLegacyChapterTextWrite } from './workProgressLegacy.mjs';
import { createScenesService } from './scenes.mjs';
import { createAdventureBlocksService } from './adventureBlocks.mjs';
import {
  workProject,
  workLimit,
  workDate,
  workConflict,
  workId,
} from './workProgressContracts.mjs';
import {
  digest,
  workFail,
  historyScope,
  historyResource,
  sourceToken,
  readHistorySource,
  splitHistoryContent,
  versionRef,
  chunkRef,
  versionSummary,
  readHistoryVersion,
  readHistoryChunk,
  historyCursor,
  encodeHistoryCursor,
} from './workHistoryContracts.mjs';

export function createWorkHistoryService({ db, now = Date.now }) {
  const progress = createWorkProgressService({ db, now }),
    ledger = createWorkProgressLedger({ db }),
    scenes = createScenesService({ db, now }),
    blocks = createAdventureBlocksService({ db, now });
  function operation(context, data, method, payload) {
    const id = validateId(data.operationId);
    return {
      id,
      ref: db.doc(`users/${context.uid}/workHistoryOperations/${id}`),
      fingerprint: digest({ method, target: context.target, ...payload }),
    };
  }
  async function receipt(tx, op) {
    const value = (await tx.get(op.ref)).data();
    if (value && value.fingerprint !== op.fingerprint)
      workFail('invalid-argument', 'Operação usada com outros dados.');
    return value;
  }
  function capturePlan(context, resource, id, content, reason, label, timestamp) {
    const chunks = splitHistoryContent(content),
      value = {
        id,
        target: context.target,
        resource,
        createdAt: timestamp,
        reason,
        label,
        wordCount: countVisibleWords(content),
        byteLength: Buffer.byteLength(content),
        contentHash: digest(content),
        chunkCount: chunks.length,
      },
      manifest = { ...value, schemaVersion: 1, resourceKey: digest(resource), deleting: false };
    assertSceneEnvelope(manifest);
    const bodies = chunks.map((text, index) => ({ versionId: id, index, content: text }));
    bodies.forEach(assertSceneEnvelope);
    return {
      version: value,
      commit(tx) {
        tx.create(versionRef(db, context, id), manifest);
        bodies.forEach((body) => tx.create(chunkRef(db, context, id, body.index), body));
      },
    };
  }
  async function activateLegacy(context, resource, expectedSourceToken, op) {
    if (resource.kind !== 'chapter') return;
    const activate = await db.runTransaction(async (tx) => {
      const current = await readHistorySource(tx, db, context, resource);
      if (!current) workFail('not-found', 'Fonte indisponível.');
      if (current.source.sourceToken !== expectedSourceToken) workConflict();
      return !current.root.hasProgressResources;
    });
    if (activate)
      await progress.prepareWorkWordCount(context.uid, {
        target: context.target,
        operationId: 'history-count-' + digest({ uid: context.uid, id: op.id }),
        limit: 1,
      });
  }
  async function restoreResult(context, resource, stored) {
    return db.runTransaction(async (tx) => {
      const current = await readHistorySource(tx, db, context, resource);
      if (!current || digest(current.marker) !== digest(stored.after)) workConflict();
      const previousVersion = await readHistoryVersion(tx, db, context, stored.previousVersionId);
      return { source: current.source, previousVersion: versionSummary(previousVersion) };
    });
  }
  return {
    async getWorkVersionSource(uid, data) {
      const context = historyScope(db, uid, data, ['resource']),
        resource = historyResource(data.resource, context.target);
      try {
        return await db.runTransaction(
          async (tx) => (await readHistorySource(tx, db, context, resource))?.source ?? null,
        );
      } catch (cause) {
        if (cause.code === 'not-found') return null;
        throw cause;
      }
    },
    async createWorkVersion(uid, data) {
      const context = historyScope(db, uid, data, [
          'resource',
          'operationId',
          'expectedSourceToken',
          'label',
        ]),
        resource = historyResource(data.resource, context.target),
        token = sourceToken(data.expectedSourceToken);
      if (data.label != null && (typeof data.label !== 'string' || data.label.length > 300))
        workFail('invalid-argument', 'Informe um rótulo de até 300 caracteres.');
      const label = data.label?.trim() || null,
        op = operation(context, data, 'create', { resource, token, label });
      const prior = await db.runTransaction(async (tx) => {
        await workProject(tx, context);
        return receipt(tx, op);
      });
      if (prior)
        return db.runTransaction(async (tx) => {
          await workProject(tx, context);
          return {
            version: versionSummary(await readHistoryVersion(tx, db, context, prior.versionId)),
          };
        });
      await activateLegacy(context, resource, token, op);
      return db.runTransaction(async (tx) => {
        const current = await readHistorySource(tx, db, context, resource),
          previous = await receipt(tx, op);
        if (previous)
          return {
            version: versionSummary(await readHistoryVersion(tx, db, context, previous.versionId)),
          };
        if (!current) workFail('not-found', 'Fonte indisponível.');
        if (current.source.sourceToken !== token) workConflict();
        if ((await tx.get(versionRef(db, context, op.id))).exists)
          workFail('already-exists', 'Identificador de versão já utilizado.');
        const plan = capturePlan(
          context,
          resource,
          op.id,
          current.source.content,
          'manual',
          label,
          workDate(now, current.root.updatedAt ?? 0),
        );
        plan.commit(tx);
        tx.create(op.ref, { fingerprint: op.fingerprint, versionId: op.id });
        return { version: plan.version };
      });
    },
    async listWorkVersions(uid, data) {
      const context = historyScope(db, uid, data, ['resource', 'cursor', 'limit']),
        resource = data.resource == null ? null : historyResource(data.resource, context.target),
        limit = workLimit(data.limit),
        scope = { uid, target: context.target, resource, kind: 'list' },
        cursor = historyCursor(data.cursor, scope);
      if (
        cursor &&
        (!Number.isFinite(cursor.date) || cursor.date < 0 || cursor.date > 8640000000000000)
      )
        workFail('invalid-argument', 'Página inválida.');
      if (cursor) workId(cursor.id);
      return db.runTransaction(async (tx) => {
        await workProject(tx, context);
        let query = db.collection(context.path + '/workVersions').where('deleting', '==', false);
        if (resource) query = query.where('resourceKey', '==', digest(resource));
        query = query
          .orderBy('createdAt', 'desc')
          .orderBy('__name__', 'desc')
          .limit(limit + 1);
        if (cursor) query = query.startAfter(cursor.date, cursor.id);
        const page = await tx.get(query),
          selected = page.docs.slice(0, limit),
          last = selected.at(-1);
        return {
          items: selected.map((snapshot) => versionSummary(snapshot.data())),
          nextCursor:
            page.docs.length > limit
              ? encodeHistoryCursor({ scope, date: last.data().createdAt, id: last.id })
              : null,
        };
      });
    },
    async readWorkVersion(uid, data) {
      const context = historyScope(db, uid, data, ['versionId', 'cursor', 'limit']),
        id = workId(data.versionId),
        limit = data.limit ?? 4,
        scope = { uid, target: context.target, versionId: id, kind: 'body' },
        cursor = historyCursor(data.cursor, scope);
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 8 ||
        (cursor && (!Number.isSafeInteger(cursor.index) || cursor.index < 0))
      )
        workFail('invalid-argument', 'Página inválida.');
      return db.runTransaction(async (tx) => {
        await workProject(tx, context);
        const value = await readHistoryVersion(tx, db, context, id),
          start = cursor?.index ?? 0;
        if (start >= value.chunkCount) workFail('invalid-argument', 'Página inválida.');
        const chunks = [];
        for (let index = start; index < Math.min(value.chunkCount, start + limit); index++)
          chunks.push(await readHistoryChunk(tx, db, context, value, index));
        const next = start + chunks.length;
        return {
          version: versionSummary(value),
          chunks,
          nextCursor: next < value.chunkCount ? encodeHistoryCursor({ scope, index: next }) : null,
        };
      });
    },
    async restoreWorkVersion(uid, data) {
      const context = historyScope(db, uid, data, [
          'resource',
          'versionId',
          'operationId',
          'expectedSourceToken',
        ]),
        resource = historyResource(data.resource, context.target),
        id = workId(data.versionId),
        token = sourceToken(data.expectedSourceToken),
        op = operation(context, data, 'restore', { resource, versionId: id, token });
      const prior = await db.runTransaction(async (tx) => {
        await workProject(tx, context);
        return receipt(tx, op);
      });
      if (prior) return restoreResult(context, resource, prior);
      await activateLegacy(context, resource, token, op);
      const saved = await db.runTransaction(async (tx) => {
        const current = await readHistorySource(tx, db, context, resource),
          previous = await receipt(tx, op);
        if (previous) return previous;
        if (!current) workFail('not-found', 'Fonte indisponível.');
        if (current.source.sourceToken !== token) workConflict();
        const value = await readHistoryVersion(tx, db, context, id);
        if (digest(value.resource) !== digest(resource))
          workFail('invalid-argument', 'Versão pertence a outra fonte.');
        const chunks = [];
        for (let index = 0; index < value.chunkCount; index++)
          chunks.push((await readHistoryChunk(tx, db, context, value, index)).content);
        const content = chunks.join('');
        if (
          Buffer.byteLength(content) !== value.byteLength ||
          digest(content) !== value.contentHash
        )
          workFail('failed-precondition', 'Texto da versão inconsistente.');
        const previousVersionId = 'previous-' + digest({ uid, operationId: op.id }),
          copyRef = versionRef(db, context, previousVersionId);
        if ((await tx.get(copyRef)).exists)
          workFail('already-exists', 'Cópia anterior já utilizada.');
        const copy = capturePlan(
          context,
          resource,
          previousVersionId,
          current.source.content,
          'before-restore',
          null,
          workDate(now, current.root.updatedAt ?? 0),
        );
        const write =
          resource.kind === 'block'
            ? await blocks.prepareAdventureBlockTextWrite(tx, {
                uid,
                target: context.target,
                snapshot: current.snapshot,
                content,
              })
            : resource.kind === 'chapter'
              ? await prepareLegacyChapterTextWrite(tx, {
                  db,
                  now,
                  countWords: countVisibleWords,
                  ledger,
                  context,
                  root: current.root,
                  id: resource.id,
                  stored: current.record,
                  content,
                })
              : await scenes.prepareSceneTextWrite(tx, {
                  uid,
                  target: context.target,
                  root: current.root,
                  snapshot: current.snapshot,
                  content,
                });
        const after =
          resource.kind === 'chapter'
            ? { contentHash: digest(content), updatedAt: write.result.updatedAt }
            : write.marker;
        copy.commit(tx);
        write.commit();
        const result = { fingerprint: op.fingerprint, previousVersionId, after };
        tx.create(op.ref, result);
        return result;
      });
      return restoreResult(context, resource, saved);
    },
    async deleteWorkVersion(uid, data) {
      const context = historyScope(db, uid, data, ['versionId', 'operationId']),
        id = workId(data.versionId),
        op = operation(context, data, 'delete', { versionId: id }),
        ref = versionRef(db, context, id);
      await db.runTransaction(async (tx) => {
        await workProject(tx, context);
        const previous = await receipt(tx, op),
          snapshot = await tx.get(ref);
        if (previous) return;
        if (!snapshot.exists) workFail('not-found', 'Versão indisponível.');
        tx.update(ref, { deleting: true });
        tx.create(op.ref, { fingerprint: op.fingerprint, complete: false, processed: 0 });
      });
      return db.runTransaction(async (tx) => {
        await workProject(tx, context);
        const previous = await receipt(tx, op);
        if (previous.complete) return { complete: true, processed: previous.processed };
        const page = await tx.get(
          db
            .collection(context.path + '/workVersionBodies')
            .where('versionId', '==', id)
            .orderBy('__name__')
            .limit(25),
        );
        const complete = page.docs.length < 25,
          processed = previous.processed + page.docs.length;
        page.docs.forEach((snapshot) => tx.delete(snapshot.ref));
        if (complete) tx.delete(ref);
        tx.set(op.ref, { ...previous, complete, processed });
        return { complete, processed };
      });
    },
  };
}
