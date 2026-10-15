import type {
  Campaign,
  CampaignPatch,
  UpdateCampaignInput,
} from '../../../src/features/campaigns/model/campaign';
import { fixtureCommitCampaign, fixtureGet, fixtureOwner } from './studioStore';
import { getUniverse } from './universeService';

type Receipt = { campaignId: string; fingerprint: string; revision: number; confirmedHash: string };
const storageKey = 'writer.visual.campaign-operations';
const receipts = new Map<string, Receipt>(
  JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as [string, Receipt][],
);
function hash(value: unknown) {
  let digest = 2166136261;
  for (const character of JSON.stringify(value))
    digest = Math.imul(digest ^ character.codePointAt(0)!, 16777619);
  return (digest >>> 0).toString(16).padStart(8, '0').repeat(8);
}
function fail(message: string, code = 'failed-precondition'): never {
  throw Object.assign(new Error(message), {
    code: `functions/${code}`,
    ...(code === 'failed-precondition' ? { details: { reason: 'revision-conflict' } } : {}),
  });
}
function patchFor(input: UpdateCampaignInput): CampaignPatch {
  if (
    Object.keys(input).some(
      (key) => !['campaignId', 'operationId', 'expectedRevision', 'patch'].includes(key),
    ) ||
    !input.operationId ||
    !input.campaignId ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    !input.patch ||
    typeof input.patch !== 'object' ||
    Array.isArray(input.patch)
  )
    fail('Pedido de campanha inválido.', 'invalid-argument');
  const keys = Object.keys(input.patch);
  if (
    !keys.length ||
    keys.some((key) => !['title', 'description', 'status', 'universeId'].includes(key))
  )
    fail('Informe somente os campos editáveis da campanha.', 'invalid-argument');
  const patch: CampaignPatch = {};
  if ('title' in input.patch) {
    const title = input.patch.title;
    if (typeof title !== 'string' || title.length > 300 || !title.trim())
      fail('Título inválido.', 'invalid-argument');
    patch.title = title.trim();
  }
  if ('description' in input.patch) {
    const description = input.patch.description;
    if (typeof description !== 'string' || description.length > 4000)
      fail('Descrição inválida.', 'invalid-argument');
    patch.description = description.trim();
  }
  if ('status' in input.patch) {
    const status = input.patch.status;
    if (!status || !['planning', 'active', 'completed', 'archived'].includes(status))
      fail('Estado inválido.', 'invalid-argument');
    patch.status = status;
  }
  if ('universeId' in input.patch) {
    if (
      input.patch.universeId !== null &&
      (typeof input.patch.universeId !== 'string' || !input.patch.universeId)
    )
      fail('Universo inválido.', 'invalid-argument');
    patch.universeId = input.patch.universeId;
  }
  return patch;
}
function authorize(campaign: Campaign | null): Campaign {
  if (!campaign || ('deleting' in campaign && campaign.deleting))
    fail('Campanha indisponível.', 'not-found');
  if (campaign.ownerId !== fixtureOwner()) fail('Campanha indisponível.', 'not-found');
  if (
    campaign.provenance.kind !== 'independent' &&
    !(
      campaign.provenance.kind === 'original' &&
      [campaign.provenance.adventureId, campaign.provenance.baseId].every(
        (value) =>
          typeof value === 'string' &&
          !!value &&
          !value.includes('/') &&
          !['.', '..'].includes(value) &&
          new TextEncoder().encode(value).length <= 1500,
      ) &&
      campaign.activeBaseId === campaign.provenance.baseId
    )
  )
    fail('Procedência de campanha não suportada.');
  return campaign;
}
async function authorizeUniverse(patch: CampaignPatch, uid: string) {
  if ('universeId' in patch && patch.universeId !== null) {
    const universe = await getUniverse(patch.universeId!);
    if (!universe || universe.authorId !== uid || universe.deleting)
      fail('Universo indisponível.', 'not-found');
  }
  if (fixtureOwner() !== uid) fail('Campanha indisponível.', 'not-found');
}
const holds = new Map<string, Promise<void>>();
async function response(input: UpdateCampaignInput, uid: string, confirmed: Campaign) {
  const key = JSON.stringify([uid, input.campaignId, input.operationId]),
    pending = holds.get(key);
  const hold = sessionStorage.getItem('writer.visual.campaign-hold-response');
  if (pending) await pending;
  else if (hold === 'true' || hold === 'updateCampaign') {
    sessionStorage.removeItem('writer.visual.campaign-hold-response');
    const request = new Promise<void>((resolve) =>
      window.addEventListener(
        'writer.visual.release-campaign',
        () => {
          if (holds.get(key) === request) holds.delete(key);
          resolve();
        },
        { once: true },
      ),
    );
    holds.set(key, request);
    await request;
  }
  // The real controller must ignore a response belonging to the UID/target that sent it.
  return structuredClone(confirmed);
}
export async function updateCampaign(input: UpdateCampaignInput): Promise<Campaign> {
  const patch = patchFor(input),
    uid = fixtureOwner(),
    key = JSON.stringify([uid, input.operationId]);
  const fingerprint = hash({
    campaignId: input.campaignId,
    expectedRevision: input.expectedRevision,
    patch,
  });
  const current = authorize(await fixtureGet('campaign', input.campaignId));
  const previous = receipts.get(key);
  if (previous) {
    if (previous.fingerprint !== fingerprint || previous.campaignId !== input.campaignId)
      fail('Operação usada com outros dados.', 'invalid-argument');
    if (current.revision !== previous.revision || hash(current) !== previous.confirmedHash)
      fail('A campanha mudou. Compare a versão atual antes de continuar.');
    await authorizeUniverse(patch, uid);
    return response(input, uid, current);
  }
  const unavailable = sessionStorage.getItem('writer.visual.campaign-error');
  if (unavailable === 'true' || unavailable === 'updateCampaign')
    fail('Conexão simulada indisponível. Confirme o mesmo pedido.', 'unavailable');
  const conflict = sessionStorage.getItem('writer.visual.campaign-conflict');
  if (conflict === 'true' || conflict === input.campaignId) {
    sessionStorage.removeItem('writer.visual.campaign-conflict');
    fixtureCommitCampaign(input.campaignId, current.revision, {
      title: 'Campanha atualizada em outro dispositivo',
    });
  }
  await authorizeUniverse(patch, uid);
  const confirmed = fixtureCommitCampaign(input.campaignId, input.expectedRevision, patch);
  receipts.set(key, {
    campaignId: confirmed.id,
    fingerprint,
    revision: confirmed.revision,
    confirmedHash: hash(confirmed),
  });
  sessionStorage.setItem(storageKey, JSON.stringify([...receipts]));
  const lost = sessionStorage.getItem('writer.visual.campaign-lost-response');
  if (lost === 'true' || lost === 'updateCampaign') {
    sessionStorage.removeItem('writer.visual.campaign-lost-response');
    fail(
      'Não foi possível confirmar a alteração. Confirme o mesmo pedido antes de continuar.',
      'unavailable',
    );
  }
  return response(input, uid, confirmed);
}
