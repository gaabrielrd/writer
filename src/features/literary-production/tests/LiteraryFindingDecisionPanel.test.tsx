import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiteraryFindingDecisionPanel } from '../components/LiteraryFindingDecisionPanel';
import * as service from '../services/literaryFindingService';
import {
  listLiteraryIntegrations,
  type LiteraryIntegration,
} from '../services/literaryIntegrationService';
const actor = vi.hoisted(() => ({ uid: 'author' }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: actor.uid } }) }));
vi.mock('../services/literaryFindingService', () => ({
  getLiteraryFindingContext: vi.fn(),
  getLiteraryFindingDecision: vi.fn(),
  saveLiteraryFindingDecision: vi.fn(),
  confirmLiteraryFindingCorrection: vi.fn(),
  listLiteraryFindingDecisionVersions: vi.fn(),
  getLiteraryFindingDecisionVersion: vi.fn(),
  findingRequestRejected: vi.fn(),
}));
vi.mock('../services/literaryIntegrationService', () => ({ listLiteraryIntegrations: vi.fn() }));
vi.mock('../services/literaryPlanningService', () => ({
  listLiteraryPlans: vi.fn(),
  listLiteraryReferences: vi.fn(),
}));
const source = {
  jobId: 'integration-original-0001',
  requestId: 'integration-request-00001',
  index: 0,
};
const destination = { kind: 'chapter' as const, id: 'chapter', scopeId: 'book' };
const targetState = {
  target: destination,
  label: 'A carta',
  identityToken: 'a'.repeat(64),
  versionToken: 'b'.repeat(64),
  contentHash: 'c'.repeat(64),
  revision: 1,
  proofKind: 'text' as const,
};
const decision = (patch: Partial<service.FindingDecision> = {}): service.FindingDecision => ({
  id: 'decision',
  revision: 1,
  source,
  action: 'retain',
  rationale: 'Escolha anterior.',
  target: null,
  baseline: null,
  state: 'retained',
  createdAt: 1,
  updatedAt: 1,
  effectiveRetention: true,
  confirmationCurrent: false,
  originalSourceCurrent: true,
  currentTarget: null,
  correction: null,
  sourceScope: { level: 'book', actId: null },
  ...patch,
});
beforeEach(() => {
  vi.resetAllMocks();
  actor.uid = 'author';
  vi.stubGlobal('crypto', webcrypto);
  vi.mocked(service.getLiteraryFindingContext).mockResolvedValue({
    id: 'decision',
    source,
    options: [{ target: destination, label: 'A carta' }],
  });
  vi.mocked(service.getLiteraryFindingDecision).mockResolvedValue({
    id: 'decision',
    state: 'unrecorded',
  });
  vi.mocked(service.findingRequestRejected).mockReturnValue(false);
});
afterEach(() => vi.unstubAllGlobals());
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string | RegExp,
) {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}
it('records an explicit retain decision without presenting it as an applied correction', async () => {
  const user = userEvent.setup(),
    changed = vi.fn();
  vi.mocked(service.getLiteraryFindingDecision)
    .mockResolvedValueOnce({ id: 'decision', state: 'unrecorded' })
    .mockResolvedValueOnce(decision({ rationale: 'Preservar a ambiguidade.' }));
  vi.mocked(service.saveLiteraryFindingDecision).mockResolvedValue({
    id: 'decision',
    revision: 1,
    updatedAt: 1,
  });
  render(
    <LiteraryFindingDecisionPanel
      bookId="book"
      trackingKey="first"
      source={source}
      onChanged={changed}
    />,
  );
  await screen.findByLabelText('Justificativa da decisão');
  await choose(user, 'Decisão editorial', 'Manter por decisão autoral');
  await user.type(screen.getByLabelText('Justificativa da decisão'), 'Preservar a ambiguidade.');
  await user.click(screen.getByRole('button', { name: 'Salvar decisão do achado' }));
  await screen.findByText(/A decisão de manter está vigente/);
  expect(service.saveLiteraryFindingDecision).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'retain',
      rationale: 'Preservar a ambiguidade.',
      expectedRevision: 0,
      targetResource: null,
    }),
    'author',
  );
  expect(service.confirmLiteraryFindingCorrection).not.toHaveBeenCalled();
  expect(changed).toHaveBeenCalledWith(source.jobId);
});
it('keeps the exact same operation after an uncertain reply and disables closing the unresolved form', async () => {
  const user = userEvent.setup();
  vi.mocked(service.saveLiteraryFindingDecision)
    .mockRejectedValueOnce(new Error('Resposta incerta.'))
    .mockResolvedValueOnce({ id: 'decision', revision: 1, updatedAt: 1 });
  vi.mocked(service.getLiteraryFindingDecision)
    .mockResolvedValueOnce({ id: 'decision', state: 'unrecorded' })
    .mockResolvedValueOnce(
      decision({
        action: 'investigate',
        state: 'investigating',
        rationale: 'Conferir a passagem.',
      }),
    );
  render(
    <LiteraryFindingDecisionPanel
      bookId="book"
      trackingKey="first"
      source={source}
      onClose={vi.fn()}
    />,
  );
  await user.type(await screen.findByLabelText('Justificativa da decisão'), 'Conferir a passagem.');
  await user.click(screen.getByRole('button', { name: 'Salvar decisão do achado' }));
  await screen.findByText('Resposta incerta.');
  expect(screen.getByLabelText('Justificativa da decisão')).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Descartar rascunho e fechar decisão' }),
  ).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Recuperar a mesma decisão' }));
  await waitFor(() => expect(service.saveLiteraryFindingDecision).toHaveBeenCalledTimes(2));
  expect(vi.mocked(service.saveLiteraryFindingDecision).mock.calls[0]?.[0]).toEqual(
    vi.mocked(service.saveLiteraryFindingDecision).mock.calls[1]?.[0],
  );
  await waitFor(() => expect(screen.getByLabelText('Justificativa da decisão')).toBeEnabled());
});
it('shows a later revision for comparison without overwriting the local rationale', async () => {
  const user = userEvent.setup();
  vi.mocked(service.getLiteraryFindingDecision)
    .mockResolvedValueOnce(decision())
    .mockResolvedValueOnce(decision({ revision: 2, rationale: 'Escolha de outra aba.' }));
  render(<LiteraryFindingDecisionPanel bookId="book" trackingKey="saved" decisionId="decision" />);
  const input = await screen.findByLabelText('Justificativa da decisão');
  await user.clear(input);
  await user.type(input, 'Meu rascunho continua aqui.');
  await user.click(screen.getByRole('button', { name: 'Consultar versão atual da decisão' }));
  await screen.findByText('Atual no servidor · revisão 2');
  expect(input).toHaveValue('Meu rascunho continua aqui.');
  await user.click(
    screen.getByRole('button', { name: 'Adotar esta revisão e descartar meu rascunho' }),
  );
  expect(screen.getByLabelText('Justificativa da decisão')).toHaveValue('Escolha de outra aba.');
});
it('confirms a saved correction through a chosen successor without asking for internal version IDs', async () => {
  const user = userEvent.setup(),
    note = 'Conferi a alteração e a continuidade.';
  const planned = decision({
    action: 'correct',
    state: 'planned',
    target: destination,
    baseline: targetState,
    currentTarget: { ...targetState, contentHash: 'd'.repeat(64) },
    originalSourceCurrent: false,
    effectiveRetention: false,
  });
  vi.mocked(service.getLiteraryFindingDecision)
    .mockResolvedValueOnce(planned)
    .mockResolvedValueOnce({
      ...planned,
      revision: 2,
      state: 'correctionConfirmed',
      confirmationCurrent: true,
      correction: {
        successorJobId: 'integration-successor-0001',
        versionId: 'native-version',
        proofKind: 'text',
        note,
        confirmedAt: 2,
      },
    });
  const successor: LiteraryIntegration = {
    jobId: 'integration-successor-0001',
    level: 'book',
    actId: null,
    state: 'done',
    chapters: 1,
    contextChapters: 0,
    units: 1,
    readUnits: 1,
    segments: 1,
    boundaries: 0,
    expectedBoundaries: 0,
    analyses: 2,
    blocking: 0,
    warnings: 0,
    suggestions: 0,
    sourceToken: 'a'.repeat(64),
    pendingRequestId: null,
    finalRequestId: 'final',
    authorAccepted: false,
    createdAt: 1,
    completedAt: 2,
    message: null,
    coverage: {
      scope: 'book',
      wholeAct: false,
      wholeBook: true,
      verifiedUnits: 1,
      verifiedAnalyses: 2,
    },
  };
  vi.mocked(listLiteraryIntegrations).mockResolvedValue({ items: [successor], nextAfterId: null });
  vi.mocked(service.confirmLiteraryFindingCorrection).mockResolvedValue({
    id: 'decision',
    revision: 2,
    updatedAt: 2,
  });
  render(<LiteraryFindingDecisionPanel bookId="book" trackingKey="saved" decisionId="decision" />);
  await user.click(await screen.findByRole('button', { name: 'Consultar integrações sucessoras' }));
  await choose(user, 'Integração que conferiu a alteração', /^Livro/);
  await user.type(screen.getByLabelText('Conferência autoral da alteração'), note);
  await user.click(screen.getByRole('button', { name: 'Preservar e confirmar alteração salva' }));
  await screen.findByText(/Alteração salva e integração sucessora conferidas pelo autor/);
  expect(service.confirmLiteraryFindingCorrection).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'decision',
      expectedRevision: 1,
      successorJobId: successor.jobId,
      note,
    }),
    'author',
  );
  expect(service.saveLiteraryFindingDecision).not.toHaveBeenCalled();
  expect(screen.queryByLabelText(/ID.*versão/)).not.toBeInTheDocument();
});
it('clears private draft RAM when the account changes before consulting the next account', async () => {
  vi.mocked(service.getLiteraryFindingDecision)
    .mockResolvedValueOnce(decision({ rationale: 'Nota privada do autor.' }))
    .mockRejectedValueOnce(new Error('Sem permissão.'));
  const view = render(
    <LiteraryFindingDecisionPanel bookId="book" trackingKey="saved" decisionId="decision" />,
  );
  expect(await screen.findByDisplayValue('Nota privada do autor.')).toBeInTheDocument();
  actor.uid = 'other';
  view.rerender(
    <LiteraryFindingDecisionPanel bookId="book" trackingKey="saved" decisionId="decision" />,
  );
  await screen.findByText('Sem permissão.');
  expect(screen.queryByDisplayValue('Nota privada do autor.')).not.toBeInTheDocument();
});

