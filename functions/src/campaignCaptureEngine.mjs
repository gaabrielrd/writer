import { basePath, capturePhases, fail, baseImageUseKey } from './campaignBaseContracts.mjs';
import { captureItem } from './campaignCaptureItems.mjs';
import { readActiveLibraryImage, prepareLibraryImageUse } from './imageLibrary.mjs';
const nextPhase = (p) => ({
  ...p,
  phase: capturePhases[capturePhases.indexOf(p.phase) + 1],
  cursor: null,
  parentId: null,
  parentCursor: null,
});
async function page(tx, db, collection, cursor) {
  let query = db.collection(collection).orderBy('__name__').limit(1).select();
  if (cursor != null) query = query.startAfter(cursor);
  const snapshot = (await tx.get(query)).docs[0];
  return snapshot ? tx.get(snapshot.ref) : null;
}
export async function nextCaptureSource(tx, db, p) {
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
      snapshot: await page(tx, db, `${root}/${collections[p.phase]}`, p.cursor),
      next: nextPhase(p),
    };
  if (['sceneReferences', 'milestones'].includes(p.phase)) {
    let parentId = p.parentId;
    if (!parentId) {
      const parent = await page(
        tx,
        db,
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
      db,
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
    return { snapshot: await page(tx, db, path + '/loreReferences', p.cursor), next: nextPhase(p) };
  if (p.phase === 'images')
    return { snapshot: await page(tx, db, path + '/images', p.cursor), next: nextPhase(p) };
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

// A read plan shared by initial capture and candidate capture. All reads precede commit.
export async function prepareCaptureStep(tx, db, p, media) {
  const source = await nextCaptureSource(tx, db, p);
  if (!source.snapshot) return { next: source.next, commit() {} };
  if (p.phase === 'images') {
    const imageId = source.snapshot.data().imageId;
    const image = await readActiveLibraryImage(tx, db, p.ownerId, imageId);
    if (!media || media.imageId !== imageId || media.path !== image.value.path)
      fail('failed-precondition', 'A imagem mudou durante a captura.');
    const useKey = baseImageUseKey(p.baseId, imageId);
    const use = await prepareLibraryImageUse(tx, db, p.ownerId, {
      key: useKey,
      usage: { kind: 'campaign-base', campaignId: p.campaignId, baseId: p.baseId },
      previousId: null,
      nextId: imageId,
    });
    return {
      next: {
        ...p,
        cursor: source.snapshot.id,
        processed: p.processed + 1,
        counts: { ...p.counts, image: p.counts.image + 1 },
      },
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
  }
  if (p.phase === 'finalizing') {
    const state = source.snapshot.data().structured;
    if (
      state.capturedExtraWords !== state.blockWordCount ||
      state.capturedExtraCount !== state.blockCount
    )
      fail('failed-precondition', 'O agregado dos blocos da origem precisa de verifica��o.');
    return { next: { ...p, cursor: source.snapshot.id }, commit() {} };
  }
  const plan = await captureItem(
    tx,
    db,
    { ...p, parentId: source.parentId ?? p.parentId },
    p.phase,
    source.snapshot,
  );
  return {
    next: {
      ...p,
      parentId: source.parentId ?? p.parentId,
      cursor: source.snapshot.id,
      processed: p.processed + 1,
      counts: Object.fromEntries(
        Object.entries(p.counts).map(([key, count]) => [key, count + (plan.counts[key] ?? 0)]),
      ),
    },
    commit: plan.commit,
  };
}
