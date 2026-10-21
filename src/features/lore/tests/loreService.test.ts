import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as firestoreModule from 'firebase/firestore';
import {
  listLoreEntities,
  getLoreEntity,
  createLoreEntity,
  updateLoreEntity,
  deleteLoreEntity,
} from '../services/loreService';

const callable = vi.hoisted(() => vi.fn());

const transaction = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
    doc: vi.fn((base: { path?: string }, ...segments: string[]) => ({
      id: segments.at(-1) ?? 'entity-123',
      path: [base.path, ...segments, ...(segments.length ? [] : ['entity-123'])]
        .filter(Boolean)
        .join('/'),
    })),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
    runTransaction: vi.fn(
      (_db: unknown, callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
});

vi.mock('@/shared/lib', () => ({
  firestore: {},
  getFirebaseApp: () => ({}),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: vi.fn(() => callable),
}));

beforeEach(() => {
  vi.clearAllMocks();
  transaction.get.mockReset();
  transaction.set.mockReset();
  transaction.update.mockReset();
  transaction.delete.mockReset();
  transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ isPublic: false }) });
  vi.mocked(firestoreModule.runTransaction).mockImplementation((_db, callback) =>
    callback(transaction),
  );
});

describe('loreService', () => {
  it('uses stable versions for legacy records with no timestamps', async () => {
    vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ name: 'Legado', category: 'character', summary: 'Ficha antiga' }),
    } as unknown as firestoreModule.DocumentSnapshot);
    const first = await getLoreEntity('b-1', 'legacy');
    expect(first?.updatedAt).toBe(0);
    expect(first?.createdAt).toBe(0);
  });
  it('lista entidades de lore de um livro', async () => {
    vi.mocked(firestoreModule.getDocs).mockResolvedValueOnce({
      docs: [
        {
          id: 'e-1',
          data: () => ({
            name: 'Rei Arthur',
            aliases: ['Pendragon'],
            category: 'character',
            summary: 'Rei de Camelot',
            details: 'História detalhada',
            relations: [{ targetEntityId: 'e-2', relationType: 'Aliado de' }],
            isPublic: true,
            createdAt: 1000,
            updatedAt: 1000,
          }),
        },
      ],
    } as unknown as firestoreModule.QuerySnapshot);

    const result = await listLoreEntities('b-1');

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('e-1');
    expect(result[0]?.name).toBe('Rei Arthur');
    expect(result[0]?.category).toBe('character');
    expect(result[0]?.aliases).toEqual(['Pendragon']);
  });

  it('recupera entidade individual por ID existente', async () => {
    vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: 'e-1',
      data: () => ({
        name: 'Camelot',
        aliases: [],
        category: 'location',
        summary: 'Capital',
        details: '',
        relations: [],
        isPublic: true,
        createdAt: 1000,
        updatedAt: 1000,
      }),
    } as unknown as firestoreModule.DocumentSnapshot);

    const result = await getLoreEntity('b-1', 'e-1');

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Camelot');
    expect(result?.category).toBe('location');
  });

  it('retorna null ao buscar entidade inexistente', async () => {
    vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
      exists: () => false,
    } as unknown as firestoreModule.DocumentSnapshot);

    const result = await getLoreEntity('b-1', 'e-none');

    expect(result).toBeNull();
  });

  it('cria nova entidade de lore com limite no resumo', async () => {
    const longSummary = 'A'.repeat(200);
    transaction.get
      .mockResolvedValueOnce({ exists: () => true, data: () => ({}) })
      .mockResolvedValueOnce({ exists: () => false });

    const newEntity = await createLoreEntity('b-1', {
      name: ' Excalibur ',
      aliases: [' Espada Sagrada '],
      category: 'concept',
      summary: longSummary,
      details: ' Detalhes ',
      isPublic: true,
    });

    expect(newEntity.id).toBe('entity-123');
    expect(newEntity.name).toBe('Excalibur');
    expect(newEntity.aliases).toEqual(['Espada Sagrada']);
    expect(newEntity.summary).toHaveLength(140);
    expect(transaction.set).toHaveBeenCalledTimes(1);
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'books/b-1' }),
      { localLoreVersion: 1 },
    );
    expect(firestoreModule.setDoc).not.toHaveBeenCalled();
  });

  it('atualiza entidade existente no Firestore', async () => {
    await updateLoreEntity('b-1', 'e-1', {
      name: 'Arthur Pendragon',
      aliases: ['Rei Arthur'],
      category: 'character',
      summary: 'Rei coroado',
      details: 'Novos detalhes',
      isPublic: false,
    });

    expect(transaction.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Arthur Pendragon',
        aliases: ['Rei Arthur'],
        summary: 'Rei coroado',
        isPublic: false,
      }),
    );
  });

  it('exclui entidade de lore', async () => {
    await deleteLoreEntity('b-1', 'e-1');

    expect(transaction.delete).toHaveBeenCalledTimes(1);
  });
});

