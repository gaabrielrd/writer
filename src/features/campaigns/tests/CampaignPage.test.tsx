import { beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { CampaignPage } from '../components/CampaignPage';
import { getCampaign } from '../services/campaignService';
import type { Campaign } from '../model/campaign';
import type { ListSessionReferencesInput } from '@/features/campaign-session-references';
import { publishInvalidation } from '@/shared/services';
const preparationHost = vi.hoisted(() => ({
  props: null as null | {
    campaignId: string;
    openRequest?: import('@/features/campaign-preparation').CampaignPreparationOpenRequest | null;
    onPendingChange?: (pending: boolean) => void;
  },
}));
vi.mock('@/features/campaign-preparation', () => ({
  CampaignPreparationPanel: (props: NonNullable<typeof preparationHost.props>) => {
    preparationHost.props = props;
    const [text, setText] = useState('');
    return (
      <section aria-label={'Preparação própria ' + props.campaignId}>
        <label>
          Texto próprio da pista
          <input
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              props.onPendingChange?.(Boolean(event.target.value));
            }}
          />
        </label>
      </section>
    );
  },
}));
const sessionCalls = vi.hoisted(() => ({
  listCampaignSessions: vi.fn(),
  getCampaignSession: vi.fn(),
  saveCampaignSession: vi.fn(),
  moveCampaignSession: vi.fn(),
  deleteCampaignSession: vi.fn(),
}));
vi.mock('@/features/campaign-sessions/services/campaignSessionCallables', () => sessionCalls);
const referenceCalls = vi.hoisted(() => ({
  listCampaignSessionReferences: vi.fn<(input: ListSessionReferencesInput) => Promise<unknown>>(),
  addCampaignSessionReference: vi.fn(),
  removeCampaignSessionReference: vi.fn(),
  readCampaignSessionLoreReference: vi.fn(),
  resolveCampaignSessionReferenceOperation: vi.fn(),
}));
vi.mock(
  '@/features/campaign-session-references/services/sessionReferenceCallables',
  () => referenceCalls,
);

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
vi.mock('@/features/universes', () => ({ UniverseSelect: () => null }));
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
const loreHost = vi.hoisted(() => ({ notify: null as null | ((token: string | null) => void) }));
vi.mock('@/features/campaign-lore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/campaign-lore')>()),
  CampaignLorePanel: ({
    campaignId,
    baseId,
    onProjectionChange,
  }: {
    campaignId: string;
    baseId: string;
    onProjectionChange?: (token: string | null) => void;
  }) => {
    loreHost.notify = onProjectionChange ?? null;
    return (
      <section aria-label={'Lore da mesa ' + campaignId + '/' + baseId}>
        Variantes particulares
      </section>
    );
  },
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
vi.mock('../components/CampaignDeletionControls', () => ({
  CampaignDeletionControls: ({ onRevoked }: { onRevoked: () => void }) => (
    <button onClick={onRevoked}>Retomar limpeza da campanha</button>
  ),
}));
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
  preparationHost.props = null;
  localStorage.clear();
  auth.user = { uid: 'owner' };
  auth.loading = false;
  vi.mocked(getCampaign).mockResolvedValue(resource);
  vi.mocked(sessionCalls.listCampaignSessions).mockResolvedValue({
    schemaVersion: 1,
    ownerId: 'owner',
    campaignId: 'project',
    campaignToken: 'a'.repeat(64),
    collectionRevision: 0,
    items: [],
    nextCursor: null,
  });
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
it('pulso oculta todo conteúdo e preserva entrada de exclusão; reconsulta autorizada monta conteúdo atual', async () => {
  render(tree());
  await screen.findByText('História privada');
  act(() => publishInvalidation({ actorId: 'owner', scope: 'campaign:project' }));
  expect(screen.queryByText('História privada')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Notas próprias project' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retomar limpeza da campanha' })).toBeEnabled();
  expect(screen.getByRole('heading', { name: 'Conteúdo da campanha oculto' })).toBeInTheDocument();
  vi.mocked(getCampaign).mockResolvedValue({ ...resource, description: 'Descrição conferida' });
  await userEvent.click(
    screen.getByRole('button', { name: 'Conferir disponibilidade da campanha' }),
  );
  expect(await screen.findByText('Descrição conferida')).toBeInTheDocument();
});
it('prova confirmada pelo controle oculta campanha e GET negado não ressuscita notas ou conteúdo', async () => {
  render(tree());
  await screen.findByText('História privada');
  await userEvent.click(screen.getByRole('button', { name: 'Retomar limpeza da campanha' }));
  expect(screen.queryByText('História privada')).not.toBeInTheDocument();
  vi.mocked(getCampaign).mockResolvedValue(null);
  await userEvent.click(
    screen.getByRole('button', { name: 'Conferir disponibilidade da campanha' }),
  );
  await waitFor(() => expect(getCampaign).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('heading', { name: 'Conteúdo da campanha oculto' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retomar limpeza da campanha' })).toBeEnabled();
});
it('erro transitório ao focar preserva texto em edição e nova conferência não adota metadados silenciosamente', async () => {
  render(tree());
  await screen.findByText('História privada');
  await userEvent.click(screen.getByRole('button', { name: 'Editar campanha' }));
  const field = screen.getByRole('textbox', { name: /Descrição da campanha/ });
  await userEvent.clear(field);
  await userEvent.type(field, 'Rascunho privado ainda não enviado');
  vi.mocked(getCampaign).mockRejectedValueOnce(new Error('Conexão temporária'));
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(await screen.findByText('Conexão temporária')).toBeInTheDocument();
  expect(field).toHaveValue('Rascunho privado ainda não enviado');
  vi.mocked(getCampaign).mockResolvedValue({ ...resource, title: 'Título remoto' });
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(() => expect(screen.queryByText('Conexão temporária')).not.toBeInTheDocument());
  expect(screen.getByRole('textbox', { name: 'Título da campanha' })).toHaveValue('Meu projeto');
  expect(field).toHaveValue('Rascunho privado ainda não enviado');
});
it('GET de campanha anterior ao pulso e GET de foco antigo não voltam a exibir conteúdo', async () => {
  let resolveInitial!: (value: Campaign) => void;
  vi.mocked(getCampaign).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveInitial = resolve;
      }),
  );
  render(tree());
  act(() => publishInvalidation({ actorId: 'owner', scope: 'campaign:project' }));
  await act(async () => {
    resolveInitial(resource);
    await Promise.resolve();
  });
  expect(screen.queryByText('História privada')).not.toBeInTheDocument();
  let resolveFocus!: (value: Campaign) => void;
  vi.mocked(getCampaign).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFocus = resolve;
      }),
  );
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  act(() => publishInvalidation({ actorId: 'owner', scope: 'campaign:project' }));
  await act(async () => {
    resolveFocus(resource);
    await Promise.resolve();
  });
  expect(screen.getByRole('heading', { name: 'Conteúdo da campanha oculto' })).toBeInTheDocument();
  expect(screen.queryByText('História privada')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Conferir disponibilidade da campanha' }),
  ).toBeEnabled();
});

