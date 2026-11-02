import type {
  AdventureBlockResource,
  PendingAdventureBlockOperation,
} from '../model/adventureBlock';
export interface AdventureBlockDraft {
  content: string;
  revision: number;
  savedAt: number;
}
const sceneKey = (uid: string, adventureId: string, sceneId: string) =>
  JSON.stringify([uid, adventureId, sceneId]);
const pendingKey = (uid: string, adventureId: string, sceneId: string) =>
  'writer:adventure-block-operation:' + sceneKey(uid, adventureId, sceneId);
const draftKey = (
  uid: string,
  adventureId: string,
  sceneId: string,
  resource: AdventureBlockResource,
) =>
  'writer:adventure-block-draft:' +
  JSON.stringify([uid, adventureId, sceneId, resource.kind, resource.id]);
const methods = [
  'setAdventureBlockImage',
  'createAdventureBlock',
  'updateAdventureBlock',
  'duplicateAdventureBlock',
  'moveAdventureBlock',
  'archiveAdventureBlock',
  'deleteAdventureBlock',
  'verifyAdventureBlockCount',
];
function validPending(
  value: unknown,
  adventureId: string,
  sceneId: string,
): value is PendingAdventureBlockOperation {
  if (!value || typeof value !== 'object') return false;
  const entry = value as PendingAdventureBlockOperation;
  if (
    !methods.includes(entry.method) ||
    !entry.input ||
    entry.input.adventureId !== adventureId ||
    typeof entry.input.operationId !== 'string' ||
    !entry.input.operationId
  )
    return false;
  if ('sceneId' in entry.input && entry.input.sceneId !== sceneId) return false;
  if (
    'resource' in entry.input &&
    (!entry.input.resource ||
      !['scene', 'block'].includes(entry.input.resource.kind) ||
      typeof entry.input.resource.id !== 'string' ||
      !entry.input.resource.id)
  )
    return false;
  if ('blockId' in entry.input && (typeof entry.input.blockId !== 'string' || !entry.input.blockId))
    return false;
  if (
    'expectedRevision' in entry.input &&
    (!Number.isSafeInteger(entry.input.expectedRevision) || entry.input.expectedRevision < 1)
  )
    return false;
  return true;
}
export function readPendingAdventureBlockOperation(
  uid: string,
  adventureId: string,
  sceneId: string,
): PendingAdventureBlockOperation | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(pendingKey(uid, adventureId, sceneId)) ?? 'null',
    );
    return validPending(value, adventureId, sceneId) ? value : null;
  } catch {
    return null;
  }
}
export function writePendingAdventureBlockOperation(
  uid: string,
  adventureId: string,
  sceneId: string,
  operation: PendingAdventureBlockOperation,
): void {
  if (!validPending(operation, adventureId, sceneId))
    throw new Error('Não foi possível preservar o pedido deste bloco.');
  const prior = readPendingAdventureBlockOperation(uid, adventureId, sceneId);
  if (prior && prior.input.operationId !== operation.input.operationId)
    throw new Error('Confirme a operação pendente desta cena antes de continuar.');
  localStorage.setItem(pendingKey(uid, adventureId, sceneId), JSON.stringify(operation));
}
export function clearPendingAdventureBlockOperation(
  uid: string,
  adventureId: string,
  sceneId: string,
  operationId: string,
): void {
  if (
    readPendingAdventureBlockOperation(uid, adventureId, sceneId)?.input.operationId === operationId
  )
    localStorage.removeItem(pendingKey(uid, adventureId, sceneId));
}
export function readAdventureBlockDraft(
  uid: string,
  adventureId: string,
  sceneId: string,
  resource: AdventureBlockResource,
): AdventureBlockDraft | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(draftKey(uid, adventureId, sceneId, resource)) ?? 'null',
    ) as AdventureBlockDraft | null;
    return value &&
      typeof value.content === 'string' &&
      Number.isSafeInteger(value.revision) &&
      value.revision > 0 &&
      Number.isFinite(value.savedAt) &&
      value.savedAt >= 0
      ? value
      : null;
  } catch {
    return null;
  }
}
export function writeAdventureBlockDraft(
  uid: string,
  adventureId: string,
  sceneId: string,
  resource: AdventureBlockResource,
  draft: AdventureBlockDraft,
): boolean {
  try {
    localStorage.setItem(draftKey(uid, adventureId, sceneId, resource), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}
export function clearAdventureBlockDraft(
  uid: string,
  adventureId: string,
  sceneId: string,
  resource: AdventureBlockResource,
  expectedContent: string,
): void {
  if (readAdventureBlockDraft(uid, adventureId, sceneId, resource)?.content === expectedContent)
    localStorage.removeItem(draftKey(uid, adventureId, sceneId, resource));
}
