import { beforeEach, expect, it, vi } from 'vitest';
import { adventureDeletionTransport as rpc } from '../services/adventureDeletionTransport';
import { adventureId, start, step } from './fixtures';
const sdk = vi.hoisted(() => ({
  app: { name: 'test' },
  functions: {},
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
  request: vi.fn<(name: string, input: unknown) => Promise<{ data: unknown }>>(),
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => sdk.app }));
vi.mock('firebase/functions', () => ({
  getFunctions: sdk.getFunctions,
  httpsCallable: sdk.httpsCallable,
}));
beforeEach(() => {
  vi.resetAllMocks();
  sdk.getFunctions.mockReturnValue(sdk.functions);
  sdk.httpsCallable.mockImplementation(
    (_client: unknown, name: string) => (input: unknown) => sdk.request(name, input),
  );
});
it('encaminha somente os seis comandos próprios com região, timeout e pedido exato', async () => {
  const response = { untouched: true };
  sdk.request.mockResolvedValue({ data: response });
  expect(await rpc.getSource({ adventureId })).toBe(response);
  expect(await rpc.start(Object.freeze(start.input))).toBe(response);
  expect(await rpc.resolveStart({ ...start.input, intent: 'cancel' })).toBe(response);
  expect(await rpc.get({ adventureId })).toBe(response);
  expect(await rpc.list({ cursor: 'opaque_page', limit: 25 })).toBe(response);
  expect(await rpc.advance(Object.freeze(step.input))).toBe(response);
  expect(sdk.request.mock.calls).toEqual([
    ['getAdventureDeletionSource', { adventureId }],
    ['startAdventureDeletion', start.input],
    ['resolveAdventureDeletionStart', { ...start.input, intent: 'cancel' }],
    ['getAdventureDeletion', { adventureId }],
    ['listAdventureDeletions', { cursor: 'opaque_page', limit: 25 }],
    ['advanceAdventureDeletion', step.input],
  ]);
  expect(sdk.getFunctions.mock.calls).toEqual(
    Array.from({ length: 6 }, () => [sdk.app, 'us-central1']),
  );
  expect(sdk.httpsCallable.mock.calls).toEqual(
    sdk.request.mock.calls.map(([name]) => [sdk.functions, name, { timeout: 120_000 }]),
  );
});
it('falha de transporte mantém erro e payload originais, sem tentar resolver ou repetir automaticamente', async () => {
  const error = Object.assign(new Error('Lost ACK'), { code: 'functions/unavailable' });
  sdk.request.mockRejectedValueOnce(error);
  await expect(rpc.start(start.input)).rejects.toBe(error);
  expect(sdk.request).toHaveBeenCalledOnce();
  expect(sdk.request.mock.calls[0]).toEqual(['startAdventureDeletion', start.input]);
});
