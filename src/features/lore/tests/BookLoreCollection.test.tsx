import { beforeEach, expect, it, vi } from 'vitest';
import { mockMatchMedia } from '@/test/matchMedia';
import { act, renderHook, renderWithProviders, screen, waitFor, within } from '@/test/render';
import { StrictMode } from 'react';
import { BookLoreAuthoring } from '../components/BookLoreAuthoring';
import { BookLoreInlineDetails } from '../components/BookLoreInlineDetails';
import { useBookLoreCollection } from '../hooks/useBookLoreCollection';
import { chooseDropdown } from '@/test/dropdown';
import { Dialog, Button } from '@/shared/ui';
import { LoreCollection, LoreTab } from '../components/LoreTab';
import type { Book } from '@/features/books';
import type { BookLoreSummary } from '../model/bookLorePresentation';
import type { BookLoreEditSource } from '../services/bookLoreWritePlan';
import type { BookLoreCreationEditorProps } from '../components/BookLoreCreationEditor';
import type { BookLoreManualEditorProps } from '../components/BookLoreManualEditor';
import type { BookLoreRemovalDialogProps } from '../components/BookLoreRemovalDialog';
import type { BookLoreRemovalSelectionDialogProps } from '../components/BookLoreRemovalSelectionDialog';
import type { BookLoreVisibilitySelectionDialogProps } from '../components/BookLoreVisibilitySelectionDialog';

const s = vi.hoisted(() => ({
  actor: { uid: 'author', displayName: '' },
  user: { uid: 'author' },
  listSummaries: vi.fn<(bookId: string) => Promise<readonly BookLoreSummary[]>>(),
  capture:
    vi.fn<(bookId: string, id: string, token?: string) => Promise<BookLoreEditSource | null>>(),
  reads: [] as unknown[],
  create: vi.fn<(p: BookLoreCreationEditorProps) => void>(),
  edit: vi.fn<(p: BookLoreManualEditorProps) => void>(),
  remove: vi.fn<(p: BookLoreRemovalDialogProps) => void>(),
  removeSelection: vi.fn<(p: BookLoreRemovalSelectionDialogProps) => void>(),
  visibility: vi.fn<(p: BookLoreVisibilitySelectionDialogProps) => void>(),
  recovery: vi.fn<(kind: string, bookId: string) => void>(),
  legacyList: vi.fn(),
  legacyCreate: vi.fn(),
  legacyUpdate: vi.fn(),
  legacyDelete: vi.fn(),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: s.user }) }));
