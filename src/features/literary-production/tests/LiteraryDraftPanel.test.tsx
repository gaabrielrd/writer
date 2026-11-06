import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiteraryDraftPanel } from '../components/LiteraryDraftPanel';
import * as draftApi from '../services/literaryDraftService';
import {
  getLiteraryDraft,
  startLiteraryDraft,
  cancelLiteraryDraft,
  setLiteraryDraftExecution,
  advanceLiteraryDraft,
  acceptLiteraryDraftScene,
  type LiteraryDraftFrame,
} from '../services/literaryDraftService';
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'author' } }) }));
vi.mock('../services/literaryDraftService', () => ({
  startLiteraryDraft: vi.fn(),
  setLiteraryDraftExecution: vi.fn(),
  getLiteraryDraft: vi.fn(),
  advanceLiteraryDraft: vi.fn(),
  cancelLiteraryDraft: vi.fn(),
  cancelPendingLiteraryDraft: vi.fn(),
  acceptLiteraryDraftScene: vi.fn(),
  adoptLiteraryDraftScene: vi.fn(),
  regenerateLiteraryDraftScene: vi.fn(),
  restartLiteraryDraftPreservation: vi.fn(),
  listLiteraryDrafts: vi.fn(),
}));
const frame = (state: LiteraryDraftFrame['job']['state'] = 'planning'): LiteraryDraftFrame => ({
  job: {
    jobId: 'draft-operation-0010',
    chapterId: 'chapter',
    state,
    units: 1,
    accepted: 0,
    drafted: 0,
    adopted: 0,
    pendingRequestId: state === 'awaitingAcceptance' ? 'prose-operation-0010' : null,
    milestoneJobId: null,
    createdAt: 1,
    completedAt: null,
    note: 'Primeira versão não é revisão.',
  },
  unit: { index: 0, sceneId: 'scene' },
  ...(state === 'awaitingAcceptance'
    ? {
        proposal: {
          requestId: 'prose-operation-0010',
          state: 'done',
          current: true,
          sceneId: 'scene',
          sceneTitle: 'A carta',
          sourceRevision: 2,
          applicable: true,
          applyCost: 1,
          result: {
            text: 'Ela abriu a carta.',
            complete: true,
            rationale: 'Uma decisão tem consequência.',
            findings: [],
          },
        } as const,
      }
    : {}),
});
const application = {
  requestId: 'prose-operation-0010',
  operationId: 'apply-operation-0010',
  fingerprint: 'a'.repeat(64),
  sceneId: 'scene',
  chapterId: 'chapter',
  revision: 3,
  contentHash: 'b'.repeat(64),
  chargedCredits: 1,
  credits: 9,
  previousVersionId: 'history-operation-0010',
  appliedAt: 3,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(startLiteraryDraft).mockResolvedValue(frame());
  vi.mocked(advanceLiteraryDraft).mockResolvedValue(frame('awaitingAcceptance'));
});
it('recording a draft never generates or applies until each separate action is requested', async () => {
  const user = userEvent.setup();
  render(<LiteraryDraftPanel bookId="book" chapterId="chapter" collaborationMode="continuous" />);
  await user.click(screen.getByRole('button', { name: 'Registrar redação do capítulo' }));
  await screen.findByText('Identificando cenas');
  expect(advanceLiteraryDraft).not.toHaveBeenCalled();
  expect(acceptLiteraryDraftScene).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Retomar até a próxima decisão' }));
  await screen.findByText('Ela abriu a carta.');
  expect(acceptLiteraryDraftScene).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Revisar aceite desta cena · 1 crédito' }));
  expect(acceptLiteraryDraftScene).not.toHaveBeenCalled();
});
it('uncertain acceptance keeps the same operation and scene revision for recovery', async () => {
  const user = userEvent.setup();
  vi.mocked(acceptLiteraryDraftScene)
    .mockRejectedValueOnce(new Error('Resposta incerta'))
    .mockResolvedValueOnce({ frame: frame('writing'), application });
  render(<LiteraryDraftPanel bookId="book" chapterId="chapter" collaborationMode="continuous" />);
  await user.click(screen.getByRole('button', { name: 'Registrar redação do capítulo' }));
  await user.click(await screen.findByRole('button', { name: 'Retomar até a próxima decisão' }));
  await user.click(
    await screen.findByRole('button', { name: 'Revisar aceite desta cena · 1 crédito' }),
  );
  await user.click(screen.getByRole('button', { name: 'Salvar esta cena · 1 crédito' }));
  await user.click(await screen.findByRole('button', { name: 'Recuperar o mesmo aceite de cena' }));
  await waitFor(() => expect(acceptLiteraryDraftScene).toHaveBeenCalledTimes(2));
  const [first, second] = vi.mocked(acceptLiteraryDraftScene).mock.calls;
  if (!first) throw new Error('Aceite não registrado.');
  expect(first).toEqual(second);
  expect(first[0].expectedRevision).toBe(2);
  expect(first[1]).toBe('author');
});

