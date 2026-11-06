import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiteraryIntegrationPanel } from '../components/LiteraryIntegrationPanel';
import type {
  LiteraryIntegration,
  ArchitectureSourcePreview,
} from '../services/literaryIntegrationService';
import { listLiteraryPendingOperations } from '../services/literaryRecoveryStorage';
const mocks = vi.hoisted(() => ({
  uid: 'author',
  invoke: vi.fn<(method: string, input: Record<string, unknown>) => Promise<unknown>>(),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: mocks.uid } }) }));
vi.mock('@/features/books', () => ({ listActs: () => Promise.resolve([]) }));
vi.mock('@/shared/api/domainCallable', () => ({
  getFunctions: vi.fn(),
  httpsCallable: (_f: unknown, method: string) => (input: Record<string, unknown>) =>
    mocks.invoke(method, input).then((data) => ({ data })),
}));
vi.mock('@/shared/lib', async (original) => ({
  ...(await original<typeof import('@/shared/lib')>()),
  getFirebaseApp: vi.fn(),
}));
let job: LiteraryIntegration, advances: number, generations: number;
const state = (): LiteraryIntegration => ({
  jobId: '',
  level: 'book',
  actId: null,
  audit: 'architecture',
  state: 'planning',
  chapters: 0,
  contextChapters: 0,
  units: 0,
  readUnits: 0,
  segments: 0,
  boundaries: 0,
  expectedBoundaries: 0,
  analyses: 0,
  blocking: 0,
  warnings: 0,
  suggestions: 0,
  sourceToken: 'a'.repeat(64),
  pendingRequestId: null,
  finalRequestId: null,
  authorAccepted: false,
  createdAt: 1,
  completedAt: null,
  message: null,
  coverage: {
    scope: 'book',
    wholeAct: false,
    wholeBook: false,
    verifiedUnits: 0,
    verifiedAnalyses: 0,
  },
  architecture: {
    families: ['plan', 'chapter'],
    sources: 0,
    readSources: 0,
    segments: 0,
    verifiedSources: 0,
    inventoryComplete: false,
    complete: false,
    referenceBodiesRead: false,
  },
});
const preview = (index = 0, segment = 0): ArchitectureSourcePreview => ({
  state: 'ready',
  index,
  segment,
  segmentCount: 2,
  source: {
    id: 'architecture:plan:brief',
    label: 'A intenção da carta',
    locator: { kind: 'plan', id: 'brief', arcId: null },
    format: 'canonical-json',
    text:
      segment === 0
        ? 'Intenção inicial; uma hipótese não é fato.'
        : 'Continuação integral do mesmo planejamento.',
    offsetBase: segment * 100,
  },
  editorial: {
    instruction: 'Guia vigente da obra. Não antecipe revelações.',
    documents: [
      { id: 'contract', label: 'Contrato editorial vigente', text: 'Premissa privada do livro.' },
    ],
  },
  scope: { manuscriptRead: false, wholeArchitecture: false },
});
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.uid = 'author';
  job = state();
  advances = 0;
  generations = 0;
  mocks.invoke.mockImplementation((method, input) => {
    if (method === 'startLiteraryIntegration') {
      if (typeof input.jobId !== 'string') return Promise.reject(new Error('ID inválido'));
      job = { ...state(), jobId: input.jobId };
      return Promise.resolve(structuredClone(job));
    }
    if (method === 'advanceLiteraryIntegration') {
      advances++;
      if (!job.architecture!.inventoryComplete)
        job = {
          ...job,
          architecture: { ...job.architecture!, sources: 3, inventoryComplete: advances >= 2 },
        };
      else {
        generations++;
        job = {
          ...job,
          state: 'done',
          architecture: {
            ...job.architecture!,
            readSources: 3,
            verifiedSources: 3,
            segments: 4,
            complete: true,
          },
          analyses: 5,
          finalRequestId: 'final-request',
          completedAt: 2,
        };
      }
      return Promise.resolve(structuredClone(job));
    }
    if (method === 'listLiteraryArchitectureInventory')
      return Promise.resolve({
        state: job.state,
        inventoryComplete: true,
        items:
          input.afterIndex === null
            ? [
                {
                  index: 0,
                  source: { kind: 'plan', id: 'brief', arcId: null },
                  label: 'A intenção da carta',
                  available: true,
                  read: false,
                },
              ]
            : [
                {
                  index: 2,
                  source: { kind: 'plan', id: 'other', arcId: null },
                  label: 'Outra ficha',
                  available: true,
                  read: false,
                },
              ],
        nextAfterIndex: input.afterIndex === null ? 0 : null,
      });
    if (method === 'previewLiteraryArchitectureSource')
      return Promise.resolve(preview(Number(input.index), Number(input.segment)));
    if (method === 'acceptLiteraryIntegration') {
      job = { ...job, authorAccepted: true };
      return Promise.resolve(structuredClone(job));
    }
    return Promise.reject(new Error('Unexpected request: ' + method));
  });
});
async function chooseGlobal() {
  await userEvent.click(screen.getByRole('combobox', { name: 'Cobertura do planejamento' }));
  await userEvent.click(screen.getByRole('option', { name: 'Auditoria global da arquitetura' }));
}
async function registered() {
  await chooseGlobal();
  await userEvent.click(screen.getByRole('button', { name: 'Registrar integração' }));
  await screen.findByText('Organizando fontes');
}
it('captures all-source scope, prepares a census without AI, previews exact chunks and keeps author acceptance separate', async () => {
  render(<LiteraryIntegrationPanel bookId="book" />);
  await registered();
  const input = mocks.invoke.mock.calls.find(
    ([method]) => method === 'startLiteraryIntegration',
  )![1];
  expect(input).toMatchObject({ audit: 'architecture', level: 'book', actId: null });
  expect(input).not.toHaveProperty('planIds');
  expect(screen.queryByText('Planejamento usado pela IA')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Escopo da integração' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Preparar inventário sem IA' }));
  await screen.findByText(/Inventário arquitetural percorrido/);
  expect(generations).toBe(0);
  await userEvent.click(screen.getByRole('button', { name: 'Conferir fontes da arquitetura' }));
  await userEvent.click(await screen.findByRole('button', { name: /Prévia da fonte 1/ }));
  expect(await screen.findByLabelText('Fonte enviada à auditoria')).toHaveValue(
    'Intenção inicial; uma hipótese não é fato.',
  );
  expect(screen.getByLabelText('Fonte enviada à auditoria')).toHaveAttribute('readonly');
  expect(screen.getByLabelText('Guia editorial enviado à auditoria')).toHaveValue(
    'Guia vigente da obra. Não antecipe revelações.',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Próximo trecho da fonte' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Fonte enviada à auditoria')).toHaveValue(
      'Continuação integral do mesmo planejamento.',
    ),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Trecho anterior da fonte' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Fonte enviada à auditoria')).toHaveValue(
      'Intenção inicial; uma hipótese não é fato.',
    ),
  );
  expect(generations).toBe(0);
  await userEvent.click(screen.getByRole('button', { name: 'Mais fontes da arquitetura' }));
  expect(await screen.findByRole('button', { name: /Prévia da fonte 3/ })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Retomar integração até concluir' }));
  await screen.findByText('Cobertura integrada concluída');
  expect(generations).toBe(1);
  expect(screen.getByText(/terminou sem manuscrito no escopo/)).toBeVisible();
  expect(mocks.invoke.mock.calls.some(([method]) => method === 'acceptLiteraryIntegration')).toBe(
    false,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Registrar aceite da integração' }));
  await screen.findByText(/A publicação permanece uma ação separada/);
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
});
it('a lost registration acknowledgement repeats the frozen global scope and model with the same operation identity', async () => {
  const capture = vi.fn(() => ({ version: 1, provider: 'platform', model: 'model-one' }));
  const original = mocks.invoke.getMockImplementation()!;
  let lost = true;
  mocks.invoke.mockImplementation((method, input) => {
    if (method === 'startLiteraryIntegration' && lost) {
      lost = false;
      return Promise.reject(new Error('Resposta perdida'));
    }
    return original(method, input);
  });
  render(<LiteraryIntegrationPanel bookId="book" captureGeneration={capture} />);
  await chooseGlobal();
  await userEvent.click(screen.getByRole('button', { name: 'Registrar integração' }));
  await screen.findByText('Resposta perdida');
  capture.mockReturnValue({ version: 1, provider: 'platform', model: 'model-two' });
  expect(screen.getByRole('combobox', { name: 'Cobertura do planejamento' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Recuperar o mesmo registro' }));
  await screen.findByText('Organizando fontes');
  const inputs = mocks.invoke.mock.calls
    .filter(([method]) => method === 'startLiteraryIntegration')
    .map(([, input]) => input);
  expect(inputs[1]).toEqual(inputs[0]);
  expect(inputs[1]).toMatchObject({ audit: 'architecture', generation: { model: 'model-one' } });
});
it('revoked source access clears the previously derived preview and its source list', async () => {
  render(<LiteraryIntegrationPanel bookId="book" />);
  await registered();
  await userEvent.click(screen.getByRole('button', { name: 'Conferir fontes da arquitetura' }));
  await userEvent.click(await screen.findByRole('button', { name: /Prévia da fonte 1/ }));
  await screen.findByLabelText('Fonte enviada à auditoria');
  mocks.invoke.mockRejectedValueOnce(
    Object.assign(new Error('Acesso revogado'), { code: 'functions/permission-denied' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Próximo trecho da fonte' }));
  await screen.findByText('Acesso revogado');
  expect(screen.queryByLabelText('Fonte enviada à auditoria')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Inventário da auditoria global' }),
  ).not.toBeInTheDocument();
});
it('an old actor cannot display a held source preview after the account changes', async () => {
  let finish!: (value: ArchitectureSourcePreview) => void;
  const original = mocks.invoke.getMockImplementation()!;
  mocks.invoke.mockImplementation((method, input) =>
    method === 'previewLiteraryArchitectureSource'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : original(method, input),
  );
  const view = render(<LiteraryIntegrationPanel bookId="book" />);
  await registered();
  await userEvent.click(screen.getByRole('button', { name: 'Conferir fontes da arquitetura' }));
  await userEvent.click(await screen.findByRole('button', { name: /Prévia da fonte 1/ }));
  mocks.uid = 'other';
  view.rerender(<LiteraryIntegrationPanel bookId="book" />);
  await act(async () => {
    finish(preview());
    await Promise.resolve();
  });
  expect(screen.queryByLabelText('Fonte enviada à auditoria')).not.toBeInTheDocument();
});
