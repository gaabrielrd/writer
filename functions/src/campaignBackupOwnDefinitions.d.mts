export type CampaignOwnFamily =
  | 'note'
  | 'session'
  | 'checklist'
  | 'preparation-item'
  | 'preparation-body'
  | 'session-reference'
  | 'session-reference-state'
  | 'session-preparation-link'
  | 'session-preparation-state';
export interface CampaignOwnDefinition {
  readonly collection: string;
  readonly fields: readonly string[];
}
export const CAMPAIGN_OWN_ITEM_FIELDS: readonly string[];
export const CAMPAIGN_OWN_DEFINITIONS: Readonly<Record<CampaignOwnFamily, CampaignOwnDefinition>>;
export const CAMPAIGN_OWN_FAMILIES: readonly CampaignOwnFamily[];
export const CAMPAIGN_OWN_PAGE_ITEMS: 25;
export const CAMPAIGN_OWN_CHUNK_BYTES: 65536;

export const CAMPAIGN_OWN_JSON_BYTES: number;
