import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseDropdown } from '@/test/dropdown';
import { publishInvalidation } from '@/shared/services';
import { CampaignPreparationPanel } from '../components/CampaignPreparationPanel';
import * as calls from '../services/campaignPreparationCallables';
import * as recovery from '../services/campaignPreparationRecovery';
import type {
  PreparationItem,
  PreparationRequest,
  PreparationItemPage,
  PreparationItemResult,
  PreparationLinkPage,
  PreparationLinkSummary,
  CampaignPreparationOpenRequest,
} from '../model/campaignPreparation';
import {
  clue,
  quest,
  identity,
  sessionScope,
  uid,
  campaignId,
  summary,
  outcome,
  pending,
  installLocks,
  deferred,
} from './preparationTestHelpers';
const auth = vi.hoisted((): { user: { uid: string } | null } => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/campaignPreparationCallables', () => ({
  listCampaignPreparationItems: vi.fn(),
  getCampaignPreparationItem: vi.fn(),
  saveCampaignPreparationItem: vi.fn(),
  deleteCampaignPreparationItem: vi.fn(),
  moveCampaignPreparationItem: vi.fn(),
  listCampaignSessionPreparationLinks: vi.fn(),
  addCampaignSessionPreparationLink: vi.fn(),
  removeCampaignSessionPreparationLink: vi.fn(),
  moveCampaignSessionPreparationLink: vi.fn(),
  resolveCampaignPreparationOperation: vi.fn(),
}));
let rows: Map<string, PreparationItem>,
  revision: number,
  linkRev: number,
  links: PreparationLinkSummary[];
