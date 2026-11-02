import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  CampaignLoreHeader,
  CampaignLoreScope,
  CampaignLoreSaveHeader,
  CampaignLorePage,
  CampaignLoreResult,
  CampaignLorePrepared,
  SaveCampaignLoreInput,
  ResolveCampaignLoreInput,
  CampaignLoreResolution,
  ListCampaignLoreInput,
} from '../model/campaignLore';
async function call<T>(name: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
  ).data;
}
export const listCampaignLore = (input: ListCampaignLoreInput): Promise<CampaignLorePage> =>
  call('listCampaignLore', input);
export const getCampaignLore = (
  input: CampaignLoreScope & { sourceKey: string },
): Promise<CampaignLoreResult> => call('getCampaignLore', input);
export const prepareCampaignLoreVariant = (
  input: CampaignLoreSaveHeader,
): Promise<CampaignLorePrepared> => call('prepareCampaignLoreVariant', input);
export const saveCampaignLoreVariant = (
  input: SaveCampaignLoreInput,
): Promise<CampaignLoreResult> => call('saveCampaignLoreVariant', input);
export const removeCampaignLore = (input: CampaignLoreHeader): Promise<CampaignLoreResult> =>
  call('removeCampaignLore', input);
export const restoreCampaignLore = (input: CampaignLoreHeader): Promise<CampaignLoreResult> =>
  call('restoreCampaignLore', input);
export const discardCampaignLoreVariant = (
  input: CampaignLoreHeader,
): Promise<CampaignLoreResult> => call('discardCampaignLoreVariant', input);
export const resolveCampaignLoreOperation = (
  input: ResolveCampaignLoreInput,
): Promise<CampaignLoreResolution> => call('resolveCampaignLoreOperation', input);
