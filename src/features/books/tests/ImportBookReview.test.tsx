import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportBookModal } from '../components/ImportBookModal';
import { createParsedChapter } from '../model/documentImport';
import * as parser from '../services/documentParserService';
import * as books from '../services/bookService';

vi.mock('../components/PdfPagePreview', () => ({
  PdfPagePreview: ({ pageNumber }: { pageNumber: number }) => (
    <div role="img" aria-label={`Página original ${pageNumber}`} />
  ),
}));

const blocks = [
  { html: '<p>Abertura da aventura.</p>', text: 'Abertura da aventura.', page: 2 },
  {
    html: '<blockquote><p>Leia aos jogadores.</p></blockquote>',
    text: 'Leia aos jogadores.',
    page: 3,
  },
];
const chapter = () =>
  createParsedChapter('Parte 1: A chegada', blocks.map((b) => b.html).join(''), 0, blocks);
const result = () => ({
  title: 'Campanha',
  chapters: [chapter()],
  totalWords: 6,
  pageCount: 4,
  warnings: [{ code: 'no-text' as const, message: 'Página sem texto extraível.', pages: [4] }],
});
function upload(name = 'aventura.pdf') {
  fireEvent.change(screen.getByLabelText('Arquivo do manuscrito'), {
    target: { files: [new File(['PDF'], name)] },
  });
}

describe('conferência do PDF', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('mostra avisos, páginas de origem e abre a página sem texto com a prévia completa', async () => {
    vi.spyOn(parser, 'parseDocumentFile').mockResolvedValue(result());
    render(<ImportBookModal open onClose={vi.fn()} authorId="autor" onSuccess={vi.fn()} />);
    upload();
    await screen.findByText('Página sem texto extraível.');
    expect(screen.getByText('Páginas de origem: 2, 3')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Página 4' }));
    expect(screen.getByRole('img', { name: 'Página original 4' })).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: 'Texto importado de Parte 1: A chegada' }),
    ).toHaveTextContent('Leia aos jogadores.');
    expect(screen.getByRole('button', { name: 'Recolher prévia' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
  it('divide e une capítulos pela revisão, mantendo conteúdo e ordem na gravação', async () => {
    vi.spyOn(parser, 'parseDocumentFile').mockResolvedValue(result());
    vi.spyOn(books, 'createBook').mockResolvedValue({ id: 'livro' } as Awaited<
      ReturnType<typeof books.createBook>
    >);
    const save = vi
      .spyOn(books, 'createChapter')
      .mockResolvedValue({ id: 'salvo' } as Awaited<ReturnType<typeof books.createChapter>>);
    vi.spyOn(books, 'recalculateBookWordCount').mockResolvedValue(6);
    render(<ImportBookModal open onClose={vi.fn()} authorId="autor" onSuccess={vi.fn()} />);
    upload();
    await screen.findByDisplayValue('Campanha');
    await userEvent.click(screen.getByRole('button', { name: 'Conferir conteúdo' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Dividir antes do trecho' }));
    await userEvent.click(screen.getByRole('option', { name: '2. Leia aos jogadores.' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dividir capítulo' }));
    expect(screen.getByText(/capítulos encontrados/)).toHaveTextContent('2 capítulos encontrados');
    await userEvent.click(screen.getByRole('button', { name: 'Unir ao próximo capítulo' }));
    expect(screen.getByText(/capítulos encontrados/)).toHaveTextContent('1 capítulos encontrados');
    await userEvent.click(screen.getByRole('button', { name: 'Importar 1 Capítulo(s)' }));
    expect(save).toHaveBeenCalledWith('livro', {
      title: 'Parte 1: A chegada',
      content: blocks.map((b) => b.html).join(''),
    });
  });
  it('anuncia progresso, cancela análise e ignora resposta tardia', async () => {
    let finish!: (value: parser.DocumentParseResult) => void;
    let signal!: AbortSignal;
    vi.spyOn(parser, 'parseDocumentFile').mockImplementation((_file, options) => {
      signal = options!.signal!;
      options?.onProgress?.(2, 64);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const close = vi.fn();
    render(<ImportBookModal open onClose={close} authorId="autor" onSuccess={vi.fn()} />);
    upload();
    expect(await screen.findByText('Página 2 de 64')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(signal.aborted).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    await act(async () => {
      finish(result());
      await Promise.resolve();
    });
    expect(screen.queryByDisplayValue('Campanha')).not.toBeInTheDocument();
  });
  it('troca o arquivo durante análise sem aceitar resultados do arquivo anterior', async () => {
    let finish!: (value: parser.DocumentParseResult) => void;
    const parse = vi
      .spyOn(parser, 'parseDocumentFile')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce({ ...result(), title: 'Novo PDF' });
    render(<ImportBookModal open onClose={vi.fn()} authorId="autor" onSuccess={vi.fn()} />);
    upload();
    await userEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    upload('novo.pdf');
    await screen.findByDisplayValue('Novo PDF');
    await act(async () => {
      finish(result());
      await Promise.resolve();
    });
    expect(screen.getByDisplayValue('Novo PDF')).toBeVisible();
    expect(parse).toHaveBeenCalledTimes(2);
  });
  it('retoma falha parcial sem recriar o livro ou capítulos já gravados', async () => {
    const first = chapter();
    const second = { ...chapter(), id: 'segundo', title: 'Parte 2: A vila' };
    vi.spyOn(parser, 'parseDocumentFile').mockResolvedValue({
      ...result(),
      chapters: [first, second],
    });
    const create = vi
      .spyOn(books, 'createBook')
      .mockResolvedValue({ id: 'livro' } as Awaited<ReturnType<typeof books.createBook>>);
    const save = vi
      .spyOn(books, 'createChapter')
      .mockResolvedValueOnce({ id: 'salvo-1' } as Awaited<ReturnType<typeof books.createChapter>>)
      .mockRejectedValueOnce(new Error('Sem conexão'))
      .mockResolvedValueOnce({ id: 'salvo-2' } as Awaited<ReturnType<typeof books.createChapter>>);
    vi.spyOn(books, 'recalculateBookWordCount').mockResolvedValue(6);
    const success = vi.fn();
    const close = vi.fn();
    render(<ImportBookModal open onClose={close} authorId="autor" onSuccess={success} />);
    upload();
    await screen.findByDisplayValue('Campanha');
    await userEvent.click(screen.getByRole('button', { name: 'Importar 2 Capítulo(s)' }));
    await screen.findByText('Sem conexão');
    expect(screen.getByRole('button', { name: 'Trocar' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Importar 2 Capítulo(s)' }));
    expect(create).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledTimes(3);
    expect(success).toHaveBeenCalledWith('livro');
    expect(close).toHaveBeenCalledOnce();
  });
});
