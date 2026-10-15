import {
  sameVersionResource,
  sameVersionTarget,
  type PendingWorkHistoryOperation,
  type VersionResource,
  type VersionTarget,
} from '../model/workHistory';
const prefix = (uid: string, target: VersionTarget) =>
  `writer:work-history:${JSON.stringify([uid, target.kind, target.id])}:`;
const resourceOf = (pending: PendingWorkHistoryOperation) =>
  pending.kind === 'delete' ? pending.resource : pending.input.resource;
const key = (uid: string, pending: PendingWorkHistoryOperation) =>
  prefix(uid, pending.input.target) + JSON.stringify(resourceOf(pending));
function validPending(value: unknown, target: VersionTarget): value is PendingWorkHistoryOperation {
  if (!value || typeof value !== 'object') return false;
  const pending = value as PendingWorkHistoryOperation;
  if (
    !['create', 'restore', 'delete'].includes(pending.kind) ||
    !pending.input ||
    !pending.input.target ||
    !sameVersionTarget(pending.input.target, target) ||
    typeof pending.input.operationId !== 'string' ||
    !pending.input.operationId
  )
    return false;
  const resource = resourceOf(pending);
  if (
    !resource ||
    !['chapter', 'scene'].includes(resource.kind) ||
    typeof resource.id !== 'string' ||
    !resource.id ||
    (target.kind === 'adventure' && resource.kind === 'chapter')
  )
    return false;
  if (pending.kind === 'delete' || pending.kind === 'restore') {
    if (typeof pending.input.versionId !== 'string' || !pending.input.versionId) return false;
  }
  if (pending.kind !== 'delete' && !/^[a-f0-9]{64}$/.test(pending.input.expectedSourceToken))
    return false;
  if (
    pending.kind === 'create' &&
    pending.input.label !== undefined &&
    typeof pending.input.label !== 'string'
  )
    return false;
  return true;
}
/** Reads only the requested account/project/resource; no manuscript body is stored. */
export function readPendingWorkHistoryOperation(
  uid: string,
  target: VersionTarget,
  resource?: VersionResource,
): PendingWorkHistoryOperation | null {
  try {
    const start = prefix(uid, target);
    for (let index = 0; index < localStorage.length; index++) {
      const storageKey = localStorage.key(index);
      if (!storageKey?.startsWith(start)) continue;
      const raw = localStorage.getItem(storageKey);
      let value: unknown;
      try {
        value = JSON.parse(raw ?? 'null') as unknown;
      } catch {
        // A damaged entry belongs only to its resource, not to the entire project scan.
        continue;
      }
      if (
        validPending(value, target) &&
        (!resource || sameVersionResource(resource, resourceOf(value)))
      )
        return value;
    }
  } catch {
    /* A damaged recovery record never becomes a mutation request. */
  }
  return null;
}
export function writePendingWorkHistoryOperation(
  uid: string,
  pending: PendingWorkHistoryOperation,
): void {
  if (!validPending(pending, pending.input.target))
    throw new Error('Não foi possível preservar o pedido de histórico.');
  const input = pending.input;
  const safe =
    pending.kind === 'delete'
      ? {
          kind: pending.kind,
          resource: pending.resource,
          input: {
            target: input.target,
            operationId: input.operationId,
            versionId: pending.input.versionId,
          },
        }
      : pending.kind === 'create'
        ? {
            kind: pending.kind,
            input: {
              target: input.target,
              resource: pending.input.resource,
              operationId: input.operationId,
              expectedSourceToken: pending.input.expectedSourceToken,
              ...(pending.input.label !== undefined ? { label: pending.input.label } : {}),
            },
          }
        : {
            kind: pending.kind,
            input: {
              target: input.target,
              resource: pending.input.resource,
              operationId: input.operationId,
              expectedSourceToken: pending.input.expectedSourceToken,
              versionId: pending.input.versionId,
            },
          };
  localStorage.setItem(key(uid, pending), JSON.stringify(safe));
}
export function clearPendingWorkHistoryOperation(
  uid: string,
  pending: PendingWorkHistoryOperation,
): void {
  const storageKey = key(uid, pending);
  const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  if (
    validPending(stored, pending.input.target) &&
    stored.input.operationId === pending.input.operationId
  )
    localStorage.removeItem(storageKey);
}
