import * as recovery from '../services/campaignManagementRecovery';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { Dropdown } from '@/shared/ui';
import { chooseDropdown } from '@/test/dropdown';
import { CampaignManagementDialog } from '../components/CampaignManagementDialog';
import { CampaignPage } from '../components/CampaignPage';
import { useCampaignManagement } from '../hooks/useCampaignManagement';
import { getCampaign } from '../services/campaignService';
import { updateCampaign } from '../services/campaignManagementCallables';
import {
  readPendingCampaignOperation,
  writePendingCampaignOperation,
  clearPendingCampaignOperation,
} from '../services/campaignManagementRecovery';
import type { Campaign, UpdateCampaignInput } from '../model/campaign';
const auth = vi.hoisted(
  (): {
    user: { uid: string } | null;
    loading: boolean;
    setPendingEditorOperation: ReturnType<typeof vi.fn>;
  } => ({
    user: { uid: 'owner' },
    loading: false,
    setPendingEditorOperation: vi.fn(),
  }),
);
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/campaignService', () => ({ getCampaign: vi.fn() }));
vi.mock('../components/CampaignDeletionControls', () => ({ CampaignDeletionControls: () => null }));
vi.mock('../services/campaignManagementCallables', () => ({ updateCampaign: vi.fn() }));
vi.mock('@/features/universes', () => ({
  UniverseSelect: ({
    value,
    onChange,
    disabled,
  }: {
    value: string | null;
    onChange: (value: string | null) => void;
    disabled?: boolean;
  }) => (
    <Dropdown
      mode="select"
      label="Universo compartilhado"
      value={value ?? ''}
      disabled={disabled}
      onValueChange={(next) => onChange(next || null)}
      options={[
        { value: '', label: 'Sem universo' },
        { value: 'world-a', label: 'Universo A' },
        { value: 'world-b', label: 'Universo B' },
      ]}
    />
  ),
}));
vi.mock('@/features/work-progress', () => ({
  useWorkActivity: () => ({}),
  WorkActivityNotice: () => null,
  ProjectProgressPanel: () => (
    <section aria-label="Preparação privada">
      <input type="checkbox" aria-label="Conferir pistas" />
    </section>
  ),
}));
let campaign: Campaign;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  let tail = Promise.resolve();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, work: () => unknown) => {
        const run = tail.then(work);
        tail = run.then(
          () => {},
          () => {},
        );
        return run;
      },
    },
  });
  vi.clearAllMocks();
  localStorage.clear();
  auth.user = { uid: 'owner' };
  campaign = {
    id: 'campaign',
    ownerId: 'owner',
    schemaVersion: 1,
    revision: 1,
    title: 'Mesa original',
    description: 'Descrição privada',
    provenance: { kind: 'independent' },
    status: 'planning',
    universeId: 'world-a',
    createdAt: 1000,
    updatedAt: 2000,
  };
  vi.mocked(getCampaign)
    .mockReset()
    .mockImplementation(() => Promise.resolve(campaign));
  vi.mocked(updateCampaign)
    .mockReset()
    .mockImplementation((input) => {
      campaign = {
        ...campaign,
        ...input.patch,
        revision: input.expectedRevision + 1,
        updatedAt: 3000,
      };
      return Promise.resolve(campaign);
    });
});
const dialog = (
  open = true,
  props: Partial<Parameters<typeof CampaignManagementDialog>[0]> = {},
) => (
  <CampaignManagementDialog open={open} campaign={campaign} onClose={() => undefined} {...props} />
);
const page = () => (
  <MemoryRouter initialEntries={['/campaigns/campaign']}>
    <Routes>
      <Route path="/campaigns/:campaignId" element={<CampaignPage />} />
      <Route path="/studio" element={<h1>Estúdio</h1>} />
    </Routes>
  </MemoryRouter>
);
it('cancelar edição não envia mutação nem altera dados da campanha', async () => {
  const onClose = vi.fn();
  render(dialog(true, { onClose }));
  await userEvent.clear(screen.getByLabelText('Título da campanha'));
  await userEvent.type(screen.getByLabelText('Título da campanha'), 'Outro nome');
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(updateCampaign).not.toHaveBeenCalled();
  expect(campaign.title).toBe('Mesa original');
});
it('pedido é preservado antes da rede, fechamento incerto bloqueia outro e reabertura confirma exatamente o mesmo', async () => {
  let input!: UpdateCampaignInput;
  vi.mocked(updateCampaign).mockImplementationOnce((request) => {
    input = request;
    expect(readPendingCampaignOperation('owner', 'campaign')).toEqual(request);
    return Promise.reject(
      Object.assign(new Error('Resposta perdida'), { code: 'functions/unavailable' }),
    );
  });
  const onConfirmed = vi.fn(),
    onPendingChange = vi.fn(),
    onClose = vi.fn();
  const view = render(dialog(true, { onConfirmed, onPendingChange, onClose }));
  await userEvent.clear(screen.getByLabelText('Título da campanha'));
  await userEvent.type(screen.getByLabelText('Título da campanha'), 'Mesa nova');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await screen.findByText('Resposta perdida');
  expect(screen.getByLabelText('Título da campanha')).toBeDisabled();
  expect(onConfirmed).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Fechar e manter pedido' }));
  expect(onClose).toHaveBeenCalledOnce();
  view.rerender(dialog(false, { onConfirmed, onPendingChange, onClose }));
  expect(onPendingChange).toHaveBeenLastCalledWith(true);
  view.rerender(dialog(true, { onConfirmed, onPendingChange, onClose }));
  expect(screen.getByLabelText('Título da campanha')).toHaveValue('Mesa nova');
  expect(screen.getByLabelText('Título da campanha')).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar mesmo pedido' }));
  await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
  expect(updateCampaign).toHaveBeenNthCalledWith(2, input);
  expect(input.patch).toEqual({ title: 'Mesa nova' });
  expect(getCampaign).not.toHaveBeenCalled();
  expect(readPendingCampaignOperation('owner', 'campaign')).toBeNull();
  expect(onPendingChange).toHaveBeenLastCalledWith(false);
});
it('reserva síncrona impede dois pedidos concorrentes e próxima edição usa a revisão confirmada', async () => {
  const done = deferred<Campaign>();
  vi.mocked(updateCampaign).mockReturnValueOnce(done.promise);
  const view = renderHook(() => useCampaignManagement(campaign));
  act(() => view.result.current.change('title', 'Nome confirmado'));
  let first!: Promise<Campaign | null>;
  act(() => {
    first = view.result.current.submit();
    void view.result.current.submit();
  });
  await waitFor(() => expect(updateCampaign).toHaveBeenCalledTimes(1));
  act(() => view.result.current.change('description', 'Não pode editar durante reserva'));
  expect(view.result.current.fields.description).toBe('Descrição privada');
  await act(async () => {
    done.resolve({ ...campaign, title: 'Nome confirmado', revision: 2, updatedAt: 3000 });
    await first;
  });
  act(() => view.result.current.change('description', 'Minha descrição nova'));
  await act(() => view.result.current.submit());
  expect(vi.mocked(updateCampaign).mock.calls[1]![0]).toMatchObject({
    expectedRevision: 2,
    patch: { description: 'Minha descrição nova' },
  });
});
it('conflito conserva campos e só descarta/adota revisão atual por ação explícita', async () => {
  vi.mocked(updateCampaign).mockRejectedValueOnce(
    Object.assign(new Error('Outra edição'), {
      code: 'functions/failed-precondition',
      details: { reason: 'revision-conflict' },
    }),
  );
  render(dialog());
  await userEvent.clear(screen.getByLabelText('Descrição da campanha'));
  await userEvent.type(
    screen.getByLabelText('Descrição da campanha'),
    'Minha descrição não enviada',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await screen.findByText('Outra edição');
  expect(screen.getByLabelText('Descrição da campanha')).toHaveValue('Minha descrição não enviada');
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  expect(getCampaign).not.toHaveBeenCalled();
  campaign = { ...campaign, revision: 8, title: 'Nome remoto', description: 'Texto remoto' };
  await userEvent.click(
    screen.getByRole('button', { name: 'Descartar alterações e carregar versão atual' }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Descrição da campanha')).toHaveValue('Texto remoto'),
  );
  expect(updateCampaign).toHaveBeenCalledTimes(1);
  await userEvent.clear(screen.getByLabelText('Título da campanha'));
  await userEvent.type(screen.getByLabelText('Título da campanha'), 'Novo nome aceito');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(updateCampaign).toHaveBeenCalledTimes(2));
  expect(vi.mocked(updateCampaign).mock.calls[1]![0]).toMatchObject({
    expectedRevision: 8,
    patch: { title: 'Novo nome aceito' },
  });
});
it('erro definitivo permite corrigir seleção, conservando campos e sem buscar nova revisão', async () => {
  vi.mocked(updateCampaign).mockRejectedValueOnce(
    Object.assign(new Error('Universo indisponível'), { code: 'functions/not-found' }),
  );
  render(dialog());
  await chooseDropdown(userEvent, screen.getByLabelText('Universo compartilhado'), 'Universo B');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await screen.findByText('Universo indisponível');
  expect(screen.getByLabelText('Universo compartilhado')).toHaveTextContent('Universo B');
  expect(screen.getByLabelText('Título da campanha')).toBeEnabled();
  await chooseDropdown(userEvent, screen.getByLabelText('Universo compartilhado'), 'Sem universo');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(updateCampaign).toHaveBeenCalledTimes(2));
  expect(vi.mocked(updateCampaign).mock.calls[1]![0]).toMatchObject({
    expectedRevision: 1,
    patch: { universeId: null },
  });
  expect(getCampaign).not.toHaveBeenCalled();
});
it('arquivo e retorno explícito preservam descrição, checklist e procedência na página', async () => {
  render(page());
  await screen.findByRole('heading', { name: 'Mesa original' });
  const task = screen.getByRole('checkbox', { name: 'Conferir pistas' });
  await userEvent.click(task);
  expect(task).toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: 'Editar campanha' }));
  await chooseDropdown(userEvent, screen.getByLabelText('Estado da campanha'), 'Arquivada');
  await chooseDropdown(userEvent, screen.getByLabelText('Universo compartilhado'), 'Sem universo');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('Arquivada')).toBeVisible();
  expect(screen.getByText('Descrição privada')).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'Conferir pistas' })).toBe(task);
  expect(task).toBeChecked();
  expect(screen.getByText('Projeto independente, sem universo vinculado.')).toBeVisible();
  expect(getCampaign).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Editar campanha' }));
  expect(screen.getByLabelText('Estado da campanha')).toHaveTextContent('Arquivada');
  await chooseDropdown(userEvent, screen.getByLabelText('Estado da campanha'), 'Em andamento');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('Em andamento')).toBeVisible();
  expect(vi.mocked(updateCampaign).mock.calls[1]![0]).toMatchObject({
    expectedRevision: 2,
    patch: { status: 'active' },
  });
  expect(screen.getByRole('checkbox', { name: 'Conferir pistas' })).toBeChecked();
});
it.each(['account', 'campaign'] as const)(
  'resposta tardia após troca de %s não atualiza o alvo novo nem apaga recibo original',
  async (change) => {
    const done = deferred<Campaign>();
    vi.mocked(updateCampaign).mockReturnValueOnce(done.promise);
    const onConfirmed = vi.fn();
    const old = campaign;
    const view = render(dialog(true, { onConfirmed }));
    await userEvent.clear(screen.getByLabelText('Título da campanha'));
    await userEvent.type(screen.getByLabelText('Título da campanha'), 'Nome da conta antiga');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(updateCampaign).toHaveBeenCalledTimes(1));
    if (change === 'account') {
      auth.user = { uid: 'other' };
      campaign = { ...campaign, ownerId: 'other' };
    } else campaign = { ...campaign, id: 'other-campaign', title: 'Outra mesa' };
    view.rerender(dialog(true, { onConfirmed }));
    await act(async () => {
      done.resolve({ ...old, title: 'Nome da conta antiga', revision: 2 });
      await done.promise;
    });
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Título da campanha')).toHaveValue(campaign.title);
    expect(readPendingCampaignOperation('owner', 'campaign')).not.toBeNull();
  },
);
it('pedido incerto sobrevive desmontagem e restaura campos antes de confirmar a mesma operação', async () => {
  const input: UpdateCampaignInput = {
    campaignId: 'campaign',
    operationId: 'preserved-request',
    expectedRevision: 1,
    patch: { title: 'Título pendente', status: 'completed' },
  };
  writePendingCampaignOperation('owner', input);
  render(dialog());
  expect(screen.getByLabelText('Título da campanha')).toHaveValue('Título pendente');
  expect(screen.getByLabelText('Estado da campanha')).toHaveTextContent('Concluída');
  expect(screen.getByLabelText('Título da campanha')).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar mesmo pedido' }));
  await waitFor(() => expect(updateCampaign).toHaveBeenCalledWith(input));
});
it('adaptador isola UID/alvo, rejeita substituição de pedido e só limpa operação correspondente', () => {
  const input: UpdateCampaignInput = {
    campaignId: 'campaign',
    operationId: 'first',
    expectedRevision: 1,
    patch: { status: 'archived' },
  };
  writePendingCampaignOperation('owner', input);
  expect(readPendingCampaignOperation('other', 'campaign')).toBeNull();
  expect(readPendingCampaignOperation('owner', 'other-campaign')).toBeNull();
  expect(() => writePendingCampaignOperation('owner', { ...input, operationId: 'second' })).toThrow(
    'pedido pendente',
  );
  clearPendingCampaignOperation('owner', 'campaign', 'second');
  expect(readPendingCampaignOperation('owner', 'campaign')).toEqual(input);
  clearPendingCampaignOperation('owner', 'campaign', 'first');
  expect(readPendingCampaignOperation('owner', 'campaign')).toBeNull();
});
it('falha ao preservar impede chamada de rede; DTO de outra conta mantém pedido incerto', async () => {
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new Error('Armazenamento indisponível');
  });
  const view = renderHook(() => useCampaignManagement(campaign));
  act(() => view.result.current.change('title', 'Novo'));
  await act(() => view.result.current.submit());
  expect(updateCampaign).not.toHaveBeenCalled();
  expect(view.result.current.error).toContain('Armazenamento indisponível');
  write.mockRestore();
  vi.mocked(updateCampaign).mockResolvedValue({ ...campaign, ownerId: 'other', revision: 2 });
  await act(() => view.result.current.submit());
  expect(view.result.current.pending).not.toBeNull();
  expect(view.result.current.error).toContain('não pôde ser validada');
});
it('gestão de campanha original conserva procedência e base ao trocar universo e usa a próxima revisão', async () => {
  campaign = {
    ...campaign,
    provenance: { kind: 'original', adventureId: 'adventure', baseId: 'captured-base' },
    activeBaseId: 'captured-base',
  };
  const confirmed = vi.fn();
  const view = renderHook(() => useCampaignManagement(campaign, { onConfirmed: confirmed }));
  act(() => view.result.current.change('universeId', null));
  await act(() => view.result.current.submit());
  expect(confirmed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      revision: 2,
      universeId: null,
      description: 'Descrição privada',
      provenance: { kind: 'original', adventureId: 'adventure', baseId: 'captured-base' },
      activeBaseId: 'captured-base',
    }),
  );
  act(() => view.result.current.change('title', 'Outra mesa'));
  await act(() => view.result.current.submit());
  expect(updateCampaign).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: 2, patch: { title: 'Outra mesa' } }),
  );
  expect(getCampaign).not.toHaveBeenCalled();
});
it('metadados não adotam outra procedência nem outra base recebida por engano', async () => {
  campaign = {
    ...campaign,
    provenance: { kind: 'original', adventureId: 'adventure', baseId: 'captured-base' },
    activeBaseId: 'captured-base',
  };
  vi.mocked(updateCampaign).mockResolvedValue({
    ...campaign,
    revision: 2,
    provenance: { kind: 'original', adventureId: 'adventure', baseId: 'other-base' },
    activeBaseId: 'other-base',
  });
  const confirmed = vi.fn();
  const view = renderHook(() => useCampaignManagement(campaign, { onConfirmed: confirmed }));
  act(() => view.result.current.change('title', 'Nova mesa'));
  await act(() => view.result.current.submit());
  expect(confirmed).not.toHaveBeenCalled();
  expect(view.result.current.pending).not.toBeNull();
});

