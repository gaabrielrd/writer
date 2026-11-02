import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  ListPreparationItemsInput,
  GetPreparationItemInput,
  SavePreparationItemInput,
  ItemWriteInput,
  MovePreparationItemInput,
  PreparationSessionScope,
  AddPreparationLinkInput,
  LinkWriteInput,
  MovePreparationLinkInput,
  ResolvePreparationInput,
  PreparationItemPage,
  PreparationItemResult,
  PreparationLinkPage,
  PreparationOutcome,
} from '../model/campaignPreparation';
async function call<T>(name: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
  ).data;
}
export const listCampaignPreparationItems = (
  input: ListPreparationItemsInput,
): Promise<PreparationItemPage> => call('listCampaignPreparationItems', input);
export const getCampaignPreparationItem = (
  input: GetPreparationItemInput,
): Promise<PreparationItemResult> => call('getCampaignPreparationItem', input);
export const saveCampaignPreparationItem = (
  input: SavePreparationItemInput,
): Promise<PreparationOutcome> => call('saveCampaignPreparationItem', input);
export const deleteCampaignPreparationItem = (input: ItemWriteInput): Promise<PreparationOutcome> =>
  call('deleteCampaignPreparationItem', input);
export const moveCampaignPreparationItem = (
  input: MovePreparationItemInput,
): Promise<PreparationOutcome> => call('moveCampaignPreparationItem', input);
export const listCampaignSessionPreparationLinks = (
  input: PreparationSessionScope & { cursor?: string; limit?: number },
): Promise<PreparationLinkPage> => call('listCampaignSessionPreparationLinks', input);
export const addCampaignSessionPreparationLink = (
  input: AddPreparationLinkInput,
): Promise<PreparationOutcome> => call('addCampaignSessionPreparationLink', input);
export const removeCampaignSessionPreparationLink = (
  input: LinkWriteInput,
): Promise<PreparationOutcome> => call('removeCampaignSessionPreparationLink', input);
export const moveCampaignSessionPreparationLink = (
  input: MovePreparationLinkInput,
): Promise<PreparationOutcome> => call('moveCampaignSessionPreparationLink', input);
export const resolveCampaignPreparationOperation = (
  input: ResolvePreparationInput,
): Promise<PreparationOutcome> => call('resolveCampaignPreparationOperation', input);
