import { deleteSceneBook } from '@/features/scenes';
vi.mock('@/features/scenes', () => ({ deleteSceneBook: vi.fn() }));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as composition from '../services/chapterCompositionService';
import {
  beginBookDeletion,
  deletePublicationRevisions,
  finishBookDeletion,
  publishBook,
  unpublishBook,
} from '../services/publicationService';

const mocks = vi.hoisted(() => ({
  getBook: vi.fn(),
  getCollection: vi.fn(),
  transactionGet: vi.fn(),
  transactionSet: vi.fn(),
  transactionUpdate: vi.fn(),
  transaction: vi.fn(),
  commit: vi.fn(),
  batches: [] as { operation: string; path: string; data?: Record<string, unknown> }[][],
  publicationSession: vi.fn(),
  native: { capture: vi.fn(), verify: vi.fn(), guard: vi.fn(), stage: vi.fn(), finalize: vi.fn() },
}));

vi.mock('../services/bookLorePublicationClient', () => ({
  bookPublicationSession: mocks.publicationSession,
}));

vi.mock('@/shared/lib', async () => ({
  firestore: {},
  renderRichText: (await import('@/shared/lib/sanitizeRichText')).renderRichText,
}));

vi.mock('firebase/firestore', () => {
  const reference = (parent: { path?: string }, segments: string[], random = false) => {
    const path = [parent.path, ...segments, ...(random ? ['revision-new'] : [])]
      .filter(Boolean)
      .join('/');
    return { path, id: path.split('/').at(-1) };
  };
  return {
    collection: vi.fn((parent: { path?: string }, ...segments: string[]) =>
      reference(parent, segments),
    ),
    doc: vi.fn((parent: { path?: string }, ...segments: string[]) =>
      reference(parent, segments, segments.length === 0),
    ),
    getDocFromServer: mocks.getBook,
    getDocsFromServer: mocks.getCollection,
    runTransaction: mocks.transaction,
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    writeBatch: vi.fn(() => {
      const writes: (typeof mocks.batches)[number] = [];
      mocks.batches.push(writes);
      return {
        set: (ref: { path: string }, data: Record<string, unknown>) =>
          writes.push({ operation: 'set', path: ref.path, data }),
        update: (ref: { path: string }, data: Record<string, unknown>) =>
          writes.push({ operation: 'update', path: ref.path, data }),
        delete: (ref: { path: string }) => writes.push({ operation: 'delete', path: ref.path }),
        commit: mocks.commit,
      };
    }),
  };
});

function snapshot(data: Record<string, unknown>, id = 'item') {
  return { id, exists: (): boolean => true, data: () => data, ref: { path: id } };
}

const originalBook = {
  title: 'Livro',
  authorId: 'private-uid',
  status: 'draft',
  updatedAt: 100,
  synopsis: 'private synopsis',
};
let chapters: ReturnType<typeof snapshot>[];
let lore: ReturnType<typeof snapshot>[];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.publicationSession.mockReturnValue(mocks.native);
  mocks.native.verify.mockResolvedValue(undefined);
  mocks.native.stage.mockResolvedValue(undefined);
  mocks.native.finalize.mockResolvedValue(undefined);
  vi.mocked(deleteSceneBook).mockResolvedValue({ complete: true, processed: 0 });
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  mocks.batches.length = 0;
  mocks.getBook.mockResolvedValue(snapshot(originalBook));
  mocks.transactionGet.mockResolvedValue(snapshot(originalBook));
  mocks.commit.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(
    (
      _db: unknown,
      callback: (transaction: {
        get: typeof mocks.transactionGet;
        set: typeof mocks.transactionSet;
        update: typeof mocks.transactionUpdate;
      }) => Promise<void>,
    ) =>
      callback({
        get: mocks.transactionGet,
        set: mocks.transactionSet,
        update: mocks.transactionUpdate,
      }),
  );
  chapters = [
    snapshot(
      {
        title: 'Capítulo',
        order: 1,
        content:
          '<p>Olá <span data-lore-id="private-id">mundo</span><script>segredo()</script></p>',
        privateNotes: 'segredo',
      },
      'ch-1',
    ),
  ];
  lore = [
    snapshot(
      {
        name: 'Luz',
        aliases: ['Lua'],
        category: 'character',
        summary: 'Resumo',
        details: 'SPOILER',
        relations: [{ targetEntityId: 'private-id' }],
        isPublic: true,
      },
      'lore-public',
    ),
    snapshot({ name: 'Segredo', isPublic: false }, 'lore-private'),
    snapshot({ name: 'Legado sem consentimento' }, 'lore-legacy'),
  ];
  mocks.getCollection.mockImplementation((ref: { path: string }) => {
    const docs = ref.path.endsWith('/chapters') ? chapters : ref.path.endsWith('/acts') ? [] : lore;
    return Promise.resolve({ docs, size: docs.length });
  });
});

