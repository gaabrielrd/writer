import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { PersonaManager } from '../components/PersonaManager';
import { PersonaGenerationDialog } from '../components/PersonaGenerationDialog';
import { DEFAULT_PERSONAS } from '../model/persona';
import { resolvePlatformTextGeneration } from '../model/chatGeneration';
import { listUniverses } from '@/features/universes';
import { subscribeLoreEntities } from '@/features/lore';
import {
  generatePersona,
  preparePersonaContext,
  getPersonaGeneration,
  acceptPersonaGeneration,
  discardPersonaGeneration,
} from '../services/personaGenerationService';
vi.mock('@/features/universes', () => ({ listUniverses: vi.fn() }));
vi.mock('@/features/lore', () => ({ subscribeLoreEntities: vi.fn() }));
vi.mock('../services/personaService', () => ({
  subscribePersonas: vi.fn((_owner, callback: (items: unknown[]) => void) => {
    callback([]);
    return vi.fn();
  }),
  savePersona: vi.fn(),
}));
vi.mock('../services/personaGenerationService', () => ({
  generatePersona: vi.fn(),
  preparePersonaContext: vi.fn(),
  getPersonaGeneration: vi.fn(),
  acceptPersonaGeneration: vi.fn(),
  discardPersonaGeneration: vi.fn(),
}));
const context = {
  universe: { id: 'world', name: 'Mundo da névoa', description: 'Uma atmosfera de mistério.' },
  entities: [
    {
      id: 'entity',
      name: 'Ruínas',
      category: 'location' as const,
      aliases: [],
      summary: 'Passado esquecido',
      details: 'Segredo da cidade.',
      structuredDetails: null,
      relations: [],
    },
  ],
  bytes: 300,
  contextToken: 'token',
};
const result = {
  requestId: 'request-persona-000001',
  state: 'ready' as const,
  generation: resolvePlatformTextGeneration(),
  persona: { ...DEFAULT_PERSONAS[0]!, id: 'custom-generated', name: 'Voz de bruma' },
  rationale: 'Mistério com proximidade emocional.',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listUniverses).mockResolvedValue([
    {
      id: 'world',
      authorId: 'author',
      name: 'Mundo da névoa',
      description: 'Uma atmosfera de mistério.',
      bookCount: 0,
      privacyVersion: 0,
      loreVersion: 0,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  vi.mocked(subscribeLoreEntities).mockImplementation((_scope, callback) => {
    callback([
      {
        ...context.entities[0]!,
        id: 'universe:world:entity',
        universeId: 'world',
        structuredDetails: undefined,
        isPublic: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    return vi.fn();
  });
  vi.mocked(preparePersonaContext).mockResolvedValue(context);
  vi.mocked(generatePersona).mockResolvedValue(result);
  vi.mocked(acceptPersonaGeneration).mockResolvedValue({
    ...result,
    state: 'accepted',
    personaId: result.persona.id,
  });
  vi.mocked(discardPersonaGeneration).mockResolvedValue({ discarded: true });
});
async function choose(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('combobox', { name: 'Universo da persona' }));
  await user.click(await screen.findByRole('option', { name: 'Mundo da névoa' }));
  await user.click(await screen.findByRole('button', { name: 'Incluir Ruínas' }));
  await user.type(screen.getByLabelText('Intenção para a voz (opcional)'), 'Humor contido');
  await user.click(screen.getByRole('button', { name: 'Conferir contexto' }));
  await screen.findByRole('heading', { name: 'Contexto conferido: Mundo da névoa' });
}
it('confere somente fontes selecionadas e revisa/editável antes do aceite explícito', async () => {
  const user = userEvent.setup({ delay: null });
  render(<PersonaManager ownerId="author" />);
  await user.click(await screen.findByRole('button', { name: 'Criar com IA' }));
  await choose(user);
  expect(preparePersonaContext).toHaveBeenCalledWith('world', ['entity']);
  expect(generatePersona).not.toHaveBeenCalled();
  await user.click(screen.getByText('Conteúdo completo que será enviado à IA'));
  expect(screen.getByText(/Segredo da cidade/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Gerar persona' }));
  expect(await screen.findByLabelText('Nome da persona')).toHaveValue('Voz de bruma');
  expect(acceptPersonaGeneration).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Nome da persona'), { target: { value: 'Voz revisada' } });
  await user.click(screen.getByRole('button', { name: 'Salvar persona' }));
  await waitFor(() =>
    expect(acceptPersonaGeneration).toHaveBeenCalledWith(
      result.requestId,
      expect.objectContaining({ name: 'Voz revisada' }),
    ),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('falha incerta consulta resultado sem gerar de novo e preserva intenção', async () => {
  const user = userEvent.setup({ delay: null }),
    onReview = vi.fn();
  vi.mocked(generatePersona).mockRejectedValueOnce(new Error('Resposta incerta.'));
  vi.mocked(getPersonaGeneration)
    .mockResolvedValueOnce({ ...result, state: 'generating', persona: undefined })
    .mockResolvedValueOnce(result);
  render(<PersonaGenerationDialog ownerId="author" open onClose={vi.fn()} onReview={onReview} />);
  await choose(user);
  await user.click(screen.getByRole('button', { name: 'Gerar persona' }));
  expect(await screen.findByText('Resposta incerta.')).toBeVisible();
  expect(screen.getByLabelText('Intenção para a voz (opcional)')).toHaveValue('Humor contido');
  await user.click(screen.getByRole('button', { name: 'Consultar resultado' }));
  expect(await screen.findByText(/Pedido em andamento/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Consultar resultado' }));
  await waitFor(() => expect(onReview).toHaveBeenCalledWith(result));
  expect(generatePersona).toHaveBeenCalledTimes(1);
});
it('cancelar descarta pedido e uma resposta tardia desmontada não abre revisão', async () => {
  const user = userEvent.setup({ delay: null }),
    onReview = vi.fn();
  let finish!: (value: typeof result) => void;
  vi.mocked(generatePersona).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(
    <PersonaGenerationDialog ownerId="author" open onClose={vi.fn()} onReview={onReview} />,
  );
  await choose(user);
  await user.click(screen.getByRole('button', { name: 'Gerar persona' }));
  view.unmount();
  finish(result);
  await waitFor(() => expect(onReview).not.toHaveBeenCalled());
});
it('vazio e falha de carregamento oferecem caminhos de recuperação', async () => {
  const user = userEvent.setup({ delay: null });
  vi.mocked(listUniverses).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce([]);
  render(<PersonaGenerationDialog ownerId="author" open onClose={vi.fn()} onReview={vi.fn()} />);
  expect(await screen.findByText('Offline')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText('Nenhum universo disponível')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Conferir contexto' })).toBeDisabled();
});
it('retentativa de aceite conserva os dados congelados e mudança de conta retira rascunho', async () => {
  const user = userEvent.setup({ delay: null });
  vi.mocked(acceptPersonaGeneration).mockRejectedValueOnce(new Error('Confirmação incerta'));
  const view = render(<PersonaManager ownerId="author" />);
  await user.click(await screen.findByRole('button', { name: 'Criar com IA' }));
  await choose(user);
  await user.click(screen.getByRole('button', { name: 'Gerar persona' }));
  await screen.findByLabelText('Nome da persona');
  await user.click(screen.getByRole('button', { name: 'Salvar persona' }));
  expect(await screen.findByText('Confirmação incerta')).toBeVisible();
  expect(screen.getByLabelText('Nome da persona')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Salvar persona' }));
  expect(vi.mocked(acceptPersonaGeneration).mock.calls[0]).toEqual(
    vi.mocked(acceptPersonaGeneration).mock.calls[1],
  );
  view.rerender(<PersonaManager ownerId="other" />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
