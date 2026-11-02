// @vitest-environment node
import { it, expect } from 'vitest';
import { streamAdventureArchive } from '../index';
import { inventoryFixture, inventoryReadHarness } from './adventureInventoryFixture.mjs';
import { imageDataFixture } from './adventureImageFixture.mjs';
import { historyDataFixture } from './adventureHistoryFixture.mjs';
import { createAdventureContentHash } from '../../../../functions/src/adventureContentHash.mjs';
import { validateAdventureBackupContent } from '../../../../functions/src/adventureBackupContent.mjs';
import {
  initialAdventureRestoreValidation,
  readAdventureRestoreValidationSnapshot,
  prepareAdventureRestoreValidationStep,
  completeAdventureRestoreValidation,
  readAdventureValidationItem,
  ADVENTURE_VALIDATION_SNAPSHOT_BYTES,
} from '../../../../functions/src/adventureRestoreValidationStep.mjs';
const source = (bytes) => ({
  size: bytes.length,
  async read(offset, length) {
    return bytes.subarray(offset, offset + length);
  },
});
async function capture(f, draft = null) {
  const parts = [];
  for await (const part of streamAdventureArchive(f.id, f.scanApi, { guard: () => {}, draft }))
    parts.push(part);
  return Buffer.concat(parts);
}
function host() {
  let entries = new Map(),
    items = new Map();
  const batches = [];
  return {
    get entries() {
      return entries;
    },
    get items() {
      return items;
    },
    batches,
    begin(hook = {}) {
      const writes = structuredClone(entries),
        unitWrites = structuredClone(items),
        stats = { gets: 0, adds: 0, units: 0 };
      return {
        store: {
          index: {
            async get(key) {
              stats.gets++;
              return structuredClone(writes.get(JSON.stringify(key)));
            },
            async add(key, value) {
              const k = JSON.stringify(key);
              if (writes.has(k)) throw Error('duplicate');
              expect(Buffer.byteLength(JSON.stringify({ key, value }))).toBeLessThanOrEqual(16384);
              stats.adds++;
              writes.set(k, structuredClone(value));
            },
          },
          async addItem(index, pointer) {
            if (unitWrites.has(index)) throw Error('duplicate item');
            expect(Buffer.byteLength(JSON.stringify(pointer))).toBeLessThanOrEqual(16384);
            unitWrites.set(index, structuredClone(pointer));
            stats.units++;
            await hook.addItem?.(index, pointer);
          },
        },
        commit() {
          expect(stats.units).toBeLessThanOrEqual(1);
          expect(stats.adds + stats.units).toBeLessThanOrEqual(96);
          expect(stats.gets).toBeLessThanOrEqual(384);
          entries = writes;
          items = unitWrites;
          batches.push(stats);
        },
      };
    },
  };
}
async function advance(state, bytes, target, options = {}) {
  const tx = target.begin(options.hook),
    reads = [];
  const raw = options.source ?? source(bytes),
    size = raw.size;
  const input = {
    size,
    async read(o, n) {
      reads.push(n);
      return raw.read(o, n);
    },
  };
  const old = JSON.stringify(state),
    hash = await createAdventureContentHash();
  const next = await prepareAdventureRestoreValidationStep(state, input, tx.store, {
    hash,
    signal: options.signal,
  });
  expect(JSON.stringify(state)).toBe(old);
  expect(reads.length).toBeLessThanOrEqual(131);
  expect(Math.max(0, ...reads)).toBeLessThanOrEqual(81920);
  expect(Buffer.byteLength(JSON.stringify(next))).toBeLessThanOrEqual(
    ADVENTURE_VALIDATION_SNAPSHOT_BYTES,
  );
  tx.commit();
  return JSON.parse(JSON.stringify(next));
}
async function finish(bytes, target = host(), initial = initialAdventureRestoreValidation()) {
  let state = initial,
    steps = 0,
    continuation = false;
  while (state.phase !== 'done') {
    if (++steps > 5000) throw Error('unbounded progression');
    state = await advance(state, bytes, target);
    if (state.machine.pending?.utf8?.needed) continuation = true;
  }
  const hash = await createAdventureContentHash(),
    tx = target.begin();
  const report = completeAdventureRestoreValidation(state, { index: tx.store.index, hash });
  return { state, target, report, steps, continuation };
}
it('reopens every checkpoint in a new hash engine and matches independent whole-file validation', async () => {
  const f = await inventoryFixture(),
    bytes = await capture(f),
    run = await finish(bytes),
    independent = host().begin();
  const expected = await validateAdventureBackupContent(source(bytes), {
    index: independent.store.index,
    hash: await createAdventureContentHash(),
  });
  expect(run.report).toMatchObject({
    validation: 'stepped-content-only',
    sourceAdventureId: f.id,
    totals: expected.totals,
    warnings: expected.warnings,
    envelope: expected.envelope,
  });
  expect(run.target.items.size).toBe(run.state.items);
  expect([...run.target.items.keys()]).toEqual(
    Array.from({ length: run.state.items }, (_, n) => n),
  );
  expect(JSON.stringify(run.state)).not.toContain('PRIVATE_TEXT');
  for (const pointer of run.target.items.values()) {
    const read = await readAdventureValidationItem(source(bytes), pointer, {
      hash: await createAdventureContentHash(),
    });
    expect(read.record).toEqual(pointer.record);
    expect(read.raw).toEqual(pointer.raw);
  }
});
it('keeps split history continuation and separate draft/PNG pointers without storing authored payloads', async () => {
  const f = await historyDataFixture(),
    draft = {
      adventureId: f.id,
      resource: { ...f.resource },
      content: 'PRIVATE_RECOVERED_DRAFT 🌙',
      baseRevision: 1,
      savedAt: 1234,
    };
  const bytes = await capture(f, draft),
    run = await finish(bytes);
  for (const pointer of run.target.items.values()) {
    if (pointer.raw)
      await readAdventureValidationItem(source(bytes), pointer, {
        hash: await createAdventureContentHash(),
      });
  }
  expect(run.continuation).toBe(true);
  expect(run.report.totals).toMatchObject({
    versions: 1,
    historyBytes: 131072,
    drafts: 1,
    draftBytes: Buffer.byteLength(draft.content),
  });
  expect([...run.target.items.values()].filter((v) => v.raw?.layout === 'fixed-text')).toHaveLength(
    1,
  );
  expect([...run.target.items.values()].filter((v) => v.raw?.layout === 'utf8-parts')).toHaveLength(
    1,
  );
  expect(JSON.stringify([...run.target.items.values()])).not.toContain(draft.content);
  const image = await imageDataFixture(1, true, 65537),
    imageBytes = await capture(image),
    images = await finish(imageBytes);
  for (const pointer of images.target.items.values()) {
    if (pointer.raw) {
      const hash = await createAdventureContentHash();
      expect(
        (await readAdventureValidationItem(source(imageBytes), pointer, { hash })).value.assetId,
      ).toBe(pointer.record.id);
      const wrong = structuredClone(pointer);
      wrong.record.id = 'f'.repeat(64);
      wrong.raw.record.id = wrong.record.id;
      await expect(
        readAdventureValidationItem(source(imageBytes), wrong, { hash }),
      ).rejects.toBeTruthy();
    }
  }
  expect(images.report.totals).toMatchObject({ imageAssets: 2, imageBytes: 131074 });
  expect([...images.target.items.values()].filter((v) => v.raw?.layout === 'png')).toHaveLength(2);
});
it('waits for EOF and semantic completion before returning a positive result', async () => {
  const f = await imageDataFixture(1, false),
    bytes = await capture(f),
    target = host();
  let state = initialAdventureRestoreValidation();
  const hash = await createAdventureContentHash();
  while (state.phase === 'frames') {
    expect(() =>
      completeAdventureRestoreValidation(state, { index: target.begin().store.index, hash }),
    ).toThrow();
    state = await advance(state, bytes, target);
  }
  expect(state.phase).toBe('semantic');
  expect(() =>
    completeAdventureRestoreValidation(state, { index: target.begin().store.index, hash }),
  ).toThrow();
  const run = await finish(bytes, target, state);
  expect(run.report.validation).toBe('stepped-content-only');
  await expect(
    prepareAdventureRestoreValidationStep(run.state, source(bytes), target.begin().store, { hash }),
  ).rejects.toBeTruthy();
});
it('discards a failed host buffer and retries the same step without duplicating an index or item', async () => {
  const f = await imageDataFixture(1, false),
    bytes = await capture(f),
    target = host();
  let state = await advance(initialAdventureRestoreValidation(), bytes, target);
  state = await advance(state, bytes, target);
  expect(state.json.record.kind).toBe('adventure-metadata');
  const original = JSON.stringify(state),
    failure = Error('transaction write failed');
  await expect(
    advance(state, bytes, target, {
      hook: {
        addItem() {
          throw failure;
        },
      },
    }),
  ).rejects.toBe(failure);
  expect(JSON.stringify(state)).toBe(original);
  expect(target.entries.size).toBe(0);
  expect(target.items.size).toBe(0);
  state = await advance(state, bytes, target);
  expect(target.items.size).toBe(1);
  expect((await finish(bytes, target, state)).report.totals.resources.scene).toBe(1);
});
it('rejects bytes changed between a verified JSON frame and its later reread, even when JSON shape and size remain valid', async () => {
  const f = await imageDataFixture(1, false),
    bytes = await capture(f),
    target = host();
  let state = await advance(initialAdventureRestoreValidation(), bytes, target);
  state = await advance(state, bytes, target);
  const pending = state.json,
    span = pending.spans[0],
    value = JSON.parse(bytes.subarray(span.offset, span.offset + span.length));
  const changed = structuredClone(value);
  changed.data.title = (value.data.title[0] === 'X' ? 'Y' : 'X') + value.data.title.slice(1);
  const altered = Buffer.from(bytes),
    replacement = Buffer.from(JSON.stringify(changed));
  expect(replacement.length).toBe(span.length);
  replacement.copy(altered, span.offset);
  await expect(advance(state, altered, target)).rejects.toMatchObject({
    code: 'adventure-backup-invalid-content',
  });
  expect(target.entries.size).toBe(0);
  expect(target.items.size).toBe(0);
});
it('rejects changed JSON bytes or corrupted positions when reopening a validated item', async () => {
  const f = await imageDataFixture(1, false),
    bytes = await capture(f),
    run = await finish(bytes);
  const pointer = [...run.target.items.values()].find(
      (p) => p.record.kind === 'adventure-metadata',
    ),
    hash = await createAdventureContentHash();
  const changed = Buffer.from(bytes);
  changed[pointer.spans[0].offset + 2] ^= 1;
  await expect(
    readAdventureValidationItem(source(changed), pointer, { hash }),
  ).rejects.toBeTruthy();
  for (const corrupt of [
    { ...pointer, contentHash: '0'.repeat(64) },
    { ...pointer, spans: [{ offset: bytes.length, length: pointer.byteLength }] },
    { ...pointer, record: { ...pointer.record, part: 1 } },
    { ...pointer, raw: { unknown: true } },
  ])
    await expect(
      readAdventureValidationItem(source(bytes), corrupt, { hash }),
    ).rejects.toBeTruthy();
});
it('abort, short reads and source size changes cannot advance the checkpoint or commit an item', async () => {
  const f = await imageDataFixture(1, false),
    bytes = await capture(f),
    initial = initialAdventureRestoreValidation(),
    target = host();
  const controller = new AbortController();
  controller.abort();
  await expect(
    advance(initial, bytes, target, { signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  await expect(
    advance(initial, bytes, target, {
      source: {
        size: bytes.length,
        async read(o, n) {
          return bytes.subarray(o, o + n - 1);
        },
      },
    }),
  ).rejects.toBeTruthy();
  const input = source(bytes);
  const read = input.read.bind(input);
  input.read = async (o, n) => {
    input.size--;
    return read(o, n);
  };
  await expect(
    prepareAdventureRestoreValidationStep(initial, input, target.begin().store, {
      hash: await createAdventureContentHash(),
    }),
  ).rejects.toBeTruthy();
  expect(initial).toEqual(initialAdventureRestoreValidation());
  expect(target.items.size).toBe(0);
});
it('bounds and closes host snapshots before reading any source bytes', async () => {
  const f = await imageDataFixture(1, false),
    bytes = await capture(f),
    target = host(),
    hash = await createAdventureContentHash();
  let reads = 0;
  const input = {
    size: bytes.length,
    async read(o, n) {
      reads++;
      return bytes.subarray(o, o + n);
    },
  };
  for (const saved of [
    { ...initialAdventureRestoreValidation(), extra: true },
    { ...initialAdventureRestoreValidation(), phase: 'done' },
    { ...initialAdventureRestoreValidation(), sourceSize: bytes.length },
    { ...initialAdventureRestoreValidation(), items: 1 },
    { ...initialAdventureRestoreValidation(), unknown: 'x'.repeat(65537) },
  ]) {
    expect(() => readAdventureRestoreValidationSnapshot(saved)).toThrow();
    await expect(
      prepareAdventureRestoreValidationStep(saved, input, target.begin().store, { hash }),
    ).rejects.toBeTruthy();
  }
  expect(reads).toBe(0);
});
it('preserves an imported adventure whose children predate root activation', async () => {
  const { adventureImportDb } =
      await import('../../../../functions/test/helpers/adventureImportDb.mjs'),
    { activateBackupImportedAdventure } =
      await import('../../../../functions/test/helpers/adventureBackupImportFixture.mjs');
  const f = adventureImportDb({ nativeUpdates: true }),
    imported = await activateBackupImportedAdventure(f.db);
  const run = await finish(
    await capture({ ...f, ...inventoryReadHarness(f), id: imported.adventureId }),
  );
  expect(run.report.sourceAdventureId).toBe(imported.adventureId);
  expect(run.report.totals.parts).toBeGreaterThan(0);
});

it('preserves genuinely empty history and draft as raw units with one empty part', async () => {
  const f = await historyDataFixture('', 1),
    draft = {
      adventureId: f.id,
      resource: { ...f.resource },
      content: '',
      baseRevision: 1,
      savedAt: 2000,
    };
  const run = await finish(await capture(f, draft));
  expect(run.report.totals).toMatchObject({
    versions: 1,
    historyBytes: 0,
    drafts: 1,
    draftBytes: 0,
  });
  const raw = [...run.target.items.values()].filter((p) => p.raw);
  expect(raw).toHaveLength(2);
  for (const p of raw) expect(p.raw.manifest).toMatchObject({ byteLength: 0, chunkCount: 1 });
});
it('resolves more than one bounded batch of relationships and keeps every scene in a large project', async () => {
  const f = await imageDataFixture(53, false),
    run = await finish(await capture(f));
  expect(run.report.totals.resources.scene).toBe(53);
  expect(run.report.totals.imageBindings).toBe(54);
  expect(run.target.batches.filter((b) => b.gets >= 64).length).toBeGreaterThan(1);
}, 30000);
it('validates a truly empty native adventure and archived scenes without dropping content', async () => {
  const { adventureImportDb } =
      await import('../../../../functions/test/helpers/adventureImportDb.mjs'),
    { createStudioService } = await import('../../../../functions/src/studio.mjs');
  const native = adventureImportDb({ nativeUpdates: true }),
    id = 'stepped-empty-native-0001';
  await createStudioService({ db: native.db, now: () => 1000 }).createAdventure('author', {
    operationId: id,
    title: 'PRIVATE_EMPTY',
  });
  expect(
    (await finish(await capture({ ...native, ...inventoryReadHarness(native), id }))).report.totals
      .resources.scene,
  ).toBe(0);
  const f = await inventoryFixture();
  await f.scenes.archiveScene('author', {
    target: f.target,
    sceneId: f.sceneId,
    operationId: 'stepped-archive-0001',
    expectedRevision: f.records.get(f.path + '/scenes/' + f.sceneId).revision,
    archived: true,
  });
  const run = await finish(await capture(f));
  expect(run.report.totals).toMatchObject({
    versions: 1,
    resources: { scene: 1, 'scene-body': 1 },
  });
});
it.each(['unknown-root-field', 'false-body-hash', 'missing-body'])(
  'rejects repaired framing with invalid semantic content: %s',
  async (mode) => {
    const { streamAdventureArchiveRecords } = await import('../index'),
      { archiveUnits, reseal, json, setJSON } = await import('./adventureContentTamper.mjs'),
      { inspectAdventureBackupPackage } =
        await import('../../../../functions/src/adventureBackupPackage.mjs');
    const f = await imageDataFixture(1, false),
      records = [];
    for await (const r of streamAdventureArchiveRecords(f.id, f.scanApi, { guard: () => {} }))
      records.push(r);
    const units = archiveUnits(records);
    if (mode === 'unknown-root-field') {
      const unit = units.find((u) => u.kind === 'adventure-metadata'),
        value = json(unit);
      value.data.jobToken = 'NOT_PORTABLE';
      setJSON(unit, value);
    } else {
      const unit = units.find(
        (u) => u.kind === 'adventure-resource' && json(u).kind === 'scene-body',
      );
      if (mode === 'missing-body') units.splice(units.indexOf(unit), 1);
      else {
        const value = json(unit);
        value.data.hash = '0'.repeat(64);
        setJSON(unit, value);
      }
    }
    const bytes = await reseal(units);
    await inspectAdventureBackupPackage(source(bytes));
    await expect(finish(bytes)).rejects.toMatchObject({ code: 'adventure-backup-invalid-content' });
  },
);
it('bounds a 128-part JSON unit, verifies all reread bytes and rejects the first byte beyond 8 MiB', async () => {
  const { streamAdventureArchiveRecords } = await import('../index'),
    { archiveUnits, reseal, setJSON } = await import('./adventureContentTamper.mjs');
  const f = await inventoryFixture(),
    records = [];
  for await (const r of streamAdventureArchiveRecords(f.id, f.scanApi, { guard: () => {} }))
    records.push(r);
  const units = archiveUnits(records),
    part = units.find((u) => u.kind === 'adventure-part');
  const value = {
    schemaVersion: 1,
    kind: 'part',
    data: { title: 'Legacy', order: 1, contentMode: 'legacy', content: '' },
  };
  value.data.content = 'x'.repeat(8 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(value)));
  setJSON(part, value);
  expect(part.bytes.length).toBe(8 * 1024 * 1024);
  const bytes = await reseal(units),
    run = await finish(bytes);
  const pointer = [...run.target.items.values()].find((p) => p.record.kind === 'adventure-part');
  expect(pointer.spans).toHaveLength(128);
  expect(pointer.byteLength).toBe(8 * 1024 * 1024);
  const reopened = await readAdventureValidationItem(source(bytes), pointer, {
    hash: await createAdventureContentHash(),
  });
  expect(reopened.value.data.content).toBe(value.data.content);
  value.data.content += 'x';
  setJSON(part, value);
  await expect(finish(await reseal(units))).rejects.toMatchObject({
    code: 'adventure-backup-invalid-content',
  });
}, 30000);
it('rejects a truncated seal and changed source size between steps', async () => {
  const f = await imageDataFixture(1, false),
    bytes = await capture(f);
  await expect(finish(bytes.subarray(0, bytes.length - 1))).rejects.toBeTruthy();
  const target = host(),
    state = await advance(initialAdventureRestoreValidation(), bytes, target);
  await expect(advance(state, bytes.subarray(0, bytes.length - 1), target)).rejects.toBeTruthy();
  expect(target.items.size).toBe(0);
});
it('freezes caller intent and the read method before a pending read can be changed', async () => {
  const f = await imageDataFixture(1, false),
    bytes = await capture(f),
    target = host();
  const state = await advance(initialAdventureRestoreValidation(), bytes, target);
  let release;
  const held = new Promise((r) => {
    release = r;
  });
  const input = {
    size: bytes.length,
    async read(o, n) {
      await held;
      return bytes.subarray(o, o + n);
    },
  };
  const settings = {
    hash: { ...(await createAdventureContentHash()) },
    signal: new AbortController().signal,
  };
  const pending = prepareAdventureRestoreValidationStep(
    state,
    input,
    target.begin().store,
    settings,
  );
  input.read = () => {
    throw Error('mutated source');
  };
  state.phase = 'done';
  settings.signal = AbortSignal.abort();
  settings.hash.create = () => {
    throw Error('mutated hash factory');
  };
  release();
  const next = await pending;
  expect(next.phase).toBe('frames');
  expect(next.json.record.kind).toBe('adventure-metadata');
});
it('rejects corrupted counters, pending positions and a completed envelope before they can be reused', async () => {
  const f = await imageDataFixture(1, false),
    bytes = await capture(f),
    target = host();
  let state = await advance(initialAdventureRestoreValidation(), bytes, target);
  state = await advance(state, bytes, target);
  const badCount = structuredClone(state);
  badCount.parser.counts.structure.records++;
  const badSpan = structuredClone(state);
  badSpan.json.spans[0].offset--;
  const badKind = structuredClone(state);
  badKind.parser.manifest.projectKind = 'book';
  for (const invalid of [badCount, badSpan, badKind])
    expect(() => readAdventureRestoreValidationSnapshot(invalid)).toThrow();
  const run = await finish(bytes, target, state),
    done = structuredClone(run.state);
  done.envelope.seal.chainHash = '0'.repeat(64);
  expect(() =>
    completeAdventureRestoreValidation(done, { index: target.begin().store.index, hash: {} }),
  ).toThrow();
});

it('cannot drop a raw body pointer or substitute a manifest unrelated to its verified JSON', async () => {
  const f = await historyDataFixture('', 1),
    bytes = await capture(f),
    run = await finish(bytes);
  const pointer = [...run.target.items.values()].find((p) => p.raw),
    hash = await createAdventureContentHash();
  await expect(
    readAdventureValidationItem(source(bytes), { ...pointer, raw: null }, { hash }),
  ).rejects.toBeTruthy();
  const changed = structuredClone(pointer);
  changed.raw.manifest.contentHash = '0'.repeat(64);
  await expect(readAdventureValidationItem(source(bytes), changed, { hash })).rejects.toBeTruthy();
});
