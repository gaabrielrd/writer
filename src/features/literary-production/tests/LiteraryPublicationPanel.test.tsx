import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { LiteraryPublicationPanel } from '../components/LiteraryPublicationPanel';
import { editorialFields, type EditorialState } from '../model/editorial';
import type {
  ConfirmPublication,
  LiteraryPublication,
  PublicationConfirmation,
  StartPublication,
} from '../services/literaryPublicationService';
import { listLiteraryPendingOperations } from '../services/literaryRecoveryStorage';
const rpc = vi.hoisted(() => ({
  invoke: vi.fn<(name: string, input: unknown) => Promise<unknown>>(),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'author' } }) }));
vi.mock('@/shared/api/domainCallable', () => ({
  getFunctions: vi.fn(),
  httpsCallable: (_functions: unknown, name: string) => (input: unknown) =>
    rpc.invoke(name, input).then((data) => ({ data })),
}));
vi.mock('@/shared/lib', async (original) => ({
  ...(await original<typeof import('@/shared/lib')>()),
  getFirebaseApp: vi.fn(),
}));
vi.mock('../components/LiteraryReaderGuideEditor', () => ({
  LiteraryReaderGuideEditor: ({
    onWorkChange,
    onSaved,
    onPreview,
  }: {
    onWorkChange: (value: { dirty: boolean; pending: boolean }) => void;
    onSaved: () => void;
    onPreview: (id: string) => void;
  }) => (
    <>
      <button onClick={() => onWorkChange({ dirty: true, pending: false })}>
        Alterar rascunho do guia
      </button>
      <button onClick={() => onWorkChange({ dirty: false, pending: false })}>
        Descartar rascunho do guia
      </button>
      <button onClick={onSaved}>Confirmar salvamento do guia</button>
      <button onClick={() => onPreview('chapter')}>Conferir fonte do guia</button>
    </>
  ),
}));
const edition = (): LiteraryPublication => ({
  jobId: 'edition',
  progressRevision: 1,
  title: 'Livro',
  authorName: 'Autora',
  integrationId: 'integration',
  policy: 'book',
  unitId: null,
  state: 'prepared',
  phase: 'prepared',
  candidates: 1,
  verifiedCandidates: 1,
  chapterCount: 1,
  compiledChapters: 1,
  unitCount: 1,
  verifiedUnits: 1,
  verifiedChapters: 1,
  actCount: 0,
  wordCount: 10,
  removalCount: 1,
  removalHash: 'a'.repeat(64),
  manifestHash: 'b'.repeat(64),
  guideRevision: 1,
  guideCount: 1,
  verifiedGuideEntries: 0,
  guideHash: null,
  editionHash: null,
  createdAt: 1,
  preparedAt: 2,
  publishedAt: null,
  revisionId: 'edition',
  publicationUrl: null,
  publicationConfirmed: false,
  message: null,
});
let current: LiteraryPublication, confirmed: boolean;
const confirmation = (currentPointerMatches = true): PublicationConfirmation => ({
  publicationConfirmed: true,
  bookId: 'book',
  revisionId: current.jobId,
  publishedAt: 20,
  publicationUrl: '/read/book',
  editionHash: 'e'.repeat(64),
  manifestHash: current.manifestHash!,
  guideHash: current.guideHash!,
  removalHash: current.removalHash!,
  chapterCount: 1,
  guideCount: 1,
  removalCount: 1,
  currentPointerMatches,
});
const commands = <T,>(name: string) =>
  rpc.invoke.mock.calls.filter(([method]) => method === name).map(([, input]) => input as T);
