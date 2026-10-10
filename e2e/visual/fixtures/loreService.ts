import type {
  CreateLoreEntityInput,
  LoreEntity,
  UpdateLoreEntityInput,
} from '../../../src/features/lore/model/loreEntity';
import { lore, FIXTURE_TIME } from './data';

const store = new Map(lore.map((entity) => [entity.id, structuredClone(entity)]));
let sequence = 0;

export function listLoreEntities(bookId: string): Promise<LoreEntity[]> {
  return Promise.resolve(
    structuredClone([...store.values()].filter((entity) => entity.bookId === bookId)),
  );
}

export function getLoreEntity(bookId: string, entityId: string): Promise<LoreEntity | null> {
  const entity = store.get(entityId);
  return Promise.resolve(structuredClone(entity?.bookId === bookId ? entity : null));
}

export function createLoreEntity(
  bookId: string,
  input: CreateLoreEntityInput,
): Promise<LoreEntity> {
  const entity: LoreEntity = {
    ...input,
    id: `visual-created-lore-${++sequence}`,
    bookId,
    aliases: input.aliases ?? [],
    details: input.details ?? '',
    relations: input.relations ?? [],
    isPublic: input.isPublic ?? true,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
  store.set(entity.id, entity);
  return Promise.resolve(structuredClone(entity));
}

export function updateLoreEntity(
  bookId: string,
  entityId: string,
  input: UpdateLoreEntityInput,
): Promise<void> {
  const entity = store.get(entityId);
  if (!entity || entity.bookId !== bookId) throw new Error('Entidade fictícia não encontrada.');
  store.set(entityId, { ...entity, ...input, updatedAt: FIXTURE_TIME });
  return Promise.resolve();
}

export function deleteLoreEntity(bookId: string, entityId: string): Promise<void> {
  if (store.get(entityId)?.bookId === bookId) store.delete(entityId);
  return Promise.resolve();
}
