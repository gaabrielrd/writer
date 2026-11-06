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
  getLiteraryProse,
  listLiteraryProse,
  recoverLiteraryProse,
  cancelLiteraryProse,
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
const scenePage = (): Awaited<ReturnType<typeof listScenes>> => ({
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
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listScenes).mockResolvedValue(scenePage());
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

it('paginates scenes before selecting a native destination and discards only an unsent instruction', async () => {
  vi.mocked(listScenes)
    .mockResolvedValueOnce({ ...scenePage(), nextCursor: 'next-scenes' })
    .mockResolvedValueOnce({ ...scenePage(), items: [] });
  const user = userEvent.setup();
  const work = vi.fn();
  render(<LiteraryProsePanel bookId="book" chapterId="chapter" onWorkChange={work} />);
  await user.click(screen.getByRole('button', { name: 'Consultar cenas do capítulo' }));
  await user.click(await screen.findByRole('button', { name: 'Mais cenas' }));
  expect(listScenes).toHaveBeenLastCalledWith(
    expect.objectContaining({ cursor: 'next-scenes', parentId: 'chapter' }),
  );
  await user.click(screen.getByRole('combobox', { name: 'Cena para redação ou revisão' }));
  await user.click(screen.getByRole('option', { name: 'A decisão' }));
  await user.click(screen.getByRole('button', { name: 'Conferir versão salva da cena' }));
  await user.type(await screen.findByLabelText('Orientação para esta operação'), 'Meu rascunho.');
  await user.click(screen.getByRole('button', { name: 'Descartar orientação não enviada' }));
  expect(screen.getByLabelText('Orientação para esta operação')).toHaveValue('');
  expect(startLiteraryProse).not.toHaveBeenCalled();
  expect(work).toHaveBeenCalledWith({ dirty: true, pending: false });
});

it('keeps a lost generation queryable without producing or changing the frozen request again', async () => {
  const user = userEvent.setup();
  vi.mocked(startLiteraryProse).mockRejectedValueOnce(new Error('Resposta perdida'));
  vi.mocked(recoverLiteraryProse)
    .mockResolvedValueOnce({ requestId: 'pending', state: 'running' })
    .mockResolvedValueOnce(proposed());
  render(<LiteraryProsePanel bookId="book" chapterId="chapter" />);
  await chooseScene(user);
  await user.type(screen.getByLabelText('Orientação para esta operação'), 'Preserve a voz.');
  await user.click(screen.getByRole('button', { name: 'Gerar proposta' }));
  await screen.findByText('Resposta perdida');
  const wire = vi.mocked(startLiteraryProse).mock.calls[0]![0];
  await user.click(screen.getByRole('button', { name: 'Consultar resultado do mesmo pedido' }));
  await screen.findByText('Pedido registrado; resultado pendente');
  expect(screen.getByLabelText('Orientação para esta operação')).toHaveValue('Preserve a voz.');
  await user.click(screen.getByRole('button', { name: 'Consultar resultado do mesmo pedido' }));
  await screen.findByText('Ela abriu a carta.');
  expect(recoverLiteraryProse).toHaveBeenCalledTimes(2);
  expect(recoverLiteraryProse).toHaveBeenLastCalledWith(wire, 'author');
  expect(startLiteraryProse).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('Orientação para esta operação')).toHaveValue('');
});

