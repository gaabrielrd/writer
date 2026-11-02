import { beforeEach, expect, it, vi } from 'vitest';
import {
  getNarrativeContext,
  getNarrativeItem,
  listNarrativeItems,
  listNarrativeReferences,
  type NarrativeContext,
  type NarrativeItem,
  type NarrativePage,
  type NarrativeSummary,
} from '@/features/narrative-planning';
import { captureNarrativeBookBackup } from '../services/narrativeBackupService';

vi.mock('@/features/narrative-planning', async () => ({
  ...(await vi.importActual('../../narrative-planning/model/narrative')),
  getNarrativeContext: vi.fn(),
  getNarrativeItem: vi.fn(),
  listNarrativeItems: vi.fn(),
  listNarrativeReferences: vi.fn(),
}));
const context: NarrativeContext = {
  target: { kind: 'book', id: 'book' },
  ownerId: 'private-user',
  title: 'Livro',
  universeId: null,
  projectRevision: 8,
  sceneRevision: 3,
  updatedAt: 200,
  hasResources: true,
  entityIndexReady: true,
};
const base = {
  ownerId: 'private-user',
  schemaVersion: 1 as const,
  revision: 2,
  title: 'Plano privado',
  rank: 'V',
  referenceCount: 0,
  createdAt: 100,
  updatedAt: 200,
};
const arc: NarrativeItem = {
  ...base,
  kind: 'arc',
  id: 'arc',
  initialState: 'Receio',
  objective: 'Proteger',
  plannedOutcome: 'Confiança',
  referenceCount: 2,
};
const milestone: NarrativeItem = {
  ...base,
  kind: 'milestone',
  id: 'mark',
  arcId: 'arc',
  notes: 'Marco próprio',
};
const event: NarrativeItem = {
  ...base,
  kind: 'event',
  id: 'event',
  description: 'Fato compartilhado',
  dateLabel: '3º dia do inverno',
};
const page = <T>(items: T[], nextCursor: string | null = null): NarrativePage<T> => ({
  items,
  nextCursor,
  projectRevision: 8,
  sceneRevision: 3,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getNarrativeContext).mockResolvedValue(context);
  vi.mocked(listNarrativeItems).mockImplementation(({ resource }) =>
    Promise.resolve(
      page([resource.kind === 'arc' ? arc : resource.kind === 'event' ? event : milestone]),
    ),
  );
  vi.mocked(getNarrativeItem).mockImplementation(({ source }) =>
    Promise.resolve(source.kind === 'arc' ? arc : source.kind === 'event' ? event : milestone),
  );
  vi.mocked(listNarrativeReferences).mockImplementation(({ source, cursor }) =>
    Promise.resolve(
      source.kind !== 'arc'
        ? page([])
        : cursor
          ? page([
              {
                id: 'gone',
                reference: {
                  kind: 'lore',
                  reference: { kind: 'universe', scopeId: 'old-world', entityId: 'gone' },
                },
                available: false,
              },
            ])
          : page(
              [
                {
                  id: 'scene',
                  reference: { kind: 'scene', sceneId: 'scene' },
                  available: true,
                  label: 'Nome resolvido privado',
                  archived: true,
                },
              ],
              'refs-next',
            ),
    ),
  );
});

it('guarda campos de autor e referências originais paginadas sem UID, rótulos ou jobs', async () => {
  const backup = await captureNarrativeBookBackup('book', 8, 3);
  expect(backup).toMatchObject({
    schemaVersion: 1,
    projectRevision: 8,
    sceneRevision: 3,
    arcs: [
      {
        initialState: 'Receio',
        objective: 'Proteger',
        plannedOutcome: 'Confiança',
        references: [
          { kind: 'scene', sceneId: 'scene' },
          { kind: 'lore', reference: { kind: 'universe', scopeId: 'old-world', entityId: 'gone' } },
        ],
      },
    ],
    milestones: [{ arcId: 'arc', notes: 'Marco próprio' }],
    events: [{ description: 'Fato compartilhado', dateLabel: '3º dia do inverno' }],
  });
  expect(JSON.stringify(backup)).not.toMatch(
    /private-user|Nome resolvido|ownerId|referenceCount|deletionOperation|available/,
  );
  expect(listNarrativeReferences).toHaveBeenCalledWith(
    expect.objectContaining({ cursor: 'refs-next', limit: 50 }),
  );
});

it('captura todas as páginas de eventos na ordem manual, inclusive data vazia', async () => {
  const second = { ...event, id: 'event-2', dateLabel: '', rank: 'z' };
  vi.mocked(listNarrativeItems).mockImplementation(({ resource, cursor }) =>
    Promise.resolve(
      resource.kind === 'event'
        ? cursor
          ? page([second])
          : page([event], 'event-next')
        : page([]),
    ),
  );
  vi.mocked(getNarrativeItem).mockImplementation(({ source }) =>
    Promise.resolve(source.id === 'event' ? event : second),
  );
  const backup = await captureNarrativeBookBackup('book', 8, 3);
  expect(backup.events.map((item) => [item.id, item.dateLabel])).toEqual([
    ['event', '3º dia do inverno'],
    ['event-2', ''],
  ]);
  expect(backup.arcs).toEqual([]);
});

