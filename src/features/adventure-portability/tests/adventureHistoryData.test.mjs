// @vitest-environment node
import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { historyDataFixture } from './adventureHistoryFixture.mjs';
import { streamAdventureHistoryData as stream, AdventureHistoryError } from '../index';
const options = { guard: () => {} },
  hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function collect(iterator) {
  const records = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) return { records, proof: next.value };
    records.push(next.value);
  }
}
function groups(records) {
  const rows = [];
  for (const r of records) {
    const last = rows.at(-1);
    if (last && last.kind === r.kind && last.id === r.id) {
      expect(r.part).toBe(last.parts.length);
      last.parts.push(r.payload);
    } else {
      expect(r.part).toBe(0);
      rows.push({ kind: r.kind, id: r.id, parts: [r.payload] });
    }
  }
  return rows.map((r) => ({ ...r, bytes: Buffer.concat(r.parts) }));
}
it('keeps the native header and repacks three Unicode-safe native chunks into two fixed byte parts', async () => {
  const f = await historyDataFixture(),
    captured = await collect(stream(f.id, f.scanApi, options)),
    all = groups(captured.records);
  const header = JSON.parse(all.find((r) => r.kind === 'adventure-version').bytes),
    body = JSON.parse(all.find((r) => r.kind === 'adventure-version-body').bytes);
  const text = all.find((r) => r.kind === 'adventure-version-text');
  expect(header.data.chunkCount).toBe(3);
  expect(body.chunkCount).toBe(2);
  expect(text.parts.map((p) => p.length)).toEqual([65536, 65536]);
  expect(text.bytes.toString('utf8')).toBe(f.content);
  expect(hash(text.bytes)).toBe(body.contentHash);
  expect(body.headerHash).toBe(hash(all.find((r) => r.kind === 'adventure-version').bytes));
  expect(() => new TextDecoder('utf-8', { fatal: true }).decode(text.parts[0])).toThrow();
  expect(
    f.calls
      .filter((c) => c.method === 'readAdventureBackupHistoryText')
      .map((c) => c.input.ordinal),
  ).toEqual([0, 1, 2]);
  expect(captured.proof).toMatchObject({
    validation: 'history-data-only',
    versions: 1,
    nativeRecords: 4,
    textBytes: 131072,
  });
  const footer = JSON.parse(all.at(-1).bytes);
  const digest = createHash('sha256')
    .update('writer-adventure-history-v1\n')
    .update(
      JSON.stringify([
        'version',
        text.id,
        all[0].bytes.length,
        all[0].parts.length,
        hash(all[0].bytes),
        text.bytes.length,
        text.parts.length,
        hash(text.bytes),
      ]) + '\n',
    )
    .digest('hex');
  expect(footer.digest).toBe(digest);
  expect(captured.proof.digest).toBe(digest);
});
it('an empty historical text is explicit and its empty hash is verified', async () => {
  const f = await historyDataFixture(''),
    captured = await collect(stream(f.id, f.scanApi, options)),
    all = groups(captured.records),
    text = all.find((r) => r.kind === 'adventure-version-text');
  expect(text.parts).toHaveLength(1);
  expect(text.bytes.length).toBe(0);
  const body = JSON.parse(all.find((r) => r.kind === 'adventure-version-body').bytes);
  expect(body).toMatchObject({ byteLength: 0, chunkCount: 1, contentHash: hash(Buffer.alloc(0)) });
  expect(captured.proof).toMatchObject({ versions: 1, nativeRecords: 2, textBytes: 0 });
});
it('an empty history emits only a real zero manifest', async () => {
  const f = await historyDataFixture('', 0),
    captured = await collect(stream(f.id, f.scanApi, options));
  expect(captured.records.map((r) => r.kind)).toEqual(['adventure-history']);
  expect(captured.proof).toMatchObject({ versions: 0, nativeRecords: 0, textBytes: 0 });
  expect(captured.proof.digest).toBe(
    createHash('sha256').update('writer-adventure-history-v1\n').digest('hex'),
  );
});
it('paginates 53 versions without a project cap or relying on physical body order', async () => {
  const f = await historyDataFixture('PRIVATE_SMALL_TEXT', 53),
    captured = await collect(stream(f.id, f.scanApi, options));
  expect(captured.proof).toMatchObject({ versions: 53, nativeRecords: 106 });
  expect(captured.records.filter((r) => r.kind === 'adventure-version-text')).toHaveLength(53);
  expect(
    f.calls
      .filter((c) => c.method === 'listAdventureBackupHistory')
      .map((c) => c.input.cursor !== null),
  ).toEqual([false, true]);
});
for (const [name, edit] of [
  ['wrong source', (v) => ({ ...v, sourceToken: 'f'.repeat(64) })],
  ['wrong ordinal', (v) => ({ ...v, ordinal: 99 })],
  ['wrong parent', (v) => ({ ...v, parentId: 'other' })],
  ['wrong parent token', (v) => ({ ...v, parentToken: 'f'.repeat(64) })],
  ['wrong physical address', (v) => ({ ...v, id: 'f'.repeat(64) })],
  ['unknown field', (v) => ({ ...v, privateName: 'PRIVATE_UNEXPECTED' })],
  ['changed manifest', (v) => ({ ...v, manifest: { ...v.manifest, byteLength: 1 } })],
  ['bad part hash', (v) => ({ ...v, chunkHash: 'f'.repeat(64) })],
  ['noncanonical base64', (v) => ({ ...v, chunkBase64: v.chunkBase64 + ' ' })],
]) {
  it('rejects a malformed text response without a history proof: ' + name, async () => {
    const f = await historyDataFixture('PRIVATE_TEXT');
    f.intercept(async (method, _input, run) => {
      const value = await run();
      return method === 'readAdventureBackupHistoryText' ? edit(value) : value;
    });
    await expect(collect(stream(f.id, f.scanApi, options))).rejects.toBeInstanceOf(
      AdventureHistoryError,
    );
  });
}
it('whole-text mismatch fails even when each individual chunk has a correct checksum', async () => {
  const f = await historyDataFixture();
  f.intercept(async (method, input, run) => {
    const value = await run();
    if (method === 'readAdventureBackupHistoryText' && input.ordinal === 2) {
      const bytes = Buffer.from(value.chunkBase64, 'base64');
      bytes[0] ^= 1;
      return { ...value, chunkBase64: bytes.toString('base64'), chunkHash: hash(bytes) };
    }
    return value;
  });
  const output = stream(f.id, f.scanApi, options),
    seen = [];
  let error;
  try {
    for (;;) {
      const next = await output.next();
      if (next.done) throw Error('must reject');
      seen.push(next.value);
    }
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(AdventureHistoryError);
  expect(seen.some((r) => r.kind === 'adventure-version-text')).toBe(true);
  expect(seen.some((r) => r.kind === 'adventure-history')).toBe(false);
});
it('a lost ordinal reply can be retried as a fresh read but never becomes empty successful text', async () => {
  const f = await historyDataFixture('PRIVATE_TEXT'),
    failure = Error('lost text reply');
  f.intercept(async (method, _input, run) => {
    if (method === 'readAdventureBackupHistoryText') throw failure;
    return run();
  });
  await expect(collect(stream(f.id, f.scanApi, options))).rejects.toBe(failure);
  f.intercept(null);
  expect((await collect(stream(f.id, f.scanApi, options))).proof.versions).toBe(1);
});
it('metadata and port options are fixed before next while context is still rechecked', async () => {
  const f = await historyDataFixture('PRIVATE_TEXT'),
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
  expect((await collect(output)).proof.source.sourceToken).toBe(pin.sourceToken);
});
it('return during a held ordinal RPC resolves before release and no late text or footer is delivered', async () => {
  const f = await historyDataFixture('PRIVATE_TEXT');
  let release, started;
  const held = new Promise((r) => {
      release = r;
    }),
    atStart = new Promise((r) => {
      started = r;
    });
  f.intercept(async (method, _input, run) => {
    const result = await run();
    if (method === 'readAdventureBackupHistoryText') {
      started();
      await held;
    }
    return result;
  });
  const output = stream(f.id, f.scanApi, options),
    pending = collect(output).catch((error) => error);
  await atStart;
  const calls = f.calls.length;
  expect(await output.return(undefined)).toEqual({ done: true, value: undefined });
  expect((await pending).name).toBe('AbortError');
  release();
  await Promise.resolve();
  expect(f.calls).toHaveLength(calls);
});
it('account change prevents all text reads after a yielded header record', async () => {
  const f = await historyDataFixture('PRIVATE_TEXT');
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

it('preserves manual and before-restore snapshots as separate retained versions', async () => {
  const f = await historyDataFixture('PRIVATE_ORIGINAL_TEXT'),
    first = 'history-file-version-0001';
  await f.scenes.updateScene('author', {
    target: f.target,
    sceneId: f.resource.id,
    operationId: 'history-file-edit-0001',
    expectedRevision: f.records.get(f.path + '/scenes/' + f.resource.id).revision,
    patch: { content: 'PRIVATE_BEFORE_RESTORE' },
  });
  const current = await f.history.getWorkVersionSource('author', {
    target: f.target,
    resource: f.resource,
  });
  await f.history.restoreWorkVersion('author', {
    target: f.target,
    resource: f.resource,
    versionId: first,
    operationId: 'history-file-restore-0001',
    expectedSourceToken: current.sourceToken,
  });
  const captured = await collect(stream(f.id, f.scanApi, options)),
    all = groups(captured.records);
  expect(captured.proof.versions).toBe(2);
  expect(
    all
      .filter((r) => r.kind === 'adventure-version')
      .map((r) => JSON.parse(r.bytes).data.reason)
      .sort(),
  ).toEqual(['before-restore', 'manual']);
  expect(
    all
      .filter((r) => r.kind === 'adventure-version-text')
      .map((r) => r.bytes.toString('utf8'))
      .sort(),
  ).toEqual(['PRIVATE_BEFORE_RESTORE', 'PRIVATE_ORIGINAL_TEXT']);
});
it('core and historical records share one pinned source and their native totals agree', async () => {
  const { inventoryFixture } = await import('./adventureInventoryFixture.mjs');
  const { streamAdventureCoreData, verifyAdventureBackupInventory } = await import('../index');
  const f = await inventoryFixture(),
    core = [];
  const coreStream = streamAdventureCoreData(f.id, f.scanApi, options);
  let proof;
  for (;;) {
    const next = await coreStream.next();
    if (next.done) {
      proof = next.value;
      break;
    }
    core.push(next.value);
  }
  const captured = await collect(
    stream(f.id, f.scanApi, { ...options, source: proof.inventory.source }),
  );
  expect(captured.proof.source.sourceToken).toBe(proof.inventory.source.sourceToken);
  expect(captured.proof.nativeRecords).toBe(proof.inventory.counts.history);
  expect(core.length).toBeGreaterThan(5);
  await verifyAdventureBackupInventory(proof.inventory, f.scanApi, options);
});

it('an unfinished UTF-8 sequence cannot become a successful text snapshot even with matching checksums', async () => {
  const f = await historyDataFixture('x'),
    bytes = Buffer.from([0xf0]);
  f.intercept(async (method, _input, run) => {
    const value = await run();
    return method === 'readAdventureBackupHistoryText'
      ? {
          ...value,
          chunkBase64: bytes.toString('base64'),
          chunkHash: hash(bytes),
          manifest: { ...value.manifest, contentHash: hash(bytes) },
        }
      : value;
  });
  await expect(collect(stream(f.id, f.scanApi, options))).rejects.toBeInstanceOf(
    AdventureHistoryError,
  );
});
