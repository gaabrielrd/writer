import { ADVENTURE_COUNT_PHASES } from './adventureRestoreCountMeta.mjs';
export const universeRestorePhase = (v) =>
  [
    'universe-ready',
    'persona-library',
    'persona-library-ready',
    'image-bytes',
    'image-bytes-ready',
    'image-storage',
    'image-storage-ready',
    ...ADVENTURE_COUNT_PHASES,
  ].includes(v.phase);
export const universeRestoreViewKeys = ['universeOutcome'];
export const validAdventureUniverseOutcome = (v) =>
  ['none', 'available', 'unavailable'].includes(v.universeOutcome);
