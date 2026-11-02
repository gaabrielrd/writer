import { createAdventureRestoreMetadataStore } from './adventureRestoreMetadataStore';
import { readAdventureRestoreEffectRecord } from './adventureRestoreEffectContracts';
export const ADVENTURE_RESTORE_EFFECT_DB = 'writer.adventure-restore.effects';
const storage = createAdventureRestoreMetadataStore(
  ADVENTURE_RESTORE_EFFECT_DB,
  'pending',
  readAdventureRestoreEffectRecord,
);
export const readStoredAdventureRestoreEffect = storage.read;
export const compareStoredAdventureRestoreEffect = storage.compare;
export const listStoredAdventureRestoreEffects = storage.list;
