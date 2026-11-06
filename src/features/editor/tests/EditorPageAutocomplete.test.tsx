import { createHash, webcrypto } from 'node:crypto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { EditorPage } from '../components/EditorPage';
import * as books from '@/features/books';
import * as lore from '@/features/lore';
import * as ai from '@/features/ai-assistant';
import type { RichEditorProps } from '../components/RichEditor';
import type { Chapter } from '@/features/books';
const state = vi.hoisted(() => ({ credits: vi.fn(), commit: vi.fn(), pending: vi.fn() }));
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const before = '<p>Uma carta chegou.</p>',
  after = '<p>Uma carta chegou. Ela abriu a carta.</p>';
let chapter: Chapter;
vi.mock('@/features/auth', async () => ({
  ...(await vi.importActual<object>('@/features/auth')),
  useAuth: () => ({
    user: { uid: 'author', credits: 5 },
    updateUserCreditsState: state.credits,
    setPendingEditorOperation: state.pending,
  }),
}));
vi.mock('../components/RichEditor', () => ({
  RichEditor: (props: RichEditorProps) => (
    <>
      <p>{props.content}</p>
      <button
        disabled={props.externalBusy}
        onClick={() => {
          props.onBusyChange?.(true);
          void props
            .onAtomicAutocompleteApply?.({
              offer: {
                requestId: 'autocomplete-request-00001',
                bookId: 'book',
                chapterId: 'chapter',
                beforeHash: sha(before),
                text: 'Ela abriu a carta.',
                expiresAt: Date.now() + 60000,
                applyCost: 1,
              },
              before,
              after,
              commit: () => {
                state.commit();
                props.onChange(after);
              },
            })
            .catch(() => undefined)
            .finally(() => props.onBusyChange?.(false));
        }}
      >
        Aceitar continuação
      </button>
    </>
  ),
}));
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', {
    locks: { request: (_name: string, work: () => unknown) => Promise.resolve().then(work) },
  });
  state.credits.mockClear();
  state.commit.mockClear();
  state.pending.mockClear();
  chapter = {
    id: 'chapter',
    bookId: 'book',
    title: 'Capítulo',
    content: before,
    order: 1,
    wordCount: 3,
    createdAt: 1,
    updatedAt: 1,
  };
  vi.spyOn(books, 'getBook').mockResolvedValue({
    id: 'book',
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    wordCount: 3,
    createdAt: 1,
    updatedAt: 1,
  });
  vi.spyOn(books, 'getChapter').mockImplementation(() => Promise.resolve({ ...chapter }));
  vi.spyOn(books, 'listChapters').mockResolvedValue([chapter]);
  vi.spyOn(books, 'subscribeWritingBindings').mockReturnValue(() => undefined);
  vi.spyOn(books, 'updateChapter').mockResolvedValue();
  vi.spyOn(lore, 'listLoreEntities').mockResolvedValue([]);
  vi.spyOn(lore, 'subscribeLoreEntities').mockReturnValue(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
async function open() {
  render(
    <MemoryRouter initialEntries={['/books/book/editor/chapter']}>
      <Routes>
        <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText(before);
}
const receipt = (requestId: string, operationId: string): ai.AutocompleteApplication => ({
  state: 'confirmed',
  requestId,
  operationId,
  fingerprint: 'f'.repeat(64),
  chapterId: 'chapter',
  beforeHash: sha(before),
  afterHash: sha(after),
  credits: 4,
  chargedCredits: 1,
  wordCount: 7,
  updatedAt: 2,
});
it('commits local autocomplete only after receiving the atomic manuscript and credit receipt', async () => {
  const apply = vi
    .spyOn(ai, 'applyLiteraryAutocomplete')
    .mockImplementation((_scope, requestId, operationId) => {
      chapter = { ...chapter, content: after, wordCount: 7 };
      return Promise.resolve(receipt(requestId, operationId));
    });
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Aceitar continuação' }));
  await screen.findByText(after);
  await waitFor(() =>
    expect(
      ai.readPendingAutocompleteApplies('author', { bookId: 'book', chapterId: 'chapter' }),
    ).toEqual([]),
  );
  expect(apply).toHaveBeenCalledOnce();
  expect(state.commit).toHaveBeenCalledOnce();
  expect(state.credits).toHaveBeenCalledWith(4);
  expect(books.updateChapter).not.toHaveBeenCalled();
});
it('recovers a lost reply using its receipt and reads the current server manuscript instead of replaying the offer', async () => {
  let confirmed: ai.AutocompleteApplication;
  const apply = vi
    .spyOn(ai, 'applyLiteraryAutocomplete')
    .mockImplementation((_scope, requestId, operationId) => {
      confirmed = receipt(requestId, operationId);
      chapter = { ...chapter, content: '<p>Versão atual após outra edição.</p>', wordCount: 6 };
      return Promise.reject(new Error('Resposta de rede perdida.'));
    });
  const query = vi
    .spyOn(ai, 'getLiteraryAutocompleteApplication')
    .mockImplementation(() => Promise.resolve({ state: 'confirmed', receipt: confirmed }));
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Aceitar continuação' }));
  await screen.findByText('Resposta de rede perdida.');
  expect(state.commit).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Aceitar continuação' })).toBeDisabled();
  const pending = ai.readPendingAutocompleteApplies('author', {
    bookId: 'book',
    chapterId: 'chapter',
  })[0];
  if (!pending) throw new Error('Aceite pendente ausente.');
  expect(JSON.stringify(pending)).not.toContain(after);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar aceite' }));
  await screen.findByText(chapter.content);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aceitar continuação' })).toBeEnabled(),
  );
  expect(query).toHaveBeenCalledWith(pending, pending.operationId);
  expect(apply).toHaveBeenCalledOnce();
  expect(state.commit).not.toHaveBeenCalled();
  expect(books.updateChapter).not.toHaveBeenCalled();
});
it('cancels an unconfirmed application through the server fence before allowing another acceptance', async () => {
  vi.spyOn(ai, 'applyLiteraryAutocomplete').mockRejectedValue(new Error('Sem resposta.'));
  const abandon = vi
    .spyOn(ai, 'abandonLiteraryAutocompleteApplication')
    .mockResolvedValue({ state: 'canceled' });
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Aceitar continuação' }));
  await screen.findByText('Sem resposta.');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar aceite pendente' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aceitar continuação' })).toBeEnabled(),
  );
  expect(abandon).toHaveBeenCalledOnce();
  expect(screen.getByText(before)).toBeVisible();
  expect(state.commit).not.toHaveBeenCalled();
  expect(state.credits).not.toHaveBeenCalled();
});
