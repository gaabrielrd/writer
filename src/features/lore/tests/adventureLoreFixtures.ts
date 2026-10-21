import type {
  AdventureLoreSummary,
  AdventureLoreIdentity,
  AdventureLoreEntityInput,
  AdventureLoreListInput,
  AdventureLoreList,
  AdventureLoreSave,
} from '../model/adventureLore';
export const adventureId = 'adventure-lore-fixture',
  entityId = 'adventure-lore-operation',
  uid = 'owner',
  adventureToken = 'a'.repeat(64),
  contextToken = 'b'.repeat(64),
  entityToken = 'c'.repeat(64);
export const identity: AdventureLoreIdentity = {
  schemaVersion: 1,
  ownerId: uid,
  adventureId,
  adventureToken,
};
export const entity: AdventureLoreEntityInput = {
  name: 'Dragão',
  aliases: ['Serpente'],
  category: 'character',
  summary: 'Guardião',
  details: '  Prosa 🐉\n',
  structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
  relations: [],
  isPublic: false,
};
export const row = {
  id: 'adventure:' + adventureId + ':' + entityId,
  reference: { kind: 'adventure', scopeId: adventureId, entityId },
  entityToken,
  name: entity.name,
  aliases: entity.aliases,
  category: entity.category,
  summary: entity.summary,
  isPublic: false,
  createdAt: 1,
  updatedAt: 1,
  revision: 1,
  relationCount: 0,
} satisfies AdventureLoreSummary;
export const globalRow = {
  id: 'universe:world:global',
  reference: { kind: 'universe', scopeId: 'world', entityId: 'global' },
  entityToken,
  name: 'Global',
  aliases: ['Serpente'],
  category: 'character',
  summary: 'Resumo global',
  isPublic: true,
  createdAt: 1,
  updatedAt: 1,
} satisfies AdventureLoreSummary;
export const list = (
  input: AdventureLoreListInput,
  items: AdventureLoreSummary[] = input.scope === 'adventure' ? [row] : [],
): AdventureLoreList => ({
  ...identity,
  scope: input.scope,
  collectionRevision: 1,
  contextToken,
  items: structuredClone(items),
  nextCursor: null,
});
export const save: AdventureLoreSave = {
  adventureId,
  adventureToken,
  entityId,
  operationId: entityId,
  expectedRevision: 0,
  expectedCollectionRevision: 0,
  entity,
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
