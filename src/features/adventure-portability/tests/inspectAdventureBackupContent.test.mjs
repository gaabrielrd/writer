// @vitest-environment node
import { it, expect, vi, beforeEach } from 'vitest';
import { imageDataFixture } from './adventureImageFixture.mjs';
import { inspectAdventureBackupContent, streamAdventureArchive } from '../index';
const control = vi.hoisted(() => ({ create: vi.fn(), dispose: vi.fn() }));
vi.mock('@/shared/validation', () => ({ createTemporaryValidationIndex: control.create }));
let bytes;
async function collect(output) {
  const all = [];
  for (;;) {
    const n = await output.next();
    if (n.done) return Buffer.concat(all);
    all.push(n.value);
  }
}
const input = () => ({ size: bytes.length, read: async (o, n) => bytes.subarray(o, o + n) });
function makeIndex() {
  const values = new Map();
  return {
    async get(key) {
      return structuredClone(values.get(JSON.stringify(key)));
    },
    async add(key, value) {
      const id = JSON.stringify(key);
      if (values.has(id)) throw Error('duplicate');
      values.set(id, structuredClone(value));
    },
    dispose: control.dispose,
  };
}
beforeEach(async () => {
  vi.clearAllMocks();
  control.dispose.mockResolvedValue(undefined);
  control.create.mockImplementation(() => Promise.resolve(makeIndex()));
  const f = await imageDataFixture(1, false);
  bytes = await collect(streamAdventureArchive(f.id, f.scanApi, { guard: () => {} }));
});
it('returns only an inert content report after disposing the adventure index', async () => {
  const report = await inspectAdventureBackupContent(input());
  expect(report.validation).toBe('content-only');
  expect(report.totals.resources.scene).toBe(1);
  expect(control.create).toHaveBeenCalledWith('writer-adventure-validation-v1', undefined);
  expect(control.dispose).toHaveBeenCalledTimes(1);
});
it('disposes after a source failure and preserves the original error', async () => {
  const failure = Error('source unavailable'),
    source = { size: bytes.length, read: () => Promise.reject(failure) };
  await expect(inspectAdventureBackupContent(source)).rejects.toBe(failure);
  expect(control.dispose).toHaveBeenCalledTimes(1);
});
it('a cleanup failure prevents a successful content report', async () => {
  const failure = Error('cleanup denied');
  control.dispose.mockRejectedValueOnce(failure);
  await expect(inspectAdventureBackupContent(input())).rejects.toBe(failure);
});
it('retains both primary and cleanup failures rather than masking either', async () => {
  const primary = Error('source denied'),
    cleanup = Error('remove denied');
  control.dispose.mockRejectedValueOnce(cleanup);
  await expect(
    inspectAdventureBackupContent({ size: bytes.length, read: () => Promise.reject(primary) }),
  ).rejects.toMatchObject({ errors: [primary, cleanup], cause: cleanup });
});
it('captures the source and signal before waiting for index initialization', async () => {
  let release;
  const held = new Promise((r) => {
    release = r;
  });
  control.create.mockImplementationOnce(async () => {
    await held;
    return makeIndex();
  });
  const source = input(),
    settings = { signal: new AbortController().signal },
    output = inspectAdventureBackupContent(source, settings);
  source.size = 0;
  source.read = () => Promise.reject(Error('late source'));
  const other = new AbortController();
  other.abort();
  settings.signal = other.signal;
  release();
  expect((await output).validation).toBe('content-only');
});
it('a preexisting abort avoids storage and an in-flight abort still disposes its index', async () => {
  const before = new AbortController();
  before.abort();
  await expect(
    inspectAdventureBackupContent(input(), { signal: before.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(control.create).not.toHaveBeenCalled();
  const active = new AbortController(),
    source = {
      size: bytes.length,
      async read(o, n) {
        active.abort();
        return bytes.subarray(o, o + n);
      },
    };
  await expect(
    inspectAdventureBackupContent(source, { signal: active.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(control.dispose).toHaveBeenCalledTimes(1);
});
it('failed initialization propagates without claiming ownership of an index that was never returned', async () => {
  const failure = Error('OPFS unavailable');
  control.create.mockRejectedValueOnce(failure);
  await expect(inspectAdventureBackupContent(input())).rejects.toBe(failure);
  expect(control.dispose).not.toHaveBeenCalled();
});
