import { digest } from './sceneContracts.mjs';
export const OWN_MATERIALIZATION_BYTES = 32768;
export const OWN_MATERIALIZATION_PHASES = [
  'writing',
  'global-controls',
  'session-controls',
  'audit',
  'ready',
  'cleaning',
];
const item = [
  'id',
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'revision',
  'deleted',
  'createdAt',
  'updatedAt',
];
const scope = ['schemaVersion', 'ownerId', 'campaignId', 'campaignToken', 'revision'];
export const OWN_TARGET_FIELDS = Object.freeze({
  notes: item,
  sessions: [...item, 'order'],
  workChecklist: ['id', 'revision', 'completed', 'createdAt', 'updatedAt'],
  preparationItems: [...item, 'kind', 'order'],
  preparationBodies: ['id', ...scope, 'kind'],
  sessionReferences: [...item, 'sessionId'],
  sessionPreparationLinks: [...item, 'sessionId', 'itemId', 'order'],
  noteState: scope,
  sessionState: [...scope, 'nextOrder'],
  preparationState: [...scope, 'nextOrder'],
  sessionReferenceState: [...scope, 'sessionId'],
  sessionPreparationState: [...scope, 'sessionId', 'nextOrder'],
  workProgress: [
    'schemaVersion',
    'revision',
    'editorialState',
    'wordGoal',
    'checklistRevision',
    'checklistTotal',
    'checklistCompleted',
    'countVersion',
    'countReady',
    'wordCount',
    'countRevision',
    'processed',
    'phase',
    'cursor',
    'updatedAt',
  ],
});
export const ownRestoredId = (l, family, original) =>
  digest([
    'writer-campaign-restore-v1',
    'own-id',
    l.uid,
    l.rid,
    l.token,
    family === 'preparation-body' ? 'preparation-item' : family,
    original,
  ]);
export const ownTargetMetadata = (collection, value) =>
  Object.fromEntries(
    OWN_TARGET_FIELDS[collection].filter((k) => Object.hasOwn(value, k)).map((k) => [k, value[k]]),
  );
