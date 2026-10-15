import type { PendingCampaignCaptureOperation } from '../model/campaignBase';
export type CampaignCaptureRecoveryScope =
  { kind: 'start'; adventureId: string } | { kind: 'capture'; captureId: string };
export interface PendingCampaignCaptureControl {
  scope: CampaignCaptureRecoveryScope;
  adventureId: string;
  captureId: string;
}
export function listPendingCampaignCaptureControls(
  uid: string,
  adventureId?: string,
): { items: PendingCampaignCaptureControl[]; unreadable: boolean } {
  const items: PendingCampaignCaptureControl[] = [];
  let unreadable = false;
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const storedKey = localStorage.key(index);
      if (!storedKey?.startsWith('writer:campaign-capture:')) continue;
      let identity: unknown;
      try {
        identity = JSON.parse(storedKey.slice('writer:campaign-capture:'.length));
      } catch {
        continue;
      }
      if (
        !Array.isArray(identity) ||
        identity.length !== 3 ||
        identity[0] !== uid ||
        typeof identity[2] !== 'string'
      )
        continue;
      const scope: CampaignCaptureRecoveryScope | null =
        identity[1] === 'start'
          ? { kind: 'start', adventureId: identity[2] }
          : identity[1] === 'capture'
            ? { kind: 'capture', captureId: identity[2] }
            : null;
      if (!scope) continue;
      try {
        const operation = readPendingCampaignCapture(uid, scope);
        if (!operation) continue;
        const source =
          operation.method === 'startCampaignCapture'
            ? operation.input.adventureId
            : operation.expected.adventureId;
        if (adventureId === undefined || source === adventureId)
          items.push({
            scope,
            adventureId: source,
            captureId:
              operation.method === 'startCampaignCapture'
                ? operation.input.operationId
                : operation.input.captureId,
          });
      } catch {
        unreadable = true;
      }
    }
  } catch {
    unreadable = true;
  }
  return { items, unreadable };
}
const key = (uid: string, scope: CampaignCaptureRecoveryScope) =>
  'writer:campaign-capture:' +
  JSON.stringify([uid, scope.kind, scope.kind === 'start' ? scope.adventureId : scope.captureId]);
function valid(
  value: unknown,
  scope: CampaignCaptureRecoveryScope,
): value is PendingCampaignCaptureOperation {
  if (!value || typeof value !== 'object') return false;
  const operation = value as PendingCampaignCaptureOperation;
  if (Object.keys(operation).some((field) => !['method', 'input', 'expected'].includes(field)))
    return false;
  if (
    !operation.input ||
    typeof operation.input.operationId !== 'string' ||
    !operation.input.operationId
  )
    return false;
  if (scope.kind === 'start')
    return (
      operation.method === 'startCampaignCapture' &&
      operation.input.adventureId === scope.adventureId &&
      typeof operation.input.title === 'string' &&
      typeof operation.input.description === 'string' &&
      /^[a-f0-9]{64}$/.test(operation.input.expectedSourceToken) &&
      (operation.input.universeId === null || typeof operation.input.universeId === 'string')
    );
  return (
    ['advanceCampaignCapture', 'activateCampaignCapture', 'cancelCampaignCapture'].includes(
      operation.method,
    ) &&
    'captureId' in operation.input &&
    'expected' in operation &&
    Boolean(operation.expected) &&
    ['campaignId', 'baseId', 'adventureId'].every(
      (field) =>
        typeof operation.expected[field as keyof typeof operation.expected] === 'string' &&
        Boolean(operation.expected[field as keyof typeof operation.expected]),
    ) &&
    Object.keys(operation.expected).every((field) =>
      ['campaignId', 'baseId', 'adventureId'].includes(field),
    ) &&
    operation.input.captureId === scope.captureId &&
    Number.isSafeInteger(operation.input.expectedCheckpoint) &&
    operation.input.expectedCheckpoint >= 0
  );
}
export function readPendingCampaignCapture(
  uid: string,
  scope: CampaignCaptureRecoveryScope,
): PendingCampaignCaptureOperation | null {
  const stored = localStorage.getItem(key(uid, scope));
  if (stored === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    throw new Error(
      'O pedido preservado desta captura não pôde ser lido. Nenhum novo pedido será enviado.',
    );
  }
  if (!valid(value, scope))
    throw new Error(
      'O pedido preservado não corresponde à captura. Nenhum novo pedido será enviado.',
    );
  return value;
}
export function writePendingCampaignCapture(
  uid: string,
  scope: CampaignCaptureRecoveryScope,
  operation: PendingCampaignCaptureOperation,
): void {
  if (!valid(operation, scope))
    throw new Error('Não foi possível preservar o pedido desta captura.');
  const existing = readPendingCampaignCapture(uid, scope);
  if (existing && JSON.stringify(existing) !== JSON.stringify(operation))
    throw new Error('Confirme o mesmo pedido pendente antes de continuar a captura.');
  localStorage.setItem(key(uid, scope), JSON.stringify(operation));
}
export function clearPendingCampaignCapture(
  uid: string,
  scope: CampaignCaptureRecoveryScope,
  operationId: string,
): void {
  if (readPendingCampaignCapture(uid, scope)?.input.operationId === operationId)
    localStorage.removeItem(key(uid, scope));
}
