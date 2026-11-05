import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { chooseDropdown } from '@/test/dropdown';
import { BookLoreManualEditor } from '../components/BookLoreManualEditor';
import { BookLoreRecoveries } from '../components/BookLoreRecoveries';
import { editLoreText } from '../model/loreTextEdit';
import type { BookLoreEditOperationInput } from '../services/bookLoreEditOperation';
import type { BookLoreManualSnapshot } from '../services/bookLoreManualOperation';
const state = vi.hoisted(() => ({
  user: { uid: 'author' },
  actor: { uid: 'author' },
  notify: () => {},
  capture: vi.fn(),
  manual: vi.fn<(input: Omit<BookLoreEditOperationInput, 'uid'>) => unknown>(),
  resume: vi.fn(),
  preparation: vi.fn(),
  list: vi.fn(),
  initialize: vi.fn(),
  advance: vi.fn(),
  apply: vi.fn(),
  cancel: vi.fn(),
  discard: vi.fn(),
  draft: vi.fn(),
  view: {} as BookLoreManualSnapshot,
}));
vi.mock('@/features/auth', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useAuth: () => ({
      user: useSyncExternalStore(
        (notify) => {
          state.notify = notify;
          return () => {};
        },
        () => state.user,
      ),
    }),
  };
});
vi.mock('../services/bookLoreReadService', () => ({
  bookLoreReadSession: () => ({ capture: state.capture }),
}));
vi.mock('../services/bookLoreEditService', () => ({
  currentBookLoreActor: () => state.actor,
  bookLoreEditSession: () => ({
    manual: state.manual,
    resumeManual: state.resume,
    preparation: state.preparation,
    preparations: state.list,
  }),
}));
const source = () => ({
  bookId: 'book',
  id: 'arthur',
  sourceToken: 'a'.repeat(64),
  data: {
    name: '  Arthur\r\n🌙 ',
    category: 'character',
    details: '\ufeff' + 'x'.repeat(170000) + '\r\n',
    relations: [{ targetEntityId: 'other', relationType: '  ally  ' }],
  },
});
function operation() {
  return {
    snapshot: () => ({ ...state.view }),
    initialize: state.initialize,
    advance: state.advance,
    apply: state.apply,
    cancel: state.cancel,
    discard: state.discard,
    readDraft: state.draft,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { uid: 'author' };
  state.actor = { uid: 'author' };
  state.view = {
    writeId: 'operation',
    phase: 'opening',
    reservationPending: false,
    hasRecoveryCopy: false,
    draftSaved: false,
    requiresInput: false,
    savePending: false,
    canApply: false,
    keyReleaseRequested: false,
    keyReleased: false,
    canDiscard: false,
    copyDiscarded: false,
    discardPhase: null,
    operation: null,
  };
  state.capture.mockResolvedValue(source());
  state.manual.mockImplementation(() => operation());
  state.resume.mockImplementation(() => operation());
  state.preparation.mockResolvedValue({ intent: { bookId: 'book', loreId: 'arthur' } });
  state.list.mockResolvedValue({ items: [], next: null });
  state.initialize.mockImplementation(() => {
    if (state.view.phase === 'opening')
      state.view = { ...state.view, phase: 'preparing', hasRecoveryCopy: true, draftSaved: true };
    return Promise.resolve({ ...state.view });
  });
  state.advance.mockImplementation(() => {
    state.view = { ...state.view, phase: 'ready', canApply: true };
    return Promise.resolve({ ...state.view });
  });
  state.apply.mockImplementation(() => {
    state.view = { ...state.view, phase: 'applied', canApply: false };
    return Promise.resolve({ ...state.view });
  });
  state.cancel.mockImplementation(() => {
    state.view = { ...state.view, phase: 'cancelled', canApply: false };
    return Promise.resolve({ ...state.view });
  });
  state.discard.mockImplementation(() => {
    state.view = {
      ...state.view,
      phase: 'cancelled',
      canApply: false,
      keyReleased: true,
      canDiscard: true,
      copyDiscarded: true,
      discardPhase: 'complete',
      hasRecoveryCopy: false,
    };
    return Promise.resolve({ ...state.view });
  });
  state.draft.mockResolvedValue({
    uid: 'author',
    writeId: 'operation',
    source: source(),
    changes: [{ field: 'summary', value: 'private restored draft' }],
  });
});
function mount(props: Partial<Parameters<typeof BookLoreManualEditor>[0]> = {}, onClose = vi.fn()) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <BookLoreManualEditor open bookId="book" loreId="arthur" onClose={onClose} {...props} />
      ),
    },
    { path: '/other', element: <p>Other route</p> },
  ]);
  return { router, onClose, ...render(<RouterProvider router={router} />) };
}
it('navigates the field sidebar by keyboard and preserves drafts without sending requests', async () => {
  const user = userEvent.setup();
  mount();
  const name = await screen.findByLabelText('Nome');
  await user.clear(name);
  await user.type(name, 'Nome em rascunho');
  const tab = screen.getByRole('tab', { name: 'Nome' });
  expect(tab).toHaveAccessibleDescription('Campo com alterações pendentes');
  tab.focus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('tab', { name: 'Categoria' })).toHaveFocus();
  expect(screen.getByRole('tabpanel', { name: 'Edição de Categoria' })).toBeVisible();
  await user.keyboard('{End}');
  expect(screen.getByRole('tab', { name: 'Visibilidade' })).toHaveFocus();
  await user.keyboard('{Home}');
  expect(screen.getByRole('tab', { name: 'Nome' })).toHaveFocus();
  expect(screen.getByLabelText('Nome')).toHaveValue('Nome em rascunho');
  expect(state.manual).not.toHaveBeenCalled();
  expect(state.apply).not.toHaveBeenCalled();
});

