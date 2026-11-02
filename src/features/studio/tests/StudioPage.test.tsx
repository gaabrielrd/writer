import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { chooseDropdown as chooseSharedDropdown } from '@/test/dropdown';
import { publishInvalidation } from '@/shared/services';
import { StudioPage } from '../components/StudioPage';
import {
  createBook,
  getBook,
  listStudioBooks,
  prepareStudioBooks,
  type StudioBookSummary,
} from '@/features/books';
import { listAdventures, getAdventure, type Adventure } from '@/features/adventures';
import {
  createCampaign,
  listCampaigns,
  type Campaign,
  type CampaignSummary,
} from '@/features/campaigns';

const auth = vi.hoisted((): { user: { uid: string } | null; loading: boolean } => ({
  user: { uid: 'owner' },
  loading: false,
}));
const restore = vi.hoisted(() => ({ visible: false, guard: vi.fn() }));
vi.mock('@/features/book-portability', () => ({
  BookRestorePreparations: ({ onResume }: { onResume: (id: string) => void }) =>
    restore.visible ? (
      <section aria-label="Restaurações de livros">
        <button onClick={() => onResume('restore-studio-0001')}>Retomar restauração</button>
      </section>
    ) : null,
  BookRestoreDialog: ({
    open,
    restoreId,
    onClose,
    onOpenBook,
  }: {
    open: boolean;
    restoreId?: string;
    onClose: () => void;
    onOpenBook: (id: string, guard: () => void) => Promise<void>;
  }) =>
    open ? (
      <section aria-label="Backup no Estúdio">
        <p>{restoreId ? 'Preparação existente' : 'Nova cópia privada'}</p>
        <button
          onClick={() => {
            void onOpenBook('restored-book', () => {
              restore.guard();
            }).catch(() => {});
          }}
        >
          Abrir cópia conferida
        </button>
        <button onClick={onClose}>Fechar restauração</button>
      </section>
    ) : null,
}));
const adventureRestore = vi.hoisted(() => ({ visible: false, guard: vi.fn() }));
vi.mock('@/features/adventure-portability', () => ({
  AdventureRestorePreparations: ({ onResume }: { onResume: (id: string) => void }) =>
    adventureRestore.visible ? (
      <button onClick={() => onResume('adventure-restore-studio-0001')}>
        Retomar aventura do backup
      </button>
    ) : null,
  AdventureRestoreDialog: ({
    open,
    restoreId,
    onClose,
    onOpenAdventure,
  }: {
    open: boolean;
    restoreId?: string;
    onClose: () => void;
    onOpenAdventure: (id: string, guard: () => void) => Promise<void>;
  }) =>
    open ? (
      <section aria-label="Backup de aventura no Estúdio">
        <p>{restoreId ? 'Preparação de aventura existente' : 'Nova aventura privada'}</p>
        <button
          onClick={() => {
            void onOpenAdventure('restored-adventure', () => {
              adventureRestore.guard();
            }).catch(() => {});
          }}
        >
          Abrir aventura conferida
        </button>
        <button onClick={onClose}>Fechar restauração de aventura</button>
      </section>
    ) : null,
}));
const captures = vi.hoisted(() => ({ visible: false }));
const comparisons = vi.hoisted(() => ({ visible: false }));
const adoptions = vi.hoisted(() => ({ visible: false }));
vi.mock('@/features/campaign-adoptions', () => ({
  CampaignAdoptionPreparations: () =>
    adoptions.visible ? (
      <section aria-label="Atualizações sem campanha">Retomar atualização própria</section>
    ) : null,
  CampaignAdoptionDialog: ({
    open,
    selection,
    onClose,
  }: {
    open: boolean;
    selection: { context?: import('@/features/campaign-comparisons').ComparisonReadEnvelope };
    onClose: () => void;
  }) =>
    open ? (
      <section aria-label="Revisão observada no Estúdio">
        <p>Revisão {selection.context?.collectionRevision}</p>
        <button onClick={onClose}>Fechar revisão no Estúdio</button>
      </section>
    ) : null,
}));
vi.mock('@/features/campaign-comparisons', () => ({
  CampaignComparisonPreparations: ({
    onReviewAdoption,
  }: {
    onReviewAdoption?: (
      context: import('@/features/campaign-comparisons').ComparisonReadEnvelope,
    ) => void;
  }) =>
    comparisons.visible ? (
      <section aria-label="Candidatas sem campanha">
        Retomar comparação privada
        <button
          onClick={() =>
            onReviewAdoption?.({
              schemaVersion: 1,
              ownerId: 'owner',
              campaignId: 'missing-root',
              comparisonId: 'comparison',
              campaignToken: 'c'.repeat(64),
              currentBaseId: 'a'.repeat(64),
              candidateBaseId: 'b'.repeat(64),
              currentCapturedAt: 1000,
              candidateCapturedAt: 2000,
              collectionRevision: 7,
              comparisonToken: 'e'.repeat(64),
            })
          }
        >
          Revisar candidata observada no Estúdio
        </button>
      </section>
    ) : null,
}));
vi.mock('@/features/campaign-bases', () => ({
  CampaignCapturePreparations: ({ onActivated }: { onActivated: (id: string) => void }) =>
    captures.visible ? (
      <section aria-label="Campanhas em preparação">
        <button onClick={() => onActivated('captured-campaign')}>
          Retomar pedido sem aventura disponível
        </button>
      </section>
    ) : null,
}));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('@/features/books', () => ({
  createBook: vi.fn(),
  getBook: vi.fn(),
  listStudioBooks: vi.fn(),
  prepareStudioBooks: vi.fn(),
  BookCard: ({ book }: { book: StudioBookSummary }) => (
    <Link to={'/books/' + book.id}>{book.title}</Link>
  ),
  BookFormDialog: ({
    open,
    onSubmit,
    onClose,
  }: {
    open: boolean;
    onSubmit: (input: { title: string; creationId: string }) => Promise<void>;
    onClose: () => void;
  }) =>
    open ? (
      <div>
        <button onClick={() => void onSubmit({ title: 'Manual', creationId: 'stable-book' })}>
          Confirmar livro manual
        </button>
        <button onClick={onClose}>Cancelar livro</button>
      </div>
    ) : null,
  ImportBookModal: ({
    open,
    onSuccess,
    onClose,
  }: {
    open: boolean;
    onSuccess: (id: string) => void;
    onClose: () => void;
  }) =>
    open ? (
      <div>
        <button onClick={() => onSuccess('imported')}>Concluir importação</button>
        <button onClick={onClose}>Cancelar importação</button>
      </div>
    ) : null,
}));
vi.mock('@/features/adventure-import', () => ({
  AdventureImportDialog: () => null,
  AdventureImportPreparations: () => null,
}));
vi.mock('@/features/adventures', () => ({
  AdventureDeletionPreparations: () => null,
  AdventureDeletionDialog: ({
    open,
    onClose,
    adventureId,
  }: {
    open: boolean;
    onClose: () => void;
    adventureId: string;
  }) =>
    open ? (
      <section aria-label="Exclusão observada no Estúdio">
        <p>{adventureId}</p>
        <button
          onClick={() => {
            vi.mocked(listAdventures).mockResolvedValue({ items: [], nextCursor: null });
            publishInvalidation({ actorId: 'owner', scope: 'adventures' });
          }}
        >
          Revogar aventura observada
        </button>
        <button onClick={onClose}>Fechar exclusão observada</button>
      </section>
    ) : null,
  listAdventures: vi.fn(),
  createAdventure: vi.fn(),
  getAdventure: vi.fn(),
}));
vi.mock('@/features/campaigns', () => ({
  listCampaigns: vi.fn(),
  createCampaign: vi.fn(),
  CampaignDeletionControls: () => null,
  CampaignDeletionPreparations: () => null,
}));
vi.mock('@/features/universes', () => ({ UniverseSelect: () => <p>Universo opcional</p> }));
const book: StudioBookSummary = {
  id: 'old_book',
  kind: 'book',
  revision: 0,
  universeId: null,
  title: 'Livro existente',
  status: 'draft',
  coverUrl: null,
  wordCount: 15,
  createdAt: 1000,
  updatedAt: 2000,
};
const campaign: CampaignSummary = {
  id: 'campaign',
  kind: 'campaign',
  revision: 1,
  universeId: null,
  title: 'Mesa existente',
  status: 'planning',
  createdAt: 1000,
  updatedAt: 2000,
};
beforeEach(() => {
  adventureRestore.visible = false;
  adventureRestore.guard.mockReset();
  vi.mocked(getAdventure).mockReset();
  restore.visible = false;
  restore.guard.mockReset();
  vi.mocked(getBook).mockReset();
  adoptions.visible = false;
  comparisons.visible = false;
  captures.visible = false;
  vi.clearAllMocks();
  auth.user = { uid: 'owner' };
  auth.loading = false;
  vi.mocked(prepareStudioBooks).mockReset().mockResolvedValue({ complete: true, processed: 1 });
  vi.mocked(listStudioBooks)
    .mockReset()
    .mockResolvedValue({ items: [book], nextCursor: null });
  vi.mocked(listAdventures).mockReset().mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(listCampaigns)
    .mockReset()
    .mockResolvedValue({ items: [campaign], nextCursor: null });
  vi.mocked(createBook).mockReset();
  vi.mocked(createCampaign).mockReset();
});
it('atualização continua descobrível no Estúdio mesmo sem root de campanha listado', async () => {
  adoptions.visible = true;
  vi.mocked(listCampaigns).mockResolvedValue({ items: [], nextCursor: null });
  render(tree('operations'));
  expect(
    await screen.findByRole('region', { name: 'Atualizações sem campanha' }),
  ).toHaveTextContent('Retomar atualização própria');
});
it('candidatas continuam acessíveis mesmo sem campanha listada', async () => {
  comparisons.visible = true;
  vi.mocked(listCampaigns).mockResolvedValue({ items: [], nextCursor: null });
  render(tree('operations'));
  expect(await screen.findByRole('region', { name: 'Candidatas sem campanha' })).toHaveTextContent(
    'Retomar comparação privada',
  );
});
it('preparações permanecem acessíveis sem aventura listada e abrem a campanha confirmada', async () => {
  captures.visible = true;
  render(tree('operations'));
  expect(
    await screen.findByRole('region', { name: 'Campanhas em preparação' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Aventuras' })).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Retomar pedido sem aventura disponível' }),
  );
  expect(await screen.findByRole('heading', { name: 'Campanha aberta' })).toBeInTheDocument();
});
function tree(section = 'projects') {
  return (
    <MemoryRouter initialEntries={[section === 'home' ? '/studio' : '/studio/' + section]}>
      <nav aria-label="Navegação do host de testes">
        <Link to="/studio">Home do host</Link>
        <Link to="/studio/projects">Projetos do host</Link>
        <Link to="/studio/import">Importar do host</Link>
        <Link to="/studio/operations">Operações do host</Link>
      </nav>
      <Routes>
        <Route path="/studio/*" element={<StudioPage />} />
        <Route path="/books/new/assisted" element={<h1>Criação assistida preservada</h1>} />
        <Route path="/books/:bookId" element={<h1>Livro aberto</h1>} />
        <Route path="/adventures/:adventureId" element={<h1>Aventura aberta</h1>} />
        <Route path="/campaigns/:campaignId" element={<h1>Campanha aberta</h1>} />
        <Route path="/login" element={<h1>Entrar na conta</h1>} />
      </Routes>
    </MemoryRouter>
  );
}
async function chooseDropdown(
  user: Pick<typeof userEvent, 'click'>,
  trigger: HTMLElement,
  label: string,
) {
  if (trigger.getAttribute('role') === 'group')
    await user.click(within(trigger).getByRole('button', { name: label }));
  else await chooseSharedDropdown(user, trigger, label);
}
async function chooseType(label: string) {
  await chooseDropdown(userEvent, await screen.findByLabelText('Tipo de projeto'), label);
}
it('mostra três seções, mantém ID do livro e retoma a campanha real sem inventar total', async () => {
  render(tree('home'));
  expect(await screen.findByRole('heading', { name: 'Continuar meu trabalho' })).toBeVisible();
  await userEvent.click(screen.getByRole('link', { name: 'Projetos do host' }));
  expect(await screen.findByRole('link', { name: /Livro existente/ })).toHaveAttribute(
    'href',
    '/books/old_book',
  );
  expect(await screen.findByRole('link', { name: /Mesa existente/ })).toHaveAttribute(
    'href',
    '/campaigns/campaign',
  );
  expect(screen.getByRole('region', { name: 'Aventuras' })).toHaveTextContent(
    'Nenhum projeto nesta lista',
  );
  expect(prepareStudioBooks).toHaveBeenCalledWith({ limit: 25 });
  expect(listStudioBooks).toHaveBeenCalledWith({ status: 'all', cursor: null, limit: 25 });
  expect(screen.queryByText(/total de projetos/i)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: /Mesa existente/ }));
  expect(screen.getByRole('heading', { name: 'Campanha aberta' })).toBeInTheDocument();
});
it('não mostra livros vazios antes de terminar a preparação e apresenta progresso real', async () => {
  let finish!: (progress: { complete: boolean; processed: number }) => void;
  vi.mocked(prepareStudioBooks)
    .mockResolvedValueOnce({ complete: false, processed: 25 })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  render(tree());
  const books = screen.getByRole('region', { name: 'Livros' });
  expect(await within(books).findByText('25 livros verificados.')).toBeInTheDocument();
  expect(within(books).queryByText('Nenhum projeto nesta lista')).not.toBeInTheDocument();
  expect(listStudioBooks).not.toHaveBeenCalled();
  await act(async () => {
    finish({ complete: true, processed: 26 });
    await Promise.resolve();
  });
  expect(await screen.findByRole('link', { name: /Livro existente/ })).toBeInTheDocument();
});
it('retoma preparação que falhou sem esconder outros projetos disponíveis', async () => {
  vi.mocked(prepareStudioBooks)
    .mockRejectedValueOnce(new Error('Falha na preparação'))
    .mockResolvedValue({ complete: true, processed: 1 });
  render(tree());
  expect(await screen.findByText('Falha na preparação')).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /Mesa existente/ })).toBeInTheDocument();
  await userEvent.click(
    within(screen.getByRole('region', { name: 'Livros' })).getByRole('button', {
      name: 'Tentar novamente',
    }),
  );
  expect(await screen.findByRole('link', { name: /Livro existente/ })).toBeInTheDocument();
});
it('carrega mais, preserva a página em erro e deduplica IDs após retry', async () => {
  vi.mocked(listCampaigns)
    .mockResolvedValueOnce({ items: [campaign], nextCursor: 'page-2' })
    .mockRejectedValueOnce(new Error('Página indisponível'))
    .mockResolvedValue({
      items: [campaign, { ...campaign, id: 'campaign-2', title: 'Outra mesa' }],
      nextCursor: null,
    });
  render(tree());
  await screen.findByRole('link', { name: /Mesa existente/ });
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais campanhas' }));
  expect(await screen.findByText('Página indisponível')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Mesa existente/ })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais campanhas' }));
  expect(await screen.findByRole('link', { name: /Outra mesa/ })).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: /Mesa existente/ })).toHaveLength(1);
  expect(listCampaigns).toHaveBeenLastCalledWith({ status: 'all', cursor: 'page-2', limit: 25 });
  expect(screen.queryByRole('button', { name: 'Carregar mais campanhas' })).not.toBeInTheDocument();
});
it('consulta estado do domínio e invalida resposta da página anterior ao trocar o filtro', async () => {
  let finish!: (value: { items: CampaignSummary[]; nextCursor: string | null }) => void;
  vi.mocked(listCampaigns)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ items: [], nextCursor: null });
  render(tree());
  await chooseType('Campanhas');
  await chooseDropdown(userEvent, screen.getByLabelText('Estado de Campanhas'), 'Em andamento');
  await act(async () => {
    finish({ items: [campaign], nextCursor: 'old' });
    await Promise.resolve();
  });
  expect(
    await screen.findByText('Não há projetos neste estado. Experimente outro filtro.'),
  ).toBeInTheDocument();
  expect(screen.queryByText('Mesa existente')).not.toBeInTheDocument();
  expect(listCampaigns).toHaveBeenLastCalledWith({ status: 'active', cursor: null, limit: 25 });
  expect(screen.queryByRole('region', { name: 'Livros' })).not.toBeInTheDocument();
});
it('filtra edição dos livros e aventuras separadamente de publicação, arquivo e campanhas', async () => {
  render(tree());
  await screen.findByRole('link', { name: /Livro existente/ });
  expect(screen.queryByLabelText('Estado editorial de Campanhas')).not.toBeInTheDocument();
  await chooseDropdown(
    userEvent,
    screen.getByLabelText('Estado editorial de Livros'),
    'Em revisão',
  );
  await waitFor(() =>
    expect(listStudioBooks).toHaveBeenLastCalledWith({
      status: 'all',
      editorialState: 'review',
      cursor: null,
      limit: 25,
    }),
  );
  await chooseDropdown(userEvent, screen.getByLabelText('Publicação de Livros'), 'Publicado');
  await waitFor(() =>
    expect(listStudioBooks).toHaveBeenLastCalledWith({
      status: 'published',
      editorialState: 'review',
      cursor: null,
      limit: 25,
    }),
  );
  await chooseDropdown(
    userEvent,
    screen.getByLabelText('Estado editorial de Aventuras'),
    'Rascunho',
  );
  await waitFor(() =>
    expect(listAdventures).toHaveBeenLastCalledWith({
      status: 'all',
      editorialState: 'draft',
      cursor: null,
      limit: 25,
    }),
  );
  await chooseDropdown(userEvent, screen.getByLabelText('Condição de Aventuras'), 'Arquivada');
  await waitFor(() =>
    expect(listAdventures).toHaveBeenLastCalledWith({
      status: 'archived',
      editorialState: 'draft',
      cursor: null,
      limit: 25,
    }),
  );
  expect(listCampaigns).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: /Mesa existente/ })).toBeVisible();
});
it('mantém carregamento nas janelas editoriais vazias e explica apenas o vazio final do filtro', async () => {
  let finish!: (value: Awaited<ReturnType<typeof listAdventures>>) => void;
  vi.mocked(listAdventures)
    .mockResolvedValueOnce({ items: [], nextCursor: null })
    .mockResolvedValueOnce({ items: [], nextCursor: 'window-2' })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  render(tree());
  const adventures = screen.getByRole('region', { name: 'Aventuras' });
  await within(adventures).findByText('Nenhum projeto nesta lista');
  await chooseDropdown(
    userEvent,
    within(adventures).getByLabelText('Estado editorial de Aventuras'),
    'Pronto',
  );
  await waitFor(() => expect(listAdventures).toHaveBeenCalledTimes(3));
  const loading = within(adventures).getByText('Carregando aventuras...');
  expect(loading).toBeVisible();
  expect(loading.closest('[role="status"]')).toBeInTheDocument();
  expect(within(adventures).queryByText('Nenhum projeto nesta lista')).not.toBeInTheDocument();
  await act(async () => {
    finish({ items: [], nextCursor: null });
    await Promise.resolve();
  });
  expect(
    await within(adventures).findByText('Não há projetos neste estado. Experimente outro filtro.'),
  ).toBeVisible();
});
it('reutiliza criação manual de livro e só abre o recurso devolvido após persistir', async () => {
  let finish!: (value: Awaited<ReturnType<typeof createBook>>) => void;
  vi.mocked(createBook).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(tree());
  await userEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Livro' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar livro manual' }));
  expect(createBook).toHaveBeenCalledWith('owner', { title: 'Manual', creationId: 'stable-book' });
  expect(screen.queryByText('Livro aberto')).not.toBeInTheDocument();
  await act(async () => {
    finish({ ...book, authorId: 'owner' });
    await Promise.resolve();
  });
  expect(await screen.findByRole('heading', { name: 'Livro aberto' })).toBeInTheDocument();
});
it.each(['import', 'assisted'])(
  'preserva entrada de importação ou criação assistida (%s)',
  async (action) => {
    render(tree(action === 'import' ? 'import' : 'projects'));
    if (action === 'import') {
      await userEvent.click(screen.getByRole('button', { name: 'Importar livro' }));
      await userEvent.click(screen.getByRole('button', { name: 'Concluir importação' }));
      expect(await screen.findByRole('heading', { name: 'Livro aberto' })).toBeInTheDocument();
    } else {
      await userEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Livro com IA' }));
      expect(
        await screen.findByRole('heading', { name: 'Criação assistida preservada' }),
      ).toBeInTheDocument();
    }
  },
);
it('troca de conta não reapresenta resultados nem formulário privados pendentes', async () => {
  let finish!: (project: Campaign) => void;
  vi.mocked(createCampaign).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(tree());
  await screen.findByRole('link', { name: /Mesa existente/ });
  await userEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Campanha' }));
  await userEvent.type(screen.getByLabelText('Título da campanha'), 'Segredo da conta anterior');
  await userEvent.click(screen.getByRole('button', { name: 'Criar campanha' }));
  auth.user = { uid: 'new-owner' };
  vi.mocked(listStudioBooks).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(listCampaigns).mockResolvedValue({ items: [], nextCursor: null });
  view.rerender(tree());
  expect(screen.queryByText('Mesa existente')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Título da campanha')).not.toBeInTheDocument();
  await act(async () => {
    finish({
      ...campaign,
      ownerId: 'owner',
      schemaVersion: 1,
      description: 'privada',
      provenance: { kind: 'independent' },
    });
    await Promise.resolve();
  });
  expect(screen.queryByText('Campanha aberta')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Campanha' }));
  expect(screen.getByLabelText('Título da campanha')).toHaveValue('');
});
it('aguarda sessão e direciona visitante ao login sem consultar projetos', async () => {
  auth.loading = true;
  const view = render(tree());
  expect(screen.getByText('Carregando sessão...')).toBeInTheDocument();
  expect(listStudioBooks).not.toHaveBeenCalled();
  auth.loading = false;
  auth.user = null;
  view.rerender(tree());
  expect(await screen.findByRole('heading', { name: 'Entrar na conta' })).toBeInTheDocument();
});
it('permite fechar formulários e mostra erro parcial de aventuras sem apagar livros', async () => {
  vi.mocked(listAdventures).mockRejectedValue(new Error('Aventuras offline'));
  render(tree());
  expect(await screen.findByText('Aventuras offline')).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /Livro existente/ })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Aventura' }));
  expect(screen.getByLabelText('Título da aventura')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Fechar formulário' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Importar do host' }));
  await userEvent.click(screen.getByRole('button', { name: 'Importar livro' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar importação' }));
  expect(screen.queryByRole('button', { name: 'Concluir importação' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Projetos do host' }));
  await userEvent.click(screen.getByRole('button', { name: 'Novo projeto' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Livro' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar livro' }));
  expect(screen.queryByRole('button', { name: 'Confirmar livro manual' })).not.toBeInTheDocument();
  const previousCalls = vi.mocked(prepareStudioBooks).mock.calls.length;
  await userEvent.click(
    within(screen.getByRole('region', { name: 'Livros' })).getByRole('button', {
      name: 'Atualizar livros',
    }),
  );
  await waitFor(() => expect(prepareStudioBooks).toHaveBeenCalledTimes(previousCalls + 1));
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
it('Estúdio abre revisão com envelope observado da candidata e fecha sem criar campanha ou repetir captura', async () => {
  comparisons.visible = true;
  vi.mocked(listCampaigns).mockResolvedValue({ items: [], nextCursor: null });
  render(tree('operations'));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Revisar candidata observada no Estúdio' }),
  );
  expect(screen.getByRole('region', { name: 'Revisão observada no Estúdio' })).toHaveTextContent(
    'Revisão 7',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Fechar revisão no Estúdio' }));
  expect(
    screen.queryByRole('region', { name: 'Revisão observada no Estúdio' }),
  ).not.toBeInTheDocument();
  expect(createCampaign).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Revisar candidata observada no Estúdio' }),
  );
  expect(screen.getByRole('region', { name: 'Revisão observada no Estúdio' })).toHaveTextContent(
    'Revisão 7',
  );
});

it('restauração usa ação própria sem substituir importação de documentos', async () => {
  render(tree('import'));
  await userEvent.click(await screen.findByRole('button', { name: 'Restaurar backup de livro' }));
  expect(screen.getByRole('region', { name: 'Backup no Estúdio' })).toHaveTextContent(
    'Nova cópia privada',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Fechar restauração' }));
  expect(screen.getByRole('button', { name: 'Importar livro' })).toBeInTheDocument();
});
it('retomada do backup continua acessível sem livro listado e abre somente com acesso atual ao servidor', async () => {
  restore.visible = true;
  vi.mocked(listStudioBooks).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(getBook).mockResolvedValue({ ...book, authorId: 'owner' });
  render(tree('operations'));
  await userEvent.click(await screen.findByRole('button', { name: 'Retomar restauração' }));
  expect(screen.getByRole('region', { name: 'Backup no Estúdio' })).toHaveTextContent(
    'Preparação existente',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Abrir cópia conferida' }));
  expect(await screen.findByRole('heading', { name: 'Livro aberto' })).toBeInTheDocument();
  expect(getBook).toHaveBeenCalledExactlyOnceWith('restored-book', { source: 'server' });
});
it.each([null, { ...book, authorId: 'other' }, { ...book, authorId: 'owner', deleting: true }])(
  'histórico de restauração não abre raiz ausente estrangeira ou em exclusão',
  async (value) => {
    vi.mocked(getBook).mockResolvedValue(value);
    render(tree('import'));
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar backup de livro' }));
    await userEvent.click(screen.getByRole('button', { name: 'Abrir cópia conferida' }));
    await waitFor(() => expect(getBook).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('heading', { name: 'Livro aberto' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Backup no Estúdio' })).toBeInTheDocument();
  },
);

it('resposta de acesso anterior à troca de conta não navega depois do await', async () => {
  let release: (book: import('@/features/books').Book | null) => void = () => {};
  vi.mocked(getBook).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  render(tree('import'));
  await userEvent.click(await screen.findByRole('button', { name: 'Restaurar backup de livro' }));
  await userEvent.click(screen.getByRole('button', { name: 'Abrir cópia conferida' }));
  expect(restore.guard).not.toHaveBeenCalled();
  restore.guard.mockImplementation(() => {
    throw Error('Conta encerrada');
  });
  act(() => {
    release({ ...book, authorId: 'owner' });
  });
  await waitFor(() => expect(restore.guard).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('heading', { name: 'Livro aberto' })).not.toBeInTheDocument();
});

const restoredAdventure: Adventure = {
  id: 'restored-adventure',
  ownerId: 'owner',
  schemaVersion: 1,
  revision: 1,
  title: 'Cópia de aventura',
  synopsis: '',
  language: 'pt-BR',
  origin: { kind: 'authored' },
  status: 'draft',
  universeId: null,
  createdAt: 1000,
  updatedAt: 2000,
};
it('restaurar aventura é ação própria e não abre o diálogo de livros', async () => {
  render(tree('import'));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Restaurar backup de aventura' }),
  );
  expect(screen.getByRole('region', { name: 'Backup de aventura no Estúdio' })).toHaveTextContent(
    'Nova aventura privada',
  );
  expect(screen.queryByRole('region', { name: 'Backup no Estúdio' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Fechar restauração de aventura' }));
  expect(screen.getByRole('button', { name: 'Restaurar backup de livro' })).toBeInTheDocument();
});
it('retoma aventura sem projeto listado e abre somente depois da leitura atual autorizada', async () => {
  adventureRestore.visible = true;
  vi.mocked(getAdventure).mockResolvedValue(restoredAdventure);
  render(tree('operations'));
  await userEvent.click(await screen.findByRole('button', { name: 'Retomar aventura do backup' }));
  expect(screen.getByRole('region', { name: 'Backup de aventura no Estúdio' })).toHaveTextContent(
    'Preparação de aventura existente',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Abrir aventura conferida' }));
  expect(await screen.findByRole('heading', { name: 'Aventura aberta' })).toBeInTheDocument();
  expect(getAdventure).toHaveBeenCalledExactlyOnceWith('restored-adventure');
  expect(adventureRestore.guard).toHaveBeenCalledTimes(1);
});
it.each([null, { ...restoredAdventure, ownerId: 'other' }])(
  'recibo histórico não abre aventura ausente ou de outra conta %#',
  async (value) => {
    vi.mocked(getAdventure).mockResolvedValue(value);
    render(tree('import'));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Restaurar backup de aventura' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Abrir aventura conferida' }));
    await waitFor(() => expect(adventureRestore.guard).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('heading', { name: 'Aventura aberta' })).not.toBeInTheDocument();
  },
);
it('troca de conta durante leitura da aventura impede navegação tardia', async () => {
  let release!: (value: Adventure | null) => void;
  vi.mocked(getAdventure).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  render(tree('import'));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Restaurar backup de aventura' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Abrir aventura conferida' }));
  adventureRestore.guard.mockImplementation(() => {
    throw Error('Conta encerrada');
  });
  act(() => release(restoredAdventure));
  await waitFor(() => expect(adventureRestore.guard).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('heading', { name: 'Aventura aberta' })).not.toBeInTheDocument();
});

it('mantém o diálogo de exclusão quando a invalidação retira o cartão sem alterar os outros projetos', async () => {
  vi.mocked(listAdventures).mockResolvedValue({
    items: [
      {
        id: 'adventure-project-0001',
        kind: 'adventure',
        title: 'Aventura a excluir',
        status: 'draft',
        revision: 1,
        universeId: null,
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
    nextCursor: null,
  });
  render(tree());
  await userEvent.click(
    await screen.findByRole('button', { name: 'Ações do projeto Aventura a excluir' }),
  );
  await userEvent.click(screen.getByRole('menuitem', { name: 'Excluir aventura' }));
  const dialog = screen.getByRole('region', { name: 'Exclusão observada no Estúdio' });
  expect(dialog).toHaveTextContent('adventure-project-0001');
  await userEvent.click(screen.getByRole('button', { name: 'Revogar aventura observada' }));
  await waitFor(() =>
    expect(screen.queryByRole('link', { name: /Aventura a excluir/ })).not.toBeInTheDocument(),
  );
  expect(dialog).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Livro existente/ })).toBeVisible();
  expect(screen.getByRole('link', { name: /Mesa existente/ })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Fechar exclusão observada' }));
  expect(dialog).not.toBeInTheDocument();
});
