import { createHash, webcrypto } from 'node:crypto';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  resolveChapterContent,
  captureSceneBookBackup,
  copyChapterDraft,
} from '../services/chapterCompositionService';
import type { Chapter } from '../model/chapter';
import type { SceneGroup } from '@/features/scenes';

const api = vi.hoisted(() => ({
  getScene: vi.fn(),
  getSceneGroup: vi.fn(),
  listSceneGroups: vi.fn(),
  listSceneReferences: vi.fn(),
  listScenes: vi.fn(),
  listSceneSources: vi.fn(),
  readSceneAssembly: vi.fn(),
}));
vi.mock('@/features/scenes', () => api);
vi.mock('@/shared/lib', async () => ({
  renderRichText: (await import('@/shared/lib/sanitizeRichText')).renderRichText,
}));
const hash = (content: string) => createHash('sha256').update(content).digest('hex');
const legacy: Chapter = {
  id: 'chapter',
  bookId: 'book',
  title: 'Capítulo',
  order: 1,
  wordCount: 2,
  content: 'fonte congelada',
  createdAt: 1,
  updatedAt: 2,
};
const composed: Chapter = { ...legacy, contentMode: 'scenes', assemblyRevision: 4 };
const group: SceneGroup = {
  id: 'chapter',
  title: 'Capítulo',
  kind: 'chapter',
  contentMode: 'scenes',
  assemblyRevision: 4,
  structureRevision: 3,
  wordCount: 2,
  sceneCount: 2,
  rankSlot: 'A',
  order: 1,
  updatedAt: 2,
};
const page = (items: unknown[], nextCursor: string | null = null) => ({
  items,
  nextCursor,
  projectRevision: 9,
});
const body = (id: string, content: string) => ({
  id,
  revision: 1,
  content,
  hash: hash(content),
  wordCount: 1,
});
const scene = (id: string, parentId: string | null, archived: boolean) => ({
  id,
  parentId,
  archived,
  revision: 1,
  bodyHash: hash(id),
  content: id,
  planning: { objective: 'segredo', conflict: '', pointOfView: '' },
  ownerId: 'UID-NAO-EXPORTAR',
  projectRevision: 9,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  api.getSceneGroup.mockResolvedValue({ group });
  api.listSceneGroups.mockResolvedValue(page([group]));
  api.listSceneReferences.mockResolvedValue(page([]));
  api.listScenes.mockResolvedValue(page([]));
  api.listSceneSources.mockResolvedValue(page([]));
});
afterEach(() => vi.unstubAllGlobals());

describe('rascunho anterior à conversão', () => {
  it('copia conteúdo rico sanitizado e alternativa simples sem executar HTML', async () => {
    class TestClipboardItem {
      readonly data: Record<string, Blob>;
      constructor(data: Record<string, Blob>) {
        this.data = data;
      }
    }
    const write = vi.fn<(items: TestClipboardItem[]) => Promise<void>>().mockResolvedValue();
    vi.stubGlobal('navigator', { clipboard: { write } });
    vi.stubGlobal('ClipboardItem', TestClipboardItem);
    await copyChapterDraft('<p><strong>Texto</strong><script>segredo()</script></p>');
    const item = write.mock.calls[0]?.[0][0];
    const read = (blob: Blob) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('Texto indisponível'));
        reader.onerror = reject;
        reader.readAsText(blob);
      });
    expect(await read(item!.data['text/html']!)).toBe('<p><strong>Texto</strong></p>');
    expect(await read(item!.data['text/plain']!)).toBe('Texto');
  });
  it('navegador sem cópia formatada mantém uma alternativa explícita', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('ClipboardItem', undefined);
    await expect(copyChapterDraft('Texto')).rejects.toThrow(/Selecione o texto/);
  });
});

