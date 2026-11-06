import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_PERSONAS, type AIPersona } from '../model/persona';
import { listPersonas, savePersona, subscribePersonas } from '../services/personaService';
import { collection, getDocs, onSnapshot, runTransaction } from 'firebase/firestore';

vi.mock('@/shared/lib', () => ({ firestore: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'collection'),
  doc: vi.fn((...args: unknown[]) => (args.includes('aiPersonaCatalog') ? 'catalog' : 'reference')),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
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
  const unsubscribe = subscribePersonas('author', changed, failed);
  const callback = vi.mocked(onSnapshot).mock.calls[0]![1] as unknown as (value: unknown) => void;
  callback({ docs: [{ id: persona.id, data: () => persona }] });
  expect(changed).toHaveBeenCalledWith([persona]);
  callback({ docs: [{ id: persona.id, data: () => ({}) }] });
  expect(failed).toHaveBeenCalledWith(expect.any(Error));
  unsubscribe();
  expect(stop).toHaveBeenCalledOnce();
  await expect(listPersonas('')).rejects.toThrow('Entre na sua conta');
});

it('cria atomicamente, incrementa revisão e mantém data de criação nas edições', async () => {
  let catalog: { schemaVersion: 1; revision: number } | null = null;
  const set = vi.fn((reference: unknown, value: unknown) => {
    if (reference === 'catalog') catalog = value as typeof catalog;
  });
  let previous: AIPersona | null = null;
  vi.mocked(runTransaction).mockImplementation(async (_db, callback) =>
    callback({
      get: (reference: unknown) =>
        Promise.resolve(
          reference === 'catalog'
            ? { exists: () => Boolean(catalog), data: () => catalog }
            : { exists: () => Boolean(previous), data: () => previous, id: persona.id },
        ),
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
  expect(catalog).toEqual({ schemaVersion: 1, revision: 2 });
  previous = edited;
  await expect(savePersona('author', persona, null)).rejects.toThrow('outra janela');
  await expect(savePersona('author', persona, 9)).rejects.toThrow('outra janela');
  await expect(savePersona('author', DEFAULT_PERSONAS[0]!, null)).rejects.toThrow('Duplique');
  expect(catalog).toEqual({ schemaVersion: 1, revision: 2 });
});
