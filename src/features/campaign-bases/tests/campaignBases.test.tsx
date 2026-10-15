import { webcrypto, createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { chooseDropdown } from '@/test/dropdown';
import type {
  CampaignBaseSummary,
  CampaignBaseWindow,
  CampaignCaptureProgress,
  PendingCampaignCaptureOperation,
} from '../model/campaignBase';
import * as calls from '../services/campaignBaseCallables';
import { readCompleteCampaignBaseItem } from '../services/campaignBaseService';
import { campaignFieldHash, verifyCampaignBaseFields } from '../services/campaignBaseContent';
import {
  readPendingCampaignCapture,
  writePendingCampaignCapture,
  listPendingCampaignCaptureControls,
} from '../services/campaignCaptureRecovery';
import { useCampaignCaptureOperation } from '../hooks/useCampaignCaptureOperation';
import { CampaignCaptureDialog } from '../components/CampaignCaptureDialog';
import { CampaignCapturePreparations } from '../components/CampaignCapturePreparations';
import { CampaignBaseReader } from '../components/CampaignBaseReader';
const auth = vi.hoisted(() => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('@/features/universes', () => ({ UniverseSelect: () => <p>Universo organizacional</p> }));
vi.mock('../services/campaignBaseCallables', () => ({
  getCampaignCaptureSource: vi.fn(),
  startCampaignCapture: vi.fn(),
  getCampaignCapture: vi.fn(),
  listCampaignCaptures: vi.fn(),
  advanceCampaignCapture: vi.fn(),
  activateCampaignCapture: vi.fn(),
  cancelCampaignCapture: vi.fn(),
  getCampaignBase: vi.fn(),
  listCampaignBaseItems: vi.fn(),
  readCampaignBaseItem: vi.fn(),
  readCampaignBaseImage: vi.fn(),
  listCampaignBaseReferences: vi.fn(),
}));
const token = 'a'.repeat(64),
  newToken = 'b'.repeat(64);
const progress = (patch: Partial<CampaignCaptureProgress> = {}): CampaignCaptureProgress => ({
  reserved: { campaignId: 'campaign', baseId: 'base' },
  captureId: 'capture',
  state: 'preparing',
  phase: 'parts',
  checkpoint: 0,
  processed: 0,
  counts: {
    part: 0,
    scene: 0,
    block: 0,
    arc: 0,
    milestone: 0,
    event: 0,
    lore: 0,
    reference: 0,
    image: 0,
  },
  sourceAvailable: true,
  cleanupComplete: false,
  campaignId: null,
  reason: null,
  request: {
    adventureId: 'adventure',
    title: 'Mesa privada',
    description: 'Minhas notas',
    universeId: null,
  },
  createdAt: 1,
  updatedAt: 2,
  ...patch,
});
const summary = (patch: Partial<CampaignBaseSummary> = {}): CampaignBaseSummary => ({
  sourceKey: 'part-key',
  kind: 'part',
  parentKey: null,
  title: 'Parte congelada',
  archived: false,
  orderKey: '001',
  ...patch,
});
const windowFor = (content: string, field = 'legacyContent'): CampaignBaseWindow => ({
  item: {
    ...summary(),
    fields: [
      {
        field,
        sha256: createHash('sha256').update(content).digest('hex'),
        bytes: Buffer.byteLength(content),
        chunkCount: 1,
      },
    ],
    structured: { contentMode: 'legacy' },
    image: null,
  },
  chunks: [{ field, index: 0, content }],
  nextCursor: null,
  projectionToken: token,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  auth.user = { uid: 'owner' };
  vi.mocked(calls.getCampaignCaptureSource).mockResolvedValue({
    adventureId: 'adventure',
    title: 'Aventura original',
    universeId: null,
    sourceToken: token,
    loreSelection: 'referenced',
    counts: {
      part: null,
      scene: null,
      block: null,
      arc: null,
      milestone: null,
      event: null,
      lore: null,
      reference: null,
      image: null,
    },
  });
  vi.mocked(calls.listCampaignCaptures).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(calls.getCampaignCapture).mockResolvedValue(progress());
  vi.mocked(calls.getCampaignBase).mockResolvedValue({
    baseId: 'base',
    capturedAt: 1000,
    source: {
      adventureId: 'adventure',
      title: 'Original congelado',
      synopsis: 'Sinopse congelada',
      language: 'pt-BR',
    },
    projectionToken: token,
  });
  vi.mocked(calls.listCampaignBaseItems).mockResolvedValue({
    items: [summary()],
    nextCursor: null,
    projectionToken: token,
  });
  vi.mocked(calls.listCampaignBaseReferences).mockResolvedValue({
    items: [],
    nextCursor: null,
    projectionToken: token,
  });
  vi.mocked(calls.readCampaignBaseItem).mockResolvedValue(windowFor('<p>Texto congelado</p>'));
});
it('confere UTF-8 bruto, bytes e ordem antes de publicar campos completos', async () => {
  const content = '🌕 ação'.repeat(7000),
    parts = [content.slice(0, 24500), content.slice(24500)];
  const manifests = [
    {
      field: 'content',
      sha256: await campaignFieldHash(content),
      bytes: Buffer.byteLength(content),
      chunkCount: 2,
    },
  ];
  const chunks = parts.map((content, index) => ({ field: 'content', index, content }));
  expect(await verifyCampaignBaseFields(manifests, chunks, () => true)).toEqual({ content });
  await expect(
    verifyCampaignBaseFields(manifests, [chunks[1]!, chunks[0]!], () => true),
  ).rejects.toThrow('fora de ordem');
  await expect(
    verifyCampaignBaseFields([{ ...manifests[0]!, sha256: token }], chunks, () => true),
  ).rejects.toThrow('não corresponde');
});
it('recusa campo com bytes incompletos e campo não previsto no manifesto', async () => {
  const page = windowFor('ação');
  await expect(
    verifyCampaignBaseFields(
      page.item.fields,
      [{ field: 'legacyContent', index: 0, content: 'aç' }],
      () => true,
    ),
  ).rejects.toThrow('integralmente');
  await expect(
    verifyCampaignBaseFields(
      page.item.fields,
      [{ field: 'relations', index: 0, content: 'segredo' }],
      () => true,
    ),
  ).rejects.toThrow('fora de ordem');
});
it('não publica primeira janela se a última perdeu autorização ou token', async () => {
  const first = windowFor('primeirosegundo');
  first.item.fields[0]!.chunkCount = 2;
  first.chunks = [{ field: 'legacyContent', index: 0, content: 'primeiro' }];
  first.nextCursor = 'next';
  vi.mocked(calls.readCampaignBaseItem)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce({
      ...first,
      chunks: [{ field: 'legacyContent', index: 1, content: 'segundo' }],
      nextCursor: null,
      projectionToken: newToken,
    });
  await expect(
    readCompleteCampaignBaseItem('campaign', 'part-key', token, () => true),
  ).rejects.toThrow('autorização');
});
it('cancela a leitura antes de seguir outra janela após trocar a identidade', async () => {
  const pending = deferred<CampaignBaseWindow>();
  let active = true;
  vi.mocked(calls.readCampaignBaseItem).mockReturnValueOnce(pending.promise);
  const read = readCompleteCampaignBaseItem('campaign', 'part-key', token, () => active);
  active = false;
  pending.resolve({ ...windowFor('segredo'), nextCursor: 'next' });
  expect(await read).toBeNull();
  expect(calls.readCampaignBaseItem).toHaveBeenCalledTimes(1);
});
it('preserva payload antes da rede e reconcilia exatamente o mesmo pedido incerto', async () => {
  const input: PendingCampaignCaptureOperation = {
    method: 'advanceCampaignCapture',
    expected: { campaignId: 'campaign', baseId: 'base', adventureId: 'adventure' },
    input: { captureId: 'capture', operationId: 'stable-operation', expectedCheckpoint: 0 },
  };
  vi.mocked(calls.advanceCampaignCapture)
    .mockImplementationOnce(() => {
      expect(
        readPendingCampaignCapture('owner', { kind: 'capture', captureId: 'capture' }),
      ).toEqual(input);
      return Promise.reject(new Error('Resposta perdida'));
    })
    .mockResolvedValueOnce(progress({ checkpoint: 1 }));
  const confirmed = vi.fn(),
    pending = vi.fn();
  const { result } = renderHook(() =>
    useCampaignCaptureOperation(
      { kind: 'capture', captureId: 'capture' },
      { onResult: confirmed, onPendingChange: pending },
    ),
  );
  await act(() => result.current.execute(input));
  expect(result.current.pending).toEqual(input);
  await act(() =>
    result.current.execute({ ...input, input: { ...input.input, operationId: 'new-operation' } }),
  );
  expect(calls.advanceCampaignCapture).toHaveBeenCalledTimes(1);
  await act(() => result.current.recover());
  expect(calls.advanceCampaignCapture).toHaveBeenNthCalledWith(2, input.input);
  expect(confirmed).toHaveBeenCalledWith(progress({ checkpoint: 1 }));
  expect(result.current.pending).toBeNull();
});
it('uma resposta tardia não chama o callback da nova conta', async () => {
  const response = deferred<CampaignCaptureProgress>();
  vi.mocked(calls.advanceCampaignCapture).mockReturnValueOnce(response.promise);
  const confirmed = vi.fn();
  const view = renderHook(() =>
    useCampaignCaptureOperation({ kind: 'capture', captureId: 'capture' }, { onResult: confirmed }),
  );
  let request!: Promise<unknown>;
  act(() => {
    request = view.result.current.execute({
      method: 'advanceCampaignCapture',
      expected: { campaignId: 'campaign', baseId: 'base', adventureId: 'adventure' },
      input: { captureId: 'capture', operationId: 'old', expectedCheckpoint: 0 },
    });
  });
  auth.user = { uid: 'other' };
  view.rerender();
  await act(async () => {
    response.resolve(progress({ checkpoint: 1 }));
    await request;
  });
  expect(confirmed).not.toHaveBeenCalled();
  expect(
    readPendingCampaignCapture('owner', { kind: 'capture', captureId: 'capture' })?.input
      .operationId,
  ).toBe('old');
});
it('bloqueia envio se não consegue preservar o pedido, sem chamar a rede', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Armazenamento indisponível');
  });
  const { result } = renderHook(() =>
    useCampaignCaptureOperation({ kind: 'capture', captureId: 'capture' }),
  );
  await act(() =>
    result.current.execute({
      method: 'cancelCampaignCapture',
      expected: { campaignId: 'campaign', baseId: 'base', adventureId: 'adventure' },
      input: { captureId: 'capture', operationId: 'cancel', expectedCheckpoint: 0 },
    }),
  );
  expect(calls.cancelCampaignCapture).not.toHaveBeenCalled();
  expect(result.current.error).toContain('Armazenamento');
  storage.mockRestore();
});
it('retoma um pedido preservado após remontar sem criar outro ID', async () => {
  const input: PendingCampaignCaptureOperation = {
    method: 'cancelCampaignCapture',
    expected: { campaignId: 'campaign', baseId: 'base', adventureId: 'adventure' },
    input: { captureId: 'capture', operationId: 'cleanup', expectedCheckpoint: 3 },
  };
  writePendingCampaignCapture('owner', { kind: 'capture', captureId: 'capture' }, input);
  vi.mocked(calls.cancelCampaignCapture).mockResolvedValue(
    progress({
      checkpoint: 4,
      state: 'deleted',
      phase: 'cleanup',
      cleanupComplete: true,
      sourceAvailable: false,
      counts: null,
    }),
  );
  const { result } = renderHook(() =>
    useCampaignCaptureOperation({ kind: 'capture', captureId: 'capture' }),
  );
  expect(result.current.pending).toEqual(input);
  await act(() => result.current.recover());
  expect(calls.cancelCampaignCapture).toHaveBeenCalledWith(input.input);
  expect(result.current.pending).toBeNull();
});
it('mantém janela vazia com cursor acessível até encontrar preparação', async () => {
  vi.mocked(calls.listCampaignCaptures)
    .mockResolvedValueOnce({ items: [], nextCursor: 'after-empty' })
    .mockResolvedValueOnce({
      items: [
        progress({
          sourceAvailable: false,
          counts: null,
          state: 'aborted',
          reason: 'source-unavailable',
        }),
      ],
      nextCursor: null,
    });
  render(
    <MemoryRouter>
      <CampaignCapturePreparations />
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais preparações' }));
  expect(
    await screen.findByRole('button', { name: 'Mesa privada · Interrompida' }),
  ).toBeInTheDocument();
  expect(calls.listCampaignCaptures).toHaveBeenLastCalledWith({ cursor: 'after-empty', limit: 25 });
});
it('não revela preparações antigas depois da troca de conta', async () => {
  const response = deferred<{ items: CampaignCaptureProgress[]; nextCursor: null }>();
  vi.mocked(calls.listCampaignCaptures)
    .mockReturnValueOnce(response.promise)
    .mockResolvedValueOnce({ items: [], nextCursor: null });
  const tree = () => (
    <MemoryRouter>
      <CampaignCapturePreparations />
    </MemoryRouter>
  );
  const view = render(tree());
  await waitFor(() => expect(calls.listCampaignCaptures).toHaveBeenCalledTimes(1));
  auth.user = { uid: 'other' };
  view.rerender(tree());
  await act(() => Promise.resolve(response.resolve({ items: [progress()], nextCursor: null })));
  expect(screen.queryByText('Mesa privada · Em preparação')).not.toBeInTheDocument();
});
it('mostra texto legado separado e abre referência capturada sem buscar lore vivo', async () => {
  render(
    <MemoryRouter>
      <CampaignBaseReader campaignId="campaign" generationId="base" />
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Parte congelada' }));
  expect(await screen.findByRole('heading', { name: 'Texto legado da parte' })).toBeInTheDocument();
  expect(screen.getByText('Texto congelado')).toBeInTheDocument();
  expect(screen.getByText('Sinopse congelada')).toBeInTheDocument();
  expect(calls.readCampaignBaseItem).toHaveBeenCalledWith({
    campaignId: 'campaign',
    sourceKey: 'part-key',
    cursor: null,
    limit: 4,
  });
});
it('apagamento de acesso na página seguinte limpa material e texto já compostos', async () => {
  vi.mocked(calls.listCampaignBaseItems)
    .mockResolvedValueOnce({ items: [summary()], nextCursor: 'page2', projectionToken: token })
    .mockResolvedValueOnce({ items: [], nextCursor: null, projectionToken: newToken });
  render(
    <MemoryRouter>
      <CampaignBaseReader campaignId="campaign" generationId="base" />
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Parte congelada' }));
  expect(await screen.findByText('Texto congelado')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais material' }));
  expect(await screen.findByText(/A base não está disponível/)).toBeInTheDocument();
  expect(screen.queryByText('Texto congelado')).not.toBeInTheDocument();
  expect(screen.queryByText('Sinopse congelada')).not.toBeInTheDocument();
});
it('troca de geração cancela corpo tardio e não o recoloca na tela', async () => {
  const response = deferred<CampaignBaseWindow>();
  vi.mocked(calls.readCampaignBaseItem).mockReturnValueOnce(response.promise);
  const tree = (generationId: string) => (
    <MemoryRouter>
      <CampaignBaseReader campaignId="campaign" generationId={generationId} />
    </MemoryRouter>
  );
  const view = render(tree('base'));
  await userEvent.click(await screen.findByRole('button', { name: 'Parte congelada' }));
  vi.mocked(calls.getCampaignBase).mockResolvedValueOnce({
    baseId: 'other-base',
    capturedAt: 2,
    source: {
      adventureId: 'other',
      title: 'Outra origem',
      synopsis: 'Outro material',
      language: 'pt-BR',
    },
    projectionToken: newToken,
  });
  vi.mocked(calls.listCampaignBaseItems).mockResolvedValue({
    items: [],
    nextCursor: null,
    projectionToken: newToken,
  });
  view.rerender(tree('other-base'));
  await act(() => Promise.resolve(response.resolve(windowFor('Texto tardio secreto'))));
  expect(await screen.findByRole('heading', { name: 'Outra origem' })).toBeInTheDocument();
  expect(screen.queryByText('Texto tardio secreto')).not.toBeInTheDocument();
});
it('paginação vazia no arquivo continua e preserva os parâmetros da consulta', async () => {
  vi.mocked(calls.listCampaignBaseItems)
    .mockResolvedValueOnce({ items: [], nextCursor: null, projectionToken: token })
    .mockResolvedValueOnce({ items: [], nextCursor: 'archived-next', projectionToken: token })
    .mockResolvedValueOnce({
      items: [summary({ archived: true, title: 'Parte no arquivo' })],
      nextCursor: null,
      projectionToken: token,
    });
  render(
    <MemoryRouter>
      <CampaignBaseReader campaignId="campaign" generationId="base" />
    </MemoryRouter>,
  );
  await screen.findByText('Nenhum material disponível neste recorte da base.');
  await chooseDropdown(
    userEvent,
    screen.getByRole('combobox', { name: 'Área da base' }),
    'Arquivo',
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais material' }));
  expect(await screen.findByRole('button', { name: 'Parte no arquivo' })).toBeInTheDocument();
  expect(calls.listCampaignBaseItems).toHaveBeenLastCalledWith({
    campaignId: 'campaign',
    kind: 'part',
    archive: 'archived',
    cursor: 'archived-next',
    limit: 25,
  });
});
it('prepara em etapas explícitas e ativa só depois da confirmação integral', async () => {
  vi.mocked(calls.startCampaignCapture).mockImplementation((input) =>
    Promise.resolve(progress({ captureId: input.operationId })),
  );
  vi.mocked(calls.getCampaignCapture).mockImplementation((input) =>
    Promise.resolve(progress({ captureId: input.captureId })),
  );
  vi.mocked(calls.advanceCampaignCapture)
    .mockImplementationOnce((input) =>
      Promise.resolve(
        progress({ captureId: input.captureId, checkpoint: 1, phase: 'scenes', processed: 1 }),
      ),
    )
    .mockImplementationOnce((input) =>
      Promise.resolve(
        progress({
          captureId: input.captureId,
          checkpoint: 2,
          state: 'prepared',
          phase: 'complete',
          processed: 2,
        }),
      ),
    );
  vi.mocked(calls.activateCampaignCapture).mockResolvedValue({
    kind: 'already-activated',
    campaignId: 'campaign',
  });
  const activated = vi.fn();
  render(
    <MemoryRouter>
      <CampaignCaptureDialog
        open
        onClose={() => {}}
        adventureId="adventure"
        onActivated={activated}
      />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Título da campanha')).toHaveValue('Aventura original'),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Preparar campanha' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Continuar preparação' }));
  expect(await screen.findByRole('button', { name: 'Criar campanha com esta base' })).toBeEnabled();
  expect(calls.activateCampaignCapture).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Criar campanha com esta base' }));
  expect(activated).toHaveBeenCalledWith('campaign');
  expect(calls.advanceCampaignCapture).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ expectedCheckpoint: 1 }),
  );
});
it('ativação abortada mostra motivo e mantém limpeza sem navegar', async () => {
  vi.mocked(calls.getCampaignCapture).mockResolvedValue(
    progress({ state: 'prepared', phase: 'complete' }),
  );
  vi.mocked(calls.activateCampaignCapture).mockResolvedValue({
    kind: 'aborted',
    preparation: progress({ state: 'aborted', reason: 'source-changed', checkpoint: 1 }),
  });
  const activated = vi.fn();
  render(
    <MemoryRouter>
      <CampaignCaptureDialog
        open
        onClose={() => {}}
        adventureId="adventure"
        initialCaptureId="capture"
        onActivated={activated}
      />
    </MemoryRouter>,
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Criar campanha com esta base' }),
  );
  expect(await screen.findByText(/A aventura mudou durante/)).toBeInTheDocument();
  expect(activated).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Cancelar preparação e limpar' })).toBeEnabled();
});
it('fechar com resposta incerta preserva o pedido e oferece o mesmo retry ao reabrir', async () => {
  vi.mocked(calls.startCampaignCapture)
    .mockRejectedValueOnce(new Error('Resposta perdida'))
    .mockImplementationOnce((input) => Promise.resolve(progress({ captureId: input.operationId })));
  vi.mocked(calls.getCampaignCapture).mockImplementation((input) =>
    Promise.resolve(progress({ captureId: input.captureId })),
  );
  const close = vi.fn();
  const tree = (open: boolean) => (
    <MemoryRouter>
      <CampaignCaptureDialog
        open={open}
        onClose={close}
        adventureId="adventure"
        onActivated={() => {}}
      />
    </MemoryRouter>
  );
  const view = render(tree(true));
  await waitFor(() =>
    expect(screen.getByLabelText('Título da campanha')).toHaveValue('Aventura original'),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Preparar campanha' }));
  expect(await screen.findByRole('button', { name: 'Confirmar mesmo pedido' })).toBeInTheDocument();
  const first = vi.mocked(calls.startCampaignCapture).mock.calls[0]![0];
  view.rerender(tree(false));
  view.rerender(tree(true));
  await userEvent.click(await screen.findByRole('button', { name: 'Confirmar mesmo pedido' }));
  expect(calls.startCampaignCapture).toHaveBeenLastCalledWith(first);
  expect(
    await screen.findByRole('heading', { name: 'Preparação da campanha' }),
  ).toBeInTheDocument();
});
it.each(['wrong-id', 'wrong-adventure'])(
  'não adota uma preparação de outro alvo (%s)',
  async (wrong) => {
    const operation: PendingCampaignCaptureOperation = {
      method: 'startCampaignCapture',
      input: {
        operationId: 'requested',
        adventureId: 'adventure',
        expectedSourceToken: token,
        title: 'Minha mesa',
        description: '',
        universeId: null,
      },
    };
    vi.mocked(calls.startCampaignCapture).mockResolvedValue(
      progress({
        captureId: wrong === 'wrong-id' ? 'other' : 'requested',
        request: {
          ...progress().request,
          adventureId: wrong === 'wrong-adventure' ? 'other-adventure' : 'adventure',
        },
      }),
    );
    const confirmed = vi.fn();
    const { result } = renderHook(() =>
      useCampaignCaptureOperation(
        { kind: 'start', adventureId: 'adventure' },
        { onResult: confirmed },
      ),
    );
    await act(() => result.current.execute(operation));
    expect(confirmed).not.toHaveBeenCalled();
    expect(result.current.pending).toEqual(operation);
    expect(result.current.error).toMatch(/confirmad/);
  },
);
it('origem nula mostra indisponibilidade sem iniciar um pedido', async () => {
  vi.mocked(calls.getCampaignCaptureSource).mockResolvedValue(null);
  render(
    <MemoryRouter>
      <CampaignCaptureDialog
        open
        onClose={() => {}}
        adventureId="adventure"
        onActivated={() => {}}
      />
    </MemoryRouter>,
  );
  expect(await screen.findByText(/Esta aventura não está disponível/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Preparar campanha' })).toBeDisabled();
  expect(calls.startCampaignCapture).not.toHaveBeenCalled();
});
it('limpeza após perda da origem avança checkpoints sem ler a aventura', async () => {
  vi.mocked(calls.getCampaignCapture).mockResolvedValue(
    progress({
      state: 'aborted',
      sourceAvailable: false,
      counts: null,
      reason: 'source-unavailable',
      checkpoint: 7,
    }),
  );
  vi.mocked(calls.cancelCampaignCapture)
    .mockResolvedValueOnce(
      progress({
        state: 'deleting',
        phase: 'cleanup',
        sourceAvailable: false,
        counts: null,
        checkpoint: 8,
      }),
    )
    .mockResolvedValueOnce(
      progress({
        state: 'deleted',
        phase: 'cleanup',
        sourceAvailable: false,
        counts: null,
        checkpoint: 9,
        cleanupComplete: true,
      }),
    );
  render(
    <MemoryRouter>
      <CampaignCaptureDialog
        open
        onClose={() => {}}
        adventureId="adventure"
        initialCaptureId="capture"
        onActivated={() => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Cancelar preparação e limpar' }),
  );
  expect(
    await screen.findByText('A preparação foi cancelada e a limpeza foi concluída.'),
  ).toBeInTheDocument();
  expect(calls.cancelCampaignCapture).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ expectedCheckpoint: 7 }),
  );
  expect(calls.cancelCampaignCapture).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ expectedCheckpoint: 8 }),
  );
  expect(calls.getCampaignCaptureSource).not.toHaveBeenCalled();
  expect(screen.queryByText(/0 recursos processados/)).not.toBeInTheDocument();
});
it('conflito de checkpoint mantém ações bloqueadas até conferir explicitamente o progresso', async () => {
  vi.mocked(calls.advanceCampaignCapture).mockRejectedValueOnce(
    Object.assign(new Error('Checkpoint mudou'), { code: 'functions/failed-precondition' }),
  );
  vi.mocked(calls.getCampaignCapture)
    .mockResolvedValueOnce(progress())
    .mockResolvedValueOnce(progress({ checkpoint: 4, state: 'prepared', phase: 'complete' }));
  render(
    <MemoryRouter>
      <CampaignCaptureDialog
        open
        onClose={() => {}}
        adventureId="adventure"
        initialCaptureId="capture"
        onActivated={() => {}}
      />
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Continuar preparação' }));
  expect(await screen.findByText('Checkpoint mudou')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Continuar preparação' })).toBeDisabled();
  expect(calls.getCampaignCapture).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Conferir progresso atual' }));
  expect(await screen.findByRole('button', { name: 'Criar campanha com esta base' })).toBeEnabled();
});
it('consulta referências capturadas paginadas sem reconstituir nome de alvo indisponível', async () => {
  const scene = summary({ kind: 'scene', sourceKey: 'scene-key', title: 'Cena congelada' });
  vi.mocked(calls.listCampaignBaseItems)
    .mockResolvedValueOnce({ items: [], nextCursor: null, projectionToken: token })
    .mockResolvedValueOnce({ items: [scene], nextCursor: null, projectionToken: token });
  const page = windowFor('Objetivo congelado', 'objective');
  page.item = {
    ...page.item,
    ...scene,
    structured: { wordCount: 0, mainWordCount: 0, blockWordCount: 0, blockCount: 0 },
  };
  vi.mocked(calls.readCampaignBaseItem)
    .mockResolvedValueOnce(page)
    .mockResolvedValueOnce({
      ...windowFor('Ficha capturada', 'summary'),
      item: {
        ...windowFor('Ficha capturada', 'summary').item,
        ...summary({ kind: 'lore', sourceKey: 'lore-key', title: 'Ficha vinculada' }),
      },
    });
  vi.mocked(calls.listCampaignBaseReferences)
    .mockResolvedValueOnce({ items: [], nextCursor: 'references-next', projectionToken: token })
    .mockResolvedValueOnce({
      items: [
        { key: 'orphan', kind: 'scene', sourceKey: 'scene-key', targetKey: null, available: false },
        {
          key: 'linked',
          kind: 'scene',
          sourceKey: 'scene-key',
          targetKey: 'lore-key',
          available: true,
        },
      ],
      nextCursor: null,
      projectionToken: token,
    });
  render(
    <MemoryRouter>
      <CampaignBaseReader campaignId="campaign" generationId="base" />
    </MemoryRouter>,
  );
  await screen.findByText('Nenhum material disponível neste recorte da base.');
  await chooseDropdown(
    userEvent,
    screen.getByRole('combobox', { name: 'Tipo de material capturado' }),
    'Cenas',
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Cena congelada' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais referências' }));
  expect(await screen.findByText('Ficha referenciada indisponível')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Consultar ficha capturada 2' }));
  expect(await screen.findByText('Ficha capturada')).toBeInTheDocument();
  expect(calls.readCampaignBaseItem).toHaveBeenLastCalledWith({
    campaignId: 'campaign',
    sourceKey: 'lore-key',
    cursor: null,
    limit: 4,
  });
});
it('imagem com token revogado remove também o texto confirmado do recurso', async () => {
  const page = windowFor('Conteúdo com imagem');
  page.item.image = {
    imageKey: 'captured-media',
    alt: 'Mapa capturado',
    caption: 'Legenda capturada',
  };
  vi.mocked(calls.readCampaignBaseItem).mockResolvedValue(page);
  vi.mocked(calls.readCampaignBaseImage).mockResolvedValue({
    dataUrl: 'data:image/webp;base64,UklGRg==',
    projectionToken: newToken,
  });
  render(
    <MemoryRouter>
      <CampaignBaseReader campaignId="campaign" generationId="base" />
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Parte congelada' }));
  expect(await screen.findByText(/A base não está disponível/)).toBeInTheDocument();
  expect(screen.queryByText('Conteúdo com imagem')).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
it.each(['campaign', 'base', 'adventure'])(
  'ativação não aceita identidade %s diferente do pedido reservado',
  async (wrong) => {
    const operation: PendingCampaignCaptureOperation = {
      method: 'activateCampaignCapture',
      input: { captureId: 'capture', operationId: 'activate', expectedCheckpoint: 3 },
      expected: { campaignId: 'campaign', baseId: 'base', adventureId: 'adventure' },
    };
    vi.mocked(calls.activateCampaignCapture).mockResolvedValue({
      kind: 'activated',
      campaign: {
        id: wrong === 'campaign' ? 'another' : 'campaign',
        ownerId: 'owner',
        revision: 1,
        schemaVersion: 1,
        title: 'Mesa',
        description: 'Notas',
        status: 'planning',
        universeId: null,
        createdAt: 1,
        updatedAt: 2,
        provenance: {
          kind: 'original',
          adventureId: wrong === 'adventure' ? 'another' : 'adventure',
          baseId: wrong === 'base' ? 'another' : 'base',
        },
        activeBaseId: wrong === 'base' ? 'another' : 'base',
      },
    });
    const confirmed = vi.fn();
    const { result } = renderHook(() =>
      useCampaignCaptureOperation(
        { kind: 'capture', captureId: 'capture' },
        { onResult: confirmed },
      ),
    );
    await act(() => result.current.execute(operation));
    expect(confirmed).not.toHaveBeenCalled();
    expect(result.current.pending).toEqual(operation);
  },
);
it('reload reconcilia ativação pelo envelope original sem GET nem enviar IDs privados extras ao RPC', async () => {
  const operation: PendingCampaignCaptureOperation = {
    method: 'activateCampaignCapture',
    input: { captureId: 'capture', operationId: 'activate', expectedCheckpoint: 3 },
    expected: { campaignId: 'campaign', baseId: 'base', adventureId: 'adventure' },
  };
  writePendingCampaignCapture('owner', { kind: 'capture', captureId: 'capture' }, operation);
  vi.mocked(calls.activateCampaignCapture).mockResolvedValue({
    kind: 'already-activated',
    campaignId: 'campaign',
  });
  const activated = vi.fn();
  render(
    <MemoryRouter>
      <CampaignCaptureDialog
        open
        onClose={() => {}}
        adventureId="adventure"
        initialCaptureId="capture"
        onActivated={activated}
      />
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Confirmar mesmo pedido' }));
  expect(activated).toHaveBeenCalledWith('campaign');
  expect(calls.activateCampaignCapture).toHaveBeenCalledWith(operation.input);
  expect(calls.getCampaignCapture).not.toHaveBeenCalled();
});
it('replay de ativação não adota outra campanha e conserva a operação incerta', async () => {
  const operation: PendingCampaignCaptureOperation = {
    method: 'activateCampaignCapture',
    input: { captureId: 'capture', operationId: 'activate', expectedCheckpoint: 3 },
    expected: { campaignId: 'campaign', baseId: 'base', adventureId: 'adventure' },
  };
  writePendingCampaignCapture('owner', { kind: 'capture', captureId: 'capture' }, operation);
  vi.mocked(calls.activateCampaignCapture).mockResolvedValue({
    kind: 'already-activated',
    campaignId: 'other-campaign',
  });
  const confirmed = vi.fn();
  const { result } = renderHook(() =>
    useCampaignCaptureOperation({ kind: 'capture', captureId: 'capture' }, { onResult: confirmed }),
  );
  await act(() => result.current.recover());
  expect(confirmed).not.toHaveBeenCalled();
  expect(result.current.pending).toEqual(operation);
});
it('painel descobre ativação pendente após reload mesmo com lista remota vazia', async () => {
  const operation: PendingCampaignCaptureOperation = {
    method: 'activateCampaignCapture',
    input: { captureId: 'capture', operationId: 'activate', expectedCheckpoint: 3 },
    expected: { campaignId: 'campaign', baseId: 'base', adventureId: 'adventure' },
  };
  writePendingCampaignCapture('owner', { kind: 'capture', captureId: 'capture' }, operation);
  vi.mocked(calls.activateCampaignCapture).mockResolvedValue({
    kind: 'already-activated',
    campaignId: 'campaign',
  });
  const activated = vi.fn();
  render(
    <MemoryRouter>
      <CampaignCapturePreparations onActivated={activated} />
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Confirmar pedido pendente 1' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Confirmar mesmo pedido' }));
  expect(activated).toHaveBeenCalledWith('campaign');
  expect(calls.activateCampaignCapture).toHaveBeenCalledWith(operation.input);
  expect(calls.getCampaignCapture).not.toHaveBeenCalled();
});
it('pedido start incerto tem precedência sobre preparação já visível no servidor', async () => {
  const operation: PendingCampaignCaptureOperation = {
    method: 'startCampaignCapture',
    input: {
      operationId: 'capture',
      adventureId: 'adventure',
      expectedSourceToken: token,
      title: 'Mesa privada',
      description: 'Notas',
      universeId: null,
    },
  };
  writePendingCampaignCapture('owner', { kind: 'start', adventureId: 'adventure' }, operation);
  vi.mocked(calls.listCampaignCaptures).mockResolvedValue({
    items: [progress()],
    nextCursor: null,
  });
  vi.mocked(calls.startCampaignCapture).mockResolvedValue(progress());
  render(
    <MemoryRouter>
      <CampaignCapturePreparations />
    </MemoryRouter>,
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Mesa privada · Em preparação' }),
  );
  expect(await screen.findByRole('button', { name: 'Confirmar mesmo pedido' })).toBeInTheDocument();
  expect(calls.getCampaignCapture).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Continuar preparação' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar mesmo pedido' }));
  expect(calls.startCampaignCapture).toHaveBeenCalledWith(operation.input);
  expect(await screen.findByRole('button', { name: 'Continuar preparação' })).toBeInTheDocument();
});
it('limpeza concluída com resposta perdida continua acessível pelo recibo local', async () => {
  const operation: PendingCampaignCaptureOperation = {
    method: 'cancelCampaignCapture',
    input: { captureId: 'capture', operationId: 'last-cleanup', expectedCheckpoint: 9 },
    expected: { campaignId: 'campaign', baseId: 'base', adventureId: 'adventure' },
  };
  writePendingCampaignCapture('owner', { kind: 'capture', captureId: 'capture' }, operation);
  vi.mocked(calls.cancelCampaignCapture).mockResolvedValue(
    progress({
      state: 'deleted',
      phase: 'cleanup',
      checkpoint: 10,
      cleanupComplete: true,
      sourceAvailable: false,
      counts: null,
    }),
  );
  render(
    <MemoryRouter>
      <CampaignCapturePreparations />
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Confirmar pedido pendente 1' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Confirmar mesmo pedido' }));
  expect(
    await screen.findByText('A preparação foi cancelada e a limpeza foi concluída.'),
  ).toBeInTheDocument();
  expect(calls.cancelCampaignCapture).toHaveBeenCalledWith(operation.input);
  expect(calls.getCampaignCapture).not.toHaveBeenCalled();
});
it('enumeração ignora outra conta e uma entrada danificada não oculta outro recibo saudável', () => {
  localStorage.setItem(
    'writer:campaign-capture:' + JSON.stringify(['owner', 'capture', 'damaged']),
    'malformed',
  );
  const operation: PendingCampaignCaptureOperation = {
    method: 'cancelCampaignCapture',
    input: { captureId: 'capture', operationId: 'cleanup', expectedCheckpoint: 0 },
    expected: { campaignId: 'campaign', baseId: 'base', adventureId: 'adventure' },
  };
  writePendingCampaignCapture('owner', { kind: 'capture', captureId: 'capture' }, operation);
  expect(listPendingCampaignCaptureControls('other').items).toEqual([]);
  expect(listPendingCampaignCaptureControls('owner')).toEqual({
    items: [
      {
        scope: { kind: 'capture', captureId: 'capture' },
        captureId: 'capture',
        adventureId: 'adventure',
      },
    ],
    unreadable: true,
  });
});
it('janela tardia do filtro anterior não invalida nem repovoa a nova lista', async () => {
  const old = deferred<Awaited<ReturnType<typeof calls.listCampaignBaseItems>>>();
  vi.mocked(calls.listCampaignBaseItems)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({
      items: [summary({ kind: 'scene', sourceKey: 'scene', title: 'Cena atual' })],
      nextCursor: null,
      projectionToken: token,
    });
  render(
    <MemoryRouter>
      <CampaignBaseReader campaignId="campaign" generationId="base" />
    </MemoryRouter>,
  );
  await screen.findByRole('combobox', { name: 'Tipo de material capturado' });
  await chooseDropdown(
    userEvent,
    screen.getByRole('combobox', { name: 'Tipo de material capturado' }),
    'Cenas',
  );
  expect(await screen.findByRole('button', { name: 'Cena atual' })).toBeInTheDocument();
  await act(() =>
    Promise.resolve(
      old.resolve({
        items: [summary({ title: 'Parte tardia' })],
        nextCursor: null,
        projectionToken: newToken,
      }),
    ),
  );
  expect(screen.getByRole('button', { name: 'Cena atual' })).toBeInTheDocument();
  expect(screen.queryByText(/A base não está disponível/)).not.toBeInTheDocument();
  expect(screen.queryByText('Parte tardia')).not.toBeInTheDocument();
});
it('GET de preparação recusa outra aventura da mesma conta e permite tentar de novo sem mutar', async () => {
  vi.mocked(calls.getCampaignCapture)
    .mockResolvedValueOnce(
      progress({
        request: {
          ...progress().request,
          adventureId: 'other-adventure',
          title: 'Outra aventura privada',
        },
      }),
    )
    .mockResolvedValueOnce(progress());
  render(
    <MemoryRouter>
      <CampaignCaptureDialog
        open
        onClose={() => {}}
        adventureId="adventure"
        initialCaptureId="capture"
        onActivated={() => {}}
      />
    </MemoryRouter>,
  );
  expect(await screen.findByText('A preparação não pertence a esta aventura.')).toBeInTheDocument();
  expect(screen.queryByText('Outra aventura privada')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Continuar preparação' })).not.toBeInTheDocument();
  expect(calls.advanceCampaignCapture).not.toHaveBeenCalled();
  expect(calls.activateCampaignCapture).not.toHaveBeenCalled();
  expect(calls.cancelCampaignCapture).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByRole('button', { name: 'Continuar preparação' })).toBeEnabled();
  expect(calls.getCampaignCapture).toHaveBeenCalledTimes(2);
});
