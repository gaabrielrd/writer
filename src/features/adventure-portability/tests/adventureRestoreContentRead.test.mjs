// @vitest-environment node
import { it, expect } from 'vitest';
import { streamAdventureArchive } from '../index';
import { inventoryFixture } from './adventureInventoryFixture.mjs';
import { historyDataFixture } from './adventureHistoryFixture.mjs';
import { imageDataFixture } from './adventureImageFixture.mjs';
import {
  transferFixture,
  upload,
  verify,
  mutation,
  hash,
} from '../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import { createVerifiedAdventureRestoreContent } from '../../../../functions/src/adventureRestoreContentRead.mjs';
import { createAdventureRestoreRemapper } from '../../../../functions/src/adventureRestoreRemap.mjs';
const context = (f, p) => ({ db: f.db, uid: f.uid, restoreId: p.restoreId, jobToken: p.jobToken });
async function capture(f, draft = null) {
  const parts = [];
  for await (const part of streamAdventureArchive(f.id, f.scanApi, { guard: () => {}, draft }))
    parts.push(part);
  return Buffer.concat(parts);
}
const cache = new Map();
async function bytes(kind) {
  if (!cache.has(kind))
    cache.set(
      kind,
      (async () => {
        const f =
          kind === 'inventory'
            ? await inventoryFixture()
            : kind === 'image'
              ? await imageDataFixture(1, true, 65537)
              : await historyDataFixture(kind === 'empty' ? '' : undefined);
        const draft =
          kind === 'history' || kind === 'empty'
            ? {
                adventureId: f.id,
                resource: { ...f.resource },
                baseRevision: 1,
                savedAt: 1234,
                content: kind === 'empty' ? '' : 'a'.repeat(65535) + '🌙' + 'b'.repeat(65533),
              }
            : null;
        return capture(f, draft);
      })(),
    );
  return cache.get(kind);
}
async function ready(kind = 'inventory') {
  const f = transferFixture(await bytes(kind));
  let p = await verify(f, await upload(f), 16),
    n = 0;
  while (['bytes-verified', 'validating'].includes(p.state)) {
    if (++n > 1000) throw Error('unbounded validation');
    p = (
      await f.api.advanceAdventureRestoreValidation(
        f.uid,
        mutation(p, 'reader-validation-' + String(n).padStart(6, '0')),
      )
    ).progress;
  }
  expect(p.state).toBe('content-verified');
  return { f, p, reader: await createVerifiedAdventureRestoreContent(context(f, p)) };
}
async function find(reader, kind) {
  for (let at = 0; at < reader.itemCount; at++) {
    const unit = await reader.readItem(at);
    if (unit.record.kind === kind) return unit;
  }
  throw Error('missing kind ' + kind);
}
it('reconstructs the authenticated report and maps every native JSON unit without changing source proofs or activating ownership', async () => {
  const { f, p, reader } = await ready(),
    units = [],
    mapped = [],
    mapper = createAdventureRestoreRemapper({
      schemaVersion: 1,
      jobToken: p.jobToken,
      sourceAdventureId: reader.sourceAdventureId,
      adventureId: p.adventureId,
    });
  for (let at = 0; at < reader.itemCount; at++) {
    const original = await reader.readItem(at),
      projection = await reader.readMappedItem(at);
    units.push(original);
    mapped.push(projection);
    expect(projection.sourceRecord).toEqual(original.record);
    expect(projection.sourceContentHash).toBe(original.contentHash);
    expect(projection.validation).toBe('identity-projection-only');
    await f.db.runTransaction(async (tx) => {
      await projection.verify(tx);
      tx.set(f.db.doc('testConsumed/' + at), { hash: original.contentHash });
    });
  }
  expect(mapped.find((u) => u.record.kind === 'adventure-metadata').record.id).toBe(p.adventureId);
  const oldPart = units.find((u) => u.record.kind === 'adventure-part'),
    part = mapped.find((u) => u.record.kind === 'adventure-part');
  expect(part.record.id).toBe(mapper.identity('part', oldPart.record.id));
  const scene = mapped.find((u) => u.value.kind === 'scene');
  expect(scene.value.id).toMatch(/^restore-[a-f0-9]{64}$/);
  const sceneBody = mapped.find((u) => u.value.kind === 'scene-body');
  expect(sceneBody.value.parentId).toBe(scene.value.id);
  const persona = mapped.find((u) => u.value.kind === 'persona' && u.value.scope === 'scene');
  expect(persona.value.bindingId).toBe(scene.value.id);
  expect(persona.value.personaId).toBe(scene.value.data.personaComplement.personaId);
  expect(persona.value.profile.id).toBe(persona.value.personaId);
  expect(f.records.get('adventures/' + p.adventureId)).not.toHaveProperty('ownerId');
  expect(reader.summary).toEqual(p.validation.summary);
}, 60000);
it('resumes all fixed UTF8 and draft parts through fresh readers with complete SHA and original proofs', async () => {
  const { f, p, reader } = await ready('history');
  const seen = new Set();
  for (let at = 0; at < reader.itemCount; at++) {
    const raw = await reader.openMappedRaw(at);
    if (!raw) continue;
    seen.add(raw.layout);
    let checkpoint = null,
      result,
      n = 0;
    const parts = [];
    do {
      const reopened = await createVerifiedAdventureRestoreContent(context(f, p)),
        handle = await reopened.openMappedRaw(at);
      result = await handle.readStep(checkpoint);
      expect(result.bytes.length).toBeLessThanOrEqual(65536);
      expect(result.record.id).toBe(raw.record.id);
      expect(result.sourceRecord.id).toBe(raw.sourceRecord.id);
      expect(result.record.part).toBe(n++);
      parts.push(result.bytes);
      checkpoint = JSON.parse(JSON.stringify(result.checkpoint));
      await f.db.runTransaction(result.verify);
    } while (!result.done);
    const all = Buffer.concat(parts);
    expect(all.length).toBe(raw.manifest.byteLength);
    expect(hash(all)).toBe(raw.manifest.contentHash);
    expect(result.validation).toBe('raw-content-complete');
    await expect(raw.readStep(checkpoint)).rejects.toBeDefined();
  }
  expect([...seen].sort()).toEqual(['fixed-text', 'utf8-parts']);
}, 60000);
it('preserves empty history and draft as one explicit raw part', async () => {
  const { reader } = await ready('empty');
  let count = 0;
  for (let at = 0; at < reader.itemCount; at++) {
    const raw = await reader.openRaw(at);
    if (!raw) continue;
    const part = await raw.readStep();
    expect(part.bytes.length).toBe(0);
    expect(part.done).toBe(true);
    expect(part.checkpoint.part).toBe(1);
    expect(raw.manifest.contentHash).toBe(hash(Buffer.alloc(0)));
    count++;
  }
  expect(count).toBe(2);
});
it('gives separate mapped image identities to two uses of the same library image and streams both assets', async () => {
  const { reader } = await ready('image'),
    bindings = [],
    assets = [],
    heads = [];
  for (let at = 0; at < reader.itemCount; at++) {
    const mapped = await reader.readMappedItem(at);
    if (mapped.record.kind === 'adventure-image-binding' && mapped.value.image)
      bindings.push(mapped);
    if (
      mapped.record.kind === 'adventure-resource' &&
      ['scene', 'block'].includes(mapped.value.kind)
    )
      heads.push(mapped);
    if (mapped.record.kind !== 'adventure-image') continue;
    assets.push(mapped);
    const raw = await reader.openMappedRaw(at),
      first = await raw.readStep(),
      last = await raw.readStep(first.checkpoint);
    expect(first.done).toBe(false);
    expect(last.done).toBe(true);
    expect(first.record.id).toBe(mapped.rawRecord.id);
    expect(hash(Buffer.concat([first.bytes, last.bytes]))).toBe(raw.manifest.contentHash);
  }
  expect(bindings.length).toBe(2);
  expect(assets.length).toBe(2);
  expect(new Set(bindings.map((u) => u.value.image.imageId)).size).toBe(2);
  for (const binding of bindings) {
    const asset = assets.find((u) => u.value.assetId === binding.value.image.assetId);
    expect(asset.value.imageId).toBe(binding.value.image.imageId);
    const head = heads.find(
      (u) =>
        u.value.kind === binding.value.resource.kind && u.value.id === binding.value.resource.id,
    );
    expect((head.value.data.mainBlockImage ?? head.value.data.image).imageId).toBe(
      asset.value.imageId,
    );
  }
}, 60000);
it('does not consume bytes before validation and rejects wrong account, token and index', async () => {
  const f = transferFixture(await bytes('inventory')),
    p = await verify(f, await upload(f), 16);
  await expect(createVerifiedAdventureRestoreContent(context(f, p))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  const done = await ready();
  for (const patch of [{ uid: 'stranger' }, { jobToken: 'a'.repeat(64) }])
    await expect(
      createVerifiedAdventureRestoreContent({ ...context(done.f, done.p), ...patch }),
    ).rejects.toBeDefined();
  for (const index of [-1, 1.5, done.reader.itemCount])
    await expect(done.reader.readItem(index)).rejects.toBeDefined();
});
it('held unit proof refuses source/proof/item changes or cancellation before a consuming write', async () => {
  for (const change of ['chunk', 'proof', 'item', 'cancel']) {
    const { f, p, reader } = await ready(),
      unit = await reader.readItem(0);
    if (change === 'cancel')
      await f.api.cancelAdventureRestore(f.uid, mutation(p, 'reader-cancel-0001'));
    else {
      const name = { chunk: 'chunks', proof: 'integrityProofs', item: 'validationItems' }[change],
        path = f.path + '/' + name + '/000000000000000';
      f.metadata.set(path, { createdAt: 9999, updatedAt: 9999 });
    }
    await expect(
      f.db.runTransaction(async (tx) => {
        await unit.verify(tx);
        tx.create(f.db.doc('testConsumed/blocked'), { accepted: true });
      }),
    ).rejects.toBeDefined();
    expect(f.records.has('testConsumed/blocked')).toBe(false);
  }
});
it('held state and report cannot be replaced or reused with forged source summary', async () => {
  for (const mode of ['state', 'item-body', 'summary']) {
    const { f, p, reader } = await ready(),
      unit = await reader.readItem(0);
    if (mode === 'state')
      f.metadata.set(f.path + '/validationState/current', { createdAt: 9999, updatedAt: 9999 });
    if (mode === 'item-body')
      f.records.get(f.path + '/validationItems/000000000000000').pointerJSON = '{}';
    if (mode === 'summary') f.records.get(f.path).validation.summary.totals.parts++;
    await expect(f.db.runTransaction(unit.verify)).rejects.toBeDefined();
    if (mode === 'item-body') {
      const reopened = await createVerifiedAdventureRestoreContent(context(f, p));
      await expect(reopened.readItem(0)).rejects.toBeDefined();
    } else await expect(createVerifiedAdventureRestoreContent(context(f, p))).rejects.toBeDefined();
  }
});
it('raw checkpoints cannot cross units, mapped/original readers or a cancelled job; mutable bytes cannot pass verify', async () => {
  const { f, p, reader } = await ready('history'),
    unit = await find(reader, 'adventure-version-body'),
    raw = await reader.openRaw(unit.index),
    mapped = await reader.openMappedRaw(unit.index),
    first = await raw.readStep();
  await expect(mapped.readStep(first.checkpoint)).rejects.toBeDefined();
  const draft = await find(reader, 'adventure-draft'),
    other = await reader.openRaw(draft.index);
  await expect(other.readStep(first.checkpoint)).rejects.toBeDefined();
  first.bytes[0] ^= 1;
  await expect(f.db.runTransaction(first.verify)).rejects.toBeDefined();
  await f.api.cancelAdventureRestore(f.uid, mutation(p, 'reader-cancel-raw-0001'));
  await expect(raw.readStep(first.checkpoint)).rejects.toBeDefined();
});
it('returned JSON/checkpoints are immutable and mapper context is captured before asynchronous work', async () => {
  const { reader } = await ready('history'),
    unit = await reader.readItem(0);
  expect(() => {
    unit.value.data.title = 'changed';
  }).toThrow();
  const body = await find(reader, 'adventure-version-body'),
    raw = await reader.openRaw(body.index),
    step = await raw.readStep();
  expect(() => {
    step.checkpoint.container.offset = 0;
  }).toThrow();
  const mappedRaw = await reader.openMappedRaw(body.index);
  expect(() => {
    mappedRaw.value.versionId = 'changed-version-0001';
  }).toThrow();
});
