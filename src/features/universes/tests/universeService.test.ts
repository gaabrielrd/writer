import { beforeEach, expect, it, vi } from 'vitest';
import { getDoc, getDocs, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  createUniverse,
  deleteUniverse,
  getUniverse,
  listUniverses,
  updateUniverse,
} from '../services/universeService';

vi.mock('@/shared/lib', () => ({ firestore: {}, getFirebaseApp: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(), httpsCallable: vi.fn() }));
const call = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(httpsCallable).mockReturnValue(call as never);
});

it('lista somente os universos do autor, ordenados por nome', async () => {
  vi.mocked(getDocs).mockResolvedValue({
    docs: [
      { id: 'z', data: () => ({ name: 'Zeta' }) },
      { id: 'a', data: () => ({ name: 'Atlas' }) },
    ],
  } as never);
  expect((await listUniverses('author')).map((world) => world.id)).toEqual(['a', 'z']);
  expect(where).toHaveBeenCalledWith('authorId', '==', 'author');
});
it('abre um universo existente e trata universo ausente', async () => {
  vi.mocked(getDoc)
    .mockResolvedValueOnce({
      id: 'a',
      exists: () => true,
      data: () => ({ name: 'Atlas' }),
    } as never)
    .mockResolvedValueOnce({ exists: () => false } as never);
  expect(await getUniverse('a')).toEqual({ id: 'a', name: 'Atlas' });
  expect(await getUniverse('missing')).toBeNull();
});
it('salva por operações autenticadas no servidor com ID estável e permite excluir', async () => {
  call.mockResolvedValue({ data: { id: 'a', name: 'Atlas' } });
  const input = { name: 'Atlas', description: '' };
  expect(await createUniverse(input, 'stable-id')).toEqual({ id: 'a', name: 'Atlas' });
  expect(call).toHaveBeenLastCalledWith({ ...input, creationId: 'stable-id' });
  await updateUniverse('a', input);
  expect(call).toHaveBeenLastCalledWith({ ...input, id: 'a' });
  await deleteUniverse('a');
  expect(call).toHaveBeenLastCalledWith({ id: 'a' });
});
it('mantém erros de persistência acionáveis sem confirmar sucesso', async () => {
  call.mockRejectedValueOnce(new Error('Universo em uso')).mockRejectedValueOnce(null);
  await expect(deleteUniverse('a')).rejects.toThrow('Universo em uso');
  await expect(deleteUniverse('a')).rejects.toThrow('Não foi possível salvar');
});
