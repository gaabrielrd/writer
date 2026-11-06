import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { LiterarySequencePanel } from '../components/LiterarySequencePanel';
import { editorialFields, type EditorialContract } from '../model/editorial';
import * as api from '../services/literarySequenceService';
import { listLiteraryReferences } from '../services/literaryPlanningService';
import {
  listLiteraryIntegrations,
  type LiteraryIntegration,
} from '../services/literaryIntegrationService';
import type { WorkflowFrame } from '../services/literaryWorkflowService';
const actor = vi.hoisted(() => ({ uid: 'author' }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: actor.uid } }) }));
vi.mock('../services/literaryPlanningService', () => ({ listLiteraryReferences: vi.fn() }));
vi.mock('../services/literaryIntegrationService', () => ({ listLiteraryIntegrations: vi.fn() }));
vi.mock('../services/literarySequenceService', () => ({
  getLiterarySequenceScope: vi.fn(),
  startLiterarySequence: vi.fn(),
  getLiterarySequence: vi.fn(),
  listLiterarySequences: vi.fn(),
  advanceLiterarySequence: vi.fn(),
  setLiterarySequenceControl: vi.fn(),
  recoverLiterarySequenceStep: vi.fn(),
}));
vi.mock('../components/LiteraryWorkflowPanel', () => ({
  LiteraryWorkflowPanel: ({
    managedFrame,
    managedBusy,
  }: {
    managedFrame: WorkflowFrame;
    managedBusy: boolean;
  }) => (
    <p>
      Capítulo vinculado: {managedFrame.job.chapterTitle} ·{' '}
      {managedBusy ? 'aguarde' : 'decisões disponíveis'}
    </p>
  ),
}));
vi.mock('../components/LiteraryWorkflowAdmissionFields', () => ({
  LiteraryWorkflowAdmissionFields: ({
    chapterId,
    contractRevision,
    onChange,
  }: {
    chapterId: string;
    contractRevision: number;
    onChange: (value: {
      inspectionId: string;
      contractRevision: number;
      chapterActId: null;
      previousChapterId: null;
    }) => void;
  }) => (
    <button
      onClick={() =>
        onChange({
          inspectionId: 'inspected-' + chapterId,
          contractRevision,
          chapterActId: null,
          previousChapterId: null,
        })
      }
    >
      Escolher inspeção de {chapterId}
    </button>
  ),
}));
const chapters = [
  { id: 'chapter-a', title: 'A carta', order: 1, actId: null, actOrder: null },
  { id: 'chapter-b', title: 'A resposta', order: 2, actId: null, actOrder: null },
];
const collaboration = {
  version: 1 as const,
  mode: 'continuous' as const,
  revision: 1,
  configured: true,
};
const frame = (patch: Partial<api.LiterarySequence> = {}): api.SequenceFrame => ({
  job: {
    jobId: 'sequence-native-0001',
    bookTitle: 'Livro',
    originToken: 'b'.repeat(64),
    chapters,
    registrationState: 'active',
    revision: 1,
    state: 'active',
    paused: false,
    index: 0,
    currentWorkflowId: null,
    completed: [],
    stop: null,
    busyStep: null,
    limits: { maxApplications: 3, maxCredits: 3, maxSteps: 1000 },
    authorizedPhases: [],
    continueBetweenChapters: false,
    collaboration,
    applications: 0,
    credits: 0,
    steps: 0,
    createdAt: 100,
    completedAt: null,
    ...patch,
  },
});
const reference = (chapter: (typeof chapters)[number]) => ({
  label: chapter.title,
  reference: {
    kind: 'chapter' as const,
    id: chapter.id,
    scopeId: null,
    sourceToken: 'c'.repeat(64),
    revision: 1,
    purpose: 'subject' as const,
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  actor.uid = 'author';
  vi.mocked(listLiteraryReferences).mockResolvedValue({
    items: chapters.map(reference),
    nextAfterId: null,
  });
  vi.mocked(api.getLiterarySequenceScope).mockResolvedValue({
    originToken: 'a'.repeat(64),
    bookTitle: 'Livro',
    chapters,
    collaboration,
  });
  vi.mocked(api.startLiterarySequence).mockResolvedValue(frame());
  vi.mocked(api.listLiterarySequences).mockResolvedValue({ items: [], nextAfterId: null });
});
async function choose(user: ReturnType<typeof userEvent.setup>, title = 'A carta') {
  await user.click(screen.getByRole('combobox', { name: 'Adicionar capítulo à sequência' }));
  await user.click(screen.getByRole('option', { name: title }));
  await user.click(screen.getByRole('button', { name: 'Adicionar capítulo selecionado' }));
}
async function registered() {
  const user = userEvent.setup();
  render(<LiterarySequencePanel bookId="book" collaborationMode="continuous" />);
  await user.click(screen.getByRole('button', { name: 'Consultar capítulos para sequência' }));
  await choose(user);
  await choose(user, 'A resposta');
  await user.click(screen.getByRole('button', { name: 'Conferir escopo e preparar prévia' }));
  await user.click(
    await screen.findByRole('button', { name: 'Registrar esta sequência com estes limites' }),
  );
  await screen.findByRole('region', { name: 'Checkpoint da sequência' });
  return user;
}
it('registration needs a native preview and separate consent; it never starts generation', async () => {
  const user = userEvent.setup();
  render(
    <LiterarySequencePanel
      bookId="book"
      collaborationMode="continuous"
      captureGeneration={() => ({ version: 1, model: 'frozen' })}
    />,
  );
  expect(api.getLiterarySequenceScope).not.toHaveBeenCalled();
  expect(api.startLiterarySequence).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Consultar capítulos para sequência' }));
  await choose(user);
  await choose(user, 'A resposta');
  await user.type(screen.getByLabelText('Orientação para esta sequência'), 'Preserve a dúvida.');
  await user.click(screen.getByRole('button', { name: 'Conferir escopo e preparar prévia' }));
  const consent = await screen.findByRole('button', {
    name: 'Registrar esta sequência com estes limites',
  });
  expect(api.startLiterarySequence).not.toHaveBeenCalled();
  await user.click(consent);
  await screen.findByRole('region', { name: 'Checkpoint da sequência' });
  expect(api.startLiterarySequence).toHaveBeenCalledWith(
    expect.objectContaining({
      chapterIds: ['chapter-a', 'chapter-b'],
      instruction: 'Preserve a dúvida.',
      expectedScopeToken: 'a'.repeat(64),
      limits: { maxApplications: 3, maxCredits: 3, maxSteps: 1000 },
      generation: { version: 1, model: 'frozen' },
      authorizedPhases: [],
      continueBetweenChapters: false,
    }),
    'author',
  );
  expect(api.advanceLiterarySequence).not.toHaveBeenCalled();
});
it('author edits invalidate the preview and chapter selection can be paginated and reordered without imposing book size', async () => {
  const user = userEvent.setup();
  vi.mocked(listLiteraryReferences)
    .mockResolvedValueOnce({ items: [reference(chapters[1]!)], nextAfterId: 'more' })
    .mockResolvedValueOnce({ items: [reference(chapters[0]!)], nextAfterId: null });
  render(<LiterarySequencePanel bookId="book" collaborationMode="continuous" />);
  await user.click(screen.getByRole('button', { name: 'Consultar capítulos para sequência' }));
  await choose(user, 'A resposta');
  await user.click(screen.getByRole('button', { name: 'Mais capítulos para sequência' }));
  await choose(user);
  await user.click(screen.getByRole('button', { name: 'Subir A carta' }));
  await user.click(screen.getByRole('button', { name: 'Conferir escopo e preparar prévia' }));
  await screen.findByRole('region', { name: 'Prévia da sequência' });
  expect(api.getLiterarySequenceScope).toHaveBeenCalledWith('book', ['chapter-a', 'chapter-b']);
  await user.type(screen.getByLabelText('Orientação para esta sequência'), 'Outra intenção');
  expect(screen.queryByRole('region', { name: 'Prévia da sequência' })).not.toBeInTheDocument();
  expect(api.startLiterarySequence).not.toHaveBeenCalled();
});
it('the runner stops at the author chapter boundary and proceeds only after a separate authorization', async () => {
  vi.mocked(api.advanceLiterarySequence)
    .mockResolvedValueOnce(frame({ revision: 2, index: 1, stop: 'nextChapterAuthorization' }))
    .mockResolvedValueOnce(frame({ revision: 4, state: 'done', index: 2 }));
  vi.mocked(api.setLiterarySequenceControl).mockResolvedValue(frame({ revision: 3, index: 1 }));
  const user = await registered();
  await user.click(screen.getByRole('button', { name: 'Avançar sequência até a próxima decisão' }));
  await screen.findByText('O próximo capítulo exige sua autorização.');
  expect(api.advanceLiterarySequence).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', { name: 'Avançar sequência até a próxima decisão' }),
  ).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Autorizar entrada no próximo capítulo' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Avançar sequência até a próxima decisão' }),
    ).toBeEnabled(),
  );
  expect(api.advanceLiterarySequence).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Avançar sequência até a próxima decisão' }));
  await screen.findByText('Seleção concluída');
  expect(api.advanceLiterarySequence).toHaveBeenCalledTimes(2);
});
it('a pause supersedes the local loop and a late frame cannot continue or repaint it', async () => {
  let release!: (value: api.SequenceFrame) => void;
  vi.mocked(api.advanceLiterarySequence).mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  vi.mocked(api.setLiterarySequenceControl).mockResolvedValue(frame({ revision: 2, paused: true }));
  const user = await registered();
  await user.click(screen.getByRole('button', { name: 'Avançar sequência até a próxima decisão' }));
  await user.click(screen.getByRole('button', { name: 'Pausar sequência no servidor' }));
  await screen.findByText('Sequência pausada');
  await act(async () => {
    release(frame({ revision: 99, state: 'done', index: 2 }));
    await Promise.resolve();
  });
  expect(screen.getByText('Sequência pausada')).toBeInTheDocument();
  expect(screen.queryByText('Seleção concluída')).not.toBeInTheDocument();
  expect(api.advanceLiterarySequence).toHaveBeenCalledTimes(1);
});
it('discovery retains pagination on an empty page and server pending steps are recovered explicitly without a new advance', async () => {
  const user = userEvent.setup();
  vi.mocked(api.listLiterarySequences)
    .mockResolvedValueOnce({ items: [], nextAfterId: 'hidden-page' })
    .mockResolvedValueOnce({
      items: [
        {
          jobId: 'sequence-native-0001',
          registrationState: 'active',
          state: 'active',
          paused: false,
          revision: 1,
          index: 0,
          chapterCount: 2,
          createdAt: 100,
          completedAt: null,
        },
      ],
      nextAfterId: null,
    });
  vi.mocked(api.getLiterarySequence).mockResolvedValue(
    frame({ busyStep: 'server-pending-operation' }),
  );
  vi.mocked(api.recoverLiterarySequenceStep).mockResolvedValue(
    frame({ revision: 2, stop: 'preparation' }),
  );
  render(<LiterarySequencePanel bookId="book" collaborationMode="continuous" />);
  await user.click(screen.getByRole('button', { name: 'Consultar sequências registradas' }));
  await user.click(await screen.findByRole('button', { name: 'Mais sequências registradas' }));
  await user.click(await screen.findByRole('button', { name: /Registrada · 0 de 2 capítulos/ }));
  expect(api.recoverLiterarySequenceStep).not.toHaveBeenCalled();
  await user.click(
    await screen.findByRole('button', { name: 'Recuperar passo original da sequência' }),
  );
  await screen.findByText(/Complete e aceite a preparação deste capítulo/);
  expect(api.recoverLiterarySequenceStep).toHaveBeenCalledWith(
    'book',
    'sequence-native-0001',
    'server-pending-operation',
    'author',
    expect.any(Function),
  );
  expect(api.advanceLiterarySequence).not.toHaveBeenCalled();
});
it('an uncertain advance retries the identical selected act report and original operation', async () => {
  const user = userEvent.setup();
  const entry = frame({
    index: 1,
    chapters: [
      { ...chapters[0]!, actId: 'act-first' },
      { ...chapters[1]!, actId: 'act-second' },
    ],
    stop: 'actIntegration',
  });
  vi.mocked(api.listLiterarySequences).mockResolvedValue({
    items: [
      {
        jobId: entry.job.jobId,
        registrationState: 'active',
        state: 'active',
        paused: false,
        revision: 1,
        index: 1,
        chapterCount: 2,
        createdAt: 100,
        completedAt: null,
      },
    ],
    nextAfterId: null,
  });
  vi.mocked(api.getLiterarySequence).mockResolvedValue(entry);
  vi.mocked(listLiteraryIntegrations).mockResolvedValue({
    items: [
      {
        jobId: 'accepted-report',
        state: 'done',
        level: 'act',
        actId: 'act-first',
        authorAccepted: true,
        createdAt: 100,
      } as LiteraryIntegration,
    ],
    nextAfterId: null,
  });
  vi.mocked(api.advanceLiterarySequence)
    .mockRejectedValueOnce(new Error('Resposta incerta'))
    .mockResolvedValueOnce(frame({ index: 1, revision: 2, stop: 'preparation' }));
  render(<LiterarySequencePanel bookId="book" collaborationMode="continuous" />);
  await user.click(screen.getByRole('button', { name: 'Consultar sequências registradas' }));
  await user.click(await screen.findByRole('button', { name: /Registrada · 1 de 2 capítulos/ }));
  await user.click(
    await screen.findByRole('button', { name: 'Consultar integrações aceitas do ato' }),
  );
  await user.click(screen.getByRole('combobox', { name: 'Integração para a próxima unidade' }));
  await user.click(screen.getByRole('option', { name: /Integração do ato/ }));
  await user.click(screen.getByRole('button', { name: 'Avançar sequência até a próxima decisão' }));
  await screen.findByText('Resposta incerta');
  await user.click(screen.getByRole('button', { name: 'Recuperar passo original da sequência' }));
  await screen.findByText(/Complete e aceite a preparação deste capítulo/);
  expect(vi.mocked(api.advanceLiterarySequence).mock.calls[0]?.[0]).toEqual(
    vi.mocked(api.advanceLiterarySequence).mock.calls[1]?.[0],
  );
  expect(vi.mocked(api.advanceLiterarySequence).mock.calls[0]?.[0].actIntegrationId).toBe(
    'accepted-report',
  );
});
it('switching account while scope is loading prevents the old preview from registering in the new session', async () => {
  const user = userEvent.setup();
  let release!: (value: api.SequenceScope) => void;
  vi.mocked(api.getLiterarySequenceScope).mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const view = render(<LiterarySequencePanel bookId="book" collaborationMode="continuous" />);
  await user.click(screen.getByRole('button', { name: 'Consultar capítulos para sequência' }));
  await choose(user);
  await user.click(screen.getByRole('button', { name: 'Conferir escopo e preparar prévia' }));
  actor.uid = 'other';
  view.rerender(<LiterarySequencePanel bookId="book" collaborationMode="continuous" />);
  await act(async () => {
    release({ originToken: 'a'.repeat(64), bookTitle: 'Livro', chapters, collaboration });
    await Promise.resolve();
  });
  expect(screen.queryByRole('region', { name: 'Prévia da sequência' })).not.toBeInTheDocument();
  expect(api.startLiterarySequence).not.toHaveBeenCalled();
});

