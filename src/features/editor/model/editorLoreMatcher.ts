import {
  entityScope,
  loreEntityDocumentId,
  findLoreMatches,
  preferredLoreTerms,
  type LoreMentionEntity,
  type LoreMatch,
} from '@/features/lore';
import {
  canonicalEditorChatJSON,
  editorChatMatcherId,
  findEditorChatLoreMatches,
  preferredEditorChatTerms,
  type EditorChatMatcherEntity,
} from '@/features/ai-assistant';

export type EditorLoreMatcher = 'legacy' | 'editor-chat-v1';

function qualifiedEntity(entity: LoreMentionEntity): EditorChatMatcherEntity {
  const scopes = [entity.bookId, entity.adventureId, entity.universeId].filter(
    (id) => id !== undefined,
  );
  if (scopes.length !== 1 || typeof scopes[0] !== 'string' || !scopes[0])
    throw new Error('Origem da ficha indisponível.');
  const scope = entityScope(entity);
  const reference = {
    kind: scope.kind,
    scopeId: scope.id,
    entityId: loreEntityDocumentId(scope, entity.id),
  };
  return {
    id: editorChatMatcherId(reference),
    reference,
    global: scope.kind === 'universe',
    name: entity.name,
    aliases: entity.aliases,
  };
}

export function editorLoreEntityKey(
  entity: LoreMentionEntity,
  mode: EditorLoreMatcher = 'legacy',
): string {
  return mode === 'legacy' ? entity.id : qualifiedEntity(entity).id;
}

function qualifiedEntities<T extends LoreMentionEntity>(entities: T[]) {
  const metadata = new Map<string, T>();
  const rows = entities.map((entity) => {
    const row = qualifiedEntity(entity);
    const previous = metadata.get(row.id);
    if (
      previous &&
      canonicalEditorChatJSON({
        name: previous.name,
        aliases: previous.aliases,
        category: previous.category,
        summary: previous.summary,
      }) !==
        canonicalEditorChatJSON({
          name: entity.name,
          aliases: entity.aliases,
          category: entity.category,
          summary: entity.summary,
        })
    )
      throw new Error('Metadados de lore inconsistentes.');
    metadata.set(row.id, entity);
    return row;
  });
  return { rows, metadata };
}

export function editorLoreMatches<T extends LoreMentionEntity>(
  text: string,
  entities: T[],
  mode: EditorLoreMatcher = 'legacy',
): LoreMatch<T>[] {
  if (mode === 'legacy') return findLoreMatches(text, entities);
  const { rows, metadata } = qualifiedEntities(entities);
  return findEditorChatLoreMatches(text, rows).map((match) => {
    const entity = metadata.get(match.id)!;
    return {
      entityId: match.id,
      entityName: entity.name,
      matchedText: text.slice(match.from, match.to),
      startIndex: match.from,
      endIndex: match.to,
      entity,
    };
  });
}

export function editorLoreTerms<T extends LoreMentionEntity>(
  entities: T[],
  mode: EditorLoreMatcher = 'legacy',
): Map<string, T> {
  if (mode === 'legacy') return preferredLoreTerms(entities);
  const { rows, metadata } = qualifiedEntities(entities);
  return new Map(
    [...preferredEditorChatTerms(rows)].map(([term, entity]) => [term, metadata.get(entity.id)!]),
  );
}

export function editorLoreNormalizedTerm(term: string, mode: EditorLoreMatcher = 'legacy') {
  return mode === 'legacy'
    ? term.trim().toLocaleLowerCase()
    : term.trim().toLocaleLowerCase('pt-BR');
}
