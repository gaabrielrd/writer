// @vitest-environment node
import { it, expect } from 'vitest';
import { streamAdventureArchive } from '../index';
import { inventoryFixture, inventoryReadHarness } from './adventureInventoryFixture.mjs';
import { imageDataFixture } from './adventureImageFixture.mjs';
import { createWorkHistoryService } from '../../../../functions/src/workHistory.mjs';
import { validateAdventureBackupContent } from '../../../../functions/src/adventureBackupContent.mjs';
import { createAdventureContentHash } from '../../../../functions/src/adventureContentHash.mjs';
import {
  createAdventureContentState,
  createAdventureContentMachine,
} from '../../../../functions/src/adventureContentMachine.mjs';
import { readAdventureBackupPackage } from '../../../../functions/src/adventureBackupPackage.mjs';
const options = { guard: () => {} };
function memoryContentIndex() {
  const values = new Map();
  return {
    values,
    index: {
      async add(key, value) {
        const id = JSON.stringify(key);
        if (values.has(id)) throw Error('duplicate index key');
        expect(Buffer.byteLength(JSON.stringify({ key, value }))).toBeLessThanOrEqual(16384);
        values.set(id, structuredClone(value));
      },
      async get(key) {
        return structuredClone(values.get(JSON.stringify(key)));
      },
    },
  };
}
async function collect(output) {
  const values = [];
  for (;;) {
    const n = await output.next();
    if (n.done) return { values, proof: n.value };
    values.push(n.value);
  }
}
const source = (bytes) => ({ size: bytes.length, read: async (o, n) => bytes.subarray(o, o + n) });
async function file(f, draft = null) {
  const captured = await collect(streamAdventureArchive(f.id, f.scanApi, { ...options, draft }));
  return { bytes: Buffer.concat(captured.values), proof: captured.proof };
}
it('independently validates a real eight-section archive including lore, narrative, personas and history', async () => {
  const f = await inventoryFixture(),
    captured = await file(f),
    store = memoryContentIndex();
  const report = await validateAdventureBackupContent(source(captured.bytes), {
    index: store.index,
    hash: await createAdventureContentHash(),
  });
  expect(report.validation).toBe('content-only');
  expect(report.totals).toMatchObject({
    parts: 1,
    versions: 1,
    imageBindings: 2,
    imageAssets: 0,
    drafts: 0,
  });
  expect(report.totals.resources).toMatchObject({
    scene: 1,
    block: 1,
    'scene-body': 1,
    'block-body': 1,
  });
  expect(report.envelope.sections).toEqual(captured.proof.capture.sections);
});
it('validates split historical UTF-8, PNG grants and a separate explicit draft without indexing authored prose', async () => {
  const f = await imageDataFixture(),
    text = 'a'.repeat(65535) + '🌙' + 'b'.repeat(65533);
  await f.scenes.updateScene('author', {
    target: f.target,
    sceneId: f.sceneId,
    operationId: 'content-file-text-0001',
    expectedRevision: f.records.get(f.path + '/scenes/' + f.sceneId).revision,
    patch: { content: text },
  });
  const history = createWorkHistoryService({ db: f.db, now: () => 3000 }),
    resource = { kind: 'scene', id: f.sceneId };
  const current = await history.getWorkVersionSource('author', { target: f.target, resource });
  await history.createWorkVersion('author', {
    target: f.target,
    resource,
    operationId: 'content-file-version-0001',
    expectedSourceToken: current.sourceToken,
    label: 'PRIVATE_VERSION',
  });
  const draft = {
    adventureId: f.id,
    resource: { kind: 'block', id: f.blockId },
    content: 'PRIVATE_LOCAL_DRAFT 🌙',
    baseRevision: 1,
    savedAt: 4000,
  };
  const captured = await file(f, draft),
    store = memoryContentIndex();
  const report = await validateAdventureBackupContent(source(captured.bytes), {
    index: store.index,
    hash: await createAdventureContentHash(),
  });
  expect(report.totals).toMatchObject({
    versions: 1,
    historyBytes: 131072,
    nativeHistoryRecords: 4,
    drafts: 1,
    draftBytes: Buffer.byteLength(draft.content),
    imageBindings: 2,
    imageAssets: 2,
    imageBytes: f.bytes.length * 2,
  });
  expect(JSON.stringify([...store.values.values()])).not.toContain('PRIVATE_LOCAL_DRAFT');
  expect(JSON.stringify([...store.values.values()])).not.toContain(text);
});
it('accepts the native importer with children created before root activation and explicit empty sections', async () => {
  const { adventureImportDb } =
    await import('../../../../functions/test/helpers/adventureImportDb.mjs');
  const { activateBackupImportedAdventure } =
    await import('../../../../functions/test/helpers/adventureBackupImportFixture.mjs');
  const f = adventureImportDb({ nativeUpdates: true }),
    imported = await activateBackupImportedAdventure(f.db);
  const current = { ...f, ...inventoryReadHarness(f), id: imported.adventureId },
    captured = await file(current),
    store = memoryContentIndex();
  const report = await validateAdventureBackupContent(source(captured.bytes), {
    index: store.index,
    hash: await createAdventureContentHash(),
  });
  expect(report.totals).toMatchObject({
    parts: 1,
    versions: 0,
    imageBindings: 1,
    imageAssets: 0,
    drafts: 0,
  });
});
it('reopens bounded machine checkpoints between each semantic transition and finish batch', async () => {
  const f = await inventoryFixture(),
    captured = await file(f),
    parsed = await collect(readAdventureBackupPackage(source(captured.bytes)));
  const hash = await createAdventureContentHash(),
    store = memoryContentIndex();
  let machine = createAdventureContentMachine(createAdventureContentState(f.id), {
    index: store.index,
    hash,
  });
  const records = parsed.values.filter((e) => e.type === 'record').map((e) => e.record);
  for (let at = 0; at < records.length;) {
    const r = records[at],
      identity = { kind: r.kind, id: r.id, part: r.part };
    if (machine.checkpoint().pending?.stage === 'raw') {
      await machine.acceptRaw(identity, r.payload);
      at++;
    } else {
      const parts = [r.payload];
      at++;
      while (at < records.length && records[at].kind === r.kind && records[at].id === r.id)
        parts.push(records[at++].payload);
      await machine.acceptJSON(identity, JSON.parse(Buffer.concat(parts)));
    }
    const saved = JSON.parse(JSON.stringify(machine.checkpoint()));
    expect(Buffer.byteLength(JSON.stringify(saved))).toBeLessThanOrEqual(16384);
    machine = createAdventureContentMachine(saved, { index: store.index, hash });
  }
  await machine.beginFinish(parsed.proof);
  while (machine.checkpoint().phase !== 'done') {
    await machine.advanceFinish(1);
    machine = createAdventureContentMachine(JSON.parse(JSON.stringify(machine.checkpoint())), {
      index: store.index,
      hash,
    });
  }
  expect(machine.result().validation).toBe('semantic-only');
});

