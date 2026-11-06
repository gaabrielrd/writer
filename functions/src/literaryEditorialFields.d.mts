export const EDITORIAL_FIELDS: Readonly<
  Record<
    | 'premise'
    | 'genre'
    | 'audience'
    | 'language'
    | 'promise'
    | 'centralQuestion'
    | 'transformation'
    | 'ending'
    | 'narrator'
    | 'tense'
    | 'distance'
    | 'cadence'
    | 'dialogue'
    | 'exposition'
    | 'examples'
    | 'limits'
    | 'invariants'
    | 'reservations'
    | 'collaboration',
    string
  >
>;
export const EDITORIAL_STATUSES: readonly ['proposal', 'working', 'approved', 'gap'];
export const EDITORIAL_CATEGORIES: readonly ['requirement', 'preference', 'hypothesis'];
export const MAX_EDITORIAL_BYTES: 180000;
