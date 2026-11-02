import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  ListCampaignLoreOperationsInput,
  CampaignLoreOperationsPage,
  ResolveCampaignLoreRemoteInput,
  CampaignLoreRemoteResolution,
} from '../model/campaignLoreRemote';
async function call<T>(name: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
  ).data;
}
export const listCampaignLoreOperations = (
  input: ListCampaignLoreOperationsInput,
): Promise<CampaignLoreOperationsPage> => call('listCampaignLoreOperations', input);
export const resolveCampaignLoreRemoteOperation = (
  input: ResolveCampaignLoreRemoteInput,
): Promise<CampaignLoreRemoteResolution> => call('resolveCampaignLoreRemoteOperation', input);
