import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getInvalidationGeneration } from '@/shared/services';
import { CampaignSessionReferencesPanel } from '../components/CampaignSessionReferencesPanel';
import { CampaignSessionReferenceControls } from '../components/CampaignSessionReferenceControls';
import * as calls from '../services/sessionReferenceCallables';
import * as store from '../services/sessionReferenceRecovery';
import type {
  PendingSessionReference,
  SessionReferencePage,
  SessionLoreReferenceResult,
} from '../model/sessionReference';
import {
  uid,
  cid,
  scope,
  context,
  candidate,
  row,
  envelope,
  page,
  material,
  operation,
  confirmed,
  journalKey,
  installLocks,
  deferred,
  rpcError,
} from './referenceTestHelpers';
const auth = vi.hoisted((): { user: { uid: string } | null } => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/sessionReferenceCallables', () => ({
  listCampaignSessionReferences: vi.fn(),
  addCampaignSessionReference: vi.fn(),
  removeCampaignSessionReference: vi.fn(),
  readCampaignSessionLoreReference: vi.fn(),
  resolveCampaignSessionReferenceOperation: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  auth.user = { uid };
  installLocks();
  vi.mocked(calls.listCampaignSessionReferences).mockResolvedValue(page());
  vi.mocked(calls.readCampaignSessionLoreReference).mockResolvedValue(structuredClone(material));
  vi.mocked(calls.addCampaignSessionReference).mockImplementation((request) =>
    Promise.resolve(confirmed({ ...operation, action: 'add', request })),
  );
  vi.mocked(calls.removeCampaignSessionReference).mockImplementation((request) =>
    Promise.resolve(confirmed({ ...operation, action: 'remove', request })),
  );
});
const panel = () => (
  <CampaignSessionReferencesPanel scope={{ ...scope }} isActive={() => true} readOnly={false} />
);
async function loaded() {
  await waitFor(() =>
    expect(screen.queryByText('Consultando vínculos da sessão...')).not.toBeInTheDocument(),
  );
}
const seed = (value: PendingSessionReference = operation) =>
  localStorage.setItem(journalKey, JSON.stringify(value));
