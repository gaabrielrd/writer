import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const instances: FakeChannel[] = [];
class FakeChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  close = vi.fn();
  postMessage = vi.fn();
  name: string;
  constructor(name: string) {
    this.name = name;
    instances.push(this);
  }
}
function currentChannel(): FakeChannel {
  const channel = instances.at(0);
  if (!channel) throw new Error('Expected a channel to be created.');
  return channel;
}
let api: typeof import('../invalidationPulse');
const first = { actorId: 'reader', scope: 'resource-a' };
beforeEach(async () => {
  vi.resetModules();
  instances.length = 0;
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  api = await import('../invalidationPulse');
});
afterEach(() => vi.unstubAllGlobals());

it('invalidates only the matching presentation and unsubscribes independently', () => {
  const observed: number[] = [];
  const stop = api.subscribeInvalidation(first, () =>
    observed.push(api.getInvalidationGeneration(first)),
  );
  const other = vi.fn();
  const stopOther = api.subscribeInvalidation({ ...first, actorId: 'another' }, other);
  expect(api.getInvalidationGeneration(first)).toBe(0);
  api.publishInvalidation(first);
  expect(observed).toEqual([1]);
  expect(other).not.toHaveBeenCalled();
  expect(currentChannel().postMessage).toHaveBeenCalledWith(first);
  stop();
  stop();
  expect(currentChannel().close).not.toHaveBeenCalled();
  api.publishInvalidation(first);
  expect(observed).toEqual([1]);
  stopOther();
  expect(currentChannel().close).toHaveBeenCalledOnce();
});

it('accepts remote opaque hints without rebroadcasting or accepting extra data', () => {
  const listener = vi.fn();
  const stop = api.subscribeInvalidation(first, listener);
  const send = (data: unknown) => currentChannel().onmessage?.({ data } as MessageEvent<unknown>);
  send({ ...first, proof: 'not-an-authority' });
  send({ ...first, actorId: 'another' });
  send({ ...first, scope: 'other' });
  send(null);
  send([]);
  send({ actorId: '', scope: 'resource-a' });
  expect(listener).not.toHaveBeenCalled();
  send(first);
  expect(listener).toHaveBeenCalledOnce();
  expect(api.getInvalidationGeneration(first)).toBe(1);
  expect(currentChannel().postMessage).not.toHaveBeenCalled();
  stop();
});

it('preserves local invalidation when the channel is unavailable or fails', () => {
  vi.stubGlobal('BroadcastChannel', undefined);
  const listener = vi.fn();
  const stop = api.subscribeInvalidation(first, listener);
  api.publishInvalidation(first);
  expect(listener).toHaveBeenCalledOnce();
  stop();
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      constructor() {
        throw new Error('Unavailable');
      }
    },
  );
  api.publishInvalidation(first);
  expect(api.getInvalidationGeneration(first)).toBe(2);
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  const stopAgain = api.subscribeInvalidation(first, listener);
  currentChannel().postMessage.mockImplementation(() => {
    throw new Error('Transport closed');
  });
  api.publishInvalidation(first);
  expect(listener).toHaveBeenCalledTimes(2);
  expect(api.getInvalidationGeneration(first)).toBe(3);
  stopAgain();
});

it('closes a one-shot sender and rejects malformed local scopes', () => {
  api.publishInvalidation(first);
  expect(currentChannel().close).toHaveBeenCalledOnce();
  expect(() => api.publishInvalidation({ ...first, actorId: '' })).toThrow(/Escopo/);
  expect(() => api.getInvalidationGeneration({ ...first, scope: 'x'.repeat(1025) })).toThrow(
    /Escopo/,
  );
  expect(api.getInvalidationGeneration(first)).toBe(1);
});
