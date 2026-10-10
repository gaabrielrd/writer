import { beforeEach, expect, it, vi } from 'vitest';
import * as db from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  createLoreEntity,
  deleteLoreEntity,
  getLoreEntity,
  listLoreEntities,
  subscribeLoreEntities,
  updateLoreEntity,
} from '../services/loreService';
vi.mock('@/shared/lib', () => ({ firestore: {}, getFirebaseApp: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(), httpsCallable: vi.fn() }));
const call = vi.fn();
const scope = { kind: 'universe' as const, id: 'world' };
const input = { name: 'Arthur', category: 'character' as const, summary: 'O rei' };
const snap = {
  id: 'arthur',
  exists: () => true,
  data: () => ({ ...input, aliases: [], isPublic: true, structuredDetails: { notes: 'Privado' } }),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(httpsCallable).mockReturnValue(call as never);
});
it('lê lore global com identidade completa sem confundir IDs locais', async () => {
  vi.mocked(db.getDocs).mockResolvedValue({ docs: [snap] } as never);
  const entities = await listLoreEntities(scope);
  expect(entities[0]).toMatchObject({
    id: 'universe:world:arthur',
    universeId: 'world',
    structuredDetails: { notes: 'Privado' },
  });
  expect(db.collection).toHaveBeenCalledWith({}, 'universes', 'world', 'lore');
  vi.mocked(db.getDoc).mockResolvedValue(snap as never);
  expect(await getLoreEntity(scope, 'universe:world:arthur')).toMatchObject({
    universeId: 'world',
  });
  vi.mocked(db.getDoc).mockResolvedValue({ exists: () => false } as never);
  expect(await getLoreEntity(scope, 'arthur')).toBeNull();
});
it('cria, edita e exclui lore global pelo servidor, preservando ID na retentativa', async () => {
  call.mockResolvedValue({ data: { id: 'universe:world:arthur' } });
  await createLoreEntity(scope, { ...input, creationId: 'stable' });
  expect(call).toHaveBeenLastCalledWith({
    universeId: 'world',
    id: 'stable',
    create: true,
    input: { ...input, creationId: 'stable' },
  });
  await createLoreEntity(scope, input);
  expect(call).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: expect.any(String) as unknown }),
  );
  vi.mocked(db.getDoc).mockResolvedValue(snap as never);
  await updateLoreEntity(scope, 'universe:world:arthur', { isPublic: false });
  expect(call).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id: 'arthur',
      input: expect.objectContaining({ isPublic: false, name: 'Arthur' }) as unknown,
    }),
  );
  await deleteLoreEntity(scope, 'universe:world:arthur');
  expect(call).toHaveBeenLastCalledWith({ universeId: 'world', id: 'arthur' });
  vi.mocked(db.getDoc).mockResolvedValue({ exists: () => false } as never);
  await expect(updateLoreEntity(scope, 'missing', input)).rejects.toThrow('Entidade indisponível');
  call.mockRejectedValueOnce(new Error('Sem conexão')).mockRejectedValueOnce(null);
  await expect(deleteLoreEntity(scope, 'arthur')).rejects.toThrow('Sem conexão');
  await expect(deleteLoreEntity(scope, 'arthur')).rejects.toThrow('Não foi possível salvar');
});
it('recebe atualizações do escopo correto e encaminha erros de sincronização', () => {
  const changed = vi.fn();
  const failed = vi.fn();
  const stop = vi.fn();
  vi.mocked(db.onSnapshot).mockReturnValue(stop);
  expect(subscribeLoreEntities(scope, changed, failed)).toBe(stop);
  const args = vi.mocked(db.onSnapshot).mock.calls[0] as unknown as [
    unknown,
    (snapshot: unknown) => void,
    (error: unknown) => void,
  ];
  args[1]({ docs: [snap] });
  expect(changed).toHaveBeenLastCalledWith([
    expect.objectContaining({ id: 'universe:world:arthur' }),
  ]);
  args[2](new Error('Offline'));
  expect(failed).toHaveBeenCalled();
  subscribeLoreEntities('book', changed, failed);
  const localArgs = vi.mocked(db.onSnapshot).mock.calls[1] as unknown as typeof args;
  localArgs[1]({ docs: [snap] });
  expect(changed).toHaveBeenLastCalledWith([
    expect.objectContaining({ id: 'arthur', bookId: 'book' }),
  ]);
});
