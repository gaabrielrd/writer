import type {
  CreateLoreEntityInput,
  LoreEntity,
  LoreScope,
  UpdateLoreEntityInput,
} from '../../../src/features/lore/model/loreEntity';
import { lore, FIXTURE_TIME } from './data';

const store = new Map(lore.map((entity) => [entity.id, structuredClone(entity)]));
let sequence = 0;
const listeners = new Set<{
  scope: string | LoreScope;
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
  for (const listener of listeners)
    listener.changed(
      structuredClone([...store.values()].filter((entity) => belongs(entity, listener.scope))),
    );
}
export function subscribeLoreEntities(
  scope: string | LoreScope,
  changed: (entities: LoreEntity[]) => void,
) {
  const listener = { scope, changed };
  listeners.add(listener);
  emit();
  return () => {
    listeners.delete(listener);
  };
}

export function listLoreEntities(bookId: string | LoreScope): Promise<LoreEntity[]> {
  return Promise.resolve(
    structuredClone([...store.values()].filter((entity) => belongs(entity, bookId))),
  );
}

export function getLoreEntity(
  bookId: string | LoreScope,
  entityId: string,
): Promise<LoreEntity | null> {
  const entity = store.get(entityId);
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
        ? `universe:${bookId.id}:visual-global-${++sequence}`
        : `visual-created-lore-${++sequence}`,
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
  store.set(entity.id, entity);
  emit();
  return Promise.resolve(structuredClone(entity));
}

export function updateLoreEntity(
  bookId: string | LoreScope,
  entityId: string,
  input: UpdateLoreEntityInput,
): Promise<void> {
  const entity = store.get(entityId);
  if (!entity || !belongs(entity, bookId)) throw new Error('Entidade fictícia não encontrada.');
  store.set(entityId, { ...entity, ...input, updatedAt: FIXTURE_TIME });
  emit();
  return Promise.resolve();
}

export function deleteLoreEntity(bookId: string | LoreScope, entityId: string): Promise<void> {
  const entity = store.get(entityId);
  if (entity && belongs(entity, bookId)) store.delete(entityId);
  emit();
  return Promise.resolve();
}
