import { initialScene, initialSceneGroup, prose, digest } from './sceneContracts.mjs';
import { validSceneRank } from './sceneRanks.mjs';
import { initialWorkControl } from './workProgressContracts.mjs';
import { restoreFail, inconsistent, sum } from './adventureRestoreContracts.mjs';
const compatibility = () => restoreFail('failed-precondition', 'native-compatibility');
const title = (value, required = false) => {
  if (typeof value !== 'string' || value.length > 300 || (required && !value.trim()))
    compatibility();
  return value;
};
const dates = (data, timestamp) => ({
  createdAt: data.createdAt ?? timestamp,
  updatedAt: data.updatedAt ?? timestamp,
});
const write = (scope, path, value) => ({ address: { scope, path }, value });
function text(content) {
  try {
    return prose(content);
  } catch {
    compatibility();
  }
}
/** Construct native values only; all reads still have to be verified by the caller's transaction. */
export async function projectAdventureRestoreStructure({
  uid,
  adventureId,
  stage,
  unit,
  mapper,
  reader,
}) {
  const mapped = await mapper.mapJSON(unit.record, unit.value),
    kind = unit.record.kind,
    value = mapped.value,
    proofs = [unit],
    writes = [],
    next = structuredClone(stage);
  if (next.itemIndex === 0) {
    if (kind !== 'adventure-metadata') inconsistent();
    const d = value.data;
    title(d.title, true);
    if (d.synopsis !== undefined && d.synopsis.length > 4000) compatibility();
    const progress = await reader.findResource('progress', 'current');
    proofs.push(progress);
    const root = {
      ...d,
      id: adventureId,
      ownerId: uid,
      schemaVersion: 1,
      revision: 1,
      ...dates(d, next.timestamp),
      hasProgressResources: true,
    };
    writes.push(
      write('job', ['preparedRoot', 'current'], {
        schemaVersion: 1,
        ownerId: uid,
        kind: 'adventure-restore-definition',
        sourceAdventureId: reader.sourceAdventureId,
        value: root,
      }),
    );
    const control = initialWorkControl({ kind: 'adventure', id: adventureId }, root),
      pd = progress.value.data;
    if (progress.value.present) {
      control.wordGoal = pd.wordGoal ?? null;
      control.editorialState = pd.editorialState ?? control.editorialState;
    }
    writes.push(write('adventure', ['workProgress', 'current'], control));
  } else if (kind === 'adventure-part') {
    const d = value.data,
      control = await reader.findResource('part-control', unit.record.id);
    proofs.push(control);
    const part = initialSceneGroup({
      uid,
      id: mapped.record.id,
      title: title(d.title ?? ''),
      order: d.order ?? 0,
      timestamp: next.timestamp,
      kind: 'adventure',
    });
    Object.assign(part, dates(d, next.timestamp), { rankSlot: control.value.data.rankSlot ?? 'A' });
    if (Object.hasOwn(d, 'content')) {
      text(d.content);
      part.content = d.content;
    }
    if (Object.hasOwn(d, 'contentMode')) part.contentMode = d.contentMode;
    writes.push(write('adventure', ['parts', part.id], part));
    next.parts++;
  } else if (kind === 'adventure-resource') {
    if (next.resourceStartIndex === null) next.resourceStartIndex = next.itemIndex;
    const type = value.kind,
      d = value.data;
    if (type === 'scene' || type === 'block') {
      const bodyUnit = await reader.findResource(type + '-body', 'current', unit.value.id);
      proofs.push(bodyUnit);
      const bodyData = bodyUnit.value.data,
        payload = text(bodyData.content);
      if (bodyData.hash !== payload.bodyHash || d.bodyHash !== payload.bodyHash) inconsistent();
      if (type === 'scene') {
        if (!validSceneRank(d.rankA) || !validSceneRank(d.rankB)) compatibility();
        const created = initialScene({
          uid,
          id: value.id,
          title: title(d.title ?? ''),
          parentId: d.parentId ?? null,
          content: bodyData.content,
          timestamp: next.timestamp,
          rank: d.rankA,
        });
        Object.assign(created.record, d, dates(d, next.timestamp), {
          id: value.id,
          ownerId: uid,
          schemaVersion: 1,
          revision: 1,
          wordCount: payload.wordCount,
          bodyHash: payload.bodyHash,
          bodyBytes: payload.bodyBytes,
          stage: d.stage ?? 'planned',
          archived: d.archived ?? false,
          hasBlocks: true,
          mainWordCount: payload.wordCount,
          blockWordCount: 0,
          blockCount: 0,
          blocksStructureRevision: 0,
          nextBlockOrder: sum(d.mainBlockOrder ?? 0, 1),
          mainBlockOrder: d.mainBlockOrder ?? 0,
          mainBlockTitle: d.mainBlockTitle ?? 'Texto principal',
          mainBlockType: d.mainBlockType ?? 'scene',
          mainBlockAudience: d.mainBlockAudience ?? 'creator',
        });
        writes.push(
          write('adventure', ['scenes', value.id], created.record),
          write('adventure', ['scenes', value.id, 'body', 'current'], created.body),
        );
        next.scenes++;
      } else {
        if (!Number.isSafeInteger(d.order ?? 0) || (d.order ?? 0) < 0) compatibility();
        const record = {
          ...d,
          id: value.id,
          ownerId: uid,
          schemaVersion: 1,
          revision: 1,
          title: title(d.title ?? ''),
          order: d.order ?? 0,
          archived: d.archived ?? false,
          deleting: false,
          wordCount: payload.wordCount,
          bodyHash: payload.bodyHash,
          bodyBytes: payload.bodyBytes,
          ...dates(d, next.timestamp),
        };
        writes.push(
          write('adventure', ['sceneBlocks', value.id], record),
          write('adventure', ['sceneBlocks', value.id, 'body', 'current'], {
            ...payload.body,
            revision: 1,
          }),
        );
        next.blocks++;
      }
    } else if (type === 'scene-control') {
      writes.push(
        write('adventure', ['sceneControls', 'unassigned'], {
          schemaVersion: 1,
          revision: 1,
          rankSlot: d.rankSlot ?? 'A',
          assemblyRevision: 0,
          structureRevision: 0,
          wordCount: 0,
          sceneCount: 0,
          updatedAt: next.timestamp,
        }),
      );
    }
    // Other resources and paired body/control units remain for the next resource pass.
  } else if (kind === 'adventure-resources') next.phase = 'structure-ready';
  else inconsistent();
  next.itemIndex++;
  return { next, writes, proofs, sourceToken: digest(proofs.map((p) => p.sourceToken)) };
}
