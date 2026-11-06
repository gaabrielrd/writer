import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { LiteraryMilestonePanel } from '../components/LiteraryMilestonePanel';
import * as api from '../services/literaryMilestoneService';
import { readCompleteWorkVersion, type VersionSummary } from '@/features/manuscript-history';
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'author' } }) }));
vi.mock('@/features/manuscript-history', () => ({ readCompleteWorkVersion: vi.fn() }));
vi.mock('../services/literaryMilestoneService', () => ({
  startLiteraryMilestone: vi.fn(),
  getLiteraryMilestone: vi.fn(),
  advanceLiteraryMilestone: vi.fn(),
  cancelLiteraryMilestone: vi.fn(),
  listLiteraryMilestones: vi.fn(),
  listLiteraryMilestoneVersions: vi.fn(),
}));
const job = (state: api.LiteraryMilestone['state'] = 'planning'): api.LiteraryMilestone => ({
  jobId: 'milestone-operation-0001',
  chapterId: 'chapter',
  kind: 'firstDraft',
  state,
  planned: 2,
  captured: state === 'done' ? 2 : 0,
  verified: state === 'done' ? 2 : 0,
  createdAt: 1,
  completedAt: state === 'done' ? 2 : null,
  wordCount: 7,
  note: '',
});
const version: VersionSummary = {
  id: 'version',
  target: { kind: 'book', id: 'book' },
  resource: { kind: 'scene', id: 'scene' },
  createdAt: 1,
  reason: 'manual',
  label: 'Texto anterior',
  wordCount: 7,
  byteLength: 20,
  contentHash: 'a'.repeat(64),
  chunkCount: 1,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.startLiteraryMilestone).mockResolvedValue(job());
});
it('chooses a revised milestone and preserves only after explicit resume, without claiming editorial completion', async () => {
  const pending = vi.fn();
  vi.mocked(api.advanceLiteraryMilestone)
    .mockResolvedValueOnce(job('capturing'))
    .mockResolvedValueOnce(job('done'));
  render(<LiteraryMilestonePanel bookId="book" chapterId="chapter" onPendingChange={pending} />);
  expect(api.startLiteraryMilestone).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('combobox', { name: 'Marco da versão' }));
  await userEvent.click(screen.getByRole('option', { name: 'Versão revisada' }));
  await userEvent.click(screen.getByRole('button', { name: 'Iniciar preservação do texto salvo' }));
  await screen.findByText('Identificando cenas');
  expect(vi.mocked(api.startLiteraryMilestone).mock.calls[0]![0]).toMatchObject({
    target: { kind: 'book', id: 'book' },
    chapterId: 'chapter',
    kind: 'revised',
  });
  expect(api.advanceLiteraryMilestone).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Retomar preservação até concluir' }));
  await screen.findByText('Captura concluída');
  expect(api.advanceLiteraryMilestone).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/não certifica qualidade/)).toBeVisible();
  expect(pending).toHaveBeenLastCalledWith(false);
});
it('paginates captures and preserved units, reads the original text and closes it without restoring', async () => {
  vi.mocked(api.listLiteraryMilestones)
    .mockResolvedValueOnce({ items: [job()], nextAfterId: 'cursor' })
    .mockResolvedValueOnce({
      items: [{ ...job('done'), jobId: 'second', kind: 'revised' }],
      nextAfterId: null,
    });
  vi.mocked(api.getLiteraryMilestone).mockResolvedValue({ ...job('done'), jobId: 'second' });
  vi.mocked(api.listLiteraryMilestoneVersions)
    .mockResolvedValueOnce({
      items: [{ index: 0, resource: version.resource, version }],
      nextAfterIndex: 0,
    })
    .mockResolvedValueOnce({
      items: [{ index: 1, resource: { kind: 'scene', id: 'other' }, version: null }],
      nextAfterIndex: null,
    });
  vi.mocked(readCompleteWorkVersion).mockResolvedValue({
    version,
    content: '<p>Texto preservado antes da revisão.</p>',
  });
  render(<LiteraryMilestonePanel bookId="book" chapterId="chapter" />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar capturas do capítulo' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Mais capturas' }));
  await userEvent.click(
    await screen.findByRole('button', { name: /Versão revisada.*Captura concluída/ }),
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Consultar checkpoint' }));
  await waitFor(() => expect(api.getLiteraryMilestone).toHaveBeenCalledTimes(2));
  await userEvent.click(screen.getByRole('button', { name: 'Consultar versões preservadas' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Mais unidades' }));
  await screen.findByText('Unidade 2 ainda não preservada');
  await userEvent.click(screen.getByRole('button', { name: 'Ler unidade 1 · 7 palavras' }));
  const text = await screen.findByRole('region', { name: 'Texto preservado' });
  expect(within(text).getByText('Texto preservado antes da revisão.')).toBeVisible();
  expect(readCompleteWorkVersion).toHaveBeenCalledWith(
    { target: { kind: 'book', id: 'book' }, versionId: 'version' },
    expect.any(Function),
  );
  await userEvent.click(within(text).getByRole('button', { name: 'Fechar leitura' }));
  expect(screen.queryByRole('region', { name: 'Texto preservado' })).not.toBeInTheDocument();
  expect(api.startLiteraryMilestone).not.toHaveBeenCalled();
});
it('keeps the exact uncertain capture request and cancels a confirmed capture without removing preserved versions', async () => {
  vi.mocked(api.startLiteraryMilestone).mockRejectedValueOnce(new Error('Resposta perdida'));
  vi.mocked(api.cancelLiteraryMilestone).mockResolvedValue(job('canceled'));
  render(<LiteraryMilestonePanel bookId="book" chapterId="chapter" />);
  await userEvent.click(screen.getByRole('button', { name: 'Iniciar preservação do texto salvo' }));
  await screen.findByText('Resposta perdida');
  expect(screen.getByRole('combobox', { name: 'Marco da versão' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Recuperar a mesma captura' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Cancelar esta captura' }));
  await screen.findByText('Captura cancelada');
  expect(vi.mocked(api.startLiteraryMilestone).mock.calls[0]).toEqual(
    vi.mocked(api.startLiteraryMilestone).mock.calls[1],
  );
  expect(screen.getByText(/já entraram no histórico são preservadas/)).toBeVisible();
});
it('pauses after the pending preservation step and resumes only after another explicit click', async () => {
  let complete!: (value: api.LiteraryMilestone) => void;
  vi.mocked(api.advanceLiteraryMilestone)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    )
    .mockResolvedValue(job('done'));
  render(<LiteraryMilestonePanel bookId="book" chapterId="chapter" />);
  await userEvent.click(screen.getByRole('button', { name: 'Iniciar preservação do texto salvo' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Retomar preservação até concluir' }),
  );
  await waitFor(() => expect(api.advanceLiteraryMilestone).toHaveBeenCalledOnce());
  await userEvent.click(screen.getByRole('button', { name: 'Pausar após a etapa atual' }));
  await act(() => {
    complete(job('capturing'));
  });
  await screen.findByText('Preservando versões');
  expect(api.advanceLiteraryMilestone).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole('button', { name: 'Retomar preservação até concluir' }));
  await screen.findByText('Captura concluída');
  expect(api.advanceLiteraryMilestone).toHaveBeenCalledTimes(2);
});
it('shows read failures and an empty inventory without starting a capture', async () => {
  vi.mocked(api.listLiteraryMilestones)
    .mockRejectedValueOnce(new Error('Leitura indisponível'))
    .mockResolvedValueOnce({ items: [], nextAfterId: null });
  render(<LiteraryMilestonePanel bookId="book" chapterId="chapter" />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar capturas do capítulo' }));
  await screen.findByText('Leitura indisponível');
  await userEvent.click(screen.getByRole('button', { name: 'Consultar capturas do capítulo' }));
  await screen.findByText('Nenhuma captura registrada');
  expect(api.startLiteraryMilestone).not.toHaveBeenCalled();
});
