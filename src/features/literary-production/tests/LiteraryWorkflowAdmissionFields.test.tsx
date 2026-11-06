import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiteraryWorkflowAdmissionFields } from '../components/LiteraryWorkflowAdmissionFields';
import {
  startLiteraryPassageInspection,
  getLiteraryPassageInspection,
  advanceLiteraryPassageInspection,
  cancelLiteraryPassageInspectionStart,
  getLiteraryPassageInspectionScope,
  type LiteraryPassageInspection,
} from '../services/literaryPassageInspectionService';
import {
  readPassageInspectionIntent,
  reservePassageInspectionIntent,
  releasePassageInspectionIntent,
  markPassageInspectionCancellation,
} from '../services/literaryPassageInspectionStorage';
import { listLiteraryPublications } from '../services/literaryPublicationService';
vi.mock('../services/literaryPassageInspectionService', () => ({
  startLiteraryPassageInspection: vi.fn(),
  getLiteraryPassageInspection: vi.fn(),
  advanceLiteraryPassageInspection: vi.fn(),
  cancelLiteraryPassageInspection: vi.fn(),
  cancelLiteraryPassageInspectionStart: vi.fn(),
  getLiteraryPassageInspectionScope: vi.fn(),
}));
vi.mock('../services/literaryPassageInspectionStorage', () => ({
  readPassageInspectionIntent: vi.fn(),
  reservePassageInspectionIntent: vi.fn(),
  releasePassageInspectionIntent: vi.fn(),
  markPassageInspectionCancellation: vi.fn(),
}));
vi.mock('../services/literaryPublicationService', () => ({ listLiteraryPublications: vi.fn() }));
const intent = {
  version: 2 as const,
  cancelRequested: false,
  expectedScopeToken: 'c'.repeat(64),
  actorId: 'author',
  bookId: 'book',
  chapterId: 'chapter',
  inspectionId: 'inspection-native-0001',
  publicationId: null,
};
const snapshot = (
  state: LiteraryPassageInspection['state'] = 'scanning',
): LiteraryPassageInspection => ({
  inspectionId: intent.inspectionId,
  expectedScopeToken: intent.expectedScopeToken,
  originToken: 'a'.repeat(64),
  chapterId: 'chapter',
  chapterActId: null,
  state,
  revision: state === 'ready' ? 2 : 0,
  scanned: state === 'ready' ? 1 : 0,
  verified: state === 'ready' ? 1 : 0,
  previous: null,
  previousActTail: null,
  firstInAct: true,
  inventoryHash: state === 'ready' ? 'b'.repeat(64) : null,
  publicationId: null,
  publicationMode: 'chapter',
  publicationChecked: 0,
  publication: null,
});
function mount() {
  const onChange = vi.fn(),
    onWorkChange = vi.fn();
  render(
    <LiteraryWorkflowAdmissionFields
      actorId="author"
      bookId="book"
      chapterId="chapter"
      contractRevision={3}
      required
      unit="chapter"
      disabled={false}
      onChange={onChange}
      onWorkChange={onWorkChange}
    />,
  );
  return { onChange, onWorkChange };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readPassageInspectionIntent).mockReturnValue(null);
  vi.mocked(reservePassageInspectionIntent).mockResolvedValue(intent);
  vi.mocked(markPassageInspectionCancellation).mockImplementation((value) =>
    Promise.resolve({
      ...value,
      cancelRequested: true,
    }),
  );
  vi.mocked(startLiteraryPassageInspection).mockResolvedValue({
    inspectionId: intent.inspectionId,
    state: 'scanning',
    revision: 0,
  });
  vi.mocked(getLiteraryPassageInspection).mockResolvedValue(snapshot());
  vi.mocked(getLiteraryPassageInspectionScope).mockResolvedValue({
    chapterId: 'chapter',
    scopeToken: intent.expectedScopeToken,
  });
  vi.mocked(cancelLiteraryPassageInspectionStart).mockResolvedValue(snapshot('canceled'));
  vi.mocked(listLiteraryPublications).mockResolvedValue({ items: [], nextAfterId: null });
});

