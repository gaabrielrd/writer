import type {
  AdventurePageResult,
  AdventureListInput,
  CreateAdventureInput,
} from '../../../src/features/adventures/model/adventure';
import { fixtureCreate, fixtureGet, fixtureList } from './studioStore';
export const createAdventure = (input: CreateAdventureInput) => fixtureCreate('adventure', input);
export const getAdventure = (id: string) => fixtureGet('adventure', id);
export const listAdventures = (input: AdventureListInput = {}) =>
  fixtureList('adventure', input) as Promise<AdventurePageResult>;