it('pages through the read architecture of a final synthesis and preserves an unsaved rationale while choosing a scoped milestone', async () => {
  const user = userEvent.setup();
  const architecture = {
    kind: 'architecture' as const,
    id: JSON.stringify(['arcMilestone', 'arc-two', 'same']),
    scopeId: 'book',
  };
  vi.mocked(service.getLiteraryFindingContext)
    .mockResolvedValueOnce({
      id: 'decision',
      source,
      options: [],
      architectureAudit: true,
      nextAfterArchitectureIndex: 9,
    })
    .mockResolvedValueOnce({
      id: 'decision',
      source,
      options: [{ target: architecture, label: 'Marco de arco · Virada · arco arc-two' }],
      architectureAudit: true,
      nextAfterArchitectureIndex: 19,
    })
    .mockResolvedValueOnce({
      id: 'decision',
      source,
      options: [],
      architectureAudit: true,
      nextAfterArchitectureIndex: null,
    });
  vi.mocked(service.saveLiteraryFindingDecision).mockResolvedValue({
    id: 'decision',
    revision: 1,
    updatedAt: 10,
  });
  render(<LiteraryFindingDecisionPanel bookId="book" trackingKey="architecture" source={source} />);
  await user.type(
    await screen.findByLabelText('Justificativa da decisão'),
    'A virada ocorre depois da carta.',
  );
  await choose(user, 'Decisão editorial', 'Planejar correção');
  await user.click(screen.getByText('Consultar outros destinos do livro'));
  await user.click(screen.getByRole('button', { name: 'Mais destinos da arquitetura lida' }));
  expect(service.getLiteraryFindingContext).toHaveBeenLastCalledWith('book', source, 9);
  await choose(
    user,
    'Destino da alteração',
    'Estrutura e planejamento nativo · Marco de arco · Virada · arco arc-two',
  );
  await user.click(screen.getByRole('button', { name: 'Mais destinos da arquitetura lida' }));
  expect(service.getLiteraryFindingContext).toHaveBeenLastCalledWith('book', source, 19);
  expect(screen.getByLabelText('Justificativa da decisão')).toHaveValue(
    'A virada ocorre depois da carta.',
  );
  await user.click(screen.getByRole('button', { name: 'Salvar decisão do achado' }));
  await waitFor(() =>
    expect(service.saveLiteraryFindingDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        targetResource: architecture,
        rationale: 'A virada ocorre depois da carta.',
        action: 'correct',
      }),
      'author',
    ),
  );
  expect(service.confirmLiteraryFindingCorrection).not.toHaveBeenCalled();
});
it('ignores a late architecture page after the authenticated account changes', async () => {
  const user = userEvent.setup();
  let release!: (value: Awaited<ReturnType<typeof service.getLiteraryFindingContext>>) => void;
  vi.mocked(service.getLiteraryFindingContext)
    .mockResolvedValueOnce({
      id: 'decision',
      source,
      options: [],
      architectureAudit: true,
      nextAfterArchitectureIndex: 9,
    })
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    )
    .mockResolvedValue({
      id: 'new-decision',
      source,
      options: [],
      architectureAudit: true,
      nextAfterArchitectureIndex: null,
    });
  const { rerender } = render(
    <LiteraryFindingDecisionPanel bookId="book" trackingKey="architecture" source={source} />,
  );
  await screen.findByLabelText('Justificativa da decisão');
  await user.click(screen.getByText('Consultar outros destinos do livro'));
  await user.click(screen.getByRole('button', { name: 'Mais destinos da arquitetura lida' }));
  actor.uid = 'another';
  rerender(
    <LiteraryFindingDecisionPanel bookId="book" trackingKey="architecture" source={source} />,
  );
  release({
    id: 'decision',
    source,
    options: [
      {
        target: { kind: 'architecture', id: 'old-source', scopeId: 'book' },
        label: 'Old private milestone',
      },
    ],
    architectureAudit: true,
    nextAfterArchitectureIndex: null,
  });
  await screen.findByLabelText('Justificativa da decisão');
  await user.click(screen.getByRole('combobox', { name: 'Destino da alteração' }));
  expect(screen.queryByRole('option', { name: /Old private milestone/ })).not.toBeInTheDocument();
});