it('required publication blocks sequence advance until an explicit inspection choice and keeps it in an uncertain step', async () => {
  const contract: EditorialContract = {
    schemaVersion: 1,
    fields: Object.fromEntries(
      Object.keys(editorialFields).map((key) => [key, '']),
    ) as EditorialContract['fields'],
    decisions: [],
    publicationPolicy: { version: 1, unit: 'chapter', requirePreviousPublication: true },
  };
  const user = userEvent.setup();
  render(
    <LiterarySequencePanel
      bookId="book"
      collaborationMode="continuous"
      editorialState={{ revision: 3, updatedAt: 3, contract }}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Consultar capítulos para sequência' }));
  await choose(user);
  await choose(user, 'A resposta');
  await user.click(screen.getByRole('button', { name: 'Conferir escopo e preparar prévia' }));
  await user.click(
    await screen.findByRole('button', { name: 'Registrar esta sequência com estes limites' }),
  );
  await screen.findByRole('region', { name: 'Checkpoint da sequência' });
  expect(
    screen.getByRole('button', { name: 'Avançar sequência até a próxima decisão' }),
  ).toBeDisabled();
  expect(api.advanceLiterarySequence).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Escolher inspeção de chapter-a' }));
  expect(
    screen.getByRole('button', { name: 'Avançar sequência até a próxima decisão' }),
  ).not.toBeDisabled();
  vi.mocked(api.advanceLiterarySequence).mockRejectedValueOnce(new Error('Resposta perdida'));
  await user.click(screen.getByRole('button', { name: 'Avançar sequência até a próxima decisão' }));
  await screen.findByText('Resposta perdida');
  expect(vi.mocked(api.advanceLiterarySequence).mock.calls[0]?.[0]).toMatchObject({
    admissionInspectionId: 'inspected-chapter-a',
    expectedRevision: 1,
  });
});
