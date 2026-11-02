import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BookLoreRemovalSelectionDialog,
  type BookLoreRemovalSelectionDialogProps,
} from '../components/BookLoreRemovalSelectionDialog';
import { BookLoreRemovalSelectionRecoveries } from '../components/BookLoreRemovalSelectionRecoveries';
import {
  createRemovalSelection,
  makeSelectionOutcome,
  type RemovalSelectionOutcome,
} from '../services/bookLoreRemovalSelectionContracts';
import type { bookLoreRemovalSelectionSession } from '../services/bookLoreRemovalSelectionService';

type Session = ReturnType<typeof bookLoreRemovalSelectionSession>;
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
  pack: {} as ReturnType<typeof createRemovalSelection>,
  view: {} as Snapshot,
  outcomes: [] as (RemovalSelectionOutcome | null)[],
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
vi.mock('../services/bookLoreRemovalSelectionService', () => ({
  bookLoreRemovalSelectionSession: () => ({
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
    members: targets,
  },
) {
  s.pack = createRemovalSelection({ ...input, uid: 'author' });
  s.outcomes = input.members.map(() => null);
  s.names = input.members.map((_, i) => 'Ficha literal ' + i);
  s.view = {
    identity: s.pack.root.manifest.identity,
    manifestHash: s.pack.root.manifest.manifestHash,
    count: input.members.length,
    cursor: 0,
    cancelCursor: 0,
    cancelRequested: false,
    recordedRemoved: 0,
    recordedConflicts: 0,
    recordedCancelled: 0,
    verifiedCount: 0,
    phase: 'preparing',
    savePending: false,
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
function removeCurrent() {
  const i = s.view.cursor,
    member = s.pack.pages[Math.floor(i / 50)]!.items[i % 50]!;
  s.outcomes[i] = makeSelectionOutcome(s.pack.root, member, 'removed', 'f'.repeat(64));
  s.view = {
    ...s.view,
    cursor: i + 1,
    recordedRemoved: s.view.recordedRemoved + 1,
    verifiedCount: s.view.verifiedCount + 1,
    phase: i + 1 === s.view.count ? 'complete' : 'preparing',
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
      root: s.pack.root,
      page: s.pack.pages[index]!,
      outcomes: s.outcomes.slice(index * 50, (index + 1) * 50),
    }),
  );
  s.review.mockImplementation(() =>
    Promise.resolve({
      manifestHash: s.view.manifestHash,
      selectionId: s.view.identity.selectionId,
      count: s.view.count,
      members: s.pack.pages
        .flatMap((p) => p.items)
        .filter((m) => !s.outcomes[m.index])
        .map((m) => ({
          index: m.index,
          loreId: m.loreId,
          sourceToken: m.sourceToken,
          name: s.names[m.index]!,
        })),
    }),
  );
  s.advance.mockImplementation(() => {
    if (s.view.savePending) s.view = { ...s.view, savePending: false };
    else if (s.view.phase === 'preparing') s.view = { ...s.view, phase: 'ready' };
    else if (s.view.phase === 'verifying')
      s.view = { ...s.view, phase: 'complete', verifiedCount: s.view.count };
    else if (s.view.phase === 'cancelling') {
      for (const p of s.pack.pages)
        for (const m of p.items)
          if (!s.outcomes[m.index])
            s.outcomes[m.index] = makeSelectionOutcome(s.pack.root, m, 'cancelled', null);
      s.view = {
        ...s.view,
        phase: 'cancelled',
        cancelCursor: s.view.count,
        verifiedCount: s.view.count,
        recordedCancelled: s.view.count - s.view.recordedRemoved - s.view.recordedConflicts,
      };
    }
    return Promise.resolve({ ...s.view });
  });
  s.apply.mockImplementation(() => {
    if (s.view.phase === 'ready') removeCurrent();
    else s.view = { ...s.view, phase: 'ready' };
    return Promise.resolve({ ...s.view });
  });
  s.retry.mockImplementation(() => {
    removeCurrent();
    return Promise.resolve({ ...s.view });
  });
  s.cancel.mockImplementation(() => {
    s.view = { ...s.view, phase: 'cancelling', cancelRequested: true };
    return Promise.resolve({ ...s.view });
  });
});
function show(props: Partial<BookLoreRemovalSelectionDialogProps> = {}) {
  const user = userEvent.setup(),
    onCompleted = vi.fn(),
    onClose = vi.fn(),
    ui = render(
      <BookLoreRemovalSelectionDialog
        open
        bookId="book"
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
  return screen.findByRole('button', { name: 'Confirmar retirada da seleção' });
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
it('does not open a job on initial display and requires review plus a separate explicit confirmation', async () => {
  const f = show();
  expect(s.create).not.toHaveBeenCalled();
  expect(s.apply).not.toHaveBeenCalled();
  const confirm = await review(f.user);
  expect(s.create).toHaveBeenCalledOnce();
  expect(s.review).toHaveBeenCalledOnce();
  expect(s.apply).not.toHaveBeenCalled();
  expect(screen.getByText('Ficha literal 0')).toBeVisible();
  expect(screen.getByText('Confirmar retirada irreversível?').closest('[tabindex]')).toHaveFocus();
  await f.user.click(confirm);
  await waitFor(() =>
    expect(f.onCompleted).toHaveBeenCalledExactlyOnceWith(
      targets.map((t) => t.loreId),
      { phase: 'complete', total: 3, conflicts: 0, cancelled: 0 },
    ),
  );
  await f.user.click(screen.getByRole('button', { name: 'Conferir resultado' }));
  expect(f.onCompleted).toHaveBeenCalledOnce();
});
it('back returns focus to review and does not apply', async () => {
  const f = show();
  await review(f.user);
  await f.user.click(screen.getByRole('button', { name: 'Voltar' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Conferir seleção' })).toHaveFocus(),
  );
  expect(s.apply).not.toHaveBeenCalled();
});
it('renders the complete review for 53 original targets with literal names and no artificial ceiling', async () => {
  const many = Array.from({ length: 53 }, (_, i) => ({
    loreId: 'id-' + i,
    sourceToken: 'a'.repeat(64),
  }));
  const f = show({ targets: many });
  await review(f.user);
  expect(screen.getByRole('list', { name: 'Fichas conferidas' }).children).toHaveLength(53);
  expect(s.create.mock.calls[0]![0].members).toHaveLength(53);
  expect(s.apply).not.toHaveBeenCalled();
});
it('keeps an open attempt fixed when target props refresh', async () => {
  const f = show();
  await review(f.user);
  const original = s.create.mock.calls[0]![0];
  f.rerender(
    <BookLoreRemovalSelectionDialog
      open
      bookId="book"
      targets={[{ loreId: 'later', sourceToken: 'b'.repeat(64) }]}
      onCompleted={f.onCompleted}
      onClose={f.onClose}
    />,
  );
  await f.user.click(screen.getByRole('button', { name: 'Confirmar retirada da seleção' }));
  await waitFor(() => expect(f.onCompleted).toHaveBeenCalledOnce());
  expect(s.create).toHaveBeenCalledExactlyOnceWith(original);
});
it('review errors focus feedback and preserve the same recoverable attempt for another review', async () => {
  const f = show();
  s.review.mockRejectedValueOnce(Error('Origin changed'));
  await f.user.click(screen.getByRole('button', { name: 'Conferir seleção' }));
  const error = await screen.findByText('Origin changed');
  expect(error.closest('[tabindex]')).toHaveFocus();
  expect(s.apply).not.toHaveBeenCalled();
  await review(f.user);
  expect(s.create).toHaveBeenCalledOnce();
});
it('source names are never displayed before authorized review completes', async () => {
  const f = show(),
    pending = deferred<Awaited<ReturnType<Session['review']>>>();
  s.review.mockReturnValueOnce(pending.promise);
  await f.user.click(screen.getByRole('button', { name: 'Conferir seleção' }));
  expect(screen.queryByText('Ficha literal 0')).not.toBeInTheDocument();
  await f.user.click(screen.getAllByRole('button', { name: 'Fechar' })[0]!);
  await act(() =>
    Promise.resolve(
      pending.resolve({
        manifestHash: s.view.manifestHash,
        selectionId: s.view.identity.selectionId,
        count: 3,
        members: [
          {
            index: 0,
            loreId: targets[0]!.loreId,
            sourceToken: targets[0]!.sourceToken,
            name: 'Late private name',
          },
        ],
      }),
    ),
  );
  expect(screen.queryByText('Late private name')).not.toBeInTheDocument();
  expect(s.apply).not.toHaveBeenCalled();
});
it('resumes recorded completion neutrally and calls back only after verification', async () => {
  while (s.view.cursor < s.view.count) removeCurrent();
  s.view = { ...s.view, phase: 'verifying', verifiedCount: 0 };
  const f = show({ targets: undefined, resumeSelectionId: 'recovered' });
  await screen.findByText('Há resultados registrados neste dispositivo. Verifique para confirmar.');
  expect(s.advance).not.toHaveBeenCalled();
  expect(f.onCompleted).not.toHaveBeenCalled();
  await f.user.click(screen.getByRole('button', { name: 'Verificar progresso' }));
  await waitFor(() => expect(f.onCompleted).toHaveBeenCalledOnce());
  expect(s.apply).not.toHaveBeenCalled();
});
it('uncertain recovery requires a query and a fresh review before retrying exactly one member', async () => {
  s.view = { ...s.view, phase: 'uncertain' };
  const f = show({ targets: undefined, resumeSelectionId: 'recovered' });
  await screen.findByRole('button', { name: 'Verificar progresso' });
  expect(screen.queryByRole('button', { name: 'Revisar reenvio' })).not.toBeInTheDocument();
  await f.user.click(screen.getByRole('button', { name: 'Verificar progresso' }));
  await f.user.click(await screen.findByRole('button', { name: 'Revisar reenvio' }));
  await f.user.click(await screen.findByRole('button', { name: 'Reenviar pedido desta ficha' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Conferir seleção' })).toBeEnabled(),
  );
  expect(s.retry).toHaveBeenCalledOnce();
  expect(s.apply).not.toHaveBeenCalled();
  expect(s.view.recordedRemoved).toBe(1);
  expect(f.onCompleted).not.toHaveBeenCalled();
});
it('local ACK debt only saves on the next action and never exposes an apply confirmation', async () => {
  s.view = { ...s.view, phase: 'uncertain', savePending: true };
  const f = show({ targets: undefined, resumeSelectionId: 'recovered' });
  await f.user.click(await screen.findByRole('button', { name: 'Salvar recuperação' }));
  expect(s.advance).toHaveBeenCalledOnce();
  expect(s.apply).not.toHaveBeenCalled();
  expect(s.retry).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Revisar reenvio' })).not.toBeInTheDocument();
});
it('scope mismatch never opens another book or invokes an action', async () => {
  s.view = { ...s.view, identity: { ...s.view.identity, bookId: 'other' } };
  show({ targets: undefined, resumeSelectionId: 'recovered' });
  await screen.findByText('A recuperação não pertence à seleção deste livro.');
  expect(s.review).not.toHaveBeenCalled();
  expect(s.apply).not.toHaveBeenCalled();
});
it('cancellation uses a fresh handle and is not blocked by a held producer response', async () => {
  const f = show();
  await review(f.user);
  const held = deferred<Snapshot>();
  s.apply.mockReturnValueOnce(held.promise);
  await f.user.click(screen.getByRole('button', { name: 'Confirmar retirada da seleção' }));
  await f.user.click(screen.getByRole('button', { name: 'Cancelar operação' }));
  await screen.findByText('Operação cancelada. 0 retiradas já aceitas foram preservadas.');
  expect(s.resume).toHaveBeenCalledWith('book', s.view.identity.selectionId);
  expect(f.onCompleted).toHaveBeenCalledExactlyOnceWith([], {
    phase: 'cancelled',
    total: 3,
    conflicts: 0,
    cancelled: 3,
  });
  await act(() =>
    Promise.resolve(held.resolve({ ...s.view, phase: 'complete', recordedRemoved: 3 })),
  );
  expect(f.onCompleted).toHaveBeenCalledOnce();
  expect(
    screen.getByText('Operação cancelada. 0 retiradas já aceitas foram preservadas.'),
  ).toBeVisible();
});
it('cancel failure stays repeatable and never silently enables a producer', async () => {
  const f = show();
  await review(f.user);
  s.cancel.mockRejectedValueOnce(Error('Cancel reply lost'));
  await f.user.click(screen.getByRole('button', { name: 'Cancelar operação' }));
  await screen.findByText('Cancel reply lost');
  expect(screen.getByRole('button', { name: 'Verificar progresso' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Conferir seleção' })).not.toBeInTheDocument();
  await f.user.click(screen.getByRole('button', { name: 'Repetir cancelamento' }));
  await screen.findByText('Operação cancelada. 0 retiradas já aceitas foram preservadas.');
  expect(s.apply).not.toHaveBeenCalled();
});
it('profile refresh preserves review while replacing the SDK actor hides it', async () => {
  const f = show();
  await review(f.user);
  await act(() => {
    s.user = { uid: 'author' };
    s.notify();
    return Promise.resolve();
  });
  expect(screen.getByRole('button', { name: 'Confirmar retirada da seleção' })).toBeVisible();
  await act(() => {
    s.actor = { uid: 'author' };
    s.user = { uid: 'author' };
    s.notify();
    return Promise.resolve();
  });
  expect(
    screen.queryByRole('button', { name: 'Confirmar retirada da seleção' }),
  ).not.toBeInTheDocument();
  expect(s.apply).not.toHaveBeenCalled();
});
it('an empty selection has the standard empty state and cannot create or apply', () => {
  show({ targets: [] });
  expect(screen.getByText('Nenhuma ficha selecionada')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Conferir seleção' })).toBeDisabled();
  expect(s.create).not.toHaveBeenCalled();
});
it('partial result only reports the original confirmed removed IDs', async () => {
  const f = show();
  await review(f.user);
  s.apply.mockImplementationOnce(() => {
    s.outcomes[0] = makeSelectionOutcome(
      s.pack.root,
      s.pack.pages[0]!.items[0]!,
      'removed',
      'f'.repeat(64),
    );
    for (let i = 1; i < 3; i++)
      s.outcomes[i] = makeSelectionOutcome(
        s.pack.root,
        s.pack.pages[0]!.items[i]!,
        'conflict',
        null,
      );
    s.view = {
      ...s.view,
      phase: 'partial',
      cursor: 3,
      recordedRemoved: 1,
      recordedConflicts: 2,
      verifiedCount: 3,
    };
    return Promise.resolve(s.view);
  });
  await f.user.click(screen.getByRole('button', { name: 'Confirmar retirada da seleção' }));
  await waitFor(() =>
    expect(f.onCompleted).toHaveBeenCalledExactlyOnceWith([targets[0]!.loreId], {
      phase: 'partial',
      total: 3,
      conflicts: 2,
      cancelled: 0,
    }),
  );
});
it('discovery reads metadata, filters the book and keeps recorded results neutral', async () => {
  s.list.mockResolvedValueOnce({
    items: [
      s.pack.root,
      createRemovalSelection({
        uid: 'author',
        bookId: 'other',
        selectionId: 'other',
        members: targets,
      }).root,
    ],
    next: 'next',
  });
  const onSelect = vi.fn(),
    user = userEvent.setup();
  render(<BookLoreRemovalSelectionRecoveries bookId="book" onSelect={onSelect} />);
  await screen.findByText('Seleção de 3 fichas');
  expect(screen.getAllByRole('button', { name: /Retomar seleção/ })).toHaveLength(1);
  expect(screen.getByText('0 retiradas registradas; conferir resultado')).toBeVisible();
  expect(s.resume).not.toHaveBeenCalled();
  expect(s.review).not.toHaveBeenCalled();
  expect(s.apply).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Retomar seleção 1' }));
  expect(onSelect).toHaveBeenCalledWith('recovered');
  await user.click(screen.getByRole('button', { name: 'Próxima página' }));
  await waitFor(() => expect(s.list).toHaveBeenLastCalledWith('next', 50));
});
it('discovery exposes loading, error/retry and an empty page with further account records', async () => {
  const pending = deferred<Awaited<ReturnType<Session['recoveries']>>>();
  s.list.mockReturnValueOnce(pending.promise);
  const user = userEvent.setup();
  render(<BookLoreRemovalSelectionRecoveries bookId="book" onSelect={() => {}} />);
  expect(screen.getByText('Buscando seleções...')).toBeVisible();
  await act(() => Promise.resolve(pending.resolve({ items: [], next: 'later' })));
  expect(
    await screen.findByText('Há mais operações da sua conta na próxima página.'),
  ).toBeVisible();
  s.list.mockRejectedValueOnce(Error('Local storage busy'));
  await user.click(screen.getByRole('button', { name: 'Atualizar lista' }));
  await screen.findByText('Local storage busy');
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByText('Nenhuma seleção nesta página');
});

it('a review from another manifest cannot become a destructive confirmation', async () => {
  const f = show();
  s.review.mockResolvedValueOnce({
    manifestHash: 'b'.repeat(64),
    selectionId: 'wrong',
    count: 3,
    members: [],
  });
  await f.user.click(screen.getByRole('button', { name: 'Conferir seleção' }));
  await screen.findByText('A revisão não pertence à seleção.');
  expect(
    screen.queryByRole('button', { name: 'Confirmar retirada da seleção' }),
  ).not.toBeInTheDocument();
  expect(s.apply).not.toHaveBeenCalled();
});
it('a failed query does not enable a destructive resend', async () => {
  s.view = { ...s.view, phase: 'uncertain' };
  const f = show({ targets: undefined, resumeSelectionId: 'recovered' });
  s.advance.mockRejectedValueOnce(Error('Offline query'));
  await f.user.click(await screen.findByRole('button', { name: 'Verificar progresso' }));
  await screen.findByText('Offline query');
  expect(screen.queryByRole('button', { name: 'Revisar reenvio' })).not.toBeInTheDocument();
  expect(s.retry).not.toHaveBeenCalled();
});
it('a save failure after confirmation stops the driver and the next action only saves', async () => {
  const f = show();
  await review(f.user);
  s.apply.mockImplementationOnce(() => {
    s.view = { ...s.view, phase: 'uncertain', savePending: true };
    return Promise.reject(Error('Local ACK failed'));
  });
  await f.user.click(screen.getByRole('button', { name: 'Confirmar retirada da seleção' }));
  await screen.findByText('Local ACK failed');
  await f.user.click(screen.getByRole('button', { name: 'Salvar recuperação' }));
  expect(s.apply).toHaveBeenCalledOnce();
  expect(s.advance).toHaveBeenCalledOnce();
  expect(s.retry).not.toHaveBeenCalled();
  expect(f.onCompleted).not.toHaveBeenCalled();
});
it('switching books fences a late authorized name review from the previous host', async () => {
  const f = show(),
    pending = deferred<Awaited<ReturnType<Session['review']>>>();
  s.review.mockReturnValueOnce(pending.promise);
  await f.user.click(screen.getByRole('button', { name: 'Conferir seleção' }));
  f.rerender(
    <BookLoreRemovalSelectionDialog open bookId="other" targets={targets} onClose={f.onClose} />,
  );
  await act(() =>
    Promise.resolve(
      pending.resolve({
        manifestHash: s.view.manifestHash,
        selectionId: s.view.identity.selectionId,
        count: 3,
        members: [
          {
            index: 0,
            loreId: targets[0]!.loreId,
            sourceToken: targets[0]!.sourceToken,
            name: 'Previous book secret name',
          },
        ],
      }),
    ),
  );
  expect(screen.queryByText('Previous book secret name')).not.toBeInTheDocument();
  expect(s.apply).not.toHaveBeenCalled();
});
