// @vitest-environment node
import { it, expect } from 'vitest';
import { streamAdventureArchive } from '../index';
import { inventoryFixture } from './adventureInventoryFixture.mjs';
import {
  transferFixture,
  upload,
  verify,
  cleanup,
  mutation,
} from '../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import { createVerifiedAdventureRestoreContent } from '../../../../functions/src/adventureRestoreContentRead.mjs';
import { createAdventureRestoreRemapper } from '../../../../functions/src/adventureRestoreRemap.mjs';
import { createAdventureRestoreStore } from '../../../../functions/src/adventureRestoreStore.mjs';
import { readAdventureStageArtifact } from '../../../../functions/src/adventureRestoreArtifacts.mjs';
import { createStudioService } from '../../../../functions/src/studio.mjs';
import { createScenesService } from '../../../../functions/src/scenes.mjs';
let archive;
async function sourceBytes() {
  if (!archive)
    archive = (async () => {
      const f = await inventoryFixture(3),
        parts = [];
      for await (const bytes of streamAdventureArchive(f.id, f.scanApi, { guard: () => {} }))
        parts.push(bytes);
      return Buffer.concat(parts);
    })();
  return archive;
}
const req = (p) => mutation(p, 'structure-test-' + String(p.checkpoint).padStart(8, '0'));
const reader = (f, p) =>
  createVerifiedAdventureRestoreContent({
    db: f.db,
    uid: f.uid,
    restoreId: p.restoreId,
    jobToken: p.jobToken,
  });
