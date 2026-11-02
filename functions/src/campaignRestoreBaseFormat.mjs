import { digest } from './sceneContracts.mjs';
import { baseImageKey } from './campaignBaseContracts.mjs';
export const BASE_MATERIALIZATION_BYTES = 8192;
export const BASE_MATERIALIZATION_PHASES = ['copying', 'root', 'audit', 'ready', 'cleaning'];
export const restoredBaseId = (l) =>
  digest(['writer-campaign-restore-v1', l.uid, l.rid, l.token, 'active-base']);
export const restoredBaseImage = (l, key) => {
  const imageId = digest(['writer-campaign-restore-v1', l.uid, l.rid, l.token, 'image', key]);
  return { imageId, imageKey: baseImageKey(imageId) };
};
export const BASE_TARGET_FIELDS = {
  root: [
    'id',
    'ownerId',
    'campaignId',
    'schemaVersion',
    'state',
    'adventureId',
    'universeId',
    'capturedAt',
    'sourceMode',
    'sourceEvidence',
    'counts',
  ],
  items: [
    'sourceKey',
    'kind',
    'origin',
    'parentKey',
    'archived',
    'orderKey',
    'fields',
    'sourceEvidence',
  ],
  bodies: ['sourceKey', 'field', 'index'],
  links: ['kind', 'sourceKey', 'referenceMode', 'portableReference'],
  loreReferences: ['referenceKey', 'processed', 'referenceMode', 'portableReference'],
  images: ['imageKey', 'imageId', 'state', 'generation', 'useKey'],
};
