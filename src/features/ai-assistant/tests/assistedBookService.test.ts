import { saveBYOKConfig } from '../services/byokStorage';
import type { AssistedRequest } from '../model/assistedBook';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  AssistedBookError,
  commitAssistedBook,
  loadAssistedBook,
  requestAssistedBook,
} from '../services/assistedBookService';
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn(), functions: vi.fn() }));
vi.mock('firebase/functions', () => ({
  getFunctions: mocks.functions,
  httpsCallable: mocks.callable,
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => ({}) }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.callable.mockReturnValue(mocks.call);
  mocks.call.mockResolvedValue({ data: { session: null } });
});
it('uses the authenticated callable for loading, mutations and explicit commit', async () => {
  await loadAssistedBook();
  await requestAssistedBook({
    action: 'start',
    sessionId: 'id',
    requestId: 'op',
    revision: 0,
    idea: 'Ideia',
  });
  await commitAssistedBook({
    sessionId: 'id',
    revision: 1,
    proposal: { title: 'Atlas', genre: 'Fantasia', synopsis: '', coverDirection: '', entities: [] },
    coverId: null,
    imageId: null,
    expectedCost: 2,
  });
  expect(mocks.callable).toHaveBeenCalledWith(undefined, 'assistedBook', { timeout: 120000 });
  expect(mocks.call).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'commit', expectedCost: 2 }),
  );
});
it('distinguishes definitive rejections from uncertain network responses', async () => {
  mocks.call.mockRejectedValueOnce({ code: 'functions/invalid-argument' });
  await expect(loadAssistedBook()).rejects.toMatchObject({ uncertain: false });
  mocks.call.mockRejectedValueOnce(new Error('offline'));
  await expect(loadAssistedBook()).rejects.toMatchObject({ uncertain: true });
  expect(new AssistedBookError('Insuficiente', 'functions/resource-exhausted').uncertain).toBe(
    false,
  );
});

it('retry envia o snapshot público original mesmo após mudar preferências locais', async () => {
  saveBYOKConfig({
    provider: 'firebase_ai',
    platformModel: 'gemini-4-argon',
    platformReasoning: 'high',
    geminiApiKey: 'private-test',
  });
  const data: AssistedRequest = {
    action: 'generate',
    sessionId: 'id',
    requestId: 'retry',
    revision: 0,
    brief: 'Ideia',
  };
  mocks.call.mockRejectedValueOnce(new Error('offline'));
  await expect(requestAssistedBook(data)).rejects.toThrow('offline');
  const first = structuredClone(mocks.call.mock.calls.at(-1)![0]) as AssistedRequest;
  saveBYOKConfig({ provider: 'firebase_ai', platformModel: 'gemini-3.8-flash' });
  await requestAssistedBook(data);
  expect(mocks.call).toHaveBeenLastCalledWith(first);
  expect(first.generation).toMatchObject({ model: 'gemini-4-argon', reasoning: 'high' });
  expect(JSON.stringify(first)).not.toContain('private-test');
});

it('preserves a native context-revocation reason separately from other definitive failures', async () => {
  mocks.call.mockRejectedValueOnce({
    code: 'functions/failed-precondition',
    details: { reason: 'creation-context-changed' },
  });
  await expect(loadAssistedBook()).rejects.toMatchObject({
    uncertain: false,
    contextUnavailable: true,
  });
  expect(
    new AssistedBookError('Preço mudou', 'functions/failed-precondition').contextUnavailable,
  ).toBe(false);
});
