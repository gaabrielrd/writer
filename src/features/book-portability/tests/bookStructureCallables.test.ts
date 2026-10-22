import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const data = { sentinel: true };
  const invoke = vi.fn<(input: unknown) => Promise<{ data: typeof data }>>(() =>
    Promise.resolve({ data }),
  );
  return {
    data,
    invoke,
    getFirebaseApp: vi.fn(() => 'app'),
    getFunctions: vi.fn(() => 'functions'),
    httpsCallable: vi.fn(() => invoke),
  };
});
vi.mock('firebase/functions', () => ({
  getFunctions: mocks.getFunctions,
  httpsCallable: mocks.httpsCallable,
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: mocks.getFirebaseApp }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
it('importar leitor não inicializa Firebase; getter usa região/callable e preserva resposta', async () => {
  const { bookStructureApi } = await import('../services/bookStructureCallables');
  expect(mocks.getFirebaseApp).not.toHaveBeenCalled();
  expect(mocks.getFunctions).not.toHaveBeenCalled();
  expect(mocks.httpsCallable).not.toHaveBeenCalled();
  const input = { bookId: 'book' };
  expect(await bookStructureApi.getSource(input)).toBe(mocks.data);
  expect(mocks.getFunctions).toHaveBeenCalledExactlyOnceWith('app', 'us-central1');
  expect(mocks.httpsCallable).toHaveBeenCalledExactlyOnceWith('functions', 'getBookBackupSource');
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(input);
});
it('lista e corpo encaminham tokens/índices ao método correto sem modificar o pedido', async () => {
  const { bookStructureApi } = await import('../services/bookStructureCallables');
  const page = {
    bookId: 'book',
    sourceToken: 'a'.repeat(64),
    kind: 'chapter' as const,
    cursor: null,
    limit: 50,
  };
  await bookStructureApi.list(page);
  expect(mocks.httpsCallable).toHaveBeenLastCalledWith('functions', 'listBookBackupStructure');
  expect(mocks.invoke).toHaveBeenLastCalledWith(page);
  const body = {
    bookId: 'book',
    sourceToken: page.sourceToken,
    kind: 'chapter' as const,
    id: 'chapter',
    itemToken: 'b'.repeat(64),
    index: 2,
  };
  await bookStructureApi.read(body);
  expect(mocks.httpsCallable).toHaveBeenLastCalledWith('functions', 'readBookBackupStructure');
  expect(mocks.invoke).toHaveBeenLastCalledWith(body);
  expect(body.index).toBe(2);
});
it('falha de transporte é preservada sem repetir a callable', async () => {
  const { bookStructureApi } = await import('../services/bookStructureCallables');
  const failure = new Error('sem resposta');
  mocks.invoke.mockRejectedValueOnce(failure);
  await expect(bookStructureApi.getSource({ bookId: 'book' })).rejects.toBe(failure);
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});

it('recursos usam as novas leituras sem inicializar Firebase no import', async () => {
  const { bookResourceApi } = await import('../services/bookResourceCallables');
  expect(mocks.getFirebaseApp).not.toHaveBeenCalled();
  const scope = {
    bookId: 'book',
    sourceToken: 'a'.repeat(64),
    kind: 'scene-body' as const,
    parentId: 'scene',
  };
  await bookResourceApi.list({ ...scope, cursor: null, limit: 50 });
  expect(mocks.httpsCallable).toHaveBeenLastCalledWith('functions', 'listBookBackupResources');
  await bookResourceApi.read({ ...scope, id: 'current', itemToken: 'b'.repeat(64), index: 0 });
  expect(mocks.httpsCallable).toHaveBeenLastCalledWith('functions', 'readBookBackupResource');
  expect(mocks.invoke).toHaveBeenLastCalledWith({
    ...scope,
    id: 'current',
    itemToken: 'b'.repeat(64),
    index: 0,
  });
});

it('personas usam somente origem e vínculos autorizados pelas novas callables', async () => {
  const { bookPersonaApi } = await import('../services/bookPersonaCallables');
  expect(mocks.getFirebaseApp).not.toHaveBeenCalled();
  const input = {
    bookId: 'book',
    sourceToken: 'a'.repeat(64),
    kind: 'chapter' as const,
    cursor: null,
    limit: 50,
  };
  await bookPersonaApi.getSource({ bookId: 'book' });
  expect(mocks.httpsCallable).toHaveBeenLastCalledWith('functions', 'getBookBackupSource');
  await bookPersonaApi.list(input);
  expect(mocks.httpsCallable).toHaveBeenLastCalledWith(
    'functions',
    'listBookBackupPersonaBindings',
  );
  expect(mocks.invoke).toHaveBeenLastCalledWith(input);
  const body = {
    bookId: 'book',
    sourceToken: input.sourceToken,
    kind: input.kind,
    id: 'chapter',
    itemToken: 'b'.repeat(64),
    index: 0,
  };
  await bookPersonaApi.read(body);
  expect(mocks.httpsCallable).toHaveBeenLastCalledWith('functions', 'readBookBackupPersona');
  expect(mocks.invoke).toHaveBeenLastCalledWith(body);
});
