import { useState } from 'react';
import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { chooseDropdown } from '@/test/dropdown';
import { BookLoreCreationEditor } from '../components/BookLoreCreationEditor';
import { BookLoreCreationRecoveries } from '../components/BookLoreCreationRecoveries';
import type { DurableBookLoreCreationSnapshot } from '../services/bookLoreCreationDurableOperation';
import type { BookLoreCreationInput } from '../services/bookLoreCreationPlan';
const s = vi.hoisted(() => {
  const user: { uid: string; displayName?: string } = { uid: 'author' };
  return {
    user,
    actor: { uid: 'author' },
    notify: () => {},
    create: vi.fn<(input: Omit<BookLoreCreationInput, 'uid'>) => unknown>(),
    resume: vi.fn<(id: string) => unknown>(),
    ticket: vi.fn(),
    list: vi.fn(),
    initialize: vi.fn(),
    advance: vi.fn(),
    apply: vi.fn(),
    cancel: vi.fn(),
    discard: vi.fn(),
    draft: vi.fn(),
    view: {} as DurableBookLoreCreationSnapshot,
  };
});
vi.mock('@/features/auth', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useAuth: () => ({
      user: useSyncExternalStore(
        (notify) => {
          s.notify = notify;
          return () => {};
        },
        () => s.user,
      ),
    }),
  };
});
vi.mock('../services/bookLoreEditService', () => ({
  currentBookLoreActor: () => s.actor,
  bookLoreEditSession: () => ({
    createLore: s.create,
    resumeLoreCreation: s.resume,
    creationTicket: s.ticket,
    creationPreparations: s.list,
  }),
}));
const core = () => ({
  loreId: 'created',
  pending: { production: null, cleanup: null, failedCancel: null },
});
const operation = () => ({
  snapshot: () => ({ ...s.view }),
  initialize: s.initialize,
  advance: s.advance,
  apply: s.apply,
  cancel: s.cancel,
  discard: s.discard,
  readDraft: s.draft,
});
beforeEach(() => {
  vi.resetAllMocks();
  s.user = { uid: 'author' };
  s.actor = { uid: 'author' };
  s.view = {
    writeId: 'draft',
    bookId: 'book',
    phase: 'opening',
    initialized: false,
    hasRecoveryCopy: false,
    requiresInput: false,
    savePending: false,
    collectionPending: false,
    canApply: false,
    jobsClosed: false,
    keyReleased: false,
    copyDiscarded: false,
    operation: core() as DurableBookLoreCreationSnapshot['operation'],
  };
  s.create.mockImplementation((input) => {
    s.view = { ...s.view, writeId: input.writeId };
    return operation();
  });
  s.resume.mockImplementation((id) => {
    s.view = { ...s.view, writeId: id };
    return operation();
  });
  s.ticket.mockResolvedValue({ writeId: 'resume', bookId: 'book', loreId: 'created' });
  s.list.mockResolvedValue({ items: [], next: null });
  s.initialize.mockImplementation(() => {
    s.view = { ...s.view, phase: 'preparing', initialized: true, hasRecoveryCopy: true };
    return Promise.resolve(s.view);
  });
  s.advance.mockImplementation(() => {
    s.view = { ...s.view, phase: 'ready', canApply: true };
    return Promise.resolve(s.view);
  });
  s.apply.mockImplementation(() => {
    s.view = { ...s.view, phase: 'applied', canApply: false, jobsClosed: true };
    return Promise.resolve(s.view);
  });
  s.cancel.mockImplementation(() => {
    s.view = { ...s.view, phase: 'cancelled', canApply: false, jobsClosed: true };
    return Promise.resolve(s.view);
  });
  s.discard.mockImplementation(() => {
    s.view = {
      ...s.view,
      phase: s.view.phase === 'applied' ? 'applied' : 'cancelled',
      canApply: false,
      jobsClosed: true,
      keyReleased: true,
      copyDiscarded: true,
      hasRecoveryCopy: false,
    };
    return Promise.resolve(s.view);
  });
  s.draft.mockResolvedValue({
    uid: 'author',
    bookId: 'book',
    writeId: 'resume',
    data: { name: '\ufeff Original\r\n', category: 'other', details: '\ufeff PRIVATE\r\n' },
  });
});
function editor(props: Partial<React.ComponentProps<typeof BookLoreCreationEditor>> = {}) {
  const onClose = vi.fn(),
    onCreated = vi.fn(),
    router = createMemoryRouter([
      {
        path: '/',
        element: (
          <BookLoreCreationEditor
            open
            bookId="book"
            onClose={onClose}
            onCreated={onCreated}
            {...props}
          />
        ),
      },
      { path: '/away', element: <p>Outra tela</p> },
    ]);
  render(<RouterProvider router={router} />);
  return { user: userEvent.setup(), onClose, onCreated, router };
}
const deferred = () => {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  return { resolve, promise };
};
it('prepares literal fields privately, freezes review and creates only after a separate click', async () => {
  const { user, onCreated, onClose } = editor();
  await user.type(screen.getByLabelText('Nome', { exact: true }), '  Luna 🌙  ');
  await user.click(screen.getByRole('button', { name: 'Preparar ficha' }));
  expect(await screen.findByRole('button', { name: 'Criar ficha' })).toBeEnabled();
  expect(s.create).toHaveBeenCalledTimes(1);
  expect(s.create.mock.calls[0]![0]).toMatchObject({
    bookId: 'book',
    data: { name: '  Luna 🌙  ', category: 'character', isPublic: false },
  });
  expect(s.create.mock.calls[0]![0].data).not.toHaveProperty('summary');
  expect(screen.getByLabelText('Nome', { exact: true })).toHaveAttribute('readonly');
  expect(s.apply).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Criar ficha' }));
  expect(await screen.findByText('Ficha criada no livro.')).toBeVisible();
  expect(onCreated).toHaveBeenCalledExactlyOnceWith('created');
  await user.click(screen.getAllByRole('button', { name: 'Fechar' })[0]!);
  expect(onClose).toHaveBeenCalledTimes(1);
});
it('preserves draft and the same operation across a preparation error and retry, focusing the error', async () => {
  s.initialize.mockRejectedValueOnce(Error('Rede indisponível'));
  const { user } = editor();
  await user.type(screen.getByLabelText('Nome', { exact: true }), '  Persistir  ');
  await user.click(screen.getByRole('button', { name: 'Preparar ficha' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Rede indisponível');
  await waitFor(() => expect(alert).toHaveFocus());
  expect(screen.getByLabelText('Nome', { exact: true })).toHaveValue('  Persistir  ');
  await user.click(screen.getByRole('button', { name: 'Retomar preparação' }));
  expect(await screen.findByRole('button', { name: 'Criar ficha' })).toBeEnabled();
  expect(s.create).toHaveBeenCalledTimes(1);
});
it('can cancel while initialize is held, without advancing after the late response', async () => {
  const held = deferred();
  s.initialize.mockReturnValueOnce(held.promise);
  const { user } = editor();
  await user.type(screen.getByLabelText('Nome', { exact: true }), 'Held');
  await user.click(screen.getByRole('button', { name: 'Preparar ficha' }));
  await user.click(screen.getByRole('button', { name: 'Cancelar preparação' }));
  expect(await screen.findByText(/Preparação cancelada/)).toBeVisible();
  expect(s.cancel).toHaveBeenCalledTimes(1);
  await act(async () => {
    held.resolve(s.view);
    await held.promise;
  });
  expect(s.advance).not.toHaveBeenCalled();
  expect(s.apply).not.toHaveBeenCalled();
});
it('requires explicit discard confirmation and preserves a previously created result', async () => {
  const { user, onCreated } = editor();
  await user.click(screen.getByRole('button', { name: 'Preparar ficha' }));
  await user.click(await screen.findByRole('button', { name: 'Criar ficha' }));
  await user.click(screen.getByRole('button', { name: 'Descartar cópia' }));
  const warning = await screen.findByRole('alert');
  expect(warning).toHaveTextContent('Uma ficha já criada será mantida');
  await waitFor(() => expect(warning).toHaveFocus());
  expect(s.discard).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Manter cópia' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Descartar cópia' })).toHaveFocus(),
  );
  await user.click(screen.getByRole('button', { name: 'Descartar cópia' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar descarte da cópia' }));
  expect(await screen.findByText('Cópia removida deste dispositivo.')).toBeVisible();
  expect(onCreated).toHaveBeenCalledTimes(1);
});
it('checks ticket book scope before resuming, reading or cancelling another book', async () => {
  s.ticket.mockResolvedValue({ writeId: 'resume', bookId: 'other', loreId: 'other-secret' });
  const { user } = editor({ resumeWriteId: 'resume' });
  await user.click(screen.getByRole('button', { name: 'Retomar preparação' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('outro livro');
  expect(s.resume).not.toHaveBeenCalled();
  expect(s.draft).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cancelar preparação' }));
  expect(s.cancel).not.toHaveBeenCalled();
});
it('opens a protected creation draft only on request and checks the returned origin', async () => {
  const { user } = editor({ resumeWriteId: 'resume' });
  expect(s.resume).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Nome', { exact: true })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retomar preparação' }));
  expect(await screen.findByLabelText('Nome', { exact: true })).toHaveValue('\ufeff Original\n');
  expect(s.ticket).toHaveBeenCalledWith('resume');
  expect(s.resume).toHaveBeenCalledWith('resume');
  await chooseDropdown(user, screen.getByRole('combobox', { name: 'Campo em edição' }), 'Detalhes');
  expect(screen.getByLabelText('Detalhes', { exact: true })).toHaveValue('\ufeff PRIVATE\n');
  expect(s.apply).not.toHaveBeenCalled();
});
it('never renders a private draft returned for another book', async () => {
  s.draft.mockResolvedValue({
    uid: 'author',
    bookId: 'other',
    writeId: 'resume',
    data: { name: 'SECRET_OTHER' },
  });
  const { user } = editor({ resumeWriteId: 'resume' });
  await user.click(screen.getByRole('button', { name: 'Retomar preparação' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('outra preparação');
  expect(screen.queryByText('SECRET_OTHER')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Nome', { exact: true })).not.toBeInTheDocument();
});
it('verifies an uncertain creation through advance without calling apply', async () => {
  s.initialize.mockImplementationOnce(() => {
    s.view = {
      ...s.view,
      phase: 'ready',
      initialized: true,
      hasRecoveryCopy: true,
      canApply: true,
      operation: {
        ...core(),
        pending: {
          production: { method: 'adoptBookLoreEditGeneration', requestHash: 'a'.repeat(64) },
        },
      } as DurableBookLoreCreationSnapshot['operation'],
    };
    return Promise.resolve(s.view);
  });
  s.advance.mockImplementation(() => {
    s.view = { ...s.view, phase: 'applied', jobsClosed: true, canApply: false };
    return Promise.resolve(s.view);
  });
  const { user, onCreated } = editor({ resumeWriteId: 'resume' });
  await user.click(screen.getByRole('button', { name: 'Retomar preparação' }));
  expect(await screen.findByText('Ficha criada no livro.')).toBeVisible();
  expect(s.advance).toHaveBeenCalledTimes(1);
  expect(s.apply).not.toHaveBeenCalled();
  expect(onCreated).toHaveBeenCalledExactlyOnceWith('created');
});
it('warns before closing unsaved text and blocks route navigation until the user chooses', async () => {
  const { user, onClose, router } = editor();
  await user.type(screen.getByLabelText('Nome', { exact: true }), 'Unsaved');
  await user.click(screen.getAllByRole('button', { name: 'Fechar' })[0]!);
  expect(await screen.findByRole('alert')).toHaveTextContent('somente nesta aba');
  await user.click(screen.getByRole('button', { name: 'Continuar aqui' }));
  expect(onClose).not.toHaveBeenCalled();
  act(() => {
    void router.navigate('/away');
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('somente nesta aba');
  await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }));
  expect(await screen.findByText('Outra tela')).toBeVisible();
});
it('keeps edits after profile updates but clears old fields on SDK actor replacement', async () => {
  const { user } = editor();
  await user.type(screen.getByLabelText('Nome', { exact: true }), 'Private draft');
  act(() => {
    s.user = { uid: 'author', displayName: 'Updated' };
    s.notify();
  });
  expect(screen.getByLabelText('Nome', { exact: true })).toHaveValue('Private draft');
  act(() => {
    s.actor = { uid: 'author' };
    s.user = { uid: 'author' };
    s.notify();
  });
  await waitFor(() => expect(screen.getByLabelText('Nome', { exact: true })).toHaveValue(''));
});
it('lists only this book and incomplete discards, without creating or reading a draft', async () => {
  s.list.mockResolvedValue({
    items: [
      { bookId: 'book', writeId: 'own', loreId: 'created', draft: { complete: true } },
      { bookId: 'other', writeId: 'foreign', loreId: 'secret' },
      { bookId: 'book', writeId: 'gone', loreId: 'gone', discard: { phase: 'complete' } },
    ],
    next: 'next-page',
  });
  const onSelect = vi.fn(),
    user = userEvent.setup();
  render(<BookLoreCreationRecoveries bookId="book" onSelect={onSelect} />);
  await user.click(await screen.findByRole('button', { name: 'Retomar criação 1' }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('own');
  expect(s.resume).not.toHaveBeenCalled();
  expect(s.draft).not.toHaveBeenCalled();
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Próxima página' }));
  await waitFor(() => expect(s.list).toHaveBeenLastCalledWith('next-page', 50));
});

it('preserves large optional text without a field cap', async () => {
  const { user } = editor(),
    text = '\ufeff' + ' x '.repeat(60000) + '\n';
  await chooseDropdown(user, screen.getByRole('combobox', { name: 'Campo em edição' }), 'Detalhes');
  await user.click(screen.getByRole('button', { name: 'Adicionar detalhes' }));
  fireEvent.change(screen.getByLabelText('Detalhes', { exact: true }), { target: { value: text } });
  await user.click(screen.getByRole('button', { name: 'Preparar ficha' }));
  expect(await screen.findByRole('button', { name: 'Criar ficha' })).toBeEnabled();
  expect(s.create.mock.calls[0]![0].data.details).toBe(text);
});
it('clones an authorized cancelled draft explicitly with literals, duplicates and absences intact', async () => {
  const raw = {
    name: '\ufeff Original\r\n',
    category: 'other',
    details: '\ufeff Own\r\n',
    aliases: ['', 'same', 'same'],
  };
  s.draft.mockResolvedValue({ uid: 'author', bookId: 'book', writeId: 'resume', data: raw });
  s.initialize.mockImplementationOnce(() => {
    s.view = {
      ...s.view,
      phase: 'cancelled',
      hasRecoveryCopy: true,
      initialized: true,
      jobsClosed: true,
    };
    return Promise.resolve(s.view);
  });
  const { user } = editor({ resumeWriteId: 'resume' });
  await user.click(screen.getByRole('button', { name: 'Retomar preparação' }));
  await user.click(await screen.findByRole('button', { name: 'Usar rascunho em nova criação' }));
  await user.click(screen.getByRole('button', { name: 'Preparar ficha' }));
  await screen.findByRole('button', { name: 'Criar ficha' });
  expect(s.create).toHaveBeenCalledTimes(1);
  expect(s.create.mock.calls[0]![0].writeId).not.toBe('resume');
  expect(s.create.mock.calls[0]![0].data).toEqual(raw);
});
it('discards while initialization is held and ignores its late result', async () => {
  const held = deferred();
  s.initialize.mockReturnValueOnce(held.promise);
  const { user } = editor();
  await user.click(screen.getByRole('button', { name: 'Preparar ficha' }));
  await user.click(screen.getByRole('button', { name: 'Descartar cópia' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar descarte da cópia' }));
  expect(await screen.findByText('Cópia removida deste dispositivo.')).toBeVisible();
  await act(async () => {
    held.resolve(s.view);
    await held.promise;
  });
  expect(screen.queryByLabelText('Nome', { exact: true })).not.toBeInTheDocument();
  expect(s.advance).not.toHaveBeenCalled();
});
it('reconciles one expected cleanup conflict before completing cancellation', async () => {
  s.cancel.mockRejectedValueOnce(
    Object.assign(Error('reconcile'), { code: 'failed-precondition' }),
  );
  const { user } = editor();
  await user.click(screen.getByRole('button', { name: 'Preparar ficha' }));
  await screen.findByRole('button', { name: 'Criar ficha' });
  await user.click(screen.getByRole('button', { name: 'Cancelar preparação' }));
  expect(await screen.findByText(/Preparação cancelada/)).toBeVisible();
  expect(s.cancel).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('notifies confirmed historical creation without requiring a released private copy', async () => {
  s.initialize.mockImplementationOnce(() => {
    s.view = {
      ...s.view,
      phase: 'applied',
      initialized: true,
      jobsClosed: true,
      hasRecoveryCopy: false,
      keyReleased: true,
      operation: null,
    };
    return Promise.resolve(s.view);
  });
  const { user, onCreated } = editor({ resumeWriteId: 'resume' });
  await user.click(screen.getByRole('button', { name: 'Retomar preparação' }));
  expect(await screen.findByText('Ficha criada no livro.')).toBeVisible();
  expect(onCreated).toHaveBeenCalledExactlyOnceWith('created');
  expect(s.draft).not.toHaveBeenCalled();
  expect(s.advance).not.toHaveBeenCalled();
  expect(s.apply).not.toHaveBeenCalled();
});
it('shows the list loading state and preserves retry after a metadata failure', async () => {
  const held = deferred();
  s.list.mockReturnValueOnce(held.promise);
  const user = userEvent.setup();
  render(<BookLoreCreationRecoveries bookId="book" onSelect={vi.fn()} />);
  expect(screen.getByText('Buscando criações...')).toBeVisible();
  await act(async () => {
    held.resolve({ items: [], next: null });
    await held.promise;
  });
  expect(await screen.findByText('Nenhuma criação nesta página')).toBeVisible();
  s.list.mockRejectedValueOnce(Error('Offline'));
  await user.click(screen.getByRole('button', { name: 'Atualizar lista' }));
  expect(await screen.findByText('Offline')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText('Nenhuma criação nesta página')).toBeVisible();
});

it('warns on browser unload for unsaved text and removes the warning after confirmed creation', async () => {
  const { user } = editor();
  await user.type(screen.getByLabelText('Nome', { exact: true }), 'Own');
  const unsaved = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unsaved);
  expect(unsaved.defaultPrevented).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Preparar ficha' }));
  await user.click(await screen.findByRole('button', { name: 'Criar ficha' }));
  await screen.findByText('Ficha criada no livro.');
  const saved = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(saved);
  expect(saved.defaultPrevented).toBe(false);
});

it('distinguishes a cancellation request from a confirmed closed preparation in the recovery list', async () => {
  s.list.mockResolvedValue({
    items: [
      {
        bookId: 'book',
        writeId: 'pending-close',
        loreId: 'one',
        cancelRequested: true,
        jobsClosed: false,
      },
      { bookId: 'book', writeId: 'closed', loreId: 'two', cancelRequested: true, jobsClosed: true },
    ],
    next: null,
  });
  render(<BookLoreCreationRecoveries bookId="book" onSelect={vi.fn()} />);
  expect(await screen.findByText('Encerramento pendente')).toBeVisible();
  expect(screen.getByText('Preparação cancelada')).toBeVisible();
});

it('stops automatic cleanup retries after a repeated conflict and preserves the preparation for explicit retry', async () => {
  const conflict = Object.assign(Error('Conflito recorrente'), { code: 'failed-precondition' });
  s.cancel
    .mockRejectedValueOnce(conflict)
    .mockImplementationOnce(() => {
      s.view = { ...s.view, phase: 'cancelling', jobsClosed: false, canApply: false };
      return Promise.resolve(s.view);
    })
    .mockRejectedValueOnce(conflict);
  const { user } = editor();
  await user.click(screen.getByRole('button', { name: 'Preparar ficha' }));
  await screen.findByRole('button', { name: 'Criar ficha' });
  await user.click(screen.getByRole('button', { name: 'Cancelar preparação' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Conflito recorrente');
  expect(s.cancel).toHaveBeenCalledTimes(3);
  expect(s.discard).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Cancelar preparação' })).toBeEnabled();
});

it('keeps the literal mention seed private and does not manufacture optional fields', async () => {
  const name = '\ufeff  Lune 🌙\r\n',
    { user } = editor({ initialName: name });
  expect(screen.getByLabelText('Nome', { exact: true })).toHaveValue(name.replace(/\r\n/g, '\n'));
  await user.click(screen.getByRole('button', { name: 'Preparar ficha' }));
  await screen.findByRole('button', { name: 'Criar ficha' });
  expect(s.create.mock.calls[0]![0].data).toEqual({ name, category: 'character', isPublic: false });
});
it('a later initialName prop cannot overwrite an open draft or its protected preparation', async () => {
  let change!: (name: string) => void;
  function Seed() {
    const [name, setName] = useState('First');
    change = setName;
    return <BookLoreCreationEditor open bookId="book" initialName={name} onClose={() => {}} />;
  }
  const router = createMemoryRouter([{ path: '/', element: <Seed /> }]);
  render(<RouterProvider router={router} />);
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('Nome', { exact: true }));
  await user.type(screen.getByLabelText('Nome', { exact: true }), 'Own draft');
  act(() => change('Replacement'));
  expect(screen.getByLabelText('Nome', { exact: true })).toHaveValue('Own draft');
  await user.click(screen.getByRole('button', { name: 'Preparar ficha' }));
  await screen.findByRole('button', { name: 'Criar ficha' });
  expect(s.create.mock.calls[0]![0].data.name).toBe('Own draft');
});
it('resuming uses the protected draft and ignores a new mention seed', async () => {
  const { user } = editor({ resumeWriteId: 'resume', initialName: 'UNTRUSTED SEED' });
  expect(screen.queryByDisplayValue('UNTRUSTED SEED')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retomar preparação' }));
  expect(await screen.findByLabelText('Nome', { exact: true })).toHaveValue('\ufeff Original\n');
  expect(s.create).not.toHaveBeenCalled();
});
