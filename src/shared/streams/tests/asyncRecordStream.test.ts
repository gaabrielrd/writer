import { it, expect } from 'vitest';
import { asyncRecordStream } from '../index';
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
it('return resolves while the producer awaits a remote result and prevents every late write', async () => {
  const rpc = deferred<void>(),
    started = deferred<void>();
  let writes = 0;
  const stream = asyncRecordStream<string, number>(
    async (write) => {
      started.resolve();
      await rpc.promise;
      await write('late');
      writes++;
      return 1;
    },
    { check: () => {} },
  );
  const next = stream.next().catch((error: unknown) => error);
  await started.promise;
  expect(await stream.return(undefined)).toEqual({ done: true, value: undefined });
  expect(await next).toMatchObject({ name: 'AbortError' });
  rpc.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(writes).toBe(0);
});
it('throw closes a pending bridge immediately and observes the late producer failure', async () => {
  const rpc = deferred<void>(),
    started = deferred<void>(),
    failure = Error('consumer failed');
  const stream = asyncRecordStream<number, number>(
    async (write) => {
      started.resolve();
      await rpc.promise;
      await write(7);
      return 9;
    },
    { check: () => {} },
  );
  const pending = stream.next().catch((error: unknown) => error);
  await started.promise;
  await expect(stream.throw(failure)).rejects.toBe(failure);
  expect(await pending).toBe(failure);
  rpc.resolve();
  await Promise.resolve();
});
it('captures context and signal options before consumption without starting the producer', async () => {
  let called = 0;
  const controller = new AbortController(),
    settings = { check: () => {}, signal: controller.signal };
  const stream = asyncRecordStream<string, number>(async (write) => {
    called++;
    await write('original');
    return 42;
  }, settings);
  expect(called).toBe(0);
  settings.check = () => {
    throw Error('late check');
  };
  const other = new AbortController();
  other.abort();
  settings.signal = other.signal;
  expect(await stream.next()).toEqual({ done: false, value: 'original' });
  expect(await stream.next()).toEqual({ done: true, value: 42 });
});
it('return before next neither starts the producer nor manufactures a completion value', async () => {
  let called = 0;
  const stream = asyncRecordStream<string, number>(
    () => {
      called++;
      return Promise.resolve(42);
    },
    { check: () => {} },
  );
  expect(await stream.return(99)).toEqual({ done: true, value: undefined });
  expect(called).toBe(0);
  expect(await stream.next()).toEqual({ done: true, value: undefined });
});
it('an external abort releases a producer waiting on an acknowledged slot', async () => {
  const abort = new AbortController(),
    closed = deferred<void>();
  let after = false;
  const stream = asyncRecordStream<string, number>(
    async (write) => {
      try {
        await write('first');
        after = true;
        return 1;
      } finally {
        closed.resolve();
      }
    },
    { signal: abort.signal, check: () => {} },
  );
  await stream.next();
  abort.abort();
  await closed.promise;
  expect(after).toBe(false);
  await expect(stream.next()).rejects.toMatchObject({ name: 'AbortError' });
});

it.each([undefined, 'explicit stop'])(
  'preserves an explicit non-Error iterator throw reason: %s',
  async (reason) => {
    const stream = asyncRecordStream<string, number>(
      async (write) => {
        await write('first');
        return 1;
      },
      { check: () => {} },
    );
    await stream.next();
    try {
      await stream.throw(reason);
      expect.fail('must reject');
    } catch (actual) {
      expect(actual).toBe(reason);
    }
    expect(await stream.next()).toEqual({ done: true, value: undefined });
  },
);
