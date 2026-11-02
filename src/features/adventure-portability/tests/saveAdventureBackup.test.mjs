// @vitest-environment node
import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ factory: vi.fn() }));
vi.mock('../services/streamAdventureArchive', () => ({
  streamAdventureArchive: (...a) => m.factory(...a),
}));
import { saveAdventureBackup } from '../services/saveAdventureBackup.ts';
const proof = {
  validation: 'captured-data-only',
  capture: { validation: 'captured-data-only' },
  seal: { records: 2, payloadBytes: 3, chainHash: 'a'.repeat(64) },
};
const sink = () => ({
  write: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  abort: vi.fn(async () => {}),
});
let stream;
beforeEach(() => {
  vi.clearAllMocks();
  let at = 0;
  stream = {
    next: vi.fn(async () =>
      at++ === 0 ? { done: false, value: new Uint8Array([1, 2, 3]) } : { done: true, value: proof },
    ),
    return: vi.fn(async () => ({ done: true })),
  };
  m.factory.mockReturnValue(stream);
});
it('constructs capture before destination resolves, writes sequentially and confirms only complete proof then close', async () => {
  const target = sink();
  let release;
  const destination = new Promise((r) => {
    release = r;
  });
  const p = saveAdventureBackup('adventure', {}, { guard: () => {} }, destination);
  expect(m.factory).toHaveBeenCalledTimes(1);
  expect(stream.next).not.toHaveBeenCalled();
  release(target);
  expect(await p).toEqual(proof);
  expect(target.write).toHaveBeenCalledExactlyOnceWith(new Uint8Array([1, 2, 3]));
  expect(target.close).toHaveBeenCalledTimes(1);
  expect(target.abort).not.toHaveBeenCalled();
});
it.each([
  undefined,
  { ...proof, seal: { ...proof.seal, chainHash: 'bad' } },
  { ...proof, seal: { ...proof.seal, records: 0 } },
  { ...proof, validation: 'envelope-only' },
])('incomplete proof never closes the destination %#', async (value) => {
  stream.next.mockResolvedValueOnce({ done: true, value });
  const target = sink();
  await expect(saveAdventureBackup('adventure', {}, { guard: () => {} }, target)).rejects.toThrow();
  expect(target.close).not.toHaveBeenCalled();
  expect(target.abort).toHaveBeenCalledTimes(1);
});
it('write failure closes producer and aborts destination without retry or success', async () => {
  const error = Error('Disk full'),
    target = sink();
  target.write.mockRejectedValue(error);
  await expect(saveAdventureBackup('adventure', {}, { guard: () => {} }, target)).rejects.toBe(
    error,
  );
  expect(stream.return).toHaveBeenCalledExactlyOnceWith(undefined);
  expect(target.abort).toHaveBeenCalledExactlyOnceWith(error);
  expect(target.close).not.toHaveBeenCalled();
  expect(target.write).toHaveBeenCalledTimes(1);
});
it('producer failure aborts the partial file and preserves original failure', async () => {
  const error = Error('Source changed'),
    target = sink();
  stream.next.mockRejectedValue(error);
  await expect(saveAdventureBackup('adventure', {}, { guard: () => {} }, target)).rejects.toBe(
    error,
  );
  expect(target.abort).toHaveBeenCalledWith(error);
  expect(target.close).not.toHaveBeenCalled();
});
it('aggregates original failure and both cleanup failures', async () => {
  const original = Error('Write'),
    producer = Error('Producer cleanup'),
    file = Error('File cleanup'),
    target = sink();
  target.write.mockRejectedValue(original);
  stream.return.mockRejectedValue(producer);
  target.abort.mockRejectedValue(file);
  const error = await saveAdventureBackup('adventure', {}, { guard: () => {} }, target).catch(
    (e) => e,
  );
  expect(error).toBeInstanceOf(AggregateError);
  expect(error.errors).toEqual([original, producer, file]);
  expect(error.cause).toBe(original);
});
it('guard and signal are captured before destination await, preserving original scope checks', async () => {
  let release,
    alive = true;
  const target = sink(),
    options = {
      guard() {
        if (!alive) throw Error('Expired');
      },
    };
  const p = saveAdventureBackup(
    'adventure',
    {},
    options,
    new Promise((r) => {
      release = r;
    }),
  );
  options.guard = () => {};
  alive = false;
  release(target);
  await expect(p).rejects.toThrow('Expired');
  expect(stream.next).not.toHaveBeenCalled();
  expect(target.close).not.toHaveBeenCalled();
  expect(target.abort).toHaveBeenCalledTimes(1);
});
it('abort after current write prevents next source unit and close', async () => {
  const c = new AbortController(),
    target = sink();
  target.write.mockImplementation(async () => c.abort());
  await expect(
    saveAdventureBackup('adventure', {}, { guard: () => {}, signal: c.signal }, target),
  ).rejects.toThrow();
  expect(stream.next).toHaveBeenCalledTimes(1);
  expect(stream.return).toHaveBeenCalledTimes(1);
  expect(target.close).not.toHaveBeenCalled();
});
it('destination rejection closes producer without touching a file', async () => {
  const error = Error('Chooser canceled');
  await expect(
    saveAdventureBackup('adventure', {}, { guard: () => {} }, Promise.reject(error)),
  ).rejects.toBe(error);
  expect(stream.return).toHaveBeenCalledTimes(1);
  expect(stream.next).not.toHaveBeenCalled();
});
it('close failure or guard loss after close never returns a saved receipt', async () => {
  const target = sink(),
    failure = Error('Close');
  target.close.mockRejectedValueOnce(failure);
  await expect(saveAdventureBackup('adventure', {}, { guard: () => {} }, target)).rejects.toBe(
    failure,
  );
  expect(target.abort).toHaveBeenCalledWith(failure);
  let alive = true;
  target.close.mockImplementation(async () => {
    alive = false;
  });
  await expect(
    saveAdventureBackup(
      'adventure',
      {},
      {
        guard() {
          if (!alive) throw Error('Expired');
        },
      },
      target,
    ),
  ).rejects.toThrow('Expired');
});
