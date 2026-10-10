import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  acceptBookAsset,
  discardBookAsset,
  generateBookAsset,
  quoteBookGeneration,
} from '../services/bookGenerationService';
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => ({}) }));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(() => ({})), httpsCallable: vi.fn() }));
const context = { title: 'Atlas', genre: 'Fantasia', synopsis: 'Um mapa.' };
describe('book generation client', () => {
  beforeEach(() => vi.clearAllMocks());
  it('uses authenticated callable contracts for quote, generation, acceptance and discard', async () => {
    const callable = vi
      .fn()
      .mockResolvedValue({ data: { id: 'request-1', synopsis: 1, cover: 5 } });
    vi.mocked(httpsCallable).mockReturnValue(Object.assign(callable, { stream: vi.fn() }));
    await quoteBookGeneration();
    expect(httpsCallable).toHaveBeenLastCalledWith(expect.anything(), 'bookGenerationQuote', {
      timeout: 120000,
    });
    await generateBookAsset(context, 'cover', 'request-1');
    expect(callable).toHaveBeenLastCalledWith({
      ...context,
      kind: 'cover',
      requestId: 'request-1',
    });
    await acceptBookAsset('request-1');
    expect(httpsCallable).toHaveBeenLastCalledWith(expect.anything(), 'acceptBookAsset', {
      timeout: 120000,
    });
    await discardBookAsset('request-1');
    expect(callable).toHaveBeenLastCalledWith({ id: 'request-1' });
    expect(getFunctions).toHaveBeenCalledWith(expect.anything(), 'us-central1');
  });
  it.each(['functions/resource-exhausted', 'functions/failed-precondition', 'functions/not-found'])(
    'preserves actionable backend failures (%s)',
    async (code) => {
      vi.mocked(httpsCallable).mockReturnValue(
        Object.assign(
          vi.fn().mockRejectedValue(Object.assign(new Error('Saldo insuficiente'), { code })),
          { stream: vi.fn() },
        ),
      );
      await expect(acceptBookAsset('request-1')).rejects.toThrow('Saldo insuficiente');
    },
  );
  it('turns infrastructure failures into a manual fallback message', async () => {
    vi.mocked(httpsCallable).mockReturnValue(
      Object.assign(vi.fn().mockRejectedValue(new Error('network')), { stream: vi.fn() }),
    );
    await expect(generateBookAsset(context, 'synopsis', 'request-1')).rejects.toThrow(
      'continue preenchendo manualmente',
    );
  });
});