vi.mock('../services/bookLoreEditService', () => ({ currentBookLoreActor: () => s.actor }));
vi.mock('../services/bookLoreReadService', () => ({
  bookLoreReadSession(current: () => boolean, options: unknown) {
    const actor = s.actor;
    const guard = () => {
      if (actor !== s.actor || !current()) throw Error('context changed');
    };
    s.reads.push(options);
    return {
      actor,
      guard,
      async listSummaries(bookId: string) {
        guard();
        const r = await s.listSummaries(bookId);
        guard();
        return r;
      },
      async capture(...args: Parameters<typeof s.capture>) {
        guard();
        const r = await s.capture(...args);
        guard();
        return r;
      },
    };
  },
}));
vi.mock('../services/loreService', () => ({
  listLoreEntities: s.legacyList,
  createLoreEntity: s.legacyCreate,
  updateLoreEntity: s.legacyUpdate,
  deleteLoreEntity: s.legacyDelete,
  subscribeLoreEntities: (_scope: unknown, changed: (rows: unknown[]) => void) => {
    changed([]);
    return () => {};
  },
}));
function Leaf({
  name,
  onClose,
  onApply,
}: {
  name: string;
  onClose: () => void;
  onApply?: () => void;
}) {
  return (
    <Dialog
      open
      title={name}
      onClose={onClose}
      footer={<Button onClick={onClose}>Fechar tentativa</Button>}
    >
      {onApply && <Button onClick={onApply}>Confirmar no fluxo nativo</Button>}
    </Dialog>
  );
}
vi.mock('../components/BookLoreCreationEditor', () => ({
  BookLoreCreationEditor: (p: BookLoreCreationEditorProps) => {
    s.create(p);
    return (
      <Leaf name="Criação nativa" onClose={p.onClose} onApply={() => p.onCreated?.('new-id')} />
    );
  },
}));
vi.mock('../components/BookLoreManualEditor', () => ({
  BookLoreManualEditor: (p: BookLoreManualEditorProps) => {
    s.edit(p);
    return <Leaf name="Edição nativa" onClose={p.onClose} onApply={p.onApplied} />;
  },
}));
vi.mock('../components/BookLoreRemovalDialog', () => ({
  BookLoreRemovalDialog: (p: BookLoreRemovalDialogProps) => {
    s.remove(p);
    return (
      <Leaf name="Retirada nativa" onClose={p.onClose} onApply={() => p.onRemoved?.(p.loreId)} />
    );
  },
}));
vi.mock('../components/BookLoreRemovalSelectionDialog', () => ({
  BookLoreRemovalSelectionDialog: (p: BookLoreRemovalSelectionDialogProps) => {
    s.removeSelection(p);
    return (
      <Leaf
        name="Retirada da seleção nativa"
        onClose={p.onClose}
        onApply={() =>
          p.onCompleted?.([p.targets?.[0]?.loreId ?? 'arthur'], {
            phase: 'partial',
            total: p.targets?.length ?? 2,
            conflicts: 1,
            cancelled: 0,
          })
        }
      />
    );
  },
}));
vi.mock('../components/BookLoreVisibilitySelectionDialog', () => ({
  BookLoreVisibilitySelectionDialog: (p: BookLoreVisibilitySelectionDialogProps) => {
    s.visibility(p);
    return (
      <Leaf
        name="Visibilidade nativa"
        onClose={p.onClose}
        onApply={() =>
          p.onCompleted?.(['arthur'], {
            phase: 'complete',
            total: 2,
            value: p.value ?? false,
            applied: 1,
            unchanged: 1,
            unchangedIds: ['camelot'],
            conflicts: 0,
            cancelled: 0,
          })
        }
      />
    );
  },
}));
vi.mock('../components/BookLoreRecoveries', () => ({
  BookLoreRecoveries: (p: { bookId: string; onSelect: (write: string, lore: string) => void }) => {
    s.recovery('edit', p.bookId);
    return (
      <Button onClick={() => p.onSelect('write-edit', 'arthur')}>Retomar edição fixture</Button>
    );
  },
}));
vi.mock('../components/BookLoreCreationRecoveries', () => ({
  BookLoreCreationRecoveries: (p: { bookId: string; onSelect: (write: string) => void }) => {
    s.recovery('create', p.bookId);
    return <Button onClick={() => p.onSelect('write-create')}>Retomar criação fixture</Button>;
  },
}));
vi.mock('../components/BookLoreRemovalRecoveries', () => ({
  BookLoreRemovalRecoveries: (p: {
    bookId: string;
    onSelect: (write: string, lore: string) => void;
  }) => {
    s.recovery('remove', p.bookId);
    return (
      <Button onClick={() => p.onSelect('write-remove', 'missing-entity')}>
        Retomar retirada fixture
      </Button>
    );
  },
}));
vi.mock('../components/BookLoreRemovalSelectionRecoveries', () => ({
  BookLoreRemovalSelectionRecoveries: (p: { bookId: string; onSelect: (id: string) => void }) => {
    s.recovery('remove-selection', p.bookId);
    return <Button onClick={() => p.onSelect('selection-remove')}>Retomar seleção fixture</Button>;
  },
}));
vi.mock('../components/BookLoreVisibilitySelectionRecoveries', () => ({
  BookLoreVisibilitySelectionRecoveries: (p: {
    bookId: string;
    onSelect: (id: string) => void;
  }) => {
    s.recovery('visibility', p.bookId);
    return (
      <Button onClick={() => p.onSelect('selection-visibility')}>
        Retomar visibilidade fixture
      </Button>
    );
  },
}));
function sources(bookId = 'book'): BookLoreEditSource[] {
  return [
    {
      bookId,
      id: 'arthur',
      sourceToken: 'a'.repeat(64),
      data: {
        name: 'Arthur',
        aliases: ['Pendragon'],
        category: 'character',
        summary: 'Rei',
        details: 'Ficha completa',
        isPublic: true,
      },
    },
    {
      bookId,
      id: 'camelot',
      sourceToken: 'b'.repeat(64),
      data: { name: 'Camelot', category: 'location', summary: 'Capital' },
    },
  ];
}
function summaries(bookId = 'book'): BookLoreSummary[] {
  return sources(bookId).map((source) => ({
    bookId,
    id: source.id,
    sourceToken: source.sourceToken,
    name: source.data.name as string,
    category: source.data.category as BookLoreSummary['category'],
    aliases: (source.data.aliases ?? []) as string[],
    summary: (source.data.summary ?? '') as string,
    isPublic: source.data.isPublic === true,
    relationCount: (source.data.relations as unknown[] | undefined)?.length ?? 0,
  }));
}
beforeEach(() => {
  vi.clearAllMocks();
  s.actor = { uid: 'author', displayName: '' };
  s.user = { uid: 'author' };
  s.reads = [];
  s.listSummaries.mockImplementation((bookId: string) => Promise.resolve(summaries(bookId)));
  s.capture.mockImplementation((bookId: string, id: string) =>
    Promise.resolve(sources(bookId).find((e) => e.id === id) ?? null),
  );
});
async function show(props: Partial<Parameters<typeof LoreCollection>[0]> = {}) {
  const r = renderWithProviders(<LoreCollection scope="book" {...props} />);
  await screen.findByText('Arthur');
  return r;
}
async function list(props: Partial<Parameters<typeof LoreCollection>[0]> = {}) {
  const r = await show(props);
  await r.user.click(screen.getByRole('button', { name: 'Visualização em lista' }));
  return r;
}
const bar = () => screen.getByRole('region', { name: 'Ações da seleção' });
const all = () => screen.getByRole('checkbox', { name: 'Selecionar todas as entidades exibidas' });
const last = <T,>(mock: { mock: { calls: [T][] } }): T => mock.mock.calls.at(-1)![0];
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}

