import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BookLoreRemovalDialog,
  type BookLoreRemovalDialogProps,
} from '../components/BookLoreRemovalDialog';
import { BookLoreRemovalRecoveries } from '../components/BookLoreRemovalRecoveries';
import { initialRemovalJournal } from '../services/bookLoreRemovalJournalContracts';
import type { bookLoreRemovalSession } from '../services/bookLoreRemovalService';
type Snapshot = ReturnType<
  Awaited<ReturnType<ReturnType<typeof bookLoreRemovalSession>['createRemoval']>>['snapshot']
>;
type Input = Parameters<ReturnType<typeof bookLoreRemovalSession>['createRemoval']>[0];
const s = vi.hoisted(() => ({
  user: { uid: 'author' },
  actor: { uid: 'author' },
  notify: () => {},
  create: vi.fn<(input: Input) => Promise<unknown>>(),
  resume: vi.fn<(book: string, id: string) => Promise<unknown>>(),
  metadata: vi.fn<(book: string, id: string, token?: string) => Promise<unknown>>(),
  list: vi.fn(),
  advance: vi.fn<() => Promise<Snapshot>>(),
  apply: vi.fn<() => Promise<Snapshot>>(),
  cancel: vi.fn<() => Promise<Snapshot>>(),
  view: {} as Snapshot,
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
vi.mock('../services/bookLoreRemovalService', () => ({
  bookLoreRemovalSession: () => ({
    createRemoval: s.create,
    resumeRemoval: s.resume,
    metadata: s.metadata,
    recoveries: s.list,
  }),
}));
const token = 'a'.repeat(64);
const identity = {
  uid: 'author',
  bookId: 'book',
  loreId: 'entity',
  sourceToken: token,
  writeId: 'recovery-write',
};
const op = () => ({
  snapshot: () => ({ ...s.view }),
  advance: s.advance,
  apply: s.apply,
  cancel: s.cancel,
});
const inspected = () => ({
  inspectionId: 'lore-removal-source-' + token,
  startHash: token,
  jobToken: token,
  revision: 1,
  phase: 'ready',
  ready: true,
  nextIndex: 0,
  byteLength: 0,
  totalParts: 0,
});
const removed = () => ({
  removalId: 'lore-removal-' + token,
  startHash: token,
  jobToken: token,
  revision: 0,
  phase: 'edits',
  complete: false,
  removed: true as const,
  processed: 1,
  coordinatedUnits: 0,
});
beforeEach(() => {
  vi.resetAllMocks();
  s.user = { uid: 'author' };
  s.actor = { uid: 'author' };
  s.view = {
    ...initialRemovalJournal(identity),
    phase: 'inspecting',
    savePending: false,
    verified: false,
  };
  s.metadata.mockResolvedValue({ readToken: token });
  s.create.mockImplementation((input) => {
    s.view = { ...s.view, identity: { ...input, uid: 'author' } };
    return Promise.resolve(op());
  });
  s.resume.mockImplementation(() => Promise.resolve(op()));
  s.list.mockResolvedValue({ items: [], next: null });
  s.advance.mockImplementation(() => {
    if (s.view.phase === 'inspecting')
      s.view = { ...s.view, phase: 'ready', inspection: inspected() };
    else if (s.view.phase === 'cleaning' || s.view.phase === 'verifying')
      s.view = {
        ...s.view,
        phase: 'complete',
        verified: true,
        removal: { ...(s.view.removal ?? removed()), phase: 'finish', complete: true },
      };
    else if (s.view.phase === 'cancelling')
      s.view = { ...s.view, phase: 'cancelled', cancellationChecked: true };
    return Promise.resolve(s.view);
  });
  s.apply.mockImplementation(() => {
    s.view = { ...s.view, phase: 'cleaning', verified: true, removal: removed() };
    return Promise.resolve(s.view);
  });
  s.cancel.mockImplementation(() => {
    s.view = { ...s.view, phase: 'cancelling', cancelRequested: true, inspectionClosed: true };
    return Promise.resolve(s.view);
  });
});
function show(props: Partial<BookLoreRemovalDialogProps> = {}) {
  const onRemoved = vi.fn(),
    onClose = vi.fn(),
    user = userEvent.setup();
  const ui = render(
    <BookLoreRemovalDialog
      open
      bookId="book"
      loreId="entity"
      sourceToken={token}
      entityName="Original"
      onClose={onClose}
      onRemoved={onRemoved}
      {...props}
    />,
  );
  return { ...ui, user, onRemoved, onClose };
}
async function prepare(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Preparar retirada' }));
  await screen.findByRole('button', { name: 'Revisar retirada' });
}
async function review(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Revisar retirada' }));
  return screen.findByRole('button', { name: 'Confirmar retirada' });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it('opens with metadata only, prepares without applying and requires review plus explicit confirmation', async () => {
  const { user, onRemoved } = show();
  await screen.findByText('Original');
  expect(s.create).not.toHaveBeenCalled();
  expect(s.apply).not.toHaveBeenCalled();
  await prepare(user);
  expect(s.apply).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Confirmar retirada' })).not.toBeInTheDocument();
  const confirm = await review(user);
  expect(await screen.findByText('Confirmar a retirada irreversível?')).toBeVisible();
  expect(
    screen.getByText('Confirmar a retirada irreversível?').closest('[tabindex]'),
  ).toHaveFocus();
  await user.click(confirm);
  await screen.findByText('Retirada concluída.');
  expect(s.apply).toHaveBeenCalledTimes(1);
  expect(onRemoved).toHaveBeenCalledExactlyOnceWith('entity');
  await user.click(screen.getByRole('button', { name: 'Verificar resultado' }));
  expect(onRemoved).toHaveBeenCalledTimes(1);
});
it('back returns focus to review and does not call apply', async () => {
  const { user } = show();
  await prepare(user);
  await review(user);
  await user.click(screen.getByRole('button', { name: 'Voltar' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Revisar retirada' })).toHaveFocus(),
  );
  expect(s.apply).not.toHaveBeenCalled();
});
it('rechecks the same source token and refuses confirmation if the origin changed', async () => {
  const { user } = show();
  await prepare(user);
  s.metadata.mockRejectedValueOnce(Error('Origem mudou'));
  await user.click(screen.getByRole('button', { name: 'Revisar retirada' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Origem mudou');
  expect(screen.queryByRole('button', { name: 'Confirmar retirada' })).not.toBeInTheDocument();
  expect(s.metadata.mock.calls.every((c) => c[2] === token)).toBe(true);
  expect(s.apply).not.toHaveBeenCalled();
});
it('metadata failure offers retry without creating or replacing the original source', async () => {
  s.metadata.mockRejectedValueOnce(Error('Sem acesso'));
  const { user } = show();
  await screen.findByText('Sem acesso');
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByText('Original');
  expect(s.metadata.mock.calls).toEqual([
    ['book', 'entity', token],
    ['book', 'entity', token],
  ]);
  expect(s.create).not.toHaveBeenCalled();
});
it('retries a failed initial journal commit with the same write ID', async () => {
  s.create.mockRejectedValueOnce(Error('Disco temporariamente indisponível'));
  const { user } = show();
  await user.click(await screen.findByRole('button', { name: 'Preparar retirada' }));
  await screen.findByRole('alert');
  await prepare(user);
  expect(s.create).toHaveBeenCalledTimes(2);
  expect(s.create.mock.calls[0]![0]).toEqual(s.create.mock.calls[1]![0]);
});
it('resumes locally, verifies an uncertain result and requires a new explicit review to resend', async () => {
  s.view = { ...s.view, phase: 'uncertain' };
  const { user, onRemoved } = show({ resumeWriteId: identity.writeId });
  await screen.findByText(/A retirada ainda não foi confirmada/);
  expect(s.metadata).not.toHaveBeenCalled();
  expect(s.advance).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Revisar reenvio' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Verificar resultado' }));
  await user.click(await screen.findByRole('button', { name: 'Revisar reenvio' }));
  expect(s.metadata).toHaveBeenCalledWith('book', 'entity', token);
  await user.click(await screen.findByRole('button', { name: 'Confirmar reenvio' }));
  await screen.findByText('Retirada concluída.');
  expect(s.apply).toHaveBeenCalledTimes(1);
  expect(onRemoved).toHaveBeenCalledTimes(1);
});
it('accepted uncertainty is confirmed by verify without apply', async () => {
  s.view = { ...s.view, phase: 'uncertain' };
  s.advance.mockImplementationOnce(() => {
    s.view = { ...s.view, phase: 'cleaning', verified: true, removal: removed() };
    return Promise.resolve(s.view);
  });
  const { user, onRemoved } = show({ resumeWriteId: identity.writeId });
  await user.click(await screen.findByRole('button', { name: 'Verificar resultado' }));
  await screen.findByText('Retirada concluída.');
  expect(onRemoved).toHaveBeenCalledTimes(1);
  expect(s.apply).not.toHaveBeenCalled();
});
it('a cold completed record does not notify until remote verification', async () => {
  s.view = {
    ...s.view,
    phase: 'verifying',
    removal: { ...removed(), phase: 'finish', complete: true },
  };
  const { user, onRemoved } = show({ resumeWriteId: identity.writeId });
  await screen.findByText(/Há uma conclusão registrada/);
  expect(onRemoved).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Verificar resultado' }));
  await screen.findByText('Retirada concluída.');
  expect(onRemoved).toHaveBeenCalledExactlyOnceWith('entity');
});
it('rejects a recovery for another book or entity before cancel, metadata or production', async () => {
  s.view = { ...s.view, identity: { ...identity, loreId: 'other' } };
  show({ resumeWriteId: identity.writeId });
  await screen.findByText('A recuperação não pertence à ficha selecionada.');
  expect(s.metadata).not.toHaveBeenCalled();
  expect(s.advance).not.toHaveBeenCalled();
  expect(s.cancel).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Cancelar preparação' })).not.toBeInTheDocument();
});
it('saving debt does not produce another unit or authorize resend without a metadata query', async () => {
  s.view = { ...s.view, phase: 'uncertain', savePending: true };
  s.advance.mockImplementationOnce(() => {
    s.view = { ...s.view, savePending: false };
    return Promise.resolve(s.view);
  });
  const { user } = show({ resumeWriteId: identity.writeId });
  await user.click(await screen.findByRole('button', { name: 'Salvar recuperação' }));
  expect(s.advance).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Revisar reenvio' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Verificar resultado' }));
  await screen.findByRole('button', { name: 'Revisar reenvio' });
});
it('cancel remains independent of an unresolved apply and late replies never continue the old run', async () => {
  const held = deferred<Snapshot>();
  s.apply.mockImplementationOnce(() => held.promise);
  const { user } = show();
  await prepare(user);
  await user.click(await review(user));
  await user.click(screen.getByRole('button', { name: 'Cancelar preparação' }));
  await screen.findByText('Esta tentativa foi cancelada.');
  expect(s.resume).toHaveBeenCalledTimes(1);
  const before = s.advance.mock.calls.length;
  await act(async () => {
    held.resolve(s.view);
    await held.promise;
  });
  expect(s.advance).toHaveBeenCalledTimes(before);
  expect(screen.getByText('Esta tentativa foi cancelada.')).toBeVisible();
});
it('a lost cancellation reply can be verified through a fresh handle while the old apply is still pending', async () => {
  const held = deferred<Snapshot>();
  s.apply.mockImplementationOnce(() => held.promise);
  s.cancel.mockImplementationOnce(() => {
    s.view = { ...s.view, phase: 'cancelling', cancelRequested: true, inspectionClosed: false };
    return Promise.reject(Error('Resposta do cancelamento perdida'));
  });
  s.advance
    .mockImplementationOnce(() => {
      s.view = { ...s.view, phase: 'ready', inspection: inspected() };
      return Promise.resolve(s.view);
    })
    .mockImplementationOnce(() => {
      s.view = { ...s.view, phase: 'cancelled', inspectionClosed: true, cancellationChecked: true };
      return Promise.resolve(s.view);
    });
  const { user } = show();
  await prepare(user);
  await user.click(await review(user));
  await user.click(screen.getByRole('button', { name: 'Cancelar preparação' }));
  await screen.findByRole('alert');
  expect(s.resume).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Verificar resultado' }));
  await screen.findByText('Esta tentativa foi cancelada.');
  await act(async () => {
    held.resolve(s.view);
    await held.promise;
  });
});
it('a failed cancellation journal commit offers cancellation retry instead of reopening production', async () => {
  s.cancel.mockImplementationOnce(() => {
    s.view = { ...s.view, savePending: true };
    return Promise.reject(Error('Falha local de cancelamento'));
  });
  const { user } = show();
  await prepare(user);
  await user.click(screen.getByRole('button', { name: 'Cancelar preparação' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Salvar recuperação' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Revisar retirada' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Repetir cancelamento' }));
  expect(s.cancel).toHaveBeenCalledTimes(2);
});
it('close is available during production and does not install an unsaved-text unload warning', async () => {
  const held = deferred<Snapshot>();
  s.advance.mockImplementationOnce(() => held.promise);
  const ui = show();
  await ui.user.click(await screen.findByRole('button', { name: 'Preparar retirada' }));
  const event = new Event('beforeunload', { cancelable: true });
  fireEvent(window, event);
  expect(event.defaultPrevented).toBe(false);
  await ui.user.click(screen.getAllByRole('button', { name: 'Fechar' })[0]!);
  expect(ui.onClose).toHaveBeenCalledTimes(1);
  ui.unmount();
  await act(async () => {
    held.resolve(s.view);
    await held.promise;
  });
  expect(s.advance).toHaveBeenCalledTimes(1);
});
it('profile updates preserve the preparation; SDK actor replacement remounts it', async () => {
  const { user } = show();
  await prepare(user);
  act(() => {
    s.user = { uid: 'author' };
    s.notify();
  });
  expect(screen.getByRole('button', { name: 'Revisar retirada' })).toBeVisible();
  act(() => {
    s.actor = { uid: 'author' };
    s.user = { uid: 'author' };
    s.notify();
  });
  await screen.findByRole('button', { name: 'Preparar retirada' });
  expect(s.apply).not.toHaveBeenCalled();
});
it('recovery discovery is metadata-only, scoped to the book and opens explicitly', async () => {
  s.list.mockResolvedValue({
    items: [
      initialRemovalJournal(identity),
      initialRemovalJournal({ ...identity, writeId: 'other-book', bookId: 'other' }),
    ],
    next: null,
  });
  const onSelect = vi.fn(),
    user = userEvent.setup();
  render(<BookLoreRemovalRecoveries bookId="book" onSelect={onSelect} />);
  await screen.findByText('Preparação disponível');
  expect(s.list).toHaveBeenCalledWith(undefined, 50);
  expect(s.resume).not.toHaveBeenCalled();
  expect(s.metadata).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Retomar retirada 1' }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(identity.writeId, identity.loreId);
});
it('recovery discovery covers error, retry, empty pages and pagination without automatic operation replay', async () => {
  s.list
    .mockRejectedValueOnce(Error('Lista indisponível'))
    .mockResolvedValueOnce({ items: [], next: 'cursor' });
  const user = userEvent.setup();
  render(<BookLoreRemovalRecoveries bookId="book" onSelect={vi.fn()} />);
  await screen.findByText('Lista indisponível');
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByText('Nenhuma retirada nesta página');
  await user.click(screen.getByRole('button', { name: 'Próxima página' }));
  await waitFor(() => expect(s.list).toHaveBeenLastCalledWith('cursor', 50));
  expect(s.advance).not.toHaveBeenCalled();
});
it('completed records are described as registered until verified and closed cancellations are omitted', async () => {
  s.list.mockResolvedValue({
    items: [
      {
        ...initialRemovalJournal(identity),
        removal: { ...removed(), complete: true, phase: 'finish' },
      },
      {
        ...initialRemovalJournal({ ...identity, writeId: 'cancelled' }),
        cancelRequested: true,
        inspectionClosed: true,
        cancellationChecked: true,
      },
    ],
    next: null,
  });
  render(<BookLoreRemovalRecoveries bookId="book" onSelect={vi.fn()} />);
  await screen.findByText('Conclusão registrada; conferir resultado');
  expect(screen.getAllByRole('button', { name: /Retomar retirada/ })).toHaveLength(1);
});

it('a pending apply shows uncertainty instead of claiming the ficha is still present', async () => {
  const held = deferred<Snapshot>();
  s.apply.mockImplementationOnce(() => held.promise);
  const { user } = show();
  await prepare(user);
  await user.click(await review(user));
  await screen.findByText('Aguardando confirmação da retirada...');
  expect(
    screen.queryByText('Preparação concluída. A ficha permanece no livro.'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('Uma retirada já registrada permanece mesmo após cancelar a preparação.'),
  ).toBeVisible();
  await act(async () => {
    held.resolve(s.view);
    await held.promise;
  });
});
it('a cold cleanup record is described as local until a native result is verified', async () => {
  s.view = { ...s.view, phase: 'cleaning', removal: removed(), verified: false };
  const { user, onRemoved } = show({ resumeWriteId: identity.writeId });
  await screen.findByText(
    'Há uma retirada registrada neste dispositivo. Verifique o resultado para continuar.',
  );
  expect(onRemoved).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Verificar resultado' }));
  await screen.findByText('Retirada concluída.');
  expect(onRemoved).toHaveBeenCalledTimes(1);
});
it('cleanup errors preserve the confirmed withdrawal and require an explicit retry', async () => {
  const { user, onRemoved } = show();
  await prepare(user);
  s.advance.mockRejectedValueOnce(Error('Limpeza interrompida'));
  await user.click(await review(user));
  await screen.findByRole('alert');
  expect(onRemoved).toHaveBeenCalledTimes(1);
  expect(s.apply).toHaveBeenCalledTimes(1);
  const before = s.advance.mock.calls.length;
  await user.click(screen.getByRole('button', { name: 'Continuar limpeza' }));
  await screen.findByText('Retirada concluída.');
  expect(s.advance).toHaveBeenCalledTimes(before + 1);
  expect(onRemoved).toHaveBeenCalledTimes(1);
});
it('handoff verification stops without polling or collecting on its own', async () => {
  s.view = {
    ...s.view,
    phase: 'handed-off',
    removal: { ...removed(), phase: 'handed-off' },
    verified: false,
  };
  s.advance.mockImplementationOnce(() => {
    s.view = { ...s.view, verified: true };
    return Promise.resolve(s.view);
  });
  const { user } = show({ resumeWriteId: identity.writeId });
  await user.click(await screen.findByRole('button', { name: 'Verificar resultado' }));
  await screen.findByText('A exclusão do livro assumiu a limpeza desta ficha.');
  expect(s.advance).toHaveBeenCalledTimes(1);
  expect(s.apply).not.toHaveBeenCalled();
});
it('a preparation error preserves recovery and does not retry production automatically', async () => {
  s.advance.mockRejectedValueOnce(Error('Preparação interrompida'));
  const { user } = show();
  await user.click(await screen.findByRole('button', { name: 'Preparar retirada' }));
  await screen.findByRole('alert');
  expect(s.advance).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Continuar preparação' }));
  await screen.findByRole('button', { name: 'Revisar retirada' });
  expect(s.advance).toHaveBeenCalledTimes(2);
});

it('requires the captured source token for a new target and never fetches a replacement origin', async () => {
  show({ sourceToken: undefined });
  await screen.findByText('Selecione novamente a ficha para conferir sua origem.');
  expect(s.metadata).not.toHaveBeenCalled();
  expect(s.create).not.toHaveBeenCalled();
  expect(s.apply).not.toHaveBeenCalled();
});
