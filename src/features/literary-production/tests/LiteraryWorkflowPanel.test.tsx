import { listLiteraryIntegrations } from '../services/literaryIntegrationService';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { LiteraryWorkflowPanel } from '../components/LiteraryWorkflowPanel';
import { editorialFields, type EditorialContract } from '../model/editorial';
import {
  getLiteraryWorkflow,
  listLiteraryWorkflows,
  getLiteraryWorkflowScope,
  startLiteraryWorkflow,
  advanceLiteraryWorkflow,
  setLiteraryWorkflowControl,
  type WorkflowFrame,
} from '../services/literaryWorkflowService';
vi.mock('../services/literaryIntegrationService', () => ({ listLiteraryIntegrations: vi.fn() }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'author' } }) }));
vi.mock('../components/LiteraryDraftPanel', () => ({ LiteraryDraftPanel: () => null }));
vi.mock('../components/LiteraryReviewPanel', () => ({ LiteraryReviewPanel: () => null }));
vi.mock('../services/literaryWorkflowService', () => ({
  getLiteraryWorkflowScope: vi.fn(),
  startLiteraryWorkflow: vi.fn(),
  getLiteraryWorkflow: vi.fn(),
  advanceLiteraryWorkflow: vi.fn(),
  setLiteraryWorkflowControl: vi.fn(),
  listLiteraryWorkflows: vi.fn(),
}));
const frame = (
  phase: WorkflowFrame['job']['phase'] = 'preparation',
  stop: string | null = null,
): WorkflowFrame => ({
  job: {
    jobId: 'workflow-cycle-0001',
    originToken: 'f'.repeat(64),
    bookTitle: 'Livro',
    chapterTitle: 'Capítulo',
    registrationState: 'active',
    chapterId: 'chapter',
    revision: 1,
    phase,
    stop,
    paused: false,
    steps: 0,
    limits: { maxApplications: 2, maxCredits: 2, maxSteps: 200 },
    authorizedPhases: [],
    collaboration: { version: 1, mode: 'supervised', revision: 1, configured: true },
    draftId: 'workflow-draft-0001',
    reviewId: 'workflow-review-0001',
    manualMilestoneId: 'workflow-manual-0001',
    firstVersionId: null,
    priorApplications: 0,
    priorCredits: 0,
    createdAt: 1,
    completedAt: null,
    busyStep: null,
    errorCode: null,
    gate: { revision: 1, stateToken: 'a'.repeat(64) },
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getLiteraryWorkflowScope).mockResolvedValue({
    originToken: 'e'.repeat(64),
    chapterId: 'chapter',
    bookTitle: 'Livro',
    chapterTitle: 'Capítulo',
    collaboration: { version: 1, mode: 'supervised', revision: 1, configured: true },
  });
  vi.mocked(startLiteraryWorkflow).mockResolvedValue(frame());
  vi.mocked(advanceLiteraryWorkflow).mockResolvedValue({
    ...frame('firstVersion', 'firstVersionAuthorization'),
    job: { ...frame('firstVersion', 'firstVersionAuthorization').job, revision: 2 },
  });
});
it('registration does not execute; the next phase requires its own explicit decision and current preparation token', async () => {
  const user = userEvent.setup();
  vi.mocked(setLiteraryWorkflowControl).mockResolvedValue({
    ...frame('firstVersion'),
    job: { ...frame('firstVersion').job, revision: 3 },
  });
  render(
    <StrictMode>
      <LiteraryWorkflowPanel bookId="book" chapterId="chapter" />
    </StrictMode>,
  );
  await user.click(screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }));
  await screen.findByText('Preparação e gate');
  expect(advanceLiteraryWorkflow).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Retomar ciclo até a próxima decisão' }));
  await screen.findByRole('button', { name: 'Autorizar primeira versão deste ciclo' });
  expect(setLiteraryWorkflowControl).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Autorizar primeira versão deste ciclo' }));
  await waitFor(() => expect(setLiteraryWorkflowControl).toHaveBeenCalledTimes(1));
  expect(vi.mocked(setLiteraryWorkflowControl).mock.calls[0]?.[0]).toMatchObject({
    action: 'startFirstVersion',
    expectedRevision: 2,
    expectedGateToken: 'a'.repeat(64),
  });
});
it('continuous registration freezes selected phases, chapter and all budgets without starting the server loop', async () => {
  const user = userEvent.setup();
  render(
    <LiteraryWorkflowPanel bookId="book" chapterId="chapter" collaborationMode="continuous" />,
  );
  await user.click(screen.getByRole('combobox', { name: 'Passagem: Primeira versão' }));
  await user.click(screen.getByRole('option', { name: 'Autorizar passagem contínua' }));
  await user.clear(screen.getByLabelText('Limite total de aplicações do ciclo'));
  await user.type(screen.getByLabelText('Limite total de aplicações do ciclo'), '7');
  await user.click(screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }));
  await waitFor(() => expect(startLiteraryWorkflow).toHaveBeenCalledTimes(1));
  expect(vi.mocked(startLiteraryWorkflow).mock.calls[0]?.[0]).toMatchObject({
    chapterId: 'chapter',
    authorizedPhases: ['firstVersion'],
    limits: { maxApplications: 7, maxCredits: 2, maxSteps: 200 },
  });
  expect(advanceLiteraryWorkflow).not.toHaveBeenCalled();
});
it('pausing while a step waits ignores its late response and keeps the server pause authoritative', async () => {
  const user = userEvent.setup();
  let release: ((f: WorkflowFrame) => void) | undefined;
  vi.mocked(advanceLiteraryWorkflow).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const paused = frame('firstVersion');
  paused.job.paused = true;
  paused.job.revision = 2;
  vi.mocked(setLiteraryWorkflowControl).mockResolvedValue(paused);
  render(<LiteraryWorkflowPanel bookId="book" chapterId="chapter" />);
  await user.click(screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }));
  await screen.findByText('Preparação e gate');
  await user.click(screen.getByRole('button', { name: 'Retomar ciclo até a próxima decisão' }));
  await waitFor(() => expect(advanceLiteraryWorkflow).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole('button', { name: 'Pausar ciclo no servidor' }));
  await screen.findByText(/Ciclo pausado no servidor/);
  release?.({ ...frame('done'), job: { ...frame('done').job, revision: 3 } });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Retomar ciclo até a próxima decisão' }),
    ).toBeDisabled(),
  );
  expect(screen.queryByText('Ciclo do capítulo concluído')).not.toBeInTheDocument();
});
it('a lost step acknowledgement repeats exactly the same operation instead of beginning another step', async () => {
  const user = userEvent.setup();
  vi.mocked(advanceLiteraryWorkflow)
    .mockRejectedValueOnce(new Error('Resposta perdida'))
    .mockResolvedValueOnce(frame('firstVersion', 'firstVersionAuthorization'));
  render(<LiteraryWorkflowPanel bookId="book" chapterId="chapter" />);
  await user.click(screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }));
  await screen.findByText('Preparação e gate');
  await user.click(screen.getByRole('button', { name: 'Retomar ciclo até a próxima decisão' }));
  await user.click(await screen.findByRole('button', { name: 'Recuperar o mesmo passo' }));
  await waitFor(() => expect(advanceLiteraryWorkflow).toHaveBeenCalledTimes(2));
  expect(vi.mocked(advanceLiteraryWorkflow).mock.calls[0]?.[0]).toEqual(
    vi.mocked(advanceLiteraryWorkflow).mock.calls[1]?.[0],
  );
});

