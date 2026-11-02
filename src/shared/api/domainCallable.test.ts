// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type { Functions, httpsCallable } from 'firebase/functions';
import { createCallableRouter } from './domainCallable';
import {
  FUNCTION_DOMAINS,
  FUNCTION_ROUTES,
  STREAMING_FUNCTIONS,
} from '../../../functions/src/functionDomains.mjs';
const configured = vi.hoisted(() => ({ invoke: vi.fn(), sdk: vi.fn() }));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: configured.sdk.mockImplementation(() =>
    Object.assign(configured.invoke, { stream: vi.fn() }),
  ),
}));

it('routes all 306 actions with original payload, timeout and response through the real product table', async () => {
  const invoke = vi.fn().mockResolvedValue({ data: { accepted: true } });
  const sdk = vi.fn(() => Object.assign(invoke, { stream: vi.fn() }));
  const route = createCallableRouter(
    FUNCTION_ROUTES,
    STREAMING_FUNCTIONS,
    sdk as typeof httpsCallable,
  );
  const functions = {} as Functions,
    options = { timeout: 600000 };
  for (const [action, endpoint] of Object.entries(FUNCTION_ROUTES)) {
    invoke.mockClear();
    const payload = { operationId: 'same-operation', target: { id: 'private' } };
    expect(await route(functions, action, options)(payload)).toEqual({ data: { accepted: true } });
    expect(sdk).toHaveBeenLastCalledWith(functions, endpoint, options);
    expect(invoke).toHaveBeenCalledExactlyOnceWith({ version: 1, action, payload });
    expect((invoke.mock.calls[0]?.[0] as { payload: unknown }).payload).toBe(payload);
    expect(FUNCTION_DOMAINS[endpoint]?.actions).toHaveProperty(action);
  }
});

it('keeps streaming callables and abort options unchanged', async () => {
  const stream = vi.fn().mockResolvedValue({ data: Promise.resolve('done'), stream: [] });
  const call = Object.assign(vi.fn(), { stream });
  const sdk = vi.fn(() => call);
  const route = createCallableRouter(
    FUNCTION_ROUTES,
    STREAMING_FUNCTIONS,
    sdk as typeof httpsCallable,
  );
  const signal = new AbortController().signal,
    payload = { text: 'private' };
  for (const name of STREAMING_FUNCTIONS) {
    const result = route({} as Functions, name, { timeout: 120000 });
    expect(result).toBe(call);
    await result.stream(payload, { signal });
    expect(stream).toHaveBeenLastCalledWith(payload, { signal });
  }
});

it('preserves uncertain failure identity without retry or fallback to a removed endpoint', async () => {
  const error = Object.assign(new Error('lost response'), { code: 'functions/unavailable' });
  const invoke = vi.fn().mockRejectedValue(error),
    sdk = vi.fn(() => Object.assign(invoke, { stream: vi.fn() }));
  const route = createCallableRouter(
    FUNCTION_ROUTES,
    STREAMING_FUNCTIONS,
    sdk as typeof httpsCallable,
  );
  await expect(
    route({} as Functions, 'createWorkVersion')({ operationId: 'same-id' }),
  ).rejects.toBe(error);
  expect(sdk).toHaveBeenCalledExactlyOnceWith({}, 'workApi', undefined);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('rejects unregistered and inherited method names before any SDK request', () => {
  const sdk = vi.fn();
  const route = createCallableRouter(
    FUNCTION_ROUTES,
    STREAMING_FUNCTIONS,
    sdk as typeof httpsCallable,
  );
  for (const name of ['__proto__', 'constructor', 'unknown', 'workApi'])
    expect(() => route({} as Functions, name)).toThrow('não registrada');
  expect(sdk).not.toHaveBeenCalled();
});

it('app composition installs strict routing before features issue requests', async () => {
  await import('../../app/configureFunctionRouting');
  const { httpsDomainCallable } = await import('./domainCallable');
  configured.invoke.mockResolvedValue({ data: 'ok' });
  await expect(
    httpsDomainCallable({} as Functions, 'saveUniverseLore')({ operationId: 'same' }),
  ).resolves.toEqual({ data: 'ok' });
  expect(configured.sdk).toHaveBeenLastCalledWith({}, 'loreApi', undefined);
  expect(configured.invoke).toHaveBeenLastCalledWith({
    version: 1,
    action: 'saveUniverseLore',
    payload: { operationId: 'same' },
  });
  expect(() => httpsDomainCallable({} as Functions, 'unknown')).toThrow('não registrada');
});
