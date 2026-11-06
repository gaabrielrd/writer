import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiteraryReviewPanel } from '../components/LiteraryReviewPanel';
import * as reviewApi from '../services/literaryReviewService';
import { getLiteraryProse } from '../services/literaryProseService';
import {
  getLiteraryReview,
  startLiteraryReview,
  advanceLiteraryReview,
  advanceLiteraryReviewedVersion,
  cancelLiteraryReview,
  acceptLiteraryReview,
  type LiteraryReview,
} from '../services/literaryReviewService';
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'author' } }) }));
vi.mock('../components/WritingSourcePicker', () => ({ WritingSourcePicker: () => null }));
vi.mock('../services/literaryProseService', () => ({ getLiteraryProse: vi.fn() }));
vi.mock('../services/literaryReviewService', () => ({
  startLiteraryReview: vi.fn(),
  getLiteraryReview: vi.fn(),
  advanceLiteraryReview: vi.fn(),
  cancelLiteraryReview: vi.fn(),
  advanceLiteraryReviewedVersion: vi.fn(),
  retryLiteraryReviewAnalysis: vi.fn(),
  cancelPendingLiteraryReview: vi.fn(),
  cancelPendingLiteraryReviewAnalysis: vi.fn(),
  acceptLiteraryReview: vi.fn(),
  listLiteraryReviews: vi.fn(),
  listLiteraryReviewAnalyses: vi.fn(),
}));
const review = (state: LiteraryReview['state'] = 'planning'): LiteraryReview => ({
  jobId: 'review-operation-0010',
  chapterId: 'chapter',
  sourceToken: 'a'.repeat(64),
  state,
  units: 1,
  completedUnits: state === 'done' ? 1 : 0,
  analyses: state === 'done' ? 2 : 0,
  blocking: 0,
  warnings: 0,
  suggestions: 0,
  pendingRequestId: null,
  createdAt: 1,
  completedAt: state === 'done' ? 2 : null,
  authorAccepted: false,
  coverage: {
    scope: 'chapter-scenes',
    wholeChapter: state === 'done',
    wholeBook: false,
    layers: ['reviewStructure', 'reviewProse'],
    units: 1,
    completedUnits: state === 'done' ? 1 : 0,
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(startLiteraryReview).mockResolvedValue(review());
});
it('creating a review records the checkpoint without automatically producing analyses', async () => {
  const user = userEvent.setup();
  render(<LiteraryReviewPanel bookId="book" chapterId="chapter" />);
  expect(startLiteraryReview).not.toHaveBeenCalled();
  expect(advanceLiteraryReview).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Registrar revisão do capítulo' }));
  await screen.findByText('Identificando cenas');
  expect(startLiteraryReview).toHaveBeenCalledTimes(1);
  expect(advanceLiteraryReview).not.toHaveBeenCalled();
});
it('complete coverage still requires separate author acceptance', async () => {
  const user = userEvent.setup();
  vi.mocked(advanceLiteraryReview)
    .mockResolvedValueOnce(review('reviewing'))
    .mockResolvedValueOnce(review('done'));
  vi.mocked(acceptLiteraryReview).mockResolvedValue({ ...review('done'), authorAccepted: true });
  render(<LiteraryReviewPanel bookId="book" chapterId="chapter" />);
  await user.click(screen.getByRole('button', { name: 'Registrar revisão do capítulo' }));
  await user.click(await screen.findByRole('button', { name: 'Retomar revisão até concluir' }));
  await screen.findByText('Cobertura concluída');
  expect(acceptLiteraryReview).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Registrar aceite autoral da revisão' }));
  await waitFor(() =>
    expect(acceptLiteraryReview).toHaveBeenCalledWith(
      'book',
      'review-operation-0010',
      'a'.repeat(64),
    ),
  );
});
it('a canceled checkpoint cannot be reopened by a late advance response', async () => {
  const user = userEvent.setup();
  let finish!: (value: LiteraryReview) => void;
  vi.mocked(advanceLiteraryReview).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.mocked(cancelLiteraryReview).mockResolvedValue(review('canceled'));
  render(<LiteraryReviewPanel bookId="book" chapterId="chapter" />);
  await user.click(screen.getByRole('button', { name: 'Registrar revisão do capítulo' }));
  await user.click(await screen.findByRole('button', { name: 'Retomar revisão até concluir' }));
  await waitFor(() => expect(advanceLiteraryReview).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole('button', { name: 'Cancelar esta revisão' }));
  await screen.findByText('Revisão cancelada');
  finish(review('done'));
  await waitFor(() => expect(screen.queryByText('Cobertura concluída')).not.toBeInTheDocument());
  expect(acceptLiteraryReview).not.toHaveBeenCalled();
});

it('preserving an accepted revised version requires an explicit action and resumes its own capture', async () => {
  const user = userEvent.setup(),
    accepted = { ...review('done'), authorAccepted: true };
  vi.mocked(startLiteraryReview).mockResolvedValue(accepted);
  vi.mocked(advanceLiteraryReviewedVersion)
    .mockResolvedValueOnce({
      ...accepted,
      preservationState: 'capturing',
      preservationProgress: { planned: 1, captured: 1, verified: 0 },
    })
    .mockResolvedValueOnce({
      ...accepted,
      preservationState: 'done',
      preservationCurrent: true,
      preservationProgress: { planned: 1, captured: 1, verified: 1 },
      revisedMilestoneId: 'reviewed-milestone',
    });
  render(<LiteraryReviewPanel bookId="book" chapterId="chapter" />);
  await user.click(screen.getByRole('button', { name: 'Registrar revisão do capítulo' }));
  const preserve = await screen.findByRole('button', { name: 'Preservar versão revisada aceita' });
  expect(advanceLiteraryReviewedVersion).not.toHaveBeenCalled();
  await user.click(preserve);
  await screen.findByText(/Versão revisada preservada no histórico/);
  expect(advanceLiteraryReviewedVersion).toHaveBeenCalledTimes(2);
  expect(advanceLiteraryReview).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Preservar versão revisada aceita' }),
  ).not.toBeInTheDocument();
});
it('an interrupted revised capture needs an explicit request before starting another attempt', async () => {
  const user = userEvent.setup(),
    accepted = { ...review('done'), authorAccepted: true, preservationState: 'attention' as const };
  vi.mocked(startLiteraryReview).mockResolvedValue(accepted);
  vi.mocked(advanceLiteraryReviewedVersion).mockResolvedValue({
    ...accepted,
    preservationState: 'done',
    preservationCurrent: true,
  });
  render(<LiteraryReviewPanel bookId="book" chapterId="chapter" />);
  await user.click(screen.getByRole('button', { name: 'Registrar revisão do capítulo' }));
  const retry = await screen.findByRole('button', { name: 'Registrar nova captura revisada' });
  expect(advanceLiteraryReviewedVersion).not.toHaveBeenCalled();
  await user.click(retry);
  await waitFor(() =>
    expect(advanceLiteraryReviewedVersion).toHaveBeenCalledWith(
      'book',
      'review-operation-0010',
      'a'.repeat(64),
      true,
    ),
  );
});

