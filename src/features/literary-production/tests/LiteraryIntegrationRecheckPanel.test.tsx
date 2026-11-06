import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiteraryIntegrationRecheckPanel } from '../components/LiteraryIntegrationRecheckPanel';
import {
  startLiteraryIntegrationRecheck,
  advanceLiteraryIntegrationRecheck,
  cancelLiteraryIntegrationRecheck,
  type IntegrationRecheck,
} from '../services/literaryIntegrationRecheckService';
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'author' } }) }));
vi.mock('../services/literaryIntegrationRecheckService', () => ({
  startLiteraryIntegrationRecheck: vi.fn(),
  getLiteraryIntegrationRecheck: vi.fn(),
  advanceLiteraryIntegrationRecheck: vi.fn(),
  cancelLiteraryIntegrationRecheck: vi.fn(),
  cancelPendingLiteraryIntegrationRecheck: vi.fn(),
}));
const record = (state: IntegrationRecheck['state'] = 'scanning'): IntegrationRecheck => ({
  operationId: 'integration-recheck-00001',
  jobId: 'integration-original-00001',
  state,
  phase: state === 'scanning' ? 'chapters' : 'done',
  selectedChapters: 2,
  verifiedUnits: 2,
  verifiedAnalyses: 4,
  impact: null,
  createdAt: 1,
  completedAt: state === 'scanning' ? null : 2,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(startLiteraryIntegrationRecheck).mockResolvedValue(record());
});
it('records a recheck without generating or scanning until explicitly resumed', async () => {
  const user = userEvent.setup();
  render(
    <LiteraryIntegrationRecheckPanel
      bookId="book"
      jobId="integration-original-00001"
      sourceToken={'a'.repeat(64)}
    />,
  );
  expect(startLiteraryIntegrationRecheck).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Registrar reconferência das fontes' }));
  await screen.findByRole('button', { name: 'Retomar reconferência até concluir' });
  expect(advanceLiteraryIntegrationRecheck).not.toHaveBeenCalled();
});
it('completes a recheck and requests a fresh parent checkpoint without silently accepting the integration', async () => {
  const user = userEvent.setup(),
    refresh = vi.fn();
  vi.mocked(advanceLiteraryIntegrationRecheck).mockResolvedValue(record('done'));
  render(
    <LiteraryIntegrationRecheckPanel
      bookId="book"
      jobId="integration-original-00001"
      sourceToken={'a'.repeat(64)}
      onRefresh={refresh}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Registrar reconferência das fontes' }));
  await user.click(
    await screen.findByRole('button', { name: 'Retomar reconferência até concluir' }),
  );
  await screen.findByText(/A reconferência foi concluída sem gerar análises/);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(advanceLiteraryIntegrationRecheck).toHaveBeenCalledWith(
    'book',
    'integration-recheck-00001',
  );
});
it('shows the first divergence as an impact rather than declaring the changed manuscript integrated', async () => {
  const user = userEvent.setup();
  vi.mocked(advanceLiteraryIntegrationRecheck).mockResolvedValue({
    ...record('changed'),
    impact: { kind: 'chapter', chapterId: 'chapter', message: 'A composição do capítulo mudou.' },
  });
  render(
    <LiteraryIntegrationRecheckPanel
      bookId="book"
      jobId="integration-original-00001"
      sourceToken={'a'.repeat(64)}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Registrar reconferência das fontes' }));
  await user.click(
    await screen.findByRole('button', { name: 'Retomar reconferência até concluir' }),
  );
  await screen.findByText(/A composição do capítulo mudou/);
  expect(
    screen.queryByText(/A reconferência foi concluída sem gerar análises/),
  ).not.toBeInTheDocument();
});
it('does not reopen canceled rechecks from a late scan reply', async () => {
  const user = userEvent.setup();
  let resolve!: (value: IntegrationRecheck) => void;
  vi.mocked(advanceLiteraryIntegrationRecheck).mockImplementation(
    () =>
      new Promise((finish) => {
        resolve = finish;
      }),
  );
  vi.mocked(cancelLiteraryIntegrationRecheck).mockResolvedValue(record('canceled'));
  render(
    <LiteraryIntegrationRecheckPanel
      bookId="book"
      jobId="integration-original-00001"
      sourceToken={'a'.repeat(64)}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Registrar reconferência das fontes' }));
  await user.click(
    await screen.findByRole('button', { name: 'Retomar reconferência até concluir' }),
  );
  await waitFor(() => expect(advanceLiteraryIntegrationRecheck).toHaveBeenCalledOnce());
  await user.click(screen.getByRole('button', { name: 'Cancelar reconferência' }));
  await screen.findByText(/Reconferência cancelada/);
  resolve(record('done'));
  await waitFor(() =>
    expect(
      screen.queryByText(/A reconferência foi concluída sem gerar análises/),
    ).not.toBeInTheDocument(),
  );
});
