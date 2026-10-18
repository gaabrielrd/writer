import type {
  CampaignLoreEntityInput,
  CampaignLoreEntityView,
  CampaignLoreEnvelope,
  CampaignLoreHeader,
  CampaignLoreOperation,
  CampaignLorePrepared,
  CampaignLoreResolution,
  CampaignLoreResult,
  CampaignLoreState,
  CampaignLoreSummary,
} from '../model/campaignLore';
export * from './campaignLoreCallables';
export const loreCategories = [
  { value: 'character', label: 'Personagem' },
  { value: 'location', label: 'Local' },
  { value: 'concept', label: 'Conceito' },
  { value: 'other', label: 'Outro' },
];
export const loreModes = { base: 'Base', override: 'Variante da mesa', removed: 'Retirada' };
export const utf8 = new TextEncoder();
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
export function invalid(message = 'A resposta de lore não pôde ser confirmada.'): never {
  throw Object.assign(new Error(message), { code: 'functions/unavailable' });
}
export function loreMessage(cause: unknown): string {
  return cause instanceof Error || cause instanceof DOMException
    ? cause.message
    : 'Não foi possível confirmar o pedido. Repita o mesmo pedido.';
}
export function loreReason(cause: unknown): string {
  if (!cause || typeof cause !== 'object') return '';
  if (
    'details' in cause &&
    cause.details &&
    typeof cause.details === 'object' &&
    'reason' in cause.details &&
    typeof cause.details.reason === 'string'
  )
    return cause.details.reason;
  return 'code' in cause && typeof cause.code === 'string'
    ? cause.code.replace('functions/', '')
    : '';
}
export function gateDenied(cause: unknown): boolean {
  return [
    'permission-denied',
    'not-found',
    'unauthenticated',
    'base-changed',
    'campaign-changed',
  ].includes(loreReason(cause));
}
export function validateEnvelope(
  value: CampaignLoreEnvelope,
  uid: string,
  campaignId: string,
  baseId: string,
  token?: string,
): void {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    value.campaignId !== campaignId ||
    value.baseId !== baseId ||
    !hash(value.campaignToken) ||
    (token !== undefined && value.campaignToken !== token) ||
    !hash(value.projectionToken) ||
    !integer(value.collectionRevision)
  )
    invalid();
  if (utf8.encode(JSON.stringify(value)).byteLength > 4 * 1024 * 1024)
    invalid('A resposta ultrapassa o limite de leitura.');
}
export function validateSummary(item: CampaignLoreSummary): void {
  if (
    !item ||
    !hash(item.sourceKey) ||
    !integer(item.revision) ||
    !['base', 'override', 'removed'].includes(item.mode) ||
    typeof item.name !== 'string' ||
    !item.name.trim() ||
    !loreCategories.some((c) => c.value === item.category)
  )
    invalid();
}
function validString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    new TextDecoder('utf-8', { fatal: true }).decode(utf8.encode(value)) === value
  );
}
export function toEntityInput(entity: CampaignLoreEntityView): CampaignLoreEntityInput {
  return {
    name: entity.name,
    aliases: [...entity.aliases],
    category: entity.category,
    summary: entity.summary,
    details: entity.details,
    structuredDetails: { ...entity.structuredDetails },
    relations: entity.relations.map(({ targetKey, relationType, description }) => ({
      targetKey,
      relationType,
      description,
    })),
  };
}
export function viewNames(entity: CampaignLoreEntityView): Record<string, string> {
  return Object.fromEntries(entity.relations.map((r) => [r.targetKey, r.targetName]));
}
export function relatedKeys(entity: CampaignLoreEntityInput): string[] {
  return [...new Set(entity.relations.map((r) => r.targetKey))].sort();
}
export function validateEntity(
  entity: CampaignLoreEntityInput,
  sourceKey: string,
  view = false,
): void {
  if (
    !entity ||
    !validString(entity.name) ||
    !entity.name.trim() ||
    !validString(entity.summary) ||
    !entity.summary.trim() ||
    !validString(entity.details) ||
    !loreCategories.some((c) => c.value === entity.category) ||
    !Array.isArray(entity.aliases) ||
    !entity.aliases.every((a) => validString(a) && a.trim()) ||
    !entity.structuredDetails ||
    !['appearance', 'personality', 'history', 'notes'].every((k) =>
      validString(entity.structuredDetails[k as keyof typeof entity.structuredDetails]),
    ) ||
    !Array.isArray(entity.relations)
  )
    invalid('Confira os campos obrigatórios e os caracteres da ficha.');
  for (const r of entity.relations) {
    if (
      !r ||
      !hash(r.targetKey) ||
      r.targetKey === sourceKey ||
      !validString(r.relationType) ||
      !r.relationType.trim() ||
      !validString(r.description) ||
      (view && (!('targetName' in r) || !validString(r.targetName) || !r.targetName.trim()))
    )
      invalid('Confira os alvos e tipos das relações.');
  }
  if (
    !view &&
    (entity.name.trim().length > 200 ||
      entity.summary.trim().length > 140 ||
      entity.aliases.length > 20 ||
      entity.aliases.some((a) => a.trim().length > 200) ||
      [entity.details, ...Object.values(entity.structuredDetails)].some((t) => t.length > 150000) ||
      entity.relations.length > 50 ||
      entity.relations.some(
        (r) => r.relationType.trim().length > 200 || r.description.length > 4000,
      ) ||
      utf8.encode(JSON.stringify(entity)).byteLength > 900000)
  )
    invalid(
      'A ficha ultrapassa os limites de edição. Reduza os campos explicitamente; nenhum texto foi truncado.',
    );
}
export function normalizedEntity(
  entity: CampaignLoreEntityInput,
  sourceKey: string,
): CampaignLoreEntityInput {
  const value: CampaignLoreEntityInput = {
    name: entity.name.trim(),
    aliases: entity.aliases.map((a) => a.trim()),
    category: entity.category,
    summary: entity.summary.trim(),
    details: entity.details,
    structuredDetails: { ...entity.structuredDetails },
    relations: entity.relations.map((r) => ({
      targetKey: r.targetKey,
      relationType: r.relationType.trim(),
      description: r.description,
    })),
  };
  validateEntity(value, sourceKey);
  return value;
}
export function validateState(item: CampaignLoreState, sourceKey: string): void {
  if (
    !item ||
    item.sourceKey !== sourceKey ||
    !hash(sourceKey) ||
    !integer(item.revision) ||
    !['base', 'override', 'removed'].includes(item.mode)
  )
    invalid();
  if (
    item.revision === 0
      ? item.mode !== 'base' || item.createdAt !== null || item.updatedAt !== null
      : !integer(item.createdAt as number) ||
        !integer(item.updatedAt as number) ||
        (item.updatedAt as number) < (item.createdAt as number)
  )
    invalid();
  if (item.mode === 'removed') {
    if (item.entity !== null || item.entityHash !== null) invalid();
  } else {
    if (!hash(item.entityHash) || !item.entity) invalid();
    validateEntity(item.entity, sourceKey, true);
  }
}
export function saveHeader(op: CampaignLoreOperation) {
  return { ...op.header, relatedSourceKeys: op.relatedSourceKeys ?? [] };
}
export function sameHeader(value: CampaignLoreHeader, expected: CampaignLoreHeader): boolean {
  return (
    !!value &&
    (Object.keys(expected) as (keyof CampaignLoreHeader)[]).every((k) => value[k] === expected[k])
  );
}
export function validatePrepared(value: CampaignLorePrepared, op: CampaignLoreOperation): void {
  validateEnvelope(
    value,
    op.ownerId,
    op.header.campaignId,
    op.header.baseId,
    op.header.campaignToken,
  );
  if (
    !sameHeader(value, op.header) ||
    value.action !== 'save' ||
    value.algorithm !== 'AES-GCM' ||
    JSON.stringify(value.relatedSourceKeys) !== JSON.stringify(op.relatedSourceKeys)
  )
    invalid();
}
export function validateMutation(
  value: CampaignLoreResult,
  op: CampaignLoreOperation,
  expected?: CampaignLoreEntityInput,
): void {
  validateEnvelope(
    value,
    op.ownerId,
    op.header.campaignId,
    op.header.baseId,
    op.header.campaignToken,
  );
  if (!value.item) invalid();
  validateState(value.item, op.header.sourceKey);
  if (
    op.action === 'save' &&
    (!expected ||
      !value.item.entity ||
      canonicalLore(toEntityInput(value.item.entity)) !== canonicalLore(expected))
  )
    invalid(
      'O texto confirmado não corresponde à ficha preservada. Confirme o mesmo pedido antes de continuar.',
    );
  if (
    value.item.revision !== op.header.expectedRevision + 1 ||
    (op.action === 'save' && value.item.mode !== 'override') ||
    (op.action === 'remove' && value.item.mode !== 'removed') ||
    (op.action === 'discard' && value.item.mode !== 'base') ||
    (op.action === 'restore' && value.item.mode === 'removed')
  )
    invalid();
}
function canonicalLore(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (current && typeof current === 'object' && !Array.isArray(current))
      return Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
    return current;
  });
}
export function validateResolution(value: CampaignLoreResolution, op: CampaignLoreOperation): void {
  if (
    !value ||
    value.ownerId !== op.ownerId ||
    value.schemaVersion !== 1 ||
    !sameHeader(value, op.header) ||
    value.action !== op.action ||
    JSON.stringify(value.relatedSourceKeys) !== JSON.stringify(op.relatedSourceKeys) ||
    !['committed', 'canceled'].includes(value.state) ||
    (value.state === 'committed'
      ? value.revision !== op.header.expectedRevision + 1
      : value.revision !== null) ||
    (op.phase === 'confirmed' && value.revision !== op.confirmedRevision)
  )
    invalid('O encerramento deste pedido ainda não pôde ser confirmado.');
}
