import type {
  CampaignPageResult,
  CampaignListInput,
  CreateCampaignInput,
} from '../../../src/features/campaigns/model/campaign';
import { fixtureCreate, fixtureGet, fixtureList } from './studioStore';
export const createCampaign = (input: CreateCampaignInput) => fixtureCreate('campaign', input);
export const getCampaign = (id: string) => fixtureGet('campaign', id);
export const listCampaigns = (input: CampaignListInput = {}) =>
  fixtureList('campaign', input) as Promise<CampaignPageResult>;
