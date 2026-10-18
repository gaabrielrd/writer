import { publishInvalidation } from '@/shared/services';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  CampaignNote,
  CampaignNotesEnvelope,
  PendingCampaignNoteOperation,
  SavedCampaignNote,
} from '../model/campaignNote';
import * as calls from '../services/campaignNotesCallables';
import { CampaignNotesPanel } from '../components/CampaignNotesPanel';
import { useCampaignNoteMutation } from '../hooks/useCampaignNoteMutation';
import {
  campaignNoteJournalKey,
  clearPendingCampaignNote,
  readPendingCampaignNote,
  reserveCampaignNote,
} from '../services/campaignNotesRecovery';
const auth = vi.hoisted((): { user: { uid: string } | null } => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/campaignNotesCallables', () => ({
  listCampaignNotes: vi.fn(),
  getCampaignNote: vi.fn(),
  saveCampaignNote: vi.fn(),
  deleteCampaignNote: vi.fn(),
}));
const token = 'a'.repeat(64),
  replacementToken = 'b'.repeat(64);
let notes: Map<string, CampaignNote>, revision: number, currentToken: string;
let locks: Map<string, Promise<unknown>>, inLock: boolean;
let afterLock: (() => void) | undefined;
let lockWait: Promise<void> | null;
const envelope = (patch: Partial<CampaignNotesEnvelope> = {}): CampaignNotesEnvelope => ({
  schemaVersion: 1,
  ownerId: 'owner',
  campaignId: 'campaign',
  campaignToken: currentToken,
  collectionRevision: revision,
  ...patch,
});
const note = (patch: Partial<CampaignNote> = {}): CampaignNote => ({
  id: 'note',
  schemaVersion: 1,
  ownerId: 'owner',
  campaignId: 'campaign',
  revision: 1,
  title: 'Nota privada',
  content: 'Texto próprio',
  createdAt: 1000,
  updatedAt: 1000,
  ...patch,
});
const operation = (
  patch: Partial<
    Extract<PendingCampaignNoteOperation, { method: 'saveCampaignNote' }>['input']
  > = {},
): PendingCampaignNoteOperation => ({
  method: 'saveCampaignNote',
  input: {
    campaignId: 'campaign',
    campaignToken: token,
    noteId: 'create',
    operationId: 'create',
    expectedRevision: 0,
    title: 'Minha nota',
    content: 'Texto próprio\n🌕  ',
    ...patch,
  },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setLocks() {
  lockWait = null;
  afterLock = undefined;
  locks = new Map();
  inLock = false;
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (key: string, work: () => unknown) => {
        const previous = locks.get(key) ?? Promise.resolve();
        const result = previous
          .catch(() => undefined)
          .then(async () => {
            if (lockWait) await lockWait;
            inLock = true;
            try {
              return work();
            } finally {
              inLock = false;
              afterLock?.();
            }
          });
        locks.set(key, result);
        return result;
      },
    },
  });
}
function publishStorage() {
  window.dispatchEvent(
    new StorageEvent('storage', { key: campaignNoteJournalKey('owner', 'campaign') }),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  setLocks();
  auth.user = { uid: 'owner' };
  notes = new Map();
  revision = 0;
  currentToken = token;
  vi.mocked(calls.listCampaignNotes).mockImplementation(() =>
    Promise.resolve({
      ...envelope(),
      items: [...notes.values()].map(({ id, title, revision, createdAt, updatedAt }) => ({
        id,
        title,
        revision,
        createdAt,
        updatedAt,
      })),
      nextCursor: null,
    }),
  );
  vi.mocked(calls.getCampaignNote).mockImplementation((input) =>
    Promise.resolve({ ...envelope(), note: notes.get(input.noteId) ?? null }),
  );
  vi.mocked(calls.saveCampaignNote).mockImplementation((input) => {
    expect(inLock).toBe(false);
    const saved = note({
      id: input.noteId,
      revision: input.expectedRevision + 1,
      title: input.title.trim(),
      content: input.content,
      updatedAt: 1000 + input.expectedRevision,
    });
    notes.set(saved.id, saved);
    revision++;
    return Promise.resolve({ ...envelope(), note: saved });
  });
  vi.mocked(calls.deleteCampaignNote).mockImplementation((input) => {
    expect(inLock).toBe(false);
    notes.delete(input.noteId);
    revision++;
    return Promise.resolve({
      ...envelope(),
      noteId: input.noteId,
      revision: input.expectedRevision + 1,
      deleted: true,
    });
  });
});
async function openNew() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Nova nota' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Nova nota' }));
}
async function enter(title = 'Minha nota', content = 'Texto próprio\n🌕  ') {
  await userEvent.type(screen.getByLabelText('Título da nota'), title);
  fireEvent.change(screen.getByLabelText('Texto da nota'), { target: { value: content } });
}
it('começa em branco, preserva texto simples/Unicode e aceita o DTO confirmado sem outro GET', async () => {
  render(<CampaignNotesPanel campaignId="campaign" />);
  await openNew();
  expect(screen.getByLabelText('Título da nota')).toHaveValue('');
  expect(screen.getByLabelText('Texto da nota')).toHaveValue('');
  const text = '  <img src=x onerror=alert(1)>\n🐉 ação\n\n  ';
  await enter('  Minha nota  ', text);
  await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));
  expect(await screen.findByText('Nota salva.')).toBeInTheDocument();
  expect(screen.getByLabelText('Texto da nota')).toHaveValue(text);
  expect(screen.getByLabelText('Título da nota')).toHaveValue('Minha nota');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(calls.getCampaignNote).not.toHaveBeenCalled();
  expect(calls.saveCampaignNote).toHaveBeenCalledWith(
    expect.objectContaining({
      campaignToken: token,
      content: text,
      title: '  Minha nota  ',
      expectedRevision: 0,
    }),
  );
  expect(readPendingCampaignNote('owner', 'campaign')).toBeNull();
});
it('permite texto vazio e cancelar formulários/confirmação não escreve', async () => {
  notes.set('note', note());
  revision = 1;
  render(<CampaignNotesPanel campaignId="campaign" />);
  await openNew();
  await enter('Só título', '');
  expect(screen.getByRole('button', { name: 'Salvar nota' })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(calls.saveCampaignNote).not.toHaveBeenCalled();
  await userEvent.click(await screen.findByRole('button', { name: 'Excluir nota Nota privada' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar exclusão' }));
  expect(calls.deleteCampaignNote).not.toHaveBeenCalled();
});
it('salva apenas manualmente e próxima edição usa revisão confirmada', async () => {
  notes.set('note', note());
  revision = 1;
  render(<CampaignNotesPanel campaignId="campaign" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Nota privada' }));
  fireEvent.change(screen.getByLabelText('Texto da nota'), { target: { value: 'Alteração 1' } });
  expect(calls.saveCampaignNote).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));
  await waitFor(() => expect(readPendingCampaignNote('owner', 'campaign')).toBeNull());
  fireEvent.change(screen.getByLabelText('Texto da nota'), { target: { value: 'Alteração 2' } });
  await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));
  await waitFor(() => expect(calls.saveCampaignNote).toHaveBeenCalledTimes(2));
  expect(calls.saveCampaignNote).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: 2, content: 'Alteração 2' }),
  );
  expect(calls.getCampaignNote).toHaveBeenCalledTimes(1);
});
it('perda de resposta conserva campos e replay mantém payload e ID', async () => {
  vi.mocked(calls.saveCampaignNote).mockRejectedValueOnce(new Error('Resposta perdida'));
  render(<CampaignNotesPanel campaignId="campaign" />);
  await openNew();
  await enter();
  await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));
  const dialog = screen.getByRole('dialog');
  expect(
    await within(dialog).findByRole('button', { name: 'Confirmar pedido pendente' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Texto da nota')).toHaveValue('Texto próprio\n🌕  ');
  expect(screen.getByRole('button', { name: 'Salvar nota' })).toBeDisabled();
  const input = vi.mocked(calls.saveCampaignNote).mock.calls[0]![0];
  await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar pedido pendente' }));
  expect(calls.saveCampaignNote).toHaveBeenLastCalledWith(input);
  expect(await screen.findByText('Nota salva.')).toBeInTheDocument();
});
it.each(['saveCampaignNote', 'deleteCampaignNote'] as const)(
  'reload encontra %s pendente sem depender de lista nem GET',
  async (method) => {
    const pending: PendingCampaignNoteOperation =
      method === 'saveCampaignNote'
        ? operation()
        : {
            method: 'deleteCampaignNote',
            input: {
              campaignId: 'campaign',
              campaignToken: token,
              noteId: 'removed',
              operationId: 'delete',
              expectedRevision: 3,
            },
          };
    await reserveCampaignNote('owner', pending, () => true);
    render(<CampaignNotesPanel campaignId="campaign" />);
    expect(calls.listCampaignNotes).not.toHaveBeenCalled();
    expect(calls.getCampaignNote).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar pedido pendente' }));
    expect(
      await screen.findByText(method === 'saveCampaignNote' ? 'Nota salva.' : 'Nota excluída.'),
    ).toBeInTheDocument();
    expect(calls[method]).toHaveBeenCalledWith(pending.input);
    expect(readPendingCampaignNote('owner', 'campaign')).toBeNull();
  },
);
it('reserva duas abas atomicamente sem manter Web Lock durante HTTP', async () => {
  const first = operation(),
    second = operation({ noteId: 'other', operationId: 'other', title: 'Outra nota' });
  const result = await Promise.all([
    reserveCampaignNote('owner', first, () => true),
    reserveCampaignNote('owner', second, () => true),
  ]);
  expect(result.filter((value) => value.reserved)).toHaveLength(1);
  expect(readPendingCampaignNote('owner', 'campaign')).toEqual(first);
  expect(result[1]).toEqual({ reserved: false, pending: first });
  const late = await clearPendingCampaignNote('owner', 'campaign', 'different', () => true);
  expect(late).toEqual(first);
});
it('storage de outra aba bloqueia envio e mantém rascunho local diferente ao reconciliar', async () => {
  render(<CampaignNotesPanel campaignId="campaign" />);
  await openNew();
  await enter('Rascunho desta aba', 'Não substituir meu texto');
  const other = operation();
  await act(async () => {
    await reserveCampaignNote('owner', other, () => true);
    publishStorage();
  });
  expect(screen.getByLabelText('Texto da nota')).toHaveValue('Não substituir meu texto');
  expect(screen.getByRole('button', { name: 'Salvar nota' })).toBeDisabled();
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar pedido pendente' }),
  );
  expect(await screen.findByText('Nota salva.')).toBeInTheDocument();
  expect(screen.getByLabelText('Texto da nota')).toHaveValue('Não substituir meu texto');
  expect(screen.getByLabelText('Título da nota')).toHaveValue('Rascunho desta aba');
  expect(calls.saveCampaignNote).toHaveBeenCalledTimes(1);
  expect(calls.saveCampaignNote).toHaveBeenCalledWith(other.input);
});
it('sem Web Locks leitura continua e campos permanecem sem enviar mutação', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  render(<CampaignNotesPanel campaignId="campaign" />);
  await openNew();
  await enter();
  expect(screen.getByRole('button', { name: 'Salvar nota' })).toBeDisabled();
  expect(
    within(screen.getByRole('dialog')).getByText(/nenhuma alteração será enviada/),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Texto da nota')).toHaveValue('Texto próprio\n🌕  ');
  expect(calls.saveCampaignNote).not.toHaveBeenCalled();
});
it('falha na persistência impede HTTP sem apagar campos', async () => {
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Sem espaço');
  });
  render(<CampaignNotesPanel campaignId="campaign" />);
  await openNew();
  await enter();
  await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));
  expect(await within(screen.getByRole('dialog')).findByText('Sem espaço')).toBeInTheDocument();
  expect(calls.saveCampaignNote).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Texto da nota')).toHaveValue('Texto próprio\n🌕  ');
  write.mockRestore();
});
it('conflito conserva campos até descarte explícito e não obtém revisão para reaplicá-los', async () => {
  notes.set('note', note());
  revision = 1;
  vi.mocked(calls.saveCampaignNote).mockImplementationOnce(() => {
    notes.set('note', note({ revision: 2, content: 'Texto remoto' }));
    revision = 2;
    return Promise.reject(
      Object.assign(new Error('Nota mudou'), {
        code: 'functions/failed-precondition',
        details: { reason: 'revision-conflict' },
      }),
    );
  });
  render(<CampaignNotesPanel campaignId="campaign" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Nota privada' }));
  fireEvent.change(screen.getByLabelText('Texto da nota'), { target: { value: 'Texto local' } });
  await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));
  const discard = await screen.findByRole('button', {
    name: 'Descartar alterações e carregar nota atual',
  });
  expect(screen.getByLabelText('Texto da nota')).toHaveValue('Texto local');
  expect(calls.getCampaignNote).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Salvar nota' })).toBeDisabled();
  await userEvent.click(discard);
  expect(screen.getByLabelText('Texto da nota')).toHaveValue('Texto remoto');
  expect(calls.getCampaignNote).toHaveBeenCalledTimes(2);
  expect(calls.saveCampaignNote).toHaveBeenCalledTimes(1);
});
it.each(['owner', 'campaign', 'token', 'id', 'revision', 'content'])(
  'resposta %s incompatível permanece incerta e não confirma a nota',
  async (wrong) => {
    const pending = operation();
    if (pending.method !== 'saveCampaignNote') throw new Error();
    const saved = note({
      id: pending.input.noteId,
      title: pending.input.title,
      content: pending.input.content,
    });
    const result: SavedCampaignNote = { ...envelope({ collectionRevision: 1 }), note: saved };
    if (wrong === 'owner') result.ownerId = 'other';
    if (wrong === 'campaign') result.campaignId = 'other';
    if (wrong === 'token') result.campaignToken = replacementToken;
    if (wrong === 'id') saved.id = 'other';
    if (wrong === 'revision') saved.revision = 2;
    if (wrong === 'content') saved.content = 'Alterado';
    vi.mocked(calls.saveCampaignNote).mockResolvedValue(result);
    const confirmed = vi.fn();
    const { result: hook } = renderHook(() =>
      useCampaignNoteMutation('campaign', { onConfirmed: confirmed }),
    );
    await act(() => hook.current.execute(pending));
    expect(confirmed).not.toHaveBeenCalled();
    expect(hook.current.pending).toEqual(pending);
  },
);
it('resposta atrasada após trocar UID não confirma nem limpa journal da conta antiga', async () => {
  const response = deferred<SavedCampaignNote>(),
    pending = operation();
  vi.mocked(calls.saveCampaignNote).mockReturnValueOnce(response.promise);
  const confirmed = vi.fn();
  const hook = renderHook(() => useCampaignNoteMutation('campaign', { onConfirmed: confirmed }));
  let request!: Promise<unknown>;
  act(() => {
    request = hook.result.current.execute(pending);
  });
  await waitFor(() => expect(calls.saveCampaignNote).toHaveBeenCalledTimes(1));
  auth.user = { uid: 'other' };
  hook.rerender();
  await act(async () => {
    response.resolve({
      ...envelope({ collectionRevision: 1 }),
      note: note({ id: 'create', title: 'Minha nota', content: 'Texto próprio\n🌕  ' }),
    });
    await request;
  });
  expect(confirmed).not.toHaveBeenCalled();
  expect(readPendingCampaignNote('owner', 'campaign')).toEqual(pending);
  expect(readPendingCampaignNote('other', 'campaign')).toBeNull();
});
it('revisão de coleção inferior à observada não adota DTO antigo e preserva replay', async () => {
  const pending = operation();
  vi.mocked(calls.saveCampaignNote).mockResolvedValue({
    ...envelope({ collectionRevision: 2 }),
    note: note({ id: 'create', title: 'Minha nota', content: 'Texto próprio\n🌕  ' }),
  });
  const confirmed = vi.fn();
  const { result } = renderHook(() =>
    useCampaignNoteMutation('campaign', { onConfirmed: confirmed, getCollectionRevision: () => 3 }),
  );
  await act(() => result.current.execute(pending));
  expect(confirmed).not.toHaveBeenCalled();
  expect(result.current.pending).toEqual(pending);
});
it('root recriado não rebasa journal antigo; reabertura exige descarte explícito', async () => {
  const pending = operation();
  await reserveCampaignNote('owner', pending, () => true);
  currentToken = replacementToken;
  vi.mocked(calls.saveCampaignNote).mockRejectedValueOnce(
    Object.assign(new Error('Campanha mudou'), {
      code: 'functions/failed-precondition',
      details: { reason: 'campaign-changed' },
    }),
  );
  render(<CampaignNotesPanel campaignId="campaign" />);
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar pedido pendente' }));
  expect(
    await screen.findByRole('button', { name: 'Descartar alterações e reabrir notas' }),
  ).toBeInTheDocument();
  expect(calls.listCampaignNotes).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Texto da nota')).toHaveValue('Texto próprio\n🌕  ');
  await userEvent.click(
    screen.getByRole('button', { name: 'Descartar alterações e reabrir notas' }),
  );
  expect(await screen.findByText('Nenhuma nota própria nesta campanha.')).toBeInTheDocument();
  expect(calls.saveCampaignNote).toHaveBeenCalledTimes(1);
  expect(calls.saveCampaignNote).toHaveBeenCalledWith(pending.input);
  expect(calls.listCampaignNotes).toHaveBeenLastCalledWith({
    campaignId: 'campaign',
    cursor: null,
    limit: 25,
  });
});
it('paginação vazia continua, deduplica e revisão diferente invalida páginas sem misturar', async () => {
  const first = note();
  vi.mocked(calls.listCampaignNotes)
    .mockResolvedValueOnce({ ...envelope({ collectionRevision: 1 }), items: [], nextCursor: 'one' })
    .mockResolvedValueOnce({
      ...envelope({ collectionRevision: 1 }),
      items: [first, first],
      nextCursor: 'two',
    })
    .mockRejectedValueOnce(
      Object.assign(new Error('A lista mudou'), {
        code: 'functions/failed-precondition',
        details: { reason: 'cursor-invalidated' },
      }),
    );
  render(<CampaignNotesPanel campaignId="campaign" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais notas' }));
  expect(await screen.findAllByRole('button', { name: 'Nota privada' })).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais notas' }));
  expect(await screen.findByRole('button', { name: 'Recarregar lista' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Nota privada' })).not.toBeInTheDocument();
});
it('conteúdo acima do limite permanece integral no campo e não sai para a rede', async () => {
  render(<CampaignNotesPanel campaignId="campaign" />);
  await openNew();
  const content = 'X'.repeat(150001);
  await enter('Excesso', content);
  expect(screen.getByLabelText('Texto da nota')).toHaveValue(content);
  expect(screen.getByRole('button', { name: 'Salvar nota' })).toBeDisabled();
  expect(calls.saveCampaignNote).not.toHaveBeenCalled();
});
it('clear tardio não apaga um terceiro pedido reservado depois da confirmação', async () => {
  const first = operation(),
    third = operation({ noteId: 'third', operationId: 'third' });
  await reserveCampaignNote('owner', first, () => true);
  await clearPendingCampaignNote('owner', 'campaign', first.input.operationId, () => true);
  await reserveCampaignNote('owner', third, () => true);
  expect(
    await clearPendingCampaignNote('owner', 'campaign', first.input.operationId, () => true),
  ).toEqual(third);
  expect(readPendingCampaignNote('owner', 'campaign')).toEqual(third);
});
it('GET tardio de outra conta não repovoa texto na nova sessão', async () => {
  notes.set('note', note());
  revision = 1;
  const read = deferred<Awaited<ReturnType<typeof calls.getCampaignNote>>>();
  vi.mocked(calls.getCampaignNote).mockReturnValueOnce(read.promise);
  const view = render(<CampaignNotesPanel campaignId="campaign" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Nota privada' }));
  auth.user = { uid: 'other' };
  vi.mocked(calls.listCampaignNotes).mockResolvedValueOnce({
    ...envelope({ ownerId: 'other' }),
    items: [],
    nextCursor: null,
  });
  view.rerender(<CampaignNotesPanel campaignId="campaign" />);
  await act(() =>
    Promise.resolve(
      read.resolve({ ...envelope(), note: note({ content: 'Texto tardio da outra conta' }) }),
    ),
  );
  expect(await screen.findByText('Nenhuma nota própria nesta campanha.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Texto da nota')).not.toBeInTheDocument();
  expect(screen.queryByText('Texto tardio da outra conta')).not.toBeInTheDocument();
});
it('trocar campanha ignora resposta da campanha anterior sem limpar seu pedido', async () => {
  const read = deferred<SavedCampaignNote>(),
    pending = operation();
  vi.mocked(calls.saveCampaignNote).mockReturnValueOnce(read.promise);
  const confirmed = vi.fn();
  const hook = renderHook(({ id }) => useCampaignNoteMutation(id, { onConfirmed: confirmed }), {
    initialProps: { id: 'campaign' },
  });
  let request!: Promise<unknown>;
  act(() => {
    request = hook.result.current.execute(pending);
  });
  await waitFor(() => expect(calls.saveCampaignNote).toHaveBeenCalledTimes(1));
  hook.rerender({ id: 'other' });
  await act(async () => {
    read.resolve({
      ...envelope({ collectionRevision: 1 }),
      note: note({ id: 'create', title: 'Minha nota', content: 'Texto próprio\n🌕  ' }),
    });
    await request;
  });
  expect(confirmed).not.toHaveBeenCalled();
  expect(readPendingCampaignNote('owner', 'campaign')).toEqual(pending);
});
it('journal ilegível bloqueia novos pedidos sem substituir conteúdo preservado', async () => {
  const key = campaignNoteJournalKey('owner', 'campaign');
  localStorage.setItem(key, 'malformed');
  const { result } = renderHook(() => useCampaignNoteMutation('campaign'));
  expect(result.current.blocked).toBe(true);
  await act(() => result.current.execute(operation()));
  expect(calls.saveCampaignNote).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).toBe('malformed');
});
it('revisão mais nova observada durante clear não apaga replay nem confirma DTO antigo', async () => {
  let minimum = 1,
    count = 0;
  afterLock = () => {
    count++;
    if (count === 2) minimum = 2;
  };
  vi.mocked(calls.saveCampaignNote).mockResolvedValue({
    ...envelope({ collectionRevision: 1 }),
    note: note({ id: 'create', title: 'Minha nota', content: 'Texto próprio\n🌕  ' }),
  });
  const confirmed = vi.fn();
  const { result } = renderHook(() =>
    useCampaignNoteMutation('campaign', {
      onConfirmed: confirmed,
      getCollectionRevision: () => minimum,
    }),
  );
  const pending = operation();
  await act(() => result.current.execute(pending));
  expect(confirmed).not.toHaveBeenCalled();
  expect(readPendingCampaignNote('owner', 'campaign')).toEqual(pending);
  expect(result.current.pending).toEqual(pending);
});
it.each(['before-reservation', 'after-reservation'])(
  'fechar com Escape durante save %s não reabre diálogo na confirmação',
  async (phase) => {
    const gate = deferred<void>(),
      response = deferred<SavedCampaignNote>();
    if (phase === 'before-reservation') lockWait = gate.promise;
    else vi.mocked(calls.saveCampaignNote).mockReturnValueOnce(response.promise);
    render(<CampaignNotesPanel campaignId="campaign" />);
    await openNew();
    await enter();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }));
    if (phase === 'after-reservation')
      await waitFor(() => expect(calls.saveCampaignNote).toHaveBeenCalledTimes(1));
    else expect(calls.saveCampaignNote).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const back = screen.queryByRole('button', { name: 'Rever alterações da nota' });
    back?.focus();
    await act(async () => {
      if (phase === 'before-reservation') {
        lockWait = null;
        gate.resolve();
        await gate.promise;
      } else {
        const input = vi.mocked(calls.saveCampaignNote).mock.calls[0]![0];
        response.resolve({
          ...envelope({ collectionRevision: 1 }),
          note: note({ id: input.noteId, title: input.title, content: input.content }),
        });
        await response.promise;
      }
    });
    expect(await screen.findByText('Nota salva.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(back).not.toBeNull();
    expect(back).toHaveFocus();
    if (back) await userEvent.click(back);
    expect(screen.getByLabelText('Texto da nota')).toHaveValue('Texto próprio\n🌕  ');
  },
);

it('painel de notas suporta sessão ausente/login/perda e pulso remove texto sem apagar journal', async () => {
  auth.user = null;
  const view = render(<CampaignNotesPanel campaignId="campaign" />);
  expect(calls.listCampaignNotes).not.toHaveBeenCalled();
  auth.user = { uid: 'owner' };
  view.rerender(<CampaignNotesPanel campaignId="campaign" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Nova nota' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Texto da nota' }), 'Rascunho privado');
  vi.mocked(calls.listCampaignNotes).mockRejectedValue(new Error('Campanha indisponível'));
  act(() => publishInvalidation({ actorId: 'owner', scope: 'campaign:campaign' }));
  await waitFor(() =>
    expect(screen.queryByDisplayValue('Rascunho privado')).not.toBeInTheDocument(),
  );
  expect(calls.saveCampaignNote).not.toHaveBeenCalled();
  auth.user = null;
  view.rerender(<CampaignNotesPanel campaignId="campaign" />);
  expect(
    screen.queryByRole('heading', { name: 'Notas próprias da campanha' }),
  ).not.toBeInTheDocument();
});
