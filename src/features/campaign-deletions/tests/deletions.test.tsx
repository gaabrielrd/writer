import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignDeletionDialog } from '../components/CampaignDeletionDialog';
import { CampaignDeletionPreparations } from '../components/CampaignDeletionPreparations';
import { useDeletionOperation } from '../hooks/useDeletionOperation';
import * as rpc from '../services/campaignDeletionCallables';
import * as store from '../services/campaignDeletionRecovery';
import * as api from '../services/campaignDeletionService';
import { getInvalidationGeneration } from '@/shared/services';
import type { DeletionProgress, DeletionMutation, DeletionLookup } from '../model/campaignDeletion';
import {
  uid,
  campaignId,
  source,
  progress,
  start,
  step,
  storedKey,
  put,
  installBrowser,
  deferred,
} from './fixtures';
const auth = vi.hoisted(() => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/campaignDeletionCallables', () => ({
  getCampaignDeletionSource: vi.fn(),
  startCampaignDeletion: vi.fn(),
  resolveCampaignDeletionStart: vi.fn(),
  getCampaignDeletion: vi.fn(),
  listCampaignDeletions: vi.fn(),
  advanceCampaignDeletion: vi.fn(),
}));
let job: DeletionProgress | null;
const result = (
  operationId: string,
  action: 'start' | 'advance',
  expectedCheckpoint: number | null,
): DeletionMutation => ({
  receipt: {
    operationId,
    action,
    expectedCheckpoint,
    confirmedCheckpoint: expectedCheckpoint === null ? 0 : expectedCheckpoint + 1,
  },
  progress: { ...job! },
});
beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { uid };
  installBrowser();
  job = null;
  vi.mocked(rpc.getCampaignDeletionSource).mockResolvedValue(source);
  vi.mocked(rpc.getCampaignDeletion).mockImplementation((input) =>
    Promise.resolve({
      schemaVersion: 1,
      ownerId: uid,
      lookup: input,
      deletion: job ? { ...job } : null,
    }),
  );
  vi.mocked(rpc.listCampaignDeletions).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(rpc.startCampaignDeletion).mockImplementation((input) => {
    job = { ...progress, deletionId: input.operationId };
    return Promise.resolve(result(input.operationId, 'start', null));
  });
  vi.mocked(rpc.advanceCampaignDeletion).mockImplementation((input) => {
    const checkpoint = input.expectedCheckpoint + 1;
    job = {
      ...job!,
      checkpoint,
      updatedAt: 1000 + checkpoint,
      state: checkpoint >= 3 ? 'deleted' : 'deleting',
      phase: checkpoint >= 3 ? 'complete' : 'controls',
      complete: checkpoint >= 3,
    };
    return Promise.resolve(result(input.operationId, 'advance', input.expectedCheckpoint));
  });
  vi.mocked(rpc.resolveCampaignDeletionStart).mockImplementation((input) => {
    const { intent: _, ...request } = input;
    void _;
    return Promise.resolve({ kind: 'canceled', schemaVersion: 1, ownerId: uid, request });
  });
});
afterEach(() => vi.restoreAllMocks());
const options = () => ({ uid, campaignId, isActive: () => true, isOpen: () => false });
async function hook(extra: Partial<Parameters<typeof useDeletionOperation>[0]> = {}) {
  const h = renderHook(() => useDeletionOperation({ ...options(), ...extra }));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  return h;
}
function dialog() {
  return render(<CampaignDeletionDialog campaignId={campaignId} open onClose={vi.fn()} />);
}
it('confirma exclusão explícita sem digitação, revoga antes da limpeza e não persiste título', async () => {
  const scope = { actorId: uid, scope: 'campaign:' + campaignId },
    before = getInvalidationGeneration(scope);
  dialog();
  expect(await screen.findByText('Mesa privada')).toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: 'Excluir definitivamente' }));
  expect(await screen.findByRole('heading', { name: 'Campanha excluída' })).toBeInTheDocument();
  expect(rpc.startCampaignDeletion).toHaveBeenCalledOnce();
  expect(rpc.advanceCampaignDeletion).toHaveBeenCalledTimes(3);
  expect(getInvalidationGeneration(scope)).toBeGreaterThan(before);
  expect(localStorage.getItem(storedKey)).not.toContain('Mesa privada');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