it('prepares only touched fields without trimming or applying automatically', async () => {
  const user = userEvent.setup(),
    onApplied = vi.fn();
  mount({ onApplied });
  const name = await screen.findByLabelText('Nome');
  expect(name).toHaveValue('  Arthur\n🌙 ');
  await user.clear(name);
  await user.type(name, '  Novo nome  ');
  await user.click(screen.getByRole('button', { name: 'Preparar alterações' }));
  await screen.findByRole('button', { name: 'Aplicar alterações' });
  expect(state.apply).not.toHaveBeenCalled();
  const draft = state.manual.mock.calls[0]![0];
  expect(draft.source).toEqual(source());
  expect(draft.changes).toEqual([{ field: 'name', value: '  Novo nome  ' }]);
  await user.click(screen.getByRole('button', { name: 'Aplicar alterações' }));
  await screen.findByText('Alterações aplicadas à ficha.');
  expect(state.apply).toHaveBeenCalledTimes(1);
  expect(onApplied).toHaveBeenCalledTimes(1);
});
it('preserves existing CRLF/BOM fragments when a textarea reports LF during an edit', () => {
  expect(editLoreText('\ufeffA\r\nB\rC\n', '\ufeffA\nB!\nC\n')).toBe('\ufeffA\r\nB!\rC\n');
  expect(editLoreText('a\r\nb', 'a\nb')).toBe('a\r\nb');
  expect(editLoreText('🌙\r\nx', '🌙\nnew')).toBe('🌙\r\nnew');
});
it('distinguishes missing, empty and reverted optional fields', async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByLabelText('Nome');
  await user.click(screen.getByRole('tab', { name: 'Resumo' }));
  expect(screen.getByText('Este campo não está presente na ficha.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Adicionar resumo' }));
  expect(screen.getByLabelText('Resumo')).toHaveValue('');
  await user.click(screen.getByRole('button', { name: 'Preparar alterações' }));
  await screen.findByRole('button', { name: 'Aplicar alterações' });
  expect(state.manual.mock.calls[0]![0].changes).toEqual([{ field: 'summary', value: '' }]);
});
it('does not cap or resubmit a large untouched field when editing another field', async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByLabelText('Nome');
  await user.click(screen.getByRole('tab', { name: 'Detalhes' }));
  const text = screen.getByLabelText('Detalhes');
  expect(text).not.toHaveAttribute('maxlength');
  expect((text as HTMLTextAreaElement).value.length).toBeGreaterThan(150000);
  await user.click(screen.getByRole('tab', { name: 'Categoria' }));
  await chooseDropdown(user, screen.getByRole('combobox', { name: 'Categoria' }), 'Local');
  await user.click(screen.getByRole('button', { name: 'Preparar alterações' }));
  await screen.findByRole('button', { name: 'Aplicar alterações' });
  expect(state.manual.mock.calls[0]![0].changes).toEqual([
    { field: 'category', value: 'location' },
  ]);
});
it('preserves absent relation description and edits one relation at a time', async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByLabelText('Nome');
  await user.click(screen.getByRole('tab', { name: 'Relações' }));
  expect(screen.queryByLabelText('Descrição da relação')).not.toBeInTheDocument();
  const type = screen.getByLabelText('Tipo de relação');
  await user.clear(type);
  await user.type(type, '  companion  ');
  await user.click(screen.getByRole('button', { name: 'Preparar alterações' }));
  await screen.findByRole('button', { name: 'Aplicar alterações' });
  expect(state.manual.mock.calls[0]![0].changes).toEqual([
    { field: 'relations', value: [{ targetEntityId: 'other', relationType: '  companion  ' }] },
  ]);
});
it('keeps the same frozen handle after a failed unit and resumes it', async () => {
  const user = userEvent.setup();
  state.advance.mockRejectedValueOnce(Error('offline'));
  mount();
  await screen.findByLabelText('Nome');
  await user.type(screen.getByLabelText('Nome'), '!');
  await user.click(screen.getByRole('button', { name: 'Preparar alterações' }));
  await screen.findByText('offline');
  await user.click(screen.getByRole('button', { name: 'Retomar preparação' }));
  await screen.findByRole('button', { name: 'Aplicar alterações' });
  expect(state.manual).toHaveBeenCalledTimes(1);
});
it('can cancel while initialization remains pending and ignores its late reply', async () => {
  const user = userEvent.setup();
  let release!: () => void;
  state.initialize.mockImplementation(
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  mount();
  await screen.findByLabelText('Nome');
  await user.type(screen.getByLabelText('Nome'), '!');
  await user.click(screen.getByRole('button', { name: 'Preparar alterações' }));
  await user.click(screen.getByRole('button', { name: 'Cancelar edição' }));
  await screen.findByText(
    'Edição cancelada. O texto não chegou a ser confirmado na cópia protegida.',
  );
  await act(() => {
    release();
    return Promise.resolve();
  });
  expect(state.advance).not.toHaveBeenCalled();
  expect(state.apply).not.toHaveBeenCalled();
});
it('requires distinct confirmation before discard and removes visible private draft afterwards', async () => {
  const user = userEvent.setup();
  mount({ resumeWriteId: 'saved' });
  await user.click(screen.getByRole('button', { name: 'Retomar preparação' }));
  await screen.findByLabelText('Nome');
  await user.click(screen.getByRole('button', { name: 'Descartar cópia' }));
  expect(state.discard).not.toHaveBeenCalled();
  expect(screen.getByText(/Esta cópia não poderá ser recuperada/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Manter cópia' }));
  expect(state.discard).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Descartar cópia' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar descarte da cópia' }));
  await screen.findByText('Cópia removida deste dispositivo.');
  expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
});
it('checks recovery scope before creating a handle or decrypting text', async () => {
  const user = userEvent.setup();
  state.preparation.mockResolvedValue({ intent: { bookId: 'other', loreId: 'arthur' } });
  mount({ resumeWriteId: 'saved' });
  await user.click(screen.getByRole('button', { name: 'Retomar preparação' }));
  await screen.findByText('Esta recuperação pertence a outra ficha.');
  expect(state.resume).not.toHaveBeenCalled();
  expect(state.draft).not.toHaveBeenCalled();
});
it('warns on closing unsaved edits and on in-app navigation', async () => {
  const user = userEvent.setup(),
    { router, onClose } = mount();
  await screen.findByLabelText('Nome');
  await user.type(screen.getByLabelText('Nome'), '!');
  await user.keyboard('{Escape}');
  expect(screen.getByText(/As alterações ainda estão somente nesta aba/)).toBeVisible();
  expect(onClose).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Continuar aqui' }));
  await act(() => router.navigate('/other'));
  expect(screen.getByRole('button', { name: 'Sair sem salvar' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }));
  await screen.findByText('Other route');
});
it('hides prior content when the actor object changes even with the same UID', async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByLabelText('Nome');
  await user.type(screen.getByLabelText('Nome'), 'PRIVATE');
  state.user = { uid: 'author' };
  state.actor = { uid: 'author' };
  state.capture.mockResolvedValue({
    ...source(),
    data: { ...source().data, name: 'Fresh account context' },
  });
  await act(() => {
    state.notify();
    return Promise.resolve();
  });
  await screen.findByDisplayValue('Fresh account context');
  expect(screen.queryByDisplayValue(/PRIVATE/)).not.toBeInTheDocument();
});
it('offers capture retry and focuses the error instead of displaying a partial fiche', async () => {
  const user = userEvent.setup();
  state.capture.mockRejectedValueOnce(Error('denied'));
  mount();
  await screen.findByText('denied');
  expect(screen.getByText('denied').closest('[role="alert"]')).toHaveFocus();
  expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByLabelText('Nome');
});
it('lists only the current book, hides discarded copies and preserves cursor pagination', async () => {
  const user = userEvent.setup(),
    select = vi.fn();
  const record = (id: string, bookId: string, discard: unknown = null) => ({
    intent: { writeId: id, bookId, loreId: 'arthur' },
    reserveState: 'pending',
    discard,
  });
  state.list
    .mockResolvedValueOnce({
      items: [
        record('one', 'book'),
        record('foreign', 'else'),
        record('discarded', 'book', { phase: 'complete' }),
        record('lore-selection-visibility-' + 'a'.repeat(64), 'book'),
      ],
      next: 'cursor',
    })
    .mockResolvedValueOnce({ items: [], next: null });
  render(<BookLoreRecoveries bookId="book" onSelect={select} />);
  await screen.findByRole('button', { name: 'Abrir recuperação 1' });
  expect(screen.getAllByRole('button', { name: /Abrir recuperação/ })).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Abrir recuperação 1' }));
  expect(select).toHaveBeenCalledWith('one', 'arthur');
  await user.click(screen.getByRole('button', { name: 'Próxima página' }));
  await screen.findByText('Nenhuma recuperação nesta página');
  expect(state.list).toHaveBeenLastCalledWith('cursor', 50);
});
it('shows list error and retry without stale results', async () => {
  const user = userEvent.setup();
  state.list.mockRejectedValueOnce(Error('storage unavailable'));
  render(<BookLoreRecoveries bookId="book" onSelect={vi.fn()} />);
  await screen.findByText('storage unavailable');
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByText('Nenhuma recuperação nesta página');
});

