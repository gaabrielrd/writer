// @vitest-environment node
import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { inventoryFixture, inventoryReadHarness } from './adventureInventoryFixture.mjs';
import {
  streamAdventureCoreData as stream,
  verifyAdventureBackupInventory as verify,
} from '../index';
import { encodeAdventureBackup } from '../../../../functions/src/adventureBackupContainer.mjs';
import {
  adventurePackageHeader,
  adventurePackageEnd,
  createAdventurePackageCounts,
  countAdventurePackageRecord,
  inspectAdventureBackupPackage,
} from '../../../../functions/src/adventureBackupPackage.mjs';
const options = { guard: () => {} },
  utf8 = (s) => new TextEncoder().encode(s),
  hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sections = ['structure', 'resources', 'lore', 'personas', 'universe'];
const ends = new Set(['adventure-resources', 'adventure-lore-end', 'adventure-personas']);
async function collect(iterator) {
  const records = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) return { records, proof: next.value };
    records.push(next.value);
  }
}
function units(records) {
  const result = [];
  for (const row of records) {
    const previous = result.at(-1);
    if (
      previous &&
      previous.section === row.section &&
      previous.kind === row.record.kind &&
      previous.id === row.record.id
    ) {
      expect(row.record.part).toBe(previous.parts.length);
      previous.parts.push(row.record.payload);
    } else {
      expect(row.record.part).toBe(0);
      result.push({
        section: row.section,
        kind: row.record.kind,
        id: row.record.id,
        parts: [row.record.payload],
      });
    }
  }
  return result.map((u) => ({
    ...u,
    bytes: Buffer.concat(u.parts),
    value: JSON.parse(Buffer.concat(u.parts).toString('utf8')),
  }));
}
it('composes real metadata and bodies into five ordered sections with independent unit digests', async () => {
  const f = await inventoryFixture(),
    captured = await collect(stream(f.id, f.scanApi, options)),
    all = units(captured.records);
  expect(captured.proof.validation).toBe('core-data-only');
  expect([...new Set(captured.records.map((r) => r.section))]).toEqual(sections);
  expect(captured.proof.sections.structure.units).toBe(
    captured.proof.inventory.counts.structure + 1,
  );
  for (const section of sections) {
    const rows = all.filter((r) => r.section === section && !ends.has(r.kind)),
      digest = createHash('sha256').update('writer-adventure-core-v1:' + section + '\n');
    for (const row of rows)
      digest.update(
        JSON.stringify([
          'unit',
          row.kind,
          row.id,
          row.bytes.length,
          row.parts.length,
          hash(row.bytes),
        ]) + '\n',
      );
    const expected = digest.digest('hex');
    expect(captured.proof.sections[section].digest).toBe(expected);
    expect(captured.proof.sections[section].units).toBe(rows.length);
    if (section !== 'structure' && section !== 'universe') {
      const manifest = all.find((r) => r.section === section && ends.has(r.kind)).value;
      expect(manifest.digest).toBe(expected);
      expect(manifest.units).toBe(rows.length);
    }
  }
  const bodies = all.filter(
    (r) => r.kind === 'adventure-resource' && r.value.kind === 'scene-body',
  );
  expect(bodies[0].value.data.content).toContain('PRIVATE_HISTORY 🌙');
  expect(bodies[0].parts.length).toBe(2);
  const personas = all.filter((r) => r.kind === 'adventure-persona');
  expect(personas.some((r) => r.value.personaId === null && r.value.profile === null)).toBe(true);
  expect(personas.some((r) => r.value.profile?.instructions)).toBe(true);
  const universe = all.find((r) => r.kind === 'adventure-universe').value;
  expect(universe).toEqual({ schemaVersion: 1, origin: { kind: 'none' } });
  expect(
    all.some((r) => r.kind.startsWith('adventure-version') || r.kind.startsWith('adventure-image')),
  ).toBe(false);
  await verify(captured.proof.inventory, f.scanApi, options);
});
it('core records fit the envelope when the remaining sections are supplied by a test host', async () => {
  const f = await inventoryFixture(),
    captured = await collect(stream(f.id, f.scanApi, options)),
    counts = createAdventurePackageCounts();
  const rows = captured.records.map(({ section, record }) => {
    countAdventurePackageRecord(counts, section, record);
    return record;
  });
  // Deliberately opaque test placeholders, not a complete authored archive.
  for (const [section, kind] of [
    ['history', 'adventure-history'],
    ['drafts', 'adventure-drafts'],
    ['images', 'adventure-images'],
  ]) {
    const record = { kind, id: f.id, part: 0, payload: utf8('{}') };
    countAdventurePackageRecord(counts, section, record);
    rows.push(record);
  }
  const output = [];
  for await (const bytes of encodeAdventureBackup([
    adventurePackageHeader(f.id),
    ...rows,
    adventurePackageEnd(f.id, counts),
  ]))
    output.push(bytes);
  const bytes = Buffer.concat(output),
    report = await inspectAdventureBackupPackage({
      size: bytes.length,
      read: async (o, l) => bytes.subarray(o, o + l),
    });
  expect(report.validation).toBe('envelope-only');
  expect(report.sections).toEqual(counts);
  expect(report.manifest.projectKind).toBe('adventure');
});
it('an activated imported adventure preserves empty section manifests and original scene text', async () => {
  const { adventureImportDb } =
    await import('../../../../functions/test/helpers/adventureImportDb.mjs');
  const { activateBackupImportedAdventure } =
    await import('../../../../functions/test/helpers/adventureBackupImportFixture.mjs');
  const f = adventureImportDb({ nativeUpdates: true }),
    imported = await activateBackupImportedAdventure(f.db),
    api = inventoryReadHarness(f).scanApi;
  const captured = await collect(stream(imported.adventureId, api, options)),
    all = units(captured.records);
  expect(all.find((r) => r.kind === 'adventure-metadata').value.data.origin.kind).toBe('imported');
  expect(
    all.find((r) => r.kind === 'adventure-resource' && r.value.kind === 'scene-body').value.data
      .content,
  ).toBe(imported.sections[0].content);
  expect(all.find((r) => r.kind === 'adventure-lore-end').value.units).toBe(0);
  expect(captured.proof.sections.personas.units).toBe(2);
  await verify(captured.proof.inventory, api, options);
});
it('an error after partial output never returns a core proof or starts later content', async () => {
  const f = await inventoryFixture(),
    failure = Error('source unavailable');
  f.intercept(async (method, input, run) => {
    if (method === 'readAdventureBackupResource' && input.kind === 'scene-body') throw failure;
    return run();
  });
  const output = stream(f.id, f.scanApi, options),
    seen = [];
  let error;
  try {
    for (;;) {
      const next = await output.next();
      if (next.done) throw Error('must not complete');
      seen.push(next.value);
    }
  } catch (e) {
    error = e;
  }
  expect(error).toBe(failure);
  expect(seen.length).toBeGreaterThan(1);
  expect(seen.some((r) => r.section === 'personas' || r.section === 'universe')).toBe(false);
  expect((await output.next()).value).toBeUndefined();
});
it('a core factory freezes expected source, port and guards before the first pull', async () => {
  const f = await inventoryFixture(),
    pin = await f.handlers.getAdventureBackupSource('author', { adventureId: f.id });
  const settings = { ...options, source: { ...pin } },
    output = stream(f.id, f.scanApi, settings);
  settings.source.sourceToken = 'f'.repeat(64);
  settings.guard = () => {
    throw Error('late guard');
  };
  f.scanApi.call = async () => {
    throw Error('late port');
  };
  const captured = await collect(output);
  expect(captured.proof.inventory.source.sourceToken).toBe(pin.sourceToken);
});
it('return closes during a held source RPC before it is released and ignores its late body', async () => {
  const f = await inventoryFixture();
  let release, started;
  const held = new Promise((r) => {
      release = r;
    }),
    atStart = new Promise((r) => {
      started = r;
    });
  f.intercept(async (_method, _input, run) => {
    const value = await run();
    started();
    await held;
    return value;
  });
  const output = stream(f.id, f.scanApi, options),
    pending = output.next().catch((e) => e);
  await atStart;
  expect(await output.return(undefined)).toEqual({ done: true, value: undefined });
  expect((await pending).name).toBe('AbortError');
  const count = f.calls.length;
  release();
  await Promise.resolve();
  await Promise.resolve();
  expect(f.calls).toHaveLength(count);
});
it('account change after a consumed record prevents later reads and proofs', async () => {
  const f = await inventoryFixture();
  let current = true;
  const output = stream(f.id, f.scanApi, {
    guard: () => {
      if (!current) throw Error('actor changed');
    },
  });
  await output.next();
  const calls = f.calls.length;
  current = false;
  await expect(output.next()).rejects.toThrow('actor changed');
  expect(f.calls).toHaveLength(calls);
});
it('a changed source before first pull rejects the old explicit pin without content', async () => {
  const f = await inventoryFixture(),
    source = await f.handlers.getAdventureBackupSource('author', { adventureId: f.id });
  const output = stream(f.id, f.scanApi, { ...options, source });
  await f.db.runTransaction((tx) => tx.update(f.db.doc(f.path), { title: 'new title' }));
  await expect(output.next()).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(f.calls.every((c) => c.method === 'getAdventureBackupSource')).toBe(true);
});

