import { beforeEach, expect, it, vi } from 'vitest';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { listStudioBooks, prepareStudioBooks } from '../services/studioBookService';
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
it('prepara lotes sem enviar autoria ou cursor arbitrário', async () => {
  call.mockResolvedValue({ data: { complete: false, processed: 25 } });
  expect(await prepareStudioBooks({ limit: 25 })).toEqual({ complete: false, processed: 25 });
  expect(getFunctions).toHaveBeenCalledWith(app, 'us-central1');
  expect(httpsCallable).toHaveBeenCalledWith({}, 'prepareStudioBooks');
  expect(call).toHaveBeenLastCalledWith({ limit: 25 });
  await prepareStudioBooks();
  expect(call).toHaveBeenLastCalledWith({});
});
it('pede página de livros com filtro e preserva resumo e próximo cursor', async () => {
  const page = {
    items: [{ id: 'legacy-id', kind: 'book', title: 'Livro antigo', updatedAt: 123 }],
    nextCursor: 'next',
  };
  call.mockResolvedValue({ data: page });
  expect(await listStudioBooks({ status: 'published', cursor: 'previous', limit: 25 })).toEqual(
    page,
  );
  expect(httpsCallable).toHaveBeenCalledWith({}, 'listStudioProjects');
  expect(call).toHaveBeenLastCalledWith({
    kind: 'book',
    status: 'published',
    cursor: 'previous',
    limit: 25,
  });
  await listStudioBooks();
  expect(call).toHaveBeenLastCalledWith({ kind: 'book' });
});
it('preserva failed-precondition da preparação e não anuncia sucesso em erro desconhecido', async () => {
  const failure = Object.assign(new Error('Preparação pendente'), {
    code: 'functions/failed-precondition',
  });
  call.mockRejectedValueOnce(failure).mockRejectedValueOnce(undefined);
  await expect(listStudioBooks()).rejects.toBe(failure);
  await expect(prepareStudioBooks()).rejects.toThrow('Não foi possível acessar seus livros');
});

it('traduz falha de transporte sem perder o código necessário para retry seguro', async () => {
  const failure = Object.assign(new Error('internal'), { code: 'functions/internal' });
  call.mockRejectedValueOnce(failure);
  await expect(prepareStudioBooks()).rejects.toMatchObject({
    code: 'functions/internal',
    message: 'Não foi possível confirmar esta operação. Tente novamente.',
    cause: failure,
  });
});