it.each(['book', { kind: 'book' as const, id: 'book' }])(
  'book scope %j lists summaries with C1/v2 without legacy writers and missing consent stays private',
  async (scope) => {
    await show({ scope });
    expect(s.listSummaries).toHaveBeenCalledWith('book');
    expect(s.capture).not.toHaveBeenCalled();
    expect(s.reads).toEqual([{ tokenVersion: 2 }]);
    expect(screen.getAllByText('Privado')).toHaveLength(1);
    expect(s.legacyList).not.toHaveBeenCalled();
    expect(s.legacyCreate).not.toHaveBeenCalled();
    expect(s.legacyUpdate).not.toHaveBeenCalled();
    expect(s.legacyDelete).not.toHaveBeenCalled();
  },
);
it('preserves filtered selection, category counts and grid/list switches', async () => {
  const { user } = await list();
  await user.click(all());
  expect(bar()).toHaveTextContent('2 selecionadas');
  await user.type(screen.getByRole('textbox', { name: 'Buscar no compêndio' }), 'Pendragon');
  expect(screen.queryByRole('region', { name: 'Ações da seleção' })).not.toBeInTheDocument();
  await user.click(all());
  expect(bar()).toHaveTextContent('1 selecionada');
  await user.clear(screen.getByRole('textbox', { name: 'Buscar no compêndio' }));
  await user.click(screen.getByRole('button', { name: /Locais/ }));
  expect(screen.queryByRole('checkbox', { name: 'Selecionar Arthur' })).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Selecionar Camelot' })).not.toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Visualização em grid' }));
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Ver Ficha' })).toHaveLength(1);
});
it('reopens a fiche only after the same C1 token is reauthorized and passes it to the full drawer', async () => {
  const pending = deferred<BookLoreEditSource>();
  s.capture.mockReturnValueOnce(pending.promise);
  const { user } = await list();
  await user.click(screen.getByRole('button', { name: 'Ver ficha de Arthur' }));
  expect(screen.getByText('Conferindo a ficha completa...')).toBeInTheDocument();
  expect(screen.queryByText('Ficha completa')).not.toBeInTheDocument();
  expect(s.capture).toHaveBeenCalledWith('book', 'arthur', 'a'.repeat(64));
  await act(async () => {
    pending.resolve(sources()[0]!);
    await pending.promise;
  });
  expect(await screen.findByText('Ficha completa')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Editar Ficha' }));
  expect(last(s.edit)).toMatchObject({ bookId: 'book', loreId: 'arthur' });
});
it('an invalidated read keeps old private details hidden and retries the original token', async () => {
  s.capture.mockRejectedValueOnce(Error('Origem alterada'));
  const { user } = await list();
  await user.click(screen.getByRole('button', { name: 'Ver ficha de Arthur' }));
  const error = await screen.findByText('Origem alterada');
  await waitFor(() => expect(error.closest('[tabindex]')).toHaveFocus());
  expect(screen.queryByText('Ficha completa')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByText('Ficha completa');
  expect(s.capture.mock.calls.every((c) => c[2] === 'a'.repeat(64))).toBe(true);
});
it('all singular actions enter native hosts with the original C1 identifiers and full mention choices', async () => {
  const { user } = await list({
    relatedEntities: [
      {
        id: 'universe:world:one',
        name: 'Global',
        category: 'other',
        summary: '',
        aliases: [],
        universeId: 'world',
        details: '',
        relations: [],
        isPublic: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });
  await user.click(screen.getByRole('button', { name: 'Nova Entidade' }));
  expect(last(s.create)).toMatchObject({ bookId: 'book', open: true });
  expect(last(s.create).entities?.map((e: { id: string }) => e.id)).toEqual([
    'arthur',
    'camelot',
    'universe:world:one',
  ]);
  await user.click(screen.getByRole('button', { name: 'Fechar tentativa' }));
  await user.click(screen.getByRole('button', { name: 'Editar Arthur' }));
  expect(last(s.edit)).toMatchObject({
    bookId: 'book',
    loreId: 'arthur',
    resumeWriteId: undefined,
  });
  await user.click(screen.getByRole('button', { name: 'Fechar tentativa' }));
  await user.click(screen.getByRole('button', { name: 'Excluir Arthur' }));
  expect(last(s.remove)).toMatchObject({
    bookId: 'book',
    loreId: 'arthur',
    sourceToken: 'a'.repeat(64),
    entityName: 'Arthur',
  });
  expect(s.legacyCreate).not.toHaveBeenCalled();
  expect(s.legacyUpdate).not.toHaveBeenCalled();
  expect(s.legacyDelete).not.toHaveBeenCalled();
});
it('closing a bulk choice preserves selection and restores its stable opener', async () => {
  const { user } = await list();
  await user.click(all());
  const opener = within(bar()).getByRole('button', { name: 'Alterar visibilidade' });
  await user.click(opener);
  expect(screen.getByRole('button', { name: 'Revisar seleção' })).toBeDisabled();
  await chooseDropdown(user, screen.getByLabelText('Nova visibilidade'), 'Privado');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(opener).toHaveFocus());
  expect(all()).toBeChecked();
  expect(s.visibility).not.toHaveBeenCalled();
});
it('freezes all 53 original targets before choosing visibility without a page-sized cap', async () => {
  s.listSummaries.mockResolvedValueOnce(
    Array.from({ length: 53 }, (_, i) => ({
      ...summaries()[0]!,
      id: 'id-' + i,
      name: 'Name ' + i,
      category: 'other',
    })),
  );
  const { user } = renderWithProviders(<LoreCollection scope="book" />);
  await screen.findByText('Name 0');
  await user.click(screen.getByRole('button', { name: 'Visualização em lista' }));
  await user.click(all());
  await user.click(within(bar()).getByRole('button', { name: 'Alterar visibilidade' }));
  await chooseDropdown(user, screen.getByLabelText('Nova visibilidade'), 'Público');
  expect(s.visibility).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Revisar seleção' }));
  expect(last(s.visibility).targets).toHaveLength(53);
  expect(last(s.visibility).targets).toContainEqual({
    loreId: 'id-52',
    sourceToken: 'a'.repeat(64),
  });
  expect(last(s.visibility).value).toBe(true);
  expect(Object.isFrozen(last(s.visibility).targets)).toBe(true);
});
it('partial removal rereads current data and keeps only failed remaining IDs selected', async () => {
  const changed = vi.fn(),
    { user } = await list({ onEntitiesChanged: changed });
  await user.click(all());
  await user.click(within(bar()).getByRole('button', { name: 'Excluir' }));
  expect(last(s.removeSelection).targets).toEqual(
    sources().map((e) => ({ loreId: e.id, sourceToken: e.sourceToken })),
  );
  s.listSummaries.mockResolvedValueOnce(summaries().slice(1));
  await user.click(screen.getByRole('button', { name: 'Confirmar no fluxo nativo' }));
  await waitFor(() => expect(s.listSummaries).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Fechar tentativa' }));
  await waitFor(() =>
    expect(screen.queryByRole('checkbox', { name: 'Selecionar Arthur' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('checkbox', { name: 'Selecionar Camelot' })).toBeChecked();
  expect(bar()).toHaveTextContent('1 selecionada');
  expect(changed).toHaveBeenCalledOnce();
});
it('visibility completion separates applied/unchanged and displays a fresh value rather than historical desired value', async () => {
  const { user } = await list();
  await user.click(all());
  await user.click(within(bar()).getByRole('button', { name: 'Alterar visibilidade' }));
  await chooseDropdown(user, screen.getByLabelText('Nova visibilidade'), 'Público');
  await user.click(screen.getByRole('button', { name: 'Revisar seleção' }));
  const fresh = summaries();
  fresh[0] = { ...fresh[0]!, isPublic: false };
  s.listSummaries.mockResolvedValueOnce(fresh);
  await user.click(screen.getByRole('button', { name: 'Confirmar no fluxo nativo' }));
  await waitFor(() => expect(s.listSummaries).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole('button', { name: 'Fechar tentativa' }));
  await waitFor(() => expect(screen.getAllByText('Privado')).toHaveLength(2));
  expect(screen.queryByRole('region', { name: 'Ações da seleção' })).not.toBeInTheDocument();
  expect(screen.getByText(/Alterações aplicadas: 1. Sem mudança: 1./)).toBeInTheDocument();
});
it.each([
  ['edição', 'edit', 'write-edit', 'arthur'],
  ['criação', 'create', 'write-create', undefined],
  ['retirada', 'remove', 'write-remove', 'missing-entity'],
  ['seleção', 'removeSelection', 'selection-remove', undefined],
  ['visibilidade', 'visibility', 'selection-visibility', undefined],
] as const)(
  'recovery %s remains reachable independently of the source list',
  async (label, which, id, lore) => {
    s.listSummaries.mockRejectedValueOnce(Error('Lista indisponível'));
    const { user } = renderWithProviders(<LoreCollection scope="book" />);
    await screen.findByText('Lista indisponível');
    await user.click(screen.getByRole('button', { name: 'Retomadas' }));
    expect(s.recovery.mock.calls.map((c) => c[0])).toEqual([
      'edit',
      'create',
      'remove',
      'remove-selection',
      'visibility',
    ]);
    await user.click(screen.getByRole('button', { name: 'Retomar ' + label + ' fixture' }));
    const p: {
      bookId: string;
      resumeWriteId?: string;
      resumeSelectionId?: string;
      targets?: unknown;
      value?: boolean;
      loreId?: string;
    } = s[which].mock.calls.at(-1)![0];
    expect(p.bookId).toBe('book');
    if (which === 'removeSelection' || which === 'visibility') {
      expect(p.resumeSelectionId).toBe(id);
      expect(p.targets).toBeUndefined();
      if (which === 'visibility') expect(p.value).toBeUndefined();
    } else {
      expect(p.resumeWriteId).toBe(id);
      if (lore) expect(p.loreId).toBe(lore);
    }
  },
);
it('list errors clear private rows and can retry without a legacy read', async () => {
  s.listSummaries.mockRejectedValueOnce(Error('Sem conexão'));
  const { user } = renderWithProviders(<LoreCollection scope="book" />);
  await screen.findByText('Sem conexão');
  expect(screen.queryByText('Arthur')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByText('Arthur');
  expect(s.legacyList).not.toHaveBeenCalled();
});
it('book switch drops old late sources and removes portals from the previous workspace', async () => {
  const pending = deferred<readonly BookLoreSummary[]>();
  s.listSummaries.mockReturnValueOnce(pending.promise);
  const slot = document.createElement('div');
  document.body.append(slot);
  const { rerender, unmount } = renderWithProviders(
    <LoreCollection scope="book" actionsContainer={slot} />,
  );
  await waitFor(() => expect(s.listSummaries).toHaveBeenCalledWith('book'));
  rerender(<LoreCollection scope="other" actionsContainer={slot} />);
  await screen.findByText('Arthur');
  await act(async () => {
    pending.resolve([{ ...summaries()[0]!, name: 'Old private name', category: 'other' }]);
    await pending.promise;
  });
  expect(screen.queryByText('Old private name')).not.toBeInTheDocument();
  unmount();
  expect(slot).toBeEmptyDOMElement();
  slot.remove();
});
it('same actor profile changes preserve the host; replacing that SDK actor resets it', async () => {
  const { user, rerender } = await list();
  await user.click(screen.getByRole('button', { name: 'Editar Arthur' }));
  const count = s.edit.mock.calls.length;
  s.actor.displayName = 'Profile';
  s.user = { uid: 'author' };
  rerender(<LoreCollection scope="book" />);
  expect(screen.getByRole('dialog', { name: 'Edição nativa' })).toBeInTheDocument();
  expect(s.edit.mock.calls.length).toBeGreaterThanOrEqual(count);
  s.actor = { uid: 'author', displayName: '' };
  rerender(<LoreCollection scope="book" />);
  await screen.findByText('Arthur');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('switching local/global book scopes clears selection and returns to a fresh local workspace with optional portal', async () => {
  const slot = document.createElement('div');
  document.body.append(slot);
  const book = {
    id: 'book',
    authorId: 'author',
    title: 'Book',
    genre: '',
    synopsis: '',
    coverUrl: null,
    status: 'draft',
    wordCount: 0,
    createdAt: 0,
    updatedAt: 0,
    universeId: 'world',
  } as Book;
  const { user, unmount } = renderWithProviders(<LoreTab book={book} actionsContainer={slot} />);
  await screen.findByText('Arthur');
  expect(within(slot).getByRole('button', { name: 'Nova Entidade' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Visualização em lista' }));
  await user.click(all());
  await chooseDropdown(
    user,
    screen.getByLabelText('Escopo do compêndio'),
    'Lore global — universo compartilhado',
  );
  expect(screen.queryByRole('region', { name: 'Ações da seleção' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retomadas' })).not.toBeInTheDocument();
  await chooseDropdown(
    user,
    screen.getByLabelText('Escopo do compêndio'),
    'Lore local — somente este livro',
  );
  await screen.findByText('Arthur');
  expect(s.listSummaries).toHaveBeenCalledTimes(2);
  unmount();
  expect(slot).toBeEmptyDOMElement();
  slot.remove();
});
it('empty collection retains create and recovery actions', async () => {
  s.listSummaries.mockResolvedValueOnce([]);
  const { user } = renderWithProviders(<LoreCollection scope="book" />);
  await screen.findByText('Nenhuma entidade cadastrada');
  await user.click(screen.getByRole('button', { name: 'Cadastrar Primeira Entidade' }));
  expect(last(s.create)).toMatchObject({ bookId: 'book' });
});

it('StrictMode rejects its obsolete initial read while keeping a single complete collection visible', async () => {
  const { unmount } = renderWithProviders(
    <StrictMode>
      <LoreCollection scope="book" />
    </StrictMode>,
  );
  await screen.findByText('Arthur');
  expect(screen.getAllByText('Arthur')).toHaveLength(1);
  expect(screen.queryByText('context changed')).not.toBeInTheDocument();
  unmount();
});
it('a newer explicit refresh wins even when an older request finishes afterwards', async () => {
  const hook = renderHook(() => useBookLoreCollection('book'));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  const older = deferred<readonly BookLoreSummary[]>(),
    newer = deferred<readonly BookLoreSummary[]>();
  s.listSummaries.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  let oldRun!: Promise<void>, newRun!: Promise<void>;
  act(() => {
    oldRun = hook.result.current.refresh();
    newRun = hook.result.current.refresh();
  });
  const fresh: BookLoreSummary[] = [
    { ...summaries()[0]!, name: 'Latest authorized', category: 'other' },
  ];
  await act(async () => {
    newer.resolve(fresh);
    await newRun;
  });
  expect(hook.result.current.rows[0]?.name).toBe('Latest authorized');
  await act(async () => {
    older.resolve(summaries());
    await oldRun;
  });
  expect(hook.result.current.rows[0]?.name).toBe('Latest authorized');
  expect(hook.result.current.error).toBe('');
  hook.unmount();
});

it('public authoring freezes the original mention target and returns that target on close', async () => {
  const closed = vi.fn(),
    confirmed = vi.fn(),
    target = { kind: 'create' as const, initialName: '  🌙 Original ' };
  const { user, rerender } = renderWithProviders(
    <BookLoreAuthoring
      open
      bookId="book"
      target={target}
      entities={[]}
      onClose={closed}
      onConfirmed={confirmed}
    />,
  );
  expect(last(s.create)).toMatchObject({ initialName: '  🌙 Original ' });
  rerender(
    <BookLoreAuthoring
      open
      bookId="book"
      target={{ kind: 'create', initialName: 'Replacement' }}
      entities={[]}
      onClose={closed}
      onConfirmed={confirmed}
    />,
  );
  expect(last(s.create)).toMatchObject({ initialName: '  🌙 Original ' });
  await user.click(screen.getByRole('button', { name: 'Confirmar no fluxo nativo' }));
  expect(confirmed).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Fechar tentativa' }));
  expect(closed).toHaveBeenCalledExactlyOnceWith(target);
});
it('a chapter operation delays first authoring entry but cannot unmount a draft already opened', () => {
  const close = vi.fn(),
    props = {
      open: true,
      bookId: 'book',
      target: { kind: 'create' as const, initialName: 'Seed' },
      entities: [],
      onClose: close,
    };
  const { rerender } = renderWithProviders(<BookLoreAuthoring {...props} disabled />);
  expect(screen.getByRole('dialog')).toHaveTextContent('Aguarde a operação do capítulo');
  expect(s.create).not.toHaveBeenCalled();
  rerender(<BookLoreAuthoring {...props} />);
  expect(screen.getByRole('dialog', { name: 'Criação nativa' })).toBeInTheDocument();
  rerender(<BookLoreAuthoring {...props} disabled />);
  expect(screen.getByRole('dialog', { name: 'Criação nativa' })).toBeInTheDocument();
});
it('recovery cannot mount an editor while the chapter operation is active', async () => {
  const props = {
    open: true,
    bookId: 'book',
    target: { kind: 'recoveries' as const },
    entities: [],
    onClose: vi.fn(),
  };
  const { user, rerender } = renderWithProviders(<BookLoreAuthoring {...props} disabled />);
  await user.click(screen.getByRole('button', { name: 'Retomar edição fixture' }));
  expect(s.edit).not.toHaveBeenCalled();
  rerender(<BookLoreAuthoring {...props} />);
  await user.click(screen.getByRole('button', { name: 'Retomar edição fixture' }));
  expect(last(s.edit)).toMatchObject({
    bookId: 'book',
    loreId: 'arthur',
    resumeWriteId: 'write-edit',
  });
});
it('inline details authorize C1 before showing full text, including absent consent as private', async () => {
  const pending = deferred<BookLoreEditSource>();
  s.capture.mockReturnValueOnce(pending.promise);
  renderWithProviders(<BookLoreInlineDetails bookId="book" loreId="camelot" entities={[]} />);
  expect(screen.getByText('Conferindo a ficha completa...')).toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Ficha completa de Camelot' }),
  ).not.toBeInTheDocument();
  await act(async () => {
    pending.resolve({
      ...sources()[1]!,
      data: { ...sources()[1]!.data, details: 'Authorized body' },
    });
    await pending.promise;
  });
  expect(
    await screen.findByRole('region', { name: 'Ficha completa de Camelot' }),
  ).toHaveTextContent('Authorized body');
  expect(screen.getByText('Privado (somente autor)')).toBeInTheDocument();
  expect(s.capture).toHaveBeenCalledWith('book', 'camelot', undefined);
});
it('inline details discard a late source after the selected ID or actor changes', async () => {
  const pending = deferred<BookLoreEditSource>();
  s.capture.mockReturnValueOnce(pending.promise);
  const { rerender } = renderWithProviders(
    <BookLoreInlineDetails bookId="book" loreId="arthur" entities={[]} />,
  );
  rerender(<BookLoreInlineDetails bookId="book" loreId="camelot" entities={[]} />);
  await screen.findByRole('region', { name: 'Ficha completa de Camelot' });
  await act(async () => {
    pending.resolve({
      ...sources()[0]!,
      data: { ...sources()[0]!.data, details: 'OLD PRIVATE BODY' },
    });
    await pending.promise;
  });
  expect(screen.queryByText('OLD PRIVATE BODY')).not.toBeInTheDocument();
  s.actor = { uid: 'author', displayName: '' };
  s.capture.mockRejectedValueOnce(Error('Reauthorization required'));
  rerender(<BookLoreInlineDetails bookId="book" loreId="camelot" entities={[]} />);
  await screen.findByText('Reauthorization required');
  expect(
    screen.queryByRole('region', { name: 'Ficha completa de Camelot' }),
  ).not.toBeInTheDocument();
});

it('public authoring transitions from reauthorized read to edit without closing the host', async () => {
  const closed = vi.fn();
  const { user } = renderWithProviders(
    <BookLoreAuthoring
      open
      bookId="book"
      target={{ kind: 'read', loreId: 'arthur' }}
      entities={[]}
      onClose={closed}
    />,
  );
  await screen.findByRole('dialog', { name: 'Arthur' });
  await user.click(screen.getByRole('button', { name: 'Editar Ficha' }));
  expect(last(s.edit)).toMatchObject({ bookId: 'book', loreId: 'arthur' });
  expect(closed).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Edição nativa' })).toBeInTheDocument();
});

it('em tela larga mostra o resumo no inspetor e só abre a ficha completa pelo botão', async () => {
  const restore = mockMatchMedia('(min-width: 1100px)');
  try {
    const { user } = await list();
    expect(screen.getByRole('complementary', { name: 'Detalhes' })).toHaveTextContent(
      'Escolha uma entidade',
    );
    await user.click(screen.getByRole('button', { name: 'Ver ficha de Arthur' }));
    const panel = screen.getByRole('complementary', { name: 'Detalhes de Arthur' });
    expect(screen.getByRole('button', { name: 'Ver ficha de Arthur' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(s.capture).not.toHaveBeenCalled();
    await user.click(within(panel).getByRole('button', { name: 'Abrir ficha completa' }));
    expect(s.capture).toHaveBeenCalledWith('book', 'arthur', 'a'.repeat(64));
  } finally {
    restore();
  }
});
