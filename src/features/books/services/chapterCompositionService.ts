import { renderRichText } from '@/shared/lib';
import {
  getScene,
  getSceneGroup,
  listSceneGroups,
  listSceneReferences,
  listScenes,
  listSceneSources,
  readSceneAssembly,
  type SceneDocument,
  type SceneGroup,
  type SceneReferenceView,
  type SceneSource,
} from '@/features/scenes';
import type { Chapter } from '../model/chapter';

const changed = () => new Error('As cenas mudaram durante a leitura. Atualize e tente novamente.');
export async function copyChapterDraft(content: string): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')
    throw new Error(
      'A cópia formatada não está disponível neste navegador. Selecione o texto na prévia para copiar.',
    );
  const html = renderRichText(content);
  const template = document.createElement('template');
  template.innerHTML = html;
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([template.content.textContent ?? ''], { type: 'text/plain' }),
    }),
  ]);
}
async function contentHash(content: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Resolve only canonical prose. Frozen conversion sources are never a fallback. */
export async function resolveChapterContent(bookId: string, chapter: Chapter): Promise<Chapter> {
  if (chapter.bookId !== bookId) throw new Error('O capítulo não pertence a este livro.');
  if (chapter.contentMode !== 'scenes') return chapter;
  const target = { kind: 'book' as const, id: bookId };
  const detail = await getSceneGroup({ target, parentId: chapter.id });
  if (!detail || detail.group.deleting || detail.group.contentMode !== 'scenes') throw changed();
  const revision = chapter.assemblyRevision ?? detail.group.assemblyRevision;
  if (detail.group.assemblyRevision !== revision) throw changed();
  const fragments: string[] = [];
  const visited = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let words = 0;
  do {
    const page = await readSceneAssembly({
      target,
      parentId: chapter.id,
      expectedAssemblyRevision: revision,
      cursor,
      limit: 50,
    });
    if (page.assemblyRevision !== revision) throw changed();
    for (const item of page.items) {
      if (visited.has(item.id) || (await contentHash(item.content)) !== item.hash) throw changed();
      visited.add(item.id);
      fragments.push(renderRichText(item.content));
      words += item.wordCount;
    }
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw changed();
    if (cursor) cursors.add(cursor);
  } while (cursor);
  const final = await getSceneGroup({ target, parentId: chapter.id });
  if (
    !final ||
    final.group.deleting ||
    final.group.contentMode !== 'scenes' ||
    final.group.assemblyRevision !== revision
  )
    throw changed();
  return {
    ...chapter,
    content: fragments.join('\n'),
    wordCount: words,
    assemblyRevision: revision,
  };
}

export interface SceneBookBackup {
  schemaVersion: 1;
  projectRevision: number;
  groups: Omit<
    SceneGroup,
    'rebalanceOperationId' | 'deletionOperationId' | 'rebalancing' | 'deleting'
  >[];
  scenes: (Omit<SceneDocument, 'ownerId' | 'project' | 'group' | 'projectRevision'> & {
    references: SceneReferenceView[];
  })[];
  sources: SceneSource[];
}

export async function assertSceneBookRevision(bookId: string, revision: number): Promise<void> {
  const page = await listSceneGroups({ target: { kind: 'book', id: bookId }, limit: 1 });
  if (page.projectRevision !== revision) throw changed();
}

/** Private backup includes archived/unassigned prose and the original conversion source. */
export async function captureSceneBookBackup(
  bookId: string,
  expectedProjectRevision: number,
): Promise<SceneBookBackup> {
  const target = { kind: 'book' as const, id: bookId };
  const backup: SceneBookBackup = {
    schemaVersion: 1,
    projectRevision: expectedProjectRevision,
    groups: [],
    scenes: [],
    sources: [],
  };
  const expect = (revision: number) => {
    if (revision !== expectedProjectRevision) throw changed();
  };
  const pageCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await listSceneGroups({ target, cursor, limit: 50 });
    expect(page.projectRevision);
    if (page.items.some((group) => group.deleting))
      throw new Error('Conclua a remoção dos capítulos antes de fazer o backup.');
    backup.groups.push(
      ...page.items.map((group) => ({
        id: group.id,
        title: group.title,
        kind: group.kind,
        contentMode: group.contentMode,
        assemblyRevision: group.assemblyRevision,
        structureRevision: group.structureRevision,
        wordCount: group.wordCount,
        sceneCount: group.sceneCount,
        rankSlot: group.rankSlot,
        order: group.order,
        updatedAt: group.updatedAt,
        ...(group.actId !== undefined ? { actId: group.actId } : {}),
      })),
    );
    cursor = page.nextCursor;
    if (cursor && pageCursors.has(cursor)) throw changed();
    if (cursor) pageCursors.add(cursor);
  } while (cursor);
  const sceneIds = new Set<string>();
  for (const parentId of [
    null,
    ...backup.groups.map((group) => group.id).filter((id): id is string => id !== null),
  ]) {
    for (const archived of [false, true]) {
      cursor = null;
      pageCursors.clear();
      do {
        const page = await listScenes({
          target,
          parentId,
          archived,
          stage: 'all',
          cursor,
          limit: 50,
        });
        expect(page.projectRevision);
        for (const summary of page.items) {
          if (sceneIds.has(summary.id)) throw changed();
          sceneIds.add(summary.id);
          const scene = await getScene({ target, sceneId: summary.id });
          if (
            !scene ||
            scene.revision !== summary.revision ||
            scene.bodyHash !== summary.bodyHash ||
            (await contentHash(scene.content)) !== scene.bodyHash
          )
            throw changed();
          expect(scene.projectRevision);
          const references: SceneReferenceView[] = [];
          const referenceCursors = new Set<string>();
          let referenceCursor: string | null = null;
          do {
            const refs = await listSceneReferences({
              target,
              sceneId: scene.id,
              cursor: referenceCursor,
              limit: 50,
            });
            expect(refs.projectRevision);
            references.push(...refs.items);
            referenceCursor = refs.nextCursor;
            if (referenceCursor && referenceCursors.has(referenceCursor)) throw changed();
            if (referenceCursor) referenceCursors.add(referenceCursor);
          } while (referenceCursor);
          backup.scenes.push({
            id: scene.id,
            schemaVersion: scene.schemaVersion,
            revision: scene.revision,
            title: scene.title,
            parentId: scene.parentId,
            ...(scene.formerParentId !== undefined ? { formerParentId: scene.formerParentId } : {}),
            stage: scene.stage,
            archived: scene.archived,
            rank: scene.rank,
            wordCount: scene.wordCount,
            bodyHash: scene.bodyHash,
            bodyBytes: scene.bodyBytes,
            createdAt: scene.createdAt,
            updatedAt: scene.updatedAt,
            content: scene.content,
            planning: scene.planning,
            references,
          });
        }
        cursor = page.nextCursor;
        if (cursor && pageCursors.has(cursor)) throw changed();
        if (cursor) pageCursors.add(cursor);
      } while (cursor);
    }
  }
  cursor = null;
  pageCursors.clear();
  do {
    const page = await listSceneSources({ target, expectedProjectRevision, cursor, limit: 50 });
    expect(page.projectRevision);
    for (const source of page.items) {
      if (
        'content' in source.original ||
        (await contentHash(source.content)) !== source.hash ||
        backup.sources.some((existing) => existing.id === source.id)
      )
        throw changed();
      backup.sources.push(source);
    }
    cursor = page.nextCursor;
    if (cursor && pageCursors.has(cursor)) throw changed();
    if (cursor) pageCursors.add(cursor);
  } while (cursor);
  await assertSceneBookRevision(bookId, expectedProjectRevision);
  return backup;
}
