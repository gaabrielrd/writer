import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  ListSessionReferencesInput,
  SessionReferencePage,
  AddSessionReferenceInput,
  RemoveSessionReferenceInput,
  SessionReferenceOutcome,
  ReadSessionLoreReferenceInput,
  SessionLoreReferenceResult,
  ResolveSessionReferenceInput,
} from '../model/sessionReference';
async function call<T>(name: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
  ).data;
}
export const listCampaignSessionReferences = (
  input: ListSessionReferencesInput,
): Promise<SessionReferencePage> => call('listCampaignSessionReferences', input);
export const addCampaignSessionReference = (
  input: AddSessionReferenceInput,
): Promise<SessionReferenceOutcome> => call('addCampaignSessionReference', input);
export const removeCampaignSessionReference = (
  input: RemoveSessionReferenceInput,
): Promise<SessionReferenceOutcome> => call('removeCampaignSessionReference', input);
export const readCampaignSessionLoreReference = (
  input: ReadSessionLoreReferenceInput,
): Promise<SessionLoreReferenceResult> => call('readCampaignSessionLoreReference', input);
export const resolveCampaignSessionReferenceOperation = (
  input: ResolveSessionReferenceInput,
): Promise<SessionReferenceOutcome> => call('resolveCampaignSessionReferenceOperation', input);
