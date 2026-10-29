export type CampaignBaseKind = 'part' | 'scene' | 'block' | 'arc' | 'milestone' | 'event' | 'lore';
export const CAMPAIGN_BASE_FIELDS: Readonly<Record<CampaignBaseKind, readonly string[]>>;
export const CAMPAIGN_BASE_CHUNK_BYTES: 65536;
export const CAMPAIGN_BASE_PAGE_ITEMS: 25;
