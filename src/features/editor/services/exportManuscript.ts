import { DEFAULT_PERSONAS, listPersonas, validatePersona } from '@/features/ai-assistant';
import {
  listActs,
  groupChapters,
  listChapters,
  resolveChapterContent,
  captureSceneBookBackup,
  captureNarrativeBookBackup,
  assertSceneBookRevision,
  getBook,
  type Book,
  type Chapter,
} from '@/features/books';
import { listLoreEntities } from '@/features/lore';
import { getUniverse } from '@/features/universes';
import {
  createExportDocument,
  exportFileName,
  type ExportFormat,
  type ExportScope,
} from '../model/exportDocument';
import { downloadExport } from './downloadExport';
import { exportMarkdown } from './exportMarkdown';
import { exportPdf } from './exportPdf';

export interface ExportRequest {
  book: Book;
  scope: ExportScope;
  format: ExportFormat;
  currentChapter?: Chapter;
  currentContent?: string;
  signal?: AbortSignal;
}

export async function exportManuscript({
  book,
  scope,
  format,
  currentChapter,
  currentContent,
  signal,
}: ExportRequest): Promise<void> {
  signal?.throwIfAborted();
  if (currentChapter && currentChapter.bookId !== book.id)
    throw new Error('O capítulo não pertence a este livro.');
  if (scope === 'chapter' && !currentChapter)
    throw new Error('Selecione um capítulo para exportar.');
  if (format === 'json' && scope !== 'book')
    throw new Error('O backup JSON inclui o livro inteiro.');
  const snapshotBook = await getBook(book.id, { source: 'server' });
  if (!snapshotBook || snapshotBook.deleting)
    throw new Error('Livro indisponível para exportação.');
  const source =
    scope === 'chapter' && currentChapter ? [currentChapter] : await listChapters(book.id);
  const acts = scope === 'chapter' && !currentChapter?.actId ? [] : await listActs(book.id);
  signal?.throwIfAborted();
  // A chapter removed remotely must not silently discard the draft still open in the editor.
  const available =
    currentChapter && !source.some((chapter) => chapter.id === currentChapter.id)
      ? [...source, currentChapter]
      : source;
  const chapters = await Promise.all(
    available.map(async (chapter) =>
      chapter.contentMode === 'scenes'
        ? await resolveChapterContent(book.id, chapter)
        : chapter.id === currentChapter?.id && currentContent !== undefined
          ? { ...chapter, content: currentContent }
          : chapter,
    ),
  );
  const hasScenes =
    snapshotBook.hasSceneResources ||
    book.hasSceneResources ||
    chapters.some((chapter) => chapter.contentMode === 'scenes');
  if (hasScenes && snapshotBook.updatedAt !== book.updatedAt)
    throw new Error('O livro mudou. Atualize seus dados antes de exportar.');
  const sourceSceneRevision = snapshotBook.sceneRevision ?? 0;
  const sourceNarrativeRevision = snapshotBook.narrativeRevision ?? 0;
  const hasNarrative = Boolean(snapshotBook.hasNarrativeResources);
  if (hasNarrative && snapshotBook.updatedAt !== book.updatedAt)
    throw new Error('O livro mudou. Atualize seus dados antes de exportar.');
  const assertCapture = async () => {
    if (hasScenes) await assertSceneBookRevision(book.id, sourceSceneRevision);
    const latest = await getBook(book.id, { source: 'server' });
    if (
      !latest ||
      latest.deleting ||
      (latest.sceneRevision ?? 0) !== sourceSceneRevision ||
      (latest.narrativeRevision ?? 0) !== sourceNarrativeRevision ||
      Boolean(latest.hasNarrativeResources) !== hasNarrative ||
      Boolean(latest.hasSceneResources) !== Boolean(snapshotBook.hasSceneResources) ||
      ((hasScenes || hasNarrative) && latest.updatedAt !== snapshotBook.updatedAt)
    )
      throw new Error('O livro mudou durante a exportação. Atualize e tente novamente.');
    signal?.throwIfAborted();
  };
  if (format === 'json') {
    const lore = await listLoreEntities(book.id);
    const universe = book.universeId ? await getUniverse(book.universeId) : null;
    if (book.universeId && (!universe || universe.deleting))
      throw new Error('Universo indisponível para backup. Tente novamente.');
    const globalLore = book.universeId
      ? await listLoreEntities({ kind: 'universe', id: book.universeId })
      : [];
    signal?.throwIfAborted();
    const personaIds = new Set(
      [book.personaId, ...chapters.map((chapter) => chapter.personaComplement?.personaId)].filter(
        (id): id is string => Boolean(id),
      ),
    );
    const customNeeded = [...personaIds].some(
      (id) => !DEFAULT_PERSONAS.some((persona) => persona.id === id),
    );
    const library = [
      ...DEFAULT_PERSONAS,
      ...(customNeeded ? await listPersonas(book.authorId) : []),
    ];
    const personas = [...personaIds].map((id) => {
      const persona = library.find((item) => item.id === id);
      if (!persona) throw new Error('Uma persona utilizada está indisponível para backup.');
      return validatePersona(persona);
    });
    signal?.throwIfAborted();
    const scenes = hasScenes ? await captureSceneBookBackup(book.id, sourceSceneRevision) : null;
    const narrative = hasNarrative
      ? await captureNarrativeBookBackup(
          book.id,
          sourceNarrativeRevision,
          sourceSceneRevision,
          signal,
        )
      : null;
    const backup = {
      format: 'writer-book-backup',
      version: narrative
        ? 6
        : scenes
          ? 5
          : acts.length
            ? 4
            : personaIds.size
              ? 3
              : universe
                ? 2
                : 1,
      ...(narrative ? { narrative } : {}),
      ...(scenes ? { scenes } : {}),
      ...(acts.length ? { acts } : {}),
      ...(personaIds.size ? { personas } : {}),
      ...(universe
        ? {
            universe: {
              id: universe.id,
              name: universe.name,
              description: universe.description,
              lore: globalLore.map((entity) => ({
                id: entity.id,
                name: entity.name,
                aliases: entity.aliases,
                category: entity.category,
                summary: entity.summary,
                details: entity.details,
                structuredDetails: entity.structuredDetails,
                relations: entity.relations,
                isPublic: entity.isPublic,
                createdAt: entity.createdAt,
                updatedAt: entity.updatedAt,
              })),
            },
          }
        : {}),
      book: {
        id: book.id,
        ...(book.personaId ? { personaId: book.personaId } : {}),
        ...(book.universeId ? { universeId: book.universeId } : {}),
        title: book.title,
        genre: book.genre ?? '',
        synopsis: book.synopsis ?? '',
        status: book.status,
        coverUrl: book.coverUrl ?? null,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
      },
      chapters: groupChapters(chapters, acts)
        .flatMap((group) => group.chapters)
        .map(
          ({
            id,
            title,
            order,
            content,
            createdAt,
            updatedAt,
            actId,
            personaComplement,
            contentMode,
            assemblyRevision,
            structureRevision,
          }) => ({
            ...(contentMode === 'scenes'
              ? { contentMode, assemblyRevision, structureRevision }
              : {}),
            ...(actId ? { actId } : {}),
            ...(personaComplement ? { personaComplement } : {}),
            id,
            title,
            order,
            content,
            createdAt,
            updatedAt,
          }),
        ),
      lore: lore.map(
        ({
          id,
          name,
          aliases,
          category,
          summary,
          details,
          structuredDetails,
          relations,
          isPublic,
          createdAt,
          updatedAt,
        }) => ({
          id,
          name,
          aliases,
          category,
          summary,
          details,
          relations: relations.map(({ targetEntityId, relationType, description }) => ({
            targetEntityId,
            relationType,
            description,
          })),
          isPublic,
          createdAt,
          updatedAt,
          ...(structuredDetails
            ? {
                structuredDetails: {
                  appearance: structuredDetails.appearance,
                  personality: structuredDetails.personality,
                  history: structuredDetails.history,
                  notes: structuredDetails.notes,
                },
              }
            : {}),
        }),
      ),
    };
    await assertCapture();
    downloadExport(
      new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }),
      exportFileName(book.title, 'json'),
    );
    return;
  }
  const manuscript = createExportDocument(book, chapters, acts);
  await assertCapture();
  if (format === 'pdf') {
    await exportPdf(manuscript, signal);
    return;
  }
  const fileTitle = scope === 'chapter' ? `${book.title} - ${currentChapter?.title}` : book.title;
  if (format === 'docx') {
    const { exportDocx } = await import('./exportDocx');
    const blob = await exportDocx(manuscript, signal);
    signal?.throwIfAborted();
    downloadExport(blob, exportFileName(fileTitle, 'docx'));
  } else {
    const blob = new Blob([exportMarkdown(manuscript)], { type: 'text/markdown;charset=utf-8' });
    signal?.throwIfAborted();
    downloadExport(blob, exportFileName(fileTitle, 'md'));
  }
}
