import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { CampaignPage } from '../components/CampaignPage';
import { getCampaign } from '../services/campaignService';
import type { Campaign } from '../model/campaign';

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
vi.mock('@/features/campaign-comparisons', () => ({
  CampaignComparisonPanel: ({
    campaignId,
    currentBaseId,
    onReviewAdoption,
  }: {
    campaignId: string;
    currentBaseId: string;
    onReviewAdoption?: (
      context: import('@/features/campaign-comparisons').ComparisonReadEnvelope,
    ) => void;
  }) => (
    <section aria-label={'Comparação ' + campaignId + '/' + currentBaseId}>
      Candidata privada
      <button
        onClick={() =>
          onReviewAdoption?.({
            schemaVersion: 1,
            ownerId: 'owner',
            campaignId,
            comparisonId: 'comparison',
            campaignToken: 'c'.repeat(64),
            currentBaseId,
            candidateBaseId: 'candidate',
            currentCapturedAt: 1000,
            candidateCapturedAt: 2000,
            collectionRevision: 3,
            comparisonToken: 'e'.repeat(64),
          })
        }
      >
        Revisar adoção observada
      </button>
    </section>
  ),
}));
vi.mock('@/features/campaign-adoptions', () => ({
  CampaignAdoptionPreparations: ({
    campaignId,
    onAdopted,
    onAdaptLore,
  }: {
    campaignId: string;
    onAdopted: () => void;
    onAdaptLore: () => void;
  }) => (
    <section aria-label={'Atualizações ' + campaignId}>
      Retomar atualização<button onClick={onAdopted}>Confirmar adoção retomada</button>
      <button onClick={onAdaptLore}>Adaptar lore da preparação</button>
    </section>
  ),
  CampaignAdoptionDialog: ({
    open,
    selection,
    onAdopted,
    onClose,
  }: {
    open: boolean;
    selection: { campaignId: string };
    onAdopted: () => void;
    onClose: () => void;
  }) =>
    open ? (
      <section aria-label={'Adoção ' + selection.campaignId}>
        <button onClick={onAdopted}>Confirmar adoção observada</button>
        <button onClick={onClose}>Fechar adoção observada</button>
      </section>
    ) : null,
}));
vi.mock('@/features/campaign-notes', () => ({
  CampaignNotesPanel: ({ campaignId }: { campaignId: string }) => (
    <section aria-label={'Notas próprias ' + campaignId}>Anotações autorais preservadas</section>
  ),
}));
vi.mock('@/features/campaign-lore', () => ({
  CampaignLorePanel: ({ campaignId, baseId }: { campaignId: string; baseId: string }) => (
    <section aria-label={'Lore da mesa ' + campaignId + '/' + baseId}>
      Variantes particulares
    </section>
  ),
}));
vi.mock('@/features/campaign-bases', () => ({
  CampaignBaseReader: ({
    campaignId,
    generationId,
  }: {
    campaignId: string;
    generationId: string;
  }) => (
    <section aria-label={'Base congelada ' + campaignId + '/' + generationId}>
      Origem indisponível para leitura
    </section>
  ),
}));
vi.mock('../services/campaignService', () => ({ getCampaign: vi.fn() }));
const resource: Campaign = {
  id: 'project',
  ownerId: 'owner',
  schemaVersion: 1,
  revision: 1,
  title: 'Meu projeto',
  description: 'História privada',
  provenance: { kind: 'independent' },
  status: 'planning',
  universeId: null,
  createdAt: 1000,
  updatedAt: 2000,
};
beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { uid: 'owner' };
  auth.loading = false;
  vi.mocked(getCampaign).mockResolvedValue(resource);
});
function tree() {
  return (
    <MemoryRouter initialEntries={['/campaigns/project']}>
      <Routes>
        <Route path="/campaigns/:campaignId" element={<CampaignPage />} />
        <Route path="/login" element={<p>Entrar na conta</p>} />
        <Route path="/studio" element={<h1>Estúdio</h1>} />
      </Routes>
    </MemoryRouter>
  );
}
it('abre metadados persistidos, mantém privacidade e permite retornar ao Estúdio', async () => {
  render(tree());
  expect(screen.getByText('Carregando campanha...')).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Meu projeto' })).toBeInTheDocument();
  expect(screen.getByText('História privada')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Notas próprias project' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /Lore da mesa/ })).not.toBeInTheDocument();
  expect(screen.getByText('Privada')).toBeInTheDocument();
  expect(screen.getByText('Projeto independente, sem universo vinculado.')).toBeInTheDocument();
  expect(getCampaign).toHaveBeenCalledWith('project');
  await userEvent.click(screen.getByRole('link', { name: 'Voltar ao Estúdio' }));
  expect(screen.getByRole('heading', { name: 'Estúdio' })).toBeInTheDocument();
});
it('mostra universo vinculado e campo vazio sem inventar sessão ou narrativa', async () => {
  vi.mocked(getCampaign).mockResolvedValue({ ...resource, description: '', universeId: 'world' });
  render(tree());
  expect(await screen.findByRole('link', { name: 'Abrir universo vinculado' })).toHaveAttribute(
    'href',
    '/universes/world/lore',
  );
  expect(screen.getByText('Nenhuma descrição cadastrada.')).toBeInTheDocument();
});
it.each([null, { ...resource, ownerId: 'another' }])(
  'não revela dados indisponíveis ou de outra conta (%j)',
  async (returned) => {
    vi.mocked(getCampaign).mockResolvedValue(returned);
    render(tree());
    expect(await screen.findByText('Campanha indisponível')).toBeInTheDocument();
    expect(screen.queryByText('História privada')).not.toBeInTheDocument();
  },
);
it('mantém erro acionável e tenta abrir novamente', async () => {
  vi.mocked(getCampaign)
    .mockRejectedValueOnce(new Error('Sem conexão'))
    .mockResolvedValue(resource);
  render(tree());
  expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByRole('heading', { name: 'Meu projeto' })).toBeInTheDocument();
});
it('aguarda autenticação e direciona visitante ao login', async () => {
  auth.loading = true;
  const view = render(tree());
  expect(screen.getByText('Carregando sessão...')).toBeInTheDocument();
  expect(getCampaign).not.toHaveBeenCalled();
  auth.loading = false;
  auth.user = null;
  view.rerender(tree());
  expect(await screen.findByText('Entrar na conta')).toBeInTheDocument();
});
it('ignora resposta antiga ao trocar a conta', async () => {
  let finish!: (value: Campaign) => void;
  vi.mocked(getCampaign)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(null);
  const view = render(tree());
  auth.user = { uid: 'new-owner' };
  view.rerender(tree());
  await act(async () => {
    finish(resource);
    await Promise.resolve();
  });
  expect(await screen.findByText('Campanha indisponível')).toBeInTheDocument();
  expect(screen.queryByText('História privada')).not.toBeInTheDocument();
});
it('não quebra a tela nem inventa data quando o DTO traz data inválida', async () => {
  vi.mocked(getCampaign).mockResolvedValue({ ...resource, updatedAt: Number.POSITIVE_INFINITY });
  render(tree());
  expect(await screen.findByText('Data indisponível')).toBeInTheDocument();
});
it('campanha original monta leitor da geração separadamente e preserva descrição e checklist próprios', async () => {
  vi.mocked(getCampaign).mockResolvedValue({
    ...resource,
    provenance: { kind: 'original', adventureId: 'adventure', baseId: 'generation' },
    activeBaseId: 'generation',
  });
  render(tree());
  expect(
    await screen.findByRole('region', { name: 'Base congelada project/generation' }),
  ).toBeInTheDocument();
  expect(screen.getByText('História privada')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Progresso de campaign/project' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Editar campanha' })).toBeEnabled();
  expect(screen.getByRole('region', { name: 'Comparação project/generation' })).toBeInTheDocument();
  expect(
    screen.getByRole('region', { name: 'Lore da mesa project/generation' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Notas próprias project' })).toBeInTheDocument();
});
it('adoção confirmada consulta DTO atual e remonta leitores sem substituir autoria própria pelo snapshot', async () => {
  const original: Campaign = {
    ...resource,
    provenance: { kind: 'original', adventureId: 'adventure', baseId: 'generation' },
    activeBaseId: 'generation',
  };
  vi.mocked(getCampaign)
    .mockResolvedValueOnce(original)
    .mockResolvedValueOnce({
      ...original,
      revision: 2,
      activeBaseId: 'next-generation',
      provenance: { kind: 'original', adventureId: 'adventure', baseId: 'next-generation' },
      description: 'Descrição própria atual',
    });
  render(tree());
  await userEvent.click(await screen.findByRole('button', { name: 'Revisar adoção observada' }));
  expect(screen.getByRole('region', { name: 'Adoção project' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar adoção observada' }));
  expect(
    await screen.findByRole('region', { name: 'Base congelada project/next-generation' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Descrição própria atual')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Notas próprias project' })).toBeInTheDocument();
  expect(getCampaign).toHaveBeenCalledTimes(2);
});

vi.mock('@/features/work-progress', async (original) => ({
  ...(await original<object>()),
  ProjectProgressPanel: ({ target }: { target: { kind: string; id: string } }) => (
    <h2>
      Progresso de {target.kind}/{target.id}
    </h2>
  ),
  ContinueWorkPanel: () => <h2>Continuar meu trabalho</h2>,
  useWorkActivity: vi.fn(() => ({ loading: false, error: '', conflict: false, retry: vi.fn() })),
  WorkActivityNotice: () => null,
}));
it('retomada confirmada recarrega campanha e adaptar retorna foco ao lore atual sem trocar base', async () => {
  const original: Campaign = {
    ...resource,
    provenance: { kind: 'original', adventureId: 'adventure', baseId: 'generation' },
    activeBaseId: 'generation',
  };
  vi.mocked(getCampaign).mockResolvedValue(original);
  render(tree());
  await userEvent.click(await screen.findByRole('button', { name: 'Adaptar lore da preparação' }));
  expect(screen.getByRole('region', { name: 'Editar lore atual da campanha' })).toHaveFocus();
  expect(getCampaign).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole('button', { name: 'Revisar adoção observada' }));
  await userEvent.click(screen.getByRole('button', { name: 'Fechar adoção observada' }));
  expect(screen.queryByRole('region', { name: 'Adoção project' })).not.toBeInTheDocument();
  expect(getCampaign).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar adoção retomada' }));
  await screen.findByRole('button', { name: 'Confirmar adoção retomada' });
  expect(getCampaign).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('region', { name: 'Notas próprias project' })).toHaveTextContent(
    'Anotações autorais preservadas',
  );
});
