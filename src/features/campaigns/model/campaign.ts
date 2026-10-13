export type CampaignStatus = 'planning' | 'active' | 'completed' | 'archived';

export interface Campaign {
  id: string;
  ownerId: string;
  schemaVersion: 1;
  revision: number;
  title: string;
  description: string;
  provenance: { kind: 'independent' };
  status: CampaignStatus;
  universeId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type CampaignSummary = Pick<
  Campaign,
  'id' | 'title' | 'status' | 'revision' | 'universeId' | 'createdAt' | 'updatedAt'
> & { kind: 'campaign' };
export interface CampaignListInput {
  status?: 'all' | CampaignStatus;
  cursor?: string | null;
  limit?: number;
}
export interface CampaignPageResult {
  items: CampaignSummary[];
  nextCursor: string | null;
}
export interface CreateCampaignInput {
  operationId: string;
  title: string;
  description?: string;
  universeId?: string | null;
}
