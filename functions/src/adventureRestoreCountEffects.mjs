import { digest, inconsistent, sum } from './adventureRestoreContracts.mjs';
import { countVisibleWords } from './visibleWordCount.mjs';
import { adventureBlockState } from './adventureBlocksState.mjs';
import { createWorkProgressLedger, workGroupKey, workSourceKey } from './workProgressLedger.mjs';
import { sequenceKey, sequenceResource } from './narrativeContracts.mjs';
import {
  adventureStageArtifactId,
  adventureStageTarget,
  readAdventureStageArtifact,
} from './adventureRestoreArtifacts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
export const countAddress = (...path) => ({ scope: 'adventure', path });
const rootAddress = { scope: 'job', path: ['preparedRoot', 'current'] };
const same = (a, b) => {
  if (digest(a) !== digest(b)) inconsistent();
};
export async function readAdventureCountArtifact(store, tx, loaded, address, optional = false) {
  const journal = await tx.get(
    store.db.doc(loaded.ref.path + '/stagingArtifacts/' + adventureStageArtifactId(address)),
  );
  if (!journal.exists && optional) {
    const head = await readWorkMetadata(tx, adventureStageTarget(store, loaded, address), [
      'schemaVersion',
    ]);
    if (head.exists) inconsistent();
    return null;
  }
  return readAdventureStageArtifact(store, tx, loaded, journal, { withValue: true });
}
const replace = (address, prior, value) =>
  prior ? { address, mode: 'update', update: () => value } : { address, value };
