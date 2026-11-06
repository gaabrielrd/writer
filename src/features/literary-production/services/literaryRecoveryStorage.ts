export type LiterarySequenceMethod =
  'startLiterarySequence' | 'advanceLiterarySequence' | 'setLiterarySequenceControl';
export const LITERARY_SEQUENCE_METHODS: readonly LiterarySequenceMethod[] = [
  'startLiterarySequence',
  'advanceLiterarySequence',
  'setLiterarySequenceControl',
];
export interface LiteraryPendingOperation {
  version: 1;
  actorId: string;
  bookId: string;
  operationId: string;
  kind:
    | 'contract'
    | 'plan'
    | 'gate'
    | 'milestone'
    | 'prose'
    | 'proseApply'
    | 'review'
    | 'draft'
    | 'draftExecution'
    | 'workflow'
    | 'sequence'
    | 'integration'
    | 'integrationRecheck'
    | 'finding'
    | 'progress'
    | 'publication'
    | 'publicationGuide'
    | 'publicationConfirm';
  id: string;
  expectedRevision: number;
  wireHash: string;
  method?: LiterarySequenceMethod;
}
export const LITERARY_RECOVERY_EVENT = 'writer:literary-recovery';
const prefix = (actorId: string, bookId: string) =>
  'writer:literary-pending:' + encodeURIComponent(actorId) + ':' + encodeURIComponent(bookId) + ':';
const key = (entry: LiteraryPendingOperation) =>
  prefix(entry.actorId, entry.bookId) + entry.operationId;
const serialize = (entry: LiteraryPendingOperation) => JSON.stringify(entry);
function read(raw: string | null): LiteraryPendingOperation | null {
  if (!raw || raw.length > 12000) return null;
  try {
    const entry = JSON.parse(raw) as LiteraryPendingOperation;
    if (
      Object.keys(entry).sort().join(',') !==
        (entry.kind === 'sequence'
          ? 'actorId,bookId,expectedRevision,id,kind,method,operationId,version,wireHash'
          : 'actorId,bookId,expectedRevision,id,kind,operationId,version,wireHash') ||
      (entry.kind === 'sequence' &&
        (!entry.method || !LITERARY_SEQUENCE_METHODS.includes(entry.method))) ||
      entry.version !== 1 ||
      ![
        'contract',
        'plan',
        'gate',
        'milestone',
        'prose',
        'proseApply',
        'review',
        'draft',
        'draftExecution',
        'workflow',
        'sequence',
        'integration',
        'integrationRecheck',
        'finding',
        'progress',
        'publication',
        'publicationGuide',
        'publicationConfirm',
      ].includes(entry.kind) ||
      typeof entry.actorId !== 'string' ||
      !entry.actorId ||
      typeof entry.bookId !== 'string' ||
      !entry.bookId ||
      typeof entry.id !== 'string' ||
      !entry.id ||
      typeof entry.operationId !== 'string' ||
      !/^[a-zA-Z0-9-]{16,80}$/.test(entry.operationId) ||
      !Number.isSafeInteger(entry.expectedRevision) ||
      entry.expectedRevision < 0 ||
      typeof entry.wireHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.wireHash)
    )
      return null;
    return entry;
  } catch {
    return null;
  }
}
export async function beginLiteraryOperation(
  actorId: string,
  bookId: string,
  kind: LiteraryPendingOperation['kind'],
  id: string,
  input: { operationId: string; expectedRevision: number },
  method?: LiterarySequenceMethod,
) {
  if (!actorId) throw new Error('Entre na sua conta antes de salvar.');
  if (
    (kind === 'sequence') !== (method !== undefined) ||
    (method !== undefined && !LITERARY_SEQUENCE_METHODS.includes(method))
  )
    throw new Error('Identifique o método original da sequência.');
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const wireHash = Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  const entry: LiteraryPendingOperation = {
    version: 1,
    actorId,
    bookId,
    kind,
    id,
    operationId: input.operationId,
    expectedRevision: input.expectedRevision,
    wireHash,
    ...(method ? { method } : {}),
  };
  const existing = localStorage.getItem(key(entry));
  if (existing !== null && existing !== serialize(entry))
    throw new Error(
      'Este pedido tem outro acompanhamento local. Preserve os dados e confira a pendência.',
    );
  localStorage.setItem(key(entry), serialize(entry));
  window.dispatchEvent(new Event(LITERARY_RECOVERY_EVENT));
  return entry;
}
/** Metadata recovered from an authorized native outcome; this never sends a producer. */
export function rememberLiterarySequenceOperation(entry: LiteraryPendingOperation) {
  if (
    entry.kind !== 'sequence' ||
    entry.method !== 'advanceLiterarySequence' ||
    !read(serialize(entry))
  )
    throw new Error('A referência nativa da retomada está inválida.');
  const existing = localStorage.getItem(key(entry));
  if (existing !== null && existing !== serialize(entry))
    throw new Error('O acompanhamento local mudou. Preserve a pendência original.');
  localStorage.setItem(key(entry), serialize(entry));
  window.dispatchEvent(new Event(LITERARY_RECOVERY_EVENT));
}
export function finishLiteraryOperation(entry: LiteraryPendingOperation) {
  const existing = localStorage.getItem(key(entry));
  if (existing !== null && existing !== serialize(entry))
    throw new Error('O acompanhamento local mudou. Confira a pendência antes de encerrar.');
  localStorage.removeItem(key(entry));
  window.dispatchEvent(new Event(LITERARY_RECOVERY_EVENT));
}
export function listLiteraryPendingOperations(actorId: string, bookId: string) {
  const result: LiteraryPendingOperation[] = [];
  const scopedPrefix = prefix(actorId, bookId);
  for (let index = 0; index < localStorage.length; index++) {
    const name = localStorage.key(index);
    if (!name?.startsWith(scopedPrefix)) continue;
    const entry = read(localStorage.getItem(name));
    if (!entry || entry.actorId !== actorId || entry.bookId !== bookId || name !== key(entry))
      throw new Error(
        'Há um acompanhamento editorial inválido neste navegador. Preserve os dados para recuperação.',
      );
    result.push(entry);
  }
  return result;
}
export async function withLiteraryRecovery<T>(
  actorId: string,
  bookId: string,
  kind: Exclude<LiteraryPendingOperation['kind'], 'sequence'>,
  id: string,
  input: { operationId: string; expectedRevision: number },
  send: () => Promise<T>,
): Promise<T> {
  const entry = await beginLiteraryOperation(actorId, bookId, kind, id, input);
  let result: T;
  try {
    result = await send();
  } catch (cause) {
    const code =
      typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
    if (
      [
        'functions/invalid-argument',
        'functions/failed-precondition',
        'functions/not-found',
        'functions/permission-denied',
        'functions/unauthenticated',
        'functions/resource-exhausted',
      ].includes(code)
    )
      finishLiteraryOperation(entry);
    throw cause;
  }
  finishLiteraryOperation(entry);
  return result;
}