afterEach(() => vi.restoreAllMocks());

describe('publicationService', () => {
  it('publica a prosa canônica das cenas e captura revisão sem plano ou fonte', async () => {
    const book = { ...originalBook, hasSceneResources: true, sceneRevision: 7 };
    mocks.getBook.mockResolvedValue(snapshot(book));
    mocks.transactionGet.mockResolvedValue(snapshot(book));
    chapters = [
      snapshot(
        {
          title: 'Capítulo',
          order: 1,
          contentMode: 'scenes',
          assemblyRevision: 4,
          content: 'FONTE PRIVADA',
          objective: 'PLANO PRIVADO',
        },
        'ch-1',
      ),
    ];
    vi.spyOn(composition, 'resolveChapterContent').mockResolvedValueOnce({
      id: 'ch-1',
      bookId: 'book',
      title: 'Capítulo',
      order: 1,
      content: '<p>Prosa atual</p>',
      wordCount: 2,
      createdAt: 1,
      updatedAt: 100,
      contentMode: 'scenes',
      assemblyRevision: 4,
    });
    await publishBook('book', 'Autor');
    const writes = mocks.batches.flat();
    expect(writes.find((write) => write.path.endsWith('/chapters/ch-1'))?.data).toEqual({
      title: 'Capítulo',
      order: 1,
      content: '<p>Prosa atual</p>',
    });
    expect(writes[0]?.data).toMatchObject({ sourceSceneRevision: 7 });
    expect(mocks.transactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceSceneRevision: 7 }),
    );
    expect(JSON.stringify(writes)).not.toMatch(/FONTE PRIVADA|PLANO PRIVADO|objective/);
  });
  it('não ativa a publicação se a revisão das cenas mudou durante o staging', async () => {
    mocks.getBook.mockResolvedValue(
      snapshot({ ...originalBook, hasSceneResources: true, sceneRevision: 7 }),
    );
    mocks.transactionGet.mockResolvedValue(
      snapshot({ ...originalBook, hasSceneResources: true, sceneRevision: 8 }),
    );
    await expect(publishBook('book', 'Autor')).rejects.toThrow(/mudou durante/);
    expect(mocks.transactionSet).not.toHaveBeenCalled();
    expect(mocks.transactionUpdate).not.toHaveBeenCalled();
  });
  it('publica cópia sanitizada, nome explícito e apenas campos públicos autorizados', async () => {
    await publishBook('book', '  Pseudônimo  ');
    const writes = mocks.batches.flat();
    expect(writes).toHaveLength(3);
    expect(writes[1]?.data).toEqual({
      title: 'Capítulo',
      order: 1,
      content: '<p>Olá mundo</p>',
    });
    expect(writes[2]?.data).toEqual({
      name: 'Luz',
      aliases: ['Lua'],
      category: 'character',
      summary: 'Resumo',
    });
    expect(JSON.stringify(writes)).not.toMatch(
      /SPOILER|private-id|private-uid|isPublic|relations|details|privateNotes/,
    );
    expect(mocks.transactionSet).toHaveBeenCalledWith(
      { path: 'publicBooks/book', id: 'book' },
      {
        schemaVersion: 1,
        title: 'Livro',
        authorName: 'Pseudônimo',
        revisionId: 'revision-new',
        publishedAt: 1000,
      },
    );
    expect(mocks.transactionUpdate).toHaveBeenCalledWith(
      { path: 'books/book', id: 'book' },
      expect.objectContaining({ status: 'published' }),
    );
    expect(mocks.commit.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.transactionSet.mock.invocationCallOrder[0]!,
    );
  });

  it.each(['', ' '.repeat(10), 'a'.repeat(121)])(
    'exige pseudônimo válido antes de ler dados (%s)',
    async (byline) => {
      await expect(publishBook('book', byline)).rejects.toThrow('nome público');
      expect(mocks.getBook).not.toHaveBeenCalled();
    },
  );

  it('recusa livro inexistente', async () => {
    mocks.getBook.mockResolvedValue({ exists: (): boolean => false });
    await expect(publishBook('book', 'Autor')).rejects.toThrow('não encontrado');
  });

  it('valida o título do livro', async () => {
    mocks.getBook.mockResolvedValue(snapshot({ ...originalBook, title: '' }));
    await expect(publishBook('book', 'Autor')).rejects.toThrow('título do livro');
  });

  it('valida capítulo antes de qualquer gravação', async () => {
    chapters = [snapshot({ title: 'Capítulo', order: -1, content: 'texto' })];
    await expect(publishBook('book', 'Autor')).rejects.toThrow('capítulo inválido');
    expect(mocks.batches).toHaveLength(0);
  });

  it('rejeita entidade pública malformada', async () => {
    lore = [
      snapshot({
        name: 'Nome',
        aliases: [42],
        category: 'character',
        summary: 'Resumo',
        isPublic: true,
      }),
    ];
    await expect(publishBook('book', 'Autor')).rejects.toThrow('entidade pública inválida');
    expect(mocks.batches).toHaveLength(0);
  });

  it('suporta livro maior que 1 MiB em documentos separados e recusa capítulo individual enorme', async () => {
    lore = [];
    chapters = [1, 2].map((index) =>
      snapshot(
        { title: `Capítulo ${index}`, order: index, content: 'a'.repeat(550_000) },
        `ch-${index}`,
      ),
    );
    await publishBook('book', 'Autor');
    expect(mocks.batches.flat()).toHaveLength(3);
    mocks.batches.length = 0;
    chapters = [snapshot({ title: 'Enorme', order: 1, content: 'a'.repeat(910_000) })];
    await expect(publishBook('book', 'Autor')).rejects.toThrow('grande demais');
    expect(mocks.batches).toHaveLength(0);
  });

  it('limita lotes de preparação para respeitar leituras das regras', async () => {
    lore = [];
    chapters = Array.from({ length: 24 }, (_, index) =>
      snapshot({ title: `Capítulo ${index}`, order: index, content: 'texto' }, `ch-${index}`),
    );
    await publishBook('book', 'Autor');
    expect(mocks.batches.map((batch) => batch.length)).toEqual([10, 10, 5]);
  });

  it('não altera a publicação atual se falhar o upload da revisão', async () => {
    mocks.commit.mockRejectedValueOnce(new Error('offline'));
    await expect(publishBook('book', 'Autor')).rejects.toThrow('offline');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    { exists: (): boolean => false },
    snapshot({ ...originalBook, updatedAt: 200 }),
    snapshot({ ...originalBook, status: 'published' }),
    snapshot({ ...originalBook, publicationPrivacyVersion: 1 }),
    snapshot({ ...originalBook, deleting: true }),
  ])('não publica depois de alteração ou remoção concorrente (%#)', async (latestBook) => {
    mocks.transactionGet.mockResolvedValue(latestBook);
    await expect(publishBook('book', 'Autor')).rejects.toThrow();
    expect(mocks.transactionSet).not.toHaveBeenCalled();
  });

  it('retira a publicação e muda o status em um único lote atômico', async () => {
    await unpublishBook('book');
    expect(mocks.batches).toEqual([
      [
        {
          operation: 'update',
          path: 'books/book',
          data: { status: 'draft', updatedAt: 1000 },
        },
        { operation: 'delete', path: 'publicBooks/book' },
      ],
    ]);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it('finaliza livros legados e atuais com o mesmo pedido em todas as páginas, sem inventário SDK', async () => {
    mocks.getBook.mockRejectedValueOnce(new Error('SDK indisponível'));
    vi.mocked(deleteSceneBook)
      .mockResolvedValueOnce({ complete: false, processed: 50 })
      .mockResolvedValueOnce({ complete: true, processed: 51 });
    await finishBookDeletion('book');
    expect(deleteSceneBook).toHaveBeenCalledTimes(2);
    const request = vi.mocked(deleteSceneBook).mock.calls[0]![0];
    expect(request.target).toEqual({ kind: 'book', id: 'book' });
    expect(request.operationId).toMatch(/^[a-f0-9-]{36}$/);
    expect(request.limit).toBe(50);
    expect(vi.mocked(deleteSceneBook).mock.calls[1]![0]).toEqual(request);
    expect(mocks.getBook).not.toHaveBeenCalled();
    expect(mocks.getCollection).not.toHaveBeenCalled();
    expect(mocks.batches).toEqual([]);
  });
  it('erro remoto interrompe a finalização sem tombstone ou delete SDK', async () => {
    vi.mocked(deleteSceneBook).mockRejectedValueOnce(new Error('unavailable'));
    await expect(finishBookDeletion('book')).rejects.toThrow('unavailable');
    expect(deleteSceneBook).toHaveBeenCalledTimes(1);
    expect(mocks.batches).toEqual([]);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('revoga publicação e marca deleting antes da limpeza, sem finalizar a raiz no cliente', async () => {
    await beginBookDeletion('book');
    await finishBookDeletion('book');
    expect(mocks.batches).toEqual([
      [
        {
          operation: 'update',
          path: 'books/book',
          data: { status: 'draft', deleting: true, updatedAt: 1000 },
        },
        { operation: 'delete', path: 'publicBooks/book' },
      ],
    ]);
    expect(vi.mocked(mocks.commit).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteSceneBook).mock.invocationCallOrder[0]!,
    );
  });

  it.each([{ deleting: true }, { publicationPrivacyVersion: -1 }])(
    'bloqueia publicação de livro em exclusão ou privacidade inválida (%#)',
    async (state) => {
      mocks.getBook.mockResolvedValue(snapshot({ ...originalBook, ...state }));
      await expect(publishBook('book', 'Autor')).rejects.toThrow();
      expect(mocks.batches).toHaveLength(0);
    },
  );

  it('remove todas as revisões e seus documentos antes de excluir o livro', async () => {
    mocks.getCollection.mockImplementation((ref: { path: string }) =>
      Promise.resolve({
        docs: ref.path.endsWith('/revisions')
          ? [snapshot({}, 'revision-old')]
          : [snapshot({}, `${ref.path}/child`)],
      }),
    );
    await deletePublicationRevisions('book');
    expect(mocks.batches).toEqual([
      [
        { operation: 'delete', path: 'revision-old/chapters/child' },
        { operation: 'delete', path: 'revision-old/lore/child' },
        { operation: 'delete', path: 'revision-old/acts/child' },
        { operation: 'delete', path: 'revision-old' },
      ],
    ]);
  });
});

const universeBook = { ...originalBook, universeId: 'world' };
const universeData = { authorId: originalBook.authorId, privacyVersion: 2, loreVersion: 4 };
function withUniverse() {
  mocks.getBook.mockImplementation((ref: { path: string }) =>
    Promise.resolve(snapshot(ref.path === 'universes/world' ? universeData : universeBook)),
  );
  mocks.transactionGet.mockImplementation((ref: { path: string }) =>
    Promise.resolve(snapshot(ref.path === 'universes/world' ? universeData : universeBook)),
  );
  const global = [
    snapshot(
      {
        name: 'Arthur',
        aliases: ['Rei', 'Segredo'],
        category: 'character',
        summary: 'O rei',
        isPublic: true,
        details: 'GLOBAL SECRET',
      },
      'arthur',
    ),
    snapshot(
      {
        name: 'Segredo',
        aliases: [],
        category: 'other',
        summary: 'Não pode aparecer',
        isPublic: true,
      },
      'collision',
    ),
  ];
  mocks.getCollection.mockImplementation((ref: { path: string }) => {
    const docs =
      ref.path === 'universes/world/lore'
        ? global
        : ref.path.endsWith('/chapters')
          ? chapters
          : ref.path.endsWith('/acts')
            ? []
            : lore;
    return Promise.resolve({ docs, size: docs.length });
  });
}
it('publica lore global autorizado e protege termos locais privados antes da projeção', async () => {
  withUniverse();
  await publishBook('book', 'Autora');
  const writes = mocks.batches.flat();
  const globalWrite = writes.find((write) => write.path.endsWith('/universe:world:arthur'));
  expect(globalWrite?.data).toEqual({
    name: 'Arthur',
    aliases: ['Rei'],
    category: 'character',
    summary: 'O rei',
    sourceEntityId: 'arthur',
  });
  expect(writes.some((write) => write.path.endsWith('/universe:world:collision'))).toBe(false);
  expect(JSON.stringify(writes)).not.toContain('GLOBAL SECRET');
  expect(mocks.transactionSet).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ schemaVersion: 2, universeId: 'world', universePrivacyVersion: 2 }),
  );
});
it('recusa publicação se lore global mudar durante a preparação', async () => {
  withUniverse();
  mocks.transactionGet.mockImplementation((ref: { path: string }) =>
    Promise.resolve(
      snapshot(ref.path === 'universes/world' ? { ...universeData, loreVersion: 5 } : universeBook),
    ),
  );
  await expect(publishBook('book', 'Autora')).rejects.toThrow('O livro mudou');
  expect(mocks.transactionSet).not.toHaveBeenCalled();
});
it('recusa universo removido ou de outro autor sem gravar projeções', async () => {
  withUniverse();
  mocks.getBook.mockImplementation((ref: { path: string }) =>
    Promise.resolve(
      snapshot(
        ref.path === 'universes/world' ? { ...universeData, authorId: 'other' } : universeBook,
      ),
    ),
  );
  await expect(publishBook('book', 'Autora')).rejects.toThrow('Universo indisponível');
  expect(mocks.batches).toHaveLength(0);
});

