import { digest } from './sceneContracts.mjs';
export const VARIANT_MATERIALIZATION_BYTES = 8192;
export const VARIANT_MATERIALIZATION_PHASES = ['copying', 'root', 'audit', 'ready', 'cleaning'];
export const restoredLoreGenerationId = (l) =>
  digest(['writer-campaign-restore-v1', l.uid, l.rid, l.token, 'lore-generation']);
export const restoredAnchorBaseId = (l, anchorKey) =>
  digest(['writer-campaign-restore-v1', l.uid, l.rid, l.token, 'lore-anchor', anchorKey]);
export const VARIANT_TARGET_FIELDS = {
  root: [
    'schemaVersion',
    'id',
    'ownerId',
    'campaignId',
    'campaignToken',
    'baseId',
    'state',
    'variantCount',
  ],
  loreVariants: [
    'schemaVersion',
    'ownerId',
    'campaignId',
    'campaignToken',
    'baseId',
    'sourceKey',
    'revision',
    'mode',
    'previousMode',
    'createdAt',
    'updatedAt',
    'manifest',
    'bodyCodec',
    'bodyBinding',
    'anchor',
    'participation',
    'retainedLegacy',
  ],
  loreVariantBodies: ['sourceKey', 'baseId', 'campaignToken', 'revision', 'index'],
};