it('a cycle opens its captured review checkpoint without generating or accepting another review', async () => {
  vi.mocked(getLiteraryReview).mockResolvedValue(review('done'));
  render(
    <LiteraryReviewPanel bookId="book" chapterId="chapter" initialJobId="review-operation-0010" />,
  );
  await screen.findByText('Cobertura concluída');
  expect(getLiteraryReview).toHaveBeenCalledWith('book', 'review-operation-0010');
  expect(startLiteraryReview).not.toHaveBeenCalled();
  expect(advanceLiteraryReview).not.toHaveBeenCalled();
  expect(acceptLiteraryReview).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Registrar revisão do capítulo' }),
  ).not.toBeInTheDocument();
});

it('a sequence-managed review retains evidence inspection and leaves production/acceptance to its cycle', async () => {
  vi.mocked(getLiteraryReview).mockResolvedValue(review('done'));
  render(
    <LiteraryReviewPanel
      bookId="book"
      chapterId="chapter"
      initialJobId="review-operation-0010"
      coordinated
    />,
  );
  await screen.findByText('Cobertura concluída');
  expect(
    screen.getByRole('button', { name: 'Consultar análises e evidências' }),
  ).toBeInTheDocument();
  for (const name of [
    'Registrar revisão do capítulo',
    'Consultar revisões do capítulo',
    'Retomar revisão até concluir',
    'Registrar aceite autoral da revisão',
    'Preservar versão revisada aceita',
  ])
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  expect(advanceLiteraryReview).not.toHaveBeenCalled();
  expect(acceptLiteraryReview).not.toHaveBeenCalled();
});
it('paginates historical reviews and inspects both analysis layers without applying their suggestions', async () => {
  vi.mocked(reviewApi.listLiteraryReviews)
    .mockResolvedValueOnce({ items: [review()], nextAfterId: 'cursor' })
    .mockResolvedValueOnce({
      items: [{ ...review('done'), jobId: 'historical' }],
      nextAfterId: null,
    });
  vi.mocked(getLiteraryReview).mockResolvedValue({ ...review('done'), jobId: 'historical' });
  const coverage = {
    scope: 'scene-segment' as const,
    wholeChapter: false as const,
    wholeBook: false as const,
    sourceToken: 'a'.repeat(64),
    sourceCharacters: 10,
    segment: 0,
    segmentCount: 1,
    start: 0,
    end: 10,
    coreStart: 0,
    coreEnd: 10,
    completeScene: true,
    previousSceneIncluded: false,
  };
  vi.mocked(reviewApi.listLiteraryReviewAnalyses)
    .mockResolvedValueOnce({
      items: [
        {
          id: 'a',
          jobId: 'historical',
          requestId: 'analysis-a',
          unitIndex: 0,
          layer: 'reviewStructure',
          segment: 0,
          coverage,
        },
      ],
      nextAfterId: 'a',
    })
    .mockResolvedValueOnce({
      items: [
        {
          id: 'b',
          jobId: 'historical',
          requestId: 'analysis-b',
          unitIndex: 0,
          layer: 'reviewProse',
          segment: 0,
          coverage,
        },
      ],
      nextAfterId: null,
    });
  vi.mocked(getLiteraryProse).mockResolvedValue({
    requestId: 'analysis-b',
    state: 'done',
    historical: true,
    documents: [{ id: 'source', label: 'Fonte original', revision: 1, text: 'A carta.' }],
    result: {
      text: '',
      rationale: 'Conferir a continuidade',
      complete: true,
      findings: [
        {
          severity: 'warning',
          sourceId: 'source',
          quote: 'A carta.',
          offset: 0,
          problem: 'Transição abrupta',
          action: 'Comparar cenas',
        },
      ],
    },
  });
  render(<LiteraryReviewPanel bookId="book" chapterId="chapter" />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar revisões do capítulo' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Mais revisões' }));
  await userEvent.click(await screen.findByRole('button', { name: /· Cobertura concluída/ }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Consultar checkpoint da revisão' }),
  );
  await waitFor(() => expect(getLiteraryReview).toHaveBeenCalledTimes(2));
  await userEvent.click(screen.getByRole('button', { name: 'Consultar análises e evidências' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Mais análises' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Cena 1 · Prosa · parte 1' }));
  const evidence = await screen.findByRole('region', { name: 'Evidências da análise' });
  expect(within(evidence).getByText('A carta.')).toBeVisible();
  expect(within(evidence).getByText('Transição abrupta')).toBeVisible();
  expect(within(evidence).getByText(/Fonte original/)).toBeVisible();
  expect(acceptLiteraryReview).not.toHaveBeenCalled();
  expect(startLiteraryReview).not.toHaveBeenCalled();
});
it('keeps uncertain review creation frozen and retries the same author instructions', async () => {
  vi.mocked(startLiteraryReview).mockRejectedValueOnce(new Error('Rede indisponível'));
  render(<LiteraryReviewPanel bookId="book" chapterId="chapter" />);
  fireEvent.change(screen.getByLabelText('Orientação para a revisão integral'), {
    target: { value: 'Conferir ritmo' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Descartar orientação de revisão' }));
  expect(screen.getByLabelText('Orientação para a revisão integral')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Orientação para a revisão integral'), {
    target: { value: 'Conferir reservas' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Registrar revisão do capítulo' }));
  await screen.findByText('Rede indisponível');
  expect(screen.getByLabelText('Orientação para a revisão integral')).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Recuperar a mesma revisão' }));
  await screen.findByText('Identificando cenas');
  expect(vi.mocked(startLiteraryReview).mock.calls[0]).toEqual(
    vi.mocked(startLiteraryReview).mock.calls[1],
  );
});
it('queries, retries and cancels an interrupted analysis separately from its chapter review', async () => {
  const attention = { ...review('attention'), pendingRequestId: 'analysis-a' };
  vi.mocked(startLiteraryReview).mockResolvedValue(attention);
  vi.mocked(getLiteraryProse).mockResolvedValue({
    requestId: 'analysis-a',
    state: 'error',
    message: 'Produtor interrompido',
  });
  vi.mocked(reviewApi.retryLiteraryReviewAnalysis).mockResolvedValue(attention);
  vi.mocked(reviewApi.cancelPendingLiteraryReviewAnalysis).mockResolvedValue(review('reviewing'));
  render(<LiteraryReviewPanel bookId="book" chapterId="chapter" />);
  await userEvent.click(screen.getByRole('button', { name: 'Registrar revisão do capítulo' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Consultar análise pendente' }));
  await screen.findByText('Produtor interrompido');
  await userEvent.click(
    screen.getByRole('button', { name: 'Preparar nova tentativa da análise interrompida' }),
  );
  await waitFor(() => expect(reviewApi.retryLiteraryReviewAnalysis).toHaveBeenCalledOnce());
  await userEvent.click(
    screen.getByRole('button', { name: 'Cancelar somente a análise pendente' }),
  );
  await waitFor(() =>
    expect(reviewApi.cancelPendingLiteraryReviewAnalysis).toHaveBeenCalledWith(
      'book',
      review().jobId,
    ),
  );
  expect(cancelLiteraryReview).not.toHaveBeenCalled();
});
