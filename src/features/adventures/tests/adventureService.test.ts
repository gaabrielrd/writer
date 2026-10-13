import { beforeEach, expect, it, vi } from 'vitest';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { createAdventure, getAdventure, listAdventures } from '../services/adventureService';

const app = vi.hoisted(() => ({ name: 'authenticated-app' }));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => app }));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn().mockReturnValue({}),
  httpsCallable: vi.fn(),
}));
const call = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  call.mockReset();
  vi.mocked(httpsCallable).mockReturnValue(call as never);
});

it('cria com operação estável no contexto Firebase autenticado, sem autoria no payload', async () => {
  const input = {
    operationId: 'stable-operation',
    title: 'Projeto',
    synopsis: '',
    universeId: null,
  };
  const resource = { id: input.operationId, ownerId: 'owner' };
  call.mockResolvedValue({ data: resource });
  expect(await createAdventure(input)).toEqual(resource);
  expect(getFunctions).toHaveBeenCalledWith(app, 'us-central1');
  expect(httpsCallable).toHaveBeenCalledWith({}, 'createAdventure');
  expect(call).toHaveBeenCalledWith(input);
});
it('abre por ID e conserva indisponibilidade uniforme sem inventar recurso', async () => {
  call.mockResolvedValue({ data: null });
  expect(await getAdventure('private-project')).toBeNull();
  expect(httpsCallable).toHaveBeenCalledWith({}, 'getAdventure');
  expect(call).toHaveBeenCalledWith({ id: 'private-project' });
});
it('pagina pelo domínio e conserva o cursor recebido do servidor', async () => {
  call.mockResolvedValue({ data: { items: [], nextCursor: 'opaque-next' } });
  expect(await listAdventures({ status: 'all', cursor: 'old', limit: 25 })).toEqual({
    items: [],
    nextCursor: 'opaque-next',
  });
  expect(call).toHaveBeenLastCalledWith({
    kind: 'adventure',
    status: 'all',
    cursor: 'old',
    limit: 25,
  });
  await listAdventures();
  expect(call).toHaveBeenLastCalledWith({ kind: 'adventure' });
});
it('conserva código e identidade de erro para retry e dá feedback em falha desconhecida', async () => {
  const failure = Object.assign(new Error('Resposta incerta'), { code: 'functions/unavailable' });
  call.mockRejectedValueOnce(failure).mockRejectedValueOnce(null);
  await expect(createAdventure({ operationId: 'stable', title: 'Projeto' })).rejects.toMatchObject({
    code: 'functions/unavailable',
    message: 'Não foi possível confirmar esta operação. Tente novamente.',
    cause: failure,
  });
  await expect(getAdventure('id')).rejects.toThrow('Não foi possível acessar');
});

it('preserva mensagem de validação do servidor para corrigir os dados', async () => {
  const failure = Object.assign(new Error('Universo indisponível'), {
    code: 'functions/failed-precondition',
  });
  call.mockRejectedValueOnce(failure);
  await expect(createAdventure({ operationId: 'stable', title: 'Projeto' })).rejects.toBe(failure);
});