const firstCommand = <T,>(name: string) => {
  const value = commands<T>(name)[0];
  if (!value) throw new Error('Pedido ausente: ' + name);
  return value;
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  current = edition();
  confirmed = false;
  rpc.invoke.mockImplementation((name, raw) => {
    const input = raw as { jobId?: string; afterIndex?: number | null; afterId?: string | null };
    if (name === 'listLiteraryPublications')
      return Promise.resolve({ items: [structuredClone(current)], nextAfterId: null });
    if (name === 'listLiteraryIntegrations')
      return Promise.resolve({
        items: [
          {
            jobId: 'integration',
            level: 'book',
            state: 'done',
            authorAccepted: true,
            sourceToken: 'f'.repeat(64),
            unresolvedBlocking: 0,
            blocking: 0,
            chapters: 1,
            completedAt: 1,
            createdAt: 1,
          },
        ],
        nextAfterId: null,
      });
    if (name === 'listLiteraryReferences') return Promise.resolve({ items: [], nextAfterId: null });
    if (name === 'getLiteraryPublication') return Promise.resolve(structuredClone(current));
    if (name === 'startLiteraryPublication') {
      current = { ...edition(), jobId: input.jobId! };
      return Promise.resolve(structuredClone(current));
    }
    if (name === 'startLiteraryPublicationGuideVerification') {
      current = { ...current, state: 'checkingGuide', progressRevision: 2 };
      return Promise.resolve(structuredClone(current));
    }
    if (name === 'advanceLiteraryPublicationGuide') {
      current = {
        ...current,
        state: 'verified',
        guideHash: 'c'.repeat(64),
        verifiedGuideEntries: 1,
        progressRevision: 3,
      };
      return Promise.resolve(structuredClone(current));
    }
    if (name === 'advanceLiteraryPublication') return Promise.resolve(structuredClone(current));
    if (name === 'listLiteraryPublicationManifest')
      return Promise.resolve({
        items: [
          {
            chapterId: input.afterIndex === 0 ? 'second' : 'chapter',
            title: input.afterIndex === 0 ? 'Segundo' : 'A carta',
            index: input.afterIndex === 0 ? 1 : 0,
            actId: null,
            compiled: true,
          },
        ],
        nextAfterIndex: input.afterIndex === 0 ? null : 0,
      });
    if (name === 'listLiteraryPublicationRemovals')
      return Promise.resolve({
        items: [
          {
            chapterId: input.afterId ? 'old-second' : 'old',
            title: input.afterId ? 'Antigo segundo' : 'Antigo primeiro',
            previousRevisionId: 'previous',
          },
        ],
        nextAfterId: input.afterId ? null : 'old',
      });
    if (name === 'getLiteraryPublicationChapter')
      return Promise.resolve({
        chapterId: 'chapter',
        title: 'A carta',
        content: '<p>Texto preparado.</p>',
        text: 'Texto preparado.',
        projectionHash: 'd'.repeat(64),
      });
    if (name === 'confirmLiteraryPublication') {
      current = {
        ...current,
        state: 'published',
        publicationConfirmed: true,
        publicationUrl: '/read/book',
        publishedAt: 20,
      };
      return Promise.resolve(confirmation());
    }
    if (name === 'getLiteraryPublicationConfirmation')
      return Promise.resolve(
        confirmed ? { state: 'confirmed', result: confirmation(false) } : { state: 'unconfirmed' },
      );
    if (name === 'getLiteraryOperation')
      return Promise.resolve({
        state: 'confirmed',
        kind: 'publicationConfirm',
        id: current.jobId,
        revision: 1,
        updatedAt: 20,
        noOp: false,
      });
    return Promise.reject(new Error('Método inesperado: ' + name));
  });
});
const unconfiguredEditorial = (): EditorialState => ({
  revision: 0,
  updatedAt: null,
  contract: {
    schemaVersion: 1,
    fields: Object.fromEntries(
      Object.keys(editorialFields).map((key) => [key, '']),
    ) as EditorialState['contract']['fields'],
    decisions: [],
  },
});
const mount = (editorialState: EditorialState | null = unconfiguredEditorial()) => {
  const onPublicationChange = vi.fn();
  render(
    <MemoryRouter>
      <LiteraryPublicationPanel
        bookId="book"
        editorialState={editorialState}
        onPublicationChange={onPublicationChange}
      />
    </MemoryRouter>,
  );
  return onPublicationChange;
};
const open = async () =>
  userEvent.click(await screen.findByRole('button', { name: /^Abrir edição de / }));
const choose = async (label: string, name: string | RegExp) => {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.click(await screen.findByRole('option', { name }));
};
const authorize = async () => {
  for (const label of [
    'Conferi o texto integral preparado',
    'Conferi os campos públicos e os limites de revelação do guia',
    'Conferi os capítulos que saem desta edição',
    'Autorizo tornar esta edição pública',
  ])
    await choose(label, 'Confirmo');
};
const verified = () => {
  current = { ...current, state: 'verified', guideHash: 'c'.repeat(64), verifiedGuideEntries: 1 };
};

it('refreshes the exact edition after a guide save, previews its frozen source and reopens the guide explicitly', async () => {
  const original = rpc.invoke.getMockImplementation();
  if (!original) throw new Error('Transporte indisponível');
  rpc.invoke.mockImplementation((name, input) => {
    if (name === 'reopenLiteraryPublicationGuide') {
      current = { ...current, state: 'prepared', guideHash: null };
      return Promise.resolve(structuredClone(current));
    }
    return original(name, input);
  });
  verified();
  mount();
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Conferir fonte do guia' }));
  await screen.findByText('Texto preparado.');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar salvamento do guia' }));
  await waitFor(() => expect(commands('getLiteraryPublication')).toHaveLength(2));
  await userEvent.click(screen.getByRole('button', { name: 'Reabrir guia para editar' }));
  await screen.findByRole('button', { name: 'Conferir guia e limites de revelação' });
  expect(commands('reopenLiteraryPublicationGuide')).toEqual([
    { target: { kind: 'book', id: 'book' }, jobId: 'edition' },
  ]);
  expect(commands('confirmLiteraryPublication')).toEqual([]);
});

