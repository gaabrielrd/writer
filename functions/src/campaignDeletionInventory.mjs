import { workFail } from './workProgressContracts.mjs';
export function cleanupVersion(p) {
  const value = Object.hasOwn(p, 'cleanupVersion') ? p.cleanupVersion : 1;
  if (value !== 1 && value !== 2 && value !== 3 && value !== 4)
    workFail('failed-precondition', 'A versão da limpeza não é suportada.');
  return value;
}
const frozenSpecs = (specs) =>
  Object.freeze(
    specs.map((spec) =>
      spec === null ? null : Object.freeze({ ...spec, fields: Object.freeze([...spec.fields]) }),
    ),
  );
// Historical order is part of the persisted checkpoint contract. Add a new
// version before introducing resources; never insert into an existing layout.
const inventories = Object.freeze(
  [1, 2, 3, 4].map((version) =>
    Object.freeze({
      recovery: frozenSpecs([
        {
          collection: 'campaignVariantOperations',
          fields: ['ownerId', 'campaignId', 'descriptorHash', 'fingerprint'],
          value: (v) => ({
            ...(v.descriptorHash ? { descriptorHash: v.descriptorHash } : {}),
            ...(v.fingerprint ? { fingerprint: v.fingerprint } : {}),
          }),
        },
        {
          collection: 'campaignVariantResolutionOperations',
          filter: 'result.request.campaignId',
          fields: ['ownerId', 'fingerprint'],
          value: (v) => ({ fingerprint: v.fingerprint }),
        },
        {
          collection: 'campaignComparisonStartFences',
          filter: 'request.campaignId',
          fields: ['ownerId', 'fingerprint'],
          value: (v) => ({ fingerprint: v.fingerprint }),
        },
        ...(version >= 2
          ? [{ collection: 'campaignSessionOperations', fields: ['ownerId', 'campaignId'] }]
          : []),
        ...(version >= 3
          ? [
              {
                collection: 'campaignSessionReferenceOperations',
                fields: ['ownerId', 'campaignId'],
              },
              { collection: 'campaignSessionReferenceFences', fields: ['ownerId', 'campaignId'] },
            ]
          : []),
        ...(version === 4
          ? [
              { collection: 'campaignPreparationOperations', fields: ['ownerId', 'campaignId'] },
              { collection: 'campaignPreparationFences', fields: ['ownerId', 'campaignId'] },
            ]
          : []),
      ]),
      controls: frozenSpecs([
        {
          collection: 'campaignPreparations',
          fields: ['ownerId', 'campaignId', 'id'],
          value: (v, id) => ({ id, captureId: id }),
        },
        {
          collection: 'campaignComparisons',
          fields: ['ownerId', 'campaignId', 'id'],
          value: (v, id) => ({ id, comparisonId: id }),
        },
        null,
        { collection: 'campaignAdoptionGuards', fields: ['ownerId', 'campaignId'] },
      ]),
      base: Object.freeze(['images', 'bodies', 'links', 'loreReferences', 'items']),
      generations: Object.freeze(['loreVariants', 'loreVariantBodies']),
      children: Object.freeze([
        'notes',
        'noteState',
        'workChecklist',
        'workProgress',
        'loreVariants',
        'loreVariantBodies',
        'loreVariantState',
        ...(version >= 2 ? ['sessions', 'sessionState'] : []),
        ...(version >= 3 ? ['sessionReferences', 'sessionReferenceState'] : []),
        ...(version === 4
          ? [
              'preparationItems',
              'preparationBodies',
              'preparationState',
              'sessionPreparationLinks',
              'sessionPreparationState',
            ]
          : []),
      ]),
    }),
  ),
);
export function campaignDeletionInventory(p) {
  return inventories[cleanupVersion(p) - 1];
}
