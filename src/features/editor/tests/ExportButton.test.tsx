import { chooseDropdown } from '@/test/dropdown';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderWithProviders, screen, waitFor } from '@/test/render';
import { ExportButton } from '../components/ExportButton';
import { exportManuscript } from '../services/exportManuscript';
import { exportBook, exportChapter } from './exportFixtures';

vi.mock('../services/exportManuscript', () => ({ exportManuscript: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(exportManuscript).mockResolvedValue();
});

describe('ExportButton', () => {
  it('opens an accessible dialog, exports current edits and restores focus after closing', async () => {
    const { user } = renderWithProviders(
      <ExportButton
        book={exportBook}
        currentChapter={exportChapter}
        currentContent="Mudança não salva"
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Exportar' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Exportar manuscrito' })).toBeInTheDocument();
    expect(screen.getByLabelText('Conteúdo da exportação')).toHaveTextContent('Capítulo atual:');
    expect(screen.getByText(/mesmo antes do salvamento/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Baixar arquivo' }));
    expect(exportManuscript).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'chapter',
        format: 'markdown',
        currentContent: 'Mudança não salva',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Arquivo preparado');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('offers full-book export at the book panel and explains the native PDF save step', async () => {
    const { user } = renderWithProviders(<ExportButton book={exportBook} />);
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(screen.getByLabelText('Conteúdo da exportação')).toHaveTextContent('Livro inteiro');
    expect(screen.queryByRole('option', { name: /Capítulo atual/ })).not.toBeInTheDocument();
    await chooseDropdown(user, screen.getByLabelText('Formato do arquivo'), 'PDF (impressão)');
    expect(screen.getByText(/desative cabeçalhos/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abrir impressão' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Impressão aberta');
    expect(exportManuscript).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'book', format: 'pdf' }),
    );
  });

  it('shows a recoverable error and retries with the newly selected format', async () => {
    vi.mocked(exportManuscript).mockRejectedValueOnce(new Error('Sem conexão'));
    const { user } = renderWithProviders(
      <ExportButton book={exportBook} currentChapter={exportChapter} />,
    );
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    await user.click(screen.getByRole('button', { name: 'Baixar arquivo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão');
    expect(screen.getByRole('button', { name: 'Baixar arquivo' })).toBeEnabled();
    await chooseDropdown(user, screen.getByLabelText('Formato do arquivo'), 'Word (.docx)');
    await chooseDropdown(user, screen.getByLabelText('Conteúdo da exportação'), 'Livro inteiro');
    await user.click(screen.getByRole('button', { name: 'Baixar arquivo' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Sem conexão')).not.toBeInTheDocument();
    expect(exportManuscript).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: 'book', format: 'docx' }),
    );
  });

  it('disables reentry while exporting and cancellation prevents a late success from reopening state', async () => {
    let finish: (() => void) | undefined;
    vi.mocked(exportManuscript).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { user } = renderWithProviders(<ExportButton book={exportBook} />);
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    await user.dblClick(screen.getByRole('button', { name: 'Baixar arquivo' }));
    expect(exportManuscript).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Preparando…' })).toBeDisabled();
    expect(screen.getByLabelText('Formato do arquivo')).toBeDisabled();
    const signal = vi.mocked(exportManuscript).mock.calls[0]?.[0].signal;
    await user.click(screen.getByRole('button', { name: 'Cancelar exportação' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finish?.();
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar arquivo' })).toBeEnabled();
  });

  it('aborts an in-flight export on unmount and hides cancellation errors', async () => {
    let fail: ((error: Error) => void) | undefined;
    vi.mocked(exportManuscript).mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    const { user, unmount } = renderWithProviders(<ExportButton book={exportBook} />);
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    await user.click(screen.getByRole('button', { name: 'Baixar arquivo' }));
    const signal = vi.mocked(exportManuscript).mock.calls[0]?.[0].signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      fail?.(new Error('Canceled'));
      await Promise.resolve();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a generic failure for unexpected errors and forces private JSON backups to full book', async () => {
    vi.mocked(exportManuscript).mockRejectedValueOnce('unexpected');
    const { user } = renderWithProviders(
      <ExportButton book={exportBook} currentChapter={exportChapter} />,
    );
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    await user.click(screen.getByRole('button', { name: 'Baixar arquivo' }));
    expect(
      await screen.findByText('Não foi possível exportar. Tente novamente.'),
    ).toBeInTheDocument();
    await chooseDropdown(
      user,
      screen.getByLabelText('Formato do arquivo'),
      'Backup completo (.json)',
    );
    expect(screen.getByLabelText('Conteúdo da exportação')).toBeDisabled();
    expect(screen.getByLabelText('Conteúdo da exportação')).toHaveTextContent('Livro inteiro');
    expect(screen.getByText(/fichas de lore privadas/)).toBeInTheDocument();
    expect(screen.getByText(/backup v6 não inclui o histórico de versões do texto/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Baixar arquivo' }));
    expect(exportManuscript).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: 'book', format: 'json' }),
    );
  });

  it('uses the latest prop content and clean state when the dialog reopens', async () => {
    const { user, rerender } = renderWithProviders(
      <ExportButton
        book={exportBook}
        currentChapter={exportChapter}
        currentContent="Primeira versão"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    rerender(
      <ExportButton
        book={exportBook}
        currentChapter={exportChapter}
        currentContent="Última versão"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Baixar arquivo' }));
    expect(exportManuscript).toHaveBeenCalledWith(
      expect.objectContaining({ currentContent: 'Última versão' }),
    );
    await user.click(screen.getAllByRole('button', { name: 'Fechar' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Exportar' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
