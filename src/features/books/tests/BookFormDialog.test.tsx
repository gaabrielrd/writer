import { chooseDropdown } from '@/test/dropdown';
import { listUniverses } from '@/features/universes';
vi.mock('@/features/universes/services/universeService', () => ({
  listUniverses: vi.fn().mockResolvedValue([]),
}));
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookFormDialog } from '../components/BookFormDialog';
import * as library from '@/features/image-library';
import type { Book } from '../model/book';
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { uid: 'user-1', credits: 20 }, updateUserCreditsState: vi.fn() }),
}));
vi.mock('@/features/ai-assistant/services/bookGenerationService', () => ({
  quoteBookGeneration: vi.fn().mockResolvedValue({ synopsis: 1, cover: 5 }),
}));

vi.mock('@/features/image-library/services/imageLibraryService', () => ({
  listLibraryImages: vi.fn(),
}));
describe('BookFormDialog', () => {
  it('keeps a pending edit open and prevents duplicate submissions', async () => {
    let finish!: () => void;
    const submit = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const close = vi.fn();
    render(
      <BookFormDialog
        open
        bookToEdit={{
          id: 'book',
          authorId: 'author',
          title: 'Atlas',
          status: 'draft',
          wordCount: 0,
          createdAt: 1,
          updatedAt: 1,
        }}
        onClose={close}
        onSubmit={submit}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    fireEvent.submit(document.getElementById('book-form')!);

    await user.keyboard('{Escape}');

    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByLabelText('Título da Obra')).toBeDisabled();
    expect(close).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledOnce();

    finish();
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it('selects a library cover and removes its association when entering a manual URL', async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockResolvedValue(undefined);
    vi.mocked(library.listLibraryImages).mockResolvedValue({
      images: [
        {
          id: 'image-000000000001',
          name: 'Capa',
          url: 'https://example.test/cover.png',
          createdAt: 1000,
          useCount: 0,
        },
      ],
      cursor: null,
    });
    render(
      <BookFormDialog
        open
        bookToEdit={{
          id: 'book',
          authorId: 'author',
          title: 'Atlas',
          status: 'draft',
          wordCount: 0,
          createdAt: 1,
          updatedAt: 1,
        }}
        onClose={vi.fn()}
        onSubmit={submit}
      />,
    );
    await user.click(screen.getByRole('button', { name: /^Capa/ }));
    await user.click(screen.getByRole('button', { name: 'Selecionar da biblioteca' }));
    await user.click(await screen.findByRole('button', { name: 'Selecionar Capa' }));
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        coverImageId: 'image-000000000001',
        coverUrl: 'https://example.test/cover.png',
      }),
    );
    await user.click(screen.getByRole('button', { name: /^Usar URL de imagem/ }));
    await user.clear(screen.getByLabelText('URL da Capa (opcional)'));
    await user.type(
      screen.getByLabelText('URL da Capa (opcional)'),
      'https://example.test/manual.png',
    );
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ coverImageId: null, coverUrl: 'https://example.test/manual.png' }),
    );
  });
  it('keeps failed edits open and reports the save error', async () => {
    render(
      <BookFormDialog
        open
        bookToEdit={{
          id: 'book',
          authorId: 'author',
          title: 'Atlas',
          status: 'draft',
          wordCount: 0,
          createdAt: 1,
          updatedAt: 1,
        }}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockRejectedValue(new Error('Sem conexão'))}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão');
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renderiza modo de criacao e submete dados', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<BookFormDialog open={true} onClose={onClose} onSubmit={onSubmit} />);

    expect(screen.getByRole('heading', { name: 'Criar Novo Livro' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/título da obra/i), 'O Senhor dos Aneis');
    await user.type(screen.getByLabelText(/gênero literário/i), 'Alta Fantasia');
    await user.click(screen.getByRole('button', { name: /^Sinopse/ }));
    await user.type(screen.getByLabelText(/sinopse/i), 'A jornada do anel.');
    await user.click(screen.getByRole('button', { name: 'Criar Livro' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'O Senhor dos Aneis',
        genre: 'Alta Fantasia',
        synopsis: 'A jornada do anel.',
        coverUrl: null,
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('preenche campos no modo de edicao', () => {
    const mockBook: Book = {
      id: 'b-1',
      authorId: 'a-1',
      title: 'Duna',
      genre: 'Ficção Científica',
      synopsis: 'Arrakis',
      coverUrl: 'https://exemplo.com/duna.jpg',
      status: 'published',
      wordCount: 50000,
      createdAt: 1000,
      updatedAt: 1000,
    };

    render(
      <BookFormDialog open={true} bookToEdit={mockBook} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );

    expect(screen.getByRole('heading', { name: 'Editar Obra' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Duna')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ficção Científica')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Arrakis')).toBeInTheDocument();
  });
});

it('desvincula um livro existente sem copiar ou remover o lore local', async () => {
  vi.mocked(listUniverses).mockResolvedValue([
    {
      id: 'world',
      authorId: 'user-1',
      name: 'Atlas',
      description: '',
      bookCount: 1,
      privacyVersion: 0,
      loreVersion: 0,
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  const submit = vi.fn().mockResolvedValue(undefined);
  const book: Book = {
    id: 'book',
    authorId: 'user-1',
    universeId: 'world',
    title: 'Livro',
    status: 'published',
    wordCount: 12,
    createdAt: 1,
    updatedAt: 1,
  };
  render(<BookFormDialog open bookToEdit={book} onClose={vi.fn()} onSubmit={submit} />);
  const user = userEvent.setup();
  await chooseDropdown(
    user,
    await screen.findByLabelText('Universo compartilhado'),
    'Sem universo',
  );
  expect(screen.getByText(/Capítulos e lore local serão preservados/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({ universeId: null, title: 'Livro' }),
  );
});
