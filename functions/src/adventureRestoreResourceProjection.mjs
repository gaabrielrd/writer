import { inconsistent, restoreFail, digest, sum } from './adventureRestoreContracts.mjs';
import { validSceneRank } from './sceneRanks.mjs';
import {
  fields,
  sourceKey,
  reference as nativeReference,
  loreReference,
  sequenceKey,
} from './narrativeContracts.mjs';
import { sceneLoreLinkId } from './sceneLoreIndex.mjs';
const compatibility = () => restoreFail('failed-precondition', 'native-compatibility');
const text = (value, max, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    compatibility();
  return value;
};
const address = (...path) => ({ scope: 'adventure', path });
const create = (a, value, mode = 'create') => ({ address: a, value, mode });
const update = (a, change) => ({ address: a, mode: 'update', update: change });
const dates = (d, time) => ({ createdAt: d.createdAt ?? time, updatedAt: d.updatedAt ?? time });
function narrative(uid, value, timestamp) {
  const d = value.data,
    type = value.kind;
  if (!validSceneRank(d.rankA) || !validSceneRank(d.rankB)) compatibility();
  const data = Object.fromEntries(
    ['title', ...fields[type]].map((k) => [
      k,
      text(d[k] ?? '', k === 'title' || k === 'dateLabel' ? 300 : 4000, k === 'title'),
    ]),
  );
  return {
    ...data,
    id: value.id,
    kind: type,
    ...(type === 'milestone' ? { arcId: value.parentId } : {}),
    ownerId: uid,
    schemaVersion: 1,
    revision: 1,
    rankA: d.rankA,
    rankB: d.rankB,
    referenceCount: 0,
    ...dates(d, timestamp),
  };
}
/** Plan only; source proofs and previous native versions are verified by the committing service. */
export async function projectAdventureRestoreResource({
  uid,
  stage,
  unit,
  mapper,
  reader,
  first = false,
}) {
  const mapped = await mapper.mapJSON(unit.record, unit.value),
    next = structuredClone(stage),
    writes = [],
    proofs = [unit],
    value = mapped.value,
    time = stage.timestamp;
  if (first) {
    writes.push(
      update({ scope: 'job', path: ['preparedRoot', 'current'] }, (old) => {
        if (old.ownerId !== uid || old.kind !== 'adventure-restore-definition') inconsistent();
        return {
          ...old,
          value: { ...old.value, hasNarrativeResources: true, narrativeRevision: 1 },
        };
      }),
    );
    writes.push(
      create(address('narrativeControls', 'entity-scenes'), { complete: false, processed: 0 }),
    );
  }
  if (unit.record.kind === 'adventure-resources') {
    if (digest(next.resourceCounts) !== digest(unit.value.counts)) inconsistent();
    next.phase = 'resources-ready';
    next.resourceIndex++;
    writes.push(
      update(address('narrativeControls', 'entity-scenes'), (old) => {
        if (old.complete !== false || old.processed !== 0) inconsistent();
        return { complete: true, processed: next.resourceCounts['scene-reference'] };
      }),
    );
    return { next, writes, proofs, sourceToken: digest(proofs.map((p) => p.sourceToken)) };
  }
  if (unit.record.kind !== 'adventure-resource' || !Object.hasOwn(next.resourceCounts, value.kind))
    inconsistent();
  const type = value.kind,
    d = value.data;
  next.resourceCounts[type] = sum(next.resourceCounts[type], 1);
  next.resourcesProcessed = sum(next.resourcesProcessed, 1);
  next.resourceIndex++;
  if (type === 'progress') {
    writes.push(
      update(address('workProgress', 'current'), (old) => {
        if (old.countReady !== false) inconsistent();
        return {
          ...old,
          ...(value.present
            ? {
                editorialState: d.editorialState ?? old.editorialState,
                wordGoal: d.wordGoal ?? null,
                ...(d.updatedAt !== undefined ? { updatedAt: d.updatedAt } : {}),
              }
            : {}),
          countReady: false,
        };
      }),
    );
  } else if (type === 'checklist') {
    next.checklistTotal = sum(next.checklistTotal, 1);
    next.checklistCompleted = sum(next.checklistCompleted, Number(d.completed));
    writes.push(
      create(address('workChecklist', value.id), {
        id: value.id,
        title: text(d.title, 300, true),
        completed: d.completed,
        revision: 1,
        ...dates(d, time),
      }),
    );
    writes.push(
      update(address('workProgress', 'current'), (old) => {
        if (
          old.countReady !== false ||
          old.checklistTotal !== stage.checklistTotal ||
          old.checklistCompleted !== stage.checklistCompleted
        )
          inconsistent();
        return {
          ...old,
          checklistRevision: sum(old.checklistRevision, 1),
          checklistTotal: next.checklistTotal,
          checklistCompleted: next.checklistCompleted,
          countReady: false,
        };
      }),
    );
  } else if (['arc', 'event', 'milestone'].includes(type)) {
    if (type === 'milestone') {
      const sourceArc = await reader.findResource('arc', unit.value.parentId);
      proofs.push(sourceArc);
      const arc = await mapper.mapJSON(sourceArc.record, sourceArc.value);
      writes.push(create(address('arcs', arc.value.id), narrative(uid, arc.value, time), 'ensure'));
    }
    const path =
      type === 'milestone'
        ? ['arcs', value.parentId, 'milestones', value.id]
        : [type === 'arc' ? 'arcs' : 'timelineEvents', value.id];
    writes.push(
      create(address(...path), narrative(uid, value, time), type === 'arc' ? 'ensure' : 'create'),
    );
  } else if (['arc-order', 'event-order', 'milestone-order'].includes(type) && value.present) {
    const sequence = type.slice(0, -6),
      resource = { kind: sequence, ...(sequence === 'milestone' ? { arcId: value.parentId } : {}) };
    writes.push(
      create(address('narrativeControls', sequenceKey(resource)), {
        resource,
        rankSlot: d.rankSlot ?? 'A',
        structureRevision: 0,
        updatedAt: time,
      }),
    );
  } else if (type === 'narrative-link') {
    let ref;
    try {
      ref = nativeReference(d.reference);
    } catch {
      compatibility();
    }
    writes.push(
      create(address('narrativeLinks', value.id), {
        id: value.id,
        source: d.source,
        sourceKey: sourceKey(d.source),
        sourceArcId:
          d.source.kind === 'milestone'
            ? d.source.arcId
            : d.source.kind === 'arc'
              ? d.source.id
              : null,
        reference: ref,
        ...(ref.kind === 'lore' ? { loreKey: digest(ref.reference) } : {}),
      }),
    );
  } else if (type === 'scene-planning' && value.present) {
    const data = Object.fromEntries(
      ['objective', 'conflict', 'pointOfView'].map((k) => [k, text(d[k] ?? '', 4000)]),
    );
    writes.push(create(address('scenes', value.parentId, 'planning', 'current'), data));
  } else if (type === 'scene-reference') {
    let ref;
    try {
      ref = loreReference(d);
    } catch {
      compatibility();
    }
    const id = sceneLoreLinkId(value.parentId, ref);
    writes.push(
      create(address('scenes', value.parentId, 'references', digest(ref)), ref),
      create(address('sceneLoreLinks', id), {
        id,
        sceneId: value.parentId,
        reference: ref,
        loreKey: digest(ref),
      }),
    );
  }
  // Structural heads/bodies and group controls were copied by the previous pass.
  return { next, writes, proofs, sourceToken: digest(proofs.map((p) => p.sourceToken)) };
}