it('resealed inert files still validate when their unchanged section digests use independent Node crypto', async () => {
  const { streamAdventureArchiveRecords } = await import('../index');
  const { archiveUnits, reseal } = await import('./adventureContentTamper.mjs');
  const f = await inventoryFixture(),
    captured = await collect(streamAdventureArchiveRecords(f.id, f.scanApi, options));
  const bytes = await reseal(archiveUnits(captured.values)),
    store = memoryContentIndex();
  expect(
    (
      await validateAdventureBackupContent(source(bytes), {
        index: store.index,
        hash: await createAdventureContentHash(),
      })
    ).validation,
  ).toBe('content-only');
});
for (const failure of [
  'extra resource field',
  'false body hash',
  'foreign body parent',
  'deleted lore with body',
  'missing required body',
  'wrong persona owner',
  'bad section digest',
])
  it('rejects correctly framed archive: ' + failure, async () => {
    const { streamAdventureArchiveRecords } = await import('../index');
    const { archiveUnits, reseal, json, setJSON } = await import('./adventureContentTamper.mjs');
    const { adventureCoreRecordIdentity } =
      await import('../../../../functions/src/adventureArchiveCore.mjs');
    const { inspectAdventureBackupPackage } =
      await import('../../../../functions/src/adventureBackupPackage.mjs');
    const f = await inventoryFixture(),
      captured = await collect(streamAdventureArchiveRecords(f.id, f.scanApi, options)),
      units = archiveUnits(captured.values);
    const body = units.find(
      (u) => u.kind === 'adventure-resource' && json(u).kind === 'scene-body',
    );
    let repair = true;
    if (failure === 'extra resource field') {
      const value = json(body);
      value.data.apiKey = 'DO_NOT_IMPORT';
      setJSON(body, value);
    }
    if (failure === 'false body hash') {
      const value = json(body);
      value.data.hash = '0'.repeat(64);
      setJSON(body, value);
    }
    if (failure === 'foreign body parent') {
      const value = json(body);
      value.parentId = 'missing-owner';
      setJSON(body, value);
      body.id = (
        await adventureCoreRecordIdentity(
          { family: 'resources', kind: 'scene-body', parentId: value.parentId },
          value.id,
        )
      ).id;
    }
    if (failure === 'deleted lore with body') {
      const head = units.find((u) => u.kind === 'adventure-lore'),
        value = json(head);
      value.data = {
        deleted: true,
        createdAt: value.data.createdAt,
        updatedAt: value.data.updatedAt,
      };
      setJSON(head, value);
    }
    if (failure === 'missing required body') units.splice(units.indexOf(body), 1);
    if (failure === 'wrong persona owner') {
      const p = units.find((u) => u.kind === 'adventure-persona' && json(u).scope === 'scene'),
        value = json(p);
      value.bindingId = 'missing-scene';
      setJSON(p, value);
      p.id = (
        await adventureCoreRecordIdentity({ family: 'personas', scope: 'scene' }, value.bindingId)
      ).id;
    }
    if (failure === 'bad section digest') {
      const footer = units.find((u) => u.kind === 'adventure-resources'),
        value = json(footer);
      value.digest = '0'.repeat(64);
      setJSON(footer, value);
      repair = false;
    }
    const bytes = await reseal(units, { repair }),
      store = memoryContentIndex();
    expect((await inspectAdventureBackupPackage(source(bytes))).validation).toBe('envelope-only');
    await expect(
      validateAdventureBackupContent(source(bytes), {
        index: store.index,
        hash: await createAdventureContentHash(),
      }),
    ).rejects.toBeTruthy();
  });
