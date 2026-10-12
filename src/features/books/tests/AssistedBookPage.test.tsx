import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AssistedBookPage } from '../components/AssistedBookPage';
import {
  AssistedBookError,
  commitAssistedBook,
  loadAssistedBook,
  requestAssistedBook,
  type AssistedSession,
} from '@/features/ai-assistant';

const auth: {
  user: { uid: string; credits: number } | null;
  loading: boolean;
  updateUserCreditsState: ReturnType<typeof vi.fn>;
} = vi.hoisted(() => ({
  user: { uid: 'author', credits: 20 },
  loading: false,
  updateUserCreditsState: vi.fn(),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('@/features/ai-assistant/services/assistedBookService', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/ai-assistant/services/assistedBookService')
  >()),
  loadAssistedBook: vi.fn(),
  requestAssistedBook: vi.fn(),
  commitAssistedBook: vi.fn(),
}));
vi.mock('@/features/image-library', () => ({
  ImageLibraryPicker: ({
    open,
    onSelect,
    onClose,
  }: {
    open: boolean;
    onSelect: (image: object) => void;
    onClose: () => void;
  }) =>
    open ? (
      <div>
        <button
          onClick={() =>
            onSelect({
              id: 'image-000000000001',
              name: 'Capa guardada',
              url: 'https://example.test/cover.png',
            })
          }
        >
          Escolher capa guardada
        </button>
        <button onClick={onClose}>Fechar biblioteca</button>
      </div>
    ) : null,
}));
const initial = (): AssistedSession => ({
  id: 'session-00000000001',
  idea: 'Uma ilha.',
  messages: [
    { role: 'user', text: 'Uma ilha.' },
    { role: 'assistant', text: 'Qual é o conflito?' },
  ],
  brief: 'Uma viagem entre ilhas.',
  ready: false,
  revision: 1,
  proposal: null,
  proposalExpiresAt: null,
  cover: null,
  expiresAt: Date.now() + 86400000,
  costs: { text: 2, cover: 5 },
});
const ready = (): AssistedSession => ({
  ...initial(),
  proposalExpiresAt: Date.now() + 3600000,
  proposal: {
    title: 'Atlas',
    genre: 'Fantasia',
    synopsis: 'Uma viagem entre ilhas.',
    coverDirection: 'Mar e bronze.',
    entities: Array.from({ length: 12 }, (_, index) => ({
      id: `entity-${index}`,
      name: `Ficha ${index}`,
      category: 'character',
      aliases: [],
      summary: 'Uma ficha útil.',
      details: 'História.',
      structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
      relations: index === 1 ? [{ targetEntityId: 'entity-0', relationType: 'Amigo' }] : [],
    })),
  },
});
let session: AssistedSession;
function mount() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<AssistedBookPage />} />
        <Route path="/books/:id" element={<h1>Livro criado</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}
