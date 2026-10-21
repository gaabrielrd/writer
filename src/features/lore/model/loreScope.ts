import type { LoreMentionEntity, LoreScope } from './loreEntity';

export function asLoreScope(scope: string | LoreScope): LoreScope {
  return typeof scope === 'string' ? { kind: 'book', id: scope } : scope;
}

export function universeEntityId(universeId: string, entityId: string): string {
  return `universe:${universeId}:${entityId}`;
}

export function adventureEntityId(adventureId: string, entityId: string): string {
  return `adventure:${adventureId}:${entityId}`;
}

export function loreEntityDocumentId(scope: LoreScope, reference: string): string {
  const prefix = `${scope.kind}:${scope.id}:`;
  const id =
    scope.kind !== 'book' && reference.startsWith(prefix)
      ? reference.slice(prefix.length)
      : reference;
  if (!id || id.includes('/') || (scope.kind !== 'book' && id.includes(':')))
    throw new Error('Referência de lore inválida.');
  return id;
}

export function entityScope(entity: LoreMentionEntity): LoreScope {
  return entity.universeId
    ? { kind: 'universe', id: entity.universeId }
    : entity.adventureId
      ? { kind: 'adventure', id: entity.adventureId }
      : { kind: 'book', id: entity.bookId! };
}

/** Resolve identical terms before visibility filtering; private local terms still win. */
export function preferredLoreTerms<
  T extends Pick<LoreMentionEntity, 'id' | 'name' | 'aliases' | 'universeId'>,
>(entities: T[]): Map<string, T> {
  const terms = new Map<string, T>();
  const ordered = [...entities].sort(
    (a, b) =>
      Number(Boolean(a.universeId)) - Number(Boolean(b.universeId)) || a.id.localeCompare(b.id),
  );
  for (const entity of ordered) {
    for (const term of [entity.name, ...entity.aliases]) {
      const key = term.trim().toLocaleLowerCase();
      if (key && !terms.has(key)) terms.set(key, entity);
    }
  }
  return terms;
}