it('rejects invalid historical UTF-8 even after every SHA, byte count and history digest is repaired', async () => {
  const { streamAdventureArchiveRecords } = await import('../index'),
    { archiveUnits, reseal } = await import('./adventureContentTamper.mjs');
  const { inspectAdventureBackupPackage } =
    await import('../../../../functions/src/adventureBackupPackage.mjs');
  const f = await inventoryFixture(),
    captured = await collect(streamAdventureArchiveRecords(f.id, f.scanApi, options)),
    units = archiveUnits(captured.values);
  units.find((u) => u.kind === 'adventure-version-text').bytes[0] = 255;
  const bytes = await reseal(units),
    store = memoryContentIndex();
  await inspectAdventureBackupPackage(source(bytes));
  await expect(
    validateAdventureBackupContent(source(bytes), {
      index: store.index,
      hash: await createAdventureContentHash(),
    }),
  ).rejects.toBeTruthy();
});
it('rejects a false PNG signature after hashes and image manifests are repaired', async () => {
  const { streamAdventureArchiveRecords } = await import('../index'),
    { archiveUnits, reseal } = await import('./adventureContentTamper.mjs');
  const { inspectAdventureBackupPackage } =
    await import('../../../../functions/src/adventureBackupPackage.mjs');
  const f = await imageDataFixture(),
    captured = await collect(streamAdventureArchiveRecords(f.id, f.scanApi, options)),
    units = archiveUnits(captured.values);
  units.find((u) => u.kind === 'adventure-image-bytes').bytes[0] = 0;
  const bytes = await reseal(units),
    store = memoryContentIndex();
  await inspectAdventureBackupPackage(source(bytes));
  await expect(
    validateAdventureBackupContent(source(bytes), {
      index: store.index,
      hash: await createAdventureContentHash(),
    }),
  ).rejects.toBeTruthy();
});
it('reports historical-only resources and dangling local lore without inventing current nodes or access', async () => {
  const { streamAdventureArchiveRecords } = await import('../index'),
    { archiveUnits, reseal, json, setJSON } = await import('./adventureContentTamper.mjs');
  const f = await inventoryFixture(),
    captured = await collect(streamAdventureArchiveRecords(f.id, f.scanApi, options)),
    units = archiveUnits(captured.values);
  const version = units.find((u) => u.kind === 'adventure-version'),
    v = json(version);
  v.data.resource.id = 'retained-removed-scene';
  setJSON(version, v);
  const lore = units.find((u) => u.kind === 'adventure-lore-body'),
    body = json(lore);
  body.data.relations.push({
    targetEntityId: 'adventure:' + f.id + ':missing-lore',
    relationType: 'Conhece',
    description: 'Own retained reference',
  });
  setJSON(lore, body);
  const bytes = await reseal(units),
    store = memoryContentIndex(),
    report = await validateAdventureBackupContent(source(bytes), {
      index: store.index,
      hash: await createAdventureContentHash(),
    });
  expect(report.warnings).toMatchObject({ historicalOnlyResources: 1, danglingLocalReferences: 1 });
  expect(
    store.values.has(JSON.stringify(['resource', 'scene', '', 'retained-removed-scene'])),
  ).toBe(false);
});

