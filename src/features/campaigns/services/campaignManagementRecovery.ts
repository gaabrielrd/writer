import { campaignStatusLabels, type UpdateCampaignInput } from '../model/campaign';
const key = (uid: string, campaignId: string) =>
  'writer:campaign-management:' + JSON.stringify([uid, campaignId]);
function valid(value: unknown, campaignId: string): value is UpdateCampaignInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as UpdateCampaignInput;
  if (
    input.campaignId !== campaignId ||
    typeof input.operationId !== 'string' ||
    !input.operationId ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    !input.patch ||
    typeof input.patch !== 'object' ||
    Array.isArray(input.patch)
  )
    return false;
  const fields = Object.keys(input.patch);
  return (
    fields.length > 0 &&
    fields.every((name) => ['title', 'description', 'status', 'universeId'].includes(name)) &&
    (!('title' in input.patch) || typeof input.patch.title === 'string') &&
    (!('description' in input.patch) || typeof input.patch.description === 'string') &&
    (!('status' in input.patch) ||
      (typeof input.patch.status === 'string' &&
        Object.hasOwn(campaignStatusLabels, input.patch.status))) &&
    (!('universeId' in input.patch) ||
      input.patch.universeId === null ||
      typeof input.patch.universeId === 'string')
  );
}
export function readPendingCampaignOperation(
  uid: string,
  campaignId: string,
): UpdateCampaignInput | null {
  const stored = localStorage.getItem(key(uid, campaignId));
  if (stored === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    throw new Error(
      'O pedido preservado não pôde ser lido. Mantenha esta campanha sem alterações até recuperar o pedido neste navegador.',
    );
  }
  if (!valid(value, campaignId))
    throw new Error('O pedido preservado não pôde ser validado. Nenhuma alteração será enviada.');
  return value;
}
export function writePendingCampaignOperation(uid: string, input: UpdateCampaignInput): void {
  if (!valid(input, input.campaignId)) throw new Error('Não foi possível preservar este pedido.');
  const existing = readPendingCampaignOperation(uid, input.campaignId);
  if (existing && JSON.stringify(existing) !== JSON.stringify(input))
    throw new Error('Confirme o pedido pendente antes de enviar outra alteração.');
  localStorage.setItem(key(uid, input.campaignId), JSON.stringify(input));
}
export function clearPendingCampaignOperation(
  uid: string,
  campaignId: string,
  operationId: string,
): void {
  if (readPendingCampaignOperation(uid, campaignId)?.operationId === operationId)
    localStorage.removeItem(key(uid, campaignId));
}
