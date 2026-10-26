// @vitest-environment node
import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { imageDataFixture } from './adventureImageFixture.mjs';
import {
  streamAdventureCoreData,
  streamAdventureDraftData as stream,
  verifyAdventureDraftData as verify,
  AdventureDraftError,
} from '../index';
const guard = () => {},
  hash = (b) => createHash('sha256').update(b).digest('hex');
async function collect(output) {
  const records = [];
  for (;;) {
    const n = await output.next();
    if (n.done) return { records, proof: n.value };
    records.push(n.value);
  }
}
async function fixture(kind = 'scene', advance = false) {
  const f = await imageDataFixture(1, false),
    origin = {};
  if (advance)
    await f.scenes.updateScene('author', {
      target: f.target,
      sceneId: f.sceneId,
      operationId: 'draft-advance-before-backup-0001',
      expectedRevision: f.records.get(f.path + '/scenes/' + f.sceneId).revision,
      patch: { content: 'NEW_SAVED_TEXT' },
    });
  const id = kind === 'scene' ? f.sceneId : f.blockId;
  const core = await collect(
    streamAdventureCoreData(f.id, f.scanApi, {
      guard,
      onUnit: async (proof) => {
        if (proof.scope.family === 'resources' && proof.scope.kind === kind && proof.item.id === id)
          origin.head = proof;
        if (
          proof.scope.family === 'resources' &&
          proof.scope.kind === kind + '-body' &&
          proof.scope.parentId === id
        )
          origin.body = proof;
      },
    }),
  );
  expect(origin.head).toBeTruthy();
  expect(origin.body).toBeTruthy();
  const input = {
    adventureId: f.id,
    resource: { kind, id },
    content: 'PRIVATE_LOCAL_DRAFT 🌙',
    baseRevision: 1,
    savedAt: 1234,
  };
  return {
    ...f,
    origin,
    input,
    options: { guard, source: core.proof.inventory.source, origin },
    core,
  };
}
const json = (r) => JSON.parse(Buffer.from(r.payload));
for (const kind of ['scene', 'block'])
  it(
    'keeps the explicit ' + kind + ' draft separate from the saved manuscript and history',
    async () => {
      const f = await fixture(kind),
        before = structuredClone([...f.records]);
      const c = await collect(stream(f.id, f.input, f.scanApi, f.options));
      expect(c.proof).toMatchObject({
        validation: 'draft-data-only',
        count: 1,
        bytes: Buffer.byteLength(f.input.content),
      });
      const header = json(c.records[0]);
      expect(header).toMatchObject({
        schemaVersion: 1,
        resource: f.input.resource,
        baseRevision: 1,
        savedAt: 1234,
        current: { headHash: f.origin.head.contentHash, bodyHash: f.origin.body.contentHash },
      });
      expect(header.contentHash).toBe(hash(Buffer.from(f.input.content)));
      const text = Buffer.concat(
        c.records.filter((r) => r.kind === 'adventure-draft-text').map((r) => r.payload),
      );
      expect(text.toString()).toBe(f.input.content);
      expect(text.toString()).not.toBe(
        f.records.get(
          f.path +
            (kind === 'scene' ? '/scenes/' : '/sceneBlocks/') +
            f.input.resource.id +
            '/body/current',
        ).content,
      );
      expect(json(c.records.at(-1))).toMatchObject({
        count: 1,
        bytes: text.length,
        digest: c.proof.digest,
      });
      expect(JSON.stringify(header)).not.toMatch(
        /sourceToken|itemToken|ownerId|pending|provider|journal/,
      );
      await verify(c.proof, f.scanApi, { guard });
      expect([...f.records]).toEqual(before);
    },
  );
