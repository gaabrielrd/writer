export type CampaignSessionStatus = 'planned' | 'running' | 'completed';
export interface CampaignSessionScope {
  campaignId: string;
  campaignToken: string;
}
export interface CampaignSessionEnvelope extends CampaignSessionScope {
  schemaVersion: 1;
  ownerId: string;
  collectionRevision: number;
}
export interface CampaignSession {
  id: string;
  schemaVersion: 1;
  ownerId: string;
  campaignId: string;
  revision: number;
  order: number;
  title: string;
  scheduledDate: string | null;
  status: CampaignSessionStatus;
  summary: string;
  createdAt: number;
  updatedAt: number;
}
export type CampaignSessionSummary = Omit<CampaignSession, 'summary'>;
export interface CampaignSessionPage extends CampaignSessionEnvelope {
  items: CampaignSessionSummary[];
  nextCursor: string | null;
}
export interface CampaignSessionResult extends CampaignSessionEnvelope {
  session: CampaignSession | null;
}
export interface CampaignSessionReceipt {
  operationId: string;
  action: 'save' | 'move' | 'delete';
  sessionId: string;
  expectedRevision: number;
  revision: number;
  collectionRevision: number;
}
export interface CampaignSessionMutation extends CampaignSessionResult {
  receipt: CampaignSessionReceipt;
}
export interface ListCampaignSessionsInput {
  campaignId: string;
  campaignToken?: string;
  cursor?: string | null;
  limit?: number;
}
export interface GetCampaignSessionInput extends CampaignSessionScope {
  sessionId: string;
}
export interface SaveCampaignSessionInput extends GetCampaignSessionInput {
  operationId: string;
  expectedRevision: number;
  title: string;
  summary: string;
  scheduledDate: string | null;
  status: CampaignSessionStatus;
}
export interface MoveCampaignSessionInput extends GetCampaignSessionInput {
  operationId: string;
  expectedRevision: number;
  expectedCollectionRevision: number;
  direction: 'up' | 'down';
}
export interface DeleteCampaignSessionInput extends GetCampaignSessionInput {
  operationId: string;
  expectedRevision: number;
}
export type PendingCampaignSession = { schemaVersion: 1; ownerId: string } & (
  | { method: 'saveCampaignSession'; input: SaveCampaignSessionInput }
  | { method: 'moveCampaignSession'; input: MoveCampaignSessionInput }
  | { method: 'deleteCampaignSession'; input: DeleteCampaignSessionInput }
);
export const campaignSessionStatusLabels: Record<CampaignSessionStatus, string> = {
  planned: 'Planejada',
  running: 'Em andamento',
  completed: 'Concluída',
};