it('opening does not send or advance; write-ahead precedes start and each page needs a click', async () => {
  mount();
  expect(startLiteraryPassageInspection).not.toHaveBeenCalled();
  expect(getLiteraryPassageInspection).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspeção da ordem' }));
  await screen.findByRole('button', { name: 'Conferir próxima página da inspeção' });
  expect(vi.mocked(reservePassageInspectionIntent).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(startLiteraryPassageInspection).mock.invocationCallOrder[0]!,
  );
  expect(advanceLiteraryPassageInspection).not.toHaveBeenCalled();
  vi.mocked(advanceLiteraryPassageInspection).mockResolvedValue(snapshot('ready'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Conferir próxima página da inspeção' }),
  );
  await screen.findByText(/Primeira unidade: não há capítulo anterior/);
  expect(advanceLiteraryPassageInspection).toHaveBeenCalledTimes(1);
  expect(advanceLiteraryPassageInspection).toHaveBeenCalledWith(
    expect.objectContaining({ expectedOriginToken: 'a'.repeat(64), expectedRevision: 0 }),
  );
});

it('restoring the ID queries only on request and ready is selected only by explicit fresh confirmation', async () => {
  vi.mocked(readPassageInspectionIntent).mockReturnValue(intent);
  vi.mocked(getLiteraryPassageInspection).mockResolvedValue(snapshot('ready'));
  const { onChange } = mount();
  expect(getLiteraryPassageInspection).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Consultar inspeção salva' }));
  await screen.findByRole('button', { name: 'Usar inspeção conferida neste ciclo' });
  expect(onChange).not.toHaveBeenCalledWith(
    expect.objectContaining({ inspectionId: intent.inspectionId }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Usar inspeção conferida neste ciclo' }),
  );
  await waitFor(() =>
    expect(onChange).toHaveBeenLastCalledWith({
      inspectionId: intent.inspectionId,
      contractRevision: 3,
      chapterActId: null,
      previousChapterId: null,
    }),
  );
  expect(getLiteraryPassageInspection).toHaveBeenCalledTimes(2);
  expect(startLiteraryPassageInspection).not.toHaveBeenCalled();
  expect(advanceLiteraryPassageInspection).not.toHaveBeenCalled();
});

it('lost start response preserves its IDs and repeats only the same explicit start', async () => {
  vi.mocked(startLiteraryPassageInspection).mockRejectedValueOnce(new Error('Resposta perdida'));
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspeção da ordem' }));
  await screen.findByText('Resposta perdida');
  const original = vi.mocked(startLiteraryPassageInspection).mock.calls[0]?.[0];
  await userEvent.click(screen.getByRole('button', { name: 'Repetir o mesmo início da inspeção' }));
  await screen.findByRole('button', { name: 'Conferir próxima página da inspeção' });
  expect(startLiteraryPassageInspection).toHaveBeenCalledTimes(2);
  expect(vi.mocked(startLiteraryPassageInspection).mock.calls[1]?.[0]).toEqual(original);
  expect(reservePassageInspectionIntent).toHaveBeenCalledTimes(1);
});

it('stale inspection can close, but its local pointer is removed only after fresh confirmed closure', async () => {
  vi.mocked(readPassageInspectionIntent).mockReturnValue(intent);
  vi.mocked(getLiteraryPassageInspection).mockResolvedValue(snapshot('stale'));
  vi.mocked(cancelLiteraryPassageInspectionStart).mockResolvedValue(snapshot('canceled'));
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'Consultar inspeção salva' }));
  await screen.findByText(/Origem alterada/);
  expect(releasePassageInspectionIntent).not.toHaveBeenCalled();
  vi.mocked(getLiteraryPassageInspection).mockResolvedValue(snapshot('canceled'));
  await userEvent.click(screen.getByRole('button', { name: 'Encerrar inspeção' }));
  await screen.findByRole('button', { name: 'Remover acompanhamento encerrado' });
  expect(releasePassageInspectionIntent).not.toHaveBeenCalled();
  vi.mocked(getLiteraryPassageInspection).mockResolvedValue(snapshot('canceled'));
  await userEvent.click(screen.getByRole('button', { name: 'Remover acompanhamento encerrado' }));
  await waitFor(() =>
    expect(releasePassageInspectionIntent).toHaveBeenCalledWith({
      ...intent,
      cancelRequested: true,
    }),
  );
});

it('cancel closes an uncertain start without waiting for it and a late ACK cannot restore scanning', async () => {
  let acknowledge!: (value: { inspectionId: string; state: 'scanning'; revision: 0 }) => void;
  vi.mocked(startLiteraryPassageInspection).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
  );
  vi.mocked(getLiteraryPassageInspection).mockResolvedValue(snapshot('canceled'));
  const { onChange } = mount();
  await userEvent.click(screen.getByRole('button', { name: 'Iniciar inspeção da ordem' }));
  const close = await screen.findByRole('button', { name: 'Encerrar inspeção' });
  expect(close).not.toBeDisabled();
  await userEvent.click(close);
  await screen.findByRole('button', { name: 'Remover acompanhamento encerrado' });
  expect(cancelLiteraryPassageInspectionStart).toHaveBeenCalledWith(
    expect.objectContaining({
      inspectionId: intent.inspectionId,
      expectedScopeToken: intent.expectedScopeToken,
    }),
  );
  expect(advanceLiteraryPassageInspection).not.toHaveBeenCalled();
  await act(async () => {
    acknowledge({ inspectionId: intent.inspectionId, state: 'scanning', revision: 0 });
    await Promise.resolve();
  });
  expect(screen.getByText(/Inspeção encerrada/)).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Conferir próxima página da inspeção' }),
  ).not.toBeInTheDocument();
  expect(getLiteraryPassageInspection).toHaveBeenCalledTimes(1);
  expect(onChange).not.toHaveBeenCalledWith(
    expect.objectContaining({ inspectionId: intent.inspectionId }),
  );
});

it('legacy metadata can be consulted but cannot manufacture a new native scope to recreate the start', () => {
  const legacy = { ...intent, version: 1 as const };
  delete (legacy as { expectedScopeToken?: string }).expectedScopeToken;
  vi.mocked(readPassageInspectionIntent).mockReturnValue(legacy);
  mount();
  expect(
    screen.queryByRole('button', { name: 'Repetir o mesmo início da inspeção' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Acompanhamento antigo/)).toBeInTheDocument();
  expect(getLiteraryPassageInspectionScope).not.toHaveBeenCalled();
  expect(startLiteraryPassageInspection).not.toHaveBeenCalled();
});

it('reloading a durable cancellation never restores retry-start or page controls', async () => {
  vi.mocked(readPassageInspectionIntent).mockReturnValue({ ...intent, cancelRequested: true });
  mount();
  expect(screen.getByText(/Encerramento solicitado/)).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Repetir o mesmo início da inspeção' }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Consultar inspeção salva' }));
  await screen.findByText(/Conferindo a ordem/);
  expect(
    screen.queryByRole('button', { name: 'Conferir próxima página da inspeção' }),
  ).not.toBeInTheDocument();
  expect(startLiteraryPassageInspection).not.toHaveBeenCalled();
  expect(advanceLiteraryPassageInspection).not.toHaveBeenCalled();
});