it('publica atos não vazios e vínculos na mesma ordem de leitura, sem metadados privados', async () => {
  const acts = [
    snapshot({ name: null, order: 1, createdAt: 1, updatedAt: 1, secret: 'ACT SECRET' }, 'a'),
    snapshot({ name: 'Virada', order: 2, createdAt: 1, updatedAt: 1 }, 'b'),
    snapshot({ name: null, order: 3, createdAt: 1, updatedAt: 1 }, 'empty'),
  ];
  chapters = [
    snapshot({ title: 'Livre', order: 1, content: 'Livre' }, 'free'),
    snapshot({ title: 'Segundo', order: 1, content: 'Segundo', actId: 'b' }, 'second'),
    snapshot({ title: 'Primeiro', order: 3, content: 'Primeiro', actId: 'a' }, 'first'),
  ];
  mocks.getCollection.mockImplementation((ref: { path: string }) => {
    const docs = ref.path.endsWith('/acts') ? acts : ref.path.endsWith('/chapters') ? chapters : [];
    return Promise.resolve({ docs, size: docs.length });
  });
  await publishBook('book', 'Autora');
  const writes = mocks.batches.flat();
  expect(
    writes.filter((write) => write.path.includes('/acts/')).map((write) => write.data),
  ).toEqual([
    { name: 'I', order: 1 },
    { name: 'Virada', order: 2 },
  ]);
  expect(
    writes
      .filter((write) => write.path.includes('/chapters/'))
      .map((write) => [write.data?.title, write.data?.order]),
  ).toEqual([
    ['Primeiro', 1],
    ['Segundo', 2],
    ['Livre', 3],
  ]);
  expect(JSON.stringify(writes)).not.toContain('ACT SECRET');
  expect(mocks.transactionSet).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ hasActs: true }),
  );
});
it('recusa publicação de capítulo com ato órfão antes de gravar a revisão', async () => {
  chapters = [snapshot({ title: 'X', order: 1, content: 'X', actId: 'missing' }, 'chapter')];
  await expect(publishBook('book', 'Autora')).rejects.toThrow('inexistente');
  expect(mocks.batches).toHaveLength(0);
});

