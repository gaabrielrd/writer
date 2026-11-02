import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ImageLibraryPage, ImageLibraryPicker } from '../index';
import * as service from '../services/imageLibraryService';
import type { ImagePage } from '../model/image';
const auth: { user: { uid: string } | null; loading: boolean } = vi.hoisted(() => ({
  user: { uid: 'author' },
  loading: false,
}));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/imageLibraryService', () => ({
  listLibraryImages: vi.fn(),
  renameLibraryImage: vi.fn(),
  deleteLibraryImage: vi.fn(),
}));
const image = {
  id: 'image-000000000001',
  name: 'Atlas',
  url: 'https://example.test/cover.png',
  createdAt: 1000,
  useCount: 0,
};
function page() {
  return render(
    <MemoryRouter>
      <ImageLibraryPage />
    </MemoryRouter>,
  );
}
describe('image library', () => {
  it('can retry deleting a pending image after reopening and excludes it from selection', async () => {
    vi.mocked(service.listLibraryImages).mockResolvedValue({
      images: [{ ...image, state: 'deleting' }],
      cursor: null,
    });
    const view = page();
    await screen.findByText('Exclusão pendente. Tente excluir novamente.');
    expect(screen.getByRole('button', { name: 'Renomear Atlas' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir Atlas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    expect(service.deleteLibraryImage).toHaveBeenCalledWith(image.id);
    view.unmount();
    render(<ImageLibraryPicker open onClose={vi.fn()} onSelect={vi.fn()} />);
    await screen.findByText('Sua biblioteca está vazia');
    expect(screen.queryByRole('button', { name: 'Selecionar Atlas' })).not.toBeInTheDocument();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { uid: 'author' };
    auth.loading = false;
    vi.mocked(service.listLibraryImages).mockResolvedValue({ images: [image], cursor: null });
    vi.mocked(service.renameLibraryImage).mockResolvedValue(undefined);
    vi.mocked(service.deleteLibraryImage).mockResolvedValue(undefined);
  });
  it('previews, renames and deletes an unused image after confirmation', async () => {
    const user = userEvent.setup();
    page();
    await screen.findByText('Atlas');
    await user.click(screen.getByRole('button', { name: 'Visualizar' }));
    expect(screen.getByRole('dialog', { name: 'Atlas' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Renomear Atlas' }));
    await user.clear(screen.getByLabelText('Nome da imagem'));
    await user.type(screen.getByLabelText('Nome da imagem'), 'Marés');
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(await screen.findByText('Marés')).toBeInTheDocument();
    expect(service.renameLibraryImage).toHaveBeenCalledWith(image.id, 'Marés');
    await user.click(screen.getByRole('button', { name: 'Excluir Marés' }));
    expect(service.deleteLibraryImage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Excluir Marés' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    expect(await screen.findByText('Sua biblioteca está vazia')).toBeInTheDocument();
    expect(service.deleteLibraryImage).toHaveBeenCalledWith(image.id);
  });
  it('paginates and blocks deletion of images in use', async () => {
    vi.mocked(service.listLibraryImages)
      .mockResolvedValueOnce({ images: [{ ...image, useCount: 2 }], cursor: image.id })
      .mockResolvedValueOnce({
        images: [{ ...image, id: 'image-000000000002', name: 'Outra' }],
        cursor: null,
      });
    page();
    expect(await screen.findByRole('button', { name: 'Excluir Atlas' })).toBeDisabled();
    expect(screen.getByText(/2 usos/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Excluir Atlas' })).toHaveAttribute(
      'title',
      'Remova os vínculos da imagem antes de excluir',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Carregar mais imagens' }));
    await screen.findByText('Outra');
    expect(screen.getByText('Atlas')).toBeInTheDocument();
    expect(service.listLibraryImages).toHaveBeenLastCalledWith(image.id);
  });
  it('retries errors and selects an image without generation or credit changes', async () => {
    vi.mocked(service.listLibraryImages).mockRejectedValueOnce(new Error('Sem conexão'));
    const select = vi.fn();
    const close = vi.fn();
    render(<ImageLibraryPicker open onClose={close} onSelect={select} />);
    await screen.findByText('Sem conexão');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Selecionar Atlas' }));
    expect(select).toHaveBeenCalledWith(image);
    expect(close).toHaveBeenCalledOnce();
    expect(service.renameLibraryImage).not.toHaveBeenCalled();
    expect(service.deleteLibraryImage).not.toHaveBeenCalled();
  });
  it('keeps a failed rename editable and a failed deletion visible', async () => {
    const user = userEvent.setup();
    vi.mocked(service.renameLibraryImage).mockRejectedValueOnce(new Error('Falha ao salvar'));
    vi.mocked(service.deleteLibraryImage).mockRejectedValueOnce(new Error('A imagem está em uso'));
    page();
    await screen.findByText('Atlas');
    await user.click(screen.getByRole('button', { name: 'Renomear Atlas' }));
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(await screen.findByRole('dialog', { name: 'Renomear imagem' })).toHaveTextContent(
      'Falha ao salvar',
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Excluir Atlas' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Excluir imagem?' })).toHaveTextContent(
        'A imagem está em uso',
      ),
    );
    expect(screen.getByText('Atlas')).toBeInTheDocument();
  });
  it('does not show an old account response after switching accounts', async () => {
    let resolve!: (page: ImagePage) => void;
    vi.mocked(service.listLibraryImages)
      .mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      )
      .mockResolvedValueOnce({ images: [], cursor: null });
    const view = page();
    await waitFor(() => expect(service.listLibraryImages).toHaveBeenCalledOnce());
    auth.user = { uid: 'other' };
    view.rerender(
      <MemoryRouter>
        <ImageLibraryPage />
      </MemoryRouter>,
    );
    await screen.findByText('Sua biblioteca está vazia');
    await act(async () => {
      resolve({ images: [image], cursor: null });
      await Promise.resolve();
    });
    expect(screen.queryByText('Atlas')).not.toBeInTheDocument();
  });
  it('waits for auth and closes a picker for a signed-out user', () => {
    auth.loading = true;
    const view = page();
    expect(screen.getByRole('status')).toBeInTheDocument();
    auth.loading = false;
    auth.user = null;
    view.rerender(<ImageLibraryPicker open onClose={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
