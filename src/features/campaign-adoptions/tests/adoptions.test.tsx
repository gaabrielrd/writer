import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseDropdown } from '@/test/dropdown';
import { CampaignAdoptionDialog } from '../components/CampaignAdoptionDialog';
import { CampaignAdoptionPreparations } from '../components/CampaignAdoptionPreparations';
import { useAdoptionOperation } from '../hooks/useAdoptionOperation';
import * as rpc from '../services/campaignAdoptionCallables';
import * as store from '../services/campaignAdoptionRecovery';
import { identityOf } from '../services/campaignAdoptionService';
import type {
  AdoptionProgress,
  AdoptionMutationResult,
  AdoptionDecision,
} from '../model/campaignAdoption';
import {
  uid,
  campaignId,
  adoptionId,
  identity,
  context,
  progress,
  start,
  step,
  row,
  installBrowser,
  deferred,
  otherKey,
} from './fixtures';
const auth = vi.hoisted(() => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/campaignAdoptionCallables', () => ({
  startCampaignAdoption: vi.fn(),
  resolveCampaignAdoptionStart: vi.fn(),
  getCampaignAdoption: vi.fn(),
  listCampaignAdoptions: vi.fn(),
  listCampaignAdoptionDecisions: vi.fn(),
  decideCampaignAdoption: vi.fn(),
  prepareCampaignAdoption: vi.fn(),
  advanceCampaignAdoption: vi.fn(),
  activateCampaignAdoption: vi.fn(),
  cancelCampaignAdoption: vi.fn(),
}));
vi.mock('@/features/campaign-lore/services/campaignLoreRemoteCallables', () => ({
  listCampaignLoreOperations: vi.fn(
    (scope: { campaignId: string; campaignToken: string; baseId: string }) =>
      Promise.resolve().then(() => ({
        schemaVersion: 1,
        ownerId: 'owner',
        campaignId: scope.campaignId,
        campaignToken: scope.campaignToken,
        baseId: scope.baseId,
        items: [],
        nextCursor: null,
      })),
  ),
  resolveCampaignLoreRemoteOperation: vi.fn(),
}));
let job: AdoptionProgress, rows: AdoptionDecision[];
const result = (
  input: {
    operationId: string;
    expectedCheckpoint?: number;
  },
  action: AdoptionMutationResult['receipt']['action'],
  outcome: 'confirmed' | 'reauthorization-required' = 'confirmed',
): AdoptionMutationResult => ({
  receipt: {
    operationId: input.operationId,
    action,
    expectedCheckpoint: action === 'start' ? null : input.expectedCheckpoint!,
    confirmedCheckpoint: job.checkpoint,
    outcome,
  },
  progress: { ...job },
});
beforeEach(() => {
  vi.clearAllMocks();
  Object.values(rpc).forEach((call) => vi.mocked(call).mockReset());
  auth.user = { uid };
  installBrowser();
  job = { ...progress };
  rows = [
    structuredClone(row),
    {
      ...row,
      sourceKey: otherKey,
      current: { name: 'Local da mesa', category: 'location' },
      candidate: { present: true, name: 'Local da candidata', category: 'location' },
      mode: 'removed',
    },
  ];
  vi.mocked(rpc.getCampaignAdoption).mockImplementation(() =>
    Promise.resolve().then(() => ({ ...job })),
  );
  vi.mocked(rpc.listCampaignAdoptions).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(rpc.startCampaignAdoption).mockImplementation((input) =>
    Promise.resolve().then(() => {
      job = { ...progress, adoptionId: input.operationId };
      return result(input, 'start');
    }),
  );
  vi.mocked(rpc.resolveCampaignAdoptionStart).mockImplementation((input) =>
    Promise.resolve().then(() => ({
      kind: 'canceled',
      schemaVersion: 1,
      ownerId: uid,
      request: {
        operationId: input.operationId,
        campaignId: input.campaignId,
        campaignToken: input.campaignToken,
        comparisonId: input.comparisonId,
        currentBaseId: input.currentBaseId,
        candidateBaseId: input.candidateBaseId,
        expectedCollectionRevision: input.expectedCollectionRevision,
      },
    })),
  );
  // DTO lists contain identity fields only, not progress fields.
  vi.mocked(rpc.listCampaignAdoptionDecisions).mockImplementation(() =>
    Promise.resolve().then(() => ({
      schemaVersion: 1,
      ownerId: uid,
      adoptionId: job.adoptionId,
      campaignId,
      campaignToken: job.campaignToken,
      comparisonId: job.comparisonId,
      currentBaseId: job.currentBaseId,
      candidateBaseId: job.candidateBaseId,
      loreGenerationId: job.loreGenerationId,
      expectedCollectionRevision: job.expectedCollectionRevision,
      currentCapturedAt: 1000,
      candidateCapturedAt: 2000,
      checkpoint: job.checkpoint,
      projectionToken: 'f'.repeat(64),
      items: structuredClone(rows),
      nextCursor: null,
    })),
  );
  vi.mocked(rpc.decideCampaignAdoption).mockImplementation((input) =>
    Promise.resolve().then(() => {
      rows = rows.map((x) =>
        x.sourceKey === input.sourceKey ? { ...x, choice: input.choice } : x,
      );
      job = { ...job, checkpoint: input.expectedCheckpoint + 1 };
      return {
        ...result(input, 'decide'),
        receipt: {
          ...result(input, 'decide').receipt,
          sourceKey: input.sourceKey,
          expectedRevision: input.expectedRevision,
          choice: input.choice,
        },
      };
    }),
  );
  vi.mocked(rpc.prepareCampaignAdoption).mockImplementation((input) =>
    Promise.resolve().then(() => {
      job = {
        ...job,
        state: 'preparing',
        phase: 'operations',
        checkpoint: input.expectedCheckpoint + 1,
      };
      return result(input, 'prepare');
    }),
  );
  vi.mocked(rpc.advanceCampaignAdoption).mockImplementation((input) =>
    Promise.resolve().then(() => {
      job = { ...job, state: 'ready', phase: 'complete', checkpoint: input.expectedCheckpoint + 1 };
      return result(input, 'advance');
    }),
  );
  vi.mocked(rpc.activateCampaignAdoption).mockImplementation((input) =>
    Promise.resolve().then(() => {
      job = {
        ...job,
        state: 'adopted',
        phase: 'complete',
        checkpoint: input.expectedCheckpoint + 1,
      };
      return result(input, 'activate');
    }),
  );
  vi.mocked(rpc.cancelCampaignAdoption).mockImplementation((input) =>
    Promise.resolve().then(() => {
      job = {
        ...job,
        state: 'deleted',
        phase: 'cleanup',
        cleanupComplete: true,
        checkpoint: input.expectedCheckpoint + 1,
      };
      return result(input, 'cancel');
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function dialog(onAdopted = vi.fn()) {
  return render(
    <CampaignAdoptionDialog
      selection={{ campaignId, context }}
      open
      onClose={vi.fn()}
      onAdopted={onAdopted}
    />,
  );
}
async function begin() {
  await userEvent.click(await screen.findByRole('button', { name: 'Iniciar revisão da adoção' }));
  await screen.findByRole('heading', { name: 'Decisões sobre o lore da mesa' });
}
const options = () => ({
  uid,
  selection: { campaignId, adoptionId, expected: identity },
  isActive: () => true,
  isOpen: () => false,
});
async function hook(custom: Parameters<typeof useAdoptionOperation>[0] = options()) {
  const h = renderHook(() => useAdoptionOperation(custom));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  return h;
}
it('decide ficha inteira e legado explicitamente, prepara e adota sem alterar notas ou enviar prosa', async () => {
  const adopted = vi.fn();
  dialog(adopted);
  await begin();
  expect(rpc.prepareCampaignAdoption).not.toHaveBeenCalled();
  await chooseDropdown(
    userEvent,
    screen.getByRole('combobox', { name: 'Decisão para Guardiã da mesa' }),
    'Manter legado da mesa',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar escolha' }));
  await waitFor(() => expect(rpc.decideCampaignAdoption).toHaveBeenCalledOnce());
  await chooseDropdown(
    userEvent,
    screen.getByRole('combobox', { name: 'Decisão para Local da mesa' }),
    'Manter ficha retirada',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar escolha' }));
  await waitFor(() => expect(rpc.decideCampaignAdoption).toHaveBeenCalledTimes(2));
  await userEvent.click(screen.getByRole('button', { name: 'Preparar atualização' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Adotar esta base' }));
  expect(adopted).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar adoção' }));
  await waitFor(() => expect(adopted).toHaveBeenCalledOnce());
  expect(
    await screen.findByText(
      'A base e o lore da mesa foram adotados juntos. Suas notas próprias foram preservadas.',
    ),
  ).toBeInTheDocument();
  expect(rpc.activateCampaignAdoption).toHaveBeenCalledOnce();
  expect(JSON.stringify(store.listAdoptionControls(uid))).not.toContain('Guardiã');
  expect(vi.mocked(rpc.decideCampaignAdoption).mock.calls[0]![0].choice).toBe('keep-local');
});
it('ausente só oferece manter legado ou descarte, e presente não oferece descarte ausente', async () => {
  dialog();
  await begin();
  await userEvent.click(screen.getByRole('combobox', { name: 'Decisão para Guardiã da mesa' }));
  expect(screen.getByRole('option', { name: 'Manter legado da mesa' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Descartar ficha ausente' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Usar ficha da candidata' })).not.toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  await chooseDropdown(
    userEvent,
    screen.getByRole('combobox', { name: 'Decisão para Guardiã da mesa' }),
    'Descartar ficha ausente',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Voltar à revisão' }));
  expect(rpc.decideCampaignAdoption).not.toHaveBeenCalled();
});
it('start desconhecido é repetido exatamente após reload e não usa GET como confirmação', async () => {
  await store.reserveAdoption(start, () => {});
  const h = await hook();
  expect(rpc.getCampaignAdoption).not.toHaveBeenCalled();
  vi.mocked(rpc.startCampaignAdoption).mockRejectedValueOnce(new Error('Resposta perdida'));
  await act(() => h.result.current.recover());
  expect(store.readAdoptionControl(uid, campaignId)).toEqual(start);
  h.unmount();
  const restored = await hook();
  await act(() => restored.result.current.recover());
  expect(rpc.startCampaignAdoption).toHaveBeenNthCalledWith(1, start.input);
  expect(rpc.startCampaignAdoption).toHaveBeenNthCalledWith(2, start.input);
  expect(rpc.prepareCampaignAdoption).not.toHaveBeenCalled();
});
it('cancel-start preservado repete só resolver e conhecido não aplica preparação', async () => {
  await store.reserveAdoption({ ...start, phase: 'cancel-start' }, () => {});
  const h = await hook();
  await act(() => h.result.current.recover());
  expect(rpc.resolveCampaignAdoptionStart).toHaveBeenCalledOnce();
  expect(rpc.startCampaignAdoption).not.toHaveBeenCalled();
  expect(store.listAdoptionControls(uid).items).toEqual([]);
  await store.rememberAdoption(progress, () => {});
  h.unmount();
  const known = await hook();
  await waitFor(() => expect(known.result.current.progress).not.toBeNull());
  expect(rpc.prepareCampaignAdoption).not.toHaveBeenCalled();
});
it('reauthorization-required confirma pedido e exige novo avanço explícito sem ativar', async () => {
  await store.rememberAdoption(
    { ...progress, state: 'ready', phase: 'complete', checkpoint: 2 },
    () => {},
  );
  job = { ...progress, state: 'ready', phase: 'complete', checkpoint: 2 };
  const h = await hook({ ...options(), isOpen: () => true });
  await waitFor(() => expect(h.result.current.progress?.state).toBe('ready'));
  vi.mocked(rpc.activateCampaignAdoption).mockImplementationOnce((input) =>
    Promise.resolve().then(() => {
      job = { ...job, state: 'preparing', phase: 'authorization', checkpoint: 3 };
      return result(input, 'activate', 'reauthorization-required');
    }),
  );
  await act(() => h.result.current.execute('activate'));
  expect(h.result.current.progress?.phase).toBe('authorization');
  expect(h.result.current.control?.scope.kind).toBe('known');
  expect(rpc.advanceCampaignAdoption).not.toHaveBeenCalled();
  expect(rpc.activateCampaignAdoption).toHaveBeenCalledOnce();
  await act(() => h.result.current.execute('advance'));
  expect(h.result.current.progress?.state).toBe('ready');
  expect(rpc.activateCampaignAdoption).toHaveBeenCalledOnce();
});
it('recibo com escolha errada preserva o pedido e não aceita dados de outra identidade', async () => {
  await store.rememberAdoption(progress, () => {});
  const h = await hook();
  await waitFor(() => expect(h.result.current.progress).not.toBeNull());
  vi.mocked(rpc.decideCampaignAdoption).mockImplementationOnce((input) =>
    Promise.resolve().then(() => ({
      ...result(input, 'decide'),
      receipt: {
        ...result(input, 'decide').receipt,
        confirmedCheckpoint: 1,
        sourceKey: row.sourceKey,
        expectedRevision: row.revision,
        choice: 'discard-local',
      },
      progress: { ...job, checkpoint: 1 },
    })),
  );
  await act(() =>
    h.result.current.execute('decide', {
      sourceKey: row.sourceKey,
      expectedRevision: 3,
      choice: 'keep-local',
    }),
  );
  expect(h.result.current.error).toMatch(/escolha/i);
  expect(store.readAdoptionControl(uid, campaignId, adoptionId)?.scope.kind).toBe('job');
  expect(h.result.current.progress?.checkpoint).toBe(0);
});
it('fechar durante preparo confirma só pedido em voo e não segue nem reabre modal', async () => {
  const gate = deferred<AdoptionMutationResult>();
  vi.mocked(rpc.prepareCampaignAdoption).mockReturnValueOnce(gate.promise);
  await store.rememberAdoption(progress, () => {});
  vi.mocked(rpc.listCampaignAdoptions).mockResolvedValue({ items: [progress], nextCursor: null });
  render(<CampaignAdoptionPreparations />);
  await userEvent.click(await screen.findByRole('button', { name: /Atualização tion-one/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Preparar atualização' }));
  await userEvent.click(screen.getByRole('button', { name: 'Fechar atualização' }));
  const input = vi.mocked(rpc.prepareCampaignAdoption).mock.calls[0]![0];
  await act(async () => {
    job = { ...progress, state: 'preparing', phase: 'operations', checkpoint: 1 };
    gate.resolve(result(input, 'prepare'));
    await gate.promise;
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(rpc.advanceCampaignAdoption).not.toHaveBeenCalled();
  expect(store.readAdoptionControl(uid, campaignId, adoptionId)?.scope.kind).toBe('known');
});
it('última limpeza incerta aparece globalmente sem root ou item remoto', async () => {
  const pending = { ...step, method: 'cancel' as const };
  await store.reserveAdoption(pending, () => {});
  job = {
    ...progress,
    state: 'deleted',
    phase: 'cleanup',
    cleanupComplete: true,
    sourceAvailable: false,
    processed: null,
    checkpoint: 1,
  };
  vi.mocked(rpc.cancelCampaignAdoption).mockResolvedValue(result(pending.input, 'cancel'));
  render(<CampaignAdoptionPreparations />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Confirmar pedido de atualização 1' }),
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Confirmar pedido de adoção' }));
  expect(
    await screen.findByText(
      'Preparação cancelada. A candidata e a base anterior foram preservadas.',
    ),
  ).toBeInTheDocument();
  expect(store.listAdoptionControls(uid).items).toEqual([]);
});
it('UID tardio não aplica resultado nem limpa journal da conta anterior', async () => {
  const gate = deferred<AdoptionMutationResult>();
  await store.reserveAdoption(step, () => {});
  let active = true;
  const h = await hook({ ...options(), isActive: () => active });
  vi.mocked(rpc.prepareCampaignAdoption).mockReturnValueOnce(gate.promise);
  let running!: Promise<void>;
  act(() => {
    running = h.result.current.recover();
  });
  await waitFor(() => expect(rpc.prepareCampaignAdoption).toHaveBeenCalledOnce());
  active = false;
  await act(async () => {
    gate.resolve({
      ...result(step.input, 'prepare'),
      progress: { ...progress, state: 'preparing', phase: 'operations', checkpoint: 1 },
      receipt: { ...result(step.input, 'prepare').receipt, confirmedCheckpoint: 1 },
    });
    await running;
  });
  expect(store.readAdoptionControl(uid, campaignId, adoptionId)).toEqual(step);
  expect(rpc.advanceCampaignAdoption).not.toHaveBeenCalled();
});
function page(
  items: AdoptionDecision[] = rows,
  nextCursor: string | null = null,
  patch: Partial<Awaited<ReturnType<typeof rpc.listCampaignAdoptionDecisions>>> = {},
): Awaited<ReturnType<typeof rpc.listCampaignAdoptionDecisions>> {
  return {
    ...identityOf(job),
    currentCapturedAt: 1000,
    candidateCapturedAt: 2000,
    checkpoint: job.checkpoint,
    projectionToken: 'f'.repeat(64),
    items: structuredClone(items),
    nextCursor,
    ...patch,
  };
}
it('execução explícita percorre etapas limitadas e pausa depois da etapa em voo sem adotar', async () => {
  const gate = deferred<AdoptionMutationResult>();
  dialog();
  await begin();
  vi.mocked(rpc.advanceCampaignAdoption).mockReturnValueOnce(gate.promise);
  await userEvent.click(screen.getByRole('button', { name: 'Preparar atualização' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Pausar após esta etapa' }));
  const input = vi.mocked(rpc.advanceCampaignAdoption).mock.calls[0]![0];
  await act(async () => {
    job = {
      ...job,
      state: 'preparing',
      phase: 'overlays',
      checkpoint: input.expectedCheckpoint + 1,
    };
    gate.resolve(result(input, 'advance'));
    await gate.promise;
  });
  expect(
    await screen.findByRole('button', { name: 'Continuar preparação da atualização' }),
  ).toBeEnabled();
  expect(rpc.advanceCampaignAdoption).toHaveBeenCalledOnce();
  expect(rpc.activateCampaignAdoption).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Continuar preparação da atualização' }),
  );
  expect(await screen.findByRole('button', { name: 'Adotar esta base' })).toBeEnabled();
  expect(rpc.advanceCampaignAdoption).toHaveBeenCalledTimes(2);
  expect(rpc.activateCampaignAdoption).not.toHaveBeenCalled();
});
it('paginação vazia progride e própria decisão conserva a janela seguinte', async () => {
  vi.mocked(rpc.listCampaignAdoptionDecisions).mockImplementation((input) =>
    Promise.resolve(
      !input.cursor
        ? page([], 'second')
        : input.cursor === 'second'
          ? page([rows[0]!], 'third')
          : page([rows[1]!]),
    ),
  );
  dialog();
  await begin();
  await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais decisões' }));
  await chooseDropdown(
    userEvent,
    screen.getByRole('combobox', { name: 'Decisão para Guardiã da mesa' }),
    'Manter legado da mesa',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar escolha' }));
  await waitFor(() => expect(rpc.decideCampaignAdoption).toHaveBeenCalledOnce());
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais decisões' }));
  expect(
    await screen.findByRole('combobox', { name: 'Decisão para Local da mesa' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('combobox', { name: 'Decisão para Guardiã da mesa' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Rever decisões' })).not.toBeInTheDocument();
});
it.each(['projectionToken', 'currentCapturedAt', 'checkpoint'] as const)(
  'próxima página com novo %s invalida nomes e libera loading para revisão explícita',
  async (field) => {
    vi.mocked(rpc.listCampaignAdoptionDecisions).mockImplementation((input) =>
      Promise.resolve(
        input.cursor
          ? page([], null, {
              [field]:
                field === 'projectionToken'
                  ? '9'.repeat(64)
                  : field === 'checkpoint'
                    ? job.checkpoint + 1
                    : 3000,
            })
          : page([rows[0]!], 'next'),
      ),
    );
    dialog();
    await begin();
    await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais decisões' }));
    expect(await screen.findByRole('button', { name: 'Rever decisões' })).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Decisão para Guardiã da mesa' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Conferindo decisões autorizadas...')).not.toBeInTheDocument();
  },
);
it('conflito definitivo aceita controle atual só após escolha e sem preparar automaticamente', async () => {
  await store.reserveAdoption(step, () => {});
  const h = await hook();
  vi.mocked(rpc.prepareCampaignAdoption).mockRejectedValueOnce(
    Object.assign(new Error('Checkpoint mudou'), { details: { reason: 'checkpoint-conflict' } }),
  );
  await act(() => h.result.current.recover());
  expect(h.result.current.conflict).toBe(true);
  job = { ...progress, checkpoint: 2 };
  await act(() => h.result.current.resolveConflict());
  expect(h.result.current.control).toEqual(store.knownAdoption(job));
  expect(h.result.current.progress?.checkpoint).toBe(2);
  expect(rpc.prepareCampaignAdoption).toHaveBeenCalledOnce();
  expect(rpc.advanceCampaignAdoption).not.toHaveBeenCalled();
});
it('confirmação própria atrasada não apaga próximo pedido reservado por outra aba', async () => {
  await store.reserveAdoption(step, () => {});
  const h = await hook(),
    original = store.finishAdoptionStep,
    third = {
      ...step,
      method: 'advance' as const,
      input: { ...step.input, operationId: 'other-tab', expectedCheckpoint: 1 },
    };
  vi.spyOn(store, 'finishAdoptionStep').mockImplementationOnce(async (...args) => {
    const value = await original(...args);
    await store.reserveAdoption(third, () => {});
    return value;
  });
  await act(() => h.result.current.recover());
  expect(h.result.current.control).toEqual(third);
  expect(h.result.current.progress).toBeNull();
  expect(rpc.advanceCampaignAdoption).not.toHaveBeenCalled();
});
it('consultar novamente após GET invalidado não espera a resposta antiga nem rebaixa checkpoint', async () => {
  await store.rememberAdoption(progress, () => {});
  const h = await hook({ ...options(), isOpen: () => true });
  await waitFor(() => expect(h.result.current.progress).not.toBeNull());
  const old = deferred<AdoptionProgress>(),
    fresh = deferred<AdoptionProgress>();
  vi.mocked(rpc.getCampaignAdoption)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(fresh.promise);
  await act(() => store.rememberAdoption({ ...progress, checkpoint: 2 }, () => {}));
  await waitFor(() => expect(rpc.getCampaignAdoption).toHaveBeenCalledTimes(2));
  await act(() => h.result.current.execute('prepare'));
  expect(h.result.current.loading).toBe(false);
  let checking!: Promise<void>;
  act(() => {
    checking = h.result.current.refresh();
  });
  await waitFor(() => expect(rpc.getCampaignAdoption).toHaveBeenCalledTimes(3));
  await act(async () => {
    fresh.resolve({ ...progress, checkpoint: 2 });
    await checking;
  });
  await act(async () => {
    old.resolve(progress);
    await old.promise;
  });
  expect(h.result.current.loading).toBe(false);
  expect(h.result.current.progress?.checkpoint).toBe(2);
  expect(rpc.prepareCampaignAdoption).not.toHaveBeenCalled();
});
it('encerramento inicial e cancelamento pedem confirmação e preservam a candidata', async () => {
  await store.reserveAdoption(start, () => {});
  const view = render(<CampaignAdoptionPreparations />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Confirmar pedido de atualização 1' }),
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Encerrar pedido inicial de adoção' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Voltar à revisão' }));
  expect(rpc.resolveCampaignAdoptionStart).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Encerrar pedido inicial de adoção' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento' }));
  expect(
    await screen.findByText('Pedido inicial encerrado. Nenhuma adoção será iniciada por ele.'),
  ).toBeInTheDocument();
  view.unmount();
  await store.rememberAdoption(progress, () => {});
  vi.mocked(rpc.listCampaignAdoptions).mockResolvedValue({ items: [progress], nextCursor: null });
  render(<CampaignAdoptionPreparations />);
  await userEvent.click(await screen.findByRole('button', { name: /Atualização tion-one/ }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Cancelar preparação da adoção' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento' }));
  expect(
    await screen.findByText(
      'Preparação cancelada. A candidata e a base anterior foram preservadas.',
    ),
  ).toBeInTheDocument();
  expect(rpc.cancelCampaignAdoption).toHaveBeenCalledOnce();
});
it('adaptação usa callback público antes do fence e não altera ficha ou escolha pelo fechamento', async () => {
  const adapt = vi.fn(),
    close = vi.fn();
  render(
    <CampaignAdoptionDialog
      selection={{ campaignId, context }}
      open
      onClose={close}
      onAdaptLore={adapt}
    />,
  );
  await begin();
  await userEvent.click(screen.getByRole('button', { name: 'Fechar e adaptar no Lore da mesa' }));
  expect(adapt).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(rpc.decideCampaignAdoption).not.toHaveBeenCalled();
  expect(rpc.prepareCampaignAdoption).not.toHaveBeenCalled();
});
it('consulta explícita substitui GET pendurado e finally antigo não libera consulta nova', async () => {
  await store.rememberAdoption(progress, () => {});
  const old = deferred<AdoptionProgress>(),
    fresh = deferred<AdoptionProgress>();
  vi.mocked(rpc.getCampaignAdoption)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(fresh.promise);
  const h = await hook();
  await waitFor(() => expect(rpc.getCampaignAdoption).toHaveBeenCalledOnce());
  let checking!: Promise<void>;
  act(() => {
    checking = h.result.current.refresh();
  });
  await waitFor(() => expect(rpc.getCampaignAdoption).toHaveBeenCalledTimes(2));
  await act(async () => {
    old.resolve(progress);
    await old.promise;
  });
  expect(h.result.current.loading).toBe(true);
  expect(h.result.current.progress).toBeNull();
  await act(async () => {
    fresh.resolve({ ...progress, checkpoint: 2 });
    await checking;
  });
  expect(h.result.current.loading).toBe(false);
  expect(h.result.current.progress?.checkpoint).toBe(2);
  expect(rpc.prepareCampaignAdoption).not.toHaveBeenCalled();
});
it.each(['start', 'step', 'cancel-start'] as const)(
  'slot alterado depois da reserva %s impede RPC vencido',
  async (kind) => {
    if (kind === 'start') {
      const h = await hook({ ...options(), selection: { campaignId, context } });
      const original = store.reserveAdoption;
      vi.spyOn(store, 'reserveAdoption').mockImplementationOnce(async (op, check) => {
        await original(op, check);
        if (!('phase' in op)) throw new Error('expected start');
        await store.finishAdoptionStart(
          op,
          { ...progress, adoptionId: op.input.operationId, checkpoint: 2 },
          check,
        );
      });
      await act(() => h.result.current.start(context));
      expect(rpc.startCampaignAdoption).not.toHaveBeenCalled();
    } else if (kind === 'step') {
      await store.rememberAdoption(progress, () => {});
      const h = await hook();
      await waitFor(() => expect(h.result.current.progress).not.toBeNull());
      const original = store.reserveAdoption;
      vi.spyOn(store, 'reserveAdoption').mockImplementationOnce(async (op, check) => {
        await original(op, check);
        if (!('method' in op)) throw new Error('expected step');
        await store.finishAdoptionStep(op, { ...progress, checkpoint: 2 }, check);
      });
      await act(() => h.result.current.execute('prepare'));
      expect(rpc.prepareCampaignAdoption).not.toHaveBeenCalled();
      expect(store.readAdoptionControl(uid, campaignId, adoptionId)).toEqual(
        store.knownAdoption({ ...progress, checkpoint: 2 }),
      );
    } else {
      await store.reserveAdoption(start, () => {});
      const h = await hook(),
        original = store.changeAdoptionStart;
      vi.spyOn(store, 'changeAdoptionStart').mockImplementationOnce(async (op, check) => {
        const next = await original(op, check);
        await store.finishAdoptionStart(next, { ...progress, checkpoint: 2 }, check);
        return next;
      });
      await act(() => h.result.current.cancelStart());
      expect(rpc.resolveCampaignAdoptionStart).not.toHaveBeenCalled();
      expect(store.readAdoptionControl(uid, campaignId, adoptionId)).toEqual(
        store.knownAdoption({ ...progress, checkpoint: 2 }),
      );
    }
  },
);
it('ativação abortada duravelmente confirma pedido e preserva base anterior sem anunciar adoção', async () => {
  job = { ...progress, state: 'ready', phase: 'complete', checkpoint: 2 };
  await store.rememberAdoption(job, () => {});
  const onAdopted = vi.fn();
  const h = await hook({ ...options(), onAdopted });
  await waitFor(() => expect(h.result.current.progress?.state).toBe('ready'));
  vi.mocked(rpc.activateCampaignAdoption).mockImplementationOnce((input) =>
    Promise.resolve({
      receipt: {
        operationId: input.operationId,
        action: 'activate',
        expectedCheckpoint: input.expectedCheckpoint,
        confirmedCheckpoint: 3,
        outcome: 'confirmed',
      },
      progress: {
        ...job,
        state: 'aborted',
        phase: 'complete',
        checkpoint: 3,
        sourceAvailable: false,
        processed: null,
        reason: 'source-unavailable',
      },
    }),
  );
  await act(() => h.result.current.execute('activate'));
  expect(h.result.current.progress?.state).toBe('aborted');
  expect(h.result.current.control?.scope.kind).toBe('known');
  expect(h.result.current.error).toBe('');
  expect(onAdopted).not.toHaveBeenCalled();
  expect(rpc.advanceCampaignAdoption).not.toHaveBeenCalled();
});
it('checkpoint externo exige rever decisões antes de preparar escolhas de outra aba', async () => {
  await store.rememberAdoption(progress, () => {});
  render(
    <CampaignAdoptionDialog
      selection={{ campaignId, adoptionId, expected: identity }}
      open
      onClose={vi.fn()}
    />,
  );
  const prepare = await screen.findByRole('button', { name: 'Preparar atualização' });
  await waitFor(() => expect(prepare).toBeEnabled());
  job = { ...job, checkpoint: 2 };
  await userEvent.click(screen.getByRole('button', { name: 'Consultar progresso da adoção' }));
  await screen.findByRole('button', { name: 'Rever decisões' });
  expect(prepare).toBeDisabled();
  await userEvent.click(prepare);
  expect(rpc.prepareCampaignAdoption).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Rever decisões' }));
  await waitFor(() => expect(prepare).toBeEnabled());
  expect(rpc.prepareCampaignAdoption).not.toHaveBeenCalled();
});
it.each(['recover', 'cancelStart', 'resolveConflict'] as const)(
  'clique %s de A não adota pedido B trocado antes do handler',
  async (action) => {
    if (action === 'resolveConflict') await store.reserveAdoption(step, () => {});
    else await store.reserveAdoption(start, () => {});
    const h = await hook();
    if (action === 'resolveConflict') {
      vi.mocked(rpc.prepareCampaignAdoption).mockRejectedValueOnce(
        Object.assign(new Error('Checkpoint mudou'), {
          details: { reason: 'checkpoint-conflict' },
        }),
      );
      await act(() => h.result.current.recover());
      expect(h.result.current.conflict).toBe(true);
    }
    const a = action === 'resolveConflict' ? step : start,
      b = {
        ...a,
        input: { ...a.input, operationId: 'operation-B' },
        ...('phase' in a ? { expected: { ...a.expected, adoptionId: 'operation-B' } } : {}),
      };
    const key =
      'writer:campaign-adoption:' +
      JSON.stringify([
        uid,
        campaignId,
        action === 'resolveConflict' ? 'job:' + adoptionId : 'start',
      ]);
    localStorage.setItem(key, JSON.stringify(b));
    const gets = vi.mocked(rpc.getCampaignAdoption).mock.calls.length;
    await act(() => h.result.current[action]());
    expect(rpc.startCampaignAdoption).not.toHaveBeenCalled();
    expect(rpc.resolveCampaignAdoptionStart).not.toHaveBeenCalled();
    expect(rpc.getCampaignAdoption).toHaveBeenCalledTimes(gets);
    expect(
      store.readAdoptionControl(
        uid,
        campaignId,
        action === 'resolveConflict' ? adoptionId : undefined,
      ),
    ).toEqual(b);
    expect(h.result.current.error).toMatch(/outra aba/);
  },
);
it('Estúdio privado pagina atualizações sem duplicar, conserva lista no erro e retoma após nova consulta', async () => {
  const second = { ...progress, adoptionId: 'second-adoption' };
  vi.mocked(rpc.listCampaignAdoptions)
    .mockResolvedValueOnce({ items: [], nextCursor: 'first' })
    .mockResolvedValueOnce({ items: [progress], nextCursor: 'second' })
    .mockResolvedValueOnce({ items: [progress, second], nextCursor: 'third' })
    .mockRejectedValueOnce(new Error('Rede temporária'))
    .mockResolvedValueOnce({ items: [second], nextCursor: null })
    .mockResolvedValue({ items: [second], nextCursor: null });
  render(<CampaignAdoptionPreparations campaignId={campaignId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais atualizações' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais atualizações' }));
  expect(screen.getAllByRole('button', { name: /Atualização tion-one/ })).toHaveLength(1);
  expect(screen.getByRole('button', { name: /Atualização adoption/ })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais atualizações' }));
  expect(await screen.findByText('Rede temporária')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Atualização tion-one/ })).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Tentar listar atualizações novamente' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /Atualização tion-one/ })).not.toBeInTheDocument(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Consultar atualizações' }));
  expect(rpc.listCampaignAdoptions).toHaveBeenLastCalledWith({ campaignId, limit: 25 });
});
it('lista tardia de outro UID não reaparece e sessão nova continua lendo seus controles', async () => {
  const gate = deferred<Awaited<ReturnType<typeof rpc.listCampaignAdoptions>>>();
  vi.mocked(rpc.listCampaignAdoptions)
    .mockReturnValueOnce(gate.promise)
    .mockResolvedValue({ items: [], nextCursor: null });
  const view = render(<CampaignAdoptionPreparations />);
  await waitFor(() => expect(rpc.listCampaignAdoptions).toHaveBeenCalledOnce());
  auth.user = { uid: 'new-owner' };
  view.rerender(<CampaignAdoptionPreparations />);
  await act(async () => {
    gate.resolve({ items: [progress], nextCursor: null });
    await gate.promise;
  });
  expect(screen.queryByRole('button', { name: /Atualização tion-one/ })).not.toBeInTheDocument();
});
