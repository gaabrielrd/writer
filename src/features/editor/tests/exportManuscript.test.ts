import { getUniverse } from '@/features/universes';
import { DEFAULT_PERSONAS, listPersonas } from '@/features/ai-assistant';
import * as personaAPI from '@/features/ai-assistant';
vi.mock('@/features/universes', () => ({ getUniverse: vi.fn() }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listChapters,
  listActs,
  getBook,
  resolveChapterContent,
  captureSceneBookBackup,
  captureNarrativeBookBackup,
  assertSceneBookRevision,
} from '@/features/books';
import { listLoreEntities, type LoreEntity } from '@/features/lore';
import { exportManuscript } from '../services/exportManuscript';
import { downloadExport } from '../services/downloadExport';
import { exportPdf } from '../services/exportPdf';
import { exportDocx } from '../services/exportDocx';
import { exportBook, exportChapter, readBlob } from './exportFixtures';

vi.mock('@/features/books', async () => ({
  ...(await vi.importActual('../../books/model/act')),
  listChapters: vi.fn(),
  listActs: vi.fn(),
  getBook: vi.fn(),
  resolveChapterContent: vi.fn(),
  captureSceneBookBackup: vi.fn(),
  captureNarrativeBookBackup: vi.fn(),
  assertSceneBookRevision: vi.fn(),
}));
vi.mock('@/features/lore', () => ({ listLoreEntities: vi.fn() }));
vi.mock('../services/downloadExport', () => ({ downloadExport: vi.fn() }));
vi.mock('../services/exportPdf', () => ({ exportPdf: vi.fn() }));
vi.mock('../services/exportDocx', () => ({ exportDocx: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(personaAPI, 'listPersonas').mockResolvedValue([]);
  vi.mocked(listChapters).mockResolvedValue([exportChapter]);
  vi.mocked(getBook).mockResolvedValue(exportBook);
  vi.mocked(resolveChapterContent).mockImplementation((_bookId, chapter) =>
    Promise.resolve(chapter),
  );
  vi.mocked(assertSceneBookRevision).mockResolvedValue();
  vi.mocked(listActs).mockResolvedValue([]);
  vi.mocked(listLoreEntities).mockResolvedValue([]);
  vi.mocked(exportPdf).mockResolvedValue();
  vi.mocked(exportDocx).mockResolvedValue(new Blob(['docx']));
});

it('backup v5 inclui captura privada e fonte de agrupador removido', async () => {
  const book = { ...exportBook, hasSceneResources: true, sceneRevision: 9 };
  vi.mocked(getBook).mockResolvedValue(book);
  vi.mocked(listChapters).mockResolvedValue([
    { ...exportChapter, contentMode: 'scenes', assemblyRevision: 4, content: 'Prosa atual' },
  ]);
  const sceneBackup = {
    schemaVersion: 1 as const,
    projectRevision: 9,
    groups: [],
    scenes: [],
    sources: [
      {
        id: 'removed-chapter',
        content: 'Fonte preservada',
        hash: 'hash',
        original: { title: 'Original' },
      },
    ],
  };
  vi.mocked(captureSceneBookBackup).mockResolvedValue(sceneBackup);
  await exportManuscript({ book, scope: 'book', format: 'json' });
  const backup: unknown = JSON.parse(await downloadedText());
  expect(backup).toMatchObject({
    version: 5,
    scenes: sceneBackup,
    chapters: [{ contentMode: 'scenes', assemblyRevision: 4, content: 'Prosa atual' }],
  });
  expect(captureSceneBookBackup).toHaveBeenCalledWith(book.id, 9);
  expect(assertSceneBookRevision).toHaveBeenCalledWith(book.id, 9);
});

it('backup v6 inclui narrativa privada mesmo em livro sem cenas, sem alterar o manuscrito', async () => {
  const book = { ...exportBook, hasNarrativeResources: true, narrativeRevision: 8 };
  vi.mocked(getBook).mockResolvedValue(book);
  const narrative = {
    schemaVersion: 1 as const,
    projectRevision: 8,
    sceneRevision: 0,
    arcs: [],
    milestones: [],
    events: [],
  };
  vi.mocked(captureNarrativeBookBackup).mockResolvedValue(narrative);
  await exportManuscript({ book, scope: 'book', format: 'json' });
  expect(JSON.parse(await downloadedText())).toMatchObject({
    version: 6,
    narrative,
    chapters: [{ content: exportChapter.content }],
  });
  expect(captureNarrativeBookBackup).toHaveBeenCalledWith(book.id, 8, 0, undefined);
  expect(captureSceneBookBackup).not.toHaveBeenCalled();
});

it('backup v6 conserva captura de cenas junto dos arcos e acontecimentos', async () => {
  const book = {
    ...exportBook,
    hasNarrativeResources: true,
    narrativeRevision: 8,
    hasSceneResources: true,
    sceneRevision: 9,
  };
  vi.mocked(getBook).mockResolvedValue(book);
  const scenes = {
    schemaVersion: 1 as const,
    projectRevision: 9,
    groups: [],
    scenes: [],
    sources: [],
  };
  const narrative = {
    schemaVersion: 1 as const,
    projectRevision: 8,
    sceneRevision: 9,
    arcs: [],
    milestones: [],
    events: [],
  };
  vi.mocked(captureNarrativeBookBackup).mockResolvedValue(narrative);
  vi.mocked(captureSceneBookBackup).mockResolvedValue(scenes);
  await exportManuscript({ book, scope: 'book', format: 'json' });
  expect(JSON.parse(await downloadedText())).toMatchObject({ version: 6, scenes, narrative });
});

it('criação de narrativa durante exportação legada impede baixar backup que omitiria os itens', async () => {
  vi.mocked(getBook)
    .mockResolvedValueOnce(exportBook)
    .mockResolvedValueOnce({ ...exportBook, hasNarrativeResources: true, narrativeRevision: 1 });
  await expect(
    exportManuscript({ book: exportBook, scope: 'book', format: 'json' }),
  ).rejects.toThrow(/mudou durante/);
  expect(downloadExport).not.toHaveBeenCalled();
});

it('revisão narrativa alterada durante captura impede download mesmo com data igual', async () => {
  const book = { ...exportBook, hasNarrativeResources: true, narrativeRevision: 8 };
  vi.mocked(getBook)
    .mockResolvedValueOnce(book)
    .mockResolvedValueOnce({ ...book, narrativeRevision: 9 });
  vi.mocked(captureNarrativeBookBackup).mockResolvedValue({
    schemaVersion: 1,
    projectRevision: 8,
    sceneRevision: 0,
    arcs: [],
    milestones: [],
    events: [],
  });
  await expect(exportManuscript({ book, scope: 'book', format: 'json' })).rejects.toThrow(
    /mudou durante/,
  );
  expect(downloadExport).not.toHaveBeenCalled();
});

it('narrativa nova após abrir o livro exige atualizar dados antes do backup', async () => {
  vi.mocked(getBook).mockResolvedValueOnce({
    ...exportBook,
    updatedAt: exportBook.updatedAt + 1,
    hasNarrativeResources: true,
    narrativeRevision: 1,
  });
  await expect(
    exportManuscript({ book: exportBook, scope: 'book', format: 'json' }),
  ).rejects.toThrow(/livro mudou/);
  expect(downloadExport).not.toHaveBeenCalled();
});

it.each(['markdown', 'docx', 'pdf'] as const)(
  'exportação %s não captura ou acrescenta planejamento privado',
  async (format) => {
    const book = { ...exportBook, hasNarrativeResources: true, narrativeRevision: 8 };
    vi.mocked(getBook).mockResolvedValue(book);
    await exportManuscript({ book, scope: 'book', format });
    expect(captureNarrativeBookBackup).not.toHaveBeenCalled();
    if (format === 'markdown')
      expect(await downloadedText()).not.toMatch(/narrativeRevision|arcs|timelineEvents/);
    else expect(format === 'pdf' ? exportPdf : exportDocx).toHaveBeenCalled();
  },
);

it('não baixa backup parcial quando a revisão final das cenas mudou', async () => {
  const book = { ...exportBook, hasSceneResources: true, sceneRevision: 9 };
  vi.mocked(getBook).mockResolvedValue(book);
  vi.mocked(captureSceneBookBackup).mockResolvedValue({
    schemaVersion: 1,
    projectRevision: 9,
    groups: [],
    scenes: [],
    sources: [],
  });
  vi.mocked(assertSceneBookRevision).mockRejectedValueOnce(new Error('As cenas mudaram'));
  await expect(exportManuscript({ book, scope: 'book', format: 'json' })).rejects.toThrow(
    /mudaram/,
  );
  expect(downloadExport).not.toHaveBeenCalled();
});

it('cena sem capítulo criada depois de abrir o livro não é omitida por flag antiga', async () => {
  vi.mocked(getBook).mockResolvedValueOnce({
    ...exportBook,
    updatedAt: exportBook.updatedAt + 1,
    hasSceneResources: true,
    sceneRevision: 1,
  });
  await expect(
    exportManuscript({ book: exportBook, scope: 'book', format: 'json' }),
  ).rejects.toThrow(/livro mudou/);
  expect(getBook).toHaveBeenCalledWith(exportBook.id, { source: 'server' });
  expect(downloadExport).not.toHaveBeenCalled();
});
it('exclusão em andamento impede baixar um backup parcial', async () => {
  vi.mocked(getBook).mockResolvedValueOnce({ ...exportBook, deleting: true });
  await expect(
    exportManuscript({ book: exportBook, scope: 'book', format: 'json' }),
  ).rejects.toThrow(/indisponível/);
  expect(downloadExport).not.toHaveBeenCalled();
});

it('cena criada durante exportação legada invalida captura antes de baixar', async () => {
  vi.mocked(getBook)
    .mockResolvedValueOnce(exportBook)
    .mockResolvedValueOnce({
      ...exportBook,
      updatedAt: exportBook.updatedAt + 1,
      hasSceneResources: true,
      sceneRevision: 1,
    });
  await expect(
    exportManuscript({ book: exportBook, scope: 'book', format: 'json' }),
  ).rejects.toThrow(/mudou durante/);
  expect(downloadExport).not.toHaveBeenCalled();
});

it('exportação de capítulo composto usa a composição e não um rascunho do editor antigo', async () => {
  const book = { ...exportBook, hasSceneResources: true, sceneRevision: 9 };
  const chapter = { ...exportChapter, contentMode: 'scenes' as const, assemblyRevision: 4 };
  vi.mocked(getBook).mockResolvedValue(book);
  vi.mocked(resolveChapterContent).mockResolvedValue({
    ...chapter,
    content: '<p>Prosa das cenas</p>',
  });
  await exportManuscript({
    book,
    scope: 'chapter',
    format: 'markdown',
    currentChapter: chapter,
    currentContent: 'Fonte congelada antiga',
  });
  const text = await downloadedText();
  expect(text).toContain('Prosa das cenas');
  expect(text).not.toContain('Fonte congelada antiga');
});

it('preserva personas e vínculos no backup v3 sem exportar segredos ou a biblioteca inteira', async () => {
  const custom = { ...DEFAULT_PERSONAS[1]!, id: 'custom-test', name: 'Minha voz' };
  vi.mocked(listPersonas).mockResolvedValue([
    { ...custom, apiKey: 'never-export' } as typeof custom,
    { ...custom, id: 'custom-unused' },
  ]);
  vi.mocked(listChapters).mockResolvedValue([
    {
      ...exportChapter,
      personaComplement: {
        personaId: 'preset-unsettling',
        overrides: [{ traitId: 'tension', value: 0 }],
      },
    },
  ]);
  await exportManuscript({
    book: { ...exportBook, personaId: custom.id },
    scope: 'book',
    format: 'json',
  });
  const raw = await downloadedText();
  expect(JSON.parse(raw)).toMatchObject({
    version: 3,
    book: { personaId: 'custom-test' },
    chapters: [
      {
        personaComplement: {
          personaId: 'preset-unsettling',
          overrides: [{ traitId: 'tension', value: 0 }],
        },
      },
    ],
    personas: [
      { id: 'custom-test', instructions: custom.instructions },
      { id: 'preset-unsettling' },
    ],
  });
  expect(raw).not.toContain('never-export');
  expect(raw).not.toContain('custom-unused');
  vi.mocked(listPersonas).mockResolvedValue([]);
  await expect(
    exportManuscript({
      book: { ...exportBook, personaId: 'custom-test' },
      scope: 'book',
      format: 'json',
    }),
  ).rejects.toThrow('indisponível');
});

async function downloadedText(): Promise<string> {
  const blob = vi.mocked(downloadExport).mock.calls.at(-1)?.[0];
  if (!blob) throw new Error('No downloaded artifact');
  return new TextDecoder().decode(await readBlob(blob));
}

describe('exportManuscript', () => {
  it('exports the unsaved chapter without a remote fetch, including intentionally empty edits', async () => {
    await exportManuscript({
      book: exportBook,
      scope: 'chapter',
      format: 'markdown',
      currentChapter: exportChapter,
      currentContent: '**Nova versão**',
    });
    expect(listChapters).not.toHaveBeenCalled();
    expect(await downloadedText()).toContain('**Nova versão**');
    expect(downloadExport).toHaveBeenCalledWith(
      expect.any(Blob),
      'Crônicas ação & memória - O início.md',
    );
    await exportManuscript({
      book: exportBook,
      scope: 'chapter',
      format: 'markdown',
      currentChapter: exportChapter,
      currentContent: '',
    });
    expect(await downloadedText()).not.toContain('Segunda linha');
  });

  it('fetches the complete book and replaces its saved current chapter with the draft', async () => {
    vi.mocked(listChapters).mockResolvedValue([
      { ...exportChapter, id: 'two', order: 2, title: 'Capítulo 2', content: 'Outro capítulo' },
      exportChapter,
    ]);
    await exportManuscript({
      book: exportBook,
      scope: 'book',
      format: 'markdown',
      currentChapter: exportChapter,
      currentContent: 'Não salvo',
    });
    expect(listChapters).toHaveBeenCalledWith(exportBook.id);
    const text = await downloadedText();
    expect(text).toContain('Não salvo');
    expect(text).toContain('Outro capítulo');
    expect(text.indexOf('O início')).toBeLessThan(text.indexOf('Capítulo 2'));
  });

  it('keeps the open draft when it disappeared from the remote book listing', async () => {
    vi.mocked(listChapters).mockResolvedValue([]);
    await exportManuscript({
      book: exportBook,
      scope: 'book',
      format: 'markdown',
      currentChapter: exportChapter,
      currentContent: 'Rascunho preservado',
    });
    expect(await downloadedText()).toContain('Rascunho preservado');
  });

  it('uses stored content when no override is supplied and routes DOCX/PDF correctly', async () => {
    await exportManuscript({ book: exportBook, scope: 'book', format: 'docx' });
    expect(exportDocx).toHaveBeenCalledWith(
      expect.objectContaining({ title: exportBook.title }),
      undefined,
    );
    expect(downloadExport).toHaveBeenCalledWith(expect.any(Blob), 'Crônicas ação & memória.docx');
    vi.mocked(downloadExport).mockClear();
    await exportManuscript({
      book: exportBook,
      scope: 'chapter',
      format: 'pdf',
      currentChapter: exportChapter,
    });
    expect(exportPdf).toHaveBeenCalledWith(
      expect.objectContaining({ chapters: [expect.objectContaining({ title: 'O início' })] }),
      undefined,
    );
    expect(downloadExport).not.toHaveBeenCalled();
  });

  it('rejects missing or mismatched chapters and permits a retry after a load failure', async () => {
    await expect(
      exportManuscript({ book: exportBook, scope: 'chapter', format: 'markdown' }),
    ).rejects.toThrow('Selecione um capítulo');
    await expect(
      exportManuscript({
        book: exportBook,
        scope: 'chapter',
        format: 'markdown',
        currentChapter: { ...exportChapter, bookId: 'other' },
      }),
    ).rejects.toThrow('não pertence');
    vi.mocked(listChapters).mockRejectedValueOnce(new Error('Offline'));
    await expect(
      exportManuscript({ book: exportBook, scope: 'book', format: 'markdown' }),
    ).rejects.toThrow('Offline');
    expect(downloadExport).not.toHaveBeenCalled();
    await exportManuscript({ book: exportBook, scope: 'book', format: 'markdown' });
    expect(downloadExport).toHaveBeenCalledOnce();
    vi.mocked(listChapters).mockResolvedValue([]);
    await expect(
      exportManuscript({ book: exportBook, scope: 'book', format: 'markdown' }),
    ).rejects.toThrow('Adicione um capítulo');
  });

  it('prevents downloads after canceling a pending remote load or generated document', async () => {
    const controller = new AbortController();
    vi.mocked(listChapters).mockImplementation(() => {
      controller.abort();
      return Promise.resolve([exportChapter]);
    });
    await expect(
      exportManuscript({
        book: exportBook,
        scope: 'book',
        format: 'markdown',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(downloadExport).not.toHaveBeenCalled();
    const docxController = new AbortController();
    vi.mocked(exportDocx).mockImplementation(() => {
      docxController.abort();
      return Promise.resolve(new Blob());
    });
    await expect(
      exportManuscript({
        book: exportBook,
        scope: 'chapter',
        currentChapter: exportChapter,
        format: 'docx',
        signal: docxController.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(downloadExport).not.toHaveBeenCalled();
  });

  it('backs up private lore, structured details, relations and unsaved prose without account secrets', async () => {
    const entity: LoreEntity = {
      id: 'lore-1',
      bookId: exportBook.id,
      name: 'Aurora',
      aliases: ['Auri'],
      category: 'character',
      summary: 'Rainha',
      details: 'Segredo',
      structuredDetails: {
        appearance: 'Alta',
        personality: 'Forte',
        history: 'Passado',
        notes: 'Notas privadas',
      },
      relations: [{ targetEntityId: 'lore-2', relationType: 'amizade', description: 'Conhecidos' }],
      isPublic: false,
      createdAt: 1,
      updatedAt: 2,
    };
    vi.mocked(listLoreEntities).mockResolvedValue([
      Object.assign(entity, { apiKey: 'must-not-export' }),
    ]);
    await exportManuscript({
      book: exportBook,
      scope: 'book',
      format: 'json',
      currentChapter: exportChapter,
      currentContent: 'Rascunho atual',
    });
    const raw = await downloadedText();
    expect(JSON.parse(raw)).toMatchObject({
      format: 'writer-book-backup',
      version: 1,
      chapters: [{ content: 'Rascunho atual' }],
      lore: [
        {
          details: 'Segredo',
          isPublic: false,
          structuredDetails: { notes: 'Notas privadas' },
          relations: [{ targetEntityId: 'lore-2' }],
        },
      ],
    });
    expect(raw).not.toContain('must-not-export');
    expect(raw).not.toContain(exportBook.authorId);
    expect(downloadExport).toHaveBeenCalledWith(expect.any(Blob), 'Crônicas ação & memória.json');
    await expect(
      exportManuscript({
        book: exportBook,
        scope: 'chapter',
        currentChapter: exportChapter,
        format: 'json',
      }),
    ).rejects.toThrow('livro inteiro');
  });
});

it('inclui cópia separada do universo no backup privado, sem identidade de conta', async () => {
  vi.mocked(getUniverse).mockResolvedValue({
    id: 'world',
    authorId: 'secret-author',
    name: 'Atlas',
    description: 'Descrição',
    bookCount: 2,
    privacyVersion: 0,
    loreVersion: 0,
    createdAt: 1,
    updatedAt: 1,
  });
  const global: LoreEntity = {
    id: 'universe:world:arthur',
    universeId: 'world',
    name: 'Arthur',
    category: 'character',
    summary: 'Rei',
    aliases: [],
    details: 'Privado',
    relations: [],
    isPublic: false,
    createdAt: 1,
    updatedAt: 1,
  };
  vi.mocked(listLoreEntities).mockImplementation((scope) =>
    Promise.resolve(typeof scope === 'string' ? [] : [global]),
  );
  await exportManuscript({
    book: { ...exportBook, universeId: 'world' },
    scope: 'book',
    format: 'json',
  });
  const text = await downloadedText();
  expect(JSON.parse(text)).toMatchObject({
    version: 2,
    lore: [],
    universe: { id: 'world', lore: [{ id: global.id, details: 'Privado' }] },
  });
  expect(text).not.toContain('secret-author');
  vi.mocked(getUniverse).mockResolvedValue(null);
  await expect(
    exportManuscript({
      book: { ...exportBook, universeId: 'world' },
      scope: 'book',
      format: 'json',
    }),
  ).rejects.toThrow('Universo indisponível');
});

it('inclui atos e vínculos no backup 4 sem perder o formato dos livros antigos', async () => {
  vi.mocked(listActs).mockResolvedValue([
    { id: 'act', name: null, order: 1, createdAt: 1, updatedAt: 1 },
  ]);
  vi.mocked(listChapters).mockResolvedValue([{ ...exportChapter, actId: 'act' }]);
  await exportManuscript({ book: exportBook, scope: 'book', format: 'json' });
  expect(JSON.parse(await downloadedText())).toMatchObject({
    version: 4,
    acts: [{ id: 'act', name: null }],
    chapters: [{ actId: 'act' }],
  });
});

it('preserva atos, sequência e personas utilizadas juntos no backup v4', async () => {
  const personaId = DEFAULT_PERSONAS[0]!.id;
  const personaComplement = { personaId: DEFAULT_PERSONAS[1]!.id, overrides: [] };
  vi.mocked(listActs).mockResolvedValue([
    { id: 'act', name: null, order: 1, createdAt: 1, updatedAt: 1 },
  ]);
  vi.mocked(listChapters).mockResolvedValue([
    { ...exportChapter, id: 'unassigned', order: 1 },
    { ...exportChapter, id: 'assigned', order: 5, actId: 'act', personaComplement },
  ]);
  await exportManuscript({ book: { ...exportBook, personaId }, scope: 'book', format: 'json' });
  const backup: unknown = JSON.parse(await downloadedText());
  expect(backup).toMatchObject({
    version: 4,
    book: { personaId },
    acts: [{ id: 'act' }],
    chapters: [{ id: 'assigned', actId: 'act', personaComplement }, { id: 'unassigned' }],
    personas: [{ id: personaId }, { id: personaComplement.personaId }],
  });
});
