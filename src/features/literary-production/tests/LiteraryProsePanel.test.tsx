import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiteraryProsePanel } from '../components/LiteraryProsePanel';
import { listScenes } from '@/features/scenes';
import {
  getLiteraryProseSourceInfo,
  startLiteraryProse,
  cancelPendingLiteraryProse,
  applyLiteraryProse,
  type ProseResponse,
} from '../services/literaryProseService';
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'author' } }) }));
vi.mock('@/features/scenes', () => ({ listScenes: vi.fn() }));
vi.mock('../services/literaryProseService', () => ({
  getLiteraryProseSourceInfo: vi.fn(),
  startLiteraryProse: vi.fn(),
  getLiteraryProse: vi.fn(),
  listLiteraryProse: vi.fn(),
  cancelLiteraryProse: vi.fn(),
  applyLiteraryProse: vi.fn(),
  recoverLiteraryProse: vi.fn(),
  cancelPendingLiteraryProse: vi.fn(),
}));
const proposed = (): ProseResponse => ({
  requestId: 'prose-operation-0010',
  state: 'done',
  current: true,
  chapterId: 'chapter',
  sceneId: 'scene',
  sceneTitle: 'A decisão',
  mode: 'draftScene',
  sourceRevision: 2,
  applyCost: 1,
  applicable: true,
  sourceText: '',
  documents: [],
  result: {
    text: 'Ela abriu a carta.',
    rationale: 'Uma escolha tem consequência.',
    complete: true,
    findings: [],
  },
  coverage: {
    scope: 'scene-segment',
    wholeChapter: false,
    wholeBook: false,
    sourceToken: 'a'.repeat(64),
    sourceCharacters: 0,
    segment: 0,
    segmentCount: 1,
    start: 0,
    end: 0,
    coreStart: 0,
    coreEnd: 0,
    completeScene: true,
    previousSceneIncluded: false,
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listScenes).mockResolvedValue({
    items: [
      {
        id: 'scene',
        ownerId: 'author',
        schemaVersion: 1,
        revision: 2,
        title: 'A decisão',
        parentId: 'chapter',
        stage: 'planned',
        archived: false,
        rank: 'a',
        wordCount: 0,
        bodyHash: 'b'.repeat(64),
        bodyBytes: 0,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    nextCursor: null,
    projectRevision: 1,
  });
  vi.mocked(getLiteraryProseSourceInfo).mockResolvedValue({
    sceneId: 'scene',
    chapterId: 'chapter',
    title: 'A decisão',
    sourceToken: 'a'.repeat(64),
    characters: 0,
    empty: true,
    segments: [{ index: 0, start: 0, end: 0, coreStart: 0, coreEnd: 0 }],
  });
  vi.mocked(startLiteraryProse).mockResolvedValue(proposed());
});
async function chooseScene(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Consultar cenas do capítulo' }));
  await user.click(await screen.findByRole('combobox', { name: 'Cena para redação ou revisão' }));
  await user.click(await screen.findByRole('option', { name: 'A decisão' }));
  await user.click(screen.getByRole('button', { name: 'Conferir versão salva da cena' }));
  await screen.findByLabelText('Orientação para esta operação');
}
it('generation does not apply prose; substitution requires a separate confirmation', async () => {
  const user = userEvent.setup();
  vi.mocked(applyLiteraryProse).mockResolvedValue({
    requestId: 'prose-operation-0010',
    operationId: 'apply-operation-0010',
    fingerprint: 'c'.repeat(64),
    sceneId: 'scene',
    chapterId: 'chapter',
    revision: 3,
    contentHash: 'd'.repeat(64),
    chargedCredits: 1,
    credits: 4,
    previousVersionId: 'history-operation-0010',
    appliedAt: 4,
  });
  render(<LiteraryProsePanel bookId="book" chapterId="chapter" />);
  await chooseScene(user);
  await user.click(screen.getByRole('button', { name: 'Gerar proposta' }));
  await screen.findByText('Ela abriu a carta.');
  expect(applyLiteraryProse).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Revisar aplicação à cena · 1 crédito' }));
  expect(applyLiteraryProse).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Aplicar à cena · 1 crédito' }));
  await waitFor(() => expect(applyLiteraryProse).toHaveBeenCalledTimes(1));
  expect(vi.mocked(applyLiteraryProse).mock.calls[0]?.[0].expectedRevision).toBe(2);
  expect(vi.mocked(applyLiteraryProse).mock.calls[0]?.[1]).toBe('author');
});
it('an uncertain application retries with the exact same operation and destination', async () => {
  const user = userEvent.setup();
  vi.mocked(applyLiteraryProse)
    .mockRejectedValueOnce(new Error('Resposta incerta'))
    .mockResolvedValueOnce({
      requestId: 'prose-operation-0010',
      operationId: 'apply-operation-0010',
      fingerprint: 'c'.repeat(64),
      sceneId: 'scene',
      chapterId: 'chapter',
      revision: 3,
      contentHash: 'd'.repeat(64),
      chargedCredits: 1,
      credits: 4,
      previousVersionId: 'history-operation-0010',
      appliedAt: 4,
    });
  render(<LiteraryProsePanel bookId="book" chapterId="chapter" />);
  await chooseScene(user);
  await user.click(screen.getByRole('button', { name: 'Gerar proposta' }));
  await user.click(
    await screen.findByRole('button', { name: 'Revisar aplicação à cena · 1 crédito' }),
  );
  await user.click(screen.getByRole('button', { name: 'Aplicar à cena · 1 crédito' }));
  await user.click(await screen.findByRole('button', { name: 'Recuperar o mesmo aceite' }));
  await waitFor(() => expect(applyLiteraryProse).toHaveBeenCalledTimes(2));
  expect(vi.mocked(applyLiteraryProse).mock.calls[0]).toEqual(
    vi.mocked(applyLiteraryProse).mock.calls[1],
  );
});
it('canceling ignores a late producer response without reopening an applicable proposal', async () => {
  const user = userEvent.setup();
  let finish!: (value: ProseResponse) => void;
  vi.mocked(startLiteraryProse).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.mocked(cancelPendingLiteraryProse).mockResolvedValue({
    requestId: 'prose-operation-0010',
    state: 'canceled',
  });
  render(<LiteraryProsePanel bookId="book" chapterId="chapter" />);
  await chooseScene(user);
  await user.click(screen.getByRole('button', { name: 'Gerar proposta' }));
  await user.click(await screen.findByRole('button', { name: 'Cancelar geração' }));
  await screen.findByText('Pedido cancelado');
  finish(proposed());
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Revisar aplicação à cena · 1 crédito' }),
    ).not.toBeInTheDocument(),
  );
  expect(applyLiteraryProse).not.toHaveBeenCalled();
});

