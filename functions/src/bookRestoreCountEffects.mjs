import { digest } from './sceneContracts.mjs';
import { readBookSceneSource } from './bookSceneSourceText.mjs';
import { checkRestoredLorePayload } from './bookRestoreLorePayloadRead.mjs';
import { countVisibleWords } from './visibleWordCount.mjs';
import { inconsistent, sum } from './bookRestoreUploadContracts.mjs';
import { readBookRestoreArtifact } from './bookRestoreArtifacts.mjs';
import { projectBookRestoreResource } from './bookRestoreResourceProjection.mjs';
import { createWorkProgressLedger, workGroupKey, workSourceKey } from './workProgressLedger.mjs';
import { sequenceKey, sequenceResource, sourceKey } from './narrativeContracts.mjs';

export function createBookRestoreCountEffects({ db }) {
  const ledger = createWorkProgressLedger({ db });
  const read = (tx, loaded, kind, id, optional = false) =>
    readBookRestoreArtifact(tx, db, loaded, kind, id, { optional });
  return {
    async check(tx, loaded, item, preparation = loaded.job.preparation, page = null) {
      const found = new Map(),
        p = preparation;
      if (item.record.kind === 'book-lore') {
        const artifact = await read(tx, loaded, 'lore', item.value.id);
        if (Object.hasOwn(artifact.value, 'payloadStorage')) {
          const pending = await checkRestoredLorePayload(
            tx,
            db,
            loaded,
            item,
            artifact,
            preparation,
            page,
          );
          return { native: found, pending };
        }
        if (preparation.counts?.lorePayloadOffset) inconsistent();
        const native = artifact,
          expected = {
            ...item.value.data,
            bookId: loaded.job.bookId,
            createdAt: p.timestamp,
            updatedAt: p.timestamp,
          },
          { relations, ...base } = native.value;
        if (
          digest(base) !== digest(expected) ||
          (item.loreRelations === null
            ? Object.hasOwn(native.value, 'relations')
            : !Array.isArray(relations) || relations.length !== item.loreRelations.count)
        )
          inconsistent();
        return { native: found, pending: false };
      }
      const writes = projectBookRestoreResource(item.value, loaded.job.ownerId, p.timestamp);
      for (const write of writes) {
        const native = await read(tx, loaded, write.kind, write.id);
        let logical = native.value;
        if (write.kind === 'scene-source') {
          const descriptor = native.value.original?.contentStorage;
          if (descriptor != null) await read(tx, loaded, 'text-body', descriptor.bodyId);
          logical = await readBookSceneSource(tx, db, {
            uid: loaded.job.ownerId,
            bookId: loaded.job.bookId,
            sourceId: write.id,
            source: native.value,
          });
        }
        const actual = { ...logical },
          expected = { ...write.value };
        const derived =
          write.kind === 'scene-control'
            ? ['wordCount', 'sceneCount', 'structureRevision', 'assemblyRevision']
            : write.kind === 'narrative-control'
              ? ['structureRevision']
              : [];
        for (const key of derived) {
          delete actual[key];
          delete expected[key];
        }
        if (digest(actual) !== digest(expected)) inconsistent();
        found.set(write.kind, native);
      }
      return { native: found, pending: false };
    },
    async scene(tx, loaded, native, preparation) {
      const uid = loaded.job.ownerId,
        target = { kind: 'book', id: loaded.job.bookId },
        scene = native.value,
        body = await read(tx, loaded, 'scene-body', scene.id + ':current'),
        content = body.value.content;
      if (
        typeof content !== 'string' ||
        digest(content) !== scene.bodyHash ||
        body.value.hash !== scene.bodyHash ||
        Buffer.byteLength(content) !== scene.bodyBytes
      )
        inconsistent();
      const words = countVisibleWords(content),
        writes = [
          { kind: 'scene', id: scene.id, replace: true, value: { ...scene, wordCount: words } },
        ];
      const control = await read(tx, loaded, 'work-control', 'current');
      if (control.value.countReady !== false || control.value.wordCount !== preparation.wordCount)
        inconsistent();
      const prior = await read(tx, loaded, 'word-source', workSourceKey('scene', scene.id), true);
      if (prior) inconsistent();
      await read(tx, loaded, 'word-group', workGroupKey(target, scene.parentId), true);
      const groupKind = scene.parentId === null ? 'scene-control' : 'chapter',
        groupId = scene.parentId === null ? 'unassigned' : scene.parentId;
      let group = await read(tx, loaded, groupKind, groupId, true);
      if (!group && scene.parentId === null) {
        if (preparation.resourceCounts['scene-control'] !== 0) inconsistent();
        group = {
          value: projectBookRestoreResource(
            {
              kind: 'scene-control',
              id: 'unassigned',
              parentId: null,
              data: { rankSlot: 'A' },
            },
            uid,
            preparation.timestamp,
          )[0].value,
        };
      }
      if (group) {
        const value = group.value;
        if (scene.parentId !== null && value.contentMode !== 'scenes') inconsistent();
        writes.push({
          kind: groupKind,
          id: groupId,
          replace: true,
          value: {
            ...value,
            wordCount: sum(value.wordCount, scene.archived ? 0 : words),
            sceneCount: sum(value.sceneCount, 1),
            structureRevision: 1,
            assemblyRevision: 1,
          },
        });
      }
      const buffered = [],
        prefix = 'books/' + target.id + '/',
        proxy = {
          get: tx.get.bind(tx),
          getAll: typeof tx.getAll === 'function' ? tx.getAll.bind(tx) : undefined,
          set(ref, value) {
            buffered.push({ ref, value });
          },
          update() {
            inconsistent();
          },
        },
        change = await ledger.prepareChanges(proxy, {
          target,
          root: { authorId: uid, hasProgressResources: true },
          changes: [
            {
              kind: 'scene',
              id: scene.id,
              content,
              parentId: scene.parentId,
              archived: scene.archived,
            },
          ],
          groupStates: group ? [group.value] : [],
        });
      if (change.control.countReady !== false) inconsistent();
      change.commit();
      const families = {
        workProgress: 'work-control',
        workWordGroups: 'word-group',
        workWordSources: 'word-source',
      };
      for (const item of buffered) {
        if (!item.ref.path.startsWith(prefix)) inconsistent();
        const [family, id, extra] = item.ref.path.slice(prefix.length).split('/');
        if (!families[family] || extra !== undefined) inconsistent();
        writes.push({ kind: families[family], id, value: item.value, replace: true });
      }
      preparation.wordCount = change.wordCount;
      return writes;
    },
    async sequence(tx, loaded, native) {
      const sequence = sequenceResource(native.value),
        id = sequenceKey(sequence),
        stored = await read(tx, loaded, 'narrative-control', id, true),
        value =
          stored?.value ??
          projectBookRestoreResource(
            {
              kind: 'narrative-control',
              id,
              parentId: null,
              data: { rankSlot: 'A', resource: sequence },
            },
            loaded.job.ownerId,
            loaded.job.preparation.timestamp,
          )[0].value;
      return [
        { kind: 'narrative-control', id, replace: true, value: { ...value, structureRevision: 1 } },
      ];
    },
    async link(tx, loaded, link) {
      const { source, reference } = link.value;
      if (
        link.value.id !== digest({ source, reference }) ||
        link.value.sourceKey !== sourceKey(source)
      )
        inconsistent();
      const id = source.kind === 'milestone' ? source.arcId + ':' + source.id : source.id,
        native = await read(tx, loaded, source.kind, id, true);
      return native
        ? [
            {
              kind: source.kind,
              id,
              replace: true,
              value: { ...native.value, referenceCount: sum(native.value.referenceCount, 1) },
            },
          ]
        : [];
    },
    async finish(tx, loaded, preparation) {
      const control = await read(tx, loaded, 'work-control', 'current');
      if (
        control.value.countReady !== false ||
        control.value.wordCount !== preparation.wordCount ||
        preparation.counts.sceneCount !== preparation.resourceCounts.scene
      )
        inconsistent();
      return [
        {
          kind: 'entity-index-control',
          id: 'entity-scenes',
          value: { schemaVersion: 1, complete: true, updatedAt: preparation.timestamp },
        },
      ];
    },
  };
}
