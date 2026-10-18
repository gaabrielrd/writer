import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseDropdown } from '@/test/dropdown';
import { CampaignComparisonPanel } from '../components/CampaignComparisonPanel';
import { CampaignComparisonPreparations } from '../components/CampaignComparisonPreparations';
import { ComparisonReader } from '../components/ComparisonReader';
import { useComparisonOperation } from '../hooks/useComparisonOperation';
import * as transport from '../services/campaignComparisonCallables';
import * as store from '../services/campaignComparisonRecovery';
import type {
  ComparisonMutationResult,
  ComparisonProgress,
  ComparisonSource,
  ComparisonChange,
} from '../model/campaignComparison';
import {
  uid,
  campaignId,
  comparisonId,
  currentBaseId,
  identity,
  source,
  envelope,
  progress,
  startPending,
  stepPending,
  sceneKey,
  loreKey,
  imageKey,
  referenceKey,
  rootKey,
  sceneSummary,
  loreSummary,
  deferred,
  installBrowser,
  sha,
} from './fixtures';
const auth = vi.hoisted(() => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/campaignComparisonCallables', () => ({
  getCampaignComparisonSource: vi.fn(),
  startCampaignComparison: vi.fn(),
  resolveCampaignComparisonStart: vi.fn(),
  getCampaignComparison: vi.fn(),
  listCampaignComparisons: vi.fn(),
  advanceCampaignComparison: vi.fn(),
  cancelCampaignComparison: vi.fn(),
  listCampaignComparisonChanges: vi.fn(),
  readCampaignComparisonItem: vi.fn(),
  readCampaignComparisonImage: vi.fn(),
}));
let browser: ReturnType<typeof installBrowser>, job: ComparisonProgress | null;
const sources: ComparisonChange = {
  group: 'source',
  key: rootKey,
  change: 'changed',
  currentSummary: { title: 'Aventura anterior', synopsis: 'Sinopse anterior', language: 'pt-BR' },
  candidateSummary: {
    title: 'Aventura candidata',
    synopsis: 'Sinopse candidata',
    language: 'pt-BR',
  },
};
const scene: ComparisonChange = {
  group: 'items',
  key: sceneKey,
  change: 'changed',
  currentSummary: sceneSummary,
  candidateSummary: { ...sceneSummary, title: 'Cena candidata' },
  orderContextChanged: true,
};
const lore: ComparisonChange = {
  group: 'items',
  key: loreKey,
  change: 'changed',
  currentSummary: loreSummary,
  candidateSummary: loreSummary,
  orderContextChanged: false,
  local: { mode: 'override', revision: 2 },
  requiresReview: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { uid };
  browser = installBrowser();
  job = null;
  vi.mocked(transport.getCampaignComparisonSource).mockResolvedValue(source);
  vi.mocked(transport.getCampaignComparison).mockImplementation(() =>
    Promise.resolve(job ?? progress),
  );
  vi.mocked(transport.listCampaignComparisons).mockImplementation(() =>
    Promise.resolve({ items: job && job.state !== 'deleted' ? [job] : [], nextCursor: null }),
  );
  vi.mocked(transport.startCampaignComparison).mockImplementation((input) => {
    job = {
      ...progress,
      comparisonId: input.operationId,
      state: 'preparing',
      phase: 'parts',
      checkpoint: 0,
      processed: 0,
    };
    return Promise.resolve({
      receipt: {
        operationId: input.operationId,
        action: 'start',
        expectedCheckpoint: null,
        confirmedCheckpoint: 0,
      },
      progress: job,
    });
  });
  vi.mocked(transport.advanceCampaignComparison).mockImplementation((input) => {
    const checkpoint = input.expectedCheckpoint + 1;
    job = {
      ...(job ?? progress),
      comparisonId: input.comparisonId,
      checkpoint,
      state: checkpoint >= 3 ? 'ready' : 'preparing',
      phase: checkpoint >= 3 ? 'complete' : 'scenes',
      processed: checkpoint,
    };
    return Promise.resolve({
      receipt: {
        operationId: input.operationId,
        action: 'advance',
        expectedCheckpoint: input.expectedCheckpoint,
        confirmedCheckpoint: checkpoint,
      },
      progress: job,
    });
  });
  vi.mocked(transport.cancelCampaignComparison).mockImplementation((input) => {
    const checkpoint = input.expectedCheckpoint + 1;
    job = {
      ...(job ?? progress),
      checkpoint,
      state: checkpoint >= 5 ? 'deleted' : 'deleting',
      phase: 'cleanup',
      cleanupComplete: checkpoint >= 5,
    };
    return Promise.resolve({
      receipt: {
        operationId: input.operationId,
        action: 'cancel',
        expectedCheckpoint: input.expectedCheckpoint,
        confirmedCheckpoint: checkpoint,
      },
      progress: job,
    });
  });
  vi.mocked(transport.resolveCampaignComparisonStart).mockImplementation((input) =>
    Promise.resolve({
      kind: 'canceled',
      schemaVersion: 1,
      ownerId: uid,
      request: {
        operationId: input.operationId,
        campaignId: input.campaignId,
        campaignToken: input.campaignToken,
        currentBaseId: input.currentBaseId,
        expectedSourceToken: input.expectedSourceToken,
      },
    }),
  );
  vi.mocked(transport.listCampaignComparisonChanges).mockImplementation((input) => {
    let rows: ComparisonChange[] =
      input.group === 'source'
        ? [sources]
        : input.group === 'items'
          ? [scene, lore]
          : input.group === 'references'
            ? [
                {
                  group: 'references',
                  key: referenceKey,
                  change: 'changed',
                  currentSummary: {
                    key: referenceKey,
                    kind: 'scene',
                    sourceKey: sceneKey,
                    targetKey: null,
                    available: false,
                  },
                  candidateSummary: {
                    key: referenceKey,
                    kind: 'scene',
                    sourceKey: sceneKey,
                    targetKey: loreKey,
                    available: true,
                  },
                },
              ]
            : [
                {
                  group: 'images',
                  key: imageKey,
                  change: 'unchanged',
                  currentSummary: { imageKey, preview: 'unchecked' },
                  candidateSummary: { imageKey, preview: 'unchecked' },
                },
              ];
    if (input.kind)
      rows = rows.filter(
        (row) =>
          row.group === 'items' &&
          (row.currentSummary ?? row.candidateSummary)?.kind === input.kind,
      );
    if (input.change) rows = rows.filter((row) => row.change === input.change);
    return Promise.resolve({
      ...envelope,
      comparisonId: input.comparisonId,
      items: rows,
      nextCursor: null,
    });
  });
  vi.mocked(transport.readCampaignComparisonItem).mockImplementation(async (input) => {
    const text = '<p>Texto ' + input.side + ' 🐉</p>',
      field = input.sourceKey === sceneKey ? 'content' : 'details';
    return {
      ...envelope,
      comparisonId: input.comparisonId,
      side: input.side,
      key: input.sourceKey,
      item: {
        sourceKey: input.sourceKey,
        kind: input.sourceKey === sceneKey ? 'scene' : 'lore',
        parentKey: null,
        title: input.sourceKey === sceneKey ? 'Cena congelada' : 'Guardiã congelada',
        archived: false,
        orderKey: '001',
        fields: [
          {
            field,
            bytes: new TextEncoder().encode(text).byteLength,
            sha256: await sha(text),
            chunkCount: 1,
          },
        ],
        structured:
          input.sourceKey === sceneKey
            ? {}
            : {
                aliases: ['Outra guardiã'],
                category: 'character',
                relations: [
                  {
                    targetKey: '6'.repeat(64),
                    title: 'Ficha vinculada congelada',
                    relationType: 'Aliada',
                    description: 'Relação congelada',
                  },
                ],
              },
        image: null,
      },
      chunks: [{ field, index: 0, content: text }],
      nextCursor: null,
    };
  });
  vi.mocked(transport.readCampaignComparisonImage).mockImplementation((input) =>
    Promise.resolve({
      ...envelope,
      comparisonId: input.comparisonId,
      side: input.side,
      key: input.imageKey,
      dataUrl: 'data:image/webp;base64,UklGRg==',
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function options() {
  return {
    uid,
    campaignId,
    comparisonId,
    expected: identity,
    isActive: () => true,
    isOpen: () => false,
  };
}
async function hook(custom = options()) {
  const h = renderHook(() => useComparisonOperation(custom));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  return h;
}
it('prepara captura completa com IDs novos só após recibos e nunca altera a base atual', async () => {
  render(<CampaignComparisonPanel campaignId={campaignId} currentBaseId={currentBaseId} />);
  await userEvent.click(screen.getByRole('button', { name: 'Preparar nova candidata' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Iniciar preparação da candidata' }),
  );
  expect(await screen.findByRole('heading', { name: 'Pronta para comparar' })).toBeInTheDocument();
  expect(transport.startCampaignComparison).toHaveBeenCalledOnce();
  expect(transport.advanceCampaignComparison).toHaveBeenCalledTimes(3);
  const calls = vi.mocked(transport.advanceCampaignComparison).mock.calls.map(([input]) => input);
  expect(calls.map((input) => input.expectedCheckpoint)).toEqual([0, 1, 2]);
  expect(new Set(calls.map((input) => input.operationId)).size).toBe(3);
  await userEvent.click(screen.getByRole('button', { name: 'Comparar candidata' }));
  expect(await screen.findByText('Sinopse candidata')).toBeInTheDocument();
  expect(screen.getByText('Sinopse anterior')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Adotar/ })).not.toBeInTheDocument();
  expect(store.listComparisonControls(uid).items[0]?.scope.kind).toBe('known');
});
it('pedido inicial perdido repete o mesmo payload após reload, sem usar uma linha remota como confirmação', async () => {
  await store.reserveComparison(startPending, () => {});
  const h = await hook();
  expect(transport.getCampaignComparison).not.toHaveBeenCalled();
  vi.mocked(transport.startCampaignComparison).mockRejectedValueOnce(new Error('Resposta perdida'));
  await act(() => h.result.current.recover());
  expect(store.readComparisonControl(uid, campaignId)).toEqual(startPending);
  h.unmount();
  const reloaded = await hook();
  await act(() => reloaded.result.current.recover());
  expect(transport.startCampaignComparison).toHaveBeenNthCalledWith(1, startPending.input);
  expect(transport.startCampaignComparison).toHaveBeenNthCalledWith(2, startPending.input);
  expect(store.readComparisonControl(uid, campaignId)).toBeNull();
  expect(store.readComparisonControl(uid, campaignId, comparisonId)?.scope.kind).toBe('known');
});
it('fase cancel-start é preservada antes da rede e reload repete somente o fence', async () => {
  await store.reserveComparison(startPending, () => {});
  const h = await hook();
  vi.mocked(transport.resolveCampaignComparisonStart).mockRejectedValueOnce(
    new Error('Sem confirmação'),
  );
  await act(() => h.result.current.cancelStart());
  expect((store.readComparisonControl(uid, campaignId) as typeof startPending).phase).toBe(
    'cancel-start',
  );
  h.unmount();
  const reloaded = await hook();
  await act(() => reloaded.result.current.recover());
  expect(transport.startCampaignComparison).not.toHaveBeenCalled();
  expect(transport.resolveCampaignComparisonStart).toHaveBeenCalledTimes(2);
  expect(store.listComparisonControls(uid).items).toEqual([]);
});
it('resolver start conhecido migra controle sem cancelar nem avançar implicitamente', async () => {
  await store.reserveComparison(startPending, () => {});
  const h = await hook();
  vi.mocked(transport.resolveCampaignComparisonStart).mockResolvedValue({
    kind: 'confirmed',
    receipt: {
      operationId: comparisonId,
      action: 'start',
      expectedCheckpoint: null,
      confirmedCheckpoint: 0,
    },
    progress,
  });
  await act(() => h.result.current.cancelStart());
  expect(h.result.current.progress).toEqual(progress);
  expect(h.result.current.control?.scope.kind).toBe('known');
  expect(transport.advanceCampaignComparison).not.toHaveBeenCalled();
  expect(transport.cancelCampaignComparison).not.toHaveBeenCalled();
});
it('StartCanceled no startRPC confirma fence existente sem criar candidata', async () => {
  await store.reserveComparison(startPending, () => {});
  const h = await hook();
  vi.mocked(transport.startCampaignComparison).mockResolvedValue({
    kind: 'canceled',
    schemaVersion: 1,
    ownerId: uid,
    request: startPending.input,
  });
  await act(() => h.result.current.recover());
  expect(h.result.current.control).toBeNull();
  expect(transport.advanceCampaignComparison).not.toHaveBeenCalled();
});
it('recibo de outro pedido mantém journal exato e não adota progresso', async () => {
  await store.reserveComparison(stepPending, () => {});
  const h = await hook();
  vi.mocked(transport.advanceCampaignComparison).mockResolvedValue({
    receipt: {
      operationId: 'wrong',
      action: 'advance',
      expectedCheckpoint: 1,
      confirmedCheckpoint: 2,
    },
    progress,
  });
  await act(() => h.result.current.recover());
  expect(store.readComparisonControl(uid, campaignId, comparisonId)).toEqual(stepPending);
  expect(h.result.current.error).toMatch(/recibo/);
});
it('conflito definitivo encerra tentativa só por escolha explícita e checkpoint maior da mesma identidade', async () => {
  await store.reserveComparison(stepPending, () => {});
  const h = await hook();
  vi.mocked(transport.advanceCampaignComparison).mockRejectedValue(
    Object.assign(new Error('Checkpoint vencido'), { details: { reason: 'checkpoint-conflict' } }),
  );
  await act(() => h.result.current.recover());
  expect(h.result.current.conflict).toBe(true);
  expect(store.readComparisonControl(uid, campaignId, comparisonId)).toEqual(stepPending);
  await act(() => h.result.current.resolveConflict());
  expect(h.result.current.control?.scope.kind).toBe('known');
  expect(h.result.current.progress?.checkpoint).toBe(3);
  expect(transport.advanceCampaignComparison).toHaveBeenCalledOnce();
});
it('UID muda enquanto aguarda lock e nenhuma reserva/RPC da sessão anterior acontece', async () => {
  let active = true;
  vi.mocked(transport.getCampaignComparison).mockResolvedValue({
    ...progress,
    state: 'preparing',
    phase: 'parts',
    checkpoint: 0,
  });
  const h = await hook({ ...options(), isActive: () => active, isOpen: () => true }),
    gate = deferred<void>();
  await waitFor(() => expect(h.result.current.progress?.checkpoint).toBe(0));
  browser.hold(gate.promise);
  let running!: Promise<void>;
  act(() => {
    running = h.result.current.continuePreparation();
  });
  await waitFor(() => expect(browser.request).toHaveBeenCalledOnce());
  active = false;
  gate.resolve();
  browser.release();
  await act(() => running);
  expect(transport.advanceCampaignComparison).not.toHaveBeenCalled();
  expect(store.listComparisonControls(uid).items).toEqual([]);
});
it('último descarte sem resposta reaparece no Estúdio mesmo sem campanha ou controle na lista remota', async () => {
  const entry = {
    ...stepPending,
    method: 'cancel' as const,
    input: { ...stepPending.input, expectedCheckpoint: 4 },
  };
  await store.reserveComparison(entry, () => {});
  vi.mocked(transport.getCampaignComparison).mockResolvedValue({
    ...progress,
    state: 'deleted',
    phase: 'cleanup',
    cleanupComplete: true,
    checkpoint: 5,
    sourceAvailable: false,
    processed: null,
    counts: null,
  });
  const finished = {
    receipt: {
      operationId: entry.input.operationId,
      action: 'cancel' as const,
      expectedCheckpoint: 4,
      confirmedCheckpoint: 5,
    },
    progress: {
      ...progress,
      state: 'deleted' as const,
      phase: 'cleanup' as const,
      cleanupComplete: true,
      checkpoint: 5,
      sourceAvailable: false,
      processed: null,
      counts: null,
    },
  };
  vi.mocked(transport.cancelCampaignComparison).mockResolvedValue(finished);
  render(<CampaignComparisonPreparations />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Confirmar pedido de candidata 1' }),
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Confirmar pedido da candidata' }),
  );
  expect(
    await screen.findByText('O descarte e a liberação dos usos desta candidata foram confirmados.'),
  ).toBeInTheDocument();
  expect(store.listComparisonControls(uid).items).toEqual([]);
  expect(transport.cancelCampaignComparison).toHaveBeenCalledWith(entry.input);
});
it('fechar durante start não reabre diálogo nem dispara passos seguintes', async () => {
  const gate = deferred<ComparisonMutationResult>();
  vi.mocked(transport.startCampaignComparison).mockReturnValueOnce(gate.promise);
  render(<CampaignComparisonPanel campaignId={campaignId} currentBaseId={currentBaseId} />);
  await userEvent.click(screen.getByRole('button', { name: 'Preparar nova candidata' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Iniciar preparação da candidata' }),
  );
  await waitFor(() => expect(transport.startCampaignComparison).toHaveBeenCalledOnce());
  await userEvent.keyboard('{Escape}');
  const input = vi.mocked(transport.startCampaignComparison).mock.calls[0]![0];
  await act(async () => {
    gate.resolve({
      receipt: {
        operationId: input.operationId,
        action: 'start',
        expectedCheckpoint: null,
        confirmedCheckpoint: 0,
      },
      progress: {
        ...progress,
        comparisonId: input.operationId,
        state: 'preparing',
        phase: 'parts',
        checkpoint: 0,
      },
    });
    await gate.promise;
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(transport.advanceCampaignComparison).not.toHaveBeenCalled();
  expect(store.listComparisonControls(uid).items[0]?.scope.kind).toBe('known');
});
it('comparador cobre quatro grupos, tipo/mudança, detalhes textuais, vínculos congelados e mídia lazy', async () => {
  const user = userEvent.setup();
  render(<ComparisonReader identity={identity} isActive={() => true} />);
  expect(await screen.findByText('Sinopse candidata')).toBeInTheDocument();
  expect(transport.readCampaignComparisonItem).not.toHaveBeenCalled();
  expect(transport.readCampaignComparisonImage).not.toHaveBeenCalled();
  await chooseDropdown(
    user,
    screen.getByRole('combobox', { name: 'Grupo da comparação' }),
    'Conteúdo',
  );
  await user.click(await screen.findByRole('button', { name: 'Comparar Cena congelada' }));
  expect(await screen.findByText('Texto current 🐉')).toBeInTheDocument();
  expect(await screen.findByText('Texto candidate 🐉')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Fechar detalhes' }));
  await chooseDropdown(
    user,
    screen.getByRole('combobox', { name: 'Tipo de conteúdo comparado' }),
    'Fichas de lore',
  );
  expect(await screen.findByText(/Esta ficha tem uma variante/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Comparar Guardiã congelada' }));
  expect((await screen.findAllByText('Outros nomes: Outra guardiã')).length).toBeGreaterThan(0);
  await user.click(screen.getAllByRole('button', { name: 'Ficha vinculada congelada' })[0]!);
  expect(await screen.findByRole('region', { name: 'Detalhes da comparação' })).toBeInTheDocument();
  await chooseDropdown(
    user,
    screen.getByRole('combobox', { name: 'Grupo da comparação' }),
    'Referências',
  );
  expect(await screen.findByText('Ficha referenciada indisponível')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Consultar ficha atual' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Consultar origem candidata' }));
  expect(await screen.findByText('Texto candidate 🐉')).toBeInTheDocument();
  await chooseDropdown(
    user,
    screen.getByRole('combobox', { name: 'Grupo da comparação' }),
    'Ilustrações',
  );
  expect(transport.readCampaignComparisonImage).not.toHaveBeenCalled();
  await user.click(await screen.findByRole('button', { name: 'Comparar ilustração 1' }));
  expect(await screen.findByRole('img', { name: 'Ilustração da base atual' })).toBeInTheDocument();
  expect(
    await screen.findByRole('img', { name: 'Ilustração da base candidata' }),
  ).toBeInTheDocument();
  await chooseDropdown(
    user,
    screen.getByRole('combobox', { name: 'Mudanças da comparação' }),
    'Alterada',
  );
  expect(
    await screen.findByText('Nenhuma diferença disponível para estes filtros.'),
  ).toBeInTheDocument();
  expect(vi.mocked(transport.listCampaignComparisonChanges).mock.calls.at(-1)?.[0]).toEqual({
    comparisonId,
    group: 'images',
    change: 'changed',
    limit: 25,
  });
});
it('janela vazia prossegue, mudança de token na próxima página elimina todo composto antes de aceitar detalhes antigos', async () => {
  const user = userEvent.setup();
  vi.mocked(transport.listCampaignComparisonChanges)
    .mockResolvedValueOnce({ ...envelope, items: [], nextCursor: 'next' })
    .mockResolvedValueOnce({ ...envelope, items: [sources], nextCursor: 'last' })
    .mockResolvedValueOnce({
      ...envelope,
      comparisonToken: 'f'.repeat(64),
      collectionRevision: 1,
      items: [],
      nextCursor: null,
    });
  render(<ComparisonReader identity={identity} isActive={() => true} />);
  await user.click(await screen.findByRole('button', { name: 'Carregar mais diferenças' }));
  expect(await screen.findByText('Sinopse anterior')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Carregar mais diferenças' }));
  expect(await screen.findByRole('button', { name: 'Reabrir comparação' })).toBeInTheDocument();
  expect(screen.queryByText('Sinopse anterior')).not.toBeInTheDocument();
});
it('sem reserva segura abre controles e compara readonly, sem enviar mutação', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  vi.mocked(transport.listCampaignComparisons).mockResolvedValue({
    items: [progress],
    nextCursor: null,
  });
  render(<CampaignComparisonPreparations />);
  await userEvent.click(await screen.findByRole('button', { name: /Candidata arison-1/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Comparar candidata' }));
  expect(await screen.findByText('Sinopse candidata')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Descartar candidata' })).toBeDisabled();
  expect(transport.advanceCampaignComparison).not.toHaveBeenCalled();
});
it('origem indisponível não cria pedido e resposta de outro ator não aparece após UID mudar', async () => {
  const gate = deferred<ComparisonSource | null>();
  vi.mocked(transport.getCampaignComparisonSource).mockReturnValueOnce(gate.promise);
  const view = render(
    <CampaignComparisonPanel campaignId={campaignId} currentBaseId={currentBaseId} />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Preparar nova candidata' }));
  auth.user = { uid: 'other' };
  view.rerender(<CampaignComparisonPanel campaignId={campaignId} currentBaseId={currentBaseId} />);
  await act(async () => {
    gate.resolve(source);
    await gate.promise;
  });
  expect(screen.queryByText(/base atual foi capturada/)).not.toBeInTheDocument();
  expect(transport.startCampaignComparison).not.toHaveBeenCalled();
});
it('encerramento inicial confirma escolha e fence, enquanto voltar ou Escape conserva o pedido', async () => {
  await store.reserveComparison(startPending, () => {});
  const user = userEvent.setup();
  render(<CampaignComparisonPreparations />);
  await user.click(await screen.findByRole('button', { name: 'Confirmar pedido de candidata 1' }));
  await user.click(await screen.findByRole('button', { name: 'Encerrar pedido inicial' }));
  await user.click(screen.getByRole('button', { name: 'Manter candidata' }));
  expect(transport.resolveCampaignComparisonStart).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Encerrar pedido inicial' }));
  await user.keyboard('{Escape}');
  expect(transport.resolveCampaignComparisonStart).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Encerrar pedido inicial' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar encerramento inicial' }));
  expect(
    await screen.findByText(
      'Pedido inicial encerrado. Nenhuma candidata será criada por esse pedido.',
    ),
  ).toBeInTheDocument();
  expect(store.listComparisonControls(uid).items).toEqual([]);
  expect(transport.startCampaignComparison).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Fechar candidata' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('descarte é explícito e continua limpeza sem origem, preservando base atual', async () => {
  job = { ...progress, sourceAvailable: false, processed: null, counts: null };
  const user = userEvent.setup();
  render(<CampaignComparisonPreparations />);
  await user.click(await screen.findByRole('button', { name: /Candidata arison-1/ }));
  await user.click(await screen.findByRole('button', { name: 'Descartar candidata' }));
  expect(screen.getByText(/base atual, as variantes e as notas próprias/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Manter candidata' }));
  expect(transport.cancelCampaignComparison).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Descartar candidata' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar descarte da candidata' }));
  expect(
    await screen.findByText('O descarte e a liberação dos usos desta candidata foram confirmados.'),
  ).toBeInTheDocument();
  expect(transport.cancelCampaignComparison).toHaveBeenCalledTimes(2);
  expect(identity.currentBaseId).toBe(currentBaseId);
});
it('origem null oferece conferência explícita e não envia pedido substituto', async () => {
  vi.mocked(transport.getCampaignComparisonSource).mockResolvedValueOnce(null);
  render(<CampaignComparisonPanel campaignId={campaignId} currentBaseId={currentBaseId} />);
  await userEvent.click(screen.getByRole('button', { name: 'Preparar nova candidata' }));
  expect(
    await screen.findByText('A origem não está disponível para preparar outra candidata.'),
  ).toBeInTheDocument();
  expect(transport.startCampaignComparison).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Conferir origem novamente' }));
  expect(
    await screen.findByRole('button', { name: 'Iniciar preparação da candidata' }),
  ).toBeEnabled();
});
it('item que desaparece após a lista invalida ambos os lados e não vira retirada autoral', async () => {
  const original = vi.mocked(transport.readCampaignComparisonItem).getMockImplementation()!;
  vi.mocked(transport.readCampaignComparisonItem).mockImplementation(async (input) =>
    input.side === 'candidate'
      ? {
          ...envelope,
          side: input.side,
          key: input.sourceKey,
          item: null,
          chunks: [],
          nextCursor: null,
        }
      : original(input),
  );
  render(<ComparisonReader identity={identity} isActive={() => true} />);
  await screen.findByText('Sinopse candidata');
  await chooseDropdown(
    userEvent,
    screen.getByRole('combobox', { name: 'Grupo da comparação' }),
    'Conteúdo',
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Comparar Cena congelada' }));
  expect(await screen.findByRole('button', { name: 'Reabrir comparação' })).toBeInTheDocument();
  expect(screen.queryByText('Texto current 🐉')).not.toBeInTheDocument();
  expect(screen.queryByText('Retirada')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Reabrir comparação' }));
  expect(await screen.findByText('Sinopse candidata')).toBeInTheDocument();
});
it('janela global vazia e retry de listagem não ocultam preparação posterior', async () => {
  vi.mocked(transport.listCampaignComparisons)
    .mockRejectedValueOnce(new Error('Lista sem rede'))
    .mockResolvedValueOnce({ items: [], nextCursor: 'more' })
    .mockResolvedValueOnce({ items: [progress], nextCursor: null });
  render(<CampaignComparisonPreparations />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Tentar listar candidatas novamente' }),
  );
  expect(
    await screen.findByText('Esta janela está vazia; há mais controles para consultar.'),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais candidatas' }));
  expect(await screen.findByRole('button', { name: /Candidata arison-1/ })).toBeInTheDocument();
});
it.each(['collectionRevision', 'currentCapturedAt', 'candidateCapturedAt'] as const)(
  'texto com novo %s invalida lista e ambos os detalhes antes de publicar o corpo',
  async (field) => {
    const original = vi.mocked(transport.readCampaignComparisonItem).getMockImplementation()!;
    vi.mocked(transport.readCampaignComparisonItem).mockImplementation(async (input) => ({
      ...(await original(input)),
      [field]: envelope[field] + 1,
    }));
    render(<ComparisonReader identity={identity} isActive={() => true} />);
    await screen.findByText('Sinopse candidata');
    await chooseDropdown(
      userEvent,
      screen.getByRole('combobox', { name: 'Grupo da comparação' }),
      'Conteúdo',
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Comparar Cena congelada' }));
    expect(await screen.findByRole('button', { name: 'Reabrir comparação' })).toBeInTheDocument();
    expect(screen.queryByText('Texto current 🐉')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Detalhes da comparação' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Comparar Cena congelada' }),
    ).not.toBeInTheDocument();
  },
);
it('controle local com tipo de escopo inválido fica preservado e não autoriza RPC', async () => {
  const key =
    'writer:campaign-comparison:' + JSON.stringify([uid, campaignId, 'job:' + comparisonId]);
  const raw = JSON.stringify({ ...stepPending, scope: { ...stepPending.scope, kind: 'corrupt' } });
  localStorage.setItem(key, raw);
  render(<CampaignComparisonPreparations />);
  expect(await screen.findByText(/controle local não pôde ser lido/)).toBeInTheDocument();
  expect(localStorage.getItem(key)).toBe(raw);
  expect(transport.advanceCampaignComparison).not.toHaveBeenCalled();
  expect(transport.cancelCampaignComparison).not.toHaveBeenCalled();
});
it('após criar e descartar, fechar permite iniciar uma nova preparação sem recarregar', async () => {
  render(<CampaignComparisonPanel campaignId={campaignId} currentBaseId={currentBaseId} />);
  await userEvent.click(screen.getByRole('button', { name: 'Preparar nova candidata' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Iniciar preparação da candidata' }),
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Descartar candidata' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar descarte da candidata' }));
  await screen.findByText('O descarte e a liberação dos usos desta candidata foram confirmados.');
  await userEvent.click(screen.getByRole('button', { name: 'Fechar candidata' }));
  await userEvent.click(screen.getByRole('button', { name: 'Preparar nova candidata' }));
  expect(
    await screen.findByRole('button', { name: 'Iniciar preparação da candidata' }),
  ).toBeEnabled();
  expect(transport.getCampaignComparisonSource).toHaveBeenCalledTimes(2);
  expect(transport.startCampaignComparison).toHaveBeenCalledTimes(1);
});
it('metadados do item não dependem de pedir bytes; pedir prévia revogada invalida o composto', async () => {
  const original = vi.mocked(transport.readCampaignComparisonItem).getMockImplementation()!;
  vi.mocked(transport.readCampaignComparisonItem).mockImplementation(async (input) => {
    const page = await original(input);
    return {
      ...page,
      item: page.item && {
        ...page.item,
        image: { imageKey, alt: 'Ponte ao amanhecer', caption: 'Legenda autoral preservada' },
      },
    };
  });
  vi.mocked(transport.readCampaignComparisonImage).mockRejectedValue(
    Object.assign(new Error('Arquivo indisponível'), { code: 'functions/not-found' }),
  );
  render(<ComparisonReader identity={identity} isActive={() => true} />);
  await screen.findByText('Sinopse candidata');
  await chooseDropdown(
    userEvent,
    screen.getByRole('combobox', { name: 'Grupo da comparação' }),
    'Conteúdo',
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Comparar Cena congelada' }));
  expect(await screen.findByText('Texto current 🐉')).toBeInTheDocument();
  expect(await screen.findByText('Texto candidate 🐉')).toBeInTheDocument();
  expect(screen.getAllByText('Legenda: Legenda autoral preservada')).toHaveLength(2);
  expect(screen.getAllByText('Texto alternativo: Ponte ao amanhecer')).toHaveLength(2);
  expect(transport.readCampaignComparisonImage).not.toHaveBeenCalled();
  expect(screen.getAllByRole('button', { name: 'Ver ilustração deste lado' })).toHaveLength(2);
  expect(screen.queryByRole('button', { name: 'Reabrir comparação' })).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  await userEvent.click(screen.getAllByRole('button', { name: 'Ver ilustração deste lado' })[0]!);
  expect(await screen.findByRole('button', { name: 'Reabrir comparação' })).toBeInTheDocument();
  expect(screen.queryByText('Texto current 🐉')).not.toBeInTheDocument();
  expect(screen.queryByText('Texto candidate 🐉')).not.toBeInTheDocument();
});
it.each(['start', 'step', 'conflict'] as const)(
  'confirmação de %s relê controle depois do await e não rebaixa progresso nem continua outra etapa',
  async (path) => {
    const newer = { ...progress, checkpoint: 4 };
    job = { ...progress, state: 'preparing', phase: 'scenes', checkpoint: 1 };
    await store.reserveComparison(path === 'start' ? startPending : stepPending, () => {});
    const h = await hook({ ...options(), isOpen: () => true });
    const original = path === 'start' ? store.finishComparisonStart : store.finishComparisonStep;
    if (path === 'start') {
      vi.spyOn(store, 'finishComparisonStart').mockImplementationOnce(async (...args) => {
        const result = await (original as typeof store.finishComparisonStart)(...args);
        await store.rememberComparison(newer, () => {});
        return result;
      });
    } else {
      vi.spyOn(store, 'finishComparisonStep').mockImplementationOnce(async (...args) => {
        const result = await (original as typeof store.finishComparisonStep)(...args);
        await store.rememberComparison(newer, () => {});
        return result;
      });
    }
    if (path === 'conflict') {
      vi.mocked(transport.advanceCampaignComparison).mockRejectedValueOnce(
        Object.assign(new Error('Checkpoint vencido'), {
          details: { reason: 'checkpoint-conflict' },
        }),
      );
      await act(() => h.result.current.recover());
      vi.mocked(transport.getCampaignComparison).mockResolvedValue({ ...job, checkpoint: 2 });
      await act(() => h.result.current.resolveConflict());
    } else await act(() => h.result.current.recover());
    expect(h.result.current.control).toEqual(store.knownComparison(newer));
    expect(h.result.current.progress).toBeNull();
    expect(h.result.current.error).toMatch(/controle mudou/i);
    expect(transport.advanceCampaignComparison).toHaveBeenCalledTimes(path === 'start' ? 0 : 1);
  },
);
it('GET atrasado não rebaixa progresso abaixo do checkpoint já conhecido em outra aba', async () => {
  const newer = { ...progress, checkpoint: 4 };
  await store.rememberComparison(newer, () => {});
  const h = await hook();
  await waitFor(() => expect(h.result.current.error).not.toBe(''));
  expect(h.result.current.control).toEqual(store.knownComparison(newer));
  expect(h.result.current.progress).toBeNull();
  expect(store.readComparisonControl(uid, campaignId, comparisonId)).toEqual(
    store.knownComparison(newer),
  );
  expect(transport.advanceCampaignComparison).not.toHaveBeenCalled();
});
it('refresh de limpeza relê o journal quando outra aba grava controle antes do retorno de remember', async () => {
  await store.rememberComparison(progress, () => {});
  const h = await hook();
  await waitFor(() => expect(h.result.current.progress?.checkpoint).toBe(3));
  const original = store.rememberComparison,
    newer = {
      ...progress,
      state: 'deleted' as const,
      phase: 'cleanup' as const,
      cleanupComplete: true,
      checkpoint: 6,
    };
  vi.spyOn(store, 'rememberComparison').mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    // A second tab has already observed a later checkpoint before this await returns.
    localStorage.setItem(
      'writer:campaign-comparison:' + JSON.stringify([uid, campaignId, 'job:' + comparisonId]),
      JSON.stringify(store.knownComparison(newer)),
    );
    return result;
  });
  vi.mocked(transport.getCampaignComparison).mockResolvedValue({ ...newer, checkpoint: 5 });
  await act(() => h.result.current.refresh());
  expect(h.result.current.control).toEqual(store.knownComparison(newer));
  expect(h.result.current.progress).toBeNull();
  expect(h.result.current.error).toMatch(/controle mudou/i);
});
it('confirmação atrasada não apaga nem envia o próximo pedido reservado por outra aba', async () => {
  job = { ...progress, state: 'preparing', phase: 'scenes', checkpoint: 1 };
  await store.reserveComparison(stepPending, () => {});
  const h = await hook({ ...options(), isOpen: () => true }),
    original = store.finishComparisonStep,
    third = {
      ...stepPending,
      input: { ...stepPending.input, operationId: 'other-tab-step', expectedCheckpoint: 2 },
    };
  vi.spyOn(store, 'finishComparisonStep').mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    await store.reserveComparison(third, () => {});
    return result;
  });
  await act(() => h.result.current.recover());
  expect(h.result.current.control).toEqual(third);
  expect(store.readComparisonControl(uid, campaignId, comparisonId)).toEqual(third);
  expect(h.result.current.progress).toBeNull();
  expect(transport.advanceCampaignComparison).toHaveBeenCalledOnce();
  expect(transport.advanceCampaignComparison).toHaveBeenLastCalledWith(stepPending.input);
});
it('ação que invalida GET sem resposta libera loading e permite consulta nova antes do GET antigo terminar', async () => {
  const initial = {
      ...progress,
      state: 'preparing' as const,
      phase: 'scenes' as const,
      checkpoint: 1,
    },
    newer = { ...initial, checkpoint: 2 },
    oldRead = deferred<ComparisonProgress>(),
    newRead = deferred<ComparisonProgress>();
  job = initial;
  await store.rememberComparison(initial, () => {});
  const h = await hook({ ...options(), isOpen: () => true });
  await waitFor(() => expect(h.result.current.progress?.checkpoint).toBe(1));
  vi.mocked(transport.getCampaignComparison)
    .mockReturnValueOnce(oldRead.promise)
    .mockReturnValueOnce(newRead.promise);
  await act(() => store.rememberComparison(newer, () => {}));
  await waitFor(() => expect(transport.getCampaignComparison).toHaveBeenCalledTimes(2));
  expect(h.result.current.loading).toBe(true);
  await act(() => h.result.current.continuePreparation());
  expect(h.result.current.error).toMatch(/progresso conhecido avançou/);
  expect(h.result.current.loading).toBe(false);
  expect(transport.advanceCampaignComparison).not.toHaveBeenCalled();
  let rechecking!: Promise<void>;
  act(() => {
    rechecking = h.result.current.refresh();
  });
  await waitFor(() => expect(transport.getCampaignComparison).toHaveBeenCalledTimes(3));
  expect(h.result.current.loading).toBe(true);
  await act(async () => {
    oldRead.resolve(initial);
    await oldRead.promise;
  });
  expect(h.result.current.loading).toBe(true);
  expect(h.result.current.progress?.checkpoint).toBe(1);
  await act(async () => {
    newRead.resolve(newer);
    await rechecking;
  });
  expect(h.result.current.loading).toBe(false);
  expect(h.result.current.progress?.checkpoint).toBe(2);
  expect(h.result.current.control).toEqual(store.knownComparison(newer));
  expect(transport.advanceCampaignComparison).not.toHaveBeenCalled();
});
