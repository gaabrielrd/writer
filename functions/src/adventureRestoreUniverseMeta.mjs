export const universeRestorePhase = (v) =>
  [
    'universe-ready',
    'persona-library',
    'persona-library-ready',
    'image-bytes',
    'image-bytes-ready',
  ].includes(v.phase);
export const universeRestoreViewKeys = ['universeOutcome'];
export const validAdventureUniverseOutcome = (v) =>
  ['none', 'available', 'unavailable'].includes(v.universeOutcome);