it('cancel remains available while a pause response waits and its late response cannot replace the canceled checkpoint', async () => {
  const user = userEvent.setup();
  let release: ((f: WorkflowFrame) => void) | undefined;
  const paused = frame('firstVersion');
  paused.job.paused = true;
  paused.job.revision = 2;
  const canceled = frame('canceled');
  canceled.job.paused = true;
  canceled.job.revision = 3;
  vi.mocked(getLiteraryWorkflow).mockResolvedValue(paused);
  vi.mocked(setLiteraryWorkflowControl)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValueOnce(canceled);
  render(<LiteraryWorkflowPanel bookId="book" chapterId="chapter" />);
  await user.click(screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }));
  await screen.findByText('Preparação e gate');
  await user.click(screen.getByRole('button', { name: 'Pausar ciclo no servidor' }));
  expect(screen.getByRole('button', { name: 'Cancelar ciclo' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Cancelar ciclo' }));
  await screen.findByText('Ciclo cancelado', { exact: true });
  expect(vi.mocked(setLiteraryWorkflowControl).mock.calls[1]?.[0]).toMatchObject({
    action: 'cancel',
    expectedRevision: 2,
  });
  release?.(paused);
  await waitFor(() =>
    expect(screen.getByText('Ciclo cancelado', { exact: true })).toBeInTheDocument(),
  );
  expect(screen.queryByText(/Ciclo pausado no servidor/)).not.toBeInTheDocument();
});

it('an interrupted registration shows its original scope and needs an explicit final confirmation without producing work', async () => {
  const user = userEvent.setup(),
    pending = frame();
  pending.job.registrationState = 'registering';
  pending.job.stop = 'registration';
  vi.mocked(startLiteraryWorkflow).mockResolvedValue(pending);
  vi.mocked(setLiteraryWorkflowControl).mockResolvedValue({
    ...frame(),
    job: { ...frame().job, revision: 2 },
  });
  render(<LiteraryWorkflowPanel bookId="book" chapterId="chapter" />);
  await user.click(screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }));
  await screen.findByRole('button', { name: 'Conferir e finalizar registro do ciclo' });
  expect(screen.getByLabelText('Limite total de aplicações do ciclo')).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Retomar ciclo até a próxima decisão' }),
  ).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Conferir e finalizar registro do ciclo' }));
  await waitFor(() => expect(setLiteraryWorkflowControl).toHaveBeenCalledTimes(1));
  expect(vi.mocked(setLiteraryWorkflowControl).mock.calls[0]?.[0]).toMatchObject({
    action: 'confirmRegistration',
    expectedOriginToken: 'f'.repeat(64),
    expectedRevision: 1,
  });
  expect(advanceLiteraryWorkflow).not.toHaveBeenCalled();
});
it('a late scope preview from another book cannot send the old registration', async () => {
  const user = userEvent.setup();
  let release: ((source: Awaited<ReturnType<typeof getLiteraryWorkflowScope>>) => void) | undefined;
  vi.mocked(getLiteraryWorkflowScope).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const view = render(<LiteraryWorkflowPanel bookId="book" chapterId="chapter" />);
  await user.click(screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }));
  view.rerender(<LiteraryWorkflowPanel bookId="other-book" chapterId="other-chapter" />);
  release?.({
    originToken: 'e'.repeat(64),
    chapterId: 'chapter',
    bookTitle: 'Livro anterior',
    chapterTitle: 'Capítulo anterior',
    collaboration: { version: 1, mode: 'supervised', revision: 1, configured: true },
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }),
    ).toBeEnabled(),
  );
  expect(startLiteraryWorkflow).not.toHaveBeenCalled();
});