it('revoga publicacao na mesma transacao ao tornar lore publico privado', async () => {
  vi.clearAllMocks();
  transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ isPublic: true }) });
  await updateLoreEntity('book', 'lore', { isPublic: false });
  expect(transaction.update).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: 'draft' }),
  );
  expect(transaction.update).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ isPublic: false }),
  );
  expect(transaction.delete).toHaveBeenCalledTimes(1);
});
it('remove publicacao antes de excluir entidade anteriormente publica', async () => {
  vi.clearAllMocks();
  transaction.get.mockResolvedValue({ exists: () => true, data: () => ({ isPublic: true }) });
  await deleteLoreEntity('book', 'lore');
  expect(transaction.update).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: 'draft' }),
  );
  expect(transaction.delete).toHaveBeenCalledTimes(2);
});
it('preserva campos privados estruturados sem mudar publicacao em edicao comum', async () => {
  vi.clearAllMocks();
  await updateLoreEntity('book', 'lore', {
    structuredDetails: { appearance: 'A', personality: 'P', history: 'H', notes: 'segredo' },
  });
  expect(transaction.update).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      structuredDetails: { appearance: 'A', personality: 'P', history: 'H', notes: 'segredo' },
    }),
  );
  expect(transaction.update).toHaveBeenCalledWith(expect.objectContaining({ path: 'books/book' }), {
    localLoreVersion: 1,
  });
  expect(transaction.delete).not.toHaveBeenCalled();
});

it('reutiliza uma criação local já persistida após resposta perdida', async () => {
  const input = {
    creationId: 'stable-lore-0000001',
    name: 'Arthur',
    category: 'character' as const,
    summary: 'Rei',
  };
  transaction.get
    .mockResolvedValueOnce({ exists: () => true, data: () => ({}) })
    .mockResolvedValueOnce({ exists: () => false })
    .mockResolvedValueOnce({ exists: () => true, data: () => ({ localLoreVersion: 1 }) })
    .mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        bookId: 'book',
        name: 'Arthur',
        category: 'character',
        summary: 'Rei',
        aliases: [],
        relations: [],
        details: '',
        isPublic: true,
        createdAt: 1,
        updatedAt: 1,
      }),
    });
  const initial = await createLoreEntity('book', input);
  const retry = await createLoreEntity('book', input);
  expect(initial.id).toBe(retry.id);
  expect(transaction.set).toHaveBeenCalledOnce();
  expect(transaction.update).toHaveBeenCalledTimes(1);
  expect(retry.name).toBe('Arthur');
  await expect(createLoreEntity('book', { ...input, creationId: '../bad' })).rejects.toThrow(
    'Identificador',
  );
});

type Stored = Record<string, unknown>;
type Ref = { path: string; id: string };

/** Buffer writes until commit, so failures/retries cannot mutate the stored documents. */
function localStore(book: Stored | null = {}, entity: Stored | null = { isPublic: false }) {
  const records = new Map<string, Stored>();
  if (book !== null) records.set('books/book', structuredClone(book));
  if (entity !== null) records.set('books/book/lore/entity', structuredClone(entity));
  let retry: (() => void) | null = null;
  let failCommit = false;
  vi.mocked(firestoreModule.runTransaction).mockImplementation(async (_db, callback) => {
    for (;;) {
      const pending: (() => void)[] = [];
      transaction.get.mockImplementation((ref: Ref) => {
        const value = records.get(ref.path);
        return Promise.resolve({
          exists: () => value !== undefined,
          data: () => structuredClone(value),
        });
      });
      transaction.set.mockImplementation((ref: Ref, value: Stored) => {
        pending.push(() => records.set(ref.path, structuredClone(value)));
      });
      transaction.update.mockImplementation((ref: Ref, value: Stored) => {
        if (!records.has(ref.path)) throw new Error('Missing document');
        pending.push(() => records.set(ref.path, { ...records.get(ref.path), ...value }));
      });
      transaction.delete.mockImplementation((ref: Ref) => {
        pending.push(() => records.delete(ref.path));
      });
      const result = await callback(transaction);
      if (retry) {
        const change = retry;
        retry = null;
        change();
        continue;
      }
      if (failCommit) throw new Error('Commit failed');
      pending.forEach((write) => write());
      return result;
    }
  });
  return {
    records,
    retryOnce: (change: () => void) => {
      retry = change;
    },
    rejectCommit: () => {
      failCommit = true;
    },
  };
}

