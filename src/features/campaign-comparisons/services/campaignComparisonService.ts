import {
  verifyCampaignBaseFields,
  type CampaignBaseChunk,
  type CampaignBaseItem,
} from '@/features/campaign-bases';
import type {
  ComparisonIdentity,
  ComparisonProgress,
  ComparisonSource,
  ComparisonMutationResult,
  StartComparisonCanceled,
  PendingComparison,
  ComparisonReadEnvelope,
  ComparisonChange,
  ComparisonGroup,
  ComparisonSide,
  ComparisonItemWindow,
  StartComparisonPending,
  ComparisonControl,
} from '../model/campaignComparison';
import * as api from './campaignComparisonCallables';
export * from './campaignComparisonCallables';
export const groups = [
  { value: 'source', label: 'Dados da origem' },
  { value: 'items', label: 'Conteúdo' },
  { value: 'references', label: 'Referências' },
  { value: 'images', label: 'Ilustrações' },
];
export const kinds = [
  { value: 'part', label: 'Partes' },
  { value: 'scene', label: 'Cenas' },
  { value: 'block', label: 'Blocos' },
  { value: 'arc', label: 'Arcos' },
  { value: 'milestone', label: 'Marcos' },
  { value: 'event', label: 'Cronologia' },
  { value: 'lore', label: 'Fichas de lore' },
];
export const changeLabels = {
  added: 'Adicionada',
  changed: 'Alterada',
  removed: 'Retirada',
  unchanged: 'Sem alteração',
};
export const stateLabels = {
  preparing: 'Em preparação',
  ready: 'Pronta para comparar',
  aborted: 'Interrompida',
  deleting: 'Descarte em andamento',
  deleted: 'Descartada',
};
export const phaseLabels = {
  parts: 'Partes',
  scenes: 'Cenas',
  blocks: 'Blocos',
  sceneReferences: 'Referências das cenas',
  arcs: 'Arcos',
  milestones: 'Marcos',
  events: 'Cronologia',
  narrativeLinks: 'Vínculos narrativos',
  lore: 'Lore referenciado',
  images: 'Ilustrações',
  finalizing: 'Conferência final',
  complete: 'Concluída',
  cleanup: 'Limpeza',
};
export const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 200 && !v.includes('/');
const date = (v: unknown) => integer(v) && v <= 8640000000000000;
export function fail(message = 'A resposta da comparação não pôde ser confirmada.'): never {
  throw Object.assign(new Error(message), { code: 'functions/unavailable' });
}
export function message(cause: unknown): string {
  return cause instanceof Error || cause instanceof DOMException
    ? cause.message
    : 'Não foi possível confirmar a operação. Repita o mesmo pedido.';
}
export function reason(cause: unknown): string {
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
    ? cause.code.replace(/^functions\//, '')
    : '';
}
export function keys(value: unknown, required: string[], optional: string[] = []): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    required.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some((k) => !required.includes(k) && !optional.includes(k))
  )
    fail();
}
export function budget(value: unknown): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 4 * 1024 * 1024)
    fail('A resposta ultrapassa o orçamento de leitura.');
}
const identityKeys = [
  'schemaVersion',
  'ownerId',
  'comparisonId',
  'campaignId',
  'campaignToken',
  'currentBaseId',
  'candidateBaseId',
];
export function validateIdentity(
  value: ComparisonIdentity,
  uid: string,
  expected: Partial<ComparisonIdentity> = {},
): void {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    !id(value.comparisonId) ||
    !id(value.campaignId) ||
    !hash(value.campaignToken) ||
    !hash(value.currentBaseId) ||
    !hash(value.candidateBaseId) ||
    Object.entries(expected).some(([k, v]) => value[k as keyof ComparisonIdentity] !== v)
  )
    fail('A identidade da comparação mudou. O pedido preservado não foi alterado.');
}
export function identityOf(value: ComparisonIdentity): ComparisonIdentity {
  return {
    schemaVersion: 1,
    ownerId: value.ownerId,
    comparisonId: value.comparisonId,
    campaignId: value.campaignId,
    campaignToken: value.campaignToken,
    currentBaseId: value.currentBaseId,
    candidateBaseId: value.candidateBaseId,
  };
}
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}
export function validateSource(
  value: ComparisonSource,
  uid: string,
  campaignId: string,
  currentBaseId: string,
): void {
  keys(value, [
    'schemaVersion',
    'ownerId',
    'campaignId',
    'campaignToken',
    'currentBaseId',
    'currentCapturedAt',
    'adventureId',
    'sourceToken',
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    value.campaignId !== campaignId ||
    value.currentBaseId !== currentBaseId ||
    !hash(value.campaignToken) ||
    !hash(value.currentBaseId) ||
    !hash(value.sourceToken) ||
    !id(value.adventureId) ||
    !date(value.currentCapturedAt)
  )
    fail();
}
export function validateProgress(
  value: ComparisonProgress,
  uid: string,
  expected: Partial<ComparisonIdentity> = {},
  minimum = 0,
): void {
  budget(value);
  keys(value, [
    ...identityKeys,
    'state',
    'phase',
    'checkpoint',
    'processed',
    'counts',
    'sourceAvailable',
    'cleanupComplete',
    'reason',
    'createdAt',
    'updatedAt',
  ]);
  validateIdentity(value, uid, expected);
  if (
    !Object.hasOwn(stateLabels, value.state) ||
    !Object.hasOwn(phaseLabels, value.phase) ||
    !integer(value.checkpoint) ||
    value.checkpoint < minimum ||
    typeof value.sourceAvailable !== 'boolean' ||
    typeof value.cleanupComplete !== 'boolean' ||
    !date(value.createdAt) ||
    !date(value.updatedAt) ||
    value.updatedAt < value.createdAt ||
    ![
      'source-changed',
      'source-unavailable',
      'campaign-changed',
      'campaign-unavailable',
      'base-changed',
      null,
    ].includes(value.reason) ||
    (value.state === 'deleted'
      ? !value.cleanupComplete || value.phase !== 'cleanup'
      : value.cleanupComplete) ||
    (value.state === 'ready' && value.phase !== 'complete')
  )
    fail();
  if (!value.sourceAvailable) {
    if (value.counts !== null || value.processed !== null) fail();
  } else {
    if (!integer(value.processed) || !value.counts) fail();
    keys(value.counts, [
      'part',
      'scene',
      'block',
      'arc',
      'milestone',
      'event',
      'lore',
      'loreReference',
      'image',
    ]);
    if (!Object.values(value.counts).every(integer)) fail();
  }
}
export function validateCanceled(
  value: StartComparisonCanceled,
  operation: StartComparisonPending,
): void {
  keys(value, ['kind', 'schemaVersion', 'ownerId', 'request']);
  if (
    value.kind !== 'canceled' ||
    value.schemaVersion !== 1 ||
    value.ownerId !== operation.ownerId ||
    canonical(value.request) !== canonical(operation.input)
  )
    fail('O encerramento do pedido inicial não pôde ser confirmado.');
}
export function validateMutation(
  value: ComparisonMutationResult,
  operation: PendingComparison,
  minimum = 0,
): void {
  keys(value, ['receipt', 'progress'], ['kind']);
  keys(value.receipt, ['operationId', 'action', 'expectedCheckpoint', 'confirmedCheckpoint']);
  const initial = operation.scope.kind === 'start';
  validateProgress(value.progress, operation.ownerId, operation.expected, minimum);
  const r = value.receipt;
  if (
    r.operationId !== operation.input.operationId ||
    r.action !==
      (initial
        ? 'start'
        : (operation as import('../model/campaignComparison').StepComparisonPending).method) ||
    r.expectedCheckpoint !==
      (initial
        ? null
        : (operation.input as import('../model/campaignComparison').StepComparisonInput)
            .expectedCheckpoint) ||
    !integer(r.confirmedCheckpoint) ||
    (initial ? r.confirmedCheckpoint !== 0 : r.confirmedCheckpoint < r.expectedCheckpoint!) ||
    value.progress.checkpoint < r.confirmedCheckpoint
  )
    fail('O recibo não confirma o mesmo pedido preservado.');
}
export function validateRead(
  value: ComparisonReadEnvelope,
  expected: ComparisonIdentity,
  token?: string,
  minimum = 0,
): void {
  budget(value);
  validateIdentity(value, expected.ownerId, expected);
  if (
    !date(value.currentCapturedAt) ||
    !date(value.candidateCapturedAt) ||
    !integer(value.collectionRevision) ||
    value.collectionRevision < minimum ||
    !hash(value.comparisonToken) ||
    (token !== undefined && token !== value.comparisonToken)
  )
    fail('A comparação ou sua autorização mudou. Reabra a comparação.');
}
export function validateCursor(cursor: unknown, seen?: Set<string>): void {
  if (cursor !== null && (typeof cursor !== 'string' || !cursor || seen?.has(cursor)))
    fail('A paginação da comparação mudou. Reabra a lista.');
}
export function validateChange(row: ComparisonChange, group: ComparisonGroup): void {
  keys(
    row,
    ['key', 'group', 'change', 'currentSummary', 'candidateSummary'],
    group === 'items' ? ['orderContextChanged', 'local', 'requiresReview'] : [],
  );
  if (
    row.group !== group ||
    !hash(row.key) ||
    !Object.hasOwn(changeLabels, row.change) ||
    (!row.currentSummary && !row.candidateSummary) ||
    (row.change === 'added'
      ? row.currentSummary !== null || !row.candidateSummary
      : row.change === 'removed'
        ? row.candidateSummary !== null || !row.currentSummary
        : !row.currentSummary || !row.candidateSummary)
  )
    fail();
  for (const v of [row.currentSummary, row.candidateSummary]) {
    if (!v) continue;
    if (row.group === 'source') {
      const s = v as { title: string; synopsis: string; language: string };
      keys(s, ['title', 'synopsis', 'language']);
      if (
        typeof s.title !== 'string' ||
        typeof s.synopsis !== 'string' ||
        s.synopsis.length > 4000 ||
        typeof s.language !== 'string'
      )
        fail();
    } else if (row.group === 'references') {
      const s = v as import('@/features/campaign-bases').CampaignBaseReference;
      keys(s, ['key', 'kind', 'sourceKey', 'targetKey', 'available']);
      if (
        s.key !== row.key ||
        !['scene', 'narrative'].includes(s.kind) ||
        !hash(s.sourceKey) ||
        typeof s.available !== 'boolean' ||
        (s.available ? !hash(s.targetKey) : s.targetKey !== null)
      )
        fail();
    } else if (row.group === 'images') {
      const s = v as { imageKey: string; preview: string };
      keys(s, ['imageKey', 'preview']);
      if (s.imageKey !== row.key || s.preview !== 'unchecked') fail();
    } else {
      const s = v as import('../model/campaignComparison').ComparisonItemSummary;
      keys(
        s,
        ['sourceKey', 'kind', 'parentKey', 'title', 'archived', 'orderContext'],
        ['stage', 'type', 'audience', 'role', 'dateLabel', 'category'],
      );
      if (
        s.sourceKey !== row.key ||
        !kinds.some((k) => k.value === s.kind) ||
        typeof s.title !== 'string' ||
        typeof s.archived !== 'boolean' ||
        (s.parentKey !== null && !hash(s.parentKey))
      )
        fail();
      if (s.kind === 'lore') {
        if (s.orderContext !== null) fail();
      } else {
        keys(s.orderContext, ['previousKey', 'nextKey']);
        if (
          ![s.orderContext!.previousKey, s.orderContext!.nextKey].every(
            (k) => k === null || hash(k),
          )
        )
          fail();
      }
      if (s.audience !== undefined && !['creator', 'gm', 'players'].includes(s.audience)) fail();
      if (s.role !== undefined && !['main', 'additional'].includes(s.role)) fail();
    }
  }
  if (row.group === 'items') {
    if (
      typeof row.orderContextChanged !== 'boolean' ||
      ((!row.currentSummary || !row.candidateSummary) && row.orderContextChanged)
    )
      fail();
    const lore = (row.currentSummary ?? row.candidateSummary)?.kind === 'lore';
    if (lore) {
      if (
        row.orderContextChanged ||
        typeof row.requiresReview !== 'boolean' ||
        row.local === undefined
      )
        fail();
      if (row.local) {
        keys(row.local, ['mode', 'revision']);
        if (
          !['base', 'override', 'removed'].includes(row.local.mode) ||
          !integer(row.local.revision)
        )
          fail();
      }
      if (
        row.requiresReview !==
        Boolean(row.change !== 'unchanged' && row.local && row.local.mode !== 'base')
      )
        fail();
    } else if (row.local !== undefined || row.requiresReview !== undefined) fail();
  }
}
export function validateItem(item: CampaignBaseItem, key: string): void {
  keys(
    item,
    [
      'sourceKey',
      'kind',
      'parentKey',
      'title',
      'archived',
      'orderKey',
      'fields',
      'structured',
      'image',
    ],
    ['stage', 'type', 'audience', 'role', 'dateLabel'],
  );
  if (
    item.sourceKey !== key ||
    !kinds.some((k) => k.value === item.kind) ||
    typeof item.title !== 'string' ||
    typeof item.archived !== 'boolean' ||
    typeof item.orderKey !== 'string' ||
    !Array.isArray(item.fields) ||
    !item.structured
  )
    fail();
  if (item.image) {
    keys(item.image, ['imageKey', 'alt', 'caption']);
    if (
      !hash(item.image.imageKey) ||
      typeof item.image.alt !== 'string' ||
      typeof item.image.caption !== 'string'
    )
      fail();
  }
}
export async function readCompleteComparisonItem(
  identity: ComparisonIdentity,
  side: ComparisonSide,
  key: string,
  token: string,
  revision: number,
  isCurrent: () => boolean,
  observe?: (value: ComparisonReadEnvelope) => void,
): Promise<{ item: CampaignBaseItem; fields: Record<string, string> } | null> {
  let first: (ComparisonItemWindow & { item: CampaignBaseItem }) | null = null,
    cursor: string | null = null;
  const chunks: CampaignBaseChunk[] = [],
    seen = new Set<string>();
  do {
    if (!isCurrent()) return null;
    const page = await api.readCampaignComparisonItem({
      comparisonId: identity.comparisonId,
      sourceKey: key,
      side,
      cursor,
      limit: 4,
    });
    if (!isCurrent()) return null;
    // Every text window participates in the same compound context as lists and media.
    // Observe before rejecting a cursor/window mismatch so a new gate clears both sides.
    observe?.(page);
    if (!isCurrent()) return null;
    validateRead(page, identity, token, revision);
    if (
      page.collectionRevision !== revision ||
      (first &&
        (page.currentCapturedAt !== first.currentCapturedAt ||
          page.candidateCapturedAt !== first.candidateCapturedAt))
    )
      fail('O contexto do texto mudou. Reabra a comparação.');
    keys(page, [
      ...identityKeys,
      'currentCapturedAt',
      'candidateCapturedAt',
      'collectionRevision',
      'comparisonToken',
      'side',
      'key',
      'item',
      'chunks',
      'nextCursor',
    ]);
    if (page.side !== side || page.key !== key || !page.item)
      fail('Este lado deixou de estar disponível. Reabra a comparação.');
    validateItem(page.item, key);
    if (
      !Array.isArray(page.chunks) ||
      page.chunks.length > 8 ||
      (first && canonical(page.item) !== canonical(first.item))
    )
      fail();
    first ??= { ...page, item: page.item };
    const total = first.item.fields.reduce((n, f) => n + f.chunkCount, 0);
    if (!integer(total) || chunks.length + page.chunks.length > total) fail();
    chunks.push(...page.chunks);
    validateCursor(page.nextCursor, seen);
    cursor = page.nextCursor;
    if (cursor) seen.add(cursor);
  } while (cursor);
  const fields = await verifyCampaignBaseFields(first.item.fields, chunks, isCurrent);
  if (!isCurrent()) return null;
  return { item: first.item, fields };
}
export function validateImage(data: string): string {
  if (typeof data !== 'string' || !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))
    fail('A ilustração não pôde ser confirmada.');
  const encoded = data.slice(data.indexOf(',') + 1),
    bytes = (encoded.length * 3) / 4 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (encoded.length % 4 || bytes > 1.5 * 1024 * 1024) fail();
  return data;
}
export function validateControl(value: ComparisonControl, uid: string, campaignId: string): void {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    !value.scope ||
    !['start', 'job', 'known'].includes(value.scope.kind) ||
    value.scope.campaignId !== campaignId
  )
    fail('O controle local não pôde ser lido. Ele foi preservado.');
  if (value.scope.kind === 'start' && 'phase' in value) {
    keys(value, ['schemaVersion', 'ownerId', 'scope', 'phase', 'input', 'expected']);
    keys(value.scope, ['kind', 'campaignId']);
    keys(value.input, [
      'operationId',
      'campaignId',
      'campaignToken',
      'currentBaseId',
      'expectedSourceToken',
    ]);
    keys(value.expected, ['comparisonId', 'campaignId', 'campaignToken', 'currentBaseId']);
    if (
      !['request', 'cancel-start'].includes(value.phase) ||
      !id(value.input.operationId) ||
      value.input.campaignId !== campaignId ||
      !hash(value.input.campaignToken) ||
      !hash(value.input.currentBaseId) ||
      !hash(value.input.expectedSourceToken) ||
      value.expected.comparisonId !== value.input.operationId ||
      value.expected.campaignId !== campaignId ||
      value.expected.campaignToken !== value.input.campaignToken ||
      value.expected.currentBaseId !== value.input.currentBaseId
    )
      fail();
  } else {
    keys(value, [
      'schemaVersion',
      'ownerId',
      'scope',
      'expected',
      ...(value.scope.kind === 'known' ? ['checkpoint'] : ['method', 'input']),
    ]);
    keys(value.scope, ['kind', 'campaignId', 'comparisonId']);
    keys(value.expected, identityKeys);
    if (!('comparisonId' in value.scope)) fail();
    validateIdentity(value.expected as ComparisonIdentity, uid, {
      campaignId,
      comparisonId: value.scope.comparisonId,
    });
    if (value.scope.kind === 'known') {
      if (
        !integer((value as import('../model/campaignComparison').KnownComparisonControl).checkpoint)
      )
        fail();
    } else {
      const v = value as import('../model/campaignComparison').StepComparisonPending;
      keys(v.input, ['comparisonId', 'operationId', 'expectedCheckpoint']);
      if (
        !['advance', 'cancel'].includes(v.method) ||
        v.input.comparisonId !== v.scope.comparisonId ||
        !id(v.input.operationId) ||
        !integer(v.input.expectedCheckpoint)
      )
        fail();
    }
  }
}
