import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_PERSONAS, type AIPersona } from '../model/persona';
import { listPersonas, savePersona, subscribePersonas } from '../services/personaService';
import { collection, getDocs, onSnapshot, runTransaction } from 'firebase/firestore';

vi.mock('@/shared/lib', () => ({ firestore: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'collection'),
  doc: vi.fn(() => 'reference'),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
}));
const persona: AIPersona = {
  ...DEFAULT_PERSONAS[0]!,
  id: 'custom-test',
  createdAt: 1,
  updatedAt: 1,
};
beforeEach(() => vi.clearAllMocks());

it('isola leitura e assinatura pelo autor e valida dados recebidos', async () => {
  vi.mocked(getDocs).mockResolvedValue({
    docs: [{ id: persona.id, data: () => persona }],
  } as never);
  expect(await listPersonas('author')).toEqual([persona]);
  expect(collection).toHaveBeenCalledWith({}, 'users', 'author', 'aiPersonas');
  const stop = vi.fn();
  vi.mocked(onSnapshot).mockReturnValue(stop);
  const changed = vi.fn();
  const failed = vi.fn();
  expect(subscribePersonas('author', changed, failed)).toBe(stop);
  const callback = vi.mocked(onSnapshot).mock.calls[0]![1] as unknown as (value: unknown) => void;
  callback({ docs: [{ id: persona.id, data: () => persona }] });
  expect(changed).toHaveBeenCalledWith([persona]);
  callback({ docs: [{ id: persona.id, data: () => ({}) }] });
  expect(failed).toHaveBeenCalledWith(expect.any(Error));
  await expect(listPersonas('')).rejects.toThrow('Entre na sua conta');
});

it('cria atomicamente, incrementa revisão e mantém data de criação nas edições', async () => {
  const set = vi.fn();
  let previous: AIPersona | null = null;
  vi.mocked(runTransaction).mockImplementation(async (_db, callback) =>
    callback({
      get: () =>
        Promise.resolve({ exists: () => Boolean(previous), data: () => previous, id: persona.id }),
      set,
    } as never),
  );
  const created = await savePersona('author', persona, null);
  expect(created.revision).toBe(1);
  expect(set).toHaveBeenCalledWith('reference', created);
  previous = created;
  const edited = await savePersona('author', { ...created, name: 'Nova voz' }, 1);
  expect(edited.revision).toBe(2);
  expect(edited.createdAt).toBe(created.createdAt);
  await expect(savePersona('author', persona, null)).rejects.toThrow('outra janela');
  await expect(savePersona('author', persona, 9)).rejects.toThrow('outra janela');
  await expect(savePersona('author', DEFAULT_PERSONAS[0]!, null)).rejects.toThrow('Duplique');
});