it('paginates editions and accepted integrations, refreshes a checkpoint and cancels only the selected edition', async () => {
  const original = rpc.invoke.getMockImplementation();
  if (!original) throw new Error('Transporte indisponível');
  let pages = 0,
    integrations = 0;
  rpc.invoke.mockImplementation((name, input) => {
    if (name === 'listLiteraryPublications')
      return Promise.resolve(
        pages++ === 0
          ? { items: [current], nextAfterId: 'edition' }
          : { items: [], nextAfterId: null },
      );
    if (name === 'listLiteraryIntegrations')
      return Promise.resolve({
        items: [],
        nextAfterId: integrations++ === 0 ? 'integration' : null,
      });
    if (name === 'cancelLiteraryPublication') {
      current = { ...current, state: 'canceled' };
      return Promise.resolve(structuredClone(current));
    }
    return original(name, input);
  });
  mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Mais edições' }));
  await userEvent.click(screen.getByRole('button', { name: 'Mais integrações' }));
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar integrações' }));
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Consultar checkpoint' }));
  await waitFor(() => expect(commands('getLiteraryPublication')).toHaveLength(2));
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar esta edição' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Cancelar esta edição' })).not.toBeInTheDocument(),
  );
  expect(commands('cancelLiteraryPublication')).toEqual([
    { target: { kind: 'book', id: 'book' }, jobId: 'edition' },
  ]);
  expect(commands('confirmLiteraryPublication')).toEqual([]);
});
it('a prepared manuscript remains unpublished until guide verification and all four explicit final confirmations', async () => {
  mount();
  await open();
  expect(screen.queryByRole('button', { name: 'Publicar esta edição' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Abrir leitor' })).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Conferir guia e limites de revelação' }),
  );
  await screen.findByRole('button', { name: 'Publicar esta edição' });
  expect(screen.getByRole('button', { name: 'Publicar esta edição' })).toBeDisabled();
  expect(commands('confirmLiteraryPublication')).toHaveLength(0);
  await authorize();
  await userEvent.click(screen.getByRole('button', { name: 'Publicar esta edição' }));
  await screen.findByText('Edição pública confirmada no servidor.');
  expect(firstCommand<ConfirmPublication>('confirmLiteraryPublication')).toMatchObject({
    target: { kind: 'book', id: 'book' },
    expectedManifestHash: 'b'.repeat(64),
    expectedGuideHash: 'c'.repeat(64),
    expectedRemovalHash: 'a'.repeat(64),
    checks: {
      wholeTextChecked: true,
      guideChecked: true,
      removalsChecked: true,
      authorizePublicRelease: true,
    },
  });
  expect(screen.getByRole('link', { name: 'Abrir leitor' })).toHaveAttribute('href', '/read/book');
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
});
it('updated edition hashes invalidate earlier acknowledgements and an unsaved guide blocks release', async () => {
  verified();
  mount();
  await open();
  await authorize();
  expect(screen.getByRole('button', { name: 'Publicar esta edição' })).not.toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Alterar rascunho do guia' }));
  expect(screen.getByRole('button', { name: 'Publicar esta edição' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Descartar rascunho do guia' }));
  current = { ...current, guideHash: 'd'.repeat(64) };
  await userEvent.click(screen.getByRole('button', { name: 'Consultar checkpoint' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Publicar esta edição' })).toBeDisabled(),
  );
  expect(commands('confirmLiteraryPublication')).toHaveLength(0);
});
it('lost confirmation is inspected without another release, and historical recovery does not claim republication', async () => {
  verified();
  mount();
  await open();
  await authorize();
  rpc.invoke.mockRejectedValueOnce(new Error('Resposta perdida'));
  await userEvent.click(screen.getByRole('button', { name: 'Publicar esta edição' }));
  await screen.findByText('Resposta perdida');
  expect(listLiteraryPendingOperations('author', 'book')).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar confirmação pública' }));
  await screen.findByText(/Publicação ainda sem confirmação/);
  expect(commands('confirmLiteraryPublication')).toHaveLength(1);
  confirmed = true;
  current = { ...current, state: 'published' };
  await userEvent.click(screen.getByRole('button', { name: 'Consultar confirmação pública' }));
  await screen.findByText('Confirmação recuperada sem republicar.');
  expect(
    screen.getByText(/Confirmação histórica recuperada; a edição não foi republicada/),
  ).toBeInTheDocument();
  expect(commands('confirmLiteraryPublication')).toHaveLength(1);
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
});
it('a repeated checkpoint stops the processing loop instead of certifying completion or calling indefinitely', async () => {
  current = { ...current, state: 'compiling', phase: 'building' };
  mount();
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Continuar processamento' }));
  await screen.findByText('O checkpoint não avançou. Consulte o estado antes de continuar.');
  expect(commands('advanceLiteraryPublication')).toHaveLength(1);
  expect(commands('confirmLiteraryPublication')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Continuar processamento' })).not.toBeDisabled();
});
it('uncertain preparation retries the same job and reviewed integration without a second intent or plaintext journal', async () => {
  mount();
  await screen.findByRole('button', { name: /^Abrir edição de / });
  fireEvent.change(screen.getByLabelText('Nome público do autor'), {
    target: { value: 'Autora escolhida' },
  });
  await choose('Integração aceita', /^Livro · 1 capítulo/);
  for (const label of [
    'Conferi o texto final da unidade',
    'Conferi a ordem e a navegação',
    'Autorizo preparar esta edição',
  ])
    await choose(label, 'Confirmo');
  rpc.invoke.mockRejectedValueOnce(new Error('Resposta perdida'));
  await userEvent.click(screen.getByRole('button', { name: 'Preparar manifesto' }));
  await screen.findByText('Resposta perdida');
  const first = firstCommand<StartPublication>('startLiteraryPublication');
  expect(JSON.stringify(listLiteraryPendingOperations('author', 'book'))).not.toContain(
    'Autora escolhida',
  );
  expect(screen.getByLabelText('Nome público do autor')).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Repetir a mesma preparação' }));
  await waitFor(() => expect(commands('startLiteraryPublication')).toHaveLength(2));
  await screen.findByRole('button', { name: 'Conferir guia e limites de revelação' });
  expect(commands('startLiteraryPublication')).toEqual([first, first]);
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
  expect(commands('confirmLiteraryPublication')).toHaveLength(0);
});
it('the frozen text and removals can be inspected through all pages without hiding the previous edition removals', async () => {
  mount();
  await open();
  await screen.findByText('Sai desta edição: Antigo primeiro');
  await userEvent.click(screen.getByRole('button', { name: 'Mais remoções' }));
  await screen.findByText('Sai desta edição: Antigo segundo');
  await userEvent.click(screen.getByRole('button', { name: 'Mais capítulos do manifesto' }));
  await screen.findByRole('button', { name: 'Conferir texto de Segundo' });
  await userEvent.click(screen.getByRole('button', { name: 'Conferir texto de A carta' }));
  await screen.findByRole('heading', { name: 'Texto preparado · A carta' });
  expect(screen.getByLabelText('Texto da fonte para copiar citações')).toHaveValue(
    'Texto preparado.',
  );
  expect(commands('confirmLiteraryPublication')).toHaveLength(0);
});

it('keeps the setup intact and requires an explicit choice of the saved contract unit', async () => {
  const editorial = unconfiguredEditorial();
  editorial.revision = 3;
  editorial.contract.publicationPolicy = { version: 1, unit: 'chapter' };
  mount(editorial);
  await screen.findByText(/Unidade conferida no contrato/);
  await userEvent.type(screen.getByLabelText('Nome público do autor'), 'Nome preservado');
  expect(screen.getByLabelText('Política de publicação')).toHaveTextContent('Livro inteiro');
  expect(screen.getByRole('button', { name: 'Preparar manifesto' })).toBeDisabled();
  expect(commands('startLiteraryPublication')).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Usar unidade do contrato: Capítulo' }));
  await screen.findByLabelText('Capítulo final da edição');
  expect(screen.getByLabelText('Nome público do autor')).toHaveValue('Nome preservado');
  expect(commands('startLiteraryPublication')).toHaveLength(0);
});
it('unavailable contract blocks only a new preparation and keeps historical editions inspectable', async () => {
  mount(null);
  await screen.findByText(/Contrato ainda indisponível/);
  expect(screen.getByRole('button', { name: 'Preparar manifesto' })).toBeDisabled();
  await open();
  await screen.findByRole('button', { name: 'Conferir guia e limites de revelação' });
  expect(commands('startLiteraryPublication')).toHaveLength(0);
});
