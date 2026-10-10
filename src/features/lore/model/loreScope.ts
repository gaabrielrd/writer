import type { LoreEntity, LoreScope } from './loreEntity';

export function asLoreScope(scope: string | LoreScope): LoreScope {
  return typeof scope === 'string' ? { kind: 'book', id: scope } : scope;
}

export function universeEntityId(universeId: string, entityId: string): string {
  return `universe:${universeId}:${entityId}`;
}

export function loreEntityDocumentId(scope: LoreScope, reference: string): string {
  const prefix = `universe:${scope.id}:`;
  const id =
    scope.kind === 'universe' && reference.startsWith(prefix)
      ? reference.slice(prefix.length)
      : reference;
  if (!id || id.includes('/') || (scope.kind === 'universe' && id.includes(':')))
    throw new Error('Referência de lore inválida.');
  return id;
}

export function entityScope(entity: LoreEntity): LoreScope {
  return entity.universeId
    ? { kind: 'universe', id: entity.universeId }
    : { kind: 'book', id: entity.bookId! };
}

/** Resolve identical terms before visibility filtering; private local terms still win. */
export function preferredLoreTerms<
  T extends Pick<LoreEntity, 'id' | 'name' | 'aliases' | 'universeId'>,
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
