// @vitest-environment node
import { it, expect } from 'vitest';
import { streamAdventureArchive } from '../index';
import { imageDataFixture } from './adventureImageFixture.mjs';
import { createWorkHistoryService } from '../../../../functions/src/workHistory.mjs';
import {
  historyReady,
  historyFinish,
} from '../../../../functions/test/helpers/adventureRestoreHistoryFixture.mjs';
import { cleanup } from '../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import {
  readHistoryVersion,
  readHistoryChunk,
} from '../../../../functions/src/workHistoryContracts.mjs';
import { createAdventureRestoreRemapper } from '../../../../functions/src/adventureRestoreRemap.mjs';
import { digest } from '../../../../functions/src/sceneContracts.mjs';
async function capture(kind) {
  const source = await imageDataFixture(1, false),
    history = createWorkHistoryService({ db: source.db, now: () => 3000 }),
    resource = { kind: 'scene', id: source.sceneId };
  const original = 'a'.repeat(65535) + '🌙';
  await source.scenes.updateScene('author', {
    target: source.target,
    sceneId: source.sceneId,
    operationId: 'history-scene-source-0001',
    expectedRevision: source.records.get(source.path + '/scenes/' + source.sceneId).revision,
    patch: { content: original },
  });
  const current = await history.getWorkVersionSource('author', { target: source.target, resource });
  await history.createWorkVersion('author', {
    target: source.target,
    resource,
    operationId: 'history-native-manual-0001',
    expectedSourceToken: current.sourceToken,
    label: 'PRIVATE_MANUAL',
  });
  await source.scenes.updateScene('author', {
    target: source.target,
    sceneId: source.sceneId,
    operationId: 'history-scene-change-0001',
    expectedRevision: source.records.get(source.path + '/scenes/' + source.sceneId).revision,
    patch: { content: 'PRIVATE_BEFORE_RESTORE' },
  });
  const changed = await history.getWorkVersionSource('author', { target: source.target, resource });
  await history.restoreWorkVersion('author', {
    target: source.target,
    resource,
    versionId: 'history-native-manual-0001',
    operationId: 'history-native-restore-0001',
    expectedSourceToken: changed.sourceToken,
  });
  const blockResource = { kind: 'block', id: source.blockId };
  await source.blocks.updateAdventureBlock('author', {
    adventureId: source.id,
    resource: blockResource,
    expectedRevision: source.records.get(source.path + '/sceneBlocks/' + source.blockId).revision,
    operationId: 'history-empty-block-0001',
    patch: { content: '' },
  });
  const empty = await history.getWorkVersionSource('author', {
    target: source.target,
    resource: blockResource,
  });
  await history.createWorkVersion('author', {
    target: source.target,
    resource: blockResource,
    operationId: 'history-native-empty-0001',
    expectedSourceToken: empty.sourceToken,
    label: null,
  });
  const draft = {
    adventureId: source.id,
    resource: kind === 'scene' ? resource : blockResource,
    content: kind === 'scene' ? '<p>' + 'PRIVATE_DRAFT 🌙 '.repeat(10000) + '</p>' : '',
    baseRevision: 1,
    savedAt: 1234,
  };
  const buffers = [];
  for await (const bytes of streamAdventureArchive(source.id, source.scanApi, {
    guard: () => {},
    draft,
  }))
    buffers.push(bytes);
  return { source, draft, bytes: Buffer.concat(buffers), original };
}
for (const kind of ['scene', 'block'])
  it(
    'preserves native history and ' +
      kind +
      ' draft text separately without changing the saved manuscript',
    async () => {
      const { source, draft, bytes } = await capture(kind),
        { f, p } = await historyReady(bytes),
        before = new Map(
          [...f.records].filter(
            ([k]) =>
              k.startsWith('adventures/' + p.adventureId + '/') && k.endsWith('/body/current'),
          ),
        ),
        end = await historyFinish(f, p),
        path = 'adventures/' + p.adventureId;
      const map = createAdventureRestoreRemapper({
          schemaVersion: 1,
          jobToken: p.jobToken,
          sourceAdventureId: source.id,
          adventureId: p.adventureId,
        }),
        context = { target: { kind: 'adventure', id: p.adventureId }, path };
      const headers = [...f.records.entries()].filter(([k]) =>
        k.startsWith(path + '/workVersions/'),
      );
      expect(headers.length).toBe(3);
      for (const [, original] of [...source.records].filter(([k]) =>
        k.startsWith(source.path + '/workVersions/'),
      )) {
        const id = map.identity('version', original.id);
        const restored = await f.db.runTransaction(async (tx) => {
          const h = await readHistoryVersion(tx, f.db, context, id),
            parts = [];
          for (let i = 0; i < h.chunkCount; i++)
            parts.push((await readHistoryChunk(tx, f.db, context, h, i)).content);
          return { h, content: parts.join('') };
        });
        expect(restored.h).toMatchObject({
          reason: original.reason,
          createdAt: original.createdAt,
          label: original.label,
          wordCount: original.wordCount,
          contentHash: original.contentHash,
        });
        expect(digest(restored.content)).toBe(original.contentHash);
        expect(restored.h.resource.id).toBe(
          map.identity(original.resource.kind, original.resource.id),
        );
      }
      expect(headers.some(([, h]) => h.reason === 'before-restore')).toBe(true);
      const descriptor = f.records.get(f.path + '/preparedRoot/recovered-draft');
      expect(descriptor).toMatchObject({
        state: 'pending-finalization',
        resource: { kind, id: map.identity(kind, draft.resource.id) },
        baseRevision: 1,
        savedAt: 1234,
        byteLength: Buffer.byteLength(draft.content),
        contentHash: digest(draft.content),
      });
      expect(f.records.has(path + '/workVersions/' + descriptor.versionId)).toBe(false);
      const draftText = [...f.records.entries()]
        .filter(
          ([k, v]) =>
            k.startsWith(path + '/workVersionBodies/') && v.versionId === descriptor.versionId,
        )
        .map(([, v]) => v)
        .sort((a, b) => a.index - b.index)
        .map((v) => v.content)
        .join('');
      expect(draftText).toBe(draft.content);
      expect(end.staging.drafts).toBe(1);
      for (const [k, v] of before) expect(f.records.get(k)).toEqual(v);
      expect(f.records.get(path)).not.toHaveProperty('ownerId');
      expect(JSON.stringify(end)).not.toMatch(/PRIVATE_|rawCheckpoint|tailBase64/);
      const cancelled = await cleanup(f, end, 50);
      expect(cancelled.staging.cleanedArtifacts).toBe(end.staging.artifactCount);
      expect(
        [...f.records.keys()].filter((k) => k.startsWith(path + '/') || k.startsWith(f.path + '/')),
      ).toEqual([]);
    },
    60000,
  );
