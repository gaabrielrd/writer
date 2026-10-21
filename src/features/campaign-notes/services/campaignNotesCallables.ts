import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  CampaignNotesPage,
  CampaignNoteResult,
  SavedCampaignNote,
  CampaignNoteDeleted,
  ListCampaignNotesInput,
  GetCampaignNoteInput,
  SaveCampaignNoteInput,
  DeleteCampaignNoteInput,
} from '../model/campaignNote';
async function call<T>(name: string, input: unknown): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
    ).data;
  } catch (cause) {
    if (cause instanceof Error) throw cause;
    throw Object.assign(
      new Error('Não foi possível confirmar o pedido. Repita o mesmo pedido antes de continuar.', {
        cause,
      }),
      { code: 'functions/unavailable' },
    );
  }
}
export const listCampaignNotes = (input: ListCampaignNotesInput): Promise<CampaignNotesPage> =>
  call('listCampaignNotes', input);
export const getCampaignNote = (input: GetCampaignNoteInput): Promise<CampaignNoteResult> =>
  call('getCampaignNote', input);
export const saveCampaignNote = (input: SaveCampaignNoteInput): Promise<SavedCampaignNote> =>
  call('saveCampaignNote', input);
export const deleteCampaignNote = (input: DeleteCampaignNoteInput): Promise<CampaignNoteDeleted> =>
  call('deleteCampaignNote', input);
