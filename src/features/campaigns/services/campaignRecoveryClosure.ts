import {
  getCampaignDeletion,
  validateLookup,
  type DeletionLookup,
} from '@/features/campaign-deletions';
import {
  listPendingCampaignCaptureControls,
  readPendingCampaignCapture,
  forgetCampaignCaptureRecovery,
} from '@/features/campaign-bases';
import { readPendingCampaignNote, forgetCampaignNoteRecovery } from '@/features/campaign-notes';
import {
  readCampaignLoreRecovery,
  forgetCampaignLoreRecovery,
  readCampaignLoreRemoteRecovery,
  forgetCampaignLoreRemoteRecovery,
} from '@/features/campaign-lore';
import {
  listComparisonControls,
  forgetCampaignComparisonRecovery,
} from '@/features/campaign-comparisons';
import {
  listAdoptionControls,
  forgetCampaignAdoptionRecovery,
} from '@/features/campaign-adoptions';
import {
  readPendingCampaignOperation,
  forgetCampaignManagementRecovery,
} from './campaignManagementRecovery';
export interface CampaignRecoveryClosure {
  key: string;
  label: string;
  close: () => Promise<void>;
}
export async function collectCampaignRecoveryClosures(
  uid: string,
  proof: DeletionLookup,
  check: () => void,
): Promise<{ items: CampaignRecoveryClosure[]; unreadable: boolean }> {
  check();
  if (!('campaignId' in proof.lookup)) throw new Error('A prova precisa identificar a campanha.');
  validateLookup(proof, uid, proof.lookup);
  const cid = proof.lookup.campaignId;
  if (!proof.deletion || proof.deletion.campaignId !== cid)
    throw new Error('A exclusão não foi comprovada.');
  const items: CampaignRecoveryClosure[] = [];
  let unreadable = false;
  function add(key: string, label: string, close: () => Promise<void>) {
    items.push({
      key,
      label,
      close: async () => {
        check();
        await close();
        check();
      },
    });
  }
  function read<T>(work: () => T): T | null {
    try {
      return work();
    } catch {
      unreadable = true;
      return null;
    }
  }
  const management = read(() => readPendingCampaignOperation(uid, cid));
  if (management) {
    const snapshot = structuredClone(management);
    add('management', 'Alteração dos dados da campanha', () =>
      forgetCampaignManagementRecovery(uid, snapshot, check),
    );
  }
  const note = read(() => readPendingCampaignNote(uid, cid));
  if (note) {
    const snapshot = structuredClone(note);
    add('note', 'Pedido de nota própria', () => forgetCampaignNoteRecovery(uid, snapshot, check));
  }
  try {
    const lore = await readCampaignLoreRecovery(uid, cid);
    check();
    if (lore) {
      const snapshot = structuredClone(lore);
      add('lore', 'Rascunho protegido de lore', () => forgetCampaignLoreRecovery(snapshot, check));
    }
  } catch {
    check();
    unreadable = true;
  }
  const remote = read(() => readCampaignLoreRemoteRecovery(uid, cid));
  if (remote) {
    const snapshot = structuredClone(remote);
    add('remote-lore', 'Resolução de recuperação remota', async () => {
      await forgetCampaignLoreRemoteRecovery(snapshot, check);
    });
  }
  const comparisons = listComparisonControls(uid, cid);
  unreadable ||= comparisons.unreadable;
  for (const value of comparisons.items) {
    const snapshot = structuredClone(value);
    add('comparison:' + JSON.stringify(value.scope), 'Controle de candidata', () =>
      forgetCampaignComparisonRecovery(snapshot, check),
    );
  }
  const adoptions = listAdoptionControls(uid, cid);
  unreadable ||= adoptions.unreadable;
  for (const value of adoptions.items) {
    const snapshot = structuredClone(value);
    add('adoption:' + JSON.stringify(value.scope), 'Controle de atualização de base', () =>
      forgetCampaignAdoptionRecovery(snapshot, check),
    );
  }
  const captures = listPendingCampaignCaptureControls(uid);
  unreadable ||= captures.unreadable;
  for (const candidate of captures.items) {
    check();
    const value = read(() => readPendingCampaignCapture(uid, candidate.scope));
    if (!value) continue;
    if (value.method !== 'startCampaignCapture' && value.expected.campaignId !== cid) continue;
    const snapshot = structuredClone(value),
      scope = structuredClone(candidate.scope),
      lookup = { captureId: candidate.captureId };
    try {
      const found = await getCampaignDeletion(lookup);
      check();
      validateLookup(found, uid, lookup);
      if (found.deletion?.campaignId === cid)
        add('capture:' + candidate.captureId, 'Controle de captura', () =>
          forgetCampaignCaptureRecovery(uid, scope, snapshot, check),
        );
    } catch {
      check();
      unreadable = true;
    }
  }
  return { items, unreadable };
}