function nativeCapture(
  entities: { id: string; data: Record<string, unknown> }[],
  universeId: string | null = null,
) {
  return {
    source: {
      schemaVersion: 1,
      bookId: 'book',
      updatedAt: 100,
      status: 'draft',
      privacyVersion: 0,
      hasScenes: false,
      sceneRevision: 0,
      universeId,
      listToken: 'a'.repeat(64),
    },
    sourceToken: 'b'.repeat(64),
    collection: {
      bookId: 'book',
      listToken: 'a'.repeat(64),
      sources: entities.map((entity) => ({
        bookId: 'book',
        id: entity.id,
        sourceToken: 'c'.repeat(64),
        data: entity.data,
      })),
    },
  };
}
function enableNative() {
  const book = { ...originalBook, hasLoreResources: true };
  mocks.getBook.mockResolvedValue(snapshot(book));
  mocks.transactionGet.mockResolvedValue(snapshot(book));
  lore = [
    snapshot({ bookId: 'book', payloadStorage: { schemaVersion: 2 }, isPublic: true }, 'native'),
  ];
  const capture = nativeCapture([
    {
      id: 'native',
      data: {
        name: 'Luz',
        aliases: ['Lua'],
        category: 'character',
        summary: 'Resumo',
        isPublic: true,
        details: 'NATIVE_PRIVATE_DETAILS',
        structuredDetails: { notes: 'NATIVE_PRIVATE_NOTES' },
      },
    },
  ]);
  mocks.native.capture.mockResolvedValue(capture);
  return capture;
}
it('native publication stages logical local lore and finalizes on the server without public copies of private fields', async () => {
  const capture = enableNative();
  await publishBook('book', 'Explicit Author');
  expect(mocks.publicationSession).toHaveBeenCalledWith('book', 'private-uid');
  expect(mocks.native.verify).toHaveBeenCalledTimes(2);
  expect(mocks.native.stage).toHaveBeenCalledExactlyOnceWith(capture, 'revision-new', 'native', [
    'Lua',
  ]);
  expect(mocks.native.finalize).toHaveBeenCalledExactlyOnceWith(
    capture,
    'revision-new',
    'Explicit Author',
  );
  expect(mocks.transaction).not.toHaveBeenCalled();
  const writes = mocks.batches.flat();
  expect(writes.some((write) => write.path.endsWith('/lore/native'))).toBe(false);
  expect(
    writes.find((write) => write.path.endsWith('/revisions/revision-new'))?.data,
  ).toMatchObject({
    sourceLoreToken: 'a'.repeat(64),
    sourcePublicationToken: 'b'.repeat(64),
    loreCount: 1,
  });
  expect(JSON.stringify(writes)).not.toContain('NATIVE_PRIVATE');
});
it('native private names and aliases block global fallbacks before any projection', async () => {
  withUniverse();
  const book = { ...universeBook, hasLoreResources: true };
  mocks.getBook.mockImplementation((ref: { path: string }) =>
    Promise.resolve(snapshot(ref.path === 'universes/world' ? universeData : book)),
  );
  lore = [snapshot({ payloadStorage: { schemaVersion: 2 } }, 'private-native')];
  mocks.native.capture.mockResolvedValue(
    nativeCapture(
      [
        {
          id: 'private-native',
          data: { name: 'Segredo', aliases: ['Arthur'], category: 'other', isPublic: false },
        },
      ],
      'world',
    ),
  );
  await publishBook('book', 'Author');
  expect(mocks.batches.flat().some((write) => write.path.includes('/lore/'))).toBe(false);
  expect(mocks.native.stage).not.toHaveBeenCalled();
  expect(mocks.native.finalize).toHaveBeenCalledOnce();
});
it('native verification failure before staging leaves no public writes or fallback', async () => {
  enableNative();
  mocks.native.verify.mockRejectedValueOnce(new Error('Original source unavailable'));
  await expect(publishBook('book', 'Author')).rejects.toThrow('Original source unavailable');
  expect(mocks.batches).toHaveLength(0);
  expect(mocks.native.stage).not.toHaveBeenCalled();
  expect(mocks.native.finalize).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it('late native conflict preserves invisible staging and cannot activate the pointer', async () => {
  enableNative();
  mocks.native.verify
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('Clock changed'));
  await expect(publishBook('book', 'Author')).rejects.toThrow('Clock changed');
  expect(mocks.batches.flat().length).toBeGreaterThan(0);
  expect(mocks.native.stage).toHaveBeenCalledOnce();
  expect(mocks.native.finalize).not.toHaveBeenCalled();
  expect(mocks.transactionSet).not.toHaveBeenCalled();
});
it('native account loss after a staging commit stops the next RPC and publication', async () => {
  enableNative();
  mocks.commit.mockImplementationOnce(() => {
    mocks.native.guard.mockImplementation(() => {
      throw new Error('Account changed');
    });
    return Promise.resolve();
  });
  await expect(publishBook('book', 'Author')).rejects.toThrow('Account changed');
  expect(mocks.native.stage).not.toHaveBeenCalled();
  expect(mocks.native.finalize).not.toHaveBeenCalled();
});
it('a present malformed native pointer cannot silently use the inline publication path', async () => {
  lore = [snapshot({ payloadStorage: null }, 'broken')];
  mocks.native.capture.mockRejectedValueOnce(new Error('Invalid native source'));
  await expect(publishBook('book', 'Author')).rejects.toThrow('Invalid native source');
  expect(mocks.batches).toHaveLength(0);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it('a native capture of another source revision fails before staging', async () => {
  const capture = enableNative();
  capture.source.updatedAt = 101;
  await expect(publishBook('book', 'Author')).rejects.toThrow('O livro mudou');
  expect(mocks.batches).toHaveLength(0);
});
it('colliding local/global public identities fail before staging instead of selecting a fallback', async () => {
  withUniverse();
  lore = [
    snapshot(
      { name: 'Local', aliases: [], category: 'other', isPublic: false },
      'universe:world:arthur',
    ),
  ];
  await expect(publishBook('book', 'Author')).rejects.toThrow('colidem');
  expect(mocks.batches).toHaveLength(0);
});
