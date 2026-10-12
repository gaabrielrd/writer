import { chooseDropdown } from '@/test/dropdown';
import { listUniverses } from '@/features/universes';
vi.mock('@/features/universes/services/universeService', () => ({
  listUniverses: vi.fn().mockResolvedValue([]),
}));
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookCreationWizard } from '../components/BookCreationWizard';
import * as library from '@/features/image-library';
import * as service from '@/features/ai-assistant';
import type { BookAssetSuggestion } from '@/features/ai-assistant';

const auth = vi.hoisted(() => ({
  user: { uid: 'author', credits: 20 },
  updateUserCreditsState: vi.fn(),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('@/features/ai-assistant/services/bookGenerationService', () => ({
  quoteBookGeneration: vi.fn(),
  generateBookAsset: vi.fn(),
  acceptBookAsset: vi.fn(),
  discardBookAsset: vi.fn(),
}));
vi.mock('@/features/image-library/services/imageLibraryService', () => ({
  listLibraryImages: vi.fn(),
}));
const suggestion = {
  id: 'request-0000000001',
  kind: 'synopsis' as const,
  cost: 1,
  text: 'Uma viajante busca um mapa perdido.',
};

async function start() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Título da Obra'), 'Atlas');
  await user.type(screen.getByLabelText('Gênero Literário'), 'Fantasia');
  await user.click(screen.getByRole('button', { name: /^Sinopse/ }));
  await screen.findByRole('button', { name: 'Gerar sinopse com IA' });
  return user;
}
describe('BookCreationWizard', () => {
  it('creates immediately with essential fields, without opening optional sections', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<BookCreationWizard onClose={vi.fn()} onSubmit={submit} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Título da Obra'), 'Atlas');
    expect(screen.getByRole('button', { name: 'Criar Livro' })).toBeDisabled();
    await user.type(screen.getByLabelText('Gênero Literário'), 'Fantasia');
    expect(screen.getByLabelText('Sinopse / Premissa')).not.toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Criar Livro' }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Atlas',
        genre: 'Fantasia',
        synopsis: undefined,
        coverUrl: null,
      }),
    );
    expect(service.generateBookAsset).not.toHaveBeenCalled();
  });

  it('reveals an invalid cover URL even when collapsed and preserves the draft', async () => {
    const submit = vi.fn();
    render(<BookCreationWizard onClose={vi.fn()} onSubmit={submit} />);
    const user = await start();
    await user.click(screen.getByRole('button', { name: /^Capa/ }));
    await user.click(screen.getByRole('button', { name: /^Usar URL de imagem/ }));
    await user.type(screen.getByLabelText('URL da Capa (opcional)'), 'invalid');
    await user.click(screen.getByRole('button', { name: /^Capa/ }));
    await user.click(screen.getByRole('button', { name: 'Criar Livro' }));
    expect(screen.getByLabelText('URL da Capa (opcional)')).toBeVisible();
    expect(screen.getByLabelText('URL da Capa (opcional)')).toHaveValue('invalid');
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();
  });
  it('reuses a library image in step three without accepting or charging an AI suggestion', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    vi.mocked(library.listLibraryImages).mockResolvedValue({
      images: [
        {
          id: 'image-000000000001',
          name: 'Capa guardada',
          url: 'https://example.test/cover.png',
          createdAt: 1,
          useCount: 0,
        },
      ],
      cursor: null,
    });
    render(<BookCreationWizard onClose={vi.fn()} onSubmit={submit} />);
    const user = await start();
    await user.click(screen.getByRole('button', { name: /^Capa/ }));
    await user.click(screen.getByRole('button', { name: 'Selecionar da biblioteca' }));
    await user.click(await screen.findByRole('button', { name: 'Selecionar Capa guardada' }));
    expect(screen.getByAltText('Capa selecionada de Atlas')).toHaveAttribute(
      'src',
      'https://example.test/cover.png',
    );
    await user.click(screen.getByRole('button', { name: 'Criar Livro' }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ coverImageId: 'image-000000000001' }),
    );
    expect(service.acceptBookAsset).not.toHaveBeenCalled();
    expect(auth.updateUserCreditsState).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    auth.user.credits = 20;
    vi.mocked(service.quoteBookGeneration).mockResolvedValue({ synopsis: 1, cover: 5 });
    vi.mocked(service.generateBookAsset).mockResolvedValue(suggestion);
    vi.mocked(service.acceptBookAsset).mockResolvedValue({ ...suggestion, credits: 19 });
    vi.mocked(service.discardBookAsset).mockResolvedValue({ discarded: true });
  });
  it('requires title and genre and preserves optional fields when sections collapse', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<BookCreationWizard onClose={vi.fn()} onSubmit={submit} />);
    expect(screen.getByRole('button', { name: 'Criar Livro' })).toBeDisabled();
    const user = await start();
    await user.type(screen.getByLabelText('Sinopse / Premissa'), 'Meu texto');
    await user.click(screen.getByRole('button', { name: /^Sinopse/ }));
    expect(screen.getByLabelText('Título da Obra')).toHaveValue('Atlas');
    await user.click(screen.getByRole('button', { name: /^Sinopse/ }));
    expect(screen.getByLabelText('Sinopse / Premissa')).toHaveValue('Meu texto');
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^Capa/ }));
    await user.click(screen.getByRole('button', { name: 'Criar Livro' }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Atlas',
        genre: 'Fantasia',
        synopsis: 'Meu texto',
        coverUrl: null,
      }),
    );
  });
  it('uses current title/genre and only replaces editable synopsis after explicit acceptance', async () => {
    render(<BookCreationWizard onClose={vi.fn()} onSubmit={vi.fn()} />);
    const user = await start();
    await user.type(screen.getByLabelText('Sinopse / Premissa'), 'Texto original');
    await user.click(screen.getByRole('button', { name: 'Gerar sinopse com IA' }));
    await screen.findByText(suggestion.text);
    expect(screen.getByLabelText('Sinopse / Premissa')).toHaveValue('Texto original');
    expect(service.acceptBookAsset).not.toHaveBeenCalled();
    expect(service.generateBookAsset).toHaveBeenCalledWith(
      { title: 'Atlas', genre: 'Fantasia', synopsis: 'Texto original' },
      'synopsis',
      expect.any(String),
    );
    await user.click(screen.getByRole('button', { name: /Usar sinopse/ }));
    expect(screen.getByLabelText('Sinopse / Premissa')).toHaveValue(suggestion.text);
    expect(auth.updateUserCreditsState).toHaveBeenCalledWith(19);
    await user.type(screen.getByLabelText('Sinopse / Premissa'), ' Editada.');
    expect(screen.getByLabelText('Sinopse / Premissa')).toHaveValue(`${suggestion.text} Editada.`);
  });
  it('discards a suggestion when its context changes without charging credits', async () => {
    render(<BookCreationWizard onClose={vi.fn()} onSubmit={vi.fn()} />);
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'Gerar sinopse com IA' }));
    await screen.findByText(suggestion.text);
    await user.type(screen.getByLabelText('Sinopse / Premissa'), 'Nova premissa');
    expect(screen.queryByText(suggestion.text)).not.toBeInTheDocument();
    expect(service.discardBookAsset).toHaveBeenCalledWith(suggestion.id);
    expect(service.acceptBookAsset).not.toHaveBeenCalled();
  });
  it('keeps suggestions after failed acceptance so retry uses the same identifier', async () => {
    vi.mocked(service.acceptBookAsset).mockRejectedValueOnce(new Error('Sem conexão'));
    render(<BookCreationWizard onClose={vi.fn()} onSubmit={vi.fn()} />);
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'Gerar sinopse com IA' }));
    await screen.findByText(suggestion.text);
    await user.click(screen.getByRole('button', { name: /Usar sinopse/ }));
    await screen.findByText('Sem conexão');
    await user.click(screen.getByRole('button', { name: /Usar sinopse/ }));
    expect(service.acceptBookAsset).toHaveBeenNthCalledWith(1, suggestion.id);
    expect(service.acceptBookAsset).toHaveBeenNthCalledWith(2, suggestion.id);
  });
  it('requires synopsis for a cover and creates with the selected persistent cover', async () => {
    vi.mocked(service.generateBookAsset).mockResolvedValue({
      id: 'request-cover-0001',
      kind: 'cover',
      cost: 5,
      previewUrl: 'data:image/png;base64,AA==',
    });
    vi.mocked(service.acceptBookAsset).mockResolvedValue({
      id: 'request-cover-0001',
      kind: 'cover',
      credits: 15,
      coverUrl: 'https://example.test/cover.png',
    });
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<BookCreationWizard onClose={vi.fn()} onSubmit={submit} />);
    const user = await start();
    await user.click(screen.getByRole('button', { name: /^Capa/ }));
    expect(screen.getByRole('button', { name: 'Gerar capa com IA' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /^Sinopse/ }));
    await user.type(screen.getByLabelText('Sinopse / Premissa'), 'Premissa');
    await user.click(screen.getByRole('button', { name: /^Capa/ }));
    await user.click(screen.getByRole('button', { name: 'Gerar capa com IA' }));
    await screen.findByAltText('Sugestão de capa de Atlas');
    expect(service.generateBookAsset).toHaveBeenCalledWith(
      { title: 'Atlas', genre: 'Fantasia', synopsis: 'Premissa' },
      'cover',
      expect.any(String),
    );
    await user.click(screen.getByRole('button', { name: /Usar capa/ }));
    expect(screen.getByAltText('Capa selecionada de Atlas')).toHaveAttribute(
      'src',
      'https://example.test/cover.png',
    );
    await user.click(screen.getByRole('button', { name: 'Criar Livro' }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        coverGenerationId: 'request-cover-0001',
        coverUrl: 'https://example.test/cover.png',
      }),
    );
  });
  it('keeps manual creation available when AI is unavailable or balance is insufficient', async () => {
    auth.user.credits = 0;
    render(<BookCreationWizard onClose={vi.fn()} onSubmit={vi.fn()} />);
    const user = await start();
    expect(screen.getByRole('button', { name: 'Gerar sinopse com IA' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /^Capa/ }));
    expect(screen.getByRole('button', { name: 'Criar Livro' })).toBeEnabled();
  });
  it('preserves the availability error across steps and allows manual saving', async () => {
    vi.mocked(service.quoteBookGeneration).mockRejectedValueOnce(new Error('offline'));
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<BookCreationWizard onClose={vi.fn()} onSubmit={submit} />);
    const user = await start();
    await screen.findByText('A IA está indisponível. Você pode criar o livro manualmente.');
    await user.click(screen.getByRole('button', { name: /^Capa/ }));
    expect(
      screen.getByText('A IA está indisponível. Você pode criar o livro manualmente.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Criar Livro' }));
    expect(submit).toHaveBeenCalledOnce();
  });
  it('keeps entered data and stable creation ID after saving fails', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error('Falha ao salvar'))
      .mockResolvedValueOnce(undefined);
    const close = vi.fn();
    render(<BookCreationWizard onClose={close} onSubmit={submit} />);
    const user = await start();
    await user.click(screen.getByRole('button', { name: /^Capa/ }));
    await user.click(screen.getByRole('button', { name: /^Usar URL de imagem/ }));
    await user.type(
      screen.getByLabelText('URL da Capa (opcional)'),
      'https://example.test/manual.png',
    );
    await user.click(screen.getByRole('button', { name: 'Criar Livro' }));
    await screen.findByText('Falha ao salvar');
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByLabelText('URL da Capa (opcional)')).toHaveValue(
      'https://example.test/manual.png',
    );
    await user.click(screen.getByRole('button', { name: 'Criar Livro' }));
    expect(submit.mock.calls[0]).toEqual(submit.mock.calls[1]);
    expect(close).toHaveBeenCalledOnce();
  });
  it('ignores and discards late results after closing', async () => {
    let resolve!: (value: BookAssetSuggestion) => void;
    vi.mocked(service.generateBookAsset).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const close = vi.fn();
    const view = render(<BookCreationWizard onClose={close} onSubmit={vi.fn()} />);
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'Gerar sinopse com IA' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    view.unmount();
    await act(async () => {
      resolve(suggestion);
      await Promise.resolve();
    });
    expect(service.discardBookAsset).toHaveBeenCalledWith(suggestion.id);
    expect(auth.updateUserCreditsState).not.toHaveBeenCalled();
  });
  it('rejects an empty result and prevents duplicate requests while generating', async () => {
    let resolve!: (value: BookAssetSuggestion) => void;
    vi.mocked(service.generateBookAsset).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<BookCreationWizard onClose={vi.fn()} onSubmit={vi.fn()} />);
    const user = await start();
    const button = screen.getByRole('button', { name: 'Gerar sinopse com IA' });
    await user.click(button);
    fireEvent.click(button);
    expect(service.generateBookAsset).toHaveBeenCalledOnce();
    await act(async () => {
      resolve({ ...suggestion, text: '' });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByText(/não retornou um resultado válido/)).toBeInTheDocument(),
    );
  });
});

it('permite selecionar um universo na primeira etapa e preserva a escolha ao voltar', async () => {
  vi.mocked(listUniverses).mockResolvedValue([
    {
      id: 'world',
      authorId: 'author',
      name: 'Atlas',
      description: '',
      bookCount: 0,
      privacyVersion: 0,
      loreVersion: 0,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  const submit = vi.fn().mockResolvedValue(undefined);
  render(<BookCreationWizard onClose={vi.fn()} onSubmit={submit} />);
  const user = userEvent.setup();
  await chooseDropdown(user, await screen.findByLabelText('Universo compartilhado'), 'Atlas');
  await start();
  await user.click(screen.getByRole('button', { name: /^Sinopse/ }));
  expect(await screen.findByLabelText('Universo compartilhado')).toHaveTextContent('Atlas');

  await user.click(screen.getByRole('button', { name: 'Criar Livro' }));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ universeId: 'world' }));
});
