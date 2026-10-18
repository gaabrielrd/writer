import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  ComparisonSource,
  StartComparisonInput,
  StartComparisonResult,
  ResolveComparisonStartResult,
  ComparisonProgress,
  ListComparisonsInput,
  ComparisonList,
  StepComparisonInput,
  ComparisonMutationResult,
  ListComparisonChangesInput,
  ComparisonChangesPage,
  ComparisonSide,
  ComparisonItemWindow,
  ComparisonImage,
} from '../model/campaignComparison';
async function call<T>(name: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
  ).data;
}
export const getCampaignComparisonSource = (input: {
  campaignId: string;
  currentBaseId: string;
}): Promise<ComparisonSource | null> => call('getCampaignComparisonSource', input);
export const startCampaignComparison = (
  input: StartComparisonInput,
): Promise<StartComparisonResult> => call('startCampaignComparison', input);
export const resolveCampaignComparisonStart = (
  input: StartComparisonInput & { intent: 'cancel' },
): Promise<ResolveComparisonStartResult> => call('resolveCampaignComparisonStart', input);
export const getCampaignComparison = (input: {
  comparisonId: string;
}): Promise<ComparisonProgress> => call('getCampaignComparison', input);
export const listCampaignComparisons = (input: ListComparisonsInput): Promise<ComparisonList> =>
  call('listCampaignComparisons', input);
export const advanceCampaignComparison = (
  input: StepComparisonInput,
): Promise<ComparisonMutationResult> => call('advanceCampaignComparison', input);
export const cancelCampaignComparison = (
  input: StepComparisonInput,
): Promise<ComparisonMutationResult> => call('cancelCampaignComparison', input);
export const listCampaignComparisonChanges = (
  input: ListComparisonChangesInput,
): Promise<ComparisonChangesPage> => call('listCampaignComparisonChanges', input);
export const readCampaignComparisonItem = (input: {
  comparisonId: string;
  sourceKey: string;
  side: ComparisonSide;
  cursor?: string | null;
  limit?: number;
}): Promise<ComparisonItemWindow> => call('readCampaignComparisonItem', input);
export const readCampaignComparisonImage = (input: {
  comparisonId: string;
  imageKey: string;
  side: ComparisonSide;
}): Promise<ComparisonImage> => call('readCampaignComparisonImage', input);