describe('composição canônica', () => {
  it('mantém legado intacto sem consultar ou converter cenas', async () => {
    expect(await resolveChapterContent('book', legacy)).toBe(legacy);
    expect(api.getSceneGroup).not.toHaveBeenCalled();
  });
  it('reúne prosa rica de todas as páginas em ordem, sem fonte ou notas', async () => {
    api.readSceneAssembly
      .mockResolvedValueOnce({
        ...page([body('one', '<p><strong>A</strong></p>')], 'second'),
        assemblyRevision: 4,
      })
      .mockResolvedValueOnce({
        ...page([body('two', '<blockquote>B</blockquote><script>segredo()</script>')]),
        assemblyRevision: 4,
      });
    const result = await resolveChapterContent('book', composed);
    expect(result.content).toBe('<p><strong>A</strong></p>\n<blockquote>B</blockquote>');
    expect(result.wordCount).toBe(2);
    expect(result.content).not.toMatch(/fonte|segredo/);
    expect(api.readSceneAssembly).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: 'second', expectedAssemblyRevision: 4 }),
    );
  });
  it('capítulo sem cenas ativas fica vazio, sem fallback à fonte', async () => {
    api.readSceneAssembly.mockResolvedValue({ ...page([]), assemblyRevision: 4 });
    expect((await resolveChapterContent('book', composed)).content).toBe('');
  });
  it.each([
    null,
    { group: { ...group, deleting: true } },
    { group: { ...group, contentMode: 'legacy' } },
    { group: { ...group, assemblyRevision: 5 } },
  ])('recusa agrupador removido ou revisão divergente antes da leitura (%#)', async (value) => {
    api.getSceneGroup.mockResolvedValue(value);
    await expect(resolveChapterContent('book', composed)).rejects.toThrow(/mudaram/);
    expect(api.readSceneAssembly).not.toHaveBeenCalled();
  });
  it('não oferece composição parcial se outra página falhar', async () => {
    api.readSceneAssembly
      .mockResolvedValueOnce({ ...page([body('one', 'A')], 'second'), assemblyRevision: 4 })
      .mockRejectedValueOnce(new Error('rede'));
    await expect(resolveChapterContent('book', composed)).rejects.toThrow('rede');
  });
  it('recusa corpo cujo hash não corresponde ao resumo', async () => {
    api.readSceneAssembly.mockResolvedValue({
      ...page([{ ...body('one', 'A'), hash: hash('B') }]),
      assemblyRevision: 4,
    });
    await expect(resolveChapterContent('book', composed)).rejects.toThrow(/mudaram/);
  });
  it('recusa alteração no final da captura', async () => {
    api.getSceneGroup
      .mockResolvedValueOnce({ group })
      .mockResolvedValueOnce({ group: { ...group, assemblyRevision: 5 } });
    api.readSceneAssembly.mockResolvedValue({ ...page([body('one', 'A')]), assemblyRevision: 4 });
    await expect(resolveChapterContent('book', composed)).rejects.toThrow(/mudaram/);
  });
  it('recusa cursor repetido e cenas duplicadas sem concatenar de novo', async () => {
    api.readSceneAssembly.mockResolvedValue({
      ...page([body('one', 'A')], 'loop'),
      assemblyRevision: 4,
    });
    await expect(resolveChapterContent('book', composed)).rejects.toThrow(/mudaram/);
  });
  it('recusa escopo alheio antes de consultar', async () => {
    await expect(resolveChapterContent('other', composed)).rejects.toThrow(/não pertence/);
    expect(api.getSceneGroup).not.toHaveBeenCalled();
  });
});

describe('backup privado de cenas', () => {
  it('preserva cenas ativas, arquivadas e sem agrupador, referências e fonte original uma vez', async () => {
    api.listScenes.mockImplementation(
      ({ parentId, archived }: { parentId: string | null; archived: boolean }) =>
        Promise.resolve(
          page(
            parentId === null && !archived
              ? [scene('unassigned', null, false)]
              : parentId === 'chapter'
                ? [scene(archived ? 'archived' : 'active', parentId, archived)]
                : [],
          ),
        ),
    );
    api.getScene.mockImplementation(({ sceneId }: { sceneId: string }) =>
      Promise.resolve(
        scene(sceneId, sceneId === 'unassigned' ? null : 'chapter', sceneId === 'archived'),
      ),
    );
    api.listSceneReferences.mockResolvedValueOnce(
      page([
        {
          id: 'ref',
          available: false,
          reference: { kind: 'universe', scopeId: 'removed', entityId: 'entity' },
        },
      ]),
    );
    const source = {
      id: 'chapter',
      content: 'fonte original',
      hash: hash('fonte original'),
      original: { title: 'Título antigo', order: 1 },
    };
    api.listSceneSources.mockResolvedValue(page([source]));
    const result = await captureSceneBookBackup('book', 9);
    expect(result.scenes.map((item) => item.id)).toEqual(['unassigned', 'active', 'archived']);
    expect(result.scenes.every((item) => item.planning.objective === 'segredo')).toBe(true);
    expect(result.scenes[0]?.references[0]).toMatchObject({ available: false });
    expect(result.sources).toEqual([source]);
    expect(JSON.stringify(result)).not.toContain('UID-NAO-EXPORTAR');
    expect({ ...result.sources[0]?.original, content: result.sources[0]?.content }).toEqual({
      title: 'Título antigo',
      order: 1,
      content: 'fonte original',
    });
  });
  it('não gera backup com remoção pendente ou revisão divergente', async () => {
    api.listSceneGroups.mockResolvedValueOnce(page([{ ...group, deleting: true }]));
    await expect(captureSceneBookBackup('book', 9)).rejects.toThrow(/remoção/);
    api.listSceneGroups.mockResolvedValueOnce({ ...page([group]), projectRevision: 10 });
    await expect(captureSceneBookBackup('book', 9)).rejects.toThrow(/mudaram/);
  });
  it('recusa cena alterada após listar e corpo inconsistente', async () => {
    api.listScenes.mockResolvedValueOnce(page([scene('one', null, false)]));
    api.getScene.mockResolvedValueOnce({ ...scene('one', null, false), revision: 2 });
    await expect(captureSceneBookBackup('book', 9)).rejects.toThrow(/mudaram/);
  });
  it('recusa projeto alterado antes de fechar o backup', async () => {
    api.listSceneGroups
      .mockResolvedValueOnce(page([group]))
      .mockResolvedValueOnce({ ...page([group]), projectRevision: 10 });
    await expect(captureSceneBookBackup('book', 9)).rejects.toThrow(/mudaram/);
  });
});
