import { beforeEach, expect, it, vi } from 'vitest';
import * as calls from '../services/campaignPreparationCallables';
const sdk = vi.hoisted(() => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
  invoke: vi.fn(),
  getFirebaseApp: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: sdk.getFunctions,
  httpsCallable: sdk.httpsCallable,
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: sdk.getFirebaseApp }));
beforeEach(() => {
  vi.clearAllMocks();
  sdk.getFirebaseApp.mockReturnValue('app');
  sdk.getFunctions.mockReturnValue('functions');
  sdk.httpsCallable.mockReturnValue(sdk.invoke);
  sdk.invoke.mockResolvedValue({ data: { ok: true } });
});
it.each(Object.keys(calls) as (keyof typeof calls)[])(
  'chama %s pelo SDK e devolve data',
  async (name) => {
    const input = { campaignId: 'campaign' };
    const call = calls[name] as (v: unknown) => Promise<unknown>;
    expect(await call(input)).toEqual({ ok: true });
    expect(sdk.getFunctions).toHaveBeenCalledWith('app', 'us-central1');
    expect(sdk.httpsCallable).toHaveBeenCalledWith('functions', name);
    expect(sdk.invoke).toHaveBeenCalledWith(input);
  },
);
