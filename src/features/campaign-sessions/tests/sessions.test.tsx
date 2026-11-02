import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { publishInvalidation } from '@/shared/services';
import { chooseDropdown } from '@/test/dropdown';
import { CampaignSessionsPanel } from '../components/CampaignSessionsPanel';
import { useCampaignSessionOperation } from '../hooks/useCampaignSessionOperation';
import * as calls from '../services/campaignSessionCallables';
import * as store from '../services/campaignSessionRecovery';
import type {
  CampaignSession,
  CampaignSessionMutation,
  CampaignSessionPage,
  CampaignSessionResult,
} from '../model/campaignSession';
import {
  uid,
  campaignId,
  token,
  session,
  sessionId,
  envelope,
  operation,
  summary,
  mutation,
  journalKey,
  installLocks,
  deferred,
  rpcError,
} from './sessionTestHelpers';
const auth = vi.hoisted((): { user: { uid: string } | null } => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/campaignSessionCallables', () => ({
  listCampaignSessions: vi.fn(),
  getCampaignSession: vi.fn(),
  saveCampaignSession: vi.fn(),
  moveCampaignSession: vi.fn(),
  deleteCampaignSession: vi.fn(),
}));
let rows: Map<string, CampaignSession>,
  revision: number,
  receipts: Map<string, CampaignSessionMutation>;
