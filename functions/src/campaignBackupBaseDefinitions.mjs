/** Logical frozen text fields. Storage paths and credentials never belong here. */
export const CAMPAIGN_BASE_FIELDS = Object.freeze({
  part: Object.freeze(['legacyContent']),
  scene: Object.freeze(['content', 'objective', 'conflict', 'pointOfView']),
  block: Object.freeze(['content']),
  arc: Object.freeze(['initialState', 'objective', 'plannedOutcome']),
  milestone: Object.freeze(['notes']),
  event: Object.freeze(['description']),
  lore: Object.freeze(['summary', 'details', 'appearance', 'personality', 'history', 'notes']),
});
export const CAMPAIGN_BASE_CHUNK_BYTES = 65536;
export const CAMPAIGN_BASE_PAGE_ITEMS = 25;