it('continuous execution freezes the total limits in registration and stops when the server budget is reached', async () => {
  const user = userEvent.setup();
  const initial = frame();
  initial.job.execution = { version: 1, mode: 'continuous', maxApplications: 1, maxCredits: 1 };
  initial.job.controlRevision = 0;
  const stopped = frame('writing');
  stopped.job = {
    ...initial.job,
    state: 'writing',
    units: 2,
    accepted: 1,
    drafted: 1,
    chargedCredits: 1,
    executionStop: 'budget',
  };
  vi.mocked(startLiteraryDraft).mockResolvedValue(initial);
  vi.mocked(advanceLiteraryDraft).mockResolvedValue(stopped);
  render(<LiteraryDraftPanel bookId="book" chapterId="chapter" collaborationMode="continuous" />);
  await user.click(screen.getByRole('combobox', { name: 'Execução da primeira versão' }));
  await user.click(screen.getByRole('option', { name: 'Contínuo com limites' }));
  await user.clear(screen.getByLabelText('Limite total de aplicações'));
  await user.type(screen.getByLabelText('Limite total de aplicações'), '1');
  await user.clear(screen.getByLabelText('Limite total de créditos'));
  await user.type(screen.getByLabelText('Limite total de créditos'), '1');
  await user.click(screen.getByRole('button', { name: 'Autorizar redação contínua do capítulo' }));
  await screen.findByText('Identificando cenas');
  expect(startLiteraryDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      execution: { version: 1, mode: 'continuous', maxApplications: 1, maxCredits: 1 },
    }),
    'author',
  );
  await user.click(screen.getByRole('button', { name: 'Retomar até a próxima decisão' }));
  await screen.findByText(/Limite autorizado atingido/);
  expect(advanceLiteraryDraft).toHaveBeenCalledTimes(1);
  expect(acceptLiteraryDraftScene).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Retomar até a próxima decisão' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Contínuo: 1 de 1 aplicações · 1 de 1 créditos.')).toBeInTheDocument();
});
it('recovers the same uncertain server pause without allowing a late advance response to replace the control checkpoint', async () => {
  const user = userEvent.setup();
  let release!: (value: LiteraryDraftFrame) => void;
  const initial = frame('writing');
  initial.job.execution = { version: 1, mode: 'continuous', maxApplications: 2, maxCredits: 2 };
  initial.job.controlRevision = 0;
  const paused = structuredClone(initial);
  paused.job.paused = true;
  paused.job.controlRevision = 1;
  vi.mocked(startLiteraryDraft).mockResolvedValue(initial);
  vi.mocked(advanceLiteraryDraft).mockImplementation(
    () =>
      new Promise((done) => {
        release = done;
      }),
  );
  vi.mocked(setLiteraryDraftExecution)
    .mockRejectedValueOnce(new Error('Resposta incerta.'))
    .mockResolvedValue(paused);
  render(<LiteraryDraftPanel bookId="book" chapterId="chapter" collaborationMode="continuous" />);
  await user.click(screen.getByRole('button', { name: 'Registrar redação do capítulo' }));
  await user.click(await screen.findByRole('button', { name: 'Retomar até a próxima decisão' }));
  await user.click(screen.getByRole('button', { name: 'Pausar autorização no servidor' }));
  await screen.findByText('Resposta incerta.');
  const originalCall = vi.mocked(setLiteraryDraftExecution).mock.calls[0];
  if (!originalCall) throw new Error('Pause request missing');
  const original = originalCall[0];
  await user.click(screen.getByRole('button', { name: 'Recuperar a mesma autorização' }));
  await screen.findByText(/Autorização pausada no servidor/);
  expect(vi.mocked(setLiteraryDraftExecution).mock.calls[1]?.[0]).toEqual(original);
  release(frame('done'));
  await waitFor(() =>
    expect(screen.getByText(/Autorização pausada no servidor/)).toBeInTheDocument(),
  );
  expect(screen.queryByText('Primeira versão preservada')).not.toBeInTheDocument();
});

