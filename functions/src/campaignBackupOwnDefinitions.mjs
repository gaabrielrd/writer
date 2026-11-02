// Shared pure routing/limits; no I/O, credentials or authorization.
const ownFields = Object.freeze([
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'revision',
]);
export const CAMPAIGN_OWN_ITEM_FIELDS = Object.freeze([
  'id',
  ...ownFields,
  'deleted',
  'createdAt',
  'updatedAt',
]);
const itemFields = CAMPAIGN_OWN_ITEM_FIELDS;
export const CAMPAIGN_OWN_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    Object.entries({
      note: { collection: 'notes', fields: itemFields },
      session: { collection: 'sessions', fields: [...itemFields, 'order'] },
      checklist: {
        collection: 'workChecklist',
        fields: ['id', 'revision', 'completed', 'createdAt', 'updatedAt'],
      },
      'preparation-item': {
        collection: 'preparationItems',
        fields: [...itemFields, 'kind', 'order'],
      },
      'preparation-body': { collection: 'preparationBodies', fields: ['id', ...ownFields, 'kind'] },
      'session-reference': {
        collection: 'sessionReferences',
        fields: [...itemFields, 'sessionId'],
      },
      'session-reference-state': {
        collection: 'sessionReferenceState',
        fields: [...ownFields, 'sessionId'],
      },
      'session-preparation-link': {
        collection: 'sessionPreparationLinks',
        fields: [...itemFields, 'sessionId', 'itemId', 'order'],
      },
      'session-preparation-state': {
        collection: 'sessionPreparationState',
        fields: [...ownFields, 'sessionId', 'nextOrder'],
      },
    }).map(([family, value]) => [
      family,
      Object.freeze({ ...value, fields: Object.freeze(value.fields) }),
    ]),
  ),
);
export const CAMPAIGN_OWN_FAMILIES = Object.freeze(Object.keys(CAMPAIGN_OWN_DEFINITIONS));
export const CAMPAIGN_OWN_PAGE_ITEMS = 25;
export const CAMPAIGN_OWN_CHUNK_BYTES = 65536;

// One serialized own DTO; covers JSON escaping of all current domain limits.
export const CAMPAIGN_OWN_JSON_BYTES = 4 * 1024 * 1024;
