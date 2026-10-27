// @vitest-environment node
import { it, expect } from 'vitest';
import { streamAdventureArchive } from '../index';
import { inventoryFixture } from './adventureInventoryFixture.mjs';
import { uid } from '../../../../functions/test/helpers/editorChatFixture.mjs';
import {
  transferFixture,
  upload,
  verify,
  mutation,
  cleanup,
} from '../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import { resourceFinish } from '../../../../functions/test/helpers/adventureRestoreResourcesFixture.mjs';
import { createNarrativePlanningService } from '../../../../functions/src/narrativePlanning.mjs';
import { createVerifiedAdventureRestoreContent } from '../../../../functions/src/adventureRestoreContentRead.mjs';
import { digest, sequenceKey } from '../../../../functions/src/narrativeContracts.mjs';
import { sceneLoreLinkId } from '../../../../functions/src/sceneLoreIndex.mjs';
let saved;
async function ready() {
  saved ??= (async () => {
    const f = await inventoryFixture(3);
    await f.scenes.updateScene(uid, {
      target: f.target,
      sceneId: f.sceneId,
      operationId: 'resource-native-planning-0001',
      expectedRevision: f.records.get(f.path + '/scenes/' + f.sceneId).revision,
      patch: {
        planning: {
          objective: 'PRIVATE_NATIVE_OBJECTIVE',
          conflict: 'PRIVATE_NATIVE_CONFLICT',
          pointOfView: 'PRIVATE_NATIVE_POV',
        },
      },
    });
    const reference = { kind: 'adventure', scopeId: f.id, entityId: 'inventory-lore-0001' };
    await f.scenes.setSceneReference(uid, {
      target: f.target,
      sceneId: f.sceneId,
      operationId: 'resource-native-reference-0001',
      expectedRevision: f.records.get(f.path + '/scenes/' + f.sceneId).revision,
      reference,
    });
    const narrative = createNarrativePlanningService({ db: f.db, now: () => 2400 });
    await narrative.setNarrativeReference(uid, {
      target: f.target,
      source: { kind: 'arc', id: 'inventory-arc-0001' },
      operationId: 'resource-native-narrative-0001',
      expectedRevision: 1,
      reference: { kind: 'scene', sceneId: f.sceneId },
    });
    await narrative.setNarrativeReference(uid, {
      target: f.target,
      source: { kind: 'milestone', id: 'inventory-milestone-0001', arcId: 'inventory-arc-0001' },
      operationId: 'resource-native-narrative-0002',
      expectedRevision: 1,
      reference: { kind: 'lore', reference },
    });
    const buffers = [];
    for await (const bytes of streamAdventureArchive(f.id, f.scanApi, { guard: () => {} }))
      buffers.push(bytes);
    return Buffer.concat(buffers);
  })();
  const f = transferFixture(await saved);
  let p = await verify(f, await upload(f), 16);
  for (let n = 0; ['bytes-verified', 'validating'].includes(p.state); n++) {
    if (n > 1000) throw Error('unbounded validation');
    p = (
      await f.api.advanceAdventureRestoreValidation(
        f.uid,
        mutation(p, 'native-resource-validation-' + String(n).padStart(6, '0')),
      )
    ).progress;
  }
  expect(p.state).toBe('content-verified');
  for (let n = 0; !p.staging || p.staging.phase === 'structure'; n++) {
    if (n > 1000) throw Error('unbounded structure');
    p = (
      await f.api.advanceAdventureRestoreStructure(
        f.uid,
        mutation(p, 'native-resource-structure-' + String(n).padStart(6, '0')),
      )
    ).progress;
  }
  return { f, p };
}
it('restores resources written through native services and the real portable writer without changing prose or qualified identity', async () => {
  const { f, p } = await ready(),
    end = await resourceFinish(f, p),
    root = 'adventures/' + p.adventureId;
  const reader = await createVerifiedAdventureRestoreContent({
    db: f.db,
    uid: f.uid,
    restoreId: p.restoreId,
    jobToken: p.jobToken,
  });
  let checklist = 0,
    completed = 0,
    references = 0,
    links = 0;
  for (
    let i = f.records.get(f.path).staging.resourceStartIndex;
    i < end.staging.itemIndex - 1;
    i++
  ) {
    const unit = await reader.readMappedItem(i),
      v = unit.value,
      d = v.data;
    if (v.kind === 'checklist') {
      checklist++;
      completed += Number(d.completed);
      expect(f.records.get(root + '/workChecklist/' + v.id)).toMatchObject({ ...d, revision: 1 });
    }
    if (['arc', 'event', 'milestone'].includes(v.kind)) {
      const path =
        v.kind === 'milestone'
          ? 'arcs/' + v.parentId + '/milestones/' + v.id
          : (v.kind === 'arc' ? 'arcs/' : 'timelineEvents/') + v.id;
      expect(f.records.get(root + '/' + path)).toMatchObject({
        ...d,
        ownerId: f.uid,
        referenceCount: 0,
        revision: 1,
      });
    }
    if (['arc-order', 'event-order', 'milestone-order'].includes(v.kind)) {
      const resource = {
        kind: v.kind.slice(0, -6),
        ...(v.kind === 'milestone-order' ? { arcId: v.parentId } : {}),
      };
      const value = f.records.get(root + '/narrativeControls/' + sequenceKey(resource));
      if (v.present)
        expect(value).toMatchObject({
          resource,
          rankSlot: d.rankSlot ?? 'A',
          structureRevision: 0,
        });
      else expect(value).toBeUndefined();
    }
    if (v.kind === 'scene-planning') {
      const value = f.records.get(root + '/scenes/' + v.parentId + '/planning/current');
      if (v.present) expect(value).toEqual(d);
      else expect(value).toBeUndefined();
    }
    if (v.kind === 'scene-reference') {
      references++;
      expect(d.scopeId).toBe(p.adventureId);
      expect(d.entityId).toMatch(/^restore-/);
      expect(f.records.get(root + '/scenes/' + v.parentId + '/references/' + digest(d))).toEqual(d);
      expect(
        f.records.get(root + '/sceneLoreLinks/' + sceneLoreLinkId(v.parentId, d)),
      ).toMatchObject({ sceneId: v.parentId, reference: d, loreKey: digest(d) });
    }
    if (v.kind === 'narrative-link') {
      links++;
      expect(f.records.get(root + '/narrativeLinks/' + v.id)).toMatchObject(d);
    }
    if (v.kind === 'scene-body' || v.kind === 'block-body') {
      const path =
        (v.kind === 'scene-body' ? 'scenes/' : 'sceneBlocks/') + v.parentId + '/body/current';
      expect(f.records.get(root + '/' + path).content).toBe(d.content);
    }
  }
  expect([checklist, references, links]).toEqual([1, 1, 2]);
  expect(f.records.get(root + '/workProgress/current')).toMatchObject({
    checklistTotal: checklist,
    checklistCompleted: completed,
    countReady: false,
  });
  expect(f.records.get(root + '/narrativeControls/entity-scenes')).toEqual({
    complete: true,
    processed: 1,
  });
  expect(f.records.get(root)).not.toHaveProperty('ownerId');
  expect(f.records.get(f.path + '/preparedRoot/current').value).toMatchObject({
    hasNarrativeResources: true,
    narrativeRevision: 1,
  });
  expect(JSON.stringify(end)).not.toMatch(/PRIVATE_|sourceToken|resourceCounts/);
}, 60000);
it('removes the native writer resource corpus completely while retaining the exclusive retired reservation', async () => {
  const { f, p } = await ready(),
    end = await resourceFinish(f, p),
    cancelled = await cleanup(f, end, 2);
  expect(cancelled.state).toBe('cancelled');
  expect(cancelled.staging.cleanedArtifacts).toBe(end.staging.artifactCount);
  expect(
    [...f.records.keys()].filter((k) => k.startsWith('adventures/' + p.adventureId + '/')),
  ).toEqual([]);
  expect([...f.records.keys()].filter((k) => k.startsWith(f.path + '/'))).toEqual([]);
  expect(f.records.get('adventures/' + p.adventureId).kind).toBe('adventure-restore-retired');
}, 60000);