it('an older control response cannot repaint a canceled continuous execution and its uncertain operation remains recoverable', async () => {
  const user = userEvent.setup();
  let release!: (value: LiteraryDraftFrame) => void;
  const initial = frame('writing');
  initial.job.execution = { version: 1, mode: 'continuous', maxApplications: 2, maxCredits: 2 };
  initial.job.controlRevision = 0;
  const canceled = structuredClone(initial);
  canceled.job.state = 'canceled';
  vi.mocked(startLiteraryDraft).mockResolvedValue(initial);
  vi.mocked(cancelLiteraryDraft).mockResolvedValue(canceled);
  vi.mocked(setLiteraryDraftExecution)
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    )
    .mockResolvedValue(canceled);
  render(<LiteraryDraftPanel bookId="book" chapterId="chapter" collaborationMode="continuous" />);
  await user.click(screen.getByRole('button', { name: 'Registrar redação do capítulo' }));
  await user.click(await screen.findByRole('button', { name: 'Pausar autorização no servidor' }));
  await user.click(screen.getByRole('button', { name: 'Cancelar próximas etapas' }));
  await screen.findByText('Redação cancelada');
  release(initial);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Recuperar a mesma autorização' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'Recuperar a mesma autorização' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Recuperar a mesma autorização' }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByText('Redação cancelada')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Retomar até a próxima decisão' }),
  ).not.toBeInTheDocument();
});

it('guidance keeps draft registration unavailable while supervised mode refuses continuous authorization', async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <LiteraryDraftPanel bookId="book" chapterId="chapter" collaborationMode="guidance" />,
  );
  expect(screen.getByRole('button', { name: 'Registrar redação do capítulo' })).toBeDisabled();
  expect(screen.getByText(/Orientação: conduza a escrita/)).toBeInTheDocument();
  rerender(<LiteraryDraftPanel bookId="book" chapterId="chapter" collaborationMode="supervised" />);
  await user.click(screen.getByRole('combobox', { name: 'Execução da primeira versão' }));
  await user.click(screen.getByRole('option', { name: 'Contínuo com limites' }));
  expect(
    screen.getByRole('button', { name: 'Autorizar redação contínua do capítulo' }),
  ).toBeDisabled();
  expect(startLiteraryDraft).not.toHaveBeenCalled();
});

it('a cycle opens its exact existing draft checkpoint without registering or generating another job', async () => {
  vi.mocked(getLiteraryDraft).mockResolvedValue(frame('awaitingAcceptance'));
  render(
    <LiteraryDraftPanel bookId="book" chapterId="chapter" initialJobId="draft-operation-0010" />,
  );
  await screen.findByText('Ela abriu a carta.');
  expect(getLiteraryDraft).toHaveBeenCalledWith('book', 'draft-operation-0010');
  expect(startLiteraryDraft).not.toHaveBeenCalled();
  expect(advanceLiteraryDraft).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Registrar redação do capítulo' }),
  ).not.toBeInTheDocument();
});

it('a sequence-managed draft keeps explicit scene acceptance but hides independent production and authorization', async () => {
  vi.mocked(getLiteraryDraft).mockResolvedValue(frame('awaitingAcceptance'));
  render(
    <LiteraryDraftPanel
      bookId="book"
      chapterId="chapter"
      initialJobId="draft-operation-0010"
      coordinated
    />,
  );
  await screen.findByText('Ela abriu a carta.');
  expect(
    screen.getByRole('button', { name: 'Revisar aceite desta cena · 1 crédito' }),
  ).toBeInTheDocument();
  for (const name of [
    'Retomar até a próxima decisão',
    'Consultar redações do capítulo',
    'Gerar outra proposta para esta cena',
    'Autorizar estes limites e modo',
    'Cancelar próximas etapas',
  ])
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Execução da primeira versão')).not.toBeInTheDocument();
  expect(advanceLiteraryDraft).not.toHaveBeenCalled();
});