it('rejects a draft connected to different saved unit hashes despite repaired framing and section digests', async () => {
  const { streamAdventureArchiveRecords } = await import('../index'),
    { archiveUnits, reseal, json, setJSON } = await import('./adventureContentTamper.mjs');
  const f = await imageDataFixture(1, false),
    draft = {
      adventureId: f.id,
      resource: { kind: 'scene', id: f.sceneId },
      content: 'PRIVATE_DRAFT',
      baseRevision: 1,
      savedAt: 1234,
    };
  const captured = await collect(
      streamAdventureArchiveRecords(f.id, f.scanApi, { ...options, draft }),
    ),
    units = archiveUnits(captured.values);
  const header = units.find((u) => u.kind === 'adventure-draft'),
    value = json(header);
  value.current.bodyHash = '0'.repeat(64);
  setJSON(header, value);
  const bytes = await reseal(units),
    store = memoryContentIndex();
  await expect(
    validateAdventureBackupContent(source(bytes), {
      index: store.index,
      hash: await createAdventureContentHash(),
    }),
  ).rejects.toBeTruthy();
});
it('truncation and an abort during a verified read cannot return a content report', async () => {
  const f = await imageDataFixture(1, false),
    captured = await file(f),
    hash = await createAdventureContentHash();
  await expect(
    validateAdventureBackupContent(source(captured.bytes.subarray(0, captured.bytes.length - 1)), {
      index: memoryContentIndex().index,
      hash,
    }),
  ).rejects.toBeTruthy();
  const controller = new AbortController();
  let calls = 0;
  const input = {
    size: captured.bytes.length,
    async read(offset, length) {
      if (++calls === 12) controller.abort();
      return captured.bytes.subarray(offset, offset + length);
    },
  };
  await expect(
    validateAdventureBackupContent(input, {
      index: memoryContentIndex().index,
      hash,
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
it('index storage errors retain the primary failure and cannot become successful validation', async () => {
  const f = await imageDataFixture(1, false),
    captured = await file(f),
    store = memoryContentIndex(),
    failure = Error('disk full');
  let adds = 0;
  const index = {
    ...store.index,
    async add(key, value) {
      if (++adds === 5) throw failure;
      await store.index.add(key, value);
    },
  };
  await expect(
    validateAdventureBackupContent(source(captured.bytes), {
      index,
      hash: await createAdventureContentHash(),
    }),
  ).rejects.toBe(failure);
});
it('a corrupted completed checkpoint is rejected before a positive result can be read', async () => {
  const state = createAdventureContentState('private-adventure');
  state.phase = 'done';
  expect(() =>
    createAdventureContentMachine(state, {
      index: memoryContentIndex().index,
      hash: {
        create: () => {
          throw Error('unexpected hash');
        },
      },
    }),
  ).toThrow();
});

it('validates an empty native adventure without inventing manuscript resources', async () => {
  const { adventureImportDb } =
    await import('../../../../functions/test/helpers/adventureImportDb.mjs');
  const { createStudioService } = await import('../../../../functions/src/studio.mjs');
  const f = adventureImportDb({ nativeUpdates: true }),
    id = 'content-empty-adventure';
  await createStudioService({ db: f.db, now: () => 1000 }).createAdventure('author', {
    operationId: id,
    title: 'PRIVATE_EMPTY',
  });
  const captured = await file({ ...f, ...inventoryReadHarness(f), id }),
    store = memoryContentIndex();
  const report = await validateAdventureBackupContent(source(captured.bytes), {
    index: store.index,
    hash: await createAdventureContentHash(),
  });
  expect(report.totals).toMatchObject({
    parts: 0,
    versions: 0,
    imageBindings: 0,
    imageAssets: 0,
    drafts: 0,
  });
  expect(report.totals.resources.scene).toBe(0);
});
it('keeps archived scenes, their bodies and historical snapshots in a valid file', async () => {
  const f = await inventoryFixture();
  await f.scenes.archiveScene('author', {
    target: f.target,
    sceneId: f.sceneId,
    operationId: 'semantic-archive-scene-0001',
    expectedRevision: f.records.get(f.path + '/scenes/' + f.sceneId).revision,
    archived: true,
  });
  const captured = await file(f),
    store = memoryContentIndex();
  const report = await validateAdventureBackupContent(source(captured.bytes), {
    index: store.index,
    hash: await createAdventureContentHash(),
  });
  expect(report.totals.resources.scene).toBe(1);
  expect(report.totals.resources['scene-body']).toBe(1);
  expect(report.totals.versions).toBe(1);
  expect(store.values.get(JSON.stringify(['resource', 'scene', '', f.sceneId])).archived).toBe(
    true,
  );
});
it('duplicate image bindings cannot satisfy completeness by count alone', async () => {
  const { streamAdventureArchiveRecords } = await import('../index'),
    { archiveUnits, reseal } = await import('./adventureContentTamper.mjs');
  const { inspectAdventureBackupPackage } =
    await import('../../../../functions/src/adventureBackupPackage.mjs');
  const f = await imageDataFixture(1, false),
    captured = await collect(streamAdventureArchiveRecords(f.id, f.scanApi, options)),
    units = archiveUnits(captured.values);
  const original = units.find((u) => u.kind === 'adventure-image-binding');
  const duplicate = { ...original, bytes: Buffer.from(original.bytes), rawParts: null };
  units.splice(
    units.findIndex((u) => u.kind === 'adventure-images'),
    0,
    duplicate,
  );
  const bytes = await reseal(units);
  await inspectAdventureBackupPackage(source(bytes));
  await expect(
    validateAdventureBackupContent(source(bytes), {
      index: memoryContentIndex().index,
      hash: await createAdventureContentHash(),
    }),
  ).rejects.toBeTruthy();
});
it('resumes a split Unicode sequence with new hash engines and bounded serialized checkpoints', async () => {
  const { historyDataFixture } = await import('./adventureHistoryFixture.mjs');
  const f = await historyDataFixture(),
    captured = await file(f),
    parsed = await collect(readAdventureBackupPackage(source(captured.bytes)));
  const store = memoryContentIndex(),
    records = parsed.values.filter((e) => e.type === 'record').map((e) => e.record);
  let hash = await createAdventureContentHash(),
    machine = createAdventureContentMachine(createAdventureContentState(f.id), {
      index: store.index,
      hash,
    }),
    sawContinuation = false;
  for (let at = 0; at < records.length;) {
    const r = records[at],
      meta = { kind: r.kind, id: r.id, part: r.part };
    if (machine.checkpoint().pending?.stage === 'raw') {
      await machine.acceptRaw(meta, r.payload);
      at++;
    } else {
      const parts = [r.payload];
      at++;
      while (at < records.length && records[at].kind === r.kind && records[at].id === r.id)
        parts.push(records[at++].payload);
      await machine.acceptJSON(meta, JSON.parse(Buffer.concat(parts)));
    }
    const saved = JSON.parse(JSON.stringify(machine.checkpoint()));
    if (saved.pending?.utf8?.needed > 0) sawContinuation = true;
    hash = await createAdventureContentHash();
    machine = createAdventureContentMachine(saved, { index: store.index, hash });
  }
  await machine.beginFinish(parsed.proof);
  while (machine.checkpoint().phase !== 'done') await machine.advanceFinish(64);
  expect(sawContinuation).toBe(true);
  expect(machine.result().totals.historyBytes).toBe(131072);
});