it('consulta candidatos pela sessão, pagina legado e cria somente vínculo de IDs, sem armazenar nomes ou prosa', async () => {
  vi.mocked(calls.listCampaignSessionReferences).mockImplementation((input) =>
    Promise.resolve(
      input.view === 'references'
        ? page()
        : {
            ...envelope,
            view: 'candidates',
            sourceContext: context,
            items: input.cursor ? [candidate] : [],
            nextCursor: input.cursor ? null : 'next-candidate',
          },
    ),
  );
  render(panel());
  await loaded();
  await userEvent.click(screen.getByRole('button', { name: 'Vincular ficha' }));
  expect(
    await screen.findByText('Esta janela está vazia; há mais fichas para consultar.'),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais fichas' }));
  expect(await screen.findByText('Legado da mesa')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Vincular Lia da mesa' }));
  await waitFor(() => expect(calls.addCampaignSessionReference).toHaveBeenCalledOnce());
  const input = vi.mocked(calls.addCampaignSessionReference).mock.calls[0]![0];
  expect(input).toEqual({
    ...scope,
    operationId: input.operationId,
    referenceId: input.operationId,
    expectedReferenceCollectionRevision: 1,
    sourceContext: context,
    target: { kind: 'lore', sourceKey: candidate.sourceKey },
  });
  expect(calls.listCampaignSessionReferences).toHaveBeenCalledWith({
    ...scope,
    view: 'candidates',
    sourceContext: context,
    cursor: 'next-candidate',
    limit: 25,
  });
  await waitFor(() => expect(store.readPendingSessionReference(uid, cid)).toBeNull());
  expect(JSON.stringify(localStorage)).not.toMatch(/Lia|Detalhes|Resumo autorizado/);
  expect(calls.readCampaignSessionLoreReference).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Consultar vínculos' })).toHaveFocus();
});
it('lê somente o endpoint com gate da sessão e devolve foco ao fechar o material, sem misturar prosa no vínculo', async () => {
  vi.mocked(calls.listCampaignSessionReferences).mockResolvedValue(page([row]));
  render(panel());
  const opener = await screen.findByRole('button', { name: 'Ler ficha Lia da mesa' });
  await userEvent.click(opener);
  expect(await screen.findByText('Detalhes protegidos da ficha')).toBeInTheDocument();
  for (const text of [
    'Manto azul',
    'Paciente',
    'Vigia da torre',
    'Nota da mesa',
    'Torre antiga',
    'Lar atual',
  ])
    expect(screen.getByText(text, { exact: false })).toBeInTheDocument();
  expect(calls.readCampaignSessionLoreReference).toHaveBeenCalledExactlyOnceWith({
    ...scope,
    referenceId: row.id,
    expectedRevision: 1,
    expectedReferenceCollectionRevision: 1,
    sourceContext: context,
  });
  await userEvent.click(screen.getByRole('button', { name: 'Fechar ficha vinculada' }));
  await waitFor(() => expect(opener).toHaveFocus());
  expect(screen.queryByText('Detalhes protegidos da ficha')).not.toBeInTheDocument();
});
it('origem indisponível omite todo material, permite remover vínculo próprio e exige confirmação explícita', async () => {
  const unavailable = {
    id: row.id,
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    available: false as const,
  };
  vi.mocked(calls.listCampaignSessionReferences).mockResolvedValue({
    ...page([unavailable]),
    sourceContext: null,
  });
  render(panel());
  expect(await screen.findByText('Material indisponível')).toBeInTheDocument();
  expect(screen.queryByText('Lia da mesa')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Vincular ficha' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remover vínculo 1' }));
  await userEvent.click(screen.getByRole('button', { name: 'Manter vínculo' }));
  expect(calls.removeCampaignSessionReference).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Remover vínculo 1' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar remoção do vínculo' }));
  await waitFor(() => expect(calls.removeCampaignSessionReference).toHaveBeenCalledOnce());
  expect(calls.readCampaignSessionLoreReference).not.toHaveBeenCalled();
});
it('falha da próxima página invalida nomes e material composto; consulta explícita pode recuperar lista', async () => {
  vi.mocked(calls.listCampaignSessionReferences)
    .mockResolvedValueOnce(page([row], 'next'))
    .mockRejectedValueOnce(rpcError('cursor-invalidated'))
    .mockResolvedValue(page([row]));
  render(panel());
  await screen.findByText('Lia da mesa');
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais vínculos' }));
  expect(await screen.findByText('cursor-invalidated')).toBeInTheDocument();
  expect(screen.queryByText('Lia da mesa')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Consultar vínculos' }));
  expect(await screen.findByText('Lia da mesa')).toBeInTheDocument();
});
it('janela vazia com cursor continua consultável e próxima janela de projeção diferente invalida o composto', async () => {
  vi.mocked(calls.listCampaignSessionReferences)
    .mockResolvedValueOnce(page([], 'empty-next'))
    .mockResolvedValueOnce(page([row], 'changed-next'))
    .mockResolvedValueOnce({
      ...page([row]),
      sourceContext: { ...context, projectionToken: 'e'.repeat(64) },
    });
  render(panel());
  expect(
    await screen.findByText('Esta janela está vazia; há mais vínculos para consultar.'),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais vínculos' }));
  expect(await screen.findByText('Lia da mesa')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais vínculos' }));
  expect(
    await screen.findByText('Os vínculos ou o acesso mudaram. Consulte novamente.'),
  ).toBeInTheDocument();
  expect(screen.queryByText('Lia da mesa')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Carregar mais vínculos' })).not.toBeInTheDocument();
  expect(calls.addCampaignSessionReference).not.toHaveBeenCalled();
});
it('consulta explícita substitui GET pendurado e finally antigo não encerra o loading da leitura nova', async () => {
  const first = deferred<SessionReferencePage>(),
    second = deferred<SessionReferencePage>();
  vi.mocked(calls.listCampaignSessionReferences)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  render(panel());
  await waitFor(() => expect(calls.listCampaignSessionReferences).toHaveBeenCalledOnce());
  await userEvent.click(screen.getByRole('button', { name: 'Consultar vínculos' }));
  await act(async () => {
    first.resolve(page([row]));
    await first.promise;
  });
  expect(screen.getByText('Consultando vínculos da sessão...')).toBeInTheDocument();
  expect(screen.queryByText('Lia da mesa')).not.toBeInTheDocument();
  await act(async () => {
    second.resolve(page());
    await second.promise;
  });
  expect(screen.queryByText('Consultando vínculos da sessão...')).not.toBeInTheDocument();
  expect(screen.getByText('Nenhuma ficha vinculada à sessão.')).toBeInTheDocument();
});
it('focus remove nomes e corpo antes do GET; resposta antiga não repovoa após nova projeção', async () => {
  const held = deferred<SessionLoreReferenceResult>(),
    refresh = deferred<SessionReferencePage>();
  vi.mocked(calls.listCampaignSessionReferences)
    .mockResolvedValueOnce(page([row]))
    .mockReturnValueOnce(refresh.promise);
  vi.mocked(calls.readCampaignSessionLoreReference).mockReturnValue(held.promise);
  render(panel());
  await userEvent.click(await screen.findByRole('button', { name: 'Ler ficha Lia da mesa' }));
  void act(() => window.dispatchEvent(new Event('focus')));
  expect(screen.queryByText('Lia da mesa')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await act(async () => {
    refresh.resolve({ ...page(), sourceContext: { ...context, projectionToken: 'e'.repeat(64) } });
    held.resolve(material);
    await held.promise;
  });
  expect(screen.queryByText('Detalhes protegidos da ficha')).not.toBeInTheDocument();
  expect(calls.addCampaignSessionReference).not.toHaveBeenCalled();
});
it('não refaz consulta a cada render de scope equivalente e descarta respostas tardias de outra conta', async () => {
  const held = deferred<SessionReferencePage>();
  vi.mocked(calls.listCampaignSessionReferences).mockReturnValue(held.promise);
  const view = render(panel());
  await waitFor(() => expect(calls.listCampaignSessionReferences).toHaveBeenCalledOnce());
  view.rerender(panel());
  expect(calls.listCampaignSessionReferences).toHaveBeenCalledOnce();
  auth.user = { uid: 'second-owner' };
  view.rerender(panel());
  await act(async () => {
    held.resolve(page([row]));
    await held.promise;
  });
  expect(screen.queryByText('Lia da mesa')).not.toBeInTheDocument();
  expect(calls.addCampaignSessionReference).not.toHaveBeenCalled();
});
it('recupera recibo histórico fora do diálogo da sessão, sem buscar sessão, alvo ou conteúdo', async () => {
  seed();
  vi.mocked(calls.addCampaignSessionReference).mockResolvedValue(confirmed(operation));
  const pending = vi.fn();
  render(<CampaignSessionReferenceControls campaignId={cid} onPendingChange={pending} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Confirmar pedido de vínculo' }));
  await waitFor(() => expect(store.readPendingSessionReference(uid, cid)).toBeNull());
  expect(calls.addCampaignSessionReference).toHaveBeenCalledExactlyOnceWith(operation.request);
  expect(calls.listCampaignSessionReferences).not.toHaveBeenCalled();
  expect(calls.readCampaignSessionLoreReference).not.toHaveBeenCalled();
  expect(pending).toHaveBeenLastCalledWith(false);
});
it('resposta perdida do cancelamento conserva intenção antes do RPC e reload repete somente resolução exata', async () => {
  seed();
  const cause = rpcError('unavailable');
  vi.mocked(calls.resolveCampaignSessionReferenceOperation).mockImplementationOnce(() => {
    expect(store.readPendingSessionReference(uid, cid)?.intent).toBe('cancel');
    return Promise.reject(cause);
  });
  const view = render(<CampaignSessionReferenceControls campaignId={cid} />);
  await userEvent.click(screen.getByRole('button', { name: 'Encerrar pedido de vínculo' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento do vínculo' }));
  await screen.findByText('unavailable');
  expect(store.readPendingSessionReference(uid, cid)?.intent).toBe('cancel');
  view.unmount();
  vi.mocked(calls.resolveCampaignSessionReferenceOperation).mockImplementation((input) =>
    Promise.resolve({
      schemaVersion: 1,
      ownerId: uid,
      campaignId: cid,
      campaignToken: scope.campaignToken,
      sessionId: scope.sessionId,
      kind: 'canceled',
      action: input.action,
      request: Object.fromEntries(Object.entries(input.request).reverse()),
    } as never),
  );
  render(<CampaignSessionReferenceControls campaignId={cid} />);
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento do pedido' }));
  await waitFor(() => expect(store.readPendingSessionReference(uid, cid)).toBeNull());
  expect(calls.addCampaignSessionReference).not.toHaveBeenCalled();
  expect(calls.resolveCampaignSessionReferenceOperation).toHaveBeenCalledTimes(2);
});
it('confirmação aberta para A não cancela B que outra aba reservou; ciphertext ou outros domínios não são tocados', async () => {
  seed();
  render(<CampaignSessionReferenceControls campaignId={cid} />);
  await userEvent.click(screen.getByRole('button', { name: 'Encerrar pedido de vínculo' }));
  const next = {
    ...operation,
    request: {
      ...operation.request,
      operationId: 'operation-reference-0002',
      referenceId: 'operation-reference-0002',
    },
  } as PendingSessionReference;
  seed(next);
  localStorage.setItem('other-domain', 'protected');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento do vínculo' }));
  await waitFor(() => expect(screen.getByText(/pedido mudou em outra aba/)).toBeInTheDocument());
  expect(store.readPendingSessionReference(uid, cid)).toEqual(next);
  expect(localStorage.getItem('other-domain')).toBe('protected');
  expect(calls.resolveCampaignSessionReferenceOperation).not.toHaveBeenCalled();
  expect(calls.addCampaignSessionReference).not.toHaveBeenCalled();
});
it.each(['permission-denied', 'reference-inconsistent', 'source-context-changed'])(
  'replay sem recibo (%s) conserva pedido; beforeunload avisa e focus não envia',
  async (reason) => {
    seed();
    vi.mocked(calls.addCampaignSessionReference).mockRejectedValue(rpcError(reason));
    render(<CampaignSessionReferenceControls campaignId={cid} />);
    const event = new Event('beforeunload', { cancelable: true });
    void act(() => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    void act(() => window.dispatchEvent(new Event('focus')));
    expect(calls.addCampaignSessionReference).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar pedido de vínculo' }));
    await screen.findByText(reason);
    expect(store.readPendingSessionReference(uid, cid)).toEqual(operation);
  },
);
it('erro C4 comprovado do escopo publica invalidação e mantém journal; outro CID não revoga este leitor', async () => {
  seed();
  const before = getInvalidationGeneration({ actorId: uid, scope: 'campaign:' + cid });
  vi.mocked(calls.addCampaignSessionReference).mockRejectedValue(
    Object.assign(new Error('Excluída'), {
      code: 'functions/failed-precondition',
      details: {
        reason: 'campaign-deleted',
        campaignId: cid,
        deletionId: 'deletion-operation-001',
      },
    }),
  );
  render(<CampaignSessionReferenceControls campaignId={cid} />);
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar pedido de vínculo' }));
  await waitFor(() =>
    expect(getInvalidationGeneration({ actorId: uid, scope: 'campaign:' + cid })).toBe(before + 1),
  );
  expect(store.readPendingSessionReference(uid, cid)).toEqual(operation);
});
it('controle futuro permanece intacto e bloqueia RPC; navegação sem Web Locks permite somente leitura', async () => {
  const raw = JSON.stringify({ ...operation, schemaVersion: 2 });
  localStorage.setItem(journalKey, raw);
  const view = render(<CampaignSessionReferenceControls campaignId={cid} />);
  expect(screen.getByText(/controle de vínculo não pôde ser lido/)).toBeInTheDocument();
  expect(localStorage.getItem(journalKey)).toBe(raw);
  view.unmount();
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  vi.mocked(calls.listCampaignSessionReferences).mockResolvedValue(page([row]));
  render(panel());
  expect(await screen.findByRole('button', { name: 'Vincular ficha' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Ler ficha Lia da mesa' }));
  expect(await screen.findByText('Detalhes protegidos da ficha')).toBeInTheDocument();
  expect(calls.addCampaignSessionReference).not.toHaveBeenCalled();
});