async function cover() {
  await screen.findByLabelText('Título do livro');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar para capa' }));
  await screen.findByLabelText('Direção visual da capa');
}
describe('AssistedBookPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { uid: 'author', credits: 20 };
    auth.loading = false;
    session = initial();
    vi.mocked(loadAssistedBook).mockResolvedValue({ session: null, costs: { text: 2, cover: 5 } });
    vi.mocked(requestAssistedBook).mockImplementation((input) => {
      if (input.action === 'start')
        session = { ...initial(), id: input.sessionId, idea: input.idea!, revision: 0 };
      else if (input.action === 'generate') session = { ...ready(), brief: input.brief! };
      else if (input.action === 'interview')
        session = {
          ...session,
          messages: [
            ...session.messages,
            { role: 'user', text: input.message ?? 'Ideia' },
            { role: 'assistant', text: 'Qual é o tom?' },
          ],
        };
      else if (input.action === 'brief')
        session = { ...session, brief: input.brief!, proposal: null };
      else if (input.action === 'cover')
        session = {
          ...session,
          proposal: input.proposal!,
          cover: {
            id: 'cover-000000000001',
            expiresAt: Date.now() + 3600000,
            previewUrl: 'data:image/png;base64,AA==',
            contextHash: 'hash',
            context: {
              title: input.proposal!.title,
              genre: input.proposal!.genre,
              synopsis: input.proposal!.synopsis,
              direction: input.proposal!.coverDirection,
            },
          },
        };
      else session = { ...session, proposal: input.proposal! };
      session = { ...session, revision: session.revision + 1 };
      return Promise.resolve(structuredClone(session));
    });
    vi.mocked(commitAssistedBook).mockResolvedValue({ book: { id: 'created' }, credits: 18 });
  });
  it('takes an idea through adaptive chat, editable briefing, proposal, cover and explicit creation', async () => {
    mount();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Sua ideia'), 'Uma viajante.');
    await user.click(screen.getByRole('button', { name: 'Começar conversa' }));
    await user.type(await screen.findByLabelText('Sua resposta'), 'O mar está secando.');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    await waitFor(() => expect(screen.getByLabelText('Sua resposta')).toHaveValue(''));
    await user.click(screen.getByRole('button', { name: 'Sugira para mim' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Revisar briefing e encerrar entrevista' }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole('button', { name: 'Revisar briefing e encerrar entrevista' }),
    );
    fireEvent.change(screen.getByLabelText('Briefing do livro'), {
      target: { value: 'Sem magia; aventura no mar.' },
    });
    await user.click(screen.getByRole('button', { name: 'Salvar briefing' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Gerar proposta do livro' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Gerar proposta do livro' }));
    fireEvent.change(await screen.findByLabelText('Título do livro'), {
      target: { value: 'O último mar' },
    });
    fireEvent.change(screen.getByLabelText('Gênero'), { target: { value: 'Aventura' } });
    fireEvent.change(screen.getByLabelText('Sinopse'), { target: { value: 'Uma viagem.' } });
    await cover();
    fireEvent.change(screen.getByLabelText('Direção visual da capa'), {
      target: { value: 'Um oceano seco.' },
    });
    await user.click(screen.getByRole('button', { name: 'Gerar capa com IA' }));
    await screen.findByAltText('Prévia de capa de O último mar');
    expect(commitAssistedBook).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Criar livro · 7 créditos' }));
    await screen.findByRole('heading', { name: 'Livro criado' });
    expect(commitAssistedBook).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedCost: 7,
        coverId: 'cover-000000000001',
      }),
    );
    expect(vi.mocked(commitAssistedBook).mock.calls[0]?.[0].proposal.title).toBe('O último mar');
  });
  it('resumes a proposal, edits a private lore sheet and removes incoming relations explicitly', async () => {
    session = ready();
    vi.mocked(loadAssistedBook).mockResolvedValue({ session, costs: session.costs });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar Ficha 0' }));
    fireEvent.change(screen.getByLabelText('Nome da Entidade'), { target: { value: 'Marina' } });
    expect(screen.queryByText('Tornar visível no leitor público da obra')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    await screen.findByRole('heading', { name: 'Marina' });
    await user.click(screen.getByRole('button', { name: 'Regenerar Marina' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Excluir Marina' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Excluir Marina' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Excluir Marina' }));
    await user.click(screen.getByRole('button', { name: 'Excluir ficha e suas relações' }));
    await user.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    await waitFor(() => expect(session.proposal?.entities).toHaveLength(11));
    expect(session.proposal?.entities[0]?.relations).toHaveLength(0);
  });
  it('retries an uncertain commit with identical payload and freezes the review until recovery', async () => {
    session = ready();
    vi.mocked(loadAssistedBook).mockResolvedValue({ session, costs: session.costs });
    vi.mocked(commitAssistedBook).mockRejectedValueOnce(
      new AssistedBookError('Conexão perdida.', 'functions/unavailable'),
    );
    mount();
    await cover();
    await userEvent.click(screen.getByRole('button', { name: 'Criar livro · 2 créditos' }));
    await screen.findByText('Conexão perdida.');
    expect(screen.getByLabelText('Direção visual da capa')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await screen.findByRole('heading', { name: 'Livro criado' });
    expect(vi.mocked(commitAssistedBook).mock.calls[0]).toEqual(
      vi.mocked(commitAssistedBook).mock.calls[1],
    );
  });
  it('keeps manual choices available after definitive failure and reuses library images for two credits', async () => {
    session = ready();
    vi.mocked(loadAssistedBook).mockResolvedValue({ session, costs: session.costs });
    vi.mocked(requestAssistedBook).mockRejectedValueOnce(
      new AssistedBookError('Saldo insuficiente.', 'functions/resource-exhausted'),
    );
    mount();
    await screen.findByLabelText('Título do livro');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar para capa' }));
    await screen.findByText('Saldo insuficiente.');
    expect(screen.getByLabelText('Título do livro')).toBeEnabled();
    await cover();
    await userEvent.click(screen.getByRole('button', { name: 'Selecionar da biblioteca' }));
    await userEvent.click(screen.getByRole('button', { name: 'Escolher capa guardada' }));
    await screen.findByAltText('Prévia de capa de Atlas');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar sem capa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Selecionar da biblioteca' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fechar biblioteca' }));
    await userEvent.click(screen.getByRole('button', { name: 'Selecionar da biblioteca' }));
    await userEvent.click(screen.getByRole('button', { name: 'Escolher capa guardada' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar livro · 2 créditos' }));
    expect(commitAssistedBook).toHaveBeenCalledWith(
      expect.objectContaining({ imageId: 'image-000000000001', coverId: null }),
    );
  });
  it('handles load failure, login, restart confirmation and low balance', async () => {
    vi.mocked(loadAssistedBook).mockRejectedValueOnce(new Error('Offline'));
    const result = mount();
    await screen.findByText('Offline');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar carregar novamente' }));
    await screen.findByLabelText('Sua ideia');
    result.unmount();
    session = initial();
    auth.user = { uid: 'author', credits: 0 };
    vi.mocked(loadAssistedBook).mockResolvedValue({ session, costs: session.costs });
    const view = mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Começar outra ideia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Revisar briefing e encerrar entrevista' }),
    );
    expect(screen.getByRole('button', { name: 'Gerar proposta do livro' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar à conversa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Começar outra ideia' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Começar outra ideia' }).at(-1)!);
    await screen.findByLabelText('Sua ideia');
    view.unmount();
    auth.user = null;
    const loggedOut = mount();
    expect(screen.getByText('Entrar na sua conta')).toHaveAttribute('href', '/login');
    loggedOut.unmount();
    auth.loading = true;
    mount();
    expect(screen.getByText('Verificando sua conta...')).toBeInTheDocument();
  });
  it('shows expired proposal and preserves text when navigating back', async () => {
    session = { ...ready(), proposalExpiresAt: Date.now() - 1 };
    vi.mocked(loadAssistedBook).mockResolvedValue({ session, costs: session.costs });
    mount();
    await screen.findByLabelText('Título do livro');
    expect(screen.getByRole('button', { name: 'Continuar para capa' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao briefing' }));
    expect(screen.getByLabelText('Briefing do livro')).toHaveValue(session.brief);
  });
});
