import { beforeEach, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiteraryIntegrationPanel } from '../components/LiteraryIntegrationPanel';
import * as integrationService from '../services/literaryIntegrationService';
import * as findingService from '../services/literaryFindingService';
import * as booksApi from '@/features/books';
import {
  startLiteraryIntegration,
  advanceLiteraryIntegration,
  acceptLiteraryIntegration,
  cancelLiteraryIntegration,
  type LiteraryIntegration,
} from '../services/literaryIntegrationService';
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'author' } }) }));
vi.mock('@/features/books', () => ({ listActs: vi.fn() }));
vi.mock('../components/WritingSourcePicker', () => ({ WritingSourcePicker: () => null }));
vi.mock('../services/literaryIntegrationService', () => ({
  startLiteraryIntegration: vi.fn(),
  getLiteraryIntegrationSetup: vi.fn(),
  listLiteraryArchitectureInventory: vi.fn(),
  previewLiteraryArchitectureSource: vi.fn(),
  getLiteraryIntegration: vi.fn(),
  advanceLiteraryIntegration: vi.fn(),
  cancelLiteraryIntegration: vi.fn(),
  cancelPendingLiteraryIntegration: vi.fn(),
  cancelPendingLiteraryIntegrationAnalysis: vi.fn(),
  retryLiteraryIntegrationAnalysis: vi.fn(),
  acceptLiteraryIntegration: vi.fn(),
  listLiteraryIntegrations: vi.fn(),
  listLiteraryIntegrationResults: vi.fn(),
  getLiteraryIntegrationResult: vi.fn(),
}));
vi.mock('../services/literaryFindingService', () => ({
  getLiteraryFindingContext: vi.fn(),
  getLiteraryFindingDecision: vi.fn(),
  saveLiteraryFindingDecision: vi.fn(),
  confirmLiteraryFindingCorrection: vi.fn(),
  listLiteraryFindingDecisions: vi.fn(),
  listLiteraryFindingDecisionVersions: vi.fn(),
  getLiteraryFindingDecisionVersion: vi.fn(),
  findingRequestRejected: vi.fn(),
}));
vi.mock('../services/literaryPlanningService', () => ({
  listLiteraryPlans: vi.fn(),
  listLiteraryReferences: vi.fn(),
}));
const state = (status: LiteraryIntegration['state'] = 'planning'): LiteraryIntegration => ({
  jobId: 'integration-operation-0001',
  level: 'book',
  actId: null,
  state: status,
  chapters: 2,
  contextChapters: 0,
  units: 2,
  readUnits: status === 'done' ? 2 : 0,
  segments: status === 'done' ? 2 : 0,
  boundaries: status === 'done' ? 1 : 0,
  expectedBoundaries: 1,
  analyses: status === 'done' ? 4 : 0,
  blocking: 0,
  warnings: 0,
  suggestions: 0,
  sourceToken: 'a'.repeat(64),
  pendingRequestId: null,
  finalRequestId: status === 'done' ? 'integration-final-0001' : null,
  authorAccepted: false,
  createdAt: 1,
  completedAt: status === 'done' ? 2 : null,
  message: null,
  coverage: {
    scope: 'book',
    wholeAct: false,
    wholeBook: status === 'done',
    verifiedUnits: status === 'done' ? 2 : 0,
    verifiedAnalyses: status === 'done' ? 4 : 0,
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(startLiteraryIntegration).mockResolvedValue(state());
});
it('registration does not start a reading or publish without the explicit resume action', async () => {
  const user = userEvent.setup();
  render(<LiteraryIntegrationPanel bookId="book" />);
  expect(startLiteraryIntegration).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Registrar integração' }));
  await screen.findByText('Organizando fontes');
  expect(advanceLiteraryIntegration).not.toHaveBeenCalled();
  expect(acceptLiteraryIntegration).not.toHaveBeenCalled();
});
it('verified complete coverage still requires a separate author acceptance', async () => {
  const user = userEvent.setup();
  vi.mocked(advanceLiteraryIntegration)
    .mockResolvedValueOnce(state('reading'))
    .mockResolvedValueOnce(state('done'));
  vi.mocked(acceptLiteraryIntegration).mockResolvedValue({
    ...state('done'),
    authorAccepted: true,
  });
  render(<LiteraryIntegrationPanel bookId="book" />);
  await user.click(screen.getByRole('button', { name: 'Registrar integração' }));
  await user.click(await screen.findByRole('button', { name: 'Retomar integração até concluir' }));
  await screen.findByText('Cobertura integrada concluída');
  expect(acceptLiteraryIntegration).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Registrar aceite da integração' }));
  await waitFor(() =>
    expect(acceptLiteraryIntegration).toHaveBeenCalledWith(
      'book',
      'integration-operation-0001',
      'a'.repeat(64),
    ),
  );
  await screen.findByText(/A publicação permanece uma ação separada/);
});
it('a late reading reply cannot reopen a canceled integration in the panel', async () => {
  const user = userEvent.setup();
  let resolve!: (value: LiteraryIntegration) => void;
  vi.mocked(advanceLiteraryIntegration).mockImplementation(
    () =>
      new Promise((finish) => {
        resolve = finish;
      }),
  );
  vi.mocked(cancelLiteraryIntegration).mockResolvedValue(state('canceled'));
  render(<LiteraryIntegrationPanel bookId="book" />);
  await user.click(screen.getByRole('button', { name: 'Registrar integração' }));
  await user.click(await screen.findByRole('button', { name: 'Retomar integração até concluir' }));
  await waitFor(() => expect(advanceLiteraryIntegration).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole('button', { name: 'Cancelar esta integração' }));
  await screen.findByText('Integração cancelada');
  resolve(state('done'));
  await waitFor(() =>
    expect(screen.queryByText('Cobertura integrada concluída')).not.toBeInTheDocument(),
  );
});

it('keeps decision drafts mounted while navigating between analyses and open decisions', async () => {
  const user = userEvent.setup(),
    work = vi.fn();
  vi.mocked(startLiteraryIntegration).mockResolvedValue(state('done'));
  vi.mocked(integrationService.listLiteraryIntegrationResults).mockResolvedValue({
    items: [
      { index: 0, requestId: 'reading-request-000001', kind: 'reading' },
      { index: 1, requestId: 'reading-request-000002', kind: 'reading' },
    ],
    nextAfterIndex: null,
  });
  vi.mocked(integrationService.getLiteraryIntegrationResult).mockImplementation(
    (_book, jobId, requestId) =>
      Promise.resolve({
        state: 'done',
        jobId,
        requestId,
        kind: 'reading',
        evidenceIds: [],
        sources: [{ id: 'manuscript', label: 'A carta', offsetBase: 0 }],
        result: {
          complete: true,
          report: 'Relatório ' + requestId,
          findings: [
            {
              severity: 'warning',
              problem: 'Conferir a passagem.',
              action: 'Conferir com o autor.',
              evidence: [{ sourceId: 'manuscript', quote: 'Uma carta chegou.', offset: 0 }],
              status: 'open',
            },
          ],
          matrix: [],
          coverage: {
            scope: 'unit-segment',
            wholeChapter: false,
            wholeAct: false,
            wholeBook: false,
          },
        },
      }),
  );
  vi.mocked(findingService.getLiteraryFindingContext).mockImplementation((_book, source) =>
    Promise.resolve({ id: source.requestId, source, options: [] }),
  );
  vi.mocked(findingService.getLiteraryFindingDecision).mockImplementation((_book, id) =>
    Promise.resolve({ id, state: 'unrecorded' }),
  );
  render(<LiteraryIntegrationPanel bookId="book" onWorkChange={work} />);
  await user.click(screen.getByRole('button', { name: 'Registrar integração' }));
  await user.click(await screen.findByRole('button', { name: 'Consultar matriz e análises' }));
  await user.click(await screen.findByRole('button', { name: '1 · Leitura e matriz' }));
  await user.click(await screen.findByRole('button', { name: 'Tratar este achado' }));
  const first = await screen.findByRole('textbox', { name: 'Justificativa da decisão' });
  await waitFor(() => expect(first).toBeEnabled());
  await user.type(first, 'Este rascunho pertence à primeira análise.');
  await user.click(screen.getByRole('button', { name: '2 · Leitura e matriz' }));
  await user.click(await screen.findByRole('button', { name: 'Tratar este achado' }));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Justificativa da decisão' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: /^Decisão 1/ }));
  expect(screen.getByRole('textbox', { name: 'Justificativa da decisão' })).toHaveValue(
    'Este rascunho pertence à primeira análise.',
  );
  expect(findingService.getLiteraryFindingContext).toHaveBeenCalledTimes(2);
  expect(findingService.saveLiteraryFindingDecision).not.toHaveBeenCalled();
  await waitFor(() => expect(work).toHaveBeenLastCalledWith({ dirty: true, pending: false }));
});
it('loads explicit act scope and preserves author instructions without starting execution', async () => {
  vi.mocked(booksApi.listActs).mockResolvedValue([
    { id: 'act', name: 'Ato das cartas', order: 1, createdAt: 1, updatedAt: 1 },
  ]);
  render(<LiteraryIntegrationPanel bookId="book" />);
  await userEvent.click(screen.getByRole('combobox', { name: 'Escopo da integração' }));
  await userEvent.click(screen.getByRole('option', { name: 'Um ato' }));
  await userEvent.click(screen.getByRole('button', { name: 'Consultar atos disponíveis' }));
  await userEvent.click(await screen.findByRole('combobox', { name: 'Ato para integrar' }));
  await userEvent.click(screen.getByRole('option', { name: 'Ato das cartas' }));
  fireEvent.change(screen.getByLabelText('Orientação para a integração'), {
    target: { value: 'Conferir a carta' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Descartar orientação de integração' }));
  expect(screen.getByLabelText('Orientação para a integração')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Orientação para a integração'), {
    target: { value: 'Preservar as reservas' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Registrar integração' }));
  await waitFor(() => expect(startLiteraryIntegration).toHaveBeenCalledOnce());
  expect(vi.mocked(startLiteraryIntegration).mock.calls[0]![0]).toMatchObject({
    level: 'act',
    actId: 'act',
    instruction: 'Preservar as reservas',
  });
  expect(advanceLiteraryIntegration).not.toHaveBeenCalled();
});

it('paginates checkpoints, reauthorizes the chosen job and prepares a successor without registering it', async () => {
  vi.mocked(integrationService.listLiteraryIntegrations)
    .mockResolvedValueOnce({ items: [state('reading')], nextAfterId: 'cursor' })
    .mockResolvedValueOnce({
      items: [{ ...state('done'), jobId: 'second-integration' }],
      nextAfterId: null,
    });
  vi.mocked(integrationService.getLiteraryIntegration).mockResolvedValue({
    ...state('done'),
    jobId: 'second-integration',
  });
  vi.mocked(integrationService.getLiteraryIntegrationSetup).mockResolvedValue({
    level: 'book',
    actId: null,
    instruction: 'Orientação preservada',
    generation: {
      version: 1,
      provider: 'platform',
      model: 'gemini-2.5-flash',
      reasoning: 'medium',
    },
  });
  render(<LiteraryIntegrationPanel bookId="book" />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar integrações' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Mais integrações' }));
  await userEvent.click(
    await screen.findByRole('button', { name: /Livro.*Cobertura integrada concluída/ }),
  );
  await screen.findByRole('region', { name: 'Checkpoint da integração' });
  expect(integrationService.getLiteraryIntegration).toHaveBeenCalledWith(
    'book',
    'second-integration',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Consultar checkpoint da integração' }));
  await waitFor(() => expect(integrationService.getLiteraryIntegration).toHaveBeenCalledTimes(2));
  await userEvent.click(
    screen.getByRole('button', { name: 'Preparar integração sucessora com estas orientações' }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Orientação para a integração')).toHaveValue(
      'Orientação preservada',
    ),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Usar configuração atual de IA' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Descartar preparação da integração sucessora' }),
  );
  expect(screen.getByLabelText('Orientação para a integração')).toHaveValue('');
  expect(startLiteraryIntegration).not.toHaveBeenCalled();
  expect(acceptLiteraryIntegration).not.toHaveBeenCalled();
});

it('keeps an uncertain registration frozen until explicit retry or cancellation', async () => {
  vi.mocked(startLiteraryIntegration).mockRejectedValueOnce(new Error('Resultado incerto'));
  vi.mocked(integrationService.cancelPendingLiteraryIntegration).mockResolvedValue(
    state('canceled'),
  );
  render(<LiteraryIntegrationPanel bookId="book" />);
  await userEvent.click(screen.getByRole('button', { name: 'Registrar integração' }));
  await screen.findByText('Resultado incerto');
  expect(screen.getByLabelText('Orientação para a integração')).toBeDisabled();
  const original = vi.mocked(startLiteraryIntegration).mock.calls[0]![0];
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar registro pendente' }));
  await screen.findByText('Integração cancelada');
  expect(integrationService.cancelPendingLiteraryIntegration).toHaveBeenCalledWith(
    original,
    'author',
  );
  expect(startLiteraryIntegration).toHaveBeenCalledOnce();
});

it('queries and paginates author decisions and never infers acceptance from an empty page', async () => {
  vi.mocked(startLiteraryIntegration).mockResolvedValue(state('done'));
  vi.mocked(findingService.listLiteraryFindingDecisions)
    .mockResolvedValueOnce({ items: [], nextAfterId: 'decision-cursor' })
    .mockResolvedValueOnce({ items: [], nextAfterId: null });
  render(<LiteraryIntegrationPanel bookId="book" />);
  await userEvent.click(screen.getByRole('button', { name: 'Registrar integração' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Consultar decisões e correções' }),
  );
  await screen.findByText('Nenhuma decisão registrada');
  await userEvent.click(screen.getByRole('button', { name: 'Mais decisões e correções' }));
  await waitFor(() =>
    expect(findingService.listLiteraryFindingDecisions).toHaveBeenLastCalledWith(
      'book',
      state().jobId,
      'decision-cursor',
    ),
  );
  expect(acceptLiteraryIntegration).not.toHaveBeenCalled();
});

it('retries or cancels only the selected pending analysis while preserving the integration', async () => {
  const attention = { ...state('attention'), pendingRequestId: 'pending-analysis' };
  vi.mocked(startLiteraryIntegration).mockResolvedValue(attention);
  vi.mocked(integrationService.retryLiteraryIntegrationAnalysis).mockResolvedValue(attention);
  vi.mocked(integrationService.cancelPendingLiteraryIntegrationAnalysis).mockResolvedValue(
    state('reading'),
  );
  render(<LiteraryIntegrationPanel bookId="book" />);
  await userEvent.click(screen.getByRole('button', { name: 'Registrar integração' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Preparar nova tentativa da análise' }),
  );
  await waitFor(() =>
    expect(integrationService.retryLiteraryIntegrationAnalysis).toHaveBeenCalledOnce(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar somente análise pendente' }));
  await screen.findByText('Leitura em andamento');
  expect(integrationService.cancelPendingLiteraryIntegrationAnalysis).toHaveBeenCalledWith(
    'book',
    state().jobId,
  );
  expect(cancelLiteraryIntegration).not.toHaveBeenCalled();
});
