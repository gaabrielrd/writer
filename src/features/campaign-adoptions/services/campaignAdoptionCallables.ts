import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  StartAdoptionInput,
  StartAdoptionResult,
  ResolveAdoptionStartResult,
  AdoptionProgress,
  AdoptionList,
  ListAdoptionsInput,
  StepAdoptionInput,
  DecideAdoptionInput,
  AdoptionMutationResult,
  AdoptionDecisionsPage,
} from '../model/campaignAdoption';
async function call<T>(name: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
  ).data;
}
export const startCampaignAdoption = (input: StartAdoptionInput): Promise<StartAdoptionResult> =>
  call('startCampaignAdoption', input);
export const resolveCampaignAdoptionStart = (
  input: StartAdoptionInput & { intent: 'cancel' },
): Promise<ResolveAdoptionStartResult> => call('resolveCampaignAdoptionStart', input);
export const getCampaignAdoption = (input: { adoptionId: string }): Promise<AdoptionProgress> =>
  call('getCampaignAdoption', input);
export const listCampaignAdoptions = (input: ListAdoptionsInput): Promise<AdoptionList> =>
  call('listCampaignAdoptions', input);
export const listCampaignAdoptionDecisions = (input: {
  adoptionId: string;
  cursor?: string;
  limit?: number;
}): Promise<AdoptionDecisionsPage> => call('listCampaignAdoptionDecisions', input);
export const decideCampaignAdoption = (
  input: DecideAdoptionInput,
): Promise<AdoptionMutationResult> => call('decideCampaignAdoption', input);
export const prepareCampaignAdoption = (
  input: StepAdoptionInput,
): Promise<AdoptionMutationResult> => call('prepareCampaignAdoption', input);
export const advanceCampaignAdoption = (
  input: StepAdoptionInput,
): Promise<AdoptionMutationResult> => call('advanceCampaignAdoption', input);
export const activateCampaignAdoption = (
  input: StepAdoptionInput,
): Promise<AdoptionMutationResult> => call('activateCampaignAdoption', input);
export const cancelCampaignAdoption = (input: StepAdoptionInput): Promise<AdoptionMutationResult> =>
  call('cancelCampaignAdoption', input);
