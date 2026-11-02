// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { recordCaptureStream } from '../services/recordCaptureStream';
const record = { kind: 'chapter', id: 'chapter', part: 0, payload: new Uint8Array([1]) };
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
it('holds exactly one pending record and acknowledges only when consumption resumes', async () => {
  const steps: string[] = [];
  const stream = recordCaptureStream(
    async (write) => {
      steps.push('first');
      await write(record);
      steps.push('second');
      await write({ ...record, part: 1 });
      steps.push('done');
      return 42;
    },
    { check: () => undefined },
  );
  expect(await stream.next()).toMatchObject({ done: false, value: record });
  await tick();
  expect(steps).toEqual(['first']);
  expect(await stream.next()).toMatchObject({ done: false, value: { part: 1 } });
  await tick();
  expect(steps).toEqual(['first', 'second']);
  expect(await stream.next()).toEqual({ done: true, value: 42 });
  expect(steps).toEqual(['first', 'second', 'done']);
});
it('early consumer return rejects the producer acknowledgement and prevents further writes', async () => {
  const finallyCalled = vi.fn(),
    after = vi.fn();
  const stream = recordCaptureStream(
    async (write, signal) => {
      try {
        await write(record);
        after();
        await write(record);
      } finally {
        expect(signal.aborted).toBe(true);
        finallyCalled();
      }
    },
    { check: () => undefined },
  );
  await stream.next();
  await stream.return(undefined);
  await tick();
  expect(after).not.toHaveBeenCalled();
  expect(finallyCalled).toHaveBeenCalledOnce();
});
it('aborts pending consumption without waiting for an unabortable RPC and observes its late failure', async () => {
  const rpc = deferred<void>(),
    started = deferred<void>(),
    controller = new AbortController(),
    after = vi.fn();
  const stream = recordCaptureStream(
    async (write) => {
      started.resolve();
      await rpc.promise;
      await write(record);
      after();
    },
    { signal: controller.signal, check: () => undefined },
  );
  const pending = stream.next();
  await started.promise;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  rpc.resolve();
  await tick();
  expect(after).not.toHaveBeenCalled();
});
it('propagates producer failures including undefined without treating them as completion', async () => {
  for (const error of [new Error('lost'), undefined]) {
    const stream = recordCaptureStream(
      async () => {
        await Promise.resolve();
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- Exercise non-Error producer failures.
        throw error;
      },
      { check: () => undefined },
    );
    try {
      await stream.next();
      expect.fail('must reject');
    } catch (actual) {
      expect(actual).toBe(error);
    }
  }
});
it('rejects a producer that writes concurrently and drains no unacknowledged second slot', async () => {
  const stream = recordCaptureStream(
    async (write) => {
      await Promise.all([write(record), write(record)]);
    },
    { check: () => undefined },
  );
  await expect(stream.next()).resolves.toMatchObject({ done: false });
  await expect(stream.next()).rejects.toThrow('não aguardou');
});
