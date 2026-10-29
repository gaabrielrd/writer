import { BASE_TARGET_FIELDS } from './campaignRestoreBaseFormat.mjs';
import { restoredAnchorBaseId } from './campaignRestoreVariantFormat.mjs';
export const ANCHOR_MATERIALIZATION_BYTES = 8192;
export const ANCHOR_MATERIALIZATION_PHASES = ['copying', 'audit', 'ready', 'cleaning'];
export const ANCHOR_TARGET_FIELDS = BASE_TARGET_FIELDS;
export const anchorBasePath = (l, binding) =>
  'users/' + l.uid + '/campaignBases/' + restoredAnchorBaseId(l, binding.anchorKey);
export const ANCHOR_BINDING_FIELDS = ['slotIndex', 'anchorKey', 'sourceKey', 'authorizationHash'];
export const ANCHOR_SLOT_FIELDS = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'campaignId',
  'jobToken',
  'index',
  'createdByOperationId',
  'anchorKey',
  'sourceKey',
  'row',
  'authorizationHash',
];