it('keeps frozen fields copyable and allows review navigation before applying', async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByLabelText('Nome');
  await user.type(screen.getByLabelText('Nome'), '!');
  await user.click(screen.getByRole('button', { name: 'Preparar alterações' }));
  await screen.findByRole('button', { name: 'Aplicar alterações' });
  await user.click(screen.getByRole('tab', { name: 'Detalhes' }));
  expect(screen.getByLabelText('Detalhes')).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Detalhes')).not.toBeDisabled();
  expect(state.apply).not.toHaveBeenCalled();
});
it('returns focus after dismissing a close confirmation and closes discarded copies without a false loss warning', async () => {
  const user = userEvent.setup(),
    { onClose } = mount();
  const field = await screen.findByLabelText('Nome');
  await user.type(field, '!');
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Continuar aqui' }));
  await waitFor(() => expect(field).toHaveFocus());
  await user.click(screen.getByRole('button', { name: 'Preparar alterações' }));
  await screen.findByRole('button', { name: 'Aplicar alterações' });
  await user.click(screen.getByRole('button', { name: 'Descartar cópia' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar descarte da cópia' }));
  await screen.findByText('Cópia removida deste dispositivo.');
  await user.click(screen.getAllByRole('button', { name: /^Fechar$/ })[0]!);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Fechar edição?')).not.toBeInTheDocument();
});
it('can explicitly reuse a canceled protected draft without rebasing its original source', async () => {
  const user = userEvent.setup();
  mount({ resumeWriteId: 'old' });
  await user.click(screen.getByRole('button', { name: 'Retomar preparação' }));
  await screen.findByRole('button', { name: 'Aplicar alterações' });
  await user.click(screen.getByRole('button', { name: 'Cancelar edição' }));
  await screen.findByRole('button', { name: 'Usar rascunho em nova preparação' });
  await user.click(screen.getByRole('button', { name: 'Usar rascunho em nova preparação' }));
  expect(screen.getByLabelText('Nome')).not.toHaveAttribute('readonly');
  await user.type(screen.getByLabelText('Nome'), ' new');
  state.view = { ...state.view, phase: 'opening', canApply: false };
  await user.click(screen.getByRole('button', { name: 'Preparar alterações' }));
  await screen.findByRole('button', { name: 'Aplicar alterações' });
  expect(state.manual.mock.calls[0]![0].source.sourceToken).toBe(source().sourceToken);
  expect(state.capture).not.toHaveBeenCalled();
});

it('preserves an unsaved draft when only profile metadata changes for the same SDK actor', async () => {
  const user = userEvent.setup();
  mount();
  const field = await screen.findByLabelText('Nome');
  await user.type(field, 'PRIVATE');
  const before = (field as HTMLTextAreaElement).value;
  state.user = { uid: 'author' };
  await act(() => {
    state.notify();
    return Promise.resolve();
  });
  expect(screen.getByLabelText('Nome')).toHaveValue(before);
  expect(state.capture).toHaveBeenCalledTimes(1);
});
