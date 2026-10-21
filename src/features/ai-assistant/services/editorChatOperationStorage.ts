import {
  editorChatSourceId,
  normalizeEditorChatJournalScope,
} from '../../../../functions/src/editorChatContracts.mjs';
import {
  canonicalEditorChatJSON,
  normalizeEditorChatDTO,
  type EditorChatOperationRow,
  type EditorChatJournalScope,
} from '../model/editorChat';

const pulse = 'writer:editor-chat-operation:change';
export class EditorChatStorageError extends Error {
  readonly reason:
    'unavailable' | 'corrupt' | 'conflict' | 'locks-unavailable' | 'invalid-transition';
  constructor(
    reason: 'unavailable' | 'corrupt' | 'conflict' | 'locks-unavailable' | 'invalid-transition',
  ) {
    super('Não foi possível atualizar o controle do pedido. Confira o estado antes de continuar.');
    this.name = 'EditorChatStorageError';
    this.reason = reason;
  }
}
export function editorChatOperationKey(uid: string, scope: EditorChatJournalScope): string {
  normalizeEditorChatJournalScope({
    target: scope.target,
    resource: scope.resource,
  });
  editorChatSourceId(uid);
  return (
    'writer:editor-chat-operation:' +
    JSON.stringify([
      uid,
      scope.target.kind,
      scope.target.id,
      scope.resource?.kind ?? null,
      scope.resource?.id ?? null,
    ])
  );
}
function checkedRow(
  value: unknown,
  uid: string,
  scope: EditorChatJournalScope,
): EditorChatOperationRow {
  const row = normalizeEditorChatDTO('journal', value);
  if (
    row.ownerId !== uid ||
    canonicalEditorChatJSON({ target: row.target, resource: row.resource }) !==
      canonicalEditorChatJSON({ target: scope.target, resource: scope.resource })
  )
    throw new EditorChatStorageError('conflict');
  return row;
}
export function readEditorChatOperation(
  uid: string,
  scope: EditorChatJournalScope,
): EditorChatOperationRow | null {
  const key = editorChatOperationKey(uid, scope);
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    throw new EditorChatStorageError('unavailable');
  }
  if (raw === null) return null;
  try {
    return checkedRow(JSON.parse(raw), uid, scope);
  } catch {
    throw new EditorChatStorageError('corrupt');
  }
}
export function assertEditorChatOperation(
  expected: EditorChatOperationRow,
  check: () => void,
): void {
  check();
  checkedRow(expected, expected.ownerId, expected);
  if (
    canonicalEditorChatJSON(readEditorChatOperation(expected.ownerId, expected)) !==
    canonicalEditorChatJSON(expected)
  )
    throw new EditorChatStorageError('conflict');
  check();
}
const immutable = [
  'ownerId',
  'target',
  'resource',
  'action',
  'operationId',
  'requestHash',
  'generation',
] as const;
const identities = [
  'projectToken',
  'resourceToken',
  'contextId',
  'contextToken',
  'conversationId',
  'conversationToken',
  'turnId',
  'attemptToken',
  'cleanupId',
  'cleanupToken',
  'expectedRevision',
] as const;
function transition(
  before: EditorChatOperationRow | null,
  after: EditorChatOperationRow | null,
): void {
  if (!before) {
    if (
      !after ||
      after.localGeneration !== 0 ||
      after.state !== 'pending' ||
      after.intent !== 'observe'
    )
      throw new EditorChatStorageError('invalid-transition');
    return;
  }
  if (!after) {
    if (before.state !== 'settled') throw new EditorChatStorageError('invalid-transition');
    return;
  }
  if (before.operationId !== after.operationId) {
    if (
      before.state !== 'settled' ||
      after.state !== 'pending' ||
      after.intent !== 'observe' ||
      after.localGeneration !== 0 ||
      ['ownerId', 'target', 'resource'].some(
        (key) =>
          canonicalEditorChatJSON(before[key as keyof EditorChatOperationRow]) !==
          canonicalEditorChatJSON(after[key as keyof EditorChatOperationRow]),
      )
    )
      throw new EditorChatStorageError('invalid-transition');
    return;
  }
  if (
    !Number.isSafeInteger(before.localGeneration + 1) ||
    after.localGeneration !== before.localGeneration + 1 ||
    immutable.some(
      (key) => canonicalEditorChatJSON(before[key]) !== canonicalEditorChatJSON(after[key]),
    ) ||
    identities.some((key) => before[key] !== null && before[key] !== after[key]) ||
    (before.intent === 'cancel' && after.intent !== 'cancel') ||
    (before.state === 'settled' && after.state !== 'settled') ||
    (before.state === 'uncertain' && after.state === 'pending')
  )
    throw new EditorChatStorageError('invalid-transition');
}
export const editorChatOperationLocksAvailable = () =>
  typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';

