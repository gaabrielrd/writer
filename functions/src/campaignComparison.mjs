import { validateId } from './generation.mjs';
import { workRevision, workConflict, workDate } from './workProgressContracts.mjs';
import {
  readCaptureOrigin,
  captureToken,
  captureScope,
  basePath,
  emptyCaptureCounts,
  BASE_IMAGE_BYTES,
  limit,
  encodeBaseCursor,
  decodeBaseCursor,
} from './campaignBaseContracts.mjs';
import { nextCaptureSource, prepareCaptureStep } from './campaignCaptureEngine.mjs';
import { readActiveLibraryImage, prepareLibraryImageUse } from './imageLibrary.mjs';
import { id } from './campaignBaseContracts.mjs';
import {
  assertCampaignNotDeleted,
  assertCampaignControlNotDeleted,
  readCampaignDeletionReservation,
} from './campaignDeletionGuard.mjs';
import {
  digest,
  fail,
  comparisonPath,
  candidateId,
  ownedComparison,
  progress,
  observeCampaign,
  observeComparison,
} from './campaignComparisonContracts.mjs';

export function createCampaignComparisonService({ db, assets, now = Date.now }) {
  const ref = (uid, key) => db.doc(comparisonPath(uid, key));
  const fenceRef = (uid, key) => db.doc(`users/${uid}/campaignComparisonStartFences/${key}`);
  const opRef = (uid, key) => db.doc(`users/${uid}/campaignComparisonOperations/${key}`);
  const startFields = [
    'campaignId',
    'campaignToken',
    'currentBaseId',
    'expectedSourceToken',
    'operationId',
  ];
  function startInput(data) {
    return {
      operationId: validateId(data.operationId),
      campaignId: id(data.campaignId),
      campaignToken: captureToken(data.campaignToken),
      currentBaseId: captureToken(data.currentBaseId),
      expectedSourceToken: captureToken(data.expectedSourceToken),
    };
  }
  const fingerprint = (action, input) => digest({ action, input });
  function verifyPrior(value, hash) {
    if (value && value.fingerprint !== hash)
      fail('invalid-argument', 'Operação utilizada com outros dados.');
    return value;
  }
  const canceled = (uid, input) => ({
    kind: 'canceled',
    schemaVersion: 1,
    ownerId: uid,
    request: input,
  });
  const mutation = (receipt, p, observation) => ({ receipt, progress: progress(p, observation) });
  const receipt = (action, input, p) => ({
    operationId: input.operationId,
    action,
    expectedCheckpoint: action === 'start' ? null : input.expectedCheckpoint,
    confirmedCheckpoint: p.checkpoint,
  });
  const saveReceipt = (tx, uid, hash, value, p) =>
    tx.create(opRef(uid, value.operationId), {
      schemaVersion: 1,
      ownerId: uid,
      fingerprint: hash,
      comparisonId: p.id,
      receipt: value,
    });
  const mutate = (p) => ({
    ...p,
    checkpoint: workRevision(p.checkpoint + 1),
    updatedAt: workDate(now, p.updatedAt),
  });
  const get = async (tx, uid, key) => {
    await assertCampaignControlNotDeleted(tx, db, uid, ref(uid, key));
    return ownedComparison((await tx.get(ref(uid, key))).data(), uid, key);
  };
  async function stepMedia(uid, input) {
    const observed = await db.runTransaction(async (tx) => {
      const p = await get(tx, uid, input.comparisonId);
      if (
        p.state !== 'preparing' ||
        p.phase !== 'images' ||
        p.checkpoint !== input.expectedCheckpoint
      )
        return null;
      const root = await observeComparison(tx, db, p, true);
      if (!root.available || root.reason) return null;
      const source = await nextCaptureSource(tx, db, p);
      if (!source.snapshot) return null;
      const imageId = source.snapshot.data().imageId;
      const image = await readActiveLibraryImage(tx, db, uid, imageId);
      return { imageId, path: image.value.path };
    });
    if (!observed) return null;
    let metadata;
    try {
      metadata = await assets.metadata(observed.path);
    } catch {
      fail('unavailable', 'Não foi possível conferir a imagem da captura.');
    }
    if (
      !metadata ||
      typeof metadata.generation !== 'string' ||
      !/^\d+$/.test(metadata.generation) ||
      !Number.isSafeInteger(metadata.size) ||
      metadata.size < 1 ||
      metadata.size > BASE_IMAGE_BYTES
    )
      fail('failed-precondition', 'Imagem incompatível com o orçamento da captura.');
    return { ...observed, ...metadata };
  }
  return {
    async getCampaignComparisonSource(uid, data) {
      captureScope(uid, data, ['campaignId', 'currentBaseId']);
      const campaignId = id(data.campaignId),
        currentBaseId = captureToken(data.currentBaseId);
      return db.runTransaction(async (tx) => {
        const root = await observeCampaign(tx, db, uid, campaignId);
        if (!root.available) return null;
        if (root.base.id !== currentBaseId) workConflict();
        const origin = await readCaptureOrigin(tx, db, uid, root.base.adventureId);
        if (!origin) return null;
        return {
          schemaVersion: 1,
          ownerId: uid,
          campaignId,
          campaignToken: root.campaignToken,
          currentBaseId,
          currentCapturedAt: root.base.capturedAt,
          adventureId: root.base.adventureId,
          sourceToken: origin.sourceToken,
        };
      });
    },
    async startCampaignComparison(uid, data) {
      captureScope(uid, data, startFields);
      const input = startInput(data),
        hash = fingerprint('start', input),
        key = input.operationId;
      return db.runTransaction(async (tx) => {
        await assertCampaignNotDeleted(tx, db, uid, input.campaignId);
        const previous = verifyPrior((await tx.get(opRef(uid, key))).data(), hash);
        const stored = (await tx.get(ref(uid, key))).data();
        const fence = verifyPrior((await tx.get(fenceRef(uid, key))).data(), hash);
        if (fence) {
          if (stored || previous)
            fail('failed-precondition', 'Encerramento inicial inconsistente.');
          return canceled(uid, input);
        }
        if (previous) {
          const p = ownedComparison(stored, uid, key);
          return mutation(previous.receipt, p, await observeComparison(tx, db, p));
        }
        if (stored) fail('already-exists', 'Identificador já utilizado.');
        const root = await observeCampaign(tx, db, uid, input.campaignId);
        if (!root.available) fail('not-found', 'Campanha indisponível.');
        if (root.campaignToken !== input.campaignToken || root.base.id !== input.currentBaseId)
          workConflict();
        const origin = await readCaptureOrigin(tx, db, uid, root.base.adventureId);
        if (!origin) fail('not-found', 'Origem indisponível.');
        if (origin.sourceToken !== input.expectedSourceToken) workConflict();
        const baseId = candidateId(uid, input.campaignToken, key),
          baseRef = db.doc(basePath(uid, baseId));
        if ((await tx.get(baseRef)).exists) fail('already-exists', 'Identificador já utilizado.');
        const timestamp = workDate(now),
          p = {
            id: key,
            schemaVersion: 1,
            ownerId: uid,
            campaignId: input.campaignId,
            campaignToken: input.campaignToken,
            currentBaseId: input.currentBaseId,
            baseId,
            adventureId: root.base.adventureId,
            sourceUniverseId: origin.adventure.universeId ?? null,
            sourceToken: input.expectedSourceToken,
            state: 'preparing',
            phase: 'parts',
            checkpoint: 0,
            processed: 0,
            counts: emptyCaptureCounts(),
            cursor: null,
            parentId: null,
            parentCursor: null,
            createdAt: timestamp,
            updatedAt: timestamp,
            reason: null,
          };
        const r = receipt('start', input, p);
        tx.create(ref(uid, key), p);
        tx.create(baseRef, {
          schemaVersion: 1,
          id: baseId,
          ownerId: uid,
          campaignId: p.campaignId,
          adventureId: p.adventureId,
          universeId: p.sourceUniverseId,
          sourceToken: p.sourceToken,
          state: 'preparing',
          createdAt: timestamp,
          counts: p.counts,
          snapshot: {
            title: origin.adventure.title,
            synopsis: origin.adventure.synopsis ?? '',
            language: origin.adventure.language ?? 'pt-BR',
          },
        });
        saveReceipt(tx, uid, hash, r, p);
        return mutation(r, p, root);
      });
    },
    async resolveCampaignComparisonStart(uid, data) {
      captureScope(uid, data, [...startFields, 'intent']);
      if (data.intent !== 'cancel') fail('invalid-argument', 'Escolha de encerramento inválida.');
      const input = startInput(data),
        hash = fingerprint('start', input),
        key = input.operationId;
      return db.runTransaction(async (tx) => {
        await assertCampaignNotDeleted(tx, db, uid, input.campaignId);
        const previous = verifyPrior((await tx.get(opRef(uid, key))).data(), hash);
        const p = (await tx.get(ref(uid, key))).data();
        const fence = verifyPrior((await tx.get(fenceRef(uid, key))).data(), hash);
        if (previous)
          return {
            kind: 'confirmed',
            ...mutation(
              previous.receipt,
              ownedComparison(p, uid, key),
              await observeComparison(tx, db, p),
            ),
          };
        if (p) fail('failed-precondition', 'Recibo inicial indisponível.');
        if (!fence)
          tx.create(fenceRef(uid, key), {
            schemaVersion: 1,
            ownerId: uid,
            fingerprint: hash,
            request: input,
          });
        return canceled(uid, input);
      });
    },
    async getCampaignComparison(uid, data) {
      captureScope(uid, data, ['comparisonId']);
      return db.runTransaction(async (tx) => {
        const p = await get(tx, uid, id(data.comparisonId));
        return progress(p, await observeComparison(tx, db, p));
      });
    },
    async listCampaignComparisons(uid, data = {}) {
      captureScope(uid, data, ['campaignId', 'cursor', 'limit']);
      const campaignId = data.campaignId === undefined ? null : id(data.campaignId),
        count = limit(data.limit),
        scope = { uid, campaignId };
      const cursor = decodeBaseCursor(data.cursor, scope, ['key', 'date']);
      if (cursor && (!Number.isSafeInteger(cursor.date) || cursor.date < 0))
        fail('invalid-argument', 'Página inválida.');
      return db.runTransaction(async (tx) => {
        let query = db.collection(`users/${uid}/campaignComparisons`);
        if (campaignId) query = query.where('campaignId', '==', campaignId);
        query = query
          .orderBy('createdAt', 'desc')
          .orderBy('__name__')
          .limit(count + 1)
          .select('ownerId', 'campaignId', 'createdAt');
        if (cursor) query = query.startAfter(cursor.date, cursor.key);
        const docs = (await tx.get(query)).docs,
          items = [];
        for (const doc of docs.slice(0, count)) {
          if ((await readCampaignDeletionReservation(tx, db, doc.data().campaignId)).record)
            continue;
          const p = await get(tx, uid, doc.id);
          items.push(progress(p, await observeComparison(tx, db, p)));
        }
        const last = docs[Math.min(count, docs.length) - 1];
        return {
          items,
          nextCursor:
            docs.length > count
              ? encodeBaseCursor({ version: 1, scope, key: last.id, date: last.data().createdAt })
              : null,
        };
      });
    },
    async advanceCampaignComparison(uid, data) {
      captureScope(uid, data, ['comparisonId', 'operationId', 'expectedCheckpoint']);
      const input = {
        comparisonId: id(data.comparisonId),
        operationId: validateId(data.operationId),
        expectedCheckpoint: workRevision(data.expectedCheckpoint),
      };
      const hash = fingerprint('advance', input),
        media = await stepMedia(uid, input);
      return db.runTransaction(async (tx) => {
        const p = await get(tx, uid, input.comparisonId),
          previous = verifyPrior((await tx.get(opRef(uid, input.operationId))).data(), hash);
        const observed = await observeComparison(tx, db, p, true);
        if (previous) return mutation(previous.receipt, p, observed);
        if (p.checkpoint !== input.expectedCheckpoint) workConflict();
        if (p.state !== 'preparing')
          fail('failed-precondition', 'Preparação não está em andamento.');
        let value,
          plan = null;
        if (!observed.available || observed.reason)
          value = mutate({ ...p, state: 'aborted', reason: observed.reason });
        else {
          plan = await prepareCaptureStep(tx, db, p, media);
          value = mutate(plan.next);
          if (value.state === 'prepared') value = { ...value, state: 'ready' };
        }
        const r = receipt('advance', input, value);
        plan?.commit();
        tx.update(ref(uid, p.id), value);
        tx.update(db.doc(basePath(uid, p.baseId)), {
          state: value.state,
          counts: value.counts,
          ...(value.state === 'ready' ? { capturedAt: value.updatedAt } : {}),
        });
        saveReceipt(tx, uid, hash, r, value);
        return mutation(r, value, observed);
      });
    },
    async cancelCampaignComparison(uid, data) {
      captureScope(uid, data, ['comparisonId', 'operationId', 'expectedCheckpoint']);
      const input = {
        comparisonId: id(data.comparisonId),
        operationId: validateId(data.operationId),
        expectedCheckpoint: workRevision(data.expectedCheckpoint),
      };
      const hash = fingerprint('cancel', input);
      return db.runTransaction(async (tx) => {
        const p = await get(tx, uid, input.comparisonId),
          previous = verifyPrior((await tx.get(opRef(uid, input.operationId))).data(), hash);
        const observed = await observeComparison(tx, db, p);
        if (previous) return mutation(previous.receipt, p, observed);
        if (p.checkpoint !== input.expectedCheckpoint) workConflict();
        if (p.state === 'adopted' || p.adoptionClaim)
          fail('failed-precondition', 'A comparação adotada ou em adoção não pode ser descartada.');
        const campaign = (await tx.get(db.doc('campaigns/' + p.campaignId))).data();
        if (campaign?.activeBaseId === p.baseId)
          fail('failed-precondition', 'A base ativa não pode ser descartada.');
        const uses = [];
        let value = p,
          docs = [],
          complete = false;
        const path = basePath(uid, p.baseId),
          collections = ['images', 'bodies', 'links', 'loreReferences', 'items'];
        if (p.state !== 'deleted') {
          if (p.state !== 'deleting')
            value = mutate({ ...p, state: 'deleting', phase: 'cleanup', cleanupCollection: 0 });
          else {
            const phase = p.cleanupCollection;
            if (!Number.isSafeInteger(phase) || phase < 0 || phase >= collections.length)
              fail('failed-precondition', 'Limpeza inconsistente.');
            docs = (
              await tx.get(
                db
                  .collection(path + '/' + collections[phase])
                  .orderBy('__name__')
                  .limit(25),
              )
            ).docs;
            if (phase === 0)
              for (const doc of docs) {
                const image = doc.data();
                if (image.state === 'ready') {
                  const libraryRef = db.doc(`users/${uid}/imageLibrary/${image.imageId}`),
                    library = (await tx.get(libraryRef)).data();
                  if (!library)
                    uses.push({
                      commit: () => tx.delete(db.doc(libraryRef.path + '/uses/' + image.useKey)),
                    });
                  else
                    uses.push(
                      await prepareLibraryImageUse(tx, db, uid, {
                        key: image.useKey,
                        usage: {},
                        previousId: image.imageId,
                        nextId: null,
                      }),
                    );
                }
              }
            const next = docs.length < 25 ? phase + 1 : phase;
            complete = next === collections.length;
            value = mutate({
              ...p,
              state: complete ? 'deleted' : 'deleting',
              phase: 'cleanup',
              cleanupCollection: next,
            });
          }
        }
        const r = receipt('cancel', input, value);
        uses.forEach((use) => use.commit());
        docs.forEach((doc) => tx.delete(doc.ref));
        if (p.state !== 'deleted') {
          tx.update(ref(uid, p.id), value);
          if (complete) tx.delete(db.doc(path));
          else tx.update(db.doc(path), { state: 'deleting' });
        }
        saveReceipt(tx, uid, hash, r, value);
        return mutation(r, value, observed);
      });
    },
  };
}
