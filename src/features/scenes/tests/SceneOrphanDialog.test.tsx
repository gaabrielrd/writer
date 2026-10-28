import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, it, expect, vi } from 'vitest';
import { SceneOrphanDialog } from '../components/SceneOrphanDialog';
import * as api from '../services/sceneService';
import { document, summary, mutation, deferred } from './sceneFixtures';
vi.mock('../services/sceneService', () => ({
  getScene: vi.fn(),
  listOrphanScenes: vi.fn(),
  recoverOrphanScene: vi.fn(),
}));
const target = { kind: 'adventure' as const, id: 'adventure' };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listOrphanScenes).mockResolvedValue({
    items: [{ ...summary, parentId: 'missing' }],
    nextCursor: null,
    projectRevision: 1,
  });
  vi.mocked(api.getScene).mockResolvedValue({
    ...document,
    parentId: 'missing',
    group: null,
    project: { ...target, title: 'Aventura', universeId: null },
  });
  vi.mocked(api.recoverOrphanScene).mockResolvedValue(mutation);
});
const mount = () => {
  const onClose = vi.fn(),
    onRecovered = vi.fn();
  const view = render(
    <SceneOrphanDialog target={target} onClose={onClose} onRecovered={onRecovered} />,
  );
  return { ...view, onClose, onRecovered };
};
it('opening lists metadata only, preview is readonly, and confirmation uses the observed scene', async () => {
  const view = mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Conferir ' + summary.title }));
  await screen.findByRole('region', { name: 'Texto da cena a recuperar' });
  expect(api.recoverOrphanScene).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Mover para Sem parte' }));
  await waitFor(() => expect(view.onRecovered).toHaveBeenCalledTimes(1));
  expect(api.recoverOrphanScene).toHaveBeenCalledWith(
    expect.objectContaining({
      target,
      sceneId: document.id,
      expectedRevision: document.revision,
      expectedMissingParentId: 'missing',
    }),
  );
});
it('uncertain result preserves exactly the same operation and blocks cancellation until resolved', async () => {
  vi.mocked(api.recoverOrphanScene)
    .mockRejectedValueOnce(
      Object.assign(Error('Sem confirmação'), { code: 'functions/unavailable' }),
    )
    .mockResolvedValueOnce(mutation);
  const view = mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Conferir ' + summary.title }));
  await userEvent.click(await screen.findByRole('button', { name: 'Mover para Sem parte' }));
  await screen.findByRole('button', { name: 'Tentar novamente' });
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  const first = vi.mocked(api.recoverOrphanScene).mock.calls[0]![0];
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() => expect(view.onRecovered).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.recoverOrphanScene).mock.calls[1]![0]).toEqual(first);
});
it('empty scanned page with cursor permits continuing and never claims the search is complete', async () => {
  vi.mocked(api.listOrphanScenes).mockResolvedValueOnce({
    items: [],
    nextCursor: 'next',
    projectRevision: 1,
  });
  mount();
  await screen.findByText('Continue a busca nas próximas páginas.');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar busca' }));
  await screen.findByRole('button', { name: 'Conferir ' + summary.title });
  expect(api.listOrphanScenes).toHaveBeenLastCalledWith({ target, cursor: 'next', limit: 25 });
});
it('listing failure offers retry and does not mutate', async () => {
  vi.mocked(api.listOrphanScenes).mockRejectedValueOnce(Error('Falha de leitura'));
  mount();
  await screen.findByText('Falha de leitura');
  await userEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
  await screen.findByRole('button', { name: 'Conferir ' + summary.title });
  expect(api.recoverOrphanScene).not.toHaveBeenCalled();
});
it('changed or missing source during preview offers no recovery action', async () => {
  vi.mocked(api.getScene).mockResolvedValueOnce({ ...document, parentId: null });
  mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Conferir ' + summary.title }));
  await screen.findByText(/A cena mudou ou não está mais disponível/);
  expect(screen.queryByRole('button', { name: 'Mover para Sem parte' })).not.toBeInTheDocument();
});
it('preview sanitizes source prose and unmount suppresses late reads', async () => {
  vi.mocked(api.getScene).mockResolvedValueOnce({
    ...document,
    parentId: 'missing',
    content: '<p>Texto seguro</p><script>window.bad=1</script>',
  });
  const view = mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Conferir ' + summary.title }));
  const region = await screen.findByRole('region', { name: 'Texto da cena a recuperar' });
  expect(region.querySelector('script')).toBeNull();
  expect(region).toHaveTextContent('Texto seguro');
  view.unmount();
  const pending = deferred<Awaited<ReturnType<typeof api.getScene>>>();
  vi.mocked(api.getScene).mockReturnValueOnce(pending.promise);
  const late = mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Conferir ' + summary.title }));
  late.unmount();
  await act(async () => {
    pending.resolve(document);
    await pending.promise;
  });
  expect(late.onRecovered).not.toHaveBeenCalled();
});