it('emits every scene and null binding across 53 members without deduplicating away authored units', async () => {
  const f = await inventoryFixture(53),
    captured = await collect(stream(f.id, f.scanApi, options)),
    all = units(captured.records);
  const scenes = all.filter((r) => r.kind === 'adventure-resource' && r.value.kind === 'scene');
  expect(scenes).toHaveLength(53);
  expect(all.filter((r) => r.kind === 'adventure-persona')).toHaveLength(54);
  expect(captured.proof.sections.personas.units).toBe(54);
  await verify(captured.proof.inventory, f.scanApi, options);
});
it('preserves a used private archived profile and scene inheritance without copying library secrets', async () => {
  const f = await inventoryFixture(),
    { DEFAULT_PERSONAS } = await import('../../../../functions/src/personaProfile.mjs');
  const personaId = 'inventory-private-persona',
    path = 'users/author/aiPersonas/' + personaId;
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(path), {
      ...structuredClone(DEFAULT_PERSONAS[0]),
      id: personaId,
      instructions: 'PRIVATE_CUSTOM_INSTRUCTIONS',
      apiKey: 'FORBIDDEN_KEY',
      provider: 'FORBIDDEN_PROVIDER',
    }),
  );
  const current = await f.call({
    action: 'getAdventurePersonaBinding',
    adventureId: f.id,
    sceneId: null,
  });
  await f.mutate({
    action: 'setAdventurePersonaBinding',
    adventureId: f.id,
    sceneId: null,
    adventureToken: current.adventureToken,
    expectedBindingToken: current.bindingToken,
    value: { personaId },
    operationId: 'core-private-persona-0001',
  });
  await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { archived: true }));
  await f.scenes.createScene('author', {
    target: f.target,
    operationId: 'core-inherited-scene-0001',
    title: 'PRIVATE_INHERITED_SCENE',
  });
  const captured = await collect(stream(f.id, f.scanApi, options)),
    all = units(captured.records),
    personas = all.filter((r) => r.kind === 'adventure-persona');
  const root = personas.find((r) => r.value.scope === 'adventure').value;
  expect(root.profile.id).toBe(personaId);
  expect(root.profile.archived).toBe(true);
  expect(root.profile.instructions).toBe('PRIVATE_CUSTOM_INSTRUCTIONS');
  expect(
    personas.some(
      (r) => r.value.bindingId === 'core-inherited-scene-0001' && r.value.profile === null,
    ),
  ).toBe(true);
  const text = all.map((r) => r.bytes.toString('utf8')).join('');
  expect(text).not.toContain('FORBIDDEN_KEY');
  expect(text).not.toContain('FORBIDDEN_PROVIDER');
  await verify(captured.proof.inventory, f.scanApi, options);
});
it('an unavailable world remains a neutral origin and never becomes copied global lore', async () => {
  const f = await inventoryFixture();
  await f.db.runTransaction((tx) => {
    tx.update(f.db.doc(f.path), { universeId: 'core-foreign-world' });
    tx.create(f.db.doc('universes/core-foreign-world'), {
      authorId: 'other',
      name: 'FORBIDDEN_WORLD_NAME',
    });
    tx.create(f.db.doc('universes/core-foreign-world/lore/person'), {
      name: 'FORBIDDEN_GLOBAL_NAME',
      details: 'FORBIDDEN_GLOBAL_TEXT',
    });
  });
  const captured = await collect(stream(f.id, f.scanApi, options)),
    all = units(captured.records);
  expect(all.find((r) => r.kind === 'adventure-universe').value.origin).toEqual({
    kind: 'unavailable',
    id: 'core-foreign-world',
  });
  const text = all.map((r) => r.bytes.toString('utf8')).join('');
  expect(text).not.toContain('FORBIDDEN_');
  await verify(captured.proof.inventory, f.scanApi, options);
});
