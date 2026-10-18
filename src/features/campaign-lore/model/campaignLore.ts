export type CampaignLoreCategory = 'character' | 'location' | 'concept' | 'other';
export type CampaignLoreAction = 'save' | 'remove' | 'restore' | 'discard';
export interface CampaignLoreScope {
  campaignId: string;
  campaignToken: string;
  baseId: string;
}
export interface CampaignLoreEnvelope extends CampaignLoreScope {
  schemaVersion: 1;
  ownerId: string;
  collectionRevision: number;
  projectionToken: string;
}
export interface CampaignLoreHeader extends CampaignLoreScope {
  sourceKey: string;
  operationId: string;
  expectedRevision: number;
}
export interface CampaignLoreSaveHeader extends CampaignLoreHeader {
  relatedSourceKeys: string[];
}
export interface CampaignLoreRelation {
  targetKey: string;
  relationType: string;
  description: string;
}
export interface CampaignLoreEntityInput {
  name: string;
  aliases: string[];
  category: CampaignLoreCategory;
  summary: string;
  details: string;
  structuredDetails: { appearance: string; personality: string; history: string; notes: string };
  relations: CampaignLoreRelation[];
}
export interface CampaignLoreEntityView extends Omit<CampaignLoreEntityInput, 'relations'> {
  relations: (CampaignLoreRelation & { targetName: string })[];
}
export interface CampaignLoreState {
  legacy: boolean;
  sourceKey: string;
  revision: number;
  mode: 'base' | 'override' | 'removed';
  createdAt: number | null;
  updatedAt: number | null;
  entityHash: string | null;
  entity: CampaignLoreEntityView | null;
}
export interface CampaignLoreSummary {
  legacy: boolean;
  sourceKey: string;
  revision: number;
  mode: CampaignLoreState['mode'];
  name: string;
  category: CampaignLoreCategory;
}
export interface ListCampaignLoreInput {
  campaignId: string;
  baseId: string;
  campaignToken?: string;
  view?: 'active' | 'removed';
  cursor?: string;
  limit?: number;
}
export interface CampaignLorePage extends CampaignLoreEnvelope {
  items: CampaignLoreSummary[];
  nextCursor: string | null;
}
export interface CampaignLoreResult extends CampaignLoreEnvelope {
  item: CampaignLoreState | null;
}
export interface CampaignLorePrepared extends CampaignLoreEnvelope, CampaignLoreSaveHeader {
  action: 'save';
  key: string;
  algorithm: 'AES-GCM';
}
export interface CampaignLoreSealed {
  version: 1;
  algorithm: 'AES-GCM';
  nonce: string;
  ciphertext: string;
}
export interface SaveCampaignLoreInput extends CampaignLoreSaveHeader {
  sealed: CampaignLoreSealed;
}
export type ResolveCampaignLoreInput = CampaignLoreHeader & {
  action: CampaignLoreAction;
  relatedSourceKeys?: string[];
  intent: 'confirm' | 'cancel';
};
export interface CampaignLoreResolution extends CampaignLoreHeader {
  ownerId: string;
  schemaVersion: 1;
  action: CampaignLoreAction;
  relatedSourceKeys?: string[];
  state: 'committed' | 'canceled';
  revision: number | null;
}
// The journal contains only controls and binary ciphertext, never a name or body.
export interface CampaignLoreOperation {
  schemaVersion: 1;
  ownerId: string;
  header: CampaignLoreHeader;
  action: CampaignLoreAction;
  relatedSourceKeys?: string[];
  phase: 'preparing' | 'sealed' | 'metadata-ready' | 'confirmed';
  nonce?: ArrayBuffer;
  ciphertext?: ArrayBuffer;
  confirmedRevision?: number;
}