function itemPage(kind = 'clue', view = 'all'): PreparationItemPage {
  return {
    ...identity,
    itemCollectionRevision: revision,
    items: [...rows.values()]
      .filter(
        (x) =>
          x.kind === kind &&
          (view === 'all' ||
            (x.kind === 'clue'
              ? x.status === 'pending'
              : x.status === 'available' || x.status === 'active')),
      )
      .sort((a, b) => a.order - b.order)
      .map(summary),
    nextCursor: null,
  };
}
const openRequest = (id = 1): CampaignPreparationOpenRequest => ({
  requestId: id,
  session: { ...sessionScope, isActive: () => true, readOnly: false },
  view: 'pending',
});
function linkPage(input = sessionScope): PreparationLinkPage {
  return {
    ...identity,
    sessionId: input.sessionId,
    sessionRevision: input.expectedSessionRevision,
    itemCollectionRevision: revision,
    linkCollectionRevision: linkRev,
    items: links,
    nextCursor: null,
  };
}
function mutate(request: PreparationRequest) {
  const value = outcome(request);
  if (request.action === 'save-item') {
    const r = request.request,
      old = rows.get(r.itemId);
    rows.set(r.itemId, {
      ...clue,
      ...old,
      id: r.itemId,
      kind: r.kind,
      title: r.title,
      status: r.status,
      body: r.body,
      revision: r.expectedRevision + 1,
      order: old?.order ?? rows.size + 1,
    } as PreparationItem);
    revision++;
  } else if (request.action === 'delete-item') {
    rows.delete(request.request.itemId);
    revision++;
  } else if (request.action === 'move-item') revision++;
  else if (request.action === 'add-link') {
    const r = request.request,
      target = rows.get(r.itemId)!;
    links = [
      ...links,
      {
        id: r.linkId,
        revision: 1,
        order: links.length + 1,
        createdAt: 1000,
        updatedAt: 1000,
        available: true,
        target: summary(target),
      },
    ];
    linkRev++;
  } else if (request.action === 'remove-link') {
    links = links.filter((l) => l.id !== request.request.linkId);
    linkRev++;
  } else linkRev++;
  return Promise.resolve(value);
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  installLocks();
  auth.user = { uid };
  rows = new Map<string, PreparationItem>([
    [clue.id, structuredClone(clue)],
    [quest.id, structuredClone(quest)],
  ]);
  revision = 2;
  linkRev = 0;
  links = [];
  vi.mocked(calls.listCampaignPreparationItems).mockImplementation((input) =>
    Promise.resolve(itemPage(input.kind, input.view)),
  );
  vi.mocked(calls.getCampaignPreparationItem).mockImplementation((input) =>
    Promise.resolve({
      ...identity,
      itemCollectionRevision: revision,
      item: rows.get(input.itemId)!,
    }),
  );
  vi.mocked(calls.saveCampaignPreparationItem).mockImplementation((request) =>
    mutate({ action: 'save-item', request }),
  );
  vi.mocked(calls.deleteCampaignPreparationItem).mockImplementation((request) =>
    mutate({ action: 'delete-item', request }),
  );
  vi.mocked(calls.moveCampaignPreparationItem).mockImplementation((request) =>
    mutate({ action: 'move-item', request }),
  );
  vi.mocked(calls.listCampaignSessionPreparationLinks).mockImplementation((input) =>
    Promise.resolve(linkPage(input)),
  );
  vi.mocked(calls.addCampaignSessionPreparationLink).mockImplementation((request) =>
    mutate({ action: 'add-link', request }),
  );
  vi.mocked(calls.removeCampaignSessionPreparationLink).mockImplementation((request) =>
    mutate({ action: 'remove-link', request }),
  );
  vi.mocked(calls.moveCampaignSessionPreparationLink).mockImplementation((request) =>
    mutate({ action: 'move-link', request }),
  );
});
async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Abrir pistas e missões' }));
  await screen.findByRole('heading', { name: clue.title });
  return user;
}
const row = (name: string) => screen.getByRole('heading', { name }).closest('li')!;
it('consulta pista, conserva whitespace e salva alteração privada com confirmação metadata-only', async () => {
  render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = await open();
  await user.click(within(row(clue.title)).getByRole('button', { name: 'Consultar item' }));
  const text = await screen.findByLabelText('Texto da pista');
  expect(text).toHaveValue((clue.body as { text: string }).text);
  await user.type(text, '  novo');
  await user.click(screen.getByRole('button', { name: 'Salvar item' }));
  await waitFor(() => expect(calls.saveCampaignPreparationItem).toHaveBeenCalledTimes(1));
  expect(vi.mocked(calls.saveCampaignPreparationItem).mock.calls[0]![0]).toMatchObject({
    body: { text: (clue.body as { text: string }).text + '  novo' },
  });
  expect(text).toHaveValue((clue.body as { text: string }).text + '  novo');
  expect(text).toBeDisabled();
});
it('cria pista e missão com seus estados iniciais e corpos distintos', async () => {
  rows.clear();
  render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Abrir pistas e missões' }));
  await user.click(screen.getByRole('button', { name: 'Nova pista' }));
  await user.type(screen.getByLabelText('Título do item'), 'Pista nova');
  await user.type(screen.getByLabelText('Texto da pista'), '  texto privado  ');
  await user.click(screen.getByRole('button', { name: 'Salvar item' }));
  await waitFor(() => expect(calls.saveCampaignPreparationItem).toHaveBeenCalledTimes(1));
  const saved = vi.mocked(calls.saveCampaignPreparationItem).mock.calls[0]![0];
  expect(saved.kind).toBe('clue');
  expect(saved.status).toBe('pending');
  expect(saved.body).toEqual({ text: '  texto privado  ', condition: '', recipient: '' });
  await user.click(screen.getByRole('button', { name: 'Descartar rascunho' }));
  await chooseDropdown(user, screen.getByRole('combobox', { name: 'Tipo de item' }), 'Missões');
  await user.click(screen.getByRole('button', { name: 'Nova missão' }));
  await user.type(screen.getByLabelText('Título do item'), 'Missão nova');
  await user.type(screen.getByLabelText('Possíveis consequências'), 'Sem execução');
  await user.click(screen.getByRole('button', { name: 'Salvar item' }));
  await waitFor(() => expect(calls.saveCampaignPreparationItem).toHaveBeenCalledTimes(2));
  expect(vi.mocked(calls.saveCampaignPreparationItem).mock.calls[1]![0]).toMatchObject({
    kind: 'quest',
    status: 'available',
    body: { description: '', consequences: 'Sem execução' },
  });
});
it('altera estado de missão explicitamente sem executar consequência', async () => {
  render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = await open();
  await chooseDropdown(user, screen.getByRole('combobox', { name: 'Tipo de item' }), 'Missões');
  await user.click(within(row(quest.title)).getByRole('button', { name: 'Consultar item' }));
  await screen.findByLabelText('Descrição da missão');
  await chooseDropdown(user, screen.getByRole('combobox', { name: 'Estado do item' }), 'Falhou');
  await user.click(screen.getByRole('button', { name: 'Salvar item' }));
  await waitFor(() => expect(calls.saveCampaignPreparationItem).toHaveBeenCalled());
  expect(vi.mocked(calls.saveCampaignPreparationItem).mock.calls[0]![0]).toMatchObject({
    status: 'failed',
    body: quest.body,
  });
  expect(calls.addCampaignSessionPreparationLink).not.toHaveBeenCalled();
});
it('rascunho sobrevive filtro, close/reopen e mudança de contexto salvo', async () => {
  const pendingChange = vi.fn(),
    view = render(
      <CampaignPreparationPanel campaignId={campaignId} onPendingChange={pendingChange} />,
    );
  const user = await open();
  await user.click(within(row(clue.title)).getByRole('button', { name: 'Consultar item' }));
  await user.type(await screen.findByLabelText('Texto da pista'), ' continuação');
  await chooseDropdown(user, screen.getByRole('combobox', { name: 'Mostrar itens' }), 'Pendentes');
  expect(screen.getByLabelText('Texto da pista')).toHaveValue(
    (clue.body as { text: string }).text + ' continuação',
  );
  await user.click(screen.getByRole('button', { name: 'Fechar e manter preparação' }));
  await user.click(screen.getByRole('button', { name: 'Abrir pistas e missões' }));
  expect(screen.getByLabelText('Texto da pista')).toHaveValue(
    (clue.body as { text: string }).text + ' continuação',
  );
  view.rerender(
    <CampaignPreparationPanel
      campaignId={campaignId}
      onPendingChange={pendingChange}
      openRequest={openRequest()}
    />,
  );
  await screen.findByRole('heading', { name: 'Itens desta sessão' });
  expect(screen.getByLabelText('Texto da pista')).toHaveValue(
    (clue.body as { text: string }).text + ' continuação',
  );
  expect(pendingChange).toHaveBeenLastCalledWith(true);
});
it('pedido incerto conserva formulário e recuperação não adota corpo posterior', async () => {
  vi.mocked(calls.saveCampaignPreparationItem).mockRejectedValueOnce(new Error('Resposta perdida'));
  render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = await open();
  await user.click(within(row(clue.title)).getByRole('button', { name: 'Consultar item' }));
  const text = await screen.findByLabelText('Texto da pista');
  await user.type(text, ' nova');
  await user.click(screen.getByRole('button', { name: 'Salvar item' }));
  await screen.findByRole('button', { name: 'Confirmar pedido preservado' });
  const preserved = recovery.readPendingCampaignPreparation(uid, campaignId)!;
  rows.set(clue.id, {
    ...clue,
    revision: 8,
    body: { text: 'Texto posterior', condition: '', recipient: '' },
  });
  revision = 9;
  vi.mocked(calls.saveCampaignPreparationItem).mockResolvedValue(outcome(preserved));
  await user.click(screen.getByRole('button', { name: 'Confirmar pedido preservado' }));
  await waitFor(() => expect(recovery.readPendingCampaignPreparation(uid, campaignId)).toBeNull());
  expect(text).toHaveValue((clue.body as { text: string }).text + ' nova');
  expect(text).toBeDisabled();
  expect(screen.queryByText('Texto posterior')).not.toBeInTheDocument();
});
it('consulta tardia fica bloqueada e troca de ator não revela corpo antigo', async () => {
  const reply = deferred<PreparationItemResult>();
  vi.mocked(calls.getCampaignPreparationItem).mockReturnValue(reply.promise);
  const view = render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = await open();
  await user.click(within(row(clue.title)).getByRole('button', { name: 'Consultar item' }));
  auth.user = { uid: 'other' };
  view.rerender(<CampaignPreparationPanel campaignId={campaignId} />);
  await act(async () => {
    reply.resolve({ ...identity, itemCollectionRevision: 2, item: clue });
    await reply.promise;
  });
  expect(screen.queryByLabelText('Texto da pista')).not.toBeInTheDocument();
});
it('exclusão pede confirmação, conserva item ao cancelar e não remove outra campanha', async () => {
  render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = await open();
  await user.click(within(row(clue.title)).getByRole('button', { name: 'Excluir item' }));
  await user.click(screen.getByRole('button', { name: 'Manter item' }));
  expect(calls.deleteCampaignPreparationItem).not.toHaveBeenCalled();
  await user.click(within(row(clue.title)).getByRole('button', { name: 'Excluir item' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar exclusão do item' }));
  await waitFor(() => expect(calls.deleteCampaignPreparationItem).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole('button', { name: 'Atualizar itens' }));
  await screen.findByText('Nenhum item nesta lista');
  expect(rows.has(quest.id)).toBe(true);
});
it('move catálogo somente em Todos e não oferece vizinho oculto em Pendentes', async () => {
  const second = { ...clue, id: 'clue-000000000002', title: 'Segunda pista', order: 2 };
  rows.set(second.id, second);
  render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = await open();
  await user.click(screen.getByRole('button', { name: 'Descer item ' + clue.title }));
  await waitFor(() =>
    expect(calls.moveCampaignPreparationItem).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'down', expectedItemCollectionRevision: 2 }),
    ),
  );
  await chooseDropdown(user, screen.getByRole('combobox', { name: 'Mostrar itens' }), 'Pendentes');
  await screen.findByRole('heading', { name: clue.title });
  expect(
    screen.queryByRole('button', { name: 'Descer item ' + clue.title }),
  ).not.toBeInTheDocument();
});
it('vincula e retoma sem cópia para nova sessão mantendo o item e vínculo anterior', async () => {
  const request = openRequest(),
    view = render(<CampaignPreparationPanel campaignId={campaignId} openRequest={request} />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: clue.title });
  await waitFor(() => expect(calls.listCampaignSessionPreparationLinks).toHaveBeenCalled());
  await user.click(within(row(clue.title)).getByRole('button', { name: 'Vincular a esta sessão' }));
  await waitFor(() => expect(calls.addCampaignSessionPreparationLink).toHaveBeenCalledTimes(1));
  const second = {
    ...openRequest(2),
    session: { ...request.session, sessionId: 'session-0000000002' },
  };
  links = [];
  linkRev = 0;
  view.rerender(<CampaignPreparationPanel campaignId={campaignId} openRequest={second} />);
  await user.click(screen.getByRole('button', { name: 'Atualizar itens' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Vincular a esta sessão' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'Vincular a esta sessão' }));
  await waitFor(() => expect(calls.addCampaignSessionPreparationLink).toHaveBeenCalledTimes(2));
  expect(
    vi.mocked(calls.addCampaignSessionPreparationLink).mock.calls.map(([r]) => r.sessionId),
  ).toEqual([request.session.sessionId, second.session.sessionId]);
  expect(calls.saveCampaignPreparationItem).not.toHaveBeenCalled();
});
it('vínculos mistos movem, consultam item atual e removem tombstone neutro', async () => {
  links = [
    {
      id: 'link-000000000001',
      revision: 1,
      order: 1,
      createdAt: 1,
      updatedAt: 1,
      available: true,
      target: summary(quest),
    },
    {
      id: 'link-000000000002',
      revision: 1,
      order: 2,
      createdAt: 1,
      updatedAt: 1,
      available: false,
    },
  ];
  linkRev = 2;
  render(<CampaignPreparationPanel campaignId={campaignId} openRequest={openRequest()} />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Item indisponível' });
  await user.click(screen.getByRole('button', { name: 'Descer vínculo ' + quest.title }));
  await waitFor(() => expect(calls.moveCampaignSessionPreparationLink).toHaveBeenCalled());
  await user.click(screen.getByRole('button', { name: 'Atualizar vínculos' }));
  await screen.findByRole('heading', { name: 'Item indisponível' });
  const section = screen.getByRole('region', { name: 'Itens vinculados à sessão' });
  await user.click(within(section).getAllByRole('button', { name: 'Consultar item' })[0]!);
  await screen.findByLabelText('Descrição da missão');
  const tombstone = screen.getByRole('heading', { name: 'Item indisponível' }).closest('li')!;
  await user.click(within(tombstone).getByRole('button', { name: 'Remover vínculo' }));
  await waitFor(() =>
    expect(calls.removeCampaignSessionPreparationLink).toHaveBeenCalledWith(
      expect.objectContaining({ linkId: 'link-000000000002' }),
    ),
  );
  expect(rows.get(quest.id)?.body).toEqual(quest.body);
});
it('sessão obsoleta não envia novos vínculos e conserva edição própria', async () => {
  let current = true;
  const request = {
    ...openRequest(),
    session: { ...openRequest().session, isActive: () => current },
  };
  render(<CampaignPreparationPanel campaignId={campaignId} openRequest={request} />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: clue.title });
  await user.click(within(row(clue.title)).getByRole('button', { name: 'Consultar item' }));
  await user.type(await screen.findByLabelText('Texto da pista'), ' rascunho');
  current = false;
  await user.click(within(row(clue.title)).getByRole('button', { name: 'Vincular a esta sessão' }));
  expect(calls.addCampaignSessionPreparationLink).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Texto da pista')).toHaveValue(
    (clue.body as { text: string }).text + ' rascunho',
  );
  await user.click(screen.getByRole('button', { name: 'Atualizar vínculos' }));
  await screen.findByText('Reabra uma sessão salva para consultar seus vínculos.');
});
it('C4 esconde corpo próprio, preserva controle e não aceita get atrasado', async () => {
  const p = pending();
  localStorage.setItem(recovery.campaignPreparationJournalKey(uid, campaignId), JSON.stringify(p));
  render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Abrir pistas e missões' }));
  expect(screen.getByLabelText('Texto da pista')).toHaveValue((clue.body as { text: string }).text);
  act(() => publishInvalidation({ actorId: uid, scope: 'campaign:' + campaignId }));
  expect(screen.queryByLabelText('Texto da pista')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirmar pedido preservado' })).toBeInTheDocument();
  expect(recovery.readPendingCampaignPreparation(uid, campaignId)).toEqual(p);
});
it('erro de catálogo permite retry, vazio permanece explícito e sem locks não envia escrita', async () => {
  vi.mocked(calls.listCampaignPreparationItems).mockRejectedValueOnce(
    new Error('Rede indisponível'),
  );
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Abrir pistas e missões' }));
  await screen.findByText('Rede indisponível');
  rows.clear();
  await user.click(screen.getByRole('button', { name: 'Atualizar itens' }));
  await screen.findByText('Nenhum item nesta lista');
  expect(screen.getByRole('button', { name: 'Nova pista' })).toBeDisabled();
  expect(calls.saveCampaignPreparationItem).not.toHaveBeenCalled();
});

it('listagem nova não rebaseia CAS do rascunho; conflito conserva texto até cancelamento explícito', async () => {
  render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = await open();
  await user.click(within(row(clue.title)).getByRole('button', { name: 'Consultar item' }));
  await user.type(await screen.findByLabelText('Texto da pista'), ' preservado');
  revision = 3;
  await user.click(screen.getByRole('button', { name: 'Atualizar itens' }));
  await screen.findByRole('heading', { name: clue.title });
  vi.mocked(calls.saveCampaignPreparationItem).mockRejectedValue(new Error('revision-conflict'));
  await user.click(screen.getByRole('button', { name: 'Salvar item' }));
  await screen.findByText('revision-conflict');
  expect(
    vi.mocked(calls.saveCampaignPreparationItem).mock.calls[0]![0].expectedItemCollectionRevision,
  ).toBe(2);
  expect(screen.getByLabelText('Texto da pista')).toHaveValue(clue.body.text + ' preservado');
  vi.mocked(calls.resolveCampaignPreparationOperation).mockImplementation((input) =>
    Promise.resolve({
      ...identity,
      kind: 'canceled',
      action: input.action,
      operationId: input.request.operationId,
    }),
  );
  await user.click(screen.getByRole('button', { name: 'Encerrar pedido sem executar' }));
  await screen.findByText('Pedido encerrado sem executar a alteração.');
  expect(screen.getByLabelText('Texto da pista')).toHaveValue(clue.body.text + ' preservado');
});
it('GET de outro item bloqueia editor e ignora continuação se edição já enfileirada mudar formulário', async () => {
  const second = { ...clue, id: 'clue-000000000002', title: 'Pista seguinte', order: 2 };
  rows.set(second.id, second);
  render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = await open();
  await user.click(within(row(clue.title)).getByRole('button', { name: 'Consultar item' }));
  const text = await screen.findByLabelText('Texto da pista'),
    reply = deferred<PreparationItemResult>();
  vi.mocked(calls.getCampaignPreparationItem).mockReturnValueOnce(reply.promise);
  await user.click(within(row(second.title)).getByRole('button', { name: 'Consultar item' }));
  expect(text).toBeDisabled();
  fireEvent.change(text, { target: { value: 'Evento já enfileirado' } });
  await act(async () => {
    reply.resolve({ ...identity, itemCollectionRevision: revision, item: second });
    await reply.promise;
  });
  expect(text).toHaveValue('Evento já enfileirado');
  expect(screen.getByLabelText('Título do item')).toHaveValue(clue.title);
});
it('GET de lista anterior ao recibo não repõe metadados nem habilita CAS antigo', async () => {
  render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = await open();
  await user.click(within(row(clue.title)).getByRole('button', { name: 'Consultar item' }));
  await user.type(await screen.findByLabelText('Texto da pista'), ' nova');
  const old = itemPage(),
    reply = deferred<PreparationItemPage>();
  vi.mocked(calls.listCampaignPreparationItems).mockReturnValueOnce(reply.promise);
  await user.click(screen.getByRole('button', { name: 'Atualizar itens' }));
  await user.click(screen.getByRole('button', { name: 'Salvar item' }));
  await screen.findByText('Pedido da preparação confirmado. Consulte a lista atual.');
  await act(async () => {
    reply.resolve(old);
    await reply.promise;
  });
  expect(screen.queryByRole('heading', { name: clue.title })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Texto da pista')).toHaveValue(clue.body.text + ' nova');
  await user.click(screen.getByRole('button', { name: 'Atualizar itens' }));
  await screen.findByRole('heading', { name: clue.title });
  expect(calls.listCampaignPreparationItems).toHaveBeenCalledTimes(3);
});
it('paginação explícita reúne metadados e falha fechada se revisão mudar', async () => {
  const second = { ...clue, id: 'clue-000000000002', title: 'Segunda página', order: 2 };
  const first = {
    ...identity,
    itemCollectionRevision: 2,
    items: [summary(clue)],
    nextCursor: 'cursor-next',
  };
  vi.mocked(calls.listCampaignPreparationItems)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce({ ...first, items: [summary(second)], nextCursor: null });
  render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = await open();
  await user.click(screen.getByRole('button', { name: 'Mais itens' }));
  await screen.findByRole('heading', { name: second.title });
  expect(calls.listCampaignPreparationItems).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: 'cursor-next' }),
  );
  vi.mocked(calls.listCampaignPreparationItems)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce({
      ...first,
      itemCollectionRevision: 3,
      items: [summary(second)],
      nextCursor: null,
    });
  await user.click(screen.getByRole('button', { name: 'Atualizar itens' }));
  await user.click(await screen.findByRole('button', { name: 'Mais itens' }));
  await screen.findByText('A lista mudou. Atualize antes de continuar a paginação.');
  expect(screen.queryByRole('heading', { name: second.title })).not.toBeInTheDocument();
});
it('trocar item sujo exige descarte explícito e não envia formulário automaticamente', async () => {
  render(<CampaignPreparationPanel campaignId={campaignId} />);
  const user = await open();
  await user.click(within(row(clue.title)).getByRole('button', { name: 'Consultar item' }));
  await user.type(await screen.findByLabelText('Condição de descoberta'), ' alterada');
  await user.click(screen.getByRole('button', { name: 'Nova pista' }));
  await screen.findByRole('button', { name: 'Manter rascunho atual' });
  await user.click(screen.getByRole('button', { name: 'Manter rascunho atual' }));
  expect(screen.getByLabelText('Condição de descoberta')).toHaveValue(
    clue.body.condition + ' alterada',
  );
  await user.click(screen.getByRole('button', { name: 'Nova pista' }));
  await user.click(screen.getByRole('button', { name: 'Descartar e continuar' }));
  expect(screen.getByLabelText('Título do item')).toHaveValue('');
  expect(calls.saveCampaignPreparationItem).not.toHaveBeenCalled();
});
