import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiteraryIntegrationPanel } from '../components/LiteraryIntegrationPanel';
import * as integrationService from '../services/literaryIntegrationService';
import * as findingService from '../services/literaryFindingService';
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
