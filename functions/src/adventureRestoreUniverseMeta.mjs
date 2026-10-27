export const universeRestorePhase = (v) => v.phase === 'universe-ready';
export const universeRestoreViewKeys = ['universeOutcome'];
export const validAdventureUniverseOutcome = (v) =>
  ['none', 'available', 'unavailable'].includes(v.universeOutcome);
