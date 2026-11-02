import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  DeletionSource,
  StartDeletionInput,
  DeletionMutation,
  DeletionStartCanceled,
  DeletionLookup,
  DeletionLookupInput,
  DeletionList,
  AdvanceDeletionInput,
} from '../model/campaignDeletion';
async function call<T>(name: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
  ).data;
}
export const getCampaignDeletionSource = (input: {
  campaignId: string;
}): Promise<DeletionSource | null> => call('getCampaignDeletionSource', input);
export const startCampaignDeletion = (
  input: StartDeletionInput,
): Promise<DeletionMutation | DeletionStartCanceled> => call('startCampaignDeletion', input);
export const resolveCampaignDeletionStart = (
  input: StartDeletionInput & { intent: 'cancel' },
): Promise<DeletionMutation | DeletionStartCanceled> => call('resolveCampaignDeletionStart', input);
export const getCampaignDeletion = (input: DeletionLookupInput): Promise<DeletionLookup> =>
  call('getCampaignDeletion', input);
export const listCampaignDeletions = (
  input: { cursor?: string; limit?: number } = {},
): Promise<DeletionList> => call('listCampaignDeletions', input);
export const advanceCampaignDeletion = (input: AdvanceDeletionInput): Promise<DeletionMutation> =>
  call('advanceCampaignDeletion', input);
