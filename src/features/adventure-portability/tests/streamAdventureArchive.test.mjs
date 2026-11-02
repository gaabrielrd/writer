// @vitest-environment node
import { it, expect } from 'vitest';
import { imageDataFixture } from './adventureImageFixture.mjs';
import { inventoryFixture, inventoryReadHarness } from './adventureInventoryFixture.mjs';
import { createWorkHistoryService } from '../../../../functions/src/workHistory.mjs';
import {
  inspectAdventureBackupPackage,
  readAdventureBackupPackage,
  ADVENTURE_PACKAGE_SECTIONS,
} from '../../../../functions/src/adventureBackupPackage.mjs';
import {
  streamAdventureArchive as stream,
  streamAdventureArchiveRecords as records,
  AdventureArchiveError,
} from '../index';
const options = { guard: () => {} };
async function collect(output) {
  const values = [];
  for (;;) {
    const n = await output.next();
    if (n.done) return { values, proof: n.value };
    values.push(n.value);
  }
}
const byteSource = (bytes) => ({
  size: bytes.length,
  read: async (o, l) => bytes.subarray(o, o + l),
});
async function fixture() {
  const f = await imageDataFixture();
  const content = 'a'.repeat(65535) + '🌙' + 'b'.repeat(65533);
  await f.scenes.updateScene('author', {
    target: f.target,
    sceneId: f.sceneId,
    operationId: 'archive-text-before-history-0001',
    expectedRevision: f.records.get(f.path + '/scenes/' + f.sceneId).revision,
    patch: { content },
  });
  const history = createWorkHistoryService({ db: f.db, now: () => 3000 });
  const current = await history.getWorkVersionSource('author', {
    target: f.target,
    resource: { kind: 'scene', id: f.sceneId },
  });
  await history.createWorkVersion('author', {
    target: f.target,
    resource: current.resource,
    expectedSourceToken: current.sourceToken,
    operationId: 'archive-manual-version-0001',
    label: 'PRIVATE_MANUAL_VERSION',
  });
  const draft = {
    adventureId: f.id,
    resource: { kind: 'block', id: f.blockId },
    baseRevision: 1,
    savedAt: 4000,
    content: 'PRIVATE_EXPLICIT_DRAFT 🌙',
  };
  return { ...f, content, draft };
}
it('captures all eight real sections in an independently readable envelope/container with complete proofs', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  const captured = await collect(stream(f.id, f.scanApi, { ...options, draft: f.draft }));
  const bytes = Buffer.concat(captured.values),
    source = byteSource(bytes);
  expect(bytes.subarray(0, 12).toString()).toBe('WRITER-ADVN\n');
  const report = await inspectAdventureBackupPackage(source);
  expect(report.validation).toBe('envelope-only');
  expect(report.manifest.sections).toEqual(ADVENTURE_PACKAGE_SECTIONS);
  expect(report.sections).toEqual(captured.proof.capture.sections);
  expect(report.seal.records).toBe(captured.proof.seal.records);
  expect(report.seal.chainHash).toBe(captured.proof.seal.chainHash);
  const read = await collect(readAdventureBackupPackage(source)),
    content = read.values.filter((e) => e.type === 'record');
  expect([...new Set(content.map((e) => e.section))]).toEqual(ADVENTURE_PACKAGE_SECTIONS);
  const text = Buffer.concat(
    content.filter((e) => e.record.kind === 'adventure-version-text').map((e) => e.record.payload),
  );
  expect(text.toString()).toBe(f.content);
  expect(captured.proof.capture.history).toMatchObject({ versions: 1, nativeRecords: 4 });
  expect(captured.proof.capture.images).toMatchObject({ bindings: 2, assets: 2 });
  expect(captured.proof.capture.draft.count).toBe(1);
  const draft = Buffer.concat(
    content.filter((e) => e.record.kind === 'adventure-draft-text').map((e) => e.record.payload),
  );
  expect(draft.toString()).toBe(f.draft.content);
  for (const e of content) expect(e.record.payload.length).toBeLessThanOrEqual(65536);
  const metadata = content
    .filter(
      (e) =>
        !['adventure-image-bytes', 'adventure-version-text', 'adventure-draft-text'].includes(
          e.record.kind,
        ),
    )
    .map((e) => Buffer.from(e.record.payload).toString())
    .join('');
  for (const secret of [
    'sourceToken',
    'bindingToken',
    'imageToken',
    'DO_NOT_COPY',
    'book-covers/',
    'ownerId',
  ])
    expect(metadata).not.toContain(secret);
  expect([...f.records]).toEqual(before);
});
it('an activated native import preserves required empty sections and its original text without a draft', async () => {
  const { adventureImportDb } =
    await import('../../../../functions/test/helpers/adventureImportDb.mjs');
  const { activateBackupImportedAdventure } =
    await import('../../../../functions/test/helpers/adventureBackupImportFixture.mjs');
  const f = adventureImportDb({ nativeUpdates: true }),
    imported = await activateBackupImportedAdventure(f.db),
    api = inventoryReadHarness(f).scanApi;
  const c = await collect(stream(imported.adventureId, api, options));
  expect(c.proof.capture.history.versions).toBe(0);
  expect(c.proof.capture.draft.count).toBe(0);
  expect(c.proof.capture.images).toMatchObject({ bindings: 1, assets: 0 });
  const bytes = Buffer.concat(c.values),
    report = await inspectAdventureBackupPackage(byteSource(bytes));
  expect(Object.values(report.sections).every((v) => v.records > 0)).toBe(true);
});
it('copies options, API port and explicit text before the first byte is requested', async () => {
  const f = await fixture(),
    settings = { ...options, draft: f.draft },
    api = { ...f.scanApi };
  const output = stream(f.id, api, settings);
  f.draft.content = 'LATE_MUTATION';
  settings.guard = () => {
    throw Error('late guard');
  };
  api.call = () => {
    throw Error('late port');
  };
  const c = await collect(output),
    read = await collect(readAdventureBackupPackage(byteSource(Buffer.concat(c.values))));
  const text = Buffer.concat(
    read.values
      .filter((e) => e.type === 'record' && e.record.kind === 'adventure-draft-text')
      .map((e) => e.record.payload),
  );
  expect(text.toString()).toBe('PRIVATE_EXPLICIT_DRAFT 🌙');
});
it('a Storage generation change after the last section prevents the package footer', async () => {
  const f = await fixture(),
    output = records(f.id, f.scanApi, options),
    seen = [];
  for (;;) {
    const n = await output.next();
    expect(n.done).toBe(false);
    seen.push(n.value);
    if (n.value.kind === 'adventure-images') break;
  }
  f.meta.generation = '99';
  await expect(output.next()).rejects.toBeTruthy();
  expect(seen.some((r) => r.kind === 'adventure-package-end')).toBe(false);
});
it('the complete final inventory catches an independently changed private persona profile', async () => {
  const f = await inventoryFixture(),
    { DEFAULT_PERSONAS } = await import('../../../../functions/src/personaProfile.mjs');
  const personaId = 'archive-private-profile',
    path = 'users/author/aiPersonas/' + personaId;
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(path), { ...structuredClone(DEFAULT_PERSONAS[0]), id: personaId }),
  );
  const binding = await f.call({
    action: 'getAdventurePersonaBinding',
    adventureId: f.id,
    sceneId: null,
  });
  await f.mutate({
    action: 'setAdventurePersonaBinding',
    adventureId: f.id,
    sceneId: null,
    adventureToken: binding.adventureToken,
    expectedBindingToken: binding.bindingToken,
    value: { personaId },
    operationId: 'archive-profile-before-0001',
  });
  const output = records(f.id, f.scanApi, options);
  for (;;) {
    const n = await output.next();
    expect(n.done).toBe(false);
    if (n.value.kind === 'adventure-images') break;
  }
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(path), { instructions: 'CHANGED_PRIVATE_INSTRUCTIONS' }),
  );
  await expect(output.next()).rejects.toBeTruthy();
});
it('history counts must match the first full inventory before the later sections can finish', async () => {
  const f = await fixture();
  let listed = 0;
  f.intercept(async (method, input, run) => {
    const value = await run();
    if (method === 'listAdventureBackupHistory' && input.kind === 'version' && ++listed === 1)
      return { ...value, items: [], nextCursor: null };
    return value;
  });
  await expect(collect(records(f.id, f.scanApi, options))).rejects.toBeInstanceOf(
    AdventureArchiveError,
  );
});
it('an unknown draft resource fails before the file can be sealed', async () => {
  const f = await fixture();
  f.draft.resource.id = 'missing-resource';
  await expect(
    collect(stream(f.id, f.scanApi, { ...options, draft: f.draft })),
  ).rejects.toBeInstanceOf(AdventureArchiveError);
});
it('I/O failure leaves no complete archive and a fresh capture can retry', async () => {
  const f = await fixture();
  f.hook.range = () => {
    throw Error('range offline');
  };
  await expect(collect(stream(f.id, f.scanApi, options))).rejects.toBeTruthy();
  f.hook.range = null;
  const c = await collect(stream(f.id, f.scanApi, options));
  expect(
    (await inspectAdventureBackupPackage(byteSource(Buffer.concat(c.values)))).seal.records,
  ).toBe(c.proof.seal.records);
});
it('return closes the byte bridge before a held source RPC is released', async () => {
  const f = await imageDataFixture(1, false);
  let enter, release;
  const started = new Promise((r) => {
      enter = r;
    }),
    held = new Promise((r) => {
      release = r;
    });
  f.intercept(async (method, input, run) => {
    if (method === 'getAdventureBackupSource') {
      enter();
      await held;
    }
    return run();
  });
  const output = stream(f.id, f.scanApi, options);
  await output.next();
  const pending = output.next().catch((e) => e);
  await started;
  expect(await output.return(undefined)).toEqual({ done: true, value: undefined });
  expect((await pending).name).toBe('AbortError');
  const before = f.calls.length;
  release();
  await Promise.resolve();
  expect(f.calls).toHaveLength(before);
});
it('account changes between package-end and the container footer prevent a usable file seal', async () => {
  const f = await imageDataFixture(1, false);
  let active = true;
  const output = stream(f.id, f.scanApi, {
      guard: () => {
        if (!active) throw Error('actor changed');
      },
    }),
    chunks = [];
  for (;;) {
    const n = await output.next();
    expect(n.done).toBe(false);
    chunks.push(n.value);
    if (Buffer.from(n.value).toString().includes('"kind":"adventure-package-end"')) break;
  }
  active = false;
  await expect(output.next()).rejects.toThrow('actor changed');
  await expect(
    inspectAdventureBackupPackage(byteSource(Buffer.concat(chunks))),
  ).rejects.toBeTruthy();
});
it('a stale explicit source fails before any package record is emitted', async () => {
  const f = await imageDataFixture(1, false);
  const pin = await f.handlers.getAdventureBackupSource('author', { adventureId: f.id });
  const output = records(f.id, f.scanApi, { ...options, source: pin });
  await f.db.runTransaction((tx) => tx.update(f.db.doc(f.path), { title: 'CHANGED_ROOT' }));
  await expect(output.next()).rejects.toBeTruthy();
});
