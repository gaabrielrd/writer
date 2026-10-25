import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BookLoreVisibilitySelectionDialog,
  type BookLoreVisibilitySelectionDialogProps,
} from '../components/BookLoreVisibilitySelectionDialog';
import { BookLoreVisibilitySelectionRecoveries } from '../components/BookLoreVisibilitySelectionRecoveries';
import {
  createVisibilitySelection,
  initialVisibilityState,
  visibilityScope,
  visibilityHead,
  type VisibilityState,
  type VisibilityResult,
} from '../services/bookLoreVisibilitySelectionContracts';
import { loreControlJobId } from '../services/bookLoreControlContracts';
import type { bookLoreVisibilitySelectionSession } from '../services/bookLoreVisibilitySelectionService';
type Session = ReturnType<typeof bookLoreVisibilitySelectionSession>;
type Operation = Awaited<ReturnType<Session['createSelection']>>;
type Snapshot = ReturnType<Operation['snapshot']>;
const s = vi.hoisted(() => ({
  user: { uid: 'author' },
  actor: { uid: 'author' },
  notify: () => {},
  create: vi.fn<Session['createSelection']>(),
  resume: vi.fn<Session['resumeSelection']>(),
  review: vi.fn<Session['review']>(),
  list: vi.fn<Session['recoveries']>(),
  advance: vi.fn<Operation['advance']>(),
  apply: vi.fn<Operation['apply']>(),
  retry: vi.fn<Operation['retry']>(),
  cancel: vi.fn<Operation['cancel']>(),
  page: vi.fn<Operation['page']>(),
  pack: {} as ReturnType<typeof createVisibilitySelection>,
  view: {} as Snapshot,
  rows: [] as VisibilityState[],
  names: [] as string[],
}));
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
vi.mock('../services/bookLoreEditService', () => ({ currentBookLoreActor: () => s.actor }));
vi.mock('../services/bookLoreVisibilitySelectionService', () => ({
  bookLoreVisibilitySelectionSession: () => ({
    actor: s.actor,
    createSelection: s.create,
    resumeSelection: s.resume,
    review: s.review,
    recoveries: s.list,
  }),
}));
const targets = Array.from({ length: 3 }, (_, i) => ({
  loreId: 'entity-' + i,
  sourceToken: String(i + 1).repeat(64),
}));
function install(
  input: Parameters<Session['createSelection']>[0] = {
    bookId: 'book',
    selectionId: 'recovered',
    value: true,
    members: targets,
  },
) {
  s.pack = createVisibilitySelection({ ...input, uid: 'author' });
  s.rows = s.pack.pages.flatMap((page) =>
    page.items.map((m) => initialVisibilityState(s.pack.root, m)),
  );
  s.names = input.members.map((_, i) => 'Ficha literal ' + i);
  s.view = {
    identity: s.pack.root.manifest.identity,
    manifestHash: s.pack.root.manifest.manifestHash,
    value: input.value,
    count: input.members.length,
    cursor: 0,
    cancelCursor: 0,
    cancelRequested: false,
    recordedApplied: 0,
    recordedUnchanged: 0,
    recordedConflicts: 0,
    recordedCancelled: 0,
    verifiedCount: 0,
    savePending: false,
    canRetry: false,
    phase: 'preparing',
  };
}
const op = (): Operation => ({
  snapshot: () => ({ ...s.view }),
  advance: s.advance,
  apply: s.apply,
  retry: s.retry,
  cancel: s.cancel,
  page: s.page,
});
function outcome(index: number, kind: VisibilityResult) {
  const member = s.pack.pages[Math.floor(index / 50)]!.items[index % 50]!,
    old = s.rows[index]!;
  if (kind === 'applied')
    s.rows[index] = {
      ...old,
      intentHash: 'a'.repeat(64),
      unchanged: false,
      applyRequested: true,
      edit: {
        id: loreControlJobId(visibilityScope(s.pack.root, member), 'lore-edit'),
        startHash: 'b'.repeat(64),
        seen: true,
        jobToken: 'c'.repeat(64),
      },
      outcome: { kind, jobToken: 'c'.repeat(64), outcomeToken: 'd'.repeat(64) },
    };
  else
    s.rows[index] = {
      ...old,
      intentHash: kind === 'unchanged' ? 'a'.repeat(64) : null,
      unchanged: kind === 'unchanged' ? true : null,
      inspection: { ...old.inspection, seen: true },
      inspectionClosed: true,
      closing: kind,
      outcome: { kind, jobToken: null, outcomeToken: null },
    };
}
function completeCurrent(kind: VisibilityResult = 'applied') {
  outcome(s.view.cursor, kind);
  const counts = {
    recordedApplied: s.view.recordedApplied,
    recordedUnchanged: s.view.recordedUnchanged,
    recordedConflicts: s.view.recordedConflicts,
    recordedCancelled: s.view.recordedCancelled,
  };
  counts[
    kind === 'applied'
      ? 'recordedApplied'
      : kind === 'unchanged'
        ? 'recordedUnchanged'
        : kind === 'conflict'
          ? 'recordedConflicts'
          : 'recordedCancelled'
  ]++;
  s.view = {
    ...s.view,
    ...counts,
    cursor: s.view.cursor + 1,
    verifiedCount: s.view.verifiedCount + 1,
    canRetry: false,
    phase:
      s.view.cursor + 1 === s.view.count
        ? counts.recordedConflicts
          ? 'partial'
          : 'complete'
        : 'preparing',
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  s.user = { uid: 'author' };
  s.actor = { uid: 'author' };
  install();
  s.create.mockImplementation((input) => {
    install(input);
    return Promise.resolve(op());
  });
  s.resume.mockImplementation(() => Promise.resolve(op()));
  s.list.mockResolvedValue({ items: [], next: null });
  s.page.mockImplementation((index) =>
    Promise.resolve({
      root: {
        ...s.pack.root,
        head: visibilityHead({
          ...s.pack.root.head,
          cursor: s.view.cursor,
          cancelCursor: s.view.cancelCursor,
          cancelRequested: s.view.cancelRequested,
          applied: s.view.recordedApplied,
          unchanged: s.view.recordedUnchanged,
          conflicts: s.view.recordedConflicts,
          cancelled: s.view.recordedCancelled,
        }),
      },
      page: s.pack.pages[index]!,
      states: s.rows.slice(index * 50, (index + 1) * 50),
    }),
  );
  s.review.mockImplementation(() =>
    Promise.resolve({
      manifestHash: s.view.manifestHash,
      selectionId: s.view.identity.selectionId,
      value: s.view.value,
      count: s.view.count,
      mode: s.view.phase === 'uncertain' ? 'retry' : 'selection',
      members: s.pack.pages
        .flatMap((p) => p.items)
        .filter(
          (m) =>
            !s.rows[m.index]!.outcome &&
            (s.view.phase !== 'uncertain' || m.index === s.view.cursor),
        )
        .map((m) => ({
          index: m.index,
          loreId: m.loreId,
          sourceToken: m.sourceToken,
          name: s.names[m.index]!,
          currentValue: false,
        })),
    }),
  );
  s.advance.mockImplementation(() => {
    if (s.view.savePending) s.view = { ...s.view, savePending: false };
    else if (s.view.phase === 'uncertain') s.view = { ...s.view, canRetry: true };
    else if (s.view.phase === 'preparing') s.view = { ...s.view, phase: 'ready' };
    else if (s.view.phase === 'verifying')
      s.view = {
        ...s.view,
        phase: s.view.recordedConflicts ? 'partial' : 'complete',
        verifiedCount: s.view.count,
      };
    else if (s.view.phase === 'cancelling') {
      for (let n = 0; n < s.rows.length; n++) if (!s.rows[n]!.outcome) outcome(n, 'cancelled');
      s.view = {
        ...s.view,
        phase: 'cancelled',
        cancelCursor: s.view.count,
        verifiedCount: s.view.count,
        recordedCancelled:
          s.view.count -
          s.view.recordedApplied -
          s.view.recordedUnchanged -
          s.view.recordedConflicts,
      };
    }
    return Promise.resolve({ ...s.view });
  });
  s.apply.mockImplementation(() => {
    if (s.view.phase === 'preparing') s.view = { ...s.view, phase: 'ready' };
    else if (s.view.phase === 'ready') completeCurrent(s.view.value ? 'applied' : 'unchanged');
    return Promise.resolve({ ...s.view });
  });
  s.retry.mockImplementation(() => {
    completeCurrent();
    return Promise.resolve({ ...s.view });
  });
  s.cancel.mockImplementation(() => {
    s.view = { ...s.view, phase: 'cancelling', cancelRequested: true };
    return Promise.resolve({ ...s.view });
  });
});
function show(props: Partial<BookLoreVisibilitySelectionDialogProps> = {}) {
  const user = userEvent.setup(),
    onCompleted = vi.fn(),
    onClose = vi.fn(),
    ui = render(
      <BookLoreVisibilitySelectionDialog
        open
        bookId="book"
        value
        targets={targets}
        onCompleted={onCompleted}
        onClose={onClose}
        {...props}
      />,
    );
  return { ...ui, user, onCompleted, onClose };
}
async function review(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Conferir seleção' }));
  return screen.findByRole('button', { name: 'Confirmar visibilidade da seleção' });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const result = (extra: Record<string, unknown> = {}) => ({
  phase: 'complete',
  total: 3,
  value: true,
  applied: 3,
  unchanged: 0,
  unchangedIds: [],
  conflicts: 0,
  cancelled: 0,
  ...extra,
});
it('opens without a job, reviews literal consent then requires explicit confirmation and notifies once', async () => {
  const f = show();
  expect(s.create).not.toHaveBeenCalled();
  expect(s.apply).not.toHaveBeenCalled();
  const confirm = await review(f.user);
  expect(screen.getByText('Ficha literal 0')).toBeVisible();
  expect(screen.getByText('Confirmar visibilidade?').closest('[tabindex]')).toHaveFocus();
  expect(s.apply).not.toHaveBeenCalled();
  await f.user.click(confirm);
  await waitFor(() =>
    expect(f.onCompleted).toHaveBeenCalledExactlyOnceWith(
      targets.map((t) => t.loreId),
      result(),
    ),
  );
  await f.user.click(screen.getByRole('button', { name: 'Conferir resultado' }));
  expect(f.onCompleted).toHaveBeenCalledOnce();
});
it('keeps both original targets and desired value after prop changes and returns focus on back', async () => {
  const f = show();
  await review(f.user);
  f.rerender(
    <BookLoreVisibilitySelectionDialog
      open
      bookId="book"
      value={false}
      targets={[{ loreId: 'other', sourceToken: 'b'.repeat(64) }]}
      onClose={f.onClose}
      onCompleted={f.onCompleted}
    />,
  );
  expect(screen.getByText('Visibilidade desejada: Pública')).toBeVisible();
  await f.user.click(screen.getByRole('button', { name: 'Voltar' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Conferir seleção' })).toHaveFocus(),
  );
  await review(f.user);
  await f.user.click(screen.getByRole('button', { name: 'Confirmar visibilidade da seleção' }));
  await waitFor(() => expect(f.onCompleted).toHaveBeenCalledOnce());
  expect(s.create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ value: true, members: targets }),
  );
});
it('reports unchanged IDs separately when the desired private value was already present', async () => {
  const f = show({ value: false });
  await review(f.user);
  await f.user.click(screen.getByRole('button', { name: 'Confirmar visibilidade da seleção' }));
  await waitFor(() =>
    expect(f.onCompleted).toHaveBeenCalledExactlyOnceWith(
      [],
      result({
        value: false,
        applied: 0,
        unchanged: 3,
        unchangedIds: targets.map((t) => t.loreId),
      }),
    ),
  );
});
it('requires an explicit desired value and never silently chooses a default', () => {
  show({ value: undefined });
  expect(screen.getByText('Escolha a visibilidade da seleção.')).toBeVisible();

  expect(s.create).not.toHaveBeenCalled();
});
it('empty selection has the standard empty state without creating a child', () => {
  show({ targets: [] });
  expect(screen.getByText('Nenhuma ficha selecionada')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Conferir seleção' })).toBeDisabled();
  expect(s.create).not.toHaveBeenCalled();
});
it('source review errors focus feedback and keep the same durable attempt', async () => {
  const f = show();
  s.review.mockRejectedValueOnce(Error('Source changed'));
  await f.user.click(screen.getByRole('button', { name: 'Conferir seleção' }));
  expect((await screen.findByText('Source changed')).closest('[tabindex]')).toHaveFocus();
  await review(f.user);
  expect(s.create).toHaveBeenCalledOnce();
  expect(s.apply).not.toHaveBeenCalled();
});

it('closing during review ignores a late private name without a draft-loss prompt', async () => {
  const f = show(),
    pending = deferred<Awaited<ReturnType<Session['review']>>>();
  s.review.mockReturnValueOnce(pending.promise);
  await f.user.click(screen.getByRole('button', { name: 'Conferir seleção' }));
  expect(screen.queryByText('Private late name')).not.toBeInTheDocument();
  await f.user.click(screen.getAllByRole('button', { name: 'Fechar' })[0]!);
  await act(() =>
    Promise.resolve(
      pending.resolve({
        manifestHash: s.view.manifestHash,
        selectionId: s.view.identity.selectionId,
        value: true,
        count: 3,
        mode: 'selection',
        members: [
          {
            index: 0,
            loreId: targets[0]!.loreId,
            sourceToken: targets[0]!.sourceToken,
            name: 'Private late name',
            currentValue: false,
          },
        ],
      }),
    ),
  );
  expect(f.onClose).toHaveBeenCalledOnce();
  expect(screen.queryByText('Private late name')).not.toBeInTheDocument();
  expect(screen.queryByText(/Sair sem salvar/)).not.toBeInTheDocument();
  expect(s.apply).not.toHaveBeenCalled();
});
it('recorded completion stays neutral on resume and callback waits for native verification', async () => {
  while (s.view.cursor < s.view.count) completeCurrent();
  s.view = { ...s.view, phase: 'verifying', verifiedCount: 0 };
  const f = show({ targets: undefined, resumeSelectionId: 'recovered', value: false });
  await screen.findByText('Há resultados registrados neste dispositivo. Verifique para confirmar.');
  expect(screen.getByText('Visibilidade desejada: Pública')).toBeVisible();
  expect(f.onCompleted).not.toHaveBeenCalled();
  expect(s.advance).not.toHaveBeenCalled();
  await f.user.click(screen.getByRole('button', { name: 'Verificar progresso' }));
  await waitFor(() =>
    expect(f.onCompleted).toHaveBeenCalledExactlyOnceWith(
      targets.map((t) => t.loreId),
      result(),
    ),
  );
});
it('uncertain requests require query and a one-member review before an explicit retry', async () => {
  s.view = { ...s.view, phase: 'uncertain' };
  const f = show({ targets: undefined, resumeSelectionId: 'recovered' });
  expect(await screen.findByRole('button', { name: 'Verificar progresso' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Revisar reenvio' })).not.toBeInTheDocument();
  await f.user.click(screen.getByRole('button', { name: 'Verificar progresso' }));
  await f.user.click(await screen.findByRole('button', { name: 'Revisar reenvio' }));
  expect(screen.getByText('Ficha literal 0')).toBeVisible();
  expect(screen.queryByText('Ficha literal 1')).not.toBeInTheDocument();
  await f.user.click(screen.getByRole('button', { name: 'Reenviar pedido desta ficha' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Conferir seleção' })).toBeEnabled(),
  );
  expect(s.retry).toHaveBeenCalledOnce();
  expect(s.apply).not.toHaveBeenCalled();
  expect(s.view.recordedApplied).toBe(1);
  expect(f.onCompleted).not.toHaveBeenCalled();
});
it('failed original query does not enable retry', async () => {
  s.view = { ...s.view, phase: 'uncertain' };
  const f = show({ targets: undefined, resumeSelectionId: 'recovered' });
  s.advance.mockRejectedValueOnce(Error('Offline query'));
  await f.user.click(await screen.findByRole('button', { name: 'Verificar progresso' }));
  await screen.findByText('Offline query');
  expect(screen.queryByRole('button', { name: 'Revisar reenvio' })).not.toBeInTheDocument();
  expect(s.retry).not.toHaveBeenCalled();
});
it('an existing local debt only saves once and cannot authorize apply or retry', async () => {
  s.view = { ...s.view, phase: 'uncertain', savePending: true };
  const f = show({ targets: undefined, resumeSelectionId: 'recovered' });
  await f.user.click(await screen.findByRole('button', { name: 'Salvar recuperação' }));
  expect(s.advance).toHaveBeenCalledOnce();
  expect(s.apply).not.toHaveBeenCalled();
  expect(s.retry).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Revisar reenvio' })).not.toBeInTheDocument();
});
it('a local ACK failure stops production and the next action only saves', async () => {
  const f = show();
  await review(f.user);
  s.apply.mockImplementationOnce(() => {
    s.view = { ...s.view, phase: 'uncertain', savePending: true };
    return Promise.reject(Error('Local ACK failed'));
  });
  await f.user.click(screen.getByRole('button', { name: 'Confirmar visibilidade da seleção' }));
  await screen.findByText('Local ACK failed');
  await f.user.click(screen.getByRole('button', { name: 'Salvar recuperação' }));
  expect(s.apply).toHaveBeenCalledOnce();
  expect(s.advance).toHaveBeenCalledOnce();
  expect(s.retry).not.toHaveBeenCalled();
  expect(f.onCompleted).not.toHaveBeenCalled();
});
it('cancel uses a fresh handle independently of a held producer and ignores its late result', async () => {
  const f = show();
  await review(f.user);
  const held = deferred<Snapshot>();
  s.apply.mockReturnValueOnce(held.promise);
  await f.user.click(screen.getByRole('button', { name: 'Confirmar visibilidade da seleção' }));
  await f.user.click(screen.getByRole('button', { name: 'Cancelar operação' }));
  await screen.findByText(
    'Operação cancelada. Alterações já aceitas preservadas: 0. Sem mudança: 0.',
  );
  expect(s.resume).toHaveBeenCalledWith('book', s.view.identity.selectionId);
  expect(f.onCompleted).toHaveBeenCalledExactlyOnceWith(
    [],
    result({ phase: 'cancelled', applied: 0, cancelled: 3 }),
  );
  await act(() =>
    Promise.resolve(held.resolve({ ...s.view, phase: 'complete', recordedApplied: 3 })),
  );
  expect(f.onCompleted).toHaveBeenCalledOnce();
  expect(screen.getByText(/Alterações já aceitas preservadas: 0/)).toBeVisible();
});
it('cancel failure stays explicit and repeatable without opening another producer', async () => {
  const f = show();
  await review(f.user);
  s.cancel.mockRejectedValueOnce(Error('Cancel reply lost'));
  await f.user.click(screen.getByRole('button', { name: 'Cancelar operação' }));
  await screen.findByText('Cancel reply lost');
  expect(screen.getByRole('button', { name: 'Verificar progresso' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Conferir seleção' })).not.toBeInTheDocument();
  await f.user.click(screen.getByRole('button', { name: 'Repetir cancelamento' }));
  await screen.findByText(/Operação cancelada/);
  expect(s.apply).not.toHaveBeenCalled();
});
it('a foreign book or changed desired value cannot authorize an action', async () => {
  s.view = { ...s.view, identity: { ...s.view.identity, bookId: 'other' } };
  show({ targets: undefined, resumeSelectionId: 'recovered' });
  await screen.findByText('A recuperação não pertence à seleção deste livro.');
  expect(s.apply).not.toHaveBeenCalled();
  expect(s.review).not.toHaveBeenCalled();
});
it('profile refresh preserves the review while replacement of the SDK actor hides it', async () => {
  const f = show();
  await review(f.user);
  await act(() => {
    s.user = { uid: 'author' };
    s.notify();
    return Promise.resolve();
  });
  expect(screen.getByRole('button', { name: 'Confirmar visibilidade da seleção' })).toBeVisible();
  await act(() => {
    s.actor = { uid: 'author' };
    s.user = { uid: 'author' };
    s.notify();
    return Promise.resolve();
  });
  expect(
    screen.queryByRole('button', { name: 'Confirmar visibilidade da seleção' }),
  ).not.toBeInTheDocument();
  expect(s.apply).not.toHaveBeenCalled();
});
it('switching books fences an old name review', async () => {
  const f = show(),
    pending = deferred<Awaited<ReturnType<Session['review']>>>();
  s.review.mockReturnValueOnce(pending.promise);
  await f.user.click(screen.getByRole('button', { name: 'Conferir seleção' }));
  f.rerender(
    <BookLoreVisibilitySelectionDialog
      open
      bookId="other"
      value
      targets={targets}
      onClose={f.onClose}
    />,
  );
  await act(() =>
    Promise.resolve(
      pending.resolve({
        manifestHash: s.view.manifestHash,
        selectionId: s.view.identity.selectionId,
        value: true,
        count: 3,
        mode: 'selection',
        members: [
          {
            index: 0,
            loreId: targets[0]!.loreId,
            sourceToken: targets[0]!.sourceToken,
            name: 'Old book private name',
            currentValue: false,
          },
        ],
      }),
    ),
  );
  expect(screen.queryByText('Old book private name')).not.toBeInTheDocument();
  expect(s.apply).not.toHaveBeenCalled();
});
it('all 53 reviewed names and results are preserved rather than capped at a page', async () => {
  const many = Array.from({ length: 53 }, (_, i) => ({
      loreId: 'entity-' + i,
      sourceToken: 'a'.repeat(64),
    })),
    f = show({ targets: many });
  await review(f.user);
  expect(screen.getByText('Ficha literal 52')).toBeVisible();
  await f.user.click(screen.getByRole('button', { name: 'Confirmar visibilidade da seleção' }));
  await waitFor(
    () =>
      expect(f.onCompleted).toHaveBeenCalledExactlyOnceWith(
        many.map((t) => t.loreId),
        result({ total: 53, applied: 53 }),
      ),
    { timeout: 5000 },
  );
}, 10000);
it('partial completion notifies only applied IDs while keeping conflicts explicit', async () => {
  outcome(0, 'applied');
  outcome(1, 'conflict');
  outcome(2, 'conflict');
  s.view = { ...s.view, cursor: 3, recordedApplied: 1, recordedConflicts: 2, phase: 'verifying' };
  const f = show({ targets: undefined, resumeSelectionId: 'recovered' });
  await f.user.click(await screen.findByRole('button', { name: 'Verificar progresso' }));
  await waitFor(() =>
    expect(f.onCompleted).toHaveBeenCalledExactlyOnceWith(
      [targets[0]!.loreId],
      result({ phase: 'partial', applied: 1, conflicts: 2 }),
    ),
  );
});
it('a missing terminal member cannot become a completion callback', async () => {
  s.view = { ...s.view, phase: 'verifying', cursor: 3, recordedApplied: 3 };
  const f = show({ targets: undefined, resumeSelectionId: 'recovered' });
  await f.user.click(await screen.findByRole('button', { name: 'Verificar progresso' }));
  await screen.findByText('O resultado da seleção ainda precisa ser conferido.');
  expect(f.onCompleted).not.toHaveBeenCalled();
});
it('a review for another manifest or value cannot enable confirmation', async () => {
  const f = show();
  s.review.mockResolvedValueOnce({
    manifestHash: 'b'.repeat(64),
    selectionId: 'wrong',
    value: false,
    count: 3,
    mode: 'selection',
    members: [],
  });
  await f.user.click(screen.getByRole('button', { name: 'Conferir seleção' }));
  await screen.findByText('A revisão não pertence à seleção.');
  expect(
    screen.queryByRole('button', { name: 'Confirmar visibilidade da seleção' }),
  ).not.toBeInTheDocument();
  expect(s.apply).not.toHaveBeenCalled();
});
it('discovery filters book metadata and offers neutral results with the stored desired value', async () => {
  s.list.mockResolvedValueOnce({
    items: [
      s.pack.root,
      createVisibilitySelection({
        uid: 'author',
        bookId: 'other',
        selectionId: 'other',
        value: false,
        members: targets,
      }).root,
    ],
    next: 'next',
  });
  const select = vi.fn(),
    user = userEvent.setup();
  render(<BookLoreVisibilitySelectionRecoveries bookId="book" onSelect={select} />);
  await screen.findByText(/Seleção de 3 fichas/);
  expect(screen.getAllByRole('button', { name: /Retomar visibilidade/ })).toHaveLength(1);
  expect(
    screen.getByText(/0 alterações registradas; 0 sem mudança; conferir resultado/),
  ).toBeVisible();
  expect(s.resume).not.toHaveBeenCalled();
  expect(s.apply).not.toHaveBeenCalled();
  expect(s.review).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Retomar visibilidade 1' }));
  expect(select).toHaveBeenCalledWith('recovered');
  await user.click(screen.getByRole('button', { name: 'Próxima página' }));
  await waitFor(() => expect(s.list).toHaveBeenLastCalledWith('next', 50));
});
it('discovery has loading, empty, error and retry with no stale results', async () => {
  const pending = deferred<Awaited<ReturnType<Session['recoveries']>>>();
  s.list.mockReturnValueOnce(pending.promise);
  const user = userEvent.setup();
  render(<BookLoreVisibilitySelectionRecoveries bookId="book" onSelect={() => {}} />);
  expect(screen.getByText('Buscando seleções...')).toBeVisible();
  await act(() => Promise.resolve(pending.resolve({ items: [], next: 'later' })));
  await screen.findByText('Há mais operações da sua conta na próxima página.');
  s.list.mockRejectedValueOnce(Error('Storage busy'));
  await user.click(screen.getByRole('button', { name: 'Atualizar lista' }));
  await screen.findByText('Storage busy');
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByText('Nenhuma seleção nesta página');
});