/** The callback is synchronous: locks cover local CAS only, never hashing or network I/O. */
export async function compareEditorChatOperation(
  uid: string,
  scope: EditorChatJournalScope,
  expected: EditorChatOperationRow | null,
  next: EditorChatOperationRow | null,
  check: () => void,
): Promise<EditorChatOperationRow | null> {
  const key = editorChatOperationKey(uid, scope);
  const before = expected === null ? null : checkedRow(expected, uid, scope);
  const after = next === null ? null : checkedRow(next, uid, scope);
  transition(before, after);
  if (!editorChatOperationLocksAvailable()) throw new EditorChatStorageError('locks-unavailable');
  check();
  return navigator.locks.request(key, () => {
    check();
    if (
      canonicalEditorChatJSON(readEditorChatOperation(uid, scope)) !==
      canonicalEditorChatJSON(before)
    )
      throw new EditorChatStorageError('conflict');
    try {
      if (after === null) localStorage.removeItem(key);
      else localStorage.setItem(key, canonicalEditorChatJSON(after));
    } catch {
      throw new EditorChatStorageError('unavailable');
    }
    const saved = readEditorChatOperation(uid, scope);
    if (canonicalEditorChatJSON(saved) !== canonicalEditorChatJSON(after))
      throw new EditorChatStorageError('conflict');
    check();
    window.dispatchEvent(new CustomEvent(pulse, { detail: key }));
    return saved;
  });
}
export function reserveEditorChatOperation(
  value: EditorChatOperationRow,
  check: () => void,
): Promise<EditorChatOperationRow | null> {
  return compareEditorChatOperation(value.ownerId, value, null, value, check);
}
/** Atomically replace a confirmed control with a different intent; never erase between operations. */
export function handoffEditorChatOperation(
  expected: EditorChatOperationRow,
  next: EditorChatOperationRow,
  check: () => void,
): Promise<EditorChatOperationRow | null> {
  if (expected.operationId === next.operationId)
    return Promise.reject(new EditorChatStorageError('invalid-transition'));
  return compareEditorChatOperation(expected.ownerId, expected, expected, next, check);
}
export function cancelEditorChatOperation(
  expected: EditorChatOperationRow,
  check: () => void,
): Promise<EditorChatOperationRow | null> {
  return compareEditorChatOperation(
    expected.ownerId,
    expected,
    expected,
    {
      ...expected,
      intent: 'cancel',
      localGeneration: expected.localGeneration + 1,
    },
    check,
  );
}
export function forgetEditorChatOperation(
  expected: EditorChatOperationRow,
  check: () => void,
): Promise<EditorChatOperationRow | null> {
  return compareEditorChatOperation(expected.ownerId, expected, expected, null, check);
}
export function subscribeEditorChatOperation(
  uid: string,
  scope: EditorChatJournalScope,
  listener: () => void,
): () => void {
  const key = editorChatOperationKey(uid, scope);
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === key) listener();
  };
  const changed = (event: Event) => {
    if ((event as CustomEvent<string>).detail === key) listener();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(pulse, changed);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(pulse, changed);
  };
}
