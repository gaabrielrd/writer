export interface CampaignNotesEnvelope {
  ownerId: string;
  campaignId: string;
  schemaVersion: 1;
  campaignToken: string;
  collectionRevision: number;
}
export interface CampaignNoteSummary {
  id: string;
  title: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}
export interface CampaignNote extends CampaignNoteSummary {
  ownerId: string;
  campaignId: string;
  schemaVersion: 1;
  content: string;
}
export interface CampaignNotesPage extends CampaignNotesEnvelope {
  items: CampaignNoteSummary[];
  nextCursor: string | null;
}
export interface CampaignNoteResult extends CampaignNotesEnvelope {
  note: CampaignNote | null;
}
export interface SavedCampaignNote extends CampaignNotesEnvelope {
  note: CampaignNote;
}
export interface CampaignNoteDeleted extends CampaignNotesEnvelope {
  noteId: string;
  revision: number;
  deleted: true;
}
export interface ListCampaignNotesInput {
  campaignId: string;
  campaignToken?: string;
  cursor?: string | null;
  limit?: number;
}
export interface GetCampaignNoteInput {
  campaignId: string;
  campaignToken: string;
  noteId: string;
}
export interface SaveCampaignNoteInput extends GetCampaignNoteInput {
  operationId: string;
  expectedRevision: number;
  title: string;
  content: string;
}
export interface DeleteCampaignNoteInput extends GetCampaignNoteInput {
  operationId: string;
  expectedRevision: number;
}
export type PendingCampaignNoteOperation =
  | { method: 'saveCampaignNote'; input: SaveCampaignNoteInput }
  | { method: 'deleteCampaignNote'; input: DeleteCampaignNoteInput };
export type CampaignNoteMutationResult = SavedCampaignNote | CampaignNoteDeleted;
