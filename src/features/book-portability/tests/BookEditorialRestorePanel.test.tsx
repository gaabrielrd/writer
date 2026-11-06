import { webcrypto } from 'node:crypto';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BookEditorialRestorePanel } from '../components/BookEditorialRestorePanel';
import type {
  EditorialReviewApi,
  EditorialReviewView,
  EditorialReviewWire,
  EditorialReviewOutcome,
} from '../model/bookEditorialReview';
const api = vi.hoisted(() => ({
  list: vi.fn<EditorialReviewApi['list']>(),
  get: vi.fn<EditorialReviewApi['get']>(),
  apply: vi.fn<EditorialReviewApi['apply']>(),
  retire: vi.fn<EditorialReviewApi['retire']>(),
  resolve: vi.fn<EditorialReviewApi['resolve']>(),
}));
const session = vi.hoisted(() => ({ uid: 'author', row: null as unknown, unavailable: false }));
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: session.uid ? { uid: session.uid } : null }),
}));
vi.mock('@/shared/lib', async (original) => ({
  ...(await original<typeof import('@/shared/lib')>()),
  auth: {
    get currentUser() {
      return session.uid ? { uid: session.uid } : null;
    },
  },
}));
vi.mock('../services/bookEditorialReviewApi', () => ({ bookEditorialReviewApi: api }));
vi.mock('../services/bookEditorialReviewJournal', async (original) => ({
  ...(await original<typeof import('../services/bookEditorialReviewJournal')>()),
  createEditorialReviewJournal: () => ({
    read: () =>
      session.unavailable
        ? Promise.reject(new Error('Armazenamento bloqueado'))
        : Promise.resolve(structuredClone(session.row)),
    compare: (expected: unknown, next: unknown) => {
      if (JSON.stringify(expected) !== JSON.stringify(session.row)) return Promise.resolve(false);
      session.row = structuredClone(next);
      return Promise.resolve(true);
    },
  }),
}));
vi.mock('../components/BookEditorialHistoryBrowser', () => ({
  BookEditorialHistoryBrowser: () => <p>Consulta privada do arquivo original</p>,
}));
vi.mock('../components/EditorialRestoreReferencePicker', () => ({
  EditorialRestoreReferencePicker: ({ onChange }: { onChange: (next: []) => void }) => (
    <button onClick={() => onChange([])}>Escolher nenhuma referência</button>
  ),
}));
const planId = 'restore-' + 'c'.repeat(64);
function record(id = 'contract'): EditorialReviewView {
  return {
    schemaVersion: 1,
    bookId: 'book',
    id,
    kind: id === 'contract' ? 'contract' : 'plan',
    title: id === 'contract' ? 'Contrato restaurado' : 'Plano restaurado',
    state: 'changed',
    reviewToken: 'a'.repeat(64),
    native: { revision: 2, contentHash: 'b'.repeat(64) },
    original: { revision: 1, contentHash: 'c'.repeat(64) },
    historicalStatus: 'approved',
    historicalCollaboration: null,
    pendingReferences: [],
    sources: [],
    reviewState: 'required',
    acknowledgement: null,
    currentChangedSinceAcknowledgement: null,
    canUseOriginalDraft: false,
  };
}
const confirmed = (
  wire: EditorialReviewWire,
): Extract<EditorialReviewOutcome, { kind: 'confirmed' }> => ({
  schemaVersion: 1,
  bookId: wire.bookId,
  kind: 'confirmed',
  receipt: {
    id: wire.id,
    kind: wire.id === 'contract' ? 'contract' : 'plan',
    operationId: wire.operationId,
    decision: wire.decision,
    nativeRevision: 2,
    nativeContentHash: 'b'.repeat(64),
    acknowledgedAt: 3,
    planChanged: false,
  },
});
function page() {
  return {
    schemaVersion: 1 as const,
    bookId: 'book',
    availability: 'available' as const,
    items: [record(), record(planId)].map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      reviewState: row.reviewState,
      acknowledgement: row.acknowledgement,
    })),
    next: null,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  session.uid = 'author';
  session.row = null;
  session.unavailable = false;
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', {
    locks: { request: <T,>(_name: string, run: () => Promise<T>) => run() },
  });
  api.list.mockResolvedValue(page());
  api.get.mockImplementation((_book, id) => Promise.resolve(record(id)));
  api.apply.mockImplementation((wire) => Promise.resolve(confirmed(wire)));
  api.resolve.mockResolvedValue({ schemaVersion: 1, bookId: 'book', state: 'unconfirmed' });
  api.retire.mockImplementation((wire) =>
    Promise.resolve({
      schemaVersion: 1,
      bookId: 'book',
      kind: 'retired',
      receipt: { id: wire.id, operationId: wire.operationId, retiredAt: 4 },
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
async function open(name = 'Contrato restaurado') {
  await userEvent.click(await screen.findByRole('button', { name: name + ' · a revisar' }));
  await screen.findByRole('combobox', { name: 'Como concluir esta revisão' });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Revisar escolha' })).toBeEnabled(),
  );
}
async function confirm() {
  await userEvent.click(screen.getByRole('button', { name: 'Revisar escolha' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Confirmar revisão' }));
}
it('lists historical records and switches to private history without sending an editorial decision', async () => {
  render(<BookEditorialRestorePanel bookId="book" />);
  await screen.findByRole('button', { name: 'Contrato restaurado · a revisar' });
  expect(api.apply).not.toHaveBeenCalled();
  expect(session.row).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Arquivo original' }));
  await screen.findByText('Consulta privada do arquivo original');
  await userEvent.click(screen.getByRole('button', { name: 'Revisões da cópia' }));
  await open();
  expect(screen.getByText(/O estado atual já foi alterado/)).toBeVisible();
  expect(api.get).toHaveBeenCalledWith('book', 'contract');
  expect(api.apply).not.toHaveBeenCalled();
});
it('requires a separate confirmation, writes its metadata first and adopts only the acknowledged current state', async () => {
  render(<BookEditorialRestorePanel bookId="book" />);
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Revisar escolha' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Continuar revisando' }));
  expect(api.apply).not.toHaveBeenCalled();
  api.apply.mockImplementation((wire) => {
    expect(session.row).toMatchObject({ phase: 'sent', wire });
    api.get.mockResolvedValue({
      ...record(),
      reviewState: 'acknowledged',
      acknowledgement: confirmed(wire).receipt,
    });
    return Promise.resolve(confirmed(wire));
  });
  await confirm();
  await screen.findByText('Revisão confirmada.');
  expect(api.apply).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      bookId: 'book',
      id: 'contract',
      reviewToken: 'a'.repeat(64),
      decision: 'keep-current',
    }),
  );
  expect(session.row).toBeNull();
  expect(screen.getByText('Revisado')).toBeVisible();
});
it('queries an uncertain decision without resending it and retries only after an explicit unconfirmed outcome', async () => {
  api.apply.mockRejectedValueOnce(new Error('Resposta perdida'));
  render(<BookEditorialRestorePanel bookId="book" />);
  await open();
  await confirm();
  await screen.findByText('Resposta perdida');
  expect(screen.queryByRole('button', { name: 'Reenviar mesmo pedido' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Conferir pedido' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Reenviar mesmo pedido' }));
  await screen.findByText('Revisão confirmada.');
  expect(api.apply.mock.calls[0]).toEqual(api.apply.mock.calls[1]);
  expect(api.resolve).toHaveBeenCalledOnce();
  expect(session.row).toBeNull();
});
it('closes an uncertain decision independently and preserves the current selection', async () => {
  api.apply.mockRejectedValueOnce(new Error('Resposta perdida'));
  render(<BookEditorialRestorePanel bookId="book" />);
  await open();
  await confirm();
  await userEvent.click(await screen.findByRole('button', { name: 'Encerrar pedido' }));
  await screen.findByText('Pedido encerrado. Sua seleção foi preservada para revisão.');
  expect(api.apply).toHaveBeenCalledOnce();
  expect(api.retire).toHaveBeenCalledOnce();
  expect(session.row).toBeNull();
});
it('requires explicit discard to change a dirty plan and keeps new native bases separate from the selection', async () => {
  const work = vi.fn();
  render(<BookEditorialRestorePanel bookId="book" onWorkChange={work} />);
  await open('Plano restaurado');
  await userEvent.click(screen.getByRole('combobox', { name: 'Como concluir esta revisão' }));
  await userEvent.click(screen.getByRole('option', { name: 'Escolher referências atuais' }));
  await userEvent.click(screen.getByRole('button', { name: 'Escolher nenhuma referência' }));
  await userEvent.click(screen.getByRole('button', { name: 'Contrato restaurado · a revisar' }));
  const discard = await screen.findByRole('dialog', {
    name: 'Descartar a seleção ainda não confirmada?',
  });
  await userEvent.click(within(discard).getByRole('button', { name: 'Preservar minha seleção' }));
  expect(screen.getByRole('combobox', { name: 'Como concluir esta revisão' })).toHaveTextContent(
    'Escolher referências atuais',
  );
  api.get.mockImplementation((_book, id) =>
    Promise.resolve({ ...record(id), reviewToken: 'd'.repeat(64) }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar base da revisão' }));
  await screen.findByText('A base mudou. Sua seleção foi preservada.');
  expect(screen.getByRole('button', { name: 'Revisar escolha' })).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Usar base atual mantendo minha seleção' }),
  );
  await confirm();
  await screen.findByText('Revisão confirmada.');
  expect(api.apply).toHaveBeenCalledWith(
    expect.objectContaining({
      reviewToken: 'd'.repeat(64),
      decision: 'reconcile-references',
      references: [],
    }),
  );
  expect(work).toHaveBeenCalledWith({ dirty: true, pending: false });
});
it('paginates and retries read failures while unavailable local storage blocks only confirmation', async () => {
  session.unavailable = true;
  api.list
    .mockRejectedValueOnce(new Error('Leitura indisponível'))
    .mockResolvedValueOnce({ ...page(), next: 'cursor' })
    .mockResolvedValueOnce({ ...page(), items: [], next: null });
  render(<BookEditorialRestorePanel bookId="book" />);
  await screen.findByText('Leitura indisponível');
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar lista' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Mais revisões' }));
  await userEvent.click(screen.getByRole('button', { name: 'Contrato restaurado · a revisar' }));
  await screen.findByRole('combobox', { name: 'Como concluir esta revisão' });
  expect(screen.getByRole('button', { name: 'Revisar escolha' })).toBeDisabled();
  session.unavailable = false;
  const storageError = screen
    .getByRole('heading', { name: 'Acompanhamento local indisponível' })
    .closest('[role="alert"]');
  if (!storageError) throw new Error('Aviso de armazenamento ausente');
  await userEvent.click(
    within(storageError as HTMLElement).getByRole('button', { name: 'Tentar novamente' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Revisar escolha' })).toBeEnabled(),
  );
  expect(api.apply).not.toHaveBeenCalled();
});
it('does not read private reviews without an authenticated actor', () => {
  session.uid = '';
  render(<BookEditorialRestorePanel bookId="book" />);
  expect(screen.getByText('Entre para consultar o arquivo restaurado')).toBeVisible();
  expect(api.list).not.toHaveBeenCalled();
});
