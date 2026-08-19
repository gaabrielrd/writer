import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportBookModal } from '../components/ImportBookModal';
import * as bookService from '../services/bookService';
import * as documentParserService from '../services/documentParserService';
import type { Book } from '../model/book';

describe('ImportBookModal', () => {
  const mockChapters = [
    {
      id: 'ch-1',
      title: 'Capítulo 1: O Início',
      content: '<p>Era uma vez um reino distante...</p>',
      wordCount: 120,
      selected: true,
      preview: 'Era uma vez um reino distante...',
    },
    {
      id: 'ch-2',
      title: 'Capítulo 2: A Jornada',
      content: '<p>Eles caminharam pelas montanhas geladas...</p>',
      wordCount: 250,
      selected: true,
      preview: 'Eles caminharam pelas montanhas geladas...',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('nao renderiza nada quando open e false', () => {
    const { container } = render(
      <ImportBookModal open={false} onClose={vi.fn()} authorId="user-1" onSuccess={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('processa arquivo e exibe resumo de capitulos e contagem de palavras', async () => {
    vi.spyOn(documentParserService, 'parseDocumentFile').mockResolvedValueOnce({
      title: 'Meu Livro Detectado',
      chapters: mockChapters,
      totalWords: 370,
    });

    render(<ImportBookModal open={true} onClose={vi.fn()} authorId="user-1" onSuccess={vi.fn()} />);

    expect(screen.getByText(/Clique ou arraste um arquivo/i)).toBeInTheDocument();

    const file = new File(['fake docx'], 'manuscrito.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByDisplayValue('Meu Livro Detectado')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Capítulo 1: O Início')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Capítulo 2: A Jornada')).toBeInTheDocument();
    expect(screen.getByText(/120 palavras/i)).toBeInTheDocument();
    expect(screen.getByText(/250 palavras/i)).toBeInTheDocument();
    expect(screen.getByText(/capítulos encontrados/i)).toBeInTheDocument();
  });

  it('permite desmarcar todos, selecionar individualmente e alterar titulo de capitulo', async () => {
    const user = userEvent.setup();

    vi.spyOn(documentParserService, 'parseDocumentFile').mockResolvedValueOnce({
      title: 'Obra Teste',
      chapters: mockChapters,
      totalWords: 370,
    });

    render(<ImportBookModal open={true} onClose={vi.fn()} authorId="user-1" onSuccess={vi.fn()} />);

    const file = new File(['data'], 'livro.docx', { type: 'application/docx' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await screen.findByDisplayValue('Obra Teste');

    // Desmarcar todos
    const deselectBtn = screen.getByRole('button', { name: /desmarcar todos/i });
    await user.click(deselectBtn);

    expect(screen.getByRole('button', { name: /selecionar todos/i })).toBeInTheDocument();
    expect(screen.getByText(/0 selecionados/i)).toBeInTheDocument();

    // Selecionar o primeiro capítulo
    const checkboxes = screen.getAllByRole('checkbox');
    const firstCheckbox = checkboxes[0];
    if (firstCheckbox) await user.click(firstCheckbox);

    expect(screen.getByText(/1 selecionados/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /importar 1 capítulo\(s\)/i })).toBeInTheDocument();

    // Alterar título inline
    const titleInput = screen.getByDisplayValue('Capítulo 1: O Início');
    await user.clear(titleInput);
    await user.type(titleInput, 'Capítulo 1: Renomeado');
    expect(screen.getByDisplayValue('Capítulo 1: Renomeado')).toBeInTheDocument();
  });

  it('permite trocar de arquivo clicando em Trocar', async () => {
    const user = userEvent.setup();

    vi.spyOn(documentParserService, 'parseDocumentFile').mockResolvedValueOnce({
      title: 'Obra Teste',
      chapters: mockChapters,
      totalWords: 370,
    });

    render(<ImportBookModal open={true} onClose={vi.fn()} authorId="user-1" onSuccess={vi.fn()} />);

    const file = new File(['data'], 'livro.docx', { type: 'application/docx' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await screen.findByDisplayValue('Obra Teste');

    const changeBtn = screen.getByRole('button', { name: /trocar/i });
    await user.click(changeBtn);

    expect(screen.getByText(/Clique ou arraste um arquivo/i)).toBeInTheDocument();
  });

  it('suporta arrastar e soltar arquivo (drag and drop)', async () => {
    vi.spyOn(documentParserService, 'parseDocumentFile').mockResolvedValueOnce({
      title: 'Drag Livro',
      chapters: mockChapters,
      totalWords: 370,
    });

    render(<ImportBookModal open={true} onClose={vi.fn()} authorId="user-1" onSuccess={vi.fn()} />);

    const dropzone = screen.getByText(/Clique ou arraste um arquivo/i).closest('[role="button"]')!;
    const file = new File(['data'], 'drag.pdf', { type: 'application/pdf' });

    fireEvent.dragOver(dropzone);
    fireEvent.dragLeave(dropzone);
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    });

    expect(await screen.findByDisplayValue('Drag Livro')).toBeInTheDocument();
  });

  it('exibe erro para formato invalido', async () => {
    render(<ImportBookModal open={true} onClose={vi.fn()} authorId="user-1" onSuccess={vi.fn()} />);

    const file = new File(['data'], 'musica.mp3', { type: 'audio/mp3' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(
      await screen.findByText(/Por favor, selecione um arquivo válido no formato .docx ou .pdf/i),
    ).toBeInTheDocument();
  });

  it('exibe erro quando parser falha', async () => {
    vi.spyOn(documentParserService, 'parseDocumentFile').mockRejectedValueOnce(
      new Error('Arquivo corrompido'),
    );

    render(<ImportBookModal open={true} onClose={vi.fn()} authorId="user-1" onSuccess={vi.fn()} />);

    const file = new File(['data'], 'corrompido.docx', { type: 'application/docx' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText('Arquivo corrompido')).toBeInTheDocument();
  });

  it('importa criando novo livro e seus capitulos', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    vi.spyOn(documentParserService, 'parseDocumentFile').mockResolvedValueOnce({
      title: 'A Lenda de Eldoria',
      chapters: mockChapters,
      totalWords: 370,
    });

    vi.spyOn(bookService, 'createBook').mockResolvedValueOnce({
      id: 'new-book-id',
      authorId: 'user-1',
      title: 'A Lenda de Eldoria',
      status: 'draft',
      wordCount: 0,
      createdAt: 1000,
      updatedAt: 1000,
    });

    vi.spyOn(bookService, 'createChapter').mockResolvedValue({
      id: 'ch-id',
      bookId: 'new-book-id',
      title: 'Capítulo',
      order: 1,
      wordCount: 100,
      content: '',
      createdAt: 1000,
      updatedAt: 1000,
    });

    vi.spyOn(bookService, 'recalculateBookWordCount').mockResolvedValue(370);

    render(
      <ImportBookModal open={true} onClose={vi.fn()} authorId="user-1" onSuccess={onSuccess} />,
    );

    const file = new File(['data'], 'eldoria.docx', { type: 'application/docx' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await screen.findByDisplayValue('A Lenda de Eldoria');

    const importBtn = screen.getByRole('button', { name: /importar 2 capítulo\(s\)/i });
    await user.click(importBtn);

    expect(bookService.createBook).toHaveBeenCalledWith('user-1', {
      title: 'A Lenda de Eldoria',
      genre: undefined,
      synopsis: undefined,
    });

    expect(bookService.createChapter).toHaveBeenCalledTimes(2);
    expect(bookService.recalculateBookWordCount).toHaveBeenCalledWith('new-book-id');
    expect(onSuccess).toHaveBeenCalledWith('new-book-id');
  });

  it('importa capitulos para um livro existente', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    const existingBook: Book = {
      id: 'existing-book-1',
      authorId: 'user-1',
      title: 'Livro Pré-existente',
      status: 'draft',
      wordCount: 500,
      createdAt: 1000,
      updatedAt: 1000,
    };

    vi.spyOn(documentParserService, 'parseDocumentFile').mockResolvedValueOnce({
      title: 'Capítulos Extras',
      chapters: [mockChapters[0]!],
      totalWords: 120,
    });

    vi.spyOn(bookService, 'createChapter').mockResolvedValue({
      id: 'ch-id',
      bookId: 'existing-book-1',
      title: 'Capítulo',
      order: 2,
      wordCount: 120,
      content: '',
      createdAt: 1000,
      updatedAt: 1000,
    });

    vi.spyOn(bookService, 'recalculateBookWordCount').mockResolvedValue(620);

    render(
      <ImportBookModal
        open={true}
        targetBook={existingBook}
        onClose={vi.fn()}
        authorId="user-1"
        onSuccess={onSuccess}
      />,
    );

    expect(screen.getByText(/Destino:/i)).toHaveTextContent('Livro Pré-existente');

    const file = new File(['data'], 'extras.pdf', { type: 'application/pdf' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    const importBtn = await screen.findByRole('button', { name: /importar 1 capítulo\(s\)/i });
    await user.click(importBtn);

    expect(bookService.createChapter).toHaveBeenCalledWith('existing-book-1', {
      title: 'Capítulo 1: O Início',
      content: mockChapters[0]?.content,
    });

    expect(onSuccess).toHaveBeenCalledWith('existing-book-1');
  });
});