async function ready() {
  const f = transferFixture(await sourceBytes());
  let p = await verify(f, await upload(f), 16),
    n = 0;
  while (['bytes-verified', 'validating'].includes(p.state)) {
    if (++n > 1000) throw Error('unbounded');
    p = (
      await f.api.advanceAdventureRestoreValidation(
        f.uid,
        mutation(p, 'structure-validate-' + String(n).padStart(6, '0')),
      )
    ).progress;
  }
  return { f, p };
}
async function advance(f, p) {
  return (await f.api.advanceAdventureRestoreStructure(f.uid, req(p))).progress;
}
async function finish(f, p) {
  let n = 0;
  while (!p.staging || p.staging.phase === 'structure') {
    if (++n > 1000) throw Error('unbounded structure');
    p = await advance(f, p);
  }
  return p;
}
async function atScene(f, p) {
  while (true) {
    const r = await reader(f, p),
      unit = await r.readItem(p.staging?.itemIndex ?? 0);
    if (unit.record.kind === 'adventure-resource' && unit.value.kind === 'scene')
      return { p, unit, r };
    p = await advance(f, p);
  }
}
it('materializes native parts, paired scene/block bodies and private definition without exposing ownership', async () => {
  const { f, p } = await ready(),
    end = await finish(f, p),
    r = await reader(f, end),
    mapper = createAdventureRestoreRemapper({
      schemaVersion: 1,
      jobToken: p.jobToken,
      sourceAdventureId: r.sourceAdventureId,
      adventureId: p.adventureId,
    });
  expect(end.staging).toMatchObject({
    phase: 'structure-ready',
    parts: 1,
    scenes: 3,
    blocks: 1,
    artifactCount: 12,
  });
  expect(f.records.get('adventures/' + p.adventureId)).not.toHaveProperty('ownerId');
  expect(f.records.get(f.path + '/preparedRoot/current').value.ownerId).toBe(f.uid);
  expect(JSON.stringify(end)).not.toMatch(/PRIVATE_|preparedRoot|sourceToken/);
  const control = f.records.get('adventures/' + p.adventureId + '/workProgress/current');
  expect(control.countReady).toBe(false);
  for (let at = 0; at < r.itemCount; at++) {
    const unit = await r.readItem(at);
    if (unit.value.kind !== 'scene-body' && unit.value.kind !== 'block-body') continue;
    const type = unit.value.kind === 'scene-body' ? 'scene' : 'block',
      id = mapper.identity(type, unit.value.parentId),
      prefix =
        'adventures/' +
        p.adventureId +
        '/' +
        (type === 'scene' ? 'scenes' : 'sceneBlocks') +
        '/' +
        id,
      body = f.records.get(prefix + '/body/current'),
      head = f.records.get(prefix);
    expect(body.content).toBe(unit.value.data.content);
    expect(body.hash).toBe(unit.value.data.hash);
    expect(body.revision).toBe(1);
    expect(head.bodyHash).toBe(body.hash);
    expect(head.bodyBytes).toBe(Buffer.byteLength(body.content));
  }
  const store = createAdventureRestoreStore({ db: f.db }),
    paths = [...f.records.keys()].filter((k) => k.startsWith(f.path + '/stagingArtifacts/'));
  expect(paths.length).toBe(12);
  for (const path of paths)
    await f.db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, f.uid, f.id, p.jobToken);
      const artifact = await readAdventureStageArtifact(
        store,
        tx,
        loaded,
        await tx.get(f.db.doc(path)),
        { withValue: true },
      );
      expect(artifact.data).toBeDefined();
    });
  expect(await createStudioService({ db: f.db }).getAdventure(f.uid, { id: p.adventureId })).toBe(
    null,
  );
  await expect(
    createScenesService({ db: f.db }).listScenes(f.uid, {
      target: { kind: 'adventure', id: p.adventureId },
      parentId: null,
    }),
  ).rejects.toBeDefined();
}, 60000);
it('cancels all paired native targets and journals with bounded metadata reads and retained root reservation', async () => {
  const { f, p } = await ready(),
    end = await finish(f, p),
    cancelled = await cleanup(f, end, 2);
  expect(cancelled.state).toBe('cancelled');
  expect(cancelled.staging.cleanedArtifacts).toBe(end.staging.artifactCount);
  expect(
    [...f.records.keys()].filter((k) => k.startsWith('adventures/' + p.adventureId + '/')),
  ).toEqual([]);
  expect([...f.records.keys()].filter((k) => k.startsWith(f.path + '/'))).toEqual([]);
  const bodyReads = f.metadataReads.filter(
    (v) =>
      v.path.startsWith('adventures/' + p.adventureId + '/') && v.path.endsWith('/body/current'),
  );
  expect(bodyReads.length).toBeGreaterThan(0);
  expect(bodyReads.every((v) => !v.fields.includes('content'))).toBe(true);
  expect(f.records.get('adventures/' + p.adventureId).kind).toBe('adventure-restore-retired');
});
it('same operation and competing checkpoints commit once and historical replay carries current progress', async () => {
  const { f, p } = await ready(),
    input = req(p),
    pair = await Promise.all([
      f.api.advanceAdventureRestoreStructure(f.uid, input),
      f.api.advanceAdventureRestoreStructure(f.uid, input),
    ]);
  expect(pair[0]).toEqual(pair[1]);
  const after = pair[0].progress,
    race = await Promise.allSettled([
      f.api.advanceAdventureRestoreStructure(f.uid, req(after)),
      f.api.advanceAdventureRestoreStructure(f.uid, {
        ...req(after),
        operationId: 'structure-competitor-0001',
      }),
    ]);
  expect(race.filter((v) => v.status === 'fulfilled').length).toBe(1);
  const replay = await f.api.advanceAdventureRestoreStructure(f.uid, input);
  expect(replay.receipt).toEqual(pair[0].receipt);
  expect(replay.progress.checkpoint).toBe(p.checkpoint + 2);
});
it('failed commit rolls back target, journal, metadata and receipt, permitting exact retry', async () => {
  const { f, p } = await ready(),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb({
        ...tx,
        update(ref, value) {
          if (ref.path === f.path) throw Error('staging commit unavailable');
          return tx.update(ref, value);
        },
      }),
    );
  await expect(advance(f, p)).rejects.toThrow('staging commit unavailable');
  expect(f.records.has(f.path + '/preparedRoot/current')).toBe(false);
  expect(f.records.has('adventures/' + p.adventureId + '/workProgress/current')).toBe(false);
  expect([...f.records.keys()].filter((k) => k.startsWith(f.path + '/stagingArtifacts/'))).toEqual(
    [],
  );
  f.db.runTransaction = run;
  expect((await advance(f, p)).staging.itemIndex).toBe(1);
});
it('foreign target or orphan descendant blocks staging and cleanup without adopting or deleting foreign content', async () => {
  for (const mode of ['head', 'orphan']) {
    const { f, p } = await ready(),
      point = await atScene(f, p),
      r = point.r,
      mapper = createAdventureRestoreRemapper({
        schemaVersion: 1,
        jobToken: p.jobToken,
        sourceAdventureId: r.sourceAdventureId,
        adventureId: p.adventureId,
      }),
      path =
        'adventures/' +
        p.adventureId +
        '/scenes/' +
        mapper.identity('scene', point.unit.value.id) +
        (mode === 'orphan' ? '/body/foreign' : '');
    await f.db.runTransaction((tx) =>
      tx.create(f.db.doc(path), { ownerId: 'foreign', content: 'FOREIGN_TEXT' }),
    );
    await expect(advance(f, point.p)).rejects.toBeDefined();
    await expect(cleanup(f, point.p, 50)).rejects.toBeDefined();
    expect(f.records.get(path).content).toBe('FOREIGN_TEXT');
    expect(f.records.get(f.path).state).toBe('cancelling');
  }
});
it('native target or journal replacement and missing targets prevent cleanup certification', async () => {
  for (const mode of ['target', 'journal', 'missing']) {
    const { f, p } = await ready(),
      next = await advance(f, p),
      path = [...f.records.keys()].find((k) => k.startsWith(f.path + '/stagingArtifacts/')),
      entry = f.records.get(path),
      target =
        (entry.address.scope === 'job' ? f.path : 'adventures/' + p.adventureId) +
        '/' +
        entry.address.path.join('/');
    if (mode === 'missing') f.records.delete(target);
    else f.metadata.set(mode === 'target' ? target : path, { createdAt: 9999, updatedAt: 9999 });
    await expect(cleanup(f, next, 50)).rejects.toBeDefined();
    expect(f.records.get(f.path).state).toBe('cancelling');
  }
});
it('resource lookup remains scoped, indexed and authenticated until the consuming transaction', async () => {
  const { f, p } = await ready(),
    r = await reader(f, p);
  let scene;
  for (let at = 0; at < r.itemCount; at++) {
    const u = await r.readItem(at);
    if (u.value.kind === 'scene') {
      scene = u;
      break;
    }
  }
  const body = await r.findResource('scene-body', 'current', scene.value.id);
  expect(body.value.parentId).toBe(scene.value.id);
  const keyPath = [...f.records.keys()].find(
    (k) =>
      k.startsWith(f.path + '/validationIndex/') &&
      JSON.stringify(f.records.get(k).key) ===
        JSON.stringify(['resource', 'scene-body', scene.value.id, 'current']),
  );
  f.metadata.set(keyPath, { createdAt: 9999, updatedAt: 9999 });
  await expect(f.db.runTransaction(body.verify)).rejects.toBeDefined();
  await expect(r.findResource('scene-body', 'current', scene.value.id)).rejects.toBeDefined();
  await expect(r.findResource('scene-body', 'current', null)).rejects.toBeDefined();
});
