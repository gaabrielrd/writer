import type {
  CreateLoreEntityInput,
  LoreEntity,
  LoreScope,
  UpdateLoreEntityInput,
} from '../../../src/features/lore/model/loreEntity';
import { presentBookLore } from '../../../src/features/lore/model/bookLorePresentation';
import { author, lore, FIXTURE_TIME } from './data';
import { fixtureOwner } from './studioStore';

const storageKey = 'writer.visual.lore';
const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as {
  entries: [string, [string, LoreEntity][]][];
  sequences: [string, number][];
} | null;
const stores = new Map<string, Map<string, LoreEntity>>(
  saved?.entries.map(([uid, entries]) => [uid, new Map(entries)]) ?? [
    [author.uid, new Map(lore.map((entity) => [entity.id, structuredClone(entity)]))],
  ],
);
const sequences = new Map<string, number>(saved?.sequences ?? []);
function store() {
  const uid = fixtureOwner();
  let current = stores.get(uid);
  if (!current) {
    current = new Map();
    stores.set(uid, current);
  }
  return current;
}
function nextId() {
  const uid = fixtureOwner(),
    next = (sequences.get(uid) ?? 0) + 1;
  sequences.set(uid, next);
  return next;
}
function persist() {
  sessionStorage.setItem(
    storageKey,
    JSON.stringify({
      entries: [...stores].map(([uid, entries]) => [uid, [...entries]]),
      sequences: [...sequences],
    }),
  );
}
export function seedAssistedLore(
  bookId: string,
  entities: Omit<LoreEntity, 'bookId' | 'isPublic' | 'createdAt' | 'updatedAt'>[],
) {
  for (const entity of entities)
    store().set(entity.id, {
      ...entity,
      bookId,
      isPublic: false,
      createdAt: FIXTURE_TIME,
      updatedAt: FIXTURE_TIME,
    } as LoreEntity);
  emit();
}
const listeners = new Set<{
  scope: string | LoreScope;
  ownerId: string;
  changed: (entities: LoreEntity[]) => void;
}>();
function belongs(entity: LoreEntity, scope: string | LoreScope) {
  return typeof scope === 'string'
    ? entity.bookId === scope
    : scope.kind === 'book'
      ? entity.bookId === scope.id
      : entity.universeId === scope.id;
}
function emit() {
  persist();
  for (const listener of listeners)
    if (listener.ownerId === fixtureOwner())
      listener.changed(
        structuredClone([...store().values()].filter((entity) => belongs(entity, listener.scope))),
      );
}
export function subscribeLoreEntities(
  scope: string | LoreScope,
  changed: (entities: LoreEntity[]) => void,
  failed?: (error: unknown) => void,
) {
  if (window.__writerVisualNativeLoreCall && (typeof scope === 'string' || scope.kind === 'book')) {
    let active = true;
    const owner = fixtureOwner();
    const reload = () => {
      void listLoreEntities(scope)
        .then((rows) => {
          if (active && fixtureOwner() === owner) changed(rows);
        })
        .catch((error: unknown) => {
          if (active) {
            changed([]);
            failed?.(error);
          }
        });
    };
    window.addEventListener('writer.visual.native-lore', reload);
    reload();
    return () => {
      active = false;
      window.removeEventListener('writer.visual.native-lore', reload);
    };
  }
  const listener = { scope, changed, ownerId: fixtureOwner() };
  listeners.add(listener);
  emit();
  return () => {
    listeners.delete(listener);
  };
}

export async function listLoreEntities(bookId: string | LoreScope): Promise<LoreEntity[]> {
  if (
    window.__writerVisualNativeLoreCall &&
    (typeof bookId === 'string' || bookId.kind === 'book')
  ) {
    const { bookLoreReadSession } = await import('./bookLoreReadFixture');
    const sources = await bookLoreReadSession().captureList(
      typeof bookId === 'string' ? bookId : bookId.id,
    );
    return sources.map((source) => {
      const { structuredDetails: details, ...row } = presentBookLore(source),
        d = source.data;
      if (typeof d.createdAt !== 'number' || typeof d.updatedAt !== 'number')
        throw Error('Native visual fixture requires original dates.');
      return {
        id: row.id,
        bookId: row.bookId,
        name: row.name,
        category: row.category,
        aliases: row.aliases,
        summary: row.summary,
        details: row.details,
        relations: row.relations,
        isPublic: row.isPublic,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        ...(details
          ? {
              structuredDetails: {
                appearance: details.appearance ?? '',
                personality: details.personality ?? '',
                history: details.history ?? '',
                notes: details.notes ?? '',
              },
            }
          : {}),
      };
    });
  }
  return Promise.resolve(
    structuredClone([...store().values()].filter((entity) => belongs(entity, bookId))),
  );
}

export async function getLoreEntity(
  bookId: string | LoreScope,
  entityId: string,
): Promise<LoreEntity | null> {
  if (window.__writerVisualNativeLoreCall && (typeof bookId === 'string' || bookId.kind === 'book'))
    return (await listLoreEntities(bookId)).find((e) => e.id === entityId) ?? null;
  const entity = store().get(entityId);
  return Promise.resolve(structuredClone(entity && belongs(entity, bookId) ? entity : null));
}

export function createLoreEntity(
  bookId: string | LoreScope,
  input: CreateLoreEntityInput,
): Promise<LoreEntity> {
  const entity: LoreEntity = {
    ...input,
    id:
      typeof bookId !== 'string' && bookId.kind === 'universe'
        ? `universe:${bookId.id}:visual-global-${nextId()}`
        : `visual-created-lore-${nextId()}`,
    ...(typeof bookId !== 'string' && bookId.kind === 'universe'
      ? { universeId: bookId.id }
      : { bookId: typeof bookId === 'string' ? bookId : bookId.id }),
    aliases: input.aliases ?? [],
    details: input.details ?? '',
    relations: input.relations ?? [],
    isPublic: input.isPublic ?? true,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
  store().set(entity.id, entity);
  emit();
  return Promise.resolve(structuredClone(entity));
}

export function updateLoreEntity(
  bookId: string | LoreScope,
  entityId: string,
  input: UpdateLoreEntityInput,
): Promise<void> {
  const entity = store().get(entityId);
  if (!entity || !belongs(entity, bookId)) throw new Error('Entidade fictícia não encontrada.');
  store().set(entityId, { ...entity, ...input, updatedAt: FIXTURE_TIME });
  emit();
  return Promise.resolve();
}

export function deleteLoreEntity(bookId: string | LoreScope, entityId: string): Promise<void> {
  const entity = store().get(entityId);
  if (entity && belongs(entity, bookId)) store().delete(entityId);
  emit();
  return Promise.resolve();
}
