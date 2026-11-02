import type { CampaignLoreCategory, CampaignLoreEntityView } from './campaignLore';
export interface CampaignLoreDisplayData {
  sourceKey: string;
  revision: number;
  mode: 'base' | 'override' | 'removed';
  legacy: boolean;
  entity: CampaignLoreEntityView | null;
}
export interface CampaignLorePickerItem {
  sourceKey: string;
  name: string;
  category: CampaignLoreCategory;
  revision: number;
  mode: 'base' | 'override';
  legacy: boolean;
}
export interface CampaignLorePickerPage {
  items: CampaignLorePickerItem[];
  nextCursor: string | null;
  projectionToken: string | null;
}