const currentEnvelope = () => ({ ...envelope, collectionRevision: revision });
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  auth.user = { uid };
  installLocks();
  rows = new Map();
  revision = 0;
  receipts = new Map();
  vi.mocked(calls.listCampaignSessions).mockImplementation(() =>
    Promise.resolve({
      ...currentEnvelope(),
      items: [...rows.values()].sort((a, b) => a.order - b.order).map(summary),
      nextCursor: null,
    }),
  );
  vi.mocked(calls.getCampaignSession).mockImplementation((input) =>
    Promise.resolve({ ...currentEnvelope(), session: rows.get(input.sessionId) ?? null }),
  );
  vi.mocked(calls.saveCampaignSession).mockImplementation((input) => {
    const prior = receipts.get(input.operationId);
    if (prior)
      return Promise.resolve({
        ...currentEnvelope(),
        receipt: prior.receipt,
        session:
          rows.get(input.sessionId)?.revision === prior.receipt.revision
            ? rows.get(input.sessionId)!
            : null,
      });
    const old = rows.get(input.sessionId);
    if ((old?.revision ?? 0) !== input.expectedRevision)
      return Promise.reject(rpcError('revision-conflict'));
    const saved = {
      ...session,
      ...input,
      id: input.sessionId,
      revision: input.expectedRevision + 1,
      order: old?.order ?? rows.size + 1,
      createdAt: old?.createdAt ?? 1000,
      updatedAt: 1000 + revision,
    };
    const {
      operationId: _,
      expectedRevision: __,
      campaignToken: ___,
      sessionId: ____,
      ...body
    } = saved;
    void _;
    void __;
    void ___;
    void ____;
    rows.set(body.id, body);
    revision++;
    const result = mutation(
      { schemaVersion: 1, ownerId: uid, method: 'saveCampaignSession', input },
      body,
      revision,
    );
    receipts.set(input.operationId, result);
    return Promise.resolve(result);
  });
  vi.mocked(calls.moveCampaignSession).mockImplementation((input) => {
    const old = rows.get(input.sessionId),
      ordered = [...rows.values()].sort((a, b) => a.order - b.order),
      index = ordered.findIndex((r) => r.id === input.sessionId),
      neighbor = ordered[index + (input.direction === 'up' ? -1 : 1)];
    if (
      !old ||
      old.revision !== input.expectedRevision ||
      revision !== input.expectedCollectionRevision
    )
      return Promise.reject(rpcError('revision-conflict'));
    if (!neighbor) return Promise.reject(rpcError('order-boundary'));
    rows.set(old.id, { ...old, order: neighbor.order, revision: old.revision + 1 });
    rows.set(neighbor.id, { ...neighbor, order: old.order, revision: neighbor.revision + 1 });
    revision++;
    return Promise.resolve(
      mutation(
        { schemaVersion: 1, ownerId: uid, method: 'moveCampaignSession', input },
        rows.get(old.id),
        revision,
      ),
    );
  });
  vi.mocked(calls.deleteCampaignSession).mockImplementation((input) => {
    if (rows.get(input.sessionId)?.revision !== input.expectedRevision)
      return Promise.reject(rpcError('revision-conflict'));
    rows.delete(input.sessionId);
    revision++;
    return Promise.resolve(
      mutation(
        { schemaVersion: 1, ownerId: uid, method: 'deleteCampaignSession', input },
        null,
        revision,
      ),
    );
  });
});
const seed = () => {
  rows.set(session.id, { ...session });
  revision = 1;
};
async function create(title = 'Encontro privado', text = 'Texto próprio preservado') {
  await userEvent.click(await screen.findByRole('button', { name: 'Nova sessão' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Título da sessão' }), title);
  await userEvent.type(screen.getByRole('textbox', { name: 'Preparação da sessão' }), text);
  await userEvent.click(screen.getByRole('button', { name: 'Salvar sessão' }));
  await waitFor(() => expect(store.readPendingCampaignSession(uid, campaignId)).toBeNull());
}
it('cria planejada, edita campos próprios e conserva data civil e whitespace após consulta explícita', async () => {
  render(<CampaignSessionsPanel campaignId={campaignId} />);
  await create('Mesa das estrelas', 'Linha 1  \nLinha 2');
  expect(calls.saveCampaignSession).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'planned',
      scheduledDate: null,
      summary: 'Linha 1  \nLinha 2',
    }),
  );
  expect(screen.getByRole('combobox', { name: 'Estado da sessão' })).toBeInTheDocument();
  await chooseDropdown(
    userEvent.setup(),
    screen.getByRole('combobox', { name: 'Estado da sessão' }),
    'Em andamento',
  );
  await userEvent.type(screen.getByLabelText('Data do encontro'), '2028-02-29');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar sessão' }));
  await waitFor(() => expect(calls.saveCampaignSession).toHaveBeenCalledTimes(2));
  await userEvent.click(screen.getByRole('button', { name: 'Fechar preparação' }));
  await userEvent.click(screen.getByRole('button', { name: 'Consultar sessões' }));
  expect(await screen.findByText('Em andamento')).toBeInTheDocument();
  expect(screen.getByText('29/02/2028')).toHaveAttribute('datetime', '2028-02-29');
  await userEvent.click(screen.getByRole('button', { name: 'Editar sessão Mesa das estrelas' }));
  expect(await screen.findByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
    'Linha 1  \nLinha 2',
  );
});
it('mover por teclado preserva preparação, anuncia confirmação e mantém foco em Consultar sessões', async () => {
  seed();
  rows.set('session-0000000002', {
    ...session,
    id: 'session-0000000002',
    title: 'Segundo encontro',
    order: 2,
  });
  revision = 2;
  render(<CampaignSessionsPanel campaignId={campaignId} />);
  const down = await screen.findByRole('button', { name: 'Mover Primeiro encontro para baixo' });
  down.focus();
  await userEvent.keyboard('{Enter}');
  const refresh = screen.getByRole('button', { name: 'Consultar sessões' });
  await screen.findByText('Ordem da sessão atualizada.');
  expect(refresh).toHaveFocus();
  expect(calls.moveCampaignSession).toHaveBeenCalledWith(
    expect.objectContaining({
      sessionId,
      expectedRevision: 1,
      expectedCollectionRevision: 2,
      direction: 'down',
    }),
  );
  await userEvent.keyboard('{Enter}');
  await screen.findByRole('button', { name: 'Editar sessão Primeiro encontro' });
  expect(screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)).toEqual([
    'Segundo encontro',
    'Primeiro encontro',
  ]);
  expect(refresh).toHaveFocus();
  expect(rows.get(sessionId)?.summary).toBe(session.summary);
});
it('confirma exclusão congelada e resposta perdida é recuperável sem exigir sessão existente', async () => {
  seed();
  render(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Excluir sessão Primeiro encontro' }),
  );
  expect(screen.getByText('Excluir “Primeiro encontro”?')).toBeInTheDocument();
  const actual = vi.mocked(calls.deleteCampaignSession).getMockImplementation()!;
  let receipt: CampaignSessionMutation;
  vi.mocked(calls.deleteCampaignSession)
    .mockImplementationOnce(async (input) => {
      receipt = await actual(input);
      throw new Error('Resposta perdida');
    })
    .mockImplementationOnce(() => Promise.resolve(receipt));
  await userEvent.click(screen.getByRole('button', { name: 'Excluir definitivamente a sessão' }));
  await within(screen.getByRole('dialog')).findByText('Resposta perdida');
  const pending = store.readPendingCampaignSession(uid, campaignId);
  expect(pending?.input.expectedRevision).toBe(1);
  await userEvent.click(screen.getByRole('button', { name: 'Manter sessão' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar pedido de sessão' }));
  await screen.findByText('Sessão excluída.');
  expect(store.readPendingCampaignSession(uid, campaignId)).toBeNull();
  expect(calls.getCampaignSession).toHaveBeenCalledWith({
    campaignId,
    campaignToken: token,
    sessionId,
  });
});
it('save perdido e replay histórico após reload preservam texto original até descarte explícito', async () => {
  const actual = vi.mocked(calls.saveCampaignSession).getMockImplementation()!;
  vi.mocked(calls.saveCampaignSession).mockImplementationOnce(async (input) => {
    await actual(input);
    throw new Error('Resposta perdida');
  });
  const view = render(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Nova sessão' }));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Título da sessão' }),
    'Pedido original',
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Preparação da sessão' }),
    'Texto original privado',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Salvar sessão' }));
  await within(screen.getByRole('dialog')).findByText('Resposta perdida');
  const pending = store.readPendingCampaignSession(uid, campaignId)!;
  const first = rows.get(pending.input.sessionId)!;
  rows.set(first.id, { ...first, summary: 'Edição posterior remota', revision: 2 });
  revision++;
  view.unmount();
  render(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Confirmar pedido de sessão' }));
  await waitFor(() => expect(store.readPendingCampaignSession(uid, campaignId)).toBeNull());
  await userEvent.click(screen.getByRole('button', { name: 'Rever preparação da sessão' }));
  expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
    'Texto original privado',
  );
  expect(screen.getByRole('button', { name: 'Salvar sessão' })).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Descartar alterações e consultar sessão atual' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
      'Edição posterior remota',
    ),
  );
  expect(calls.saveCampaignSession).toHaveBeenLastCalledWith(pending.input);
});
it('GET atrasado não apaga nova sessão digitada e fechar durante save não reabre diálogo', async () => {
  seed();
  const old = deferred<CampaignSessionResult>();
  vi.mocked(calls.getCampaignSession).mockReturnValueOnce(old.promise);
  render(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Editar sessão Primeiro encontro' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Nova sessão' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Título da sessão' }), 'Nova B');
  await act(async () => {
    old.resolve({ ...envelope, session });
    await old.promise;
  });
  expect(screen.getByRole('textbox', { name: 'Título da sessão' })).toHaveValue('Nova B');
  const gate = deferred<CampaignSessionMutation>();
  vi.mocked(calls.saveCampaignSession).mockReturnValueOnce(gate.promise);
  await userEvent.click(screen.getByRole('button', { name: 'Salvar sessão' }));
  await waitFor(() => expect(calls.saveCampaignSession).toHaveBeenCalledOnce());
  const pending = store.readPendingCampaignSession(uid, campaignId)!;
  await userEvent.click(screen.getByRole('button', { name: 'Fechar e manter pedido' }));
  await act(async () => {
    gate.resolve(
      mutation(
        pending,
        { ...session, id: pending.input.sessionId, title: 'Nova B', summary: '' },
        2,
      ),
    );
    await gate.promise;
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('sem WebLocks permite ler e editar campos mas impede envio; visitante e troca de conta isolam respostas', async () => {
  seed();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  auth.user = null;
  const view = render(<CampaignSessionsPanel campaignId={campaignId} />);
  expect(calls.listCampaignSessions).not.toHaveBeenCalled();
  auth.user = { uid };
  view.rerender(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Editar sessão Primeiro encontro' }),
  );
  await userEvent.type(screen.getByRole('textbox', { name: 'Preparação da sessão' }), ' novo');
  expect(screen.getByRole('button', { name: 'Salvar sessão' })).toBeDisabled();
  expect(calls.saveCampaignSession).not.toHaveBeenCalled();
  auth.user = null;
  view.rerender(<CampaignSessionsPanel campaignId={campaignId} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('foco transitório conserva rascunho e pulso descarta leitura antiga sem reapresentar texto', async () => {
  seed();
  render(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Editar sessão Primeiro encontro' }),
  );
  await userEvent.type(screen.getByRole('textbox', { name: 'Preparação da sessão' }), ' local');
  vi.mocked(calls.listCampaignSessions).mockRejectedValueOnce(new Error('Sem conexão'));
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(() => expect(calls.listCampaignSessions).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
    session.summary + ' local',
  );
  const late = deferred<CampaignSessionPage>();
  vi.mocked(calls.listCampaignSessions)
    .mockReturnValueOnce(late.promise)
    .mockRejectedValue(new Error('campaign-deleted'));
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  act(() => publishInvalidation({ actorId: uid, scope: 'campaign:' + campaignId }));
  await act(async () => {
    late.resolve({ ...envelope, items: [summary(session)], nextCursor: null });
    await late.promise;
  });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByText(session.title)).not.toBeInTheDocument();
});
it('paginação vazia segue cursor e erro da página seguinte invalida composição sem ocultar rascunho', async () => {
  vi.mocked(calls.listCampaignSessions)
    .mockResolvedValueOnce({ ...envelope, items: [], nextCursor: 'next' })
    .mockResolvedValueOnce({ ...envelope, items: [summary(session)], nextCursor: 'last' })
    .mockRejectedValueOnce(rpcError('cursor-invalidated'));
  render(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais sessões' }));
  await screen.findByRole('heading', { name: session.title });
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais sessões' }));
  await screen.findByText('cursor-invalidated');
  expect(screen.queryByRole('heading', { name: session.title })).not.toBeInTheDocument();
  expect(calls.saveCampaignSession).not.toHaveBeenCalled();
});
it.each(['permission-denied', 'session-inconsistent', 'campaign-deleted', 'unavailable'])(
  'erro sem recibo %s preserva pedido para replay e não autoriza novo envio',
  async (reason) => {
    localStorage.setItem(journalKey, JSON.stringify(operation));
    vi.mocked(calls.saveCampaignSession).mockRejectedValue(rpcError(reason));
    const confirmed = vi.fn();
    const h = renderHook(() =>
      useCampaignSessionOperation({
        uid,
        campaignId,
        isActive: () => true,
        minimumRevision: () => 0,
        observe: vi.fn(),
        onConfirmed: confirmed,
      }),
    );
    await act(() => h.result.current.recover());
    expect(store.readPendingCampaignSession(uid, campaignId)).toEqual(operation);
    expect(confirmed).not.toHaveBeenCalled();
    expect(h.result.current.error).toBe(reason);
  },
);
it('snapshot A substituído por B antes de recuperar não envia ou apaga o pedido B', async () => {
  localStorage.setItem(journalKey, JSON.stringify(operation));
  const confirmed = vi.fn();
  const h = renderHook(() =>
    useCampaignSessionOperation({
      uid,
      campaignId,
      isActive: () => true,
      minimumRevision: () => 0,
      observe: vi.fn(),
      onConfirmed: confirmed,
    }),
  );
  const b = {
    ...operation,
    input: {
      ...operation.input,
      operationId: 'operation-00000002',
      sessionId: 'operation-00000002',
    },
  };
  localStorage.setItem(journalKey, JSON.stringify(b));
  await act(() => h.result.current.recover());
  expect(store.readPendingCampaignSession(uid, campaignId)).toEqual(b);
  expect(calls.saveCampaignSession).not.toHaveBeenCalled();
  expect(calls.getCampaignSession).not.toHaveBeenCalled();
});
it('reserva que termina após outra aba mudar slot não envia A nem limpa B', async () => {
  const reserve = vi.spyOn(store, 'reserveCampaignSession'),
    gate = deferred<void>();
  reserve.mockImplementationOnce(async () => {
    localStorage.setItem(
      journalKey,
      JSON.stringify({
        ...operation,
        input: {
          ...operation.input,
          operationId: 'operation-00000002',
          sessionId: 'operation-00000002',
        },
      }),
    );
    await gate.promise;
  });
  const h = renderHook(() =>
    useCampaignSessionOperation({
      uid,
      campaignId,
      isActive: () => true,
      minimumRevision: () => 0,
      observe: vi.fn(),
      onConfirmed: vi.fn(),
    }),
  );
  let action!: Promise<void>;
  act(() => {
    action = h.result.current.execute(operation);
  });
  await act(async () => {
    gate.resolve();
    await action;
  });
  expect(calls.saveCampaignSession).not.toHaveBeenCalled();
  expect(store.readPendingCampaignSession(uid, campaignId)?.input.operationId).toBe(
    'operation-00000002',
  );
  reserve.mockRestore();
});
it('título com espaços confirma revisão sem falso conflito e descartar rascunho não envia mutação', async () => {
  render(<CampaignSessionsPanel campaignId={campaignId} />);
  await create('  Encontro com espaços  ', 'Texto intacto');
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Título da sessão' })).toHaveValue(
      'Encontro com espaços',
    ),
  );
  expect(screen.queryByText(/A sessão mudou ou o recibo é histórico/)).not.toBeInTheDocument();
  await userEvent.type(screen.getByRole('textbox', { name: 'Preparação da sessão' }), ' local');
  await userEvent.click(screen.getByRole('button', { name: 'Fechar preparação' }));
  expect(screen.getByRole('button', { name: 'Nova sessão' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Rever preparação da sessão' }));
  await userEvent.click(screen.getByRole('button', { name: 'Descartar rascunho e fechar' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nova sessão' })).toBeEnabled();
  expect(calls.saveCampaignSession).toHaveBeenCalledOnce();
});
it('pedido incerto conserva campos e não oferece descarte normal do journal', async () => {
  vi.mocked(calls.saveCampaignSession).mockRejectedValueOnce(new Error('Recebimento incerto'));
  render(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Nova sessão' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Título da sessão' }), 'Não apagar');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar sessão' }));
  await within(screen.getByRole('dialog')).findByText('Recebimento incerto');
  expect(
    screen.queryByRole('button', { name: 'Descartar rascunho e fechar' }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Fechar e manter pedido' }));
  expect(store.readPendingCampaignSession(uid, campaignId)?.input).toMatchObject({
    title: 'Não apagar',
  });
});
it.each(['list', 'get', 'mutation'] as const)(
  'erro C4 próprio em %s revoga apresentação preservando journal; outro CID não revoga',
  async (path) => {
    for (const own of [false, true]) {
      seed();
      const view = render(<CampaignSessionsPanel campaignId={campaignId} />);
      await userEvent.click(
        await screen.findByRole('button', { name: 'Editar sessão Primeiro encontro' }),
      );
      const failure = Object.assign(new Error('Exclusão confirmada no servidor'), {
        code: 'functions/failed-precondition',
        details: {
          reason: 'campaign-deleting',
          campaignId: own ? campaignId : 'another-campaign',
          deletionId: 'deletion-00000001',
        },
      });
      if (path === 'mutation') {
        await userEvent.type(
          screen.getByRole('textbox', { name: 'Preparação da sessão' }),
          ' local',
        );
        vi.mocked(calls.saveCampaignSession).mockRejectedValueOnce(failure);
        await userEvent.click(screen.getByRole('button', { name: 'Salvar sessão' }));
      } else {
        await userEvent.click(screen.getByRole('button', { name: 'Fechar preparação' }));
        if (path === 'list') {
          vi.mocked(calls.listCampaignSessions).mockRejectedValueOnce(failure);
          await userEvent.click(screen.getByRole('button', { name: 'Consultar sessões' }));
        } else {
          vi.mocked(calls.getCampaignSession).mockRejectedValueOnce(failure);
          await userEvent.click(
            screen.getByRole('button', { name: 'Editar sessão Primeiro encontro' }),
          );
        }
      }
      if (own) {
        expect(
          await screen.findByText(/Esta campanha foi excluída ou está em exclusão/),
        ).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: 'Rever preparação da sessão' }),
        ).not.toBeInTheDocument();
      } else {
        await screen.findAllByText('Exclusão confirmada no servidor');
        if (path !== 'mutation')
          await userEvent.click(screen.getByRole('button', { name: 'Rever preparação da sessão' }));
        expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
          session.summary + (path === 'mutation' ? ' local' : ''),
        );
      }
      if (path === 'mutation')
        expect(store.readPendingCampaignSession(uid, campaignId)).not.toBeNull();
      view.unmount();
      localStorage.clear();
    }
  },
);
it('atualização externa conserva rascunho e revisão antiga; só consulta explícita adota corpo atual', async () => {
  seed();
  render(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Editar sessão Primeiro encontro' }),
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Preparação da sessão' }),
    ' versão local',
  );
  rows.set(sessionId, { ...session, revision: 2, summary: 'Corpo remoto' });
  revision++;
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar sessão' })).toBeDisabled());
  expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
    session.summary + ' versão local',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Descartar alterações e consultar sessão atual' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
      'Corpo remoto',
    ),
  );
  expect(calls.saveCampaignSession).not.toHaveBeenCalled();
});
it('consulta nova assume carregamento e resposta/finally antigos não a substituem', async () => {
  seed();
  rows.set('session-0000000002', {
    ...session,
    id: 'session-0000000002',
    title: 'Segundo',
    order: 2,
  });
  const first = deferred<CampaignSessionResult>(),
    second = deferred<CampaignSessionResult>();
  vi.mocked(calls.getCampaignSession)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  render(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Editar sessão Primeiro encontro' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Editar sessão Segundo' }));
  await act(async () => {
    first.resolve({ ...envelope, session });
    await first.promise;
  });
  expect(screen.getByText('Carregando preparação da sessão...')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await act(async () => {
    second.resolve({ ...envelope, session: rows.get('session-0000000002')! });
    await second.promise;
  });
  expect(screen.getByRole('textbox', { name: 'Título da sessão' })).toHaveValue('Segundo');
});
it('armazenamento falho impede RPC sem apagar campos', async () => {
  render(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Nova sessão' }));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Título da sessão' }),
    'Campo preservado',
  );
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new DOMException('Quota', 'QuotaExceededError');
  });
  await userEvent.click(screen.getByRole('button', { name: 'Salvar sessão' }));
  await within(screen.getByRole('dialog')).findByRole('alert');
  expect(screen.getByRole('textbox', { name: 'Título da sessão' })).toHaveValue('Campo preservado');
  expect(calls.saveCampaignSession).not.toHaveBeenCalled();
  write.mockRestore();
});
it('resposta de conta antiga não confirma, limpa journal ou apresenta prosa na nova conta', async () => {
  const pending = deferred<CampaignSessionMutation>();
  vi.mocked(calls.saveCampaignSession).mockReturnValueOnce(pending.promise);
  const view = render(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Nova sessão' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Título da sessão' }), 'Mesa A');
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Preparação da sessão' }),
    'Texto só da conta A',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Salvar sessão' }));
  await waitFor(() => expect(calls.saveCampaignSession).toHaveBeenCalledOnce());
  const op = store.readPendingCampaignSession(uid, campaignId)!;
  auth.user = { uid: 'new-owner' };
  vi.mocked(calls.listCampaignSessions).mockRejectedValue(new Error('Sem acesso'));
  view.rerender(<CampaignSessionsPanel campaignId={campaignId} />);
  await act(async () => {
    pending.resolve(
      mutation(op, {
        ...session,
        id: op.input.sessionId,
        title: 'Mesa A',
        summary: 'Texto só da conta A',
      }),
    );
    await pending.promise;
  });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByText('Texto só da conta A')).not.toBeInTheDocument();
  expect(store.readPendingCampaignSession(uid, campaignId)).toEqual(op);
});
it('journal inválido futuro bloqueia envio mas preserva leitura; foco não repete mutação e beforeunload avisa', async () => {
  seed();
  const future = { ...operation, input: { ...operation.input, extraFuture: true } };
  localStorage.setItem(journalKey, JSON.stringify(future));
  const view = render(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Editar sessão Primeiro encontro' }),
  );
  expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
    session.summary,
  );
  expect(screen.getByRole('button', { name: 'Salvar sessão' })).toBeDisabled();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(() => expect(calls.listCampaignSessions).toHaveBeenCalledTimes(2));
  expect(calls.saveCampaignSession).not.toHaveBeenCalled();
  expect(localStorage.getItem(journalKey)).toEqual(JSON.stringify(future));
  view.unmount();
});
it('conflito de revisão definitivo encerra somente tentativa antiga e mantém texto para comparação explícita', async () => {
  seed();
  render(<CampaignSessionsPanel campaignId={campaignId} />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Editar sessão Primeiro encontro' }),
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Preparação da sessão' }),
    ' meu rascunho',
  );
  rows.set(sessionId, { ...session, revision: 2, summary: 'Texto remoto confirmado' });
  revision = 2;
  await userEvent.click(screen.getByRole('button', { name: 'Salvar sessão' }));
  await within(screen.getByRole('dialog')).findByText('revision-conflict');
  expect(store.readPendingCampaignSession(uid, campaignId)).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
    session.summary + ' meu rascunho',
  );
  expect(screen.getByRole('button', { name: 'Salvar sessão' })).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Descartar alterações e consultar sessão atual' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
      'Texto remoto confirmado',
    ),
  );
  expect(rows.get(sessionId)?.summary).toBe('Texto remoto confirmado');
});
it('limite de ordem definitivo não preserva um novo pedido inválido nem altera contagem', async () => {
  seed();
  const rejected = vi.fn();
  const h = renderHook(() =>
    useCampaignSessionOperation({
      uid,
      campaignId,
      isActive: () => true,
      minimumRevision: () => 1,
      observe: vi.fn(),
      onConfirmed: vi.fn(),
      onRejected: rejected,
    }),
  );
  const op = {
    schemaVersion: 1 as const,
    ownerId: uid,
    method: 'moveCampaignSession' as const,
    input: {
      campaignId,
      campaignToken: token,
      sessionId,
      operationId: 'operation-order-0001',
      expectedRevision: 1,
      expectedCollectionRevision: 1,
      direction: 'up' as const,
    },
  };
  await act(() => h.result.current.execute(op));
  expect(h.result.current.error).toBe('order-boundary');
  expect(store.readPendingCampaignSession(uid, campaignId)).toBeNull();
  expect(rejected).toHaveBeenCalledOnce();
  expect(revision).toBe(1);
  expect(rows.get(sessionId)).toEqual(session);
});