it('guidance opens analysis and keeps suggestions separate from manuscript application', async () => {
  const user = userEvent.setup();
  const collaboration = {
    version: 1 as const,
    mode: 'guidance' as const,
    revision: 3,
    configured: true,
  };
  vi.mocked(getLiteraryProseSourceInfo).mockResolvedValue({
    sceneId: 'scene',
    chapterId: 'chapter',
    title: 'A decisão',
    sourceToken: 'a'.repeat(64),
    characters: 20,
    empty: false,
    segments: [{ index: 0, start: 0, end: 20, coreStart: 0, coreEnd: 20 }],
    collaboration,
  });
  vi.mocked(startLiteraryProse).mockResolvedValue({
    ...proposed(),
    mode: 'reviewStructure',
    applicable: false,
    collaboration,
  });
  render(<LiteraryProsePanel bookId="book" chapterId="chapter" />);
  await chooseScene(user);
  expect(screen.getByText(/Orientação: analise a estrutura/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Gerar proposta' }));
  await screen.findByText('Ela abriu a carta.');
  expect(vi.mocked(startLiteraryProse).mock.calls[0]?.[0].mode).toBe('reviewStructure');
  expect(
    screen.queryByRole('button', { name: /Revisar aplicação à cena/ }),
  ).not.toBeInTheDocument();
  expect(applyLiteraryProse).not.toHaveBeenCalled();
});
