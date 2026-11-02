import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  CampaignSessionPage,
  CampaignSessionResult,
  CampaignSessionMutation,
  ListCampaignSessionsInput,
  GetCampaignSessionInput,
  SaveCampaignSessionInput,
  MoveCampaignSessionInput,
  DeleteCampaignSessionInput,
} from '../model/campaignSession';
async function call<T>(name: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
  ).data;
}
export const listCampaignSessions = (
  input: ListCampaignSessionsInput,
): Promise<CampaignSessionPage> => call('listCampaignSessions', input);
export const getCampaignSession = (
  input: GetCampaignSessionInput,
): Promise<CampaignSessionResult> => call('getCampaignSession', input);
export const saveCampaignSession = (
  input: SaveCampaignSessionInput,
): Promise<CampaignSessionMutation> => call('saveCampaignSession', input);
export const moveCampaignSession = (
  input: MoveCampaignSessionInput,
): Promise<CampaignSessionMutation> => call('moveCampaignSession', input);
export const deleteCampaignSession = (
  input: DeleteCampaignSessionInput,
): Promise<CampaignSessionMutation> => call('deleteCampaignSession', input);
