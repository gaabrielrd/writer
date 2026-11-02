// @vitest-environment node
import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { inventoryFixture } from './adventureInventoryFixture.mjs';
import {
  scanAdventureBackupInventory as scan,
  readAdventureBackupUnit as readUnit,
  AdventureUnitError,
} from '../index';
const options = { guard: () => {} };
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function collect(stream) {
  const chunks = [];
  for (;;) {
    const next = await stream.next();
    if (next.done) return { bytes: Buffer.concat(chunks), proof: next.value };
    chunks.push(next.value);
  }
}
async function fixture() {
  const f = await inventoryFixture(),
    source = await f.handlers.getAdventureBackupSource('author', { adventureId: f.id });
  const scope = { family: 'resources', kind: 'scene-body', parentId: f.sceneId };
  const page = await f.handlers.listAdventureBackupResources('author', {
    adventureId: f.id,
    sourceToken: source.sourceToken,
    kind: scope.kind,
    parentId: scope.parentId,
    limit: 50,
    cursor: null,
  });
  const item = page.items[0];
  return {
    ...f,
    source,
    scope,
    item,
    stream: () => readUnit(source, scope, item, f.scanApi, options),
  };
}
it('certifies native JSON units from every supported reader without a whole-project buffer', async () => {
  const f = await fixture(),
    seen = new Set();
  const root = await collect(
    readUnit(
      f.source,
      { family: 'structure', kind: 'adventure' },
      { id: f.id, itemToken: f.source.sourceToken },
      f.scanApi,
      options,
    ),
  );
  expect(root.proof.validation).toBe('unit-bytes-only');
  expect(hash(root.bytes)).toBe(root.proof.contentHash);
  await scan(f.id, f.scanApi, {
    ...options,
    source: f.source,
    visit: async (scope, item) => {
      if (
        ['images', 'universe'].includes(scope.family) ||
        (scope.family === 'personas' && item.personaId === null)
      )
        return;
      const result = await collect(readUnit(f.source, scope, item, f.scanApi, options));
      expect(hash(result.bytes)).toBe(result.proof.contentHash);
      expect(result.bytes.length).toBe(result.proof.byteLength);
      expect(JSON.parse(result.bytes.toString('utf8')).schemaVersion).toBe(1);
      expect(Object.isFrozen(result.proof)).toBe(true);
      seen.add(scope.family);
    },
  });
  expect(seen).toEqual(new Set(['structure', 'resources', 'lore', 'personas', 'history']));
});
it('requests exactly one range at a time and returns a proof only after natural completion', async () => {
  const f = await fixture(),
    stream = f.stream();
  const first = await stream.next();
  expect(first.done).toBe(false);
  expect(first.value.length).toBe(65536);
  expect(f.calls).toHaveLength(1);
  await Promise.resolve();
  expect(f.calls).toHaveLength(1);
  const rest = await collect(stream),
    bytes = Buffer.concat([first.value, rest.bytes]);
  expect(hash(bytes)).toBe(rest.proof.contentHash);
  expect(rest.proof.chunkCount).toBe(2);
  expect(f.calls.map((c) => c.input.index)).toEqual([0, 1]);
  expect(JSON.parse(bytes.toString('utf8')).data.content).toContain('PRIVATE_HISTORY 🌙');
});
for (const [name, edit] of [
  ['unknown field', (v) => ({ ...v, title: 'PRIVATE_EXTRA' })],
  ['wrong source', (v) => ({ ...v, sourceToken: 'f'.repeat(64) })],
  ['wrong scope', (v) => ({ ...v, parentId: 'wrong-parent' })],
  ['wrong item', (v) => ({ ...v, id: 'wrong-item' })],
  ['wrong token', (v) => ({ ...v, itemToken: 'f'.repeat(64) })],
  ['wrong transport ordinal', (v) => ({ ...v, index: 1 })],
  ['inconsistent byte length', (v) => ({ ...v, byteLength: v.byteLength + 65536 })],
  ['oversized base64', (v) => ({ ...v, chunkBase64: 'A'.repeat(87388) })],
  ['base64 whitespace', (v) => ({ ...v, chunkBase64: v.chunkBase64 + ' ' })],
  [
    'missing required presence',
    (v) => {
      const { present, ...rest } = v;
      return rest;
    },
  ],
]) {
  it('refuses malformed first range: ' + name, async () => {
    const f = await fixture();
    f.intercept(async (method, _input, run) => {
      const value = await run();
      return method === 'readAdventureBackupResource' ? edit(value) : value;
    });
    await expect(f.stream().next()).rejects.toBeInstanceOf(AdventureUnitError);
    expect(f.calls).toHaveLength(1);
  });
}
it('canonical base64 is required even when the decoded bytes and expected hash match', async () => {
  const f = await fixture();
  f.intercept(async (_method, _input, run) => ({
    ...(await run()),
    byteLength: 1,
    chunkCount: 1,
    contentHash: hash(Buffer.from([0])),
    chunkBase64: 'AB==',
  }));
  await expect(f.stream().next()).rejects.toBeInstanceOf(AdventureUnitError);
});
it('rejects a changed manifest before yielding the second range', async () => {
  const f = await fixture();
  let second;
  f.intercept(async (_method, input, run) => {
    const value = await run();
    return input.index === 1 ? { ...value, contentHash: 'f'.repeat(64) } : value;
  });
  const stream = f.stream();
  await stream.next();
  try {
    second = await stream.next();
  } catch (error) {
    expect(error).toBeInstanceOf(AdventureUnitError);
  }
  expect(second).toBeUndefined();
  expect(f.calls).toHaveLength(2);
});
it('whole-unit hash failure never yields the last corrupt range or a proof', async () => {
  const f = await fixture();
  f.intercept(async (_method, input, run) => {
    const value = await run();
    if (input.index === 1) {
      const bytes = Buffer.from(value.chunkBase64, 'base64');
      bytes[0] ^= 1;
      return { ...value, chunkBase64: bytes.toString('base64') };
    }
    return value;
  });
  const stream = f.stream();
  expect((await stream.next()).done).toBe(false);
  await expect(stream.next()).rejects.toBeInstanceOf(AdventureUnitError);
  expect((await stream.next()).value).toBeUndefined();
});
it('source I/O errors propagate without another request or successful proof', async () => {
  const f = await fixture(),
    failure = Error('transient range read');
  f.intercept(async (_method, input, run) => {
    if (input.index === 1) throw failure;
    return run();
  });
  const stream = f.stream();
  await stream.next();
  await expect(stream.next()).rejects.toBe(failure);
  expect(f.calls).toHaveLength(2);
});
it('captures source, scope, metadata, options and port method before the first next', async () => {
  const f = await fixture(),
    source = { ...f.source },
    scope = { ...f.scope },
    item = { ...f.item },
    settings = { ...options };
  const stream = readUnit(source, scope, item, f.scanApi, settings);
  source.sourceToken = 'f'.repeat(64);
  scope.kind = 'block-body';
  item.itemToken = 'e'.repeat(64);
  settings.guard = () => {
    throw Error('late guard');
  };
  f.scanApi.call = async () => {
    throw Error('late port');
  };
  const result = await collect(stream);
  expect(result.proof.source.sourceToken).toBe(f.source.sourceToken);
  expect(result.proof.scope.kind).toBe('scene-body');
  expect(hash(result.bytes)).toBe(result.proof.contentHash);
});
it('a mutated consumer buffer and response object cannot change future parts or the saved manifest', async () => {
  const f = await fixture();
  let response;
  f.intercept(async (_method, _input, run) => {
    response = await run();
    return response;
  });
  const stream = f.stream(),
    first = await stream.next(),
    saved = Buffer.from(first.value);
  first.value.fill(0);
  response.contentHash = 'changed-after-yield';
  response.byteLength = 1;
  const rest = await collect(stream),
    bytes = Buffer.concat([saved, rest.bytes]);
  expect(hash(bytes)).toBe(rest.proof.contentHash);
  expect(rest.proof.byteLength).toBe(bytes.length);
});
it('return before reading and after one chunk never requests another part or returns a proof', async () => {
  const f = await fixture(),
    unstarted = f.stream();
  expect(await unstarted.return(undefined)).toEqual({ done: true, value: undefined });
  expect(f.calls).toHaveLength(0);
  const stream = f.stream();
  await stream.next();
  expect(await stream.return(undefined)).toEqual({ done: true, value: undefined });
  expect(f.calls).toHaveLength(1);
});
it('return during a held RPC blocks the late response and produces no completion proof', async () => {
  const f = await fixture();
  let release, started;
  const atStart = new Promise((r) => {
      started = r;
    }),
    held = new Promise((r) => {
      release = r;
    });
  f.intercept(async (_method, _input, run) => {
    const value = await run();
    started();
    await held;
    return value;
  });
  const stream = f.stream(),
    pending = stream.next().catch((e) => e);
  await atStart;
  const closing = stream.return(undefined);
  expect(await closing).toEqual({ done: true, value: undefined });
  release();
  expect((await pending).name).toBe('AbortError');
  expect(f.calls).toHaveLength(1);
});
it('account change after a held RPC prevents emission and further parts', async () => {
  const f = await fixture();
  let release,
    started,
    current = true;
  const atStart = new Promise((r) => {
      started = r;
    }),
    held = new Promise((r) => {
      release = r;
    });
  f.intercept(async (_method, _input, run) => {
    const value = await run();
    started();
    await held;
    return value;
  });
  const stream = readUnit(f.source, f.scope, f.item, f.scanApi, {
    guard: () => {
      if (!current) throw Error('actor changed');
    },
  });
  const pending = stream.next().catch((e) => e);
  await atStart;
  current = false;
  release();
  expect((await pending).message).toBe('actor changed');
  expect(f.calls).toHaveLength(1);
});
it('external abort while the consumer is paused stops before requesting another range', async () => {
  const f = await fixture(),
    abort = new AbortController();
  const stream = readUnit(f.source, f.scope, f.item, f.scanApi, {
    ...options,
    signal: abort.signal,
  });
  await stream.next();
  abort.abort();
  await expect(stream.next()).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.calls).toHaveLength(1);
});
it('unsupported scopes and null persona bindings fail before any RPC', async () => {
  const f = await fixture();
  expect(() =>
    readUnit(f.source, { family: 'images', kind: 'scene' }, f.item, f.scanApi, options),
  ).toThrow(AdventureUnitError);
  expect(() =>
    readUnit(
      f.source,
      { family: 'personas', scope: 'adventure' },
      { id: f.id, personaId: null, itemToken: f.source.sourceToken },
      f.scanApi,
      options,
    ),
  ).toThrow(AdventureUnitError);
  for (const kind of ['__proto__', 'toString'])
    expect(() =>
      readUnit(f.source, { family: 'resources', kind, parentId: null }, f.item, f.scanApi, options),
    ).toThrow(AdventureUnitError);
  expect(f.calls).toHaveLength(0);
});

it('an explicit thrown consumer error closes the source without another range or proof', async () => {
  const f = await fixture(),
    stream = f.stream(),
    failure = Error('consumer stopped');
  await stream.next();
  await expect(stream.throw(failure)).rejects.toBe(failure);
  expect(f.calls).toHaveLength(1);
  expect((await stream.next()).value).toBeUndefined();
});