it('gestão sem sessão não cria scope vazio e login/perda de sessão conservam guardas', async () => {
  auth.user = null;
  const h = renderHook(() => useCampaignManagement(campaign));
  await act(() => h.result.current.submit());
  expect(updateCampaign).not.toHaveBeenCalled();
  auth.user = { uid: 'owner' };
  h.rerender();
  act(() => h.result.current.change('title', 'Mesa após login'));
  await act(() => h.result.current.submit());
  expect(updateCampaign).toHaveBeenCalledOnce();
  auth.user = null;
  h.rerender();
  await act(() => h.result.current.submit());
  expect(updateCampaign).toHaveBeenCalledOnce();
});

it('reserva A vencida antes de RPC não envia alteração e conserva B integral', async () => {
  const h = renderHook(() => useCampaignManagement(campaign)),
    original = recovery.reserveCampaignManagementOperation;
  vi.spyOn(recovery, 'reserveCampaignManagementOperation').mockImplementationOnce(
    async (...args) => {
      await original(...args);
      const input = args[1];
      localStorage.setItem(
        'writer:campaign-management:' + JSON.stringify(['owner', 'campaign']),
        JSON.stringify({ ...input, operationId: 'B', patch: { description: 'Outro rascunho' } }),
      );
    },
  );
  act(() => h.result.current.change('title', 'Alteração A'));
  await act(() => h.result.current.submit());
  expect(updateCampaign).not.toHaveBeenCalled();
  expect(readPendingCampaignOperation('owner', 'campaign')).toMatchObject({
    operationId: 'B',
    patch: { description: 'Outro rascunho' },
  });
});
it('clear A concluído antes de resposta ao hook não apaga nem adota B posterior', async () => {
  const onConfirmed = vi.fn(),
    h = renderHook(() => useCampaignManagement(campaign, { onConfirmed })),
    original = recovery.clearCampaignManagementSnapshot;
  vi.spyOn(recovery, 'clearCampaignManagementSnapshot').mockImplementationOnce(async (...args) => {
    const value = await original(...args),
      input = args[1];
    localStorage.setItem(
      'writer:campaign-management:' + JSON.stringify(['owner', 'campaign']),
      JSON.stringify({ ...input, operationId: 'B', patch: { title: 'Pedido B' } }),
    );
    return value;
  });
  act(() => h.result.current.change('title', 'Pedido A'));
  await act(() => h.result.current.submit());
  expect(updateCampaign).toHaveBeenCalledOnce();
  expect(onConfirmed).not.toHaveBeenCalled();
  expect(h.result.current.pending).toMatchObject({ operationId: 'B' });
  expect(readPendingCampaignOperation('owner', 'campaign')).toMatchObject({ operationId: 'B' });
});