it('preserva preparação autoral não salva e pendência durante a atualização da base', async () => {
  const original: Campaign = {
    ...resource,
    provenance: { kind: 'original', adventureId: 'adventure', baseId: 'generation' },
    activeBaseId: 'generation',
  };
  let finish!: (value: Campaign) => void;
  vi.mocked(getCampaign)
    .mockResolvedValueOnce(original)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  render(tree());
  await userEvent.click(await screen.findByRole('button', { name: 'Nova sessão' }));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Título da sessão' }),
    'Sessão das torres',
  );
  const preparation = screen.getByRole('textbox', { name: 'Preparação da sessão' });
  await userEvent.type(preparation, 'Texto autoral ainda não enviado');
  await userEvent.click(screen.getByRole('button', { name: 'Fechar preparação' }));
  expect(auth.setPendingEditorOperation).toHaveBeenLastCalledWith(true);
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar adoção retomada' }));
  await waitFor(() => expect(getCampaign).toHaveBeenCalledTimes(2));
  expect(screen.getByText('Carregando campanha...')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Rever preparação da sessão' }));
  expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
    'Texto autoral ainda não enviado',
  );
  await act(async () => {
    finish({
      ...original,
      revision: 2,
      activeBaseId: 'next-generation',
      provenance: { kind: 'original', adventureId: 'adventure', baseId: 'next-generation' },
    });
    await Promise.resolve();
  });
  expect(screen.getByRole('textbox', { name: 'Título da sessão' })).toHaveValue(
    'Sessão das torres',
  );
  expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
    'Texto autoral ainda não enviado',
  );
  expect(auth.setPendingEditorOperation).toHaveBeenLastCalledWith(true);
  expect(sessionCalls.saveCampaignSession).not.toHaveBeenCalled();
  act(() => publishInvalidation({ actorId: 'owner', scope: 'campaign:project' }));
  expect(screen.queryByRole('textbox', { name: 'Preparação da sessão' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Conteúdo da campanha oculto' })).toBeInTheDocument();
});

it('compõe vínculos na sessão salva sem consultar novamente a cada tecla e agrega recuperação independente', async () => {
  vi.mocked(getCampaign).mockResolvedValue({
    ...resource,
    provenance: { kind: 'original', adventureId: 'adventure', baseId: 'a'.repeat(64) },
    activeBaseId: 'a'.repeat(64),
  });
  const token = 'a'.repeat(64),
    session = {
      id: 'session-reference-host01',
      schemaVersion: 1,
      ownerId: 'owner',
      campaignId: 'project',
      revision: 1,
      order: 1,
      title: 'Sessão salva',
      summary: 'Preparação salva',
      scheduledDate: null,
      status: 'planned',
      createdAt: 1000,
      updatedAt: 1000,
    };
  const envelope = {
    schemaVersion: 1,
    ownerId: 'owner',
    campaignId: 'project',
    campaignToken: token,
    collectionRevision: 1,
  };
  sessionCalls.listCampaignSessions.mockResolvedValue({
    ...envelope,
    items: [Object.fromEntries(Object.entries(session).filter(([key]) => key !== 'summary'))],
    nextCursor: null,
  });
  sessionCalls.getCampaignSession.mockResolvedValue({ ...envelope, session });
  referenceCalls.listCampaignSessionReferences.mockImplementation((input) =>
    Promise.resolve({
      schemaVersion: 1,
      ownerId: 'owner',
      campaignId: input.campaignId,
      campaignToken: token,
      sessionId: input.sessionId,
      sessionRevision: input.expectedSessionRevision,
      referenceCollectionRevision: 0,
      view: 'references',
      sourceContext: { baseId: 'a'.repeat(64), projectionToken: 'b'.repeat(64) },
      items: [
        {
          id: 'reference-host-operation1',
          revision: 1,
          createdAt: 1000,
          updatedAt: 1000,
          available: true,
          target: {
            kind: 'lore',
            sourceKey: 'c'.repeat(64),
            name: 'Referência antiga da mesa',
            category: 'character',
            revision: 0,
            mode: 'base',
            legacy: false,
          },
        },
      ],
      nextCursor: null,
    }),
  );
  render(tree());
  await userEvent.click(await screen.findByRole('button', { name: 'Editar sessão Sessão salva' }));
  await screen.findByText('Referência antiga da mesa');
  const calls = referenceCalls.listCampaignSessionReferences.mock.calls.length;
  const preparation = screen.getByRole('textbox', { name: 'Preparação da sessão' });
  await userEvent.type(preparation, ' com rascunho próprio');
  expect(referenceCalls.listCampaignSessionReferences).toHaveBeenCalledTimes(calls);
  expect(preparation).toHaveValue('Preparação salva com rascunho próprio');
  referenceCalls.listCampaignSessionReferences.mockImplementationOnce(() => new Promise(() => {}));
  act(() => loreHost.notify?.(null));
  await waitFor(() =>
    expect(referenceCalls.listCampaignSessionReferences).toHaveBeenCalledTimes(calls + 1),
  );
  expect(screen.queryByText('Referência antiga da mesa')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
    'Preparação salva com rascunho próprio',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Fechar preparação' }));
  expect(auth.setPendingEditorOperation).toHaveBeenLastCalledWith(true);
  const control = {
    schemaVersion: 1,
    ownerId: 'owner',
    intent: 'cancel',
    action: 'remove',
    request: {
      campaignId: 'project',
      campaignToken: token,
      sessionId: session.id,
      expectedSessionRevision: 1,
      referenceId: 'reference-host-operation1',
      operationId: 'reference-host-operation2',
      expectedRevision: 1,
      expectedReferenceCollectionRevision: 1,
    },
  };
  const key = 'writer:session-references:' + JSON.stringify(['owner', 'project']);
  act(() => {
    localStorage.setItem(key, JSON.stringify(control));
    window.dispatchEvent(new StorageEvent('storage', { key }));
  });
  await screen.findByRole('heading', { name: 'Pedidos de vínculo de sessão' });
  await userEvent.click(screen.getByRole('button', { name: 'Rever preparação da sessão' }));
  expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
    'Preparação salva com rascunho próprio',
  );
  expect(auth.setPendingEditorOperation).toHaveBeenLastCalledWith(true);
  expect(referenceCalls.resolveCampaignSessionReferenceOperation).not.toHaveBeenCalled();
  expect(sessionCalls.saveCampaignSession).not.toHaveBeenCalled();
});

it('mantém host de pistas e pendência autoral durante projeção e adoção da base', async () => {
  const original: Campaign = {
    ...resource,
    provenance: { kind: 'original', adventureId: 'adventure', baseId: 'generation' },
    activeBaseId: 'generation',
  };
  vi.mocked(getCampaign).mockResolvedValue(original);
  render(tree());
  await screen.findByText('História privada');
  const field = screen.getByRole('textbox', { name: 'Texto próprio da pista' });
  await userEvent.type(field, 'Pista própria ainda não enviada');
  expect(auth.setPendingEditorOperation).toHaveBeenLastCalledWith(true);
  act(() => loreHost.notify?.(null));
  expect(screen.getByRole('textbox', { name: 'Texto próprio da pista' })).toBe(field);
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar adoção retomada' }));
  await waitFor(() => expect(getCampaign).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('textbox', { name: 'Texto próprio da pista' })).toBe(field);
  expect(field).toHaveValue('Pista própria ainda não enviada');
  expect(auth.setPendingEditorOperation).toHaveBeenLastCalledWith(true);
});

it('slot passa sessão salva ao host estável sem copiar ou salvar preparação S1 suja', async () => {
  const token = 'a'.repeat(64);
  const session = {
    id: 'session-preparation-host01',
    schemaVersion: 1,
    ownerId: 'owner',
    campaignId: 'project',
    revision: 2,
    order: 1,
    title: 'Sessão para pistas',
    summary: 'Preparação salva',
    scheduledDate: null,
    status: 'planned',
    createdAt: 1000,
    updatedAt: 2000,
  };
  const envelope = {
    schemaVersion: 1,
    ownerId: 'owner',
    campaignId: 'project',
    campaignToken: token,
    collectionRevision: 2,
  };
  sessionCalls.listCampaignSessions.mockResolvedValue({
    ...envelope,
    items: [Object.fromEntries(Object.entries(session).filter(([key]) => key !== 'summary'))],
    nextCursor: null,
  });
  sessionCalls.getCampaignSession.mockResolvedValue({ ...envelope, session });
  referenceCalls.listCampaignSessionReferences.mockResolvedValue({
    schemaVersion: 1,
    ownerId: 'owner',
    campaignId: 'project',
    campaignToken: token,
    sessionId: session.id,
    sessionRevision: 2,
    referenceCollectionRevision: 0,
    view: 'references',
    sourceContext: null,
    items: [],
    nextCursor: null,
  });
  render(tree());
  const field = await screen.findByRole('textbox', { name: 'Texto próprio da pista' });
  await userEvent.type(field, 'Rascunho independente');
  await userEvent.click(
    await screen.findByRole('button', { name: 'Editar sessão Sessão para pistas' }),
  );
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Preparação da sessão' }),
    ' com rascunho',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Pistas e missões desta sessão' }));
  const request = preparationHost.props?.openRequest;
  expect(request).toMatchObject({
    requestId: 1,
    view: 'pending',
    session: {
      campaignId: 'project',
      campaignToken: token,
      sessionId: session.id,
      expectedSessionRevision: 2,
      readOnly: false,
    },
  });
  expect(request?.session.isActive()).toBe(true);
  expect(screen.getByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
    'Preparação salva com rascunho',
  );
  expect(field).toHaveValue('Rascunho independente');
  await userEvent.click(screen.getByRole('button', { name: 'Fechar preparação' }));
  expect(request?.session.isActive()).toBe(false);
  expect(screen.getByRole('textbox', { name: 'Texto próprio da pista' })).toBe(field);
  expect(auth.setPendingEditorOperation).toHaveBeenLastCalledWith(true);
  expect(sessionCalls.saveCampaignSession).not.toHaveBeenCalled();
});