it('start desconhecido sobrevive reload e repete input exato sem GET como recibo', async () => {
  await store.reserveDeletion(start, () => {});
  vi.mocked(rpc.startCampaignDeletion).mockRejectedValueOnce(new Error('Resposta perdida'));
  const h = await hook();
  expect(rpc.getCampaignDeletion).not.toHaveBeenCalled();
  await act(() => h.result.current.recover());
  expect(store.readDeletion(uid, campaignId)).toEqual(start);
  h.unmount();
  const next = await hook();
  await act(() => next.result.current.recover());
  expect(rpc.startCampaignDeletion).toHaveBeenNthCalledWith(1, start.input);
  expect(rpc.startCampaignDeletion).toHaveBeenNthCalledWith(2, start.input);
  expect(rpc.advanceCampaignDeletion).not.toHaveBeenCalled();
});
it('cancelar início nunca recebido usa fence preservado e não inicia novo job', async () => {
  await store.reserveDeletion(start, () => {});
  const h = await hook();
  await act(() => h.result.current.cancelStart());
  expect(rpc.resolveCampaignDeletionStart).toHaveBeenCalledWith({
    ...start.input,
    intent: 'cancel',
  });
  expect(store.readDeletion(uid, campaignId)).toBeNull();
  expect(rpc.startCampaignDeletion).not.toHaveBeenCalled();
});
it('resolver início recebido confirma irreversibilidade, sem cancelar ou avançar sozinho', async () => {
  await store.reserveDeletion(start, () => {});
  job = { ...progress };
  vi.mocked(rpc.resolveCampaignDeletionStart).mockResolvedValue(
    result(start.input.operationId, 'start', null),
  );
  const h = await hook();
  await act(() => h.result.current.cancelStart());
  expect(h.result.current.progress?.revoked).toBe(true);
  expect(h.result.current.control?.kind).toBe('known');
  expect(rpc.advanceCampaignDeletion).not.toHaveBeenCalled();
});
it('resposta start válida revoga apresentação mesmo se outra aba vence CAS local', async () => {
  const revoked = vi.fn(),
    h = await hook({ onRevoked: revoked }),
    original = store.finishDeletion;
  vi.spyOn(store, 'finishDeletion').mockImplementationOnce(async (op, value, check) => {
    const newer = { ...start, input: { ...start.input, operationId: 'newer-start' } };
    put(newer);
    return original(op, value, check);
  });
  await act(() => h.result.current.start(source));
  expect(revoked).toHaveBeenCalledOnce();
  expect(store.readDeletion(uid, campaignId)?.kind).toBe('start');
  expect(store.readDeletion(uid, campaignId)).toMatchObject({
    input: { operationId: 'newer-start' },
  });
  expect(h.result.current.error).toMatch(/mudou/);
  expect(rpc.advanceCampaignDeletion).not.toHaveBeenCalled();
});
it('fonte mostrada fica congelada até confirmação sem adotar revisão por focus', async () => {
  dialog();
  await screen.findByText('Mesa privada');
  vi.mocked(rpc.getCampaignDeletionSource).mockResolvedValue({
    ...source,
    revision: 4,
    title: 'Outro título',
  });
  await act(() => window.dispatchEvent(new Event('focus')));
  await userEvent.click(screen.getByRole('button', { name: 'Excluir definitivamente' }));
  expect(vi.mocked(rpc.startCampaignDeletion).mock.calls[0]![0].expectedRevision).toBe(3);
  expect(rpc.getCampaignDeletionSource).toHaveBeenCalledOnce();
});
it('fechar com RPC em voo preserva controle e não segue limpeza nem reabre modal', async () => {
  const gate = deferred<DeletionMutation>(),
    close = vi.fn(),
    view = render(<CampaignDeletionDialog campaignId={campaignId} open onClose={close} />);
  vi.mocked(rpc.startCampaignDeletion).mockReturnValueOnce(gate.promise);
  await userEvent.click(await screen.findByRole('button', { name: 'Excluir definitivamente' }));
  view.rerender(<CampaignDeletionDialog campaignId={campaignId} open={false} onClose={close} />);
  const input = vi.mocked(rpc.startCampaignDeletion).mock.calls[0]![0];
  await act(async () => {
    job = { ...progress, deletionId: input.operationId };
    gate.resolve(result(input.operationId, 'start', null));
    await gate.promise;
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(rpc.advanceCampaignDeletion).not.toHaveBeenCalled();
  expect(store.readDeletion(uid, campaignId)?.kind).toBe('known');
});
it('pausa confirma etapa em voo e continuar exige ação explícita', async () => {
  const gate = deferred<DeletionMutation>();
  vi.mocked(rpc.advanceCampaignDeletion).mockReturnValueOnce(gate.promise);
  dialog();
  await userEvent.click(await screen.findByRole('button', { name: 'Excluir definitivamente' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pausar após esta etapa' }));
  const input = vi.mocked(rpc.advanceCampaignDeletion).mock.calls[0]![0];
  await act(async () => {
    job = { ...job!, checkpoint: 1, phase: 'controls' };
    gate.resolve(result(input.operationId, 'advance', 0));
    await gate.promise;
  });
  expect(rpc.advanceCampaignDeletion).toHaveBeenCalledOnce();
  await userEvent.click(await screen.findByRole('button', { name: 'Continuar limpeza' }));
  expect(await screen.findByRole('heading', { name: 'Campanha excluída' })).toBeInTheDocument();
});
it('conflito definitivo encerra tentativa antiga só por GET novo e escolha explícita', async () => {
  put(step);
  job = { ...progress };
  const h = await hook();
  vi.mocked(rpc.advanceCampaignDeletion).mockRejectedValueOnce(
    Object.assign(new Error('Conflito'), { details: { reason: 'checkpoint-conflict' } }),
  );
  await act(() => h.result.current.recover());
  expect(h.result.current.conflict).toBe(true);
  job = { ...progress, checkpoint: 2, phase: 'bases' };
  await act(() => h.result.current.resolveConflict());
  expect(h.result.current.control).toEqual(store.knownDeletion(job));
  expect(h.result.current.progress?.checkpoint).toBe(2);
  expect(rpc.advanceCampaignDeletion).toHaveBeenCalledOnce();
});
it.each(['zero', 'action', 'identity'] as const)(
  'recibo %s não confirma nem remove pedido preservado',
  async (mode) => {
    put(step);
    job = { ...progress };
    const h = await hook();
    vi.mocked(rpc.advanceCampaignDeletion).mockResolvedValue({
      receipt: {
        operationId: step.input.operationId,
        action: mode === 'action' ? 'start' : 'advance',
        expectedCheckpoint: 0,
        confirmedCheckpoint: mode === 'zero' ? 0 : 1,
      },
      progress: {
        ...progress,
        checkpoint: 1,
        ...(mode === 'identity' ? { campaignToken: 'b'.repeat(64) } : {}),
      },
    });
    await act(() => h.result.current.recover());
    expect(store.readDeletion(uid, campaignId)).toEqual(step);
    expect(h.result.current.error).not.toBe('');
  },
);
it('GET explícito substitui leitura pendurada e finally antigo não libera loading novo', async () => {
  put(store.knownDeletion(progress));
  const old = deferred<DeletionLookup>(),
    fresh = deferred<DeletionLookup>();
  vi.mocked(rpc.getCampaignDeletion)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(fresh.promise);
  const h = await hook();
  let checking!: Promise<void>;
  act(() => {
    checking = h.result.current.refresh();
  });
  await waitFor(() => expect(rpc.getCampaignDeletion).toHaveBeenCalledTimes(2));
  await act(async () => {
    old.resolve({ schemaVersion: 1, ownerId: uid, lookup: { campaignId }, deletion: progress });
    await old.promise;
  });
  expect(h.result.current.loading).toBe(true);
  await act(async () => {
    fresh.resolve({
      schemaVersion: 1,
      ownerId: uid,
      lookup: { campaignId },
      deletion: { ...progress, checkpoint: 2 },
    });
    await checking;
  });
  expect(h.result.current.progress?.checkpoint).toBe(2);
  expect(h.result.current.loading).toBe(false);
  expect(rpc.advanceCampaignDeletion).not.toHaveBeenCalled();
});
it('reserva vencida antes de RPC conserva B e não envia start A', async () => {
  const h = await hook(),
    original = store.reserveDeletion;
  vi.spyOn(store, 'reserveDeletion').mockImplementationOnce(async (op, check) => {
    await original(op, check);
    put({ ...start, input: { ...start.input, operationId: 'B' } });
  });
  await act(() => h.result.current.start(source));
  expect(rpc.startCampaignDeletion).not.toHaveBeenCalled();
  expect(store.readDeletion(uid, campaignId)).toMatchObject({ input: { operationId: 'B' } });
});
it('confirmação inicial de A não transforma pedido B trocado antes do clique', async () => {
  put(start);
  const h = await hook();
  put({ ...start, input: { ...start.input, operationId: 'B' } });
  await act(() => h.result.current.cancelStart());
  expect(rpc.resolveCampaignDeletionStart).not.toHaveBeenCalled();
  expect(store.readDeletion(uid, campaignId)).toMatchObject({ input: { operationId: 'B' } });
});
it('UID trocado durante resposta não publica revogação nem limpa journal original', async () => {
  put(start);
  const gate = deferred<DeletionMutation>(),
    revoked = vi.fn();
  let active = true;
  const h = await hook({ isActive: () => active, onRevoked: revoked });
  vi.mocked(rpc.startCampaignDeletion).mockReturnValueOnce(gate.promise);
  let running!: Promise<void>;
  act(() => {
    running = h.result.current.recover();
  });
  await waitFor(() => expect(rpc.startCampaignDeletion).toHaveBeenCalledOnce());
  active = false;
  await act(async () => {
    job = { ...progress };
    gate.resolve(result(start.input.operationId, 'start', null));
    await running;
  });
  expect(revoked).not.toHaveBeenCalled();
  expect(store.readDeletion(uid, campaignId)).toEqual(start);
});
it('lookup de captura exige echo e dono exatos e não usa null como prova', () => {
  expect(() =>
    api.validateLookup(
      { schemaVersion: 1, ownerId: uid, lookup: { captureId: 'different' }, deletion: progress },
      uid,
      { captureId: 'original' },
    ),
  ).toThrow();
  expect(() =>
    api.validateLookup(
      { schemaVersion: 1, ownerId: 'other', lookup: { captureId: 'original' }, deletion: progress },
      uid,
      { captureId: 'original' },
    ),
  ).toThrow();
  api.validateLookup(
    { schemaVersion: 1, ownerId: uid, lookup: { captureId: 'original' }, deletion: null },
    uid,
    { captureId: 'original' },
  );
});
it('descoberta sem raiz pagina janelas vazias, deduplica e oferece retry sem novos RPCs mutantes', async () => {
  vi.mocked(rpc.listCampaignDeletions)
    .mockResolvedValueOnce({ items: [], nextCursor: 'first' })
    .mockResolvedValueOnce({ items: [progress], nextCursor: 'second' })
    .mockResolvedValueOnce({ items: [progress], nextCursor: null })
    .mockRejectedValueOnce(new Error('Rede temporária'))
    .mockResolvedValue({ items: [progress], nextCursor: null });
  render(<CampaignDeletionPreparations />);
  await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais exclusões' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais exclusões' }));
  expect(screen.getAllByRole('button', { name: /Exclusão lete-one/ })).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar exclusões' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Tentar listar exclusões novamente' }),
  );
  expect(await screen.findByRole('button', { name: /Exclusão lete-one/ })).toBeInTheDocument();
  expect(rpc.startCampaignDeletion).not.toHaveBeenCalled();
});
it('controle inválido não é apagado ou substituído e navegador sem locks continua lendo', async () => {
  localStorage.setItem(storedKey, '{');
  await expect(store.reserveDeletion(start, () => {})).rejects.toThrow();
  expect(localStorage.getItem(storedKey)).toBe('{');
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  dialog();
  expect(await screen.findByText(/A consulta continua disponível/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Excluir definitivamente' })).toBeDisabled();
  expect(rpc.startCampaignDeletion).not.toHaveBeenCalled();
});
it('GET próprio válido revoga apresentação apesar de slot A trocado por B durante await', async () => {
  put(store.knownDeletion(progress));
  const gate = deferred<DeletionLookup>(),
    revoked = vi.fn();
  vi.mocked(rpc.getCampaignDeletion).mockReturnValueOnce(gate.promise);
  const h = await hook({ onRevoked: revoked });
  put({ ...start, input: { ...start.input, operationId: 'B' } });
  await act(async () => {
    gate.resolve({ schemaVersion: 1, ownerId: uid, lookup: { campaignId }, deletion: progress });
    await gate.promise;
  });
  expect(revoked).toHaveBeenCalledOnce();
  expect(store.readDeletion(uid, campaignId)).toMatchObject({ input: { operationId: 'B' } });
  expect(h.result.current.progress).toBeNull();
  expect(rpc.advanceCampaignDeletion).not.toHaveBeenCalled();
});
it.each(['owner', 'lookup'] as const)(
  'GET de %s incorreto não publica invalidação ou troca controle',
  async (field) => {
    const revoked = vi.fn();
    vi.mocked(rpc.getCampaignDeletion).mockResolvedValue({
      ...{ schemaVersion: 1 as const, ownerId: uid, lookup: { campaignId }, deletion: progress },
      ...(field === 'owner' ? { ownerId: 'other' } : { lookup: { campaignId: 'other' } }),
    });
    const h = await hook({ onRevoked: revoked });
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    expect(revoked).not.toHaveBeenCalled();
    expect(h.result.current.error).not.toBe('');
  },
);

it('reabrir exclusão permite nova prova enquanto GET anterior permanece pendurado', async () => {
  job = { ...progress };
  const reviewed = vi.fn(),
    closed = vi.fn();
  const props = { campaignId, open: true, onClose: closed, onReviewRecovery: reviewed };
  const view = render(<CampaignDeletionDialog {...props} />);
  const button = await screen.findByRole('button', {
    name: 'Encerrar controles antigos deste navegador',
  });
  const old = deferred<DeletionLookup>(),
    newer = deferred<DeletionLookup>();
  vi.mocked(rpc.getCampaignDeletion)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(newer.promise);
  await userEvent.click(button);
  await userEvent.click(screen.getByRole('button', { name: 'Fechar exclusão' }));
  view.rerender(<CampaignDeletionDialog {...props} open={false} />);
  view.rerender(<CampaignDeletionDialog {...props} />);
  const reopened = await screen.findByRole('button', {
    name: 'Encerrar controles antigos deste navegador',
  });
  expect(reopened).toBeEnabled();
  await userEvent.click(reopened);
  expect(reopened).toBeDisabled();
  const proof = {
    schemaVersion: 1 as const,
    ownerId: uid,
    lookup: { campaignId },
    deletion: progress,
  };
  await act(async () => {
    old.resolve(proof);
    await old.promise;
  });
  expect(reviewed).not.toHaveBeenCalled();
  expect(reopened).toBeDisabled();
  await act(async () => {
    newer.resolve(proof);
    await newer.promise;
  });
  expect(reviewed).toHaveBeenCalledOnce();
  expect(reopened).toBeEnabled();
});
it('prova permanente pode encerrar controles antigos sem adotar identidade ou piso de outra encarnação', async () => {
  const old = {
    ...store.knownDeletion(progress),
    identity: { ...api.identityOf(progress), campaignToken: '9'.repeat(64), deletionId: 'old-job' },
    checkpoint: 50,
  } as const;
  put(old);
  job = { ...progress };
  const h = await hook();
  await waitFor(() => expect(h.result.current.loading).toBe(false));
  expect(h.result.current.progress).toBeNull();
  let proof: DeletionLookup | undefined;
  await act(async () => {
    proof = await h.result.current.proof();
  });
  expect(proof).toEqual({
    schemaVersion: 1,
    ownerId: uid,
    lookup: { campaignId },
    deletion: progress,
  });
  expect(h.result.current.progress).toBeNull();
  expect(store.readDeletion(uid, campaignId)).toEqual(old);
  expect(rpc.startCampaignDeletion).not.toHaveBeenCalled();
  expect(rpc.advanceCampaignDeletion).not.toHaveBeenCalled();
});