it('a server-registered step remains recoverable after local in-memory state is gone', async () => {
  const user = userEvent.setup(),
    pending = frame('firstVersion');
  pending.job.revision = 7;
  pending.job.busyStep = 'workflow-server-pending-0001';
  vi.mocked(startLiteraryWorkflow).mockResolvedValue(pending);
  vi.mocked(advanceLiteraryWorkflow).mockResolvedValue({
    ...frame('firstVersion', 'firstVersionAuthorization'),
    job: { ...frame('firstVersion', 'firstVersionAuthorization').job, revision: 8 },
  });
  render(<LiteraryWorkflowPanel bookId="book" chapterId="chapter" />);
  await user.click(screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }));
  await user.click(
    await screen.findByRole('button', { name: 'Recuperar passo registrado no servidor' }),
  );
  await waitFor(() => expect(advanceLiteraryWorkflow).toHaveBeenCalledTimes(1));
  expect(vi.mocked(advanceLiteraryWorkflow).mock.calls[0]?.[0]).toEqual({
    target: { kind: 'book', id: 'book' },
    jobId: pending.job.jobId,
    operationId: 'workflow-server-pending-0001',
    expectedRevision: 7,
    expectedOriginToken: 'f'.repeat(64),
  });
});

const priorCycle = (actId: string | null = null) => ({
  jobId: 'workflow-prior-0001',
  chapterId: 'prior-chapter',
  chapterTitle: 'O preço da carta',
  actId,
  phase: 'done' as const,
  stop: null,
  paused: false,
  revision: 30,
  createdAt: 100,
  completedAt: 200,
});
async function choosePrior(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('combobox', { name: 'Entrada neste capítulo' }));
  await user.click(screen.getByRole('option', { name: 'Continuar após um capítulo revisado' }));
  await user.click(screen.getByRole('button', { name: 'Consultar ciclos anteriores' }));
}
it('a paginated prior-cycle selection is frozen in the pending registration and its recovery never recaptures scope', async () => {
  const user = userEvent.setup();
  vi.mocked(listLiteraryWorkflows)
    .mockResolvedValueOnce({ items: [], nextAfterId: 'page-two' })
    .mockResolvedValueOnce({ items: [priorCycle()], nextAfterId: null });
  vi.mocked(startLiteraryWorkflow)
    .mockRejectedValueOnce(new Error('Resposta perdida'))
    .mockResolvedValueOnce(frame());
  render(<LiteraryWorkflowPanel bookId="book" chapterId="chapter" />);
  await choosePrior(user);
  expect(
    screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }),
  ).toBeDisabled();
  await user.click(await screen.findByRole('button', { name: 'Mais ciclos anteriores' }));
  expect(vi.mocked(listLiteraryWorkflows).mock.calls).toEqual([
    ['book', null, null],
    ['book', null, 'page-two'],
  ]);
  await user.click(await screen.findByRole('combobox', { name: 'Ciclo anterior revisado' }));
  await user.click(screen.getByRole('option', { name: /O preço da carta/ }));
  await user.click(screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }));
  await screen.findByText('Registro sem confirmação. Preserve a mesma operação.');
  const original = structuredClone(vi.mocked(startLiteraryWorkflow).mock.calls[0]?.[0]);
  expect(original).toMatchObject({
    passage: { previousWorkflowId: 'workflow-prior-0001', actIntegrationId: null },
  });
  expect(vi.mocked(getLiteraryWorkflowScope).mock.calls.at(-1)).toEqual([
    'book',
    'chapter',
    { previousWorkflowId: 'workflow-prior-0001', actIntegrationId: null },
  ]);
  expect(screen.getByRole('combobox', { name: 'Ciclo anterior revisado' })).toBeDisabled();
  const previews = vi.mocked(getLiteraryWorkflowScope).mock.calls.length;
  await user.click(screen.getByRole('button', { name: 'Recuperar registro do ciclo' }));
  await screen.findByText('Preparação e gate');
  expect(vi.mocked(startLiteraryWorkflow).mock.calls[1]?.[0]).toEqual(original);
  expect(getLiteraryWorkflowScope).toHaveBeenCalledTimes(previews);
  expect(advanceLiteraryWorkflow).not.toHaveBeenCalled();
});
it('leaving an act requires an explicitly selected accepted report, with pagination and current labels', async () => {
  const user = userEvent.setup();
  vi.mocked(getLiteraryWorkflowScope).mockResolvedValue({
    originToken: 'e'.repeat(64),
    actId: 'second-act',
    chapterId: 'chapter',
    bookTitle: 'Livro',
    chapterTitle: 'Capítulo',
    collaboration: frame().job.collaboration,
  });
  vi.mocked(listLiteraryWorkflows).mockResolvedValue({
    items: [priorCycle('first-act')],
    nextAfterId: null,
  });
  vi.mocked(listLiteraryIntegrations)
    .mockResolvedValueOnce({ items: [], nextAfterId: 'reports-two' })
    .mockResolvedValueOnce({
      items: [
        {
          jobId: 'integration-prior-0001',
          level: 'act',
          actId: 'first-act',
          state: 'done',
          authorAccepted: true,
          createdAt: 100,
          completedAt: 200,
        },
      ] as Awaited<ReturnType<typeof listLiteraryIntegrations>>['items'],
      nextAfterId: null,
    });
  const started = frame();
  started.job.passage = {
    input: {
      previousWorkflowId: 'workflow-prior-0001',
      actIntegrationId: 'integration-prior-0001',
    },
    condition: 'integratedAct',
    previous: { chapterId: 'prior-chapter', title: 'O preço da carta', actId: 'first-act' },
  };
  started.job.passageEntered = false;
  vi.mocked(startLiteraryWorkflow).mockResolvedValue(started);
  render(<LiteraryWorkflowPanel bookId="book" chapterId="chapter" />);
  await choosePrior(user);
  await user.click(await screen.findByRole('combobox', { name: 'Ciclo anterior revisado' }));
  await user.click(screen.getByRole('option', { name: /O preço da carta/ }));
  expect(
    screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }),
  ).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Consultar integrações do ato anterior' }));
  await user.click(await screen.findByRole('button', { name: 'Mais integrações do ato anterior' }));
  await user.click(
    await screen.findByRole('combobox', { name: 'Integração aceita do ato anterior' }),
  );
  await user.click(screen.getByRole('option', { name: /Integração do ato anterior/ }));
  await user.click(screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }));
  await screen.findByText(/Entrada vinculada ao capítulo O preço da carta/);
  expect(vi.mocked(startLiteraryWorkflow).mock.calls[0]?.[0].passage).toEqual(
    started.job.passage.input,
  );
  expect(vi.mocked(listLiteraryIntegrations).mock.calls).toEqual([
    ['book', null],
    ['book', 'reports-two'],
  ]);
  expect(
    screen.queryByRole('combobox', { name: 'Entrada neste capítulo' }),
  ).not.toBeInTheDocument();
  expect(advanceLiteraryWorkflow).not.toHaveBeenCalled();
});
it('consultation failure is retryable and late options from an old book cannot fill the new selection', async () => {
  const user = userEvent.setup();
  let release: ((v: Awaited<ReturnType<typeof listLiteraryWorkflows>>) => void) | undefined;
  vi.mocked(listLiteraryWorkflows)
    .mockRejectedValueOnce(new Error('Consulta indisponível'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
  const view = render(<LiteraryWorkflowPanel bookId="book" chapterId="chapter" />);
  await choosePrior(user);
  await screen.findByText('Consulta indisponível');
  expect(
    screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }),
  ).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Consultar ciclos anteriores' }));
  view.rerender(<LiteraryWorkflowPanel bookId="new-book" chapterId="new-chapter" />);
  release?.({ items: [priorCycle()], nextAfterId: null });
  await waitFor(() =>
    expect(screen.queryByText('Consultando condições de passagem…')).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByRole('combobox', { name: 'Ciclo anterior revisado' }),
  ).not.toBeInTheDocument();
  expect(startLiteraryWorkflow).not.toHaveBeenCalled();
});
it('switching back to an independent cycle removes previous prerequisites without preserving an old grant', async () => {
  const user = userEvent.setup();
  vi.mocked(listLiteraryWorkflows).mockResolvedValue({ items: [priorCycle()], nextAfterId: null });
  render(<LiteraryWorkflowPanel bookId="book" chapterId="chapter" />);
  await choosePrior(user);
  await user.click(await screen.findByRole('combobox', { name: 'Ciclo anterior revisado' }));
  await user.click(screen.getByRole('option', { name: /O preço da carta/ }));
  await user.click(screen.getByRole('combobox', { name: 'Entrada neste capítulo' }));
  await user.click(screen.getByRole('option', { name: 'Ciclo independente deste capítulo' }));
  await user.click(screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }));
  await screen.findByText('Preparação e gate');
  expect(vi.mocked(startLiteraryWorkflow).mock.calls[0]?.[0]).not.toHaveProperty('passage');
});

