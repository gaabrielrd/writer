export type CampaignStatus = 'planning' | 'active' | 'completed' | 'archived';
export const campaignStatusLabels: Record<CampaignStatus, string> = {
  planning: 'Em preparação',
  active: 'Em andamento',
  completed: 'Concluída',
  archived: 'Arquivada',
};

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
export type CampaignPatch = Partial<
  Pick<Campaign, 'title' | 'description' | 'status' | 'universeId'>
>;
export interface UpdateCampaignInput {
  campaignId: string;
  operationId: string;
  expectedRevision: number;
  patch: CampaignPatch;
}
