import type {
  AssistedSession,
  AssistedRequest,
  loadAssistedBook,
  requestAssistedBook,
  commitAssistedBook,
} from '@/features/ai-assistant';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { NewProjectPage } from '../components/NewProjectPage';
import { chooseDropdown } from '@/test/dropdown';
const mocks = vi.hoisted(() => ({
  user: ((): { uid: string; credits: number } | null => ({ uid: 'owner', credits: 20 }))(),
  session: null as AssistedSession | null,
  load: vi.fn<typeof loadAssistedBook>(),
  request: vi.fn<typeof requestAssistedBook>(),
  commit: vi.fn<typeof commitAssistedBook>(),
  credits: vi.fn(),
}));
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: mocks.user, loading: false, updateUserCreditsState: mocks.credits }),
}));
vi.mock('@/features/universes', () => ({
  UniverseSelect: () => <p>Seletor de universo</p>,
  UniverseForm: () => null,
}));
vi.mock('@/features/ai-assistant', () => ({
  loadAssistedBook: mocks.load,
  requestAssistedBook: mocks.request,
  commitAssistedBook: mocks.commit,
  AssistedBookError: class extends Error {
    uncertain = true;
  },
  usePersonaLibrary: () => ({ personas: [], loading: false, error: null, retry: vi.fn() }),
  PersonaManager: () => null,
}));
function Opened() {
  const location = useLocation();
  const state: unknown = location.state;
  return (
    <h1>
      Projeto aberto{' '}
      {state && typeof state === 'object' && 'conception' in state ? String(state.conception) : ''}
    </h1>
  );
}
function tree() {
  return (
    <MemoryRouter initialEntries={['/studio/new']}>
      <main id="main-content">
        <Routes>
          <Route path="/studio/new" element={<NewProjectPage />} />
          <Route path="/books/:id" element={<Opened />} />
          <Route path="/adventures/:id" element={<Opened />} />
          <Route path="/campaigns/:id" element={<Opened />} />
        </Routes>
      </main>
    </MemoryRouter>
  );
}
beforeEach(() => {
  mocks.user = { uid: 'owner', credits: 20 };
  mocks.session = null;
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({ session: null, costs: { text: 2, cover: 5 } });
  mocks.request.mockImplementation((input: AssistedRequest) => {
    if (input.action === 'start')
      mocks.session = {
        ...input,
        id: input.sessionId,
        idea: input.idea ?? '',
        messages: [{ role: 'user', text: input.idea ?? '' }],
        brief: input.idea ?? '',
        revision: 0,
        ready: false,
        proposal: null,
        proposalExpiresAt: null,
        cover: null,
        expiresAt: Date.now() + 86400000,
        costs: { text: 2, cover: 5 },
      };
    else if (input.action === 'interview')
      mocks.session = {
        ...mocks.session!,
        revision: Number(mocks.session!.revision) + 1,
        messages: [
          { role: 'user', text: mocks.session!.idea },
          { role: 'assistant', text: 'Qual é o conflito?' },
        ],
      };
    else if (input.action === 'generate')
      mocks.session = {
        ...mocks.session!,
        revision: Number(mocks.session!.revision) + 1,
        proposal: {
          title: 'Ilhas',
          genre: 'Fantasia',
          synopsis: 'O último mar.',
          coverDirection: '',
          entities: [],
        },
      };
    else if (input.action === 'cover')
      mocks.session = {
        ...mocks.session!,
        revision: mocks.session!.revision + 1,
        proposal: input.proposal!,
        cover: {
          id: input.requestId,
          previewUrl: 'data:image/png;base64,aW1hZ2U=',
          expiresAt: Date.now() + 3600000,
          contextHash: 'cover-hash',
          context: {
            title: input.proposal!.title,
            genre: input.proposal!.genre,
            synopsis: input.proposal!.synopsis,
            direction: input.proposal!.coverDirection,
          },
        },
      };
    else if (input.action === 'save')
      mocks.session = {
        ...mocks.session!,
        revision: Number(mocks.session!.revision) + 1,
        proposal: input.proposal ?? null,
      };
    return Promise.resolve(structuredClone(mocks.session!));
  });
  mocks.commit.mockImplementation(() =>
    Promise.resolve({
      book: { id: mocks.session!.id },
      project: { kind: mocks.session!.kind!, id: mocks.session!.id },
      credits: mocks.session!.method === 'manual' ? 20 : 18,
    }),
  );
});
it('shows only the method choice first and preserves an idea when returning to context', async () => {
  render(tree());
  expect(screen.getByRole('heading', { name: 'Como deseja começar?' })).toHaveFocus();
  expect(screen.queryByRole('button', { name: /^Livro/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /^Manualmente/ }));
  await userEvent.click(screen.getByRole('button', { name: /^Aventura/ }));
  await userEvent.type(screen.getByLabelText('Ideia ou título inicial'), 'Ilhas');
  await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  await userEvent.click(screen.getByRole('button', { name: /^Campanha/ }));
  expect(screen.getByLabelText('Ideia ou título inicial')).toHaveValue('Ilhas');
  expect(mocks.commit).not.toHaveBeenCalled();
});
it.each([true, false])(
  'manual creation charges only the selected generated cover: %s',
  async (useCover) => {
    render(tree());
    await userEvent.click(screen.getByRole('button', { name: /^Manualmente/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Livro/ }));
    await userEvent.type(screen.getByLabelText('Ideia ou título inicial'), 'Ilhas');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByLabelText('Título do projeto');
    await userEvent.click(screen.getByRole('button', { name: /^Capa opcional/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Gerar capa · 5 créditos' }));
    expect(await screen.findByRole('img', { name: 'Capa proposta de Ilhas' })).toBeVisible();
    expect(mocks.request.mock.lastCall?.[0]).toMatchObject({
      action: 'cover',
      proposal: { title: 'Ilhas', genre: 'Livre', synopsis: 'Ilhas', entities: [] },
    });
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.credits).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Criar livro · 5 créditos' })).toBeVisible();
    if (!useCover) await userEvent.click(screen.getByRole('button', { name: 'Sem capa' }));
    await userEvent.click(
      screen.getByRole('button', {
        name: useCover ? 'Criar livro · 5 créditos' : 'Criar livro',
      }),
    );
    await screen.findByRole('heading', { name: /Projeto aberto/ });
    expect(mocks.commit.mock.lastCall?.[0]).toMatchObject({
      expectedCost: useCover ? 5 : 0,
      coverId: useCover ? mocks.session!.cover!.id : null,
    });
  },
);

for (const kind of ['Livro', 'Aventura', 'Campanha'])
  for (const method of ['manual', 'assisted'])
    it(`creates ${kind}/${method} only on confirmation and carries conception by ID`, async () => {
      render(tree());
      await userEvent.click(
        screen.getByRole('button', {
          name: method === 'manual' ? /^Manualmente/ : /^Com ajuda da IA/,
        }),
      );
      await userEvent.click(screen.getByRole('button', { name: new RegExp('^' + kind) }));
      await userEvent.type(
        screen.getByLabelText(method === 'manual' ? 'Ideia ou título inicial' : 'Sua ideia'),
        'Uma viagem entre ilhas.',
      );
      await userEvent.click(
        screen.getByRole('button', {
          name: method === 'manual' ? 'Continuar' : 'Começar conversa',
        }),
      );
      if (method === 'assisted') {
        await screen.findByText('Qual é o conflito?');
        await userEvent.click(screen.getByRole('button', { name: 'Revisar proposta inicial' }));
      }
      await screen.findByLabelText('Título do projeto');
      expect(mocks.commit).not.toHaveBeenCalled();
      await userEvent.click(
        screen.getByRole('button', { name: new RegExp('^Criar ' + kind.toLowerCase()) }),
      );
      expect(await screen.findByRole('heading', { name: /Projeto aberto/ })).toBeVisible();
      expect(mocks.commit).toHaveBeenCalledTimes(1);
      expect(mocks.commit.mock.calls[0]![0].expectedCost).toBe(method === 'manual' ? 0 : 2);
      expect(mocks.request.mock.calls[0]![0]).toMatchObject({
        flowVersion: 2,
        method,
        kind: { Livro: 'book', Aventura: 'adventure', Campanha: 'campaign' }[kind],
      });
    });
it('drops pending replies and drafts after an account change', async () => {
  let finish!: (value: AssistedSession) => void;
  mocks.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(tree());
  await userEvent.click(screen.getByRole('button', { name: /^Manualmente/ }));
  await userEvent.click(screen.getByRole('button', { name: /^Livro/ }));
  await userEvent.type(screen.getByLabelText('Ideia ou título inicial'), 'Segredo antigo');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  mocks.user = { uid: 'another', credits: 50 };
  view.rerender(tree());
  act(() => {
    finish({
      id: 'old',
      method: 'manual',
      idea: 'Segredo antigo',
      messages: [],
      brief: '',
      revision: 0,
      ready: false,
      proposal: null,
      proposalExpiresAt: null,
      cover: null,
      expiresAt: Date.now() + 10000,
      costs: { text: 2, cover: 5 },
    });
  });
  expect(screen.queryByText('Segredo antigo')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Como deseja começar?' })).toBeVisible();
  await waitFor(() => expect(mocks.commit).not.toHaveBeenCalled());
});

it('changing creation context does not carry a generated premise into a new manual project', async () => {
  render(tree());
  await userEvent.click(screen.getByRole('button', { name: /^Com ajuda da IA/ }));
  await userEvent.click(screen.getByRole('button', { name: /^Livro/ }));
  await userEvent.type(screen.getByLabelText('Sua ideia'), 'Minha ideia.');
  await userEvent.click(screen.getByRole('button', { name: 'Começar conversa' }));
  await screen.findByText('Qual é o conflito?');
  await userEvent.click(screen.getByRole('button', { name: 'Revisar proposta inicial' }));
  await screen.findByLabelText('Título do projeto');
  await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Revisar contexto' }));
  await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  await userEvent.click(screen.getByRole('button', { name: /^Manualmente/ }));
  await userEvent.click(screen.getByRole('button', { name: /^Campanha/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await screen.findByLabelText('Título do projeto');
  await userEvent.click(screen.getByRole('button', { name: /^Premissa e detalhes/ }));
  expect(screen.getByRole('combobox', { name: 'Gênero ou estilo' })).toHaveTextContent(
    'Definir depois',
  );
  expect(screen.getByLabelText('Conceito da campanha')).toHaveValue('');
});
it.each([
  ['Livro', 'Fantasia'],
  ['Aventura', 'Ficção científica'],
  ['Campanha', 'Terror'],
])('sends the selected genre when creating %s', async (kind, genre) => {
  render(tree());
  await userEvent.click(screen.getByRole('button', { name: /^Manualmente/ }));
  await userEvent.click(screen.getByRole('button', { name: new RegExp('^' + kind) }));
  await userEvent.type(screen.getByLabelText('Ideia ou título inicial'), 'Ilhas');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await screen.findByLabelText('Título do projeto');
  await userEvent.click(screen.getByRole('button', { name: /^Premissa e detalhes/ }));
  await chooseDropdown(
    userEvent,
    screen.getByRole('combobox', { name: 'Gênero ou estilo' }),
    genre,
  );
  expect(screen.queryByLabelText('Seu gênero ou estilo')).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: new RegExp('^Criar ' + kind.toLowerCase()) }),
  );
  await screen.findByRole('heading', { name: /Projeto aberto/ });
  expect(mocks.commit.mock.lastCall?.[0].proposal.genre).toBe(genre);
});

it('saves a custom genre, switches to a suggestion, and can leave it for later', async () => {
  render(tree());
  await userEvent.click(screen.getByRole('button', { name: /^Manualmente/ }));
  await userEvent.click(screen.getByRole('button', { name: /^Livro/ }));
  await userEvent.type(screen.getByLabelText('Ideia ou título inicial'), 'Ilhas');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await screen.findByLabelText('Título do projeto');
  await userEvent.click(screen.getByRole('button', { name: /^Premissa e detalhes/ }));
  const dropdown = screen.getByRole('combobox', { name: 'Gênero ou estilo' });
  await chooseDropdown(userEvent, dropdown, 'Criar meu estilo');
  await userEvent.type(screen.getByLabelText('Seu gênero ou estilo'), 'Fantasia marítima poética');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
  expect(mocks.request.mock.lastCall?.[0]).toMatchObject({
    action: 'save',
    proposal: { genre: 'Fantasia marítima poética' },
  });
  await chooseDropdown(userEvent, dropdown, 'Mistério');
  expect(screen.queryByLabelText('Seu gênero ou estilo')).not.toBeInTheDocument();
  await chooseDropdown(userEvent, dropdown, 'Definir depois');
  await userEvent.click(screen.getByRole('button', { name: /^Criar livro/ }));
  await screen.findByRole('heading', { name: /Projeto aberto/ });
  expect(mocks.commit.mock.lastCall?.[0].proposal.genre).toBe('Livre');
});

it('preserves a resumed custom genre and allows clearing it without losing the field', async () => {
  const session: AssistedSession = {
    id: 'custom-session',
    flowVersion: 2,
    kind: 'book',
    method: 'manual',
    idea: 'Ilhas',
    messages: [],
    brief: '',
    revision: 1,
    ready: true,
    proposal: {
      title: 'Ilhas',
      genre: 'Fantasia marítima',
      synopsis: 'O mar',
      coverDirection: '',
      entities: [],
    },
    proposalExpiresAt: null,
    cover: null,
    expiresAt: Date.now() + 10000,
    costs: { text: 2, cover: 5 },
  };
  mocks.load.mockResolvedValue({ session, costs: session.costs });
  render(tree());
  const notice = await screen.findByRole('region', { name: 'Criação em andamento' });
  expect(notice.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retomar criação' }));
  await screen.findByLabelText('Título do projeto');
  await userEvent.click(screen.getByRole('button', { name: /^Premissa e detalhes/ }));
  expect(screen.getByRole('combobox', { name: 'Gênero ou estilo' })).toHaveTextContent(
    'Criar meu estilo',
  );
  const input = screen.getByLabelText('Seu gênero ou estilo');
  expect(input).toHaveValue('Fantasia marítima');
  await userEvent.clear(input);
  expect(input).toBeVisible();
  await userEvent.type(input, 'Fantasia');
  expect(input).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Gênero ou estilo' })).toHaveTextContent(
    'Criar meu estilo',
  );
});

it('resume rereads authorization and never renders an old derived answer from the cached offer', async () => {
  const original: AssistedSession = {
    id: 'resume-session',
    flowVersion: 2,
    kind: 'book',
    method: 'assisted',
    idea: 'Pergunta própria',
    messages: [
      { role: 'user', text: 'Pergunta própria' },
      { role: 'assistant', text: 'Resposta antiga revogada' },
    ],
    brief: 'Brief antigo',
    revision: 1,
    ready: false,
    proposal: null,
    proposalExpiresAt: null,
    cover: null,
    expiresAt: Date.now() + 10000,
    costs: { text: 2, cover: 5 },
  };
  mocks.load
    .mockResolvedValueOnce({ session: original, costs: original.costs })
    .mockResolvedValueOnce({
      session: { ...original, contextUnavailable: true, messages: [original.messages[0]!] },
      costs: original.costs,
    });
  render(tree());
  await userEvent.click(await screen.findByRole('button', { name: 'Retomar criação' }));
  expect(await screen.findByText('Pergunta própria')).toBeVisible();
  expect(screen.queryByText('Resposta antiga revogada')).not.toBeInTheDocument();
  expect(mocks.request).not.toHaveBeenCalled();
});

afterEach(() => vi.restoreAllMocks());
it('chat can propose generation before creating a project, with one explicit action confirmation', async () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  const delegate = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(async (input) => {
    const result = await delegate(input);
    if (input.action === 'interview' && input.message === 'Gere a proposta') {
      const capability = input.capabilities?.find((c) => c.label === 'Revisar proposta inicial');
      return {
        ...result,
        suggestedAction: capability ? { id: capability.id } : null,
        suggestedActionRequestId: input.requestId,
      };
    }
    return result;
  });
  render(tree());
  await userEvent.click(screen.getByRole('button', { name: /^Com ajuda da IA/ }));
  await userEvent.click(screen.getByRole('button', { name: /^Livro/ }));
  await userEvent.type(screen.getByLabelText('Sua ideia'), 'Ilhas.');
  await userEvent.click(screen.getByRole('button', { name: 'Começar conversa' }));
  await screen.findByText('Qual é o conflito?');
  await userEvent.type(screen.getByLabelText('Sua resposta'), 'Gere a proposta');
  await userEvent.click(screen.getByRole('button', { name: 'Enviar resposta' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Executar: Revisar proposta inicial' }),
  );
  expect(await screen.findByLabelText('Título do projeto')).toHaveValue('Ilhas');
  expect(mocks.commit).not.toHaveBeenCalled();
});
it('asking in the chat preserves unsaved manual edits of the proposed metadata', async () => {
  render(tree());
  await userEvent.click(screen.getByRole('button', { name: /^Com ajuda da IA/ }));
  await userEvent.click(screen.getByRole('button', { name: /^Livro/ }));
  await userEvent.type(screen.getByLabelText('Sua ideia'), 'Ilhas.');
  await userEvent.click(screen.getByRole('button', { name: 'Começar conversa' }));
  await screen.findByText('Qual é o conflito?');
  await userEvent.click(screen.getByRole('button', { name: 'Revisar proposta inicial' }));
  await screen.findByLabelText('Título do projeto');
  await userEvent.clear(screen.getByLabelText('Título do projeto'));
  await userEvent.type(screen.getByLabelText('Título do projeto'), 'Título autoral');
  await userEvent.type(screen.getByLabelText('Sua resposta'), 'Vamos ajustar o tom.');
  await userEvent.click(screen.getByRole('button', { name: 'Enviar resposta' }));
  expect(screen.getByLabelText('Título do projeto')).toHaveValue('Título autoral');
  expect(mocks.request.mock.lastCall?.[0].proposal?.title).toBe('Título autoral');
});
