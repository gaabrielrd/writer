import type {
  AdoptionIdentity,
  AdoptionProgress,
  AdoptionControl,
  PendingAdoption,
  AdoptionMutationResult,
  StartAdoptionPending,
  StartAdoptionCanceled,
  AdoptionDecision,
  AdoptionDecisionsPage,
} from '../model/campaignAdoption';
export * from './campaignAdoptionCallables';
export const stateLabels = {
  reviewing: 'Em revisão',
  preparing: 'Preparando atualização',
  ready: 'Pronta para adotar',
  adopted: 'Base adotada',
  aborted: 'Preparação interrompida',
  deleting: 'Cancelamento em andamento',
  deleted: 'Preparação cancelada',
};
export const phaseLabels = {
  review: 'Escolhas da mesa',
  operations: 'Conferindo pedidos preservados',
  overlays: 'Preparando lore da mesa',
  authorization: 'Conferindo permissões atuais',
  complete: 'Concluída',
  cleanup: 'Liberando preparação',
};
export const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 200 && !v.includes('/');
const date = (v: unknown) => integer(v) && v <= 8640000000000000;
export function fail(text = 'A resposta da adoção não pôde ser confirmada.'): never {
  throw Object.assign(new Error(text), { code: 'functions/unavailable' });
}
export function message(cause: unknown) {
  return cause instanceof Error || cause instanceof DOMException
    ? cause.message
    : 'Não foi possível confirmar o pedido. Repita o mesmo pedido.';
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
export function keys(value: unknown, required: string[], optional: string[] = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    required.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some((k) => !required.includes(k) && !optional.includes(k))
  )
    fail();
}
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}
export function budget(value: unknown) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 4 * 1024 * 1024)
    fail('A resposta ultrapassa o orçamento de leitura.');
}
export const identityKeys = [
  'schemaVersion',
  'ownerId',
  'adoptionId',
  'campaignId',
  'campaignToken',
  'comparisonId',
  'currentBaseId',
  'candidateBaseId',
  'loreGenerationId',
  'expectedCollectionRevision',
];
export function identityOf(v: AdoptionIdentity): AdoptionIdentity {
  return {
    schemaVersion: 1,
    ownerId: v.ownerId,
    adoptionId: v.adoptionId,
    campaignId: v.campaignId,
    campaignToken: v.campaignToken,
    comparisonId: v.comparisonId,
    currentBaseId: v.currentBaseId,
    candidateBaseId: v.candidateBaseId,
    loreGenerationId: v.loreGenerationId,
    expectedCollectionRevision: v.expectedCollectionRevision,
  };
}
export function validateIdentity(
  v: AdoptionIdentity,
  uid: string,
  expected: Partial<AdoptionIdentity> = {},
) {
  if (
    !v ||
    v.schemaVersion !== 1 ||
    v.ownerId !== uid ||
    !id(v.adoptionId) ||
    !id(v.campaignId) ||
    !id(v.comparisonId) ||
    ![v.campaignToken, v.currentBaseId, v.candidateBaseId, v.loreGenerationId].every(hash) ||
    !integer(v.expectedCollectionRevision) ||
    Object.entries(expected).some(([k, x]) => v[k as keyof AdoptionIdentity] !== x)
  )
    fail('A identidade da adoção mudou. O pedido foi preservado.');
}
export function validateProgress(
  v: AdoptionProgress,
  uid: string,
  expected: Partial<AdoptionIdentity> = {},
  minimum = 0,
) {
  budget(v);
  keys(v, [
    ...identityKeys,
    'state',
    'phase',
    'checkpoint',
    'processed',
    'sourceAvailable',
    'cleanupComplete',
    'reason',
    'createdAt',
    'updatedAt',
  ]);
  validateIdentity(v, uid, expected);
  if (
    !Object.hasOwn(stateLabels, v.state) ||
    !Object.hasOwn(phaseLabels, v.phase) ||
    !integer(v.checkpoint) ||
    v.checkpoint < minimum ||
    typeof v.sourceAvailable !== 'boolean' ||
    typeof v.cleanupComplete !== 'boolean' ||
    !date(v.createdAt) ||
    !date(v.updatedAt) ||
    v.updatedAt < v.createdAt ||
    (v.reason !== null && typeof v.reason !== 'string') ||
    (v.sourceAvailable ? v.processed !== null && !integer(v.processed) : v.processed !== null) ||
    (v.state === 'deleted' ? !v.cleanupComplete || v.phase !== 'cleanup' : v.cleanupComplete) ||
    (['ready', 'adopted'].includes(v.state) && v.phase !== 'complete')
  )
    fail();
}
export function validateCanceled(value: StartAdoptionCanceled, op: StartAdoptionPending) {
  keys(value, ['kind', 'schemaVersion', 'ownerId', 'request']);
  if (
    value.kind !== 'canceled' ||
    value.schemaVersion !== 1 ||
    value.ownerId !== op.ownerId ||
    canonical(value.request) !== canonical(op.input)
  )
    fail('O encerramento inicial não foi confirmado.');
}
export function validateMutation(value: AdoptionMutationResult, op: PendingAdoption, minimum = 0) {
  keys(value, ['receipt', 'progress'], ['kind']);
  const initial = 'phase' in op,
    action = initial ? 'start' : op.method,
    r = value.receipt,
    decide = !initial && op.method === 'decide';
  keys(
    r,
    ['operationId', 'action', 'expectedCheckpoint', 'confirmedCheckpoint', 'outcome'],
    decide ? ['sourceKey', 'expectedRevision', 'choice'] : [],
  );
  validateProgress(value.progress, op.ownerId, op.expected, minimum);
  if (
    r.operationId !== op.input.operationId ||
    r.action !== action ||
    r.expectedCheckpoint !== (initial ? null : op.input.expectedCheckpoint) ||
    !integer(r.confirmedCheckpoint) ||
    (initial ? r.confirmedCheckpoint !== 0 : r.confirmedCheckpoint <= r.expectedCheckpoint!) ||
    value.progress.checkpoint < r.confirmedCheckpoint ||
    !['confirmed', 'reauthorization-required'].includes(r.outcome)
  )
    fail('O recibo não confirma o mesmo pedido preservado.');
  if (decide) {
    if (
      !('sourceKey' in op.input) ||
      r.sourceKey !== op.input.sourceKey ||
      r.expectedRevision !== op.input.expectedRevision ||
      r.choice !== op.input.choice
    )
      fail('A escolha confirmada é diferente do pedido preservado.');
  }
  if (
    r.outcome === 'reauthorization-required' &&
    (!['advance', 'activate'].includes(r.action) ||
      value.progress.state !== 'preparing' ||
      value.progress.phase !== 'authorization')
  )
    fail();
  if (
    r.action === 'activate' &&
    r.outcome === 'confirmed' &&
    !['adopted', 'aborted'].includes(value.progress.state)
  )
    fail();
}
export function validateDecision(v: AdoptionDecision) {
  keys(v, [
    'sourceKey',
    'revision',
    'mode',
    'legacy',
    'current',
    'candidate',
    'choice',
    'required',
    'impediments',
  ]);
  keys(v.current, ['name', 'category']);
  keys(v.candidate, ['present'], v.candidate?.present ? ['name', 'category'] : []);
  const categories = ['character', 'location', 'concept', 'other'];
  if (
    !hash(v.sourceKey) ||
    !integer(v.revision) ||
    !['base', 'override', 'removed'].includes(v.mode) ||
    typeof v.legacy !== 'boolean' ||
    typeof v.current.name !== 'string' ||
    !v.current.name.trim() ||
    !categories.includes(v.current.category) ||
    typeof v.candidate.present !== 'boolean' ||
    (v.candidate.present &&
      (typeof v.candidate.name !== 'string' || !categories.includes(v.candidate.category))) ||
    typeof v.required !== 'boolean' ||
    !Array.isArray(v.impediments) ||
    !v.impediments.every((x) => typeof x === 'string') ||
    (v.choice !== null &&
      !(
        v.candidate.present ? ['keep-local', 'use-candidate'] : ['keep-local', 'discard-local']
      ).includes(v.choice))
  )
    fail();
}
export function validateDecisionPage(
  v: AdoptionDecisionsPage,
  uid: string,
  expected: AdoptionIdentity,
  minimum = 0,
) {
  budget(v);
  keys(v, [
    ...identityKeys,
    'currentCapturedAt',
    'candidateCapturedAt',
    'checkpoint',
    'projectionToken',
    'items',
    'nextCursor',
  ]);
  validateIdentity(v, uid, expected);
  if (
    !date(v.currentCapturedAt) ||
    !date(v.candidateCapturedAt) ||
    !integer(v.checkpoint) ||
    v.checkpoint < minimum ||
    !hash(v.projectionToken) ||
    !Array.isArray(v.items) ||
    v.items.length > 50
  )
    fail();
  v.items.forEach(validateDecision);
  validateCursor(v.nextCursor);
}
export function validateCursor(v: unknown, seen?: Set<string>) {
  if (v !== null && (typeof v !== 'string' || !v || seen?.has(v)))
    fail('A paginação mudou. Consulte a revisão novamente.');
}
export function validateControl(v: AdoptionControl, uid: string, campaignId: string) {
  if (
    !v ||
    v.schemaVersion !== 1 ||
    v.ownerId !== uid ||
    !v.scope ||
    v.scope.campaignId !== campaignId ||
    !['start', 'job', 'known'].includes(v.scope.kind)
  )
    fail('O controle local inválido foi preservado.');
  if ('phase' in v) {
    keys(v, ['schemaVersion', 'ownerId', 'scope', 'phase', 'input', 'expected']);
    keys(v.scope, ['kind', 'campaignId']);
    keys(v.input, [
      'operationId',
      'campaignId',
      'campaignToken',
      'comparisonId',
      'currentBaseId',
      'candidateBaseId',
      'expectedCollectionRevision',
    ]);
    keys(v.expected, [
      'adoptionId',
      'campaignId',
      'campaignToken',
      'comparisonId',
      'currentBaseId',
      'candidateBaseId',
      'expectedCollectionRevision',
    ]);
    if (
      v.scope.kind !== 'start' ||
      !['request', 'cancel-start'].includes(v.phase) ||
      !id(v.input.operationId) ||
      v.input.campaignId !== campaignId ||
      !id(v.input.comparisonId) ||
      ![v.input.campaignToken, v.input.currentBaseId, v.input.candidateBaseId].every(hash) ||
      !integer(v.input.expectedCollectionRevision) ||
      canonical(v.expected) !==
        canonical({
          adoptionId: v.input.operationId,
          campaignId,
          ...Object.fromEntries(
            Object.entries(v.input).filter(([k]) => !['operationId', 'campaignId'].includes(k)),
          ),
        })
    )
      fail();
  } else {
    keys(v, [
      'schemaVersion',
      'ownerId',
      'scope',
      'expected',
      ...('checkpoint' in v ? ['checkpoint'] : ['method', 'input']),
    ]);
    keys(v.scope, ['kind', 'campaignId', 'adoptionId']);
    keys(v.expected, identityKeys);
    validateIdentity(v.expected, uid, { campaignId, adoptionId: v.scope.adoptionId });
    if ('checkpoint' in v) {
      if (v.scope.kind !== 'known' || !integer(v.checkpoint)) fail();
    } else {
      const deciding = v.method === 'decide';
      keys(
        v.input,
        ['adoptionId', 'operationId', 'expectedCheckpoint'],
        deciding ? ['sourceKey', 'expectedRevision', 'choice'] : [],
      );
      if (
        v.scope.kind !== 'job' ||
        !['decide', 'prepare', 'advance', 'activate', 'cancel'].includes(v.method) ||
        v.input.adoptionId !== v.scope.adoptionId ||
        !id(v.input.operationId) ||
        !integer(v.input.expectedCheckpoint)
      )
        fail();
      if (
        deciding &&
        (!('sourceKey' in v.input) ||
          !hash(v.input.sourceKey) ||
          !integer(v.input.expectedRevision) ||
          !['keep-local', 'use-candidate', 'discard-local'].includes(v.input.choice))
      )
        fail();
    }
  }
}