const unassigned = (stage) => ({
  schemaVersion: 1,
  revision: 1,
  rankSlot: 'A',
  assemblyRevision: 0,
  structureRevision: 0,
  wordCount: 0,
  sceneCount: 0,
  updatedAt: stage.timestamp,
});
/** All reads are proved before the existing ledger runs; writes stay journaled. */
export function createAdventureRestoreCountEffects(store) {
  const ledger = createWorkProgressLedger({ db: store.db });
  const read = (tx, loaded, address, optional = false) =>
    readAdventureCountArtifact(store, tx, loaded, address, optional);
  async function checkedText(tx, loaded, plan) {
    const expected = plan.expected.writes,
      head = await read(tx, loaded, expected[0].address),
      body = await read(tx, loaded, expected[1].address),
      actual = { ...head.data },
      wanted = { ...expected[0].value };
    if (plan.value.kind === 'scene') {
      for (const key of [
        'wordCount',
        'blockWordCount',
        'blockCount',
        'nextBlockOrder',
        'blocksStructureRevision',
      ]) {
        delete actual[key];
        delete wanted[key];
      }
      adventureBlockState(head.data);
    }
    same(actual, wanted);
    same(body.data, expected[1].value);
    if (countVisibleWords(body.data.content) !== expected[0].value.wordCount) inconsistent();
    return { head, body };
  }
  return {
    async block(tx, loaded, plan, stage) {
      const { head } = await checkedText(tx, loaded, plan),
        block = head.data,
        address = countAddress('scenes', block.sceneId),
        parent = await read(tx, loaded, address);
      if (parent.data.ownerId !== loaded.uid || parent.data.deleting) inconsistent();
      const state = adventureBlockState(parent.data),
        active = !block.archived && !block.deleting,
        extra = sum(state.extra, active ? block.wordCount : 0),
        value = {
          ...parent.data,
          blockWordCount: extra,
          blockCount: sum(state.count, Number(active)),
          wordCount: sum(state.main, extra),
          nextBlockOrder: Math.max(state.nextOrder, sum(block.order, 1)),
          blocksStructureRevision: 1,
        };
      adventureBlockState(value);
      stage.countBlocks = sum(stage.countBlocks, 1);
      return [replace(address, parent, value)];
    },
    async scene(tx, loaded, plan, stage) {
      const { head, body } = await checkedText(tx, loaded, plan),
        scene = head.data,
        target = { kind: 'adventure', id: loaded.job.adventureId },
        groupAddress =
          scene.parentId === null
            ? countAddress('sceneControls', 'unassigned')
            : countAddress('parts', scene.parentId),
        group = await read(tx, loaded, groupAddress, true),
        control = await read(tx, loaded, countAddress('workProgress', 'current')),
        sourceAddress = countAddress('workWordSources', workSourceKey('scene', scene.id)),
        prior = await read(tx, loaded, sourceAddress, true);
      if (
        prior ||
        control.data.countReady !== false ||
        control.data.wordCount !== stage.countWordCount
      )
        inconsistent();
      if (
        group &&
        scene.parentId !== null &&
        (group.data.ownerId !== loaded.uid || group.data.deleting)
      )
        inconsistent();
      await read(
        tx,
        loaded,
        countAddress('workWordGroups', workGroupKey(target, scene.parentId)),
        true,
      );
      const buffered = [],
        proxy = {
          get: tx.get.bind(tx),
          ...(typeof tx.getAll === 'function' ? { getAll: tx.getAll.bind(tx) } : {}),
          set(ref, value) {
            buffered.push({ ref, value });
          },
          update() {
            inconsistent();
          },
        },
        result = await ledger.prepareChanges(proxy, {
          target,
          root: { ownerId: loaded.uid, hasProgressResources: true },
          changes: [
            {
              kind: 'scene',
              id: scene.id,
              parentId: scene.parentId,
              archived: scene.archived,
              content: body.data.content,
              blockScene: scene,
            },
          ],
        });
      if (result.ready !== false || result.control.countReady !== false) inconsistent();
      result.commit();
      const writes = [];
      if (group || scene.parentId === null) {
        const old = group?.data ?? unassigned(stage);
        writes.push(
          replace(groupAddress, group, {
            ...old,
            wordCount: sum(old.wordCount, scene.archived ? 0 : scene.wordCount),
            sceneCount: sum(old.sceneCount, 1),
            structureRevision: 1,
            assemblyRevision: 1,
          }),
        );
      }
      const prefix = 'adventures/' + target.id + '/';
      for (const entry of buffered) {
        if (!entry.ref.path.startsWith(prefix)) inconsistent();
        const parts = entry.ref.path.slice(prefix.length).split('/');
        if (
          parts.length !== 2 ||
          !['workProgress', 'workWordSources', 'workWordGroups'].includes(parts[0])
        )
          inconsistent();
        const address = countAddress(...parts),
          old = await read(tx, loaded, address, true);
        writes.push(replace(address, old, entry.value));
      }
      stage.countScenes = sum(stage.countScenes, 1);
      stage.countWordCount = result.wordCount;
      return writes;
    },
    async sequence(tx, loaded, plan) {
      const resource = sequenceResource({
          ...plan.value.data,
          kind: plan.value.kind,
          ...(plan.value.kind === 'milestone' ? { arcId: plan.value.parentId } : {}),
        }),
        address = countAddress('narrativeControls', sequenceKey(resource)),
        old = await read(tx, loaded, address, true);
      // The resource must itself have a native, source-equivalent head.
      for (const expected of plan.expected.writes) {
        const observed = await read(tx, loaded, expected.address);
        same(observed.data, expected.value);
      }
      return [
        replace(address, old, {
          ...(old?.data ?? { resource, rankSlot: 'A', updatedAt: loaded.job.staging.timestamp }),
          structureRevision: 1,
        }),
      ];
    },
    async link(tx, loaded, plan, stage) {
      const expected = plan.expected.writes[0],
        link = await read(tx, loaded, expected.address);
      same(link.data, expected.value);
      const source = link.data.source,
        address =
          source.kind === 'milestone'
            ? countAddress('arcs', source.arcId, 'milestones', source.id)
            : countAddress(source.kind === 'arc' ? 'arcs' : 'timelineEvents', source.id),
        head = await read(tx, loaded, address, true);
      stage.countLinks = sum(stage.countLinks, 1);
      return head
        ? [
            replace(address, head, {
              ...head.data,
              referenceCount: sum(head.data.referenceCount, 1),
            }),
          ]
        : [];
    },
    async finish(tx, loaded, stage) {
      const address = countAddress('workProgress', 'current'),
        control = await read(tx, loaded, address),
        root = await read(tx, loaded, rootAddress);
      if (
        control.data.countReady !== false ||
        control.data.wordCount !== stage.countWordCount ||
        stage.countBlocks !== stage.blocks ||
        stage.countScenes !== stage.scenes ||
        stage.countLinks !== stage.resourceCounts['narrative-link']
      )
        inconsistent();
      return [
        replace(address, control, {
          ...control.data,
          processed: stage.countScenes,
          phase: 'done',
          cursor: null,
          countReady: false,
        }),
        replace(rootAddress, root, {
          ...root.data,
          value: {
            ...root.data.value,
            wordCount: stage.countWordCount,
            hasSceneResources: true,
            sceneRevision: 1,
          },
        }),
      ];
    },
  };
}