const newLore = {
  creationId: 'new-lore-000000001',
  name: ' New name ',
  category: 'character' as const,
  summary: ' Summary ',
};
const localMutations = [
  () => createLoreEntity('book', newLore),
  () => updateLoreEntity('book', 'entity', { summary: 'Changed' }),
  () => deleteLoreEntity('book', 'entity'),
];

describe('localLoreVersion', () => {
  it('starts from the legacy baseline with existing lore and increments only effective writes', async () => {
    const { records } = localStore({ wordCount: 99 }, { name: 'Existing', isPublic: false });
    await createLoreEntity('book', newLore);
    expect(records.get('books/book')).toEqual({ wordCount: 99, localLoreVersion: 1 });
    expect(records.get('books/book/lore/entity')?.name).toBe('Existing');
    expect(records.get('books/book/lore/' + newLore.creationId)?.name).toBe('New name');
    await createLoreEntity('book', newLore);
    expect(records.get('books/book')?.localLoreVersion).toBe(1);
    await updateLoreEntity('book', 'entity', { summary: 'Changed' });
    expect(records.get('books/book')?.localLoreVersion).toBe(2);
    expect(records.get('books/book/lore/entity')?.summary).toBe('Changed');
    await deleteLoreEntity('book', 'entity');
    expect(records.get('books/book')?.localLoreVersion).toBe(3);
    expect(records.has('books/book/lore/entity')).toBe(false);
    await deleteLoreEntity('book', 'entity');
    expect(records.get('books/book')?.localLoreVersion).toBe(3);
    expect(firestoreModule.setDoc).not.toHaveBeenCalled();
    expect(firestoreModule.updateDoc).not.toHaveBeenCalled();
  });

  it('revokes publication and increments the local clock together when making lore private', async () => {
    const { records } = localStore(
      { localLoreVersion: 4, publicationPrivacyVersion: 7, status: 'published', wordCount: 99 },
      { name: 'Public', isPublic: true },
    );
    records.set('publicBooks/book', { title: 'Published' });
    await updateLoreEntity('book', 'entity', { isPublic: false });
    expect(records.get('books/book')).toMatchObject({
      localLoreVersion: 5,
      publicationPrivacyVersion: 8,
      status: 'draft',
      wordCount: 99,
    });
    expect(records.get('books/book/lore/entity')?.isPublic).toBe(false);
    expect(records.has('publicBooks/book')).toBe(false);
    expect(
      transaction.update.mock.calls.filter(([ref]) => (ref as Ref).path === 'books/book'),
    ).toHaveLength(1);
  });

  it('keeps publication during ordinary edits and revokes it on public deletion', async () => {
    const { records } = localStore(
      { localLoreVersion: 4, publicationPrivacyVersion: 7, status: 'published' },
      { name: 'Public', isPublic: true },
    );
    records.set('publicBooks/book', { title: 'Published' });
    await updateLoreEntity('book', 'entity', { details: ' Still public ' });
    expect(records.get('books/book')).toMatchObject({
      localLoreVersion: 5,
      publicationPrivacyVersion: 7,
      status: 'published',
    });
    expect(records.get('books/book/lore/entity')?.details).toBe('Still public');
    expect(records.has('publicBooks/book')).toBe(true);
    await deleteLoreEntity('book', 'entity');
    expect(records.get('books/book')).toMatchObject({
      localLoreVersion: 6,
      publicationPrivacyVersion: 8,
      status: 'draft',
    });
    expect(records.has('publicBooks/book')).toBe(false);
    expect(records.has('books/book/lore/entity')).toBe(false);
  });

  it.each(localMutations.map((mutate, index) => [index, mutate] as const))(
    'does not leak a partial lore/clock/publication write when commit fails (%s)',
    async (_index, mutate) => {
      const store = localStore({ localLoreVersion: 4, status: 'published' }, { isPublic: true });
      store.records.set('publicBooks/book', { title: 'Published' });
      const before = structuredClone(store.records);
      store.rejectCommit();
      await expect(mutate()).rejects.toThrow('Commit failed');
      expect(store.records).toEqual(before);
      expect(firestoreModule.setDoc).not.toHaveBeenCalled();
      expect(firestoreModule.updateDoc).not.toHaveBeenCalled();
    },
  );

  it('rechecks the current clock on a transaction retry without double incrementing', async () => {
    const store = localStore({ localLoreVersion: 4 });
    store.retryOnce(() =>
      store.records.set('books/book', { localLoreVersion: 5, title: 'Concurrent' }),
    );
    await updateLoreEntity('book', 'entity', { name: 'Edited' });
    expect(store.records.get('books/book')).toEqual({ localLoreVersion: 6, title: 'Concurrent' });
    expect(store.records.get('books/book/lore/entity')?.name).toBe('Edited');
  });

  const invalidVersions = [
    undefined,
    null,
    -1,
    1.5,
    '1',
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ];
  it.each(invalidVersions.map((value, index) => [index, value] as const))(
    'rejects a present invalid clock without mutating any document (%s)',
    async (_index, value) => {
      for (const mutate of localMutations) {
        const store = localStore({ localLoreVersion: value });
        const before = structuredClone(store.records);
        await expect(mutate()).rejects.toThrow('versão do lore');
        expect(store.records).toEqual(before);
      }
      expect(transaction.set).not.toHaveBeenCalled();
      expect(transaction.update).not.toHaveBeenCalled();
      expect(transaction.delete).not.toHaveBeenCalled();
    },
  );

  it.each(localMutations.map((mutate, index) => [index, mutate] as const))(
    'fails closed at overflow, leaving lore and clock unchanged (%s)',
    async (_index, mutate) => {
      const store = localStore({ localLoreVersion: Number.MAX_SAFE_INTEGER });
      const before = structuredClone(store.records);
      await expect(mutate()).rejects.toThrow('limite seguro');
      expect(store.records).toEqual(before);
      expect(transaction.set).not.toHaveBeenCalled();
      expect(transaction.update).not.toHaveBeenCalled();
      expect(transaction.delete).not.toHaveBeenCalled();
    },
  );

  it('allows the last safe increment and leaves a missing deletion at the same clock', async () => {
    const store = localStore({ localLoreVersion: Number.MAX_SAFE_INTEGER - 1 });
    await updateLoreEntity('book', 'entity', { name: 'Last' });
    expect(store.records.get('books/book')?.localLoreVersion).toBe(Number.MAX_SAFE_INTEGER);
    await deleteLoreEntity('book', 'absent');
    expect(store.records.get('books/book')?.localLoreVersion).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejects an update of missing lore without advancing the clock', async () => {
    const store = localStore({ localLoreVersion: 3 }, null);
    await expect(updateLoreEntity('book', 'entity', { name: 'Missing' })).rejects.toThrow(
      'indisponível',
    );
    expect(store.records.get('books/book')).toEqual({ localLoreVersion: 3 });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it.each([null, { deleting: true }])(
    'never recreates or edits an unavailable book (%j)',
    async (book) => {
      for (const mutate of localMutations) {
        const store = localStore(book);
        const before = structuredClone(store.records);
        await expect(mutate()).rejects.toThrow('Livro indisponível');
        expect(store.records).toEqual(before);
      }
      expect(transaction.set).not.toHaveBeenCalled();
      expect(transaction.update).not.toHaveBeenCalled();
      expect(transaction.delete).not.toHaveBeenCalled();
    },
  );

  it('does not route global writes through the local clock transaction', async () => {
    const scope = { kind: 'universe' as const, id: 'universe' };
    callable.mockResolvedValue({ data: { id: 'global' } });
    await createLoreEntity(scope, newLore);
    vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: 'entity',
      data: () => ({ name: 'Global', category: 'character', summary: 'Old' }),
    } as unknown as firestoreModule.DocumentSnapshot);
    await updateLoreEntity(scope, 'entity', { summary: 'Changed' });
    await deleteLoreEntity(scope, 'entity');
    expect(transaction.get).not.toHaveBeenCalled();
    expect(firestoreModule.runTransaction).not.toHaveBeenCalled();
    expect(callable).toHaveBeenCalledTimes(3);
  });
});
