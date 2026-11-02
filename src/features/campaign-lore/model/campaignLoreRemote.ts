import type { CampaignLoreScope } from './campaignLore';
export interface CampaignLoreRemoteControl {
  operationId: string;
  state: 'prepared' | 'committed';
  revision: number | null;
  statusToken: string;
}
export interface ListCampaignLoreOperationsInput extends CampaignLoreScope {
  cursor?: string;
  limit?: number;
}
export interface CampaignLoreOperationsPage extends CampaignLoreScope {
  schemaVersion: 1;
  ownerId: string;
  items: CampaignLoreRemoteControl[];
  nextCursor: string | null;
}
export interface ResolveCampaignLoreRemoteInput extends CampaignLoreScope {
  operationId: string;
  statusToken: string;
  resolutionId: string;
  intent: 'confirm' | 'cancel';
}
export interface CampaignLoreRemoteResolution {
  schemaVersion: 1;
  ownerId: string;
  request: ResolveCampaignLoreRemoteInput;
  outcome: 'resolved' | 'rejected';
  state: 'confirmed' | 'canceled' | null;
  reason: null | 'operation-changed';
  revision: number | null;
}
export interface CampaignLoreRemotePending {
  schemaVersion: 1;
  ownerId: string;
  input: ResolveCampaignLoreRemoteInput;
}
