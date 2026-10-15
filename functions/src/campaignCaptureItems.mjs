import {
  baseSourceKey,
  baseBodyKey,
  baseImageKey,
  basePath,
  baseTextFields,
  assertCaptureBudget,
  digest,
  fail,
} from './campaignBaseContracts.mjs';
import { adventureBlockState, adventureSceneFields } from './adventureBlocksState.mjs';
import { countVisibleWords } from './visibleWordCount.mjs';
const originFor = (p, kind, id, extra = {}) => ({ adventureId: p.adventureId, kind, id, ...extra });
export const capturedKey = (p, kind, id, extra) => baseSourceKey(originFor(p, kind, id, extra));
const order = (value) => (typeof value === 'string' ? value : String(value ?? 0).padStart(16, '0'));
export async function storeCapturedItem(
  tx,
  db,
  p,
  origin,
  metadata,
  texts,
  structured = {},
  image = null,
) {
  const sourceKey = baseSourceKey(origin),
    path = basePath(p.ownerId, p.baseId),
    writes = [],
    text = baseTextFields(sourceKey, texts),
    item = {
      sourceKey,
      kind: origin.kind,
      origin,
      parentKey: null,
      archived: false,
      orderKey: order(origin.id),
      title: '',
      ...metadata,
      fields: text.fields,
      structured,
      image: image
        ? { imageKey: baseImageKey(image.imageId), alt: image.alt, caption: image.caption }
        : null,
    };
  assertCaptureBudget({ item, bodies: text.bodies });
  const existing = await tx.get(db.doc(`${path}/items/${sourceKey}`));
  if (existing.exists) fail('failed-precondition', 'Recurso duplicado na captura.');
  if (image) {
    const key = baseImageKey(image.imageId),
      ref = db.doc(`${path}/images/${key}`),
      current = await tx.get(ref);
    if (!current.exists)
      writes.push(() =>
        tx.create(ref, { imageKey: key, imageId: image.imageId, state: 'pending' }),
      );
  }
  writes.push(() => tx.create(existing.ref, item));
  for (const body of text.bodies)
    writes.push(() =>
      tx.create(db.doc(`${path}/bodies/${baseBodyKey(sourceKey, body.field, body.index)}`), body),
    );
  return { item, commit: () => writes.forEach((write) => write()) };
}
export async function storeLoreReference(tx, db, p, reference) {
  const key = digest(reference),
    ref = db.doc(`${basePath(p.ownerId, p.baseId)}/loreReferences/${key}`),
    current = await tx.get(ref);
  return {
    added: !current.exists,
    commit() {
      if (!current.exists)
        tx.create(ref, { referenceKey: key, reference, available: false, processed: false });
    },
  };
}
export async function captureItem(tx, db, p, phase, snapshot) {
  const value = snapshot.data(),
    id = snapshot.id,
    path = `adventures/${p.adventureId}`,
    counts = {},
    writes = [];
  if (!value || value.deleting)
    fail('failed-precondition', 'Conclua a exclusão da origem antes de capturar.');
  if (value.ownerId && value.ownerId !== p.ownerId)
    fail('permission-denied', 'Recurso da origem indisponível.');
  let plan;
  if (phase === 'parts') {
    if (value.rebalancing)
      fail('failed-precondition', 'Conclua a reorganização antes de capturar.');
    plan = await storeCapturedItem(
      tx,
      db,
      p,
      originFor(p, 'part', id),
      { title: value.title ?? '', orderKey: order(value.order) },
      'content' in value ? { legacyContent: value.content } : {},
      { contentMode: value.contentMode ?? 'scenes' },
    );
  } else if (phase === 'scenes') {
    const state = adventureBlockState(value),
      fields = adventureSceneFields(value),
      body = (await tx.get(db.doc(snapshot.ref.path + '/body/current'))).data(),
      planning = (await tx.get(db.doc(snapshot.ref.path + '/planning/current'))).data() ?? {};
    if (
      !body ||
      typeof body.content !== 'string' ||
      digest(body.content) !== body.hash ||
      body.hash !== value.bodyHash ||
      countVisibleWords(body.content) !== state.main
    )
      fail('failed-precondition', 'O corpo da cena está inconsistente.');
    let group;
    if (value.parentId != null) {
      group = (await tx.get(db.doc(path + '/parts/' + value.parentId))).data();
      if (!group || group.deleting || group.rebalancing)
        fail('failed-precondition', 'Parte indisponível ou em reorganização.');
    } else {
      group = (await tx.get(db.doc(path + '/sceneControls/unassigned'))).data();
      if (group?.rebalancing)
        fail('failed-precondition', 'Conclua a reorganização antes de capturar.');
    }
    const texts = {
      content: body.content,
      objective: planning.objective ?? '',
      conflict: planning.conflict ?? '',
      pointOfView: planning.pointOfView ?? '',
    };
    plan = await storeCapturedItem(
      tx,
      db,
      p,
      originFor(p, 'scene', id),
      {
        title: value.title,
        parentKey: value.parentId == null ? null : capturedKey(p, 'part', value.parentId),
        archived: Boolean(value.archived),
        orderKey: order(value[group?.rankSlot === 'B' ? 'rankB' : 'rankA'] ?? id),
        stage: value.stage ?? 'planned',
      },
      texts,
      {
        wordCount: state.total,
        mainWordCount: state.main,
        blockWordCount: state.extra,
        blockCount: state.count,
        capturedExtraWords: 0,
        capturedExtraCount: 0,
      },
    );
    const mainOrigin = originFor(p, 'block', id, { role: 'main' }),
      mainKey = baseSourceKey(mainOrigin),
      main = {
        sourceKey: mainKey,
        kind: 'block',
        origin: mainOrigin,
        parentKey: plan.item.sourceKey,
        archived: Boolean(value.archived),
        orderKey: order(state.mainOrder),
        title: fields.mainBlockTitle,
        type: fields.mainBlockType,
        audience: fields.mainBlockAudience,
        role: 'main',
        fields: plan.item.fields.filter((field) => field.field === 'content'),
        structured: { wordCount: state.main },
        image: value.mainBlockImage
          ? {
              imageKey: baseImageKey(value.mainBlockImage.imageId),
              alt: value.mainBlockImage.alt,
              caption: value.mainBlockImage.caption,
            }
          : null,
      };
    if (main.image) {
      const ref = db.doc(`${basePath(p.ownerId, p.baseId)}/images/${main.image.imageKey}`),
        existing = await tx.get(ref);
      if (!existing.exists)
        writes.push(() =>
          tx.create(ref, {
            imageKey: main.image.imageKey,
            imageId: value.mainBlockImage.imageId,
            state: 'pending',
          }),
        );
    }
    writes.push(() => tx.create(db.doc(`${basePath(p.ownerId, p.baseId)}/items/${mainKey}`), main));
    counts.block = 1;
  } else if (phase === 'blocks') {
    const sceneKey = capturedKey(p, 'scene', value.sceneId),
      ref = db.doc(`${basePath(p.ownerId, p.baseId)}/items/${sceneKey}`),
      scene = (await tx.get(ref)).data(),
      body = (await tx.get(db.doc(snapshot.ref.path + '/body/current'))).data();
    if (
      !scene ||
      !body ||
      typeof body.content !== 'string' ||
      digest(body.content) !== body.hash ||
      body.hash !== value.bodyHash ||
      countVisibleWords(body.content) !== value.wordCount
    )
      fail('failed-precondition', 'O bloco da origem está inconsistente.');
    plan = await storeCapturedItem(
      tx,
      db,
      p,
      originFor(p, 'block', id, { role: 'additional' }),
      {
        title: value.title,
        parentKey: sceneKey,
        archived: scene.archived || Boolean(value.archived),
        orderKey: order(value.order),
        type: value.narrativeType,
        audience: value.audience,
        role: 'additional',
      },
      { content: body.content },
      { wordCount: value.wordCount, ownArchived: Boolean(value.archived) },
      value.image ?? null,
    );
    if (!value.archived) {
      const structured = {
        ...scene.structured,
        capturedExtraWords: scene.structured.capturedExtraWords + value.wordCount,
        capturedExtraCount: scene.structured.capturedExtraCount + 1,
      };
      writes.push(() => tx.update(ref, { structured }));
    }
  } else if (['arcs', 'milestones', 'events'].includes(phase)) {
    const kind = { arcs: 'arc', milestones: 'milestone', events: 'event' }[phase],
      resource = { kind, ...(kind === 'milestone' ? { arcId: p.parentId } : {}) },
      sequenceKey = digest(resource),
      control = (await tx.get(db.doc(path + '/narrativeControls/' + sequenceKey))).data();
    if (control?.rebalancing)
      fail('failed-precondition', 'Conclua a reorganização narrativa antes de capturar.');
    const textNames = {
      arc: ['initialState', 'objective', 'plannedOutcome'],
      milestone: ['notes'],
      event: ['description'],
    }[kind];
    plan = await storeCapturedItem(
      tx,
      db,
      p,
      originFor(p, kind, id, kind === 'milestone' ? { arcId: p.parentId } : {}),
      {
        title: value.title,
        parentKey: kind === 'milestone' ? capturedKey(p, 'arc', p.parentId) : null,
        orderKey: order(value[control?.rankSlot === 'B' ? 'rankB' : 'rankA'] ?? id),
        ...(kind === 'event' ? { dateLabel: value.dateLabel ?? '' } : {}),
      },
      Object.fromEntries(textNames.map((field) => [field, value[field] ?? ''])),
    );
  } else if (phase === 'sceneReferences' || phase === 'narrativeLinks') {
    const reference = phase === 'sceneReferences' ? value : value.reference;
    if (phase === 'narrativeLinks') {
      const source = value.source;
      if (!source || !['scene', 'arc', 'milestone', 'event'].includes(source.kind))
        fail('failed-precondition', 'Referência narrativa inconsistente.');
      const sourceId = source.id ?? source.sceneId;
      const key = capturedKey(
        p,
        source.kind,
        sourceId,
        source.kind === 'milestone' ? { arcId: source.arcId } : undefined,
      );
      if (!(await tx.get(db.doc(`${basePath(p.ownerId, p.baseId)}/items/${key}`))).exists)
        fail('failed-precondition', 'A origem da referência narrativa está indisponível.');
      const linkKey = digest({ kind: 'narrativeLink', id });
      writes.push(() =>
        tx.create(db.doc(`${basePath(p.ownerId, p.baseId)}/links/${linkKey}`), {
          kind: 'narrative',
          sourceKey: key,
          reference: value.reference,
        }),
      );
    } else {
      const key = capturedKey(p, 'scene', p.parentId);
      if (!(await tx.get(db.doc(`${basePath(p.ownerId, p.baseId)}/items/${key}`))).exists)
        fail('failed-precondition', 'Cena da referência indisponível.');
      writes.push(() =>
        tx.create(
          db.doc(
            `${basePath(p.ownerId, p.baseId)}/links/${digest({ kind: 'sceneReference', sceneId: p.parentId, id })}`,
          ),
          { kind: 'scene', sourceKey: key, reference },
        ),
      );
    }
    const lore =
      phase === 'sceneReferences'
        ? reference
        : reference?.kind === 'lore'
          ? reference.reference
          : null;
    if (lore) {
      if (lore.kind !== 'universe' || lore.scopeId !== p.sourceUniverseId) {
        // Keep the captured reference unavailable; never resolve into another scope.
      } else {
        const pending = await storeLoreReference(tx, db, p, lore);
        writes.push(pending.commit);
        counts.reference = Number(pending.added);
      }
    }
  } else if (phase === 'lore') {
    const reference = value.reference,
      loreSnapshot = await tx.get(
        db.doc(`universes/${reference.scopeId}/lore/${reference.entityId}`),
      ),
      entity = loreSnapshot.data();
    if (entity && !entity.deleting) {
      const origin = { kind: 'lore', scopeId: reference.scopeId, id: reference.entityId },
        texts = { details: entity.details ?? '', summary: entity.summary ?? '' };
      for (const field of ['appearance', 'personality', 'history', 'notes'])
        if (entity.structuredDetails) texts[field] = entity.structuredDetails[field] ?? '';
      plan = await storeCapturedItem(
        tx,
        db,
        p,
        origin,
        { title: entity.name, orderKey: reference.entityId },
        texts,
        {
          aliases: entity.aliases ?? [],
          category: entity.category,
          relations: entity.relations ?? [],
          isPublic: entity.isPublic ?? false,
        },
      );
      writes.push(() =>
        tx.update(snapshot.ref, {
          processed: true,
          available: true,
          sourceKey: plan.item.sourceKey,
        }),
      );
    } else writes.push(() => tx.update(snapshot.ref, { processed: true, available: false }));
  }
  if (plan) {
    counts[plan.item.kind] = (counts[plan.item.kind] ?? 0) + 1;
    writes.unshift(plan.commit);
  }
  return { counts, commit: () => writes.forEach((write) => write()) };
}