it('writes one explicit empty text part and preserves a stale local base revision as data', async () => {
  const f = await fixture('scene', true);
  f.input.content = '';
  expect(f.records.get(f.path + '/scenes/' + f.sceneId).revision).toBeGreaterThan(
    f.input.baseRevision,
  );
  const c = await collect(stream(f.id, f.input, f.scanApi, f.options));
  expect(c.proof.count).toBe(1);
  expect(c.proof.bytes).toBe(0);
  expect(c.records.filter((r) => r.kind === 'adventure-draft-text')).toHaveLength(1);
  expect(c.records.find((r) => r.kind === 'adventure-draft-text').payload.length).toBe(0);
  expect(json(c.records[0]).baseRevision).toBe(1);
});
it('an absent explicit draft closes an empty section without discovering local storage', async () => {
  const f = await fixture();
  const c = await collect(stream(f.id, null, f.scanApi, { ...f.options, origin: null }));
  expect(c.records.map((r) => r.kind)).toEqual(['adventure-drafts']);
  expect(c.proof).toMatchObject({ count: 0, bytes: 0, origin: null });
  await verify(c.proof, f.scanApi, { guard });
});
it('UTF-8 parts preserve large Unicode/BOM text, with bounded bytes and an independent digest', async () => {
  const f = await fixture();
  f.input.content = '\ufeff' + 'a'.repeat(65532) + '🌙' + 'privateé'.repeat(160000);
  const c = await collect(stream(f.id, f.input, f.scanApi, f.options));
  const header = json(c.records[0]),
    parts = c.records.filter((r) => r.kind === 'adventure-draft-text');
  for (const p of parts) {
    expect(p.payload.length).toBeLessThanOrEqual(65536);
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(p.payload)).not.toThrow();
  }
  const bytes = Buffer.concat(parts.map((r) => r.payload));
  expect(bytes.toString('utf8')).toBe(f.input.content);
  expect(header.contentHash).toBe(hash(bytes));
  expect(header.chunkCount).toBe(parts.length);
  const expected = createHash('sha256')
    .update('writer-adventure-drafts-v1\n')
    .update(
      JSON.stringify([
        'draft',
        c.records[0].id,
        hash(c.records[0].payload),
        bytes.length,
        parts.length,
        hash(bytes),
      ]) + '\n',
    )
    .digest('hex');
  expect(c.proof.digest).toBe(expected);
});
it('captures text/resource/options and the observer before the first await', async () => {
  const f = await fixture();
  const output = stream(f.id, f.input, f.scanApi, f.options);
  f.input.content = 'MUTATED';
  f.input.resource.id = 'other';
  f.options.origin = null;
  f.options.guard = () => {
    throw Error('late guard');
  };
  const c = await collect(output);
  expect(
    Buffer.concat(
      c.records.filter((r) => r.kind === 'adventure-draft-text').map((r) => r.payload),
    ).toString(),
  ).toBe('PRIVATE_LOCAL_DRAFT 🌙');
  let observed = 0;
  const settings = {
    guard,
    onUnit: async () => {
      observed++;
    },
  };
  const core = streamAdventureCoreData(f.id, f.scanApi, settings);
  settings.onUnit = async () => {
    throw Error('late observer');
  };
  await collect(core);
  expect(observed).toBeGreaterThan(2);
});
it('a different or malformed resource cannot reuse the selected origin', async () => {
  const f = await fixture();
  for (const mutate of [
    (x) => ({ ...x, adventureId: 'other' }),
    (x) => ({ ...x, resource: { kind: 'block', id: x.resource.id } }),
    (x) => ({ ...x, extra: 'pending' }),
    (x) => ({ ...x, baseRevision: 0 }),
  ])
    expect(() => stream(f.id, mutate(f.input), f.scanApi, f.options)).toThrow();
});
it('malformed Unicode cannot silently become replacement characters', async () => {
  const f = await fixture();
  f.input.content = 'bad\ud800';
  await expect(collect(stream(f.id, f.input, f.scanApi, f.options))).rejects.toBeInstanceOf(
    AdventureDraftError,
  );
});
it('a forged saved-body hash is refused before a draft header is emitted', async () => {
  const f = await fixture();
  const origin = { ...f.origin, body: { ...f.origin.body, contentHash: '0'.repeat(64) } };
  const output = stream(f.id, f.input, f.scanApi, { ...f.options, origin });
  await expect(output.next()).rejects.toBeInstanceOf(AdventureDraftError);
});
it('a changed saved resource invalidates the final verification', async () => {
  const f = await fixture(),
    c = await collect(stream(f.id, f.input, f.scanApi, f.options));
  await f.scenes.updateScene('author', {
    target: f.target,
    sceneId: f.sceneId,
    operationId: 'draft-file-changed-0001',
    expectedRevision: f.records.get(f.path + '/scenes/' + f.sceneId).revision,
    patch: { content: 'CHANGED_SAVED_TEXT' },
  });
  await expect(verify(c.proof, f.scanApi, { guard })).rejects.toBeTruthy();
});
it('an error from the central observer prevents a core proof and does not mutate saved data', async () => {
  const f = await imageDataFixture(1, false),
    before = structuredClone([...f.records]);
  await expect(
    collect(
      streamAdventureCoreData(f.id, f.scanApi, {
        guard,
        onUnit: async () => {
          throw Error('observer failed');
        },
      }),
    ),
  ).rejects.toThrow('observer failed');
  expect([...f.records]).toEqual(before);
});
it('return releases a held revalidation read without producing a draft or late proof', async () => {
  const f = await fixture();
  let enter, release;
  const started = new Promise((r) => {
      enter = r;
    }),
    held = new Promise((r) => {
      release = r;
    });
  f.intercept(async (method, input, run) => {
    if (method === 'readAdventureBackupResource') {
      enter();
      await held;
    }
    return run();
  });
  const output = stream(f.id, f.input, f.scanApi, f.options),
    pending = output.next().catch((e) => e);
  await started;
  expect(await output.return(undefined)).toEqual({ done: true, value: undefined });
  expect((await pending).name).toBe('AbortError');
  const calls = f.calls.length;
  release();
  await Promise.resolve();
  expect(f.calls).toHaveLength(calls);
});
it('an account switch after the header prevents any further draft text', async () => {
  const f = await fixture();
  let active = true;
  const output = stream(f.id, f.input, f.scanApi, {
    ...f.options,
    guard: () => {
      if (!active) throw Error('actor changed');
    },
  });
  await output.next();
  const calls = f.calls.length;
  active = false;
  await expect(output.next()).rejects.toThrow('actor changed');
  expect(f.calls).toHaveLength(calls);
});
