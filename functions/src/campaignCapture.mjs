import { validateId } from './generation.mjs';
import { workRevision, workConflict, workTitle, workDate } from './workProgressContracts.mjs';
import { prepareUniverseProjectLink, universeDocumentId } from './universes.mjs';
import { prepareLibraryImageUse, readActiveLibraryImage } from './imageLibrary.mjs';
import { captureItem } from './campaignCaptureItems.mjs';
import {
  fail,
  id,
  digest,
  limit,
  BASE_PAGE_BYTES,
  BASE_IMAGE_BYTES,
  basePath,
  preparationPath,
  captureScope,
  captureToken,
  readCaptureOrigin,
  captureSource,
  captureProgress,
  emptyCaptureCounts,
  capturePhases,
  baseImageUseKey,
  encodeBaseCursor,
  decodeBaseCursor,
} from './campaignBaseContracts.mjs';

export function createCampaignCaptureService({ db, assets, now = Date.now }) {
  const prepRef = (uid, captureId) => db.doc(preparationPath(uid, captureId));
  function ownedPreparation(value, uid, captureId) {
    if (!value || value.ownerId !== uid) fail('not-found', 'Preparação indisponível.');
    if (value.schemaVersion !== 1)
      fail('failed-precondition', 'Versão da preparação não suportada.');
    if (
      value.id !== captureId ||
      value.baseId !== digest({ uid, captureId, kind: 'base' }) ||
      value.campaignId !== digest({ uid, captureId, kind: 'campaign' })
    )
      fail('failed-precondition', 'A identidade da preparação está inconsistente.');
    return value;
  }
  async function preparation(tx, uid, captureId) {
    const ref = prepRef(uid, captureId),
      value = ownedPreparation((await tx.get(ref)).data(), uid, captureId);
    return { ref, value };
  }
  function operation(uid, data, method) {
    const operationId = validateId(data.operationId);
    return {
      ref: db.doc(`users/${uid}/campaignCaptureOperations/${operationId}`),
      fingerprint: digest({ method, ...data }),
    };
  }
  async function prior(tx, op) {
    const value = (await tx.get(op.ref)).data();
    if (value && value.fingerprint !== op.fingerprint)
      fail('invalid-argument', 'Operação utilizada com outros dados.');
    return value;
  }
  const receipt = (tx, op, p) =>
    tx.create(op.ref, { fingerprint: op.fingerprint, captureId: p.id, checkpoint: p.checkpoint });
  async function progress(tx, p) {
    const origin = await readCaptureOrigin(tx, db, p.ownerId, p.adventureId);
    return captureProgress(p, await sourceAvailable(tx, p, origin));
  }
  async function sourceAvailable(tx, p, origin) {
    if (!origin) return false;
    if (p.sourceUniverseId != null && p.sourceUniverseId !== origin.adventure.universeId) {
      const world = (await tx.get(db.doc('universes/' + p.sourceUniverseId))).data();
      return Boolean(world && world.authorId === p.ownerId && !world.deleting);
    }
    return true;
  }
  const nextPhase = (p) => ({
    ...p,
    phase: capturePhases[capturePhases.indexOf(p.phase) + 1],
    cursor: null,
    parentId: null,
    parentCursor: null,
  });
  async function page(tx, collection, cursor) {
    let query = db.collection(collection).orderBy('__name__').limit(1).select();
    if (cursor != null) query = query.startAfter(cursor);
    const snapshot = (await tx.get(query)).docs[0];
    return snapshot ? tx.get(snapshot.ref) : null;
  }
  async function nextSource(tx, p) {
    const root = `adventures/${p.adventureId}`,
      path = basePath(p.ownerId, p.baseId);
    const collections = {
      parts: 'parts',
      scenes: 'scenes',
      blocks: 'sceneBlocks',
      arcs: 'arcs',
      events: 'timelineEvents',
      narrativeLinks: 'narrativeLinks',
    };
    if (collections[p.phase])
      return {
        snapshot: await page(tx, `${root}/${collections[p.phase]}`, p.cursor),
        next: nextPhase(p),
      };
    if (['sceneReferences', 'milestones'].includes(p.phase)) {
      let parentId = p.parentId;
      if (!parentId) {
        const parent = await page(
          tx,
          root + (p.phase === 'sceneReferences' ? '/scenes' : '/arcs'),
          p.parentCursor,
        );
        if (!parent) return { snapshot: null, next: nextPhase(p) };
        if (parent.data().deleting)
          fail('failed-precondition', 'Conclua a exclusão da origem antes de capturar.');
        parentId = parent.id;
      }
      const snapshot = await page(
        tx,
        `${root}/${p.phase === 'sceneReferences' ? 'scenes' : 'arcs'}/${parentId}/${p.phase === 'sceneReferences' ? 'references' : 'milestones'}`,
        p.cursor,
      );
      return {
        snapshot,
        parentId,
        next: { ...p, parentId: null, parentCursor: parentId, cursor: null },
      };
    }
    if (p.phase === 'lore')
      return { snapshot: await page(tx, path + '/loreReferences', p.cursor), next: nextPhase(p) };
    if (p.phase === 'images')
      return { snapshot: await page(tx, path + '/images', p.cursor), next: nextPhase(p) };
    if (p.phase === 'finalizing') {
      let query = db
        .collection(path + '/items')
        .where('kind', '==', 'scene')
        .orderBy('__name__')
        .limit(1);
      if (p.cursor) query = query.startAfter(p.cursor);
      const snapshot = (await tx.get(query)).docs[0];
      return {
        snapshot: snapshot ?? null,
        next: { ...p, phase: 'complete', state: 'prepared', cursor: null },
      };
    }
    fail('failed-precondition', 'Preparação não pode avançar neste estado.');
  }
  function mutated(p) {
    const checkpoint = p.checkpoint + 1;
    workRevision(checkpoint);
    return { ...p, checkpoint, updatedAt: workDate(now, p.updatedAt) };
  }
  async function mediaObservation(uid, data) {
    const observed = await db.runTransaction(async (tx) => {
      const { value: p } = await preparation(tx, uid, data.captureId);
      if (
        p.state !== 'preparing' ||
        p.phase !== 'images' ||
        p.checkpoint !== data.expectedCheckpoint
      )
        return null;
      const origin = await readCaptureOrigin(tx, db, uid, p.adventureId);
      if (!origin || origin.sourceToken !== p.sourceToken) return null;
      const source = await nextSource(tx, p);
      if (!source.snapshot) return null;
      const imageId = source.snapshot.data().imageId,
        image = await readActiveLibraryImage(tx, db, uid, imageId);
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
    async getCampaignCaptureSource(uid, data) {
      captureScope(uid, data, ['adventureId']);
      return db.runTransaction(async (tx) => {
        const value = await readCaptureOrigin(tx, db, uid, id(data.adventureId));
        return value ? captureSource(data.adventureId, value) : null;
      });
    },
    async startCampaignCapture(uid, data) {
      captureScope(uid, data, [
        'operationId',
        'adventureId',
        'expectedSourceToken',
        'title',
        'description',
        'universeId',
      ]);
      const captureId = validateId(data.operationId),
        adventureId = id(data.adventureId),
        expected = captureToken(data.expectedSourceToken),
        title = workTitle(data.title),
        description = data.description ?? '';
      if (typeof description !== 'string' || description.length > 4000)
        fail('invalid-argument', 'Descrição inválida.');
      const universeId = data.universeId === null ? null : universeDocumentId(data.universeId),
        op = operation(uid, data, 'start'),
        baseId = digest({ uid, captureId, kind: 'base' }),
        campaignId = digest({ uid, captureId, kind: 'campaign' });
      return db.runTransaction(async (tx) => {
        const previous = await prior(tx, op),
          ref = prepRef(uid, captureId),
          current = (await tx.get(ref)).data();
        if (previous) {
          ownedPreparation(current, uid, captureId);
          return progress(tx, current);
        }
        const origin = await readCaptureOrigin(tx, db, uid, adventureId);
        if (!origin) fail('not-found', 'Aventura indisponível.');
        if (origin.sourceToken !== expected) workConflict();
        if (
          current ||
          (await tx.get(db.doc(basePath(uid, baseId)))).exists ||
          (await tx.get(db.doc('campaigns/' + campaignId))).exists
        )
          fail('already-exists', 'Identificador já utilizado.');
        if (universeId != null) {
          const universe = (await tx.get(db.doc('universes/' + universeId))).data();
          if (!universe || universe.authorId !== uid || universe.deleting)
            fail('not-found', 'Universo indisponível.');
        }
        const timestamp = workDate(now),
          value = {
            id: captureId,
            schemaVersion: 1,
            ownerId: uid,
            adventureId,
            sourceUniverseId: origin.adventure.universeId ?? null,
            sourceToken: expected,
            baseId,
            campaignId,
            title,
            description: description.trim(),
            universeId,
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
        tx.create(ref, value);
        tx.create(db.doc(basePath(uid, baseId)), {
          id: baseId,
          schemaVersion: 1,
          ownerId: uid,
          campaignId,
          adventureId,
          universeId: value.sourceUniverseId,
          sourceToken: expected,
          state: 'preparing',
          createdAt: timestamp,
          counts: value.counts,
          snapshot: {
            title: origin.adventure.title,
            synopsis: origin.adventure.synopsis ?? '',
            language: origin.adventure.language ?? 'pt-BR',
          },
        });
        receipt(tx, op, value);
        return captureProgress(value);
      });
    },
    async getCampaignCapture(uid, data) {
      captureScope(uid, data, ['captureId']);
      return db.runTransaction(async (tx) => {
        const { value } = await preparation(tx, uid, id(data.captureId));
        return progress(tx, value);
      });
    },
    async listCampaignCaptures(uid, data = {}) {
      captureScope(uid, data, ['adventureId', 'cursor', 'limit']);
      const size = limit(data.limit),
        adventureId = data.adventureId === undefined ? null : id(data.adventureId),
        scope = { uid, adventureId },
        cursor = decodeBaseCursor(data.cursor, scope);
      return db.runTransaction(async (tx) => {
        let query = db
          .collection(`users/${uid}/campaignPreparations`)
          .orderBy('__name__')
          .limit(size + 1);
        if (cursor) query = query.startAfter(id(cursor.key));
        const docs = (await tx.get(query)).docs,
          items = [];
        let last = null;
        for (const snap of docs.slice(0, size)) {
          const value = ownedPreparation(snap.data(), uid, snap.id);
          if (
            !['preparing', 'prepared', 'aborted', 'deleting'].includes(value.state) ||
            (adventureId && value.adventureId !== adventureId)
          ) {
            last = snap;
            continue;
          }
          const item = await progress(tx, value);
          if (Buffer.byteLength(JSON.stringify({ items: [...items, item] })) > BASE_PAGE_BYTES) {
            if (!items.length) fail('failed-precondition', 'Preparação acima do orçamento.');
            break;
          }
          items.push(item);
          last = snap;
        }
        return {
          items,
          nextCursor:
            last && (docs.length > size || last !== docs.at(-1))
              ? encodeBaseCursor({ version: 1, scope, key: last.id })
              : null,
        };
      });
    },
    async advanceCampaignCapture(uid, data) {
      captureScope(uid, data, ['captureId', 'operationId', 'expectedCheckpoint']);
      id(data.captureId);
      workRevision(data.expectedCheckpoint);
      const op = operation(uid, data, 'advance'),
        media = await mediaObservation(uid, data);
      return db.runTransaction(async (tx) => {
        const { ref, value: p } = await preparation(tx, uid, data.captureId),
          previous = await prior(tx, op),
          origin = await readCaptureOrigin(tx, db, uid, p.adventureId),
          available = await sourceAvailable(tx, p, origin);
        if (previous) return captureProgress(p, available);
        if (p.checkpoint !== data.expectedCheckpoint) workConflict();
        if (p.state !== 'preparing')
          fail('failed-precondition', 'Preparação não está em andamento.');
        if (!origin || origin.sourceToken !== p.sourceToken) {
          const value = mutated({
            ...p,
            state: 'aborted',
            reason: origin ? 'source-changed' : 'source-unavailable',
          });
          tx.update(ref, value);
          tx.update(db.doc(basePath(uid, p.baseId)), { state: 'aborted' });
          receipt(tx, op, value);
          return captureProgress(value, available);
        }
        const source = await nextSource(tx, p);
        let value,
          plan = null;
        if (!source.snapshot) value = mutated(source.next);
        else if (p.phase === 'images') {
          const imageId = source.snapshot.data().imageId,
            image = await readActiveLibraryImage(tx, db, uid, imageId);
          if (!media || media.imageId !== imageId || media.path !== image.value.path)
            fail('failed-precondition', 'A imagem mudou durante a captura.');
          const useKey = baseImageUseKey(p.baseId, imageId),
            use = await prepareLibraryImageUse(tx, db, uid, {
              key: useKey,
              usage: { kind: 'campaign-base', campaignId: p.campaignId, baseId: p.baseId },
              previousId: null,
              nextId: imageId,
            });
          plan = {
            commit() {
              use.commit();
              tx.update(source.snapshot.ref, {
                state: 'ready',
                path: media.path,
                generation: media.generation,
                size: media.size,
                useKey,
              });
            },
          };
          value = mutated({
            ...p,
            cursor: source.snapshot.id,
            processed: p.processed + 1,
            counts: { ...p.counts, image: p.counts.image + 1 },
          });
        } else if (p.phase === 'finalizing') {
          const item = source.snapshot.data(),
            state = item.structured;
          if (
            state.capturedExtraWords !== state.blockWordCount ||
            state.capturedExtraCount !== state.blockCount
          )
            fail('failed-precondition', 'O agregado dos blocos da origem precisa de verificação.');
          value = mutated({ ...p, cursor: source.snapshot.id });
        } else {
          plan = await captureItem(
            tx,
            db,
            { ...p, parentId: source.parentId ?? p.parentId },
            p.phase,
            source.snapshot,
          );
          value = mutated({
            ...p,
            parentId: source.parentId ?? p.parentId,
            cursor: source.snapshot.id,
            processed: p.processed + 1,
            counts: Object.fromEntries(
              Object.entries(p.counts).map(([key, count]) => [
                key,
                count + (plan.counts[key] ?? 0),
              ]),
            ),
          });
        }
        plan?.commit();
        tx.update(ref, value);
        tx.update(db.doc(basePath(uid, p.baseId)), { counts: value.counts });
        receipt(tx, op, value);
        return captureProgress(value);
      });
    },
    async activateCampaignCapture(uid, data) {
      captureScope(uid, data, ['captureId', 'operationId', 'expectedCheckpoint']);
      id(data.captureId);
      workRevision(data.expectedCheckpoint);
      const op = operation(uid, data, 'activate');
      return db.runTransaction(async (tx) => {
        const { ref, value: p } = await preparation(tx, uid, data.captureId),
          previous = await prior(tx, op),
          campaignRef = db.doc('campaigns/' + p.campaignId),
          campaign = (await tx.get(campaignRef)).data();
        if (previous) {
          if (previous.aborted) return { kind: 'aborted', preparation: await progress(tx, p) };
          if (
            p.state !== 'activated' ||
            !campaign ||
            campaign.ownerId !== uid ||
            campaign.deleting ||
            campaign.schemaVersion !== 1 ||
            campaign.provenance?.kind !== 'original' ||
            campaign.provenance.adventureId !== p.adventureId ||
            campaign.provenance.baseId !== p.baseId ||
            campaign.activeBaseId !== p.baseId
          )
            fail('not-found', 'Campanha indisponível.');
          return { kind: 'already-activated', campaignId: p.campaignId };
        }
        if (p.checkpoint !== data.expectedCheckpoint) workConflict();
        if (p.state !== 'prepared' || campaign)
          fail('failed-precondition', 'Preparação não está pronta para ativar.');
        const origin = await readCaptureOrigin(tx, db, uid, p.adventureId),
          available = await sourceAvailable(tx, p, origin);
        if (!origin || origin.sourceToken !== p.sourceToken) {
          const aborted = mutated({
            ...p,
            state: 'aborted',
            reason: origin ? 'source-changed' : 'source-unavailable',
          });
          tx.update(ref, aborted);
          tx.update(db.doc(basePath(uid, p.baseId)), { state: 'aborted' });
          tx.create(op.ref, {
            fingerprint: op.fingerprint,
            captureId: p.id,
            checkpoint: aborted.checkpoint,
            aborted: true,
          });
          return { kind: 'aborted', preparation: captureProgress(aborted, available) };
        }
        const timestamp = workDate(now, p.updatedAt),
          link = await prepareUniverseProjectLink(
            tx,
            db,
            uid,
            { kind: 'campaign', id: p.campaignId },
            null,
            p.universeId,
            () => timestamp,
            { strict: true },
          ),
          value = {
            id: p.campaignId,
            ownerId: uid,
            schemaVersion: 1,
            revision: 1,
            title: p.title,
            description: p.description,
            status: 'planning',
            universeId: p.universeId,
            provenance: { kind: 'original', adventureId: p.adventureId, baseId: p.baseId },
            activeBaseId: p.baseId,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          preparationValue = mutated({ ...p, state: 'activated', phase: 'complete' });
        link.commit();
        tx.create(campaignRef, value);
        tx.update(ref, preparationValue);
        tx.update(db.doc(basePath(uid, p.baseId)), { state: 'ready', capturedAt: timestamp });
        receipt(tx, op, preparationValue);
        return { kind: 'activated', campaign: value };
      });
    },
    async cancelCampaignCapture(uid, data) {
      captureScope(uid, data, ['captureId', 'operationId', 'expectedCheckpoint']);
      id(data.captureId);
      workRevision(data.expectedCheckpoint);
      const op = operation(uid, data, 'cancel');
      return db.runTransaction(async (tx) => {
        const { ref, value: p } = await preparation(tx, uid, data.captureId),
          previous = await prior(tx, op),
          origin = await readCaptureOrigin(tx, db, uid, p.adventureId),
          available = await sourceAvailable(tx, p, origin);
        if (previous) return captureProgress(p, available);
        if (p.state === 'activated')
          fail('failed-precondition', 'Exclua a campanha pronta pela operação correspondente.');
        if (p.checkpoint !== data.expectedCheckpoint) workConflict();
        if (p.state === 'deleted') {
          receipt(tx, op, p);
          return captureProgress(p, available);
        }
        const path = basePath(uid, p.baseId),
          collections = ['images', 'bodies', 'links', 'loreReferences', 'items'],
          phase = p.cleanupCollection ?? 0,
          docs = (
            await tx.get(
              db.collection(`${path}/${collections[phase]}`).orderBy('__name__').limit(25),
            )
          ).docs,
          uses = [];
        if (phase === 0)
          for (const doc of docs) {
            const image = doc.data();
            if (image.state === 'ready') {
              const libraryRef = db.doc(`users/${uid}/imageLibrary/${image.imageId}`),
                library = (await tx.get(libraryRef)).data();
              if (!library) {
                const use = db.doc(libraryRef.path + '/uses/' + image.useKey);
                uses.push({ commit: () => tx.delete(use) });
              } else
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
        const next = docs.length < 25 ? phase + 1 : phase,
          complete = next === collections.length,
          value = mutated({
            ...p,
            state: complete ? 'deleted' : 'deleting',
            phase: 'cleanup',
            cleanupCollection: next,
          });
        uses.forEach((use) => use.commit());
        docs.forEach((doc) => tx.delete(doc.ref));
        tx.update(ref, value);
        if (complete) tx.delete(db.doc(path));
        else tx.update(db.doc(path), { state: 'deleting' });
        receipt(tx, op, value);
        return captureProgress(value, available);
      });
    },
  };
}
