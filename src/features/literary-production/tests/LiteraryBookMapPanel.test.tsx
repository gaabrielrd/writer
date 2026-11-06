import { mapCharacters } from '../model/bookMap';
import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { LiteraryBookMapPanel } from '../components/LiteraryBookMapPanel';
import type {
  BookMapData,
  BookMapItem,
  BookMapPage,
  BookMapPlan,
  BookMapResource,
} from '../model/bookMap';
import type { LiteraryReference } from '../model/planning';
const mocks = vi.hoisted(() => ({
  uid: 'author',
  invoke: vi.fn<(method: string, input: Record<string, unknown>) => Promise<BookMapPage>>(),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: mocks.uid } }) }));
vi.mock('@/shared/api/domainCallable', () => ({
  getFunctions: vi.fn(),
  httpsCallable: (_f: unknown, method: string) => (input: Record<string, unknown>) =>
    mocks.invoke(method, input).then((data) => ({ data })),
}));
vi.mock('@/shared/lib', async (original) => ({
  ...(await original<typeof import('@/shared/lib')>()),
  getFirebaseApp: vi.fn(),
}));
const base = { version: 'native-version', revision: 1 };
const ref = (
  kind: LiteraryReference['kind'],
  id: string,
  purpose: LiteraryReference['purpose'] = 'subject',
): LiteraryReference => ({
  kind,
  id,
  scopeId: 'book',
  purpose,
  sourceToken: 'a'.repeat(64),
  revision: 1,
});
function plan(
  id: string,
  title: string,
  references: LiteraryReference[],
  fields: Record<string, string> = {},
  kind = 'knowledgeState',
): BookMapPlan {
  return {
    ...base,
    id,
    resource: 'plans',
    fieldLabels: Object.fromEntries(Object.keys(fields).map((key) => [key, key])),
    plan: { kind, title, status: 'proposal', references, fields },
    sources: references.map((reference) => ({
      reference,
      available: true,
      changed: false,
      label: reference.id === 'ana' ? 'Ana' : reference.id,
    })),
  };
}
const snapshot = (): BookMapData => ({
  acts: [{ ...base, id: 'act', resource: 'acts', name: 'O início', order: 1 }],
  chapters: [
    {
      ...base,
      id: 'later',
      resource: 'chapters',
      title: 'Depois',
      order: 0,
      actId: null,
      contentMode: 'legacy',
    },
    {
      ...base,
      id: 'first',
      resource: 'chapters',
      title: 'A carta',
      order: 5,
      actId: 'act',
      contentMode: 'scenes',
    },
  ],
  events: [
    {
      ...base,
      id: 'late-event',
      resource: 'events',
      title: 'Depois no mundo',
      rank: 'a',
      dateLabel: 'Ano 2',
      description: '',
    },
    {
      ...base,
      id: 'early-event',
      resource: 'events',
      title: 'Antes no mundo',
      rank: 'B',
      dateLabel: 'Ano 20',
      description: '',
    },
  ],
  plans: [
    plan(
      'knowledge',
      'Ana descobre',
      [ref('localLore', 'ana'), ref('chapter', 'first'), ref('event', 'early-event')],
      {
        known: 'A carta chegou',
        acquired: 'Ouviu da irmã',
        realTime: 'Antes da viagem',
        apparentTime: 'Depois da viagem',
      },
    ),
    plan(
      'source-only',
      'Fonte não é trajetória',
      [ref('localLore', 'not-a-participant', 'source'), ref('chapter', 'later', 'source')],
      { known: 'Hipótese não confirmada' },
    ),
    plan(
      'brief',
      'A decisão',
      [ref('chapter', 'first')],
      { function: 'A escolha tem um custo', realTime: 'Ontem', apparentTime: 'Amanhã' },
      'chapterBrief',
    ),
  ],
});
function page(
  resource: BookMapResource,
  items: BookMapItem[] = [],
  extra: Partial<BookMapPage> = {},
): BookMapPage {
  return {
    resource,
    items,
    fence: 'f'.repeat(64),
    nextAfterId: null,
    coverage: { kind: 'root-fenced-metadata-read', manuscriptRead: false },
    ...extra,
  };
}
function setup(data = snapshot()) {
  mocks.invoke.mockImplementation((_method, input) =>
    Promise.resolve(
      page(input.resource as BookMapResource, data[input.resource as BookMapResource]),
    ),
  );
}
function tree(bookId = 'book') {
  return (
    <MemoryRouter>
      <LiteraryBookMapPanel bookId={bookId} />
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.uid = 'author';
  setup();
});
it('loads real service pages, canonical reading order, manual chronology and explicit character knowledge', async () => {
  render(tree());
  await screen.findByText('Estrutura e fichas carregadas');
  const links = screen.getAllByRole('link');
  expect(links.map((link) => link.textContent)).toEqual(['1. A carta', '2. Depois']);
  expect(links[0]).toHaveAttribute('href', '/books/book/editor/first');
  expect(screen.getByText('Hipótese não confirmada')).not.toBeVisible();
  expect(screen.getByText('A escolha tem um custo')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Cronologia real' }));
  const events = screen.getAllByRole('heading', { level: 4 });
  expect(events.map((event) => event.textContent)).toEqual(['Antes no mundo', 'Depois no mundo']);
  expect(screen.getByText('Momento real: Ano 20')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Trajetória de personagem' }));
  expect(screen.getByRole('article', { name: 'Ana descobre' })).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Trajetória editorial' })).queryByRole('article', {
      name: 'Fonte não é trajetória',
    }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Ouviu da irmã')).toBeVisible();
  expect(mocks.invoke.mock.calls.every(([method]) => method === 'readLiteraryBookMapPage')).toBe(
    true,
  );
  expect(mocks.invoke.mock.calls[1]![1].fence).toBe('f'.repeat(64));
});
it('pauses after the in-flight page and resumes the exact checkpoint without duplicate rows', async () => {
  let finish!: (page: BookMapPage) => void;
  mocks.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(tree());
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
  await userEvent.click(screen.getByRole('button', { name: 'Pausar leitura' }));
  await act(async () => {
    finish(page('acts', snapshot().acts, { nextAfterId: 'act' }));
    await Promise.resolve();
  });
  await screen.findByText('Leitura parcial pausada');
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  mocks.invoke.mockImplementationOnce(() => Promise.resolve(page('acts')));
  await userEvent.click(screen.getByRole('button', { name: 'Retomar leitura' }));
  await screen.findByText('Estrutura e fichas carregadas');
  expect(mocks.invoke.mock.calls[1]![1]).toMatchObject({
    resource: 'acts',
    afterId: 'act',
    fence: 'f'.repeat(64),
  });
  expect(screen.getAllByRole('link')).toHaveLength(2);
});
it('clears derived private rows on a failed final source check and retries from a fresh first page', async () => {
  let calls = 0;
  mocks.invoke.mockImplementation((_method, input) => {
    calls++;
    if (calls === 5) return Promise.reject(new Error('As fontes mudaram'));
    return Promise.resolve(
      page(input.resource as BookMapResource, snapshot()[input.resource as BookMapResource]),
    );
  });
  render(tree());
  await screen.findByText('As fontes mudaram');
  expect(screen.queryByText('Ana descobre')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByText('Estrutura e fichas carregadas');
  expect(mocks.invoke.mock.calls[5]![1]).toMatchObject({
    resource: 'acts',
    afterId: null,
    fence: null,
  });
});
it('does not attach an unavailable same-ID subject or expose a revoked source label', async () => {
  const data = snapshot();
  data.plans = [
    plan(
      'lost',
      'Vínculo antigo',
      [ref('chapter', 'first')],
      { function: 'Intenção histórica' },
      'chapterBrief',
    ),
  ];
  data.plans[0]!.sources[0] = {
    ...data.plans[0]!.sources[0]!,
    available: false,
    label: 'PRIVATE RECREATED NAME',
  };
  setup(data);
  render(tree());
  await screen.findByText('Estrutura e fichas carregadas');
  const chapter = screen.getByRole('heading', { name: '1. A carta' }).closest('article')!;
  expect(within(chapter).queryByText('Vínculo antigo')).not.toBeInTheDocument();
  await userEvent.click(screen.getByText('Fichas sem unidade vinculada como assunto (1)'));
  expect(screen.getByText('Intenção histórica')).toBeVisible();
  expect(screen.queryByText('PRIVATE RECREATED NAME')).not.toBeInTheDocument();
});
it('drops a pending private reply when the actor changes', async () => {
  let finish!: (page: BookMapPage) => void;
  mocks.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(tree());
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
  mocks.uid = 'other';
  setup({ acts: [], chapters: [], events: [], plans: [] });
  view.rerender(tree());
  await screen.findByText('Estrutura e fichas carregadas');
  await act(async () => {
    finish(page('acts', snapshot().acts));
    await Promise.resolve();
  });
  expect(screen.queryByText('O início')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

it('limits each read cycle without limiting book size, then resumes its precise cursor', async () => {
  mocks.invoke.mockImplementation((_method, input) => {
    const resource = input.resource as BookMapResource;
    if (resource !== 'acts') return Promise.resolve(page(resource));
    const afterId = input.afterId;
    if (afterId !== null && typeof afterId !== 'string')
      return Promise.reject(new Error('Cursor inválido'));
    const current = afterId === null ? 0 : Number(afterId.slice(4)) + 1;
    if (current === 33) return Promise.resolve(page('acts'));
    const id = 'act-' + String(current).padStart(3, '0');
    return Promise.resolve(
      page(
        'acts',
        [{ ...base, id, resource: 'acts', name: 'Ato ' + current, order: current + 1 }],
        { nextAfterId: id },
      ),
    );
  });
  render(tree());
  await screen.findByText('Leitura parcial pausada');
  expect(mocks.invoke).toHaveBeenCalledTimes(32);
  expect(
    screen.getByText('Este ciclo leu 32 páginas. Retome para continuar com as mesmas fontes.'),
  ).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Retomar leitura' }));
  await screen.findByText('Estrutura e fichas carregadas');
  expect(mocks.invoke.mock.calls[32]![1]).toMatchObject({
    resource: 'acts',
    afterId: 'act-031',
    fence: 'f'.repeat(64),
  });
  expect(screen.getByText('33 atos · 0 capítulos · 0 eventos · 0 fichas lidos.')).toBeVisible();
});

it('keeps homonyms in separate native scopes and merges scope aliases for the same character', () => {
  const local = plan('local', 'Conhecimento local', [ref('localLore', 'ana')]);
  const alias = plan('alias', 'Outra etapa da mesma Ana', [
    { ...ref('localLore', 'ana'), scopeId: null },
  ]);
  alias.sources[0]!.currentReference = ref('localLore', 'ana');
  const global = plan('global', 'Outra Ana', [{ ...ref('globalLore', 'ana'), scopeId: 'world' }]);
  const characters = mapCharacters([local, alias, global]);
  expect(characters).toHaveLength(2);
  expect(new Set(characters.map((item) => item.label)).size).toBe(2);
  expect(
    characters.find((item) => item.reference.kind === 'localLore')!.plans.map((item) => item.id),
  ).toEqual(['local', 'alias']);
  expect(characters.map((item) => item.label)).toEqual(
    expect.arrayContaining(['Ana · livro · ana', 'Ana · universo · ana']),
  );
  local.sources[0]!.available = false;
  alias.sources[0]!.available = false;
  expect(mapCharacters([local, alias, global])).toMatchObject([
    { label: 'Ana', plans: [{ id: 'global' }] },
  ]);
});

it('preserves empty acts, book-level intentions and unsequenced declared moments', async () => {
  const data = snapshot();
  data.acts.push({ ...base, resource: 'acts', id: 'empty', name: 'Sem capítulos ainda', order: 2 });
  data.plans.push(
    plan(
      'treatment',
      'A pressão do ato',
      [ref('act', 'empty')],
      { initialState: 'A cidade espera' },
      'actTreatment',
    ),
  );
  data.plans.push(
    plan(
      'overview',
      'A promessa do livro',
      [],
      { question: 'É possível confiar?' },
      'bookOverview',
    ),
  );
  setup(data);
  render(tree());
  await screen.findByText('Estrutura e fichas carregadas');
  expect(screen.getByText('É possível confiar?')).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Ato Sem capítulos ainda' })).getByText(
      'A cidade espera',
    ),
  ).toBeVisible();
  expect(screen.getByText('Este ato ainda não tem capítulos.')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Cronologia real' }));
  await userEvent.click(screen.getByText('Momentos declarados sem evento vinculado (1)'));
  expect(screen.getByText('Ontem')).toBeVisible();
  expect(screen.getByText('Amanhã')).toBeVisible();
});

it('orders a character by either native reading position or explicitly linked chronological events', async () => {
  const data = snapshot();
  data.plans[0]!.plan.references[2]!.id = 'late-event';
  data.plans.push(
    plan(
      'earlier',
      'Ana antes da carta',
      [ref('localLore', 'ana'), ref('chapter', 'later'), ref('event', 'early-event')],
      { known: 'Ainda não conhece a notícia' },
    ),
  );
  setup(data);
  render(tree());
  await screen.findByText('Estrutura e fichas carregadas');
  await userEvent.click(screen.getByRole('button', { name: 'Trajetória de personagem' }));
  const trajectory = within(screen.getByRole('region', { name: 'Trajetória editorial' }));
  expect(
    trajectory.getAllByRole('article').map((article) => article.getAttribute('aria-label')),
  ).toEqual(['Ana descobre', 'Ana antes da carta']);
  await userEvent.click(trajectory.getByRole('combobox', { name: 'Ordenar trajetória por' }));
  await userEvent.click(screen.getByRole('option', { name: 'Cronologia real' }));
  expect(
    trajectory.getAllByRole('article').map((article) => article.getAttribute('aria-label')),
  ).toEqual(['Ana antes da carta', 'Ana descobre']);
});
