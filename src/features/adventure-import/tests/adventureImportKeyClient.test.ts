import { beforeEach, expect, it, vi, type Mock } from 'vitest';
import { getAdventureImportRecoveryKey } from '../services/adventureImportKeyClient';
type KeyTestState = {
  auth: { currentUser: { uid: string; getIdToken: () => Promise<string> } | null };
  appCheck: object | null;
  getToken: Mock<() => Promise<{ token: string }>>;
  fetch: Mock<typeof fetch>;
};
const state = vi.hoisted((): KeyTestState => ({
  auth: { currentUser: { uid: 'owner', getIdToken: vi.fn() } },
  appCheck: {},
  getToken: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@/shared/lib', () => ({
  auth: state.auth,
  get appCheck() {
    return state.appCheck;
  },
}));
vi.mock('firebase/app-check', () => ({ getToken: state.getToken }));
const input = {
    importId: 'ImportFixture0001',
    jobToken: 'a'.repeat(64),
    reviewHash: 'b'.repeat(64),
  },
  key = {
    schemaVersion: 1,
    ownerId: 'owner',
    importId: input.importId,
    jobToken: input.jobToken,
    adventureId: 'c'.repeat(64),
    reviewHash: input.reviewHash,
    keyId: 'd'.repeat(64),
    algorithm: 'AES-GCM',
    keyBase64: btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i))),
  };
beforeEach(() => {
  vi.resetAllMocks();
  state.auth.currentUser = { uid: 'owner', getIdToken: vi.fn().mockResolvedValue('id-token') };
  state.appCheck = {};
  state.getToken.mockResolvedValue({ token: 'app-token' });
  state.fetch.mockResolvedValue(
    new Response(JSON.stringify({ data: key }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', state.fetch);
});
it('entrega chave somente pelo POST privado sem cache ou redirect', async () => {
  expect(await getAdventureImportRecoveryKey(input)).toEqual(key);
  expect(state.fetch).toHaveBeenCalledWith('/api/adventure-import/recovery-key', {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      Authorization: 'Bearer id-token',
      'X-Firebase-AppCheck': 'app-token',
    },
    body: JSON.stringify(input),
  });
});
it.each([null, {}])('bloqueia ausência de sessão/AppCheck sem enviar', async (value) => {
  if (value === null) state.auth.currentUser = null;
  else state.appCheck = null;
  await expect(getAdventureImportRecoveryKey(input)).rejects.toThrow(/sessão/);
  expect(state.fetch).not.toHaveBeenCalled();
});
it('confere UID depois do ID token e impede enviar como outra conta', async () => {
  await Promise.resolve();
  state.auth.currentUser!.getIdToken = async () => {
    await Promise.resolve();
    state.auth.currentUser = { uid: 'other', getIdToken: () => Promise.resolve('') };
    return 'old';
  };
  await expect(getAdventureImportRecoveryKey(input)).rejects.toThrow();
  expect(state.fetch).not.toHaveBeenCalled();
});
it('confere UID depois de AppCheck e não envia token antigo', async () => {
  await Promise.resolve();
  state.getToken.mockImplementationOnce(async () => {
    await Promise.resolve();
    state.auth.currentUser = null;
    return { token: 'old' };
  });
  await expect(getAdventureImportRecoveryKey(input)).rejects.toThrow();
  expect(state.fetch).not.toHaveBeenCalled();
});
it('descarta fallback HTML e resposta de conta tardia', async () => {
  await Promise.resolve();
  state.fetch.mockResolvedValueOnce(
    new Response('<html>SPA</html>', { headers: { 'content-type': 'text/html' } }),
  );
  await expect(getAdventureImportRecoveryKey(input)).rejects.toThrow();
  state.fetch.mockImplementationOnce(async () => {
    await Promise.resolve();
    state.auth.currentUser = null;
    return new Response(JSON.stringify({ data: key }), {
      headers: { 'content-type': 'application/json' },
    });
  });
  await expect(getAdventureImportRecoveryKey(input)).rejects.toThrow();
});
it('preserva código/reason de erro HTTP e nunca ecoa mensagem sensível', async () => {
  await Promise.resolve();
  state.fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        error: {
          code: 'failed-precondition',
          message: 'raw-key-secret',
          details: { reason: 'key-mismatch' },
        },
      }),
      { status: 412, headers: { 'content-type': 'application/json' } },
    ),
  );
  await expect(getAdventureImportRecoveryKey(input)).rejects.toMatchObject({
    code: 'failed-precondition',
    details: { reason: 'key-mismatch' },
    message: 'Não foi possível autorizar a cópia protegida. Seus dados foram mantidos.',
  });
});
it.each([
  { ...key, keyBase64: 'AA==' },
  { ...key, reviewHash: 'e'.repeat(64) },
  { ...key, keyId: 'e'.repeat(64) },
  { ...key, ownerId: 'other' },
  { ...key, secret: 'raw' },
])('rejeita DTO chave divergente ou aberto %#', async (invalid) => {
  state.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ data: invalid }), {
      headers: { 'content-type': 'application/json' },
    }),
  );
  await expect(
    getAdventureImportRecoveryKey({ ...input, expectedKeyId: key.keyId }),
  ).rejects.toThrow();
});
