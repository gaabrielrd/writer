import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeChapterLore,
  prepareBYOKLore,
  applyLoreAnalysis,
} from '../services/loreAnalysisService';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => invoke),
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => ({}) }));
beforeEach(() => vi.resetAllMocks());
describe('lore callable boundary', () => {
  it('sends platform and BYOK requests and keeps batch identity during apply', async () => {
    invoke.mockResolvedValue({ data: { id: 'batch', provider: 'platform', entities: [] } });
    const request = {
      bookId: 'b',
      chapterId: 'c',
      requestId: 'batch',
      text: 'texto',
      content: '<p>texto</p>',
      loreVersions: [],
    };
    expect(await analyzeChapterLore(request)).toEqual({
      id: 'batch',
      provider: 'platform',
      entities: [],
    });
    expect(invoke).toHaveBeenLastCalledWith(request);
    await prepareBYOKLore(request, []);
    expect(invoke).toHaveBeenLastCalledWith({ ...request, entities: [] });
    invoke.mockResolvedValue({ data: { credits: 4, applied: 1 } });
    expect(
      await applyLoreAnalysis('batch', 'texto', [{ scope: 'local', input: { name: 'A' } }]),
    ).toEqual({ credits: 4, applied: 1 });
  });
  it('preserves callable errors for definitive rejection versus uncertain network retry', async () => {
    const cause = Object.assign(new Error('Saldo insuficiente'), {
      code: 'functions/resource-exhausted',
    });
    invoke.mockRejectedValue(cause);
    await expect(applyLoreAnalysis('batch', 'texto', [])).rejects.toMatchObject({
      message: 'Saldo insuficiente',
      cause,
    });
    invoke.mockRejectedValue(null);
    await expect(applyLoreAnalysis('batch', 'texto', [])).rejects.toThrow('Não foi possível');
  });
});