it('reads paginated historical requests and findings without authorizing application', async () => {
  const user = userEvent.setup();
  vi.mocked(listLiteraryProse)
    .mockResolvedValueOnce({
      items: [{ requestId: 'old', state: 'done', mode: 'reviewProse', createdAt: 1 }],
      nextAfterId: 'old',
    })
    .mockResolvedValueOnce({
      items: [{ requestId: 'second', state: 'canceled', createdAt: 2 }],
      nextAfterId: null,
    });
  vi.mocked(getLiteraryProse).mockResolvedValue({
    ...proposed(),
    requestId: 'old',
    mode: 'reviewProse',
    applicable: false,
    historical: true,
    hasBlockingFindings: true,
    documents: [
      { id: 'guide', label: 'Guia privado', text: 'Evite repetição.', revision: 1 },
      { id: 'manuscript', label: 'Texto base', text: 'Não duplicar.', revision: 1 },
    ],
    result: {
      text: '',
      rationale: 'Análise segmentada.',
      complete: true,
      findings: [
        {
          sourceId: 'guide',
          offset: 0,
          quote: 'Evite',
          severity: 'warning',
          problem: 'Repetição observada.',
          action: 'Rever a passagem.',
        },
      ],
    },
  });
  render(<LiteraryProsePanel bookId="book" chapterId="chapter" />);
  await user.click(screen.getByRole('button', { name: 'Consultar pedidos do capítulo' }));
  await user.click(await screen.findByRole('button', { name: 'Mais pedidos' }));
  expect(listLiteraryProse).toHaveBeenLastCalledWith('book', 'chapter', 'old');
  await user.click(screen.getByRole('button', { name: /Revisar prosa e experiência ·/ }));
  await screen.findByText('Repetição observada.');
  await user.click(screen.getByText('Guia, preparação e outras fontes utilizadas'));
  expect(screen.getByRole('heading', { name: 'Guia privado' })).toBeVisible();
  expect(screen.queryByText('Não duplicar.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Revisar aplicação/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Atualizar disponibilidade da proposta' }));
  await waitFor(() => expect(getLiteraryProse).toHaveBeenCalledTimes(2));
  expect(applyLiteraryProse).not.toHaveBeenCalled();
});

it('freezes the selected review segment and provider snapshot', async () => {
  const user = userEvent.setup();
  vi.mocked(getLiteraryProseSourceInfo).mockResolvedValue({
    sceneId: 'scene',
    chapterId: 'chapter',
    title: 'A decisão',
    sourceToken: 'a'.repeat(64),
    characters: 20,
    empty: false,
    segments: [
      { index: 0, start: 0, end: 10, coreStart: 0, coreEnd: 10 },
      { index: 1, start: 10, end: 20, coreStart: 10, coreEnd: 20 },
    ],
  });
  render(
    <LiteraryProsePanel
      bookId="book"
      chapterId="chapter"
      captureGeneration={() => ({ model: 'fixed' })}
    />,
  );
  await chooseScene(user);
  await user.click(screen.getByRole('combobox', { name: 'Operação literária' }));
  await user.click(screen.getByRole('option', { name: 'Revisar prosa e experiência' }));
  await user.click(screen.getByRole('combobox', { name: 'Segmento de revisão' }));
  await user.click(screen.getByRole('option', { name: 'Parte 2 · caracteres 10–20' }));
  await user.click(screen.getByRole('button', { name: 'Gerar proposta' }));
  await screen.findByText('Ela abriu a carta.');
  expect(startLiteraryProse).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: 'reviewProse',
      segment: 1,
      generation: { model: 'fixed' },
      expectedSourceToken: 'a'.repeat(64),
    }),
    'author',
  );
  await user.click(screen.getByRole('button', { name: 'Revisar aplicação à cena · 1 crédito' }));
  await user.click(screen.getByRole('button', { name: 'Voltar à leitura' }));
  expect(applyLiteraryProse).not.toHaveBeenCalled();
});

it('can cancel a known running request without starting or applying another proposal', async () => {
  const user = userEvent.setup();
  vi.mocked(listLiteraryProse).mockResolvedValue({
    items: [{ requestId: 'known', state: 'running', createdAt: 1 }],
    nextAfterId: null,
  });
  vi.mocked(getLiteraryProse).mockResolvedValue({ requestId: 'known', state: 'running' });
  vi.mocked(cancelLiteraryProse).mockResolvedValue({ requestId: 'known', state: 'canceled' });
  render(<LiteraryProsePanel bookId="book" chapterId="chapter" />);
  await user.click(screen.getByRole('button', { name: 'Consultar pedidos do capítulo' }));
  await user.click(await screen.findByRole('button', { name: /Pedido ·/ }));
  await user.click(await screen.findByRole('button', { name: 'Cancelar geração' }));
  await screen.findByText('Pedido cancelado');
  expect(cancelLiteraryProse).toHaveBeenCalledWith('book', 'known');
  expect(startLiteraryProse).not.toHaveBeenCalled();
  expect(applyLiteraryProse).not.toHaveBeenCalled();
});