it('a sequence-managed cycle exposes manual decisions but no independent producer, budget or cycle selection', async () => {
  const user = userEvent.setup(),
    notify = vi.fn();
  vi.mocked(setLiteraryWorkflowControl).mockResolvedValue({
    ...frame('firstVersion'),
    job: { ...frame('firstVersion').job, revision: 2 },
  });
  render(
    <LiteraryWorkflowPanel
      bookId="book"
      chapterId="chapter"
      managedFrame={frame('firstVersion', 'firstVersionAuthorization')}
      onCheckpointChange={notify}
    />,
  );
  expect(
    screen.queryByRole('button', { name: 'Registrar novo ciclo deste capítulo' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Consultar ciclos do capítulo' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retomar ciclo até a próxima decisão' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Limite total de aplicações do ciclo')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Autorizar primeira versão deste ciclo' }));
  await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Autorizar primeira versão deste ciclo' }),
    ).not.toBeInTheDocument(),
  );
  expect(vi.mocked(setLiteraryWorkflowControl).mock.calls[0]?.[0]).toMatchObject({
    action: 'startFirstVersion',
    expectedGateToken: 'a'.repeat(64),
    expectedRevision: 1,
  });
  expect(advanceLiteraryWorkflow).not.toHaveBeenCalled();
});

it('required publication cannot register a new cycle before the inspection is explicitly selected', () => {
  localStorage.clear();
  const contract: EditorialContract = {
    schemaVersion: 1,
    fields: Object.fromEntries(
      Object.keys(editorialFields).map((key) => [key, '']),
    ) as EditorialContract['fields'],
    decisions: [],
    publicationPolicy: { version: 1, unit: 'chapter', requirePreviousPublication: true },
  };
  render(
    <LiteraryWorkflowPanel
      bookId="book"
      chapterId="chapter"
      editorialState={{ revision: 3, updatedAt: 3, contract }}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('region', { name: 'Inspeção de entrada e publicação' }),
  ).toBeInTheDocument();
  expect(startLiteraryWorkflow).not.toHaveBeenCalled();
  expect(getLiteraryWorkflowScope).not.toHaveBeenCalled();
});