it('an older coordinator frame cannot roll back scene acceptance already confirmed by a native checkpoint', async () => {
  const user = userEvent.setup(),
    old = frame('awaitingAcceptance');
  const current = { ...frame('done'), job: { ...frame('done').job, accepted: 1, drafted: 1 } };
  vi.mocked(getLiteraryDraft).mockResolvedValue(current);
  const view = render(
    <LiteraryDraftPanel
      bookId="book"
      chapterId="chapter"
      initialJobId="draft-operation-0010"
      coordinated
      coordinatedFrame={old}
    />,
  );
  await screen.findByText('Ela abriu a carta.');
  await user.click(screen.getByRole('button', { name: 'Consultar checkpoint da redação' }));
  await screen.findByText(/1 de 1 cenas aceitas/);
  view.rerender(
    <LiteraryDraftPanel
      bookId="book"
      chapterId="chapter"
      initialJobId="draft-operation-0010"
      coordinated
      coordinatedFrame={structuredClone(old)}
    />,
  );
  await waitFor(() => expect(screen.getByText(/1 de 1 cenas aceitas/)).toBeInTheDocument());
  expect(
    screen.queryByRole('button', { name: 'Revisar aceite desta cena · 1 crédito' }),
  ).not.toBeInTheDocument();
});
it('paginates saved drafts and opens the current checkpoint without generating prose', async () => {
  vi.mocked(draftApi.listLiteraryDrafts)
    .mockResolvedValueOnce({ items: [frame().job], nextAfterId: 'cursor' })
    .mockResolvedValueOnce({
      items: [{ ...frame('done').job, jobId: 'second' }],
      nextAfterId: null,
    });
  vi.mocked(getLiteraryDraft).mockResolvedValue(frame('done'));
  render(<LiteraryDraftPanel bookId="book" chapterId="chapter" collaborationMode="continuous" />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar redações do capítulo' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Mais redações' }));
  await userEvent.click(
    await screen.findByRole('button', { name: /· Primeira versão preservada/ }),
  );
  await screen.findByRole('button', { name: 'Consultar checkpoint da redação' });
  expect(getLiteraryDraft).toHaveBeenCalledWith('book', 'second');
  expect(startLiteraryDraft).not.toHaveBeenCalled();
  expect(advanceLiteraryDraft).not.toHaveBeenCalled();
});
it('preserves existing scene prose through explicit adoption and retries an uncertain adoption unchanged', async () => {
  const existing: LiteraryDraftFrame = {
    ...frame('existingText'),
    existing: {
      sceneId: 'scene',
      title: 'Texto do autor',
      content: '<p>Prosa que já existe.</p>',
      sourceToken: 'a'.repeat(64),
    },
  };
  vi.mocked(startLiteraryDraft).mockResolvedValue(existing);
  vi.mocked(draftApi.adoptLiteraryDraftScene)
    .mockRejectedValueOnce(new Error('Aceite incerto'))
    .mockResolvedValueOnce(frame('writing'));
  render(<LiteraryDraftPanel bookId="book" chapterId="chapter" collaborationMode="continuous" />);
  await userEvent.click(screen.getByRole('button', { name: 'Registrar redação do capítulo' }));
  await screen.findByText('Prosa que já existe.');
  await userEvent.click(screen.getByRole('button', { name: 'Preservar este texto e avançar' }));
  await screen.findByText('Aceite incerto');
  await userEvent.click(screen.getByRole('button', { name: 'Recuperar a mesma adoção' }));
  await waitFor(() => expect(draftApi.adoptLiteraryDraftScene).toHaveBeenCalledTimes(2));
  expect(vi.mocked(draftApi.adoptLiteraryDraftScene).mock.calls[0]).toEqual(
    vi.mocked(draftApi.adoptLiteraryDraftScene).mock.calls[1],
  );
  expect(acceptLiteraryDraftScene).not.toHaveBeenCalled();
});
it('regenerates only by request and starts a separate preservation attempt after all scenes are accepted', async () => {
  vi.mocked(startLiteraryDraft).mockResolvedValue(frame('awaitingAcceptance'));
  vi.mocked(draftApi.regenerateLiteraryDraftScene).mockResolvedValue({
    ...frame('attention'),
    job: { ...frame('attention').job, accepted: 1 },
  });
  vi.mocked(draftApi.restartLiteraryDraftPreservation).mockResolvedValue(frame('preserving'));
  render(<LiteraryDraftPanel bookId="book" chapterId="chapter" collaborationMode="continuous" />);
  fireEvent.change(screen.getByLabelText('Orientação para a redação do capítulo'), {
    target: { value: 'Conferir voz' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Descartar orientação de redação' }));
  await userEvent.click(screen.getByRole('button', { name: 'Registrar redação do capítulo' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Gerar outra proposta para esta cena' }),
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Preparar nova tentativa de preservação' }),
  );
  await waitFor(() =>
    expect(draftApi.restartLiteraryDraftPreservation).toHaveBeenCalledWith(
      'book',
      frame().job.jobId,
    ),
  );
  expect(acceptLiteraryDraftScene).not.toHaveBeenCalled();
});
