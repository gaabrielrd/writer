import { createHash, webcrypto } from 'node:crypto';
import { useEffect, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPage } from '../components/EditorPage';
import * as books from '@/features/books';
import * as lore from '@/features/lore';
import * as ai from '@/features/ai-assistant';
import type { RichEditorProps } from '../components/RichEditor';
import type { ChatApplyInput, ChatContext } from '@/features/ai-assistant';
import type { Chapter } from '@/features/books';

const state = vi.hoisted(() => ({ credits: vi.fn(), focus: vi.fn() }));
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const identity = { bookId: 'book', chapterId: 'chapter', conversationId: 'conversation' };
const context: ChatContext = {
  source: 'selection',
  text: 'Texto',
  surrounding: '',
  title: '',
  bookTitle: '',
  truncated: false,
  lore: [],
  persona: { instruction: '', version: sha('') },
  target: { hash: sha('<p>Texto</p>'), from: 1, to: 6 },
};
let chapter: Chapter;
vi.mock('@/features/auth', async () => ({
  ...(await vi.importActual<object>('@/features/auth')),
  useAuth: () => ({
    user: { uid: 'author', credits: 5 },
    updateUserCreditsState: state.credits,
    setPendingEditorOperation: vi.fn(),
  }),
}));
vi.mock('../components/RichEditor', () => ({
  RichEditor: (props: RichEditorProps) => {
    const { onChatBridge, onChange } = props;
    useEffect(() => {
      onChatBridge?.({
        capture: () => Promise.resolve(context),
        preview: () => context,
        prepare: () =>
          Promise.resolve({
            before: '<p>Texto</p>',
            after: '<p>Novo texto</p>',
            commit: () => onChange('<p>Novo texto</p>'),
          }),
        setBusy: () => undefined,
        focus: state.focus,
      });
    }, [onChatBridge, onChange]);
    return (
      <>
        <p>{props.content}</p>
        <button onClick={() => props.onOpenChat?.()}>Abrir Assistente Criativo de IA</button>
      </>
    );
  },
}));
vi.mock('@/features/ai-assistant', async () => ({
  ...(await vi.importActual<typeof ai>('@/features/ai-assistant')),
  ChapterChatPanel: (props: {
    open: boolean;
    onApply: (input: ChatApplyInput) => Promise<void>;
  }) => {
    const [error, setError] = useState('');
    return props.open ? (
      <>
        <button
          onClick={() => {
            void props
              .onApply({
                identity,
                message: {
                  id: 'message',
                  role: 'assistant',
                  text: 'Explicação',
                  suggestion: 'Novo texto',
                  state: 'done',
                  createdAt: 1,
                  provider: 'platform',
                  context,
                },
                target: context.target!,
                retarget: false,
                requestId: 'accept',
                replace: true,
              })
              .catch((cause: Error) => setError(cause.message));
          }}
        >
          Aplicar sugestão
        </button>
        {error && <p role="alert">{error}</p>}
      </>
    ) : null;
  },
}));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  localStorage.clear();
  state.credits.mockClear();
  chapter = {
    id: 'chapter',
    bookId: 'book',
    title: 'Capítulo',
    content: '<p>Texto</p>',
    order: 1,
    wordCount: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  vi.spyOn(books, 'getBook').mockResolvedValue({
    id: 'book',
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    wordCount: 1,
    createdAt: 1,
    updatedAt: 1,
  });
  vi.spyOn(books, 'getChapter').mockImplementation(() => Promise.resolve({ ...chapter }));
  vi.spyOn(books, 'listChapters').mockResolvedValue([chapter]);
  vi.spyOn(books, 'updateChapter').mockImplementation((_book, _chapter, input) => {
    chapter = { ...chapter, ...input };
    return Promise.resolve();
  });
  vi.spyOn(books, 'subscribeWritingBindings').mockReturnValue(() => undefined);
  vi.spyOn(lore, 'listLoreEntities').mockResolvedValue([]);
  vi.spyOn(lore, 'subscribeLoreEntities').mockReturnValue(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
async function setup() {
  render(
    <MemoryRouter initialEntries={['/books/book/editor/chapter']}>
      <Routes>
        <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText('<p>Texto</p>');
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }));
  await screen.findByRole('button', { name: 'Aplicar sugestão' });
}
describe('aceite do chat no editor', () => {
  it('confirma texto e créditos juntos e atualiza a cópia salva sem outro autosave', async () => {
    const call = vi.spyOn(ai, 'chapterChatCall').mockImplementation(() => {
      chapter.content = '<p>Novo texto</p>';
      chapter.wordCount = 2;
      return Promise.resolve({ content: chapter.content, credits: 4, wordCount: 2 });
    });
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugestão' }));
    await screen.findByText('<p>Novo texto</p>');
    expect(call).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        action: 'apply',
        expectedHash: sha('<p>Texto</p>'),
        after: '<p>Novo texto</p>',
      }),
    );
    expect(state.credits).toHaveBeenCalledWith(4);
    expect(books.updateChapter).not.toHaveBeenCalled();
  });
  it('recusa mudança remota antes de solicitar débito ou modificar o manuscrito', async () => {
    const call = vi.spyOn(ai, 'chapterChatCall').mockResolvedValue({});
    await setup();
    chapter.content = '<p>Escrita em outra aba</p>';
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugestão' }));
    await screen.findByText(/mudou em outra sessão/);
    expect(call).not.toHaveBeenCalled();
    expect(screen.getByText('<p>Texto</p>')).toBeVisible();
    expect(state.credits).not.toHaveBeenCalled();
  });
  it('preserva operação incerta, bloqueia outro aceite e recupera o mesmo recibo', async () => {
    const call = vi
      .spyOn(ai, 'chapterChatCall')
      .mockRejectedValueOnce(
        new ai.ChapterChatError(
          Object.assign(new Error('Falha de rede'), { code: 'functions/unavailable' }),
        ),
      )
      .mockImplementation(() => {
        chapter.content = '<p>Novo texto</p>';
        return Promise.resolve({
          content: chapter.content,
          credits: 4,
          wordCount: 2,
        });
      });
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugestão' }));
    await screen.findByText('Falha de rede');
    await screen.findByRole('button', { name: 'Recuperar aceite' });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugestão' }));
    await screen.findByText(/Recupere o aceite pendente/);
    expect(call).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar aceite' }));
    await screen.findByText('<p>Novo texto</p>');
    expect(call.mock.calls[1]![1]).toEqual(call.mock.calls[0]![1]);
    expect(state.credits).toHaveBeenCalledWith(4);
  });
  it('retoma recibo após reload sem restaurar texto antigo sobre edições mais recentes', async () => {
    localStorage.setItem(
      'writer:chapter-chat-apply:author:book:chapter',
      JSON.stringify({
        identity,
        requestId: 'accept',
        messageId: 'message',
        expectedHash: sha('<p>Texto</p>'),
        sourceHash: context.target!.hash,
        after: '<p>Novo texto</p>',
        retarget: false,
      }),
    );
    vi.spyOn(ai, 'chapterChatCall').mockResolvedValue({
      content: '<p>Novo texto</p>',
      credits: 4,
      wordCount: 2,
    });
    await setup();
    chapter.content = '<p>Edição posterior</p>';
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar aceite' }));
    await screen.findByText('<p>Edição posterior</p>');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Recuperar aceite' })).toBeNull(),
    );
    expect(screen.queryByText('<p>Novo texto</p>')).toBeNull();
  });
  it('libera outro aceite quando a recuperação confirma rejeição sem gravar nem debitar', async () => {
    const call = vi
      .spyOn(ai, 'chapterChatCall')
      .mockRejectedValueOnce(new ai.ChapterChatError(new Error('Falha de rede')))
      .mockRejectedValueOnce(
        new ai.ChapterChatError(
          Object.assign(new Error('O capítulo mudou'), { code: 'functions/failed-precondition' }),
        ),
      )
      .mockImplementation(() => {
        chapter.content = '<p>Novo texto</p>';
        return Promise.resolve({ content: chapter.content, credits: 4, wordCount: 2 });
      });
    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugestão' }));
    await screen.findByText('Falha de rede');
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar aceite' }));
    await screen.findByText('O capítulo mudou');
    expect(screen.queryByRole('button', { name: 'Recuperar aceite' })).toBeNull();
    expect(screen.getByText('<p>Texto</p>')).toBeVisible();
    expect(state.credits).not.toHaveBeenCalled();
    expect(localStorage.getItem('writer:chapter-chat-apply:author:book:chapter')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugestão' }));
    await screen.findByText('<p>Novo texto</p>');
    expect(call).toHaveBeenCalledTimes(3);
  });
});