it.each([
  { ...context, projectRevision: 9 },
  { ...context, sceneRevision: 4 },
  { ...context, hasResources: false },
  null,
])('não conclui captura após perda da origem ou mudança de revisão (%j)', async (changed) => {
  vi.mocked(getNarrativeContext).mockResolvedValueOnce(context).mockResolvedValueOnce(changed);
  await expect(captureNarrativeBookBackup('book', 8, 3)).rejects.toThrow(/mudou/);
});

it.each(['narrative', 'scene'])('recusa páginas com revisão %s diferente', async (kind) => {
  vi.mocked(listNarrativeItems).mockResolvedValue({
    ...page([]),
    projectRevision: kind === 'narrative' ? 9 : 8,
    sceneRevision: kind === 'scene' ? 4 : 3,
  });
  await expect(captureNarrativeBookBackup('book', 8, 3)).rejects.toThrow(/mudou/);
});

it('não omite um arco em exclusão nem percorre seus marcos parcialmente', async () => {
  vi.mocked(listNarrativeItems).mockResolvedValue(page([{ ...arc, deleting: true }]));
  await expect(captureNarrativeBookBackup('book', 8, 3)).rejects.toThrow(/Conclua a remoção/);
  expect(getNarrativeItem).not.toHaveBeenCalled();
});

it.each([
  null,
  { ...arc, deleting: true },
  { ...arc, revision: 3 },
  { ...arc, id: 'other' },
  event,
])('recusa detalhe ausente, em exclusão, alterado ou de outro recurso (%j)', async (item) => {
  vi.mocked(getNarrativeItem).mockResolvedValueOnce(item);
  await expect(captureNarrativeBookBackup('book', 8, 3)).rejects.toThrow(/mudou/);
});

it('não mistura marcos de outro arco', async () => {
  vi.mocked(getNarrativeItem).mockImplementation(({ source }) =>
    Promise.resolve(source.kind === 'arc' ? arc : { ...milestone, arcId: 'other' }),
  );
  await expect(captureNarrativeBookBackup('book', 8, 3)).rejects.toThrow(/mudou/);
});

it('recusa vínculos incompletos mesmo quando a primeira página está íntegra', async () => {
  vi.mocked(listNarrativeReferences).mockResolvedValue(page([]));
  await expect(captureNarrativeBookBackup('book', 8, 3)).rejects.toThrow(/mudou/);
});

it('preserva referência a evento por identidade sem copiar sua descrição no marco', async () => {
  vi.mocked(getNarrativeItem).mockImplementation(({ source }) =>
    Promise.resolve(
      source.kind === 'arc'
        ? { ...arc, referenceCount: 1 }
        : source.kind === 'event'
          ? event
          : milestone,
    ),
  );
  vi.mocked(listNarrativeReferences).mockImplementation(({ source }) =>
    Promise.resolve(
      source.kind === 'arc'
        ? page([
            { id: 'event-ref', reference: { kind: 'event', eventId: 'event' }, available: true },
          ])
        : page([]),
    ),
  );
  const backup = await captureNarrativeBookBackup('book', 8, 3);
  expect(backup.arcs[0]?.references).toEqual([{ kind: 'event', eventId: 'event' }]);
  expect(backup.milestones[0]).not.toHaveProperty('description');
});

it.each(['items', 'references'])(
  'recusa cursor circular de %s sem produzir arquivo parcial',
  async (kind) => {
    if (kind === 'items') vi.mocked(listNarrativeItems).mockResolvedValue(page([], 'loop'));
    else vi.mocked(listNarrativeReferences).mockResolvedValue(page([], 'loop'));
    await expect(captureNarrativeBookBackup('book', 8, 3)).rejects.toThrow(/mudou/);
  },
);

it.each(['items', 'references'])('recusa identidade duplicada em %s', async (kind) => {
  if (kind === 'items')
    vi.mocked(listNarrativeItems).mockResolvedValue(page([arc, arc] as NarrativeSummary[]));
  else
    vi.mocked(listNarrativeReferences).mockResolvedValue(
      page([
        { id: 'same', reference: { kind: 'scene', sceneId: 'scene' }, available: true },
        { id: 'same', reference: { kind: 'scene', sceneId: 'scene' }, available: true },
      ]),
    );
  await expect(captureNarrativeBookBackup('book', 8, 3)).rejects.toThrow(/mudou/);
});

it('cancelamento antes da captura não consulta a origem', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(captureNarrativeBookBackup('book', 8, 3, controller.signal)).rejects.toThrow();
  expect(getNarrativeContext).not.toHaveBeenCalled();
});
