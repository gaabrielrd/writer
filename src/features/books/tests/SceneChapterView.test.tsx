import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneChapterView } from '../components/SceneChapterView';
import { getChapter } from '../services/bookService';
import { copyChapterDraft } from '../services/chapterCompositionService';
import type { Book } from '../model/book';
import type { Chapter } from '../model/chapter';
vi.mock('../services/bookService', () => ({ getChapter: vi.fn() }));
vi.mock('../services/chapterCompositionService', () => ({ copyChapterDraft: vi.fn() }));
vi.mock('@/features/scenes', () => ({
  ScenePlanner: ({
    initialParentId,
    onManuscriptChange,
  }: {
    initialParentId: string;
    onManuscriptChange: () => void;
  }) => <button onClick={onManuscriptChange}>Alterar cenas de {initialParentId}</button>,
}));
const book: Book = {
  id: 'book',
  title: 'Livro',
  authorId: 'uid',
  status: 'draft',
  wordCount: 2,
  createdAt: 1,
  updatedAt: 2,
};
const chapter: Chapter = {
  id: 'chapter',
  bookId: 'book',
  title: 'Capítulo',
  order: 1,
  content: '<p><strong>Prosa atual</strong><script>segredo()</script></p>',
  contentMode: 'scenes',
  assemblyRevision: 4,
  wordCount: 2,
  createdAt: 1,
  updatedAt: 2,
};
const show = (current = chapter, legacyDraft?: string) =>
  render(
    <MemoryRouter>
      <SceneChapterView book={book} chapter={current} legacyDraft={legacyDraft} />
    </MemoryRouter>,
  );
beforeEach(() => vi.resetAllMocks());
describe('rota do capítulo composto', () => {
  it('permite recuperar por cópia o rascunho anterior sem substituir a composição', async () => {
    vi.mocked(copyChapterDraft).mockResolvedValue();
    show(chapter, '<p><em>Texto não confirmado</em><script>segredo()</script></p>');
    fireEvent.click(screen.getByText('Rascunho local anterior à conversão'));
    expect(screen.getByText('Texto não confirmado')).toBeInTheDocument();
    expect(screen.getByText('Prosa atual')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar texto formatado' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Texto formatado copiado.');
    expect(getChapter).not.toHaveBeenCalled();
  });
  it('falha na cópia preserva a prévia para cópia manual', async () => {
    vi.mocked(copyChapterDraft).mockRejectedValueOnce(new Error('Selecione o texto na prévia'));
    show(chapter, 'Rascunho preservado');
    fireEvent.click(screen.getByText('Rascunho local anterior à conversão'));
    fireEvent.click(screen.getByRole('button', { name: 'Copiar texto formatado' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Selecione o texto na prévia');
    expect(screen.getByText('Rascunho preservado')).toBeInTheDocument();
  });
  it('mostra prosa sanitizada e planejamento contextual sem editor legado', () => {
    const { container } = show();
    expect(screen.getByText('Prosa atual')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[contenteditable]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Alterar cenas de chapter' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao livro' })).toHaveAttribute(
      'href',
      '/books/book',
    );
  });
  it('arquivo ou movimento atualiza a composição mostrada', async () => {
    vi.mocked(getChapter).mockResolvedValueOnce({
      ...chapter,
      content: '<p>Cena restaurada</p>',
      assemblyRevision: 5,
    });
    show();
    fireEvent.click(screen.getByRole('button', { name: /Alterar cenas/ }));
    expect(await screen.findByText('Cena restaurada')).toBeInTheDocument();
    expect(screen.queryByText('Prosa atual')).not.toBeInTheDocument();
  });
  it('composição vazia explica ausência de cenas ativas sem mostrar fonte', () => {
    show({ ...chapter, content: '' });
    expect(screen.getByText(/ainda não tem texto/)).toBeInTheDocument();
  });
  it('remoção concorrente revela falha e permite retomar leitura', async () => {
    vi.mocked(getChapter)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...chapter, content: '<p>Restaurado</p>' });
    show();
    fireEvent.click(screen.getByRole('button', { name: /Alterar cenas/ }));
    expect(await screen.findByText(/capítulo foi removido/)).toBeInTheDocument();
    expect(screen.queryByText('Prosa atual')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Restaurado')).toBeInTheDocument();
  });
  it('resposta antiga não substitui composição de uma atualização mais recente', async () => {
    let older!: (value: Chapter) => void;
    vi.mocked(getChapter)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          older = resolve;
        }),
      )
      .mockResolvedValueOnce({ ...chapter, content: '<p>Mais recente</p>' });
    show();
    const action = screen.getByRole('button', { name: /Alterar cenas/ });
    fireEvent.click(action);
    fireEvent.click(action);
    expect(await screen.findByText('Mais recente')).toBeInTheDocument();
    older({ ...chapter, content: '<p>Antiga</p>' });
    await waitFor(() => expect(screen.queryByText('Antiga')).not.toBeInTheDocument());
  });
});
