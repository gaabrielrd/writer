// @vitest-environment node
import { it, expect } from 'vitest';
import {
  ADVENTURE_RESTORE_EFFECT_ACTIONS,
  readAdventureRestoreEffectIntent,
  readAdventureRestoreEffectRecord,
  adventureRestoreEffectInput,
  adventureRestoreEffectFingerprint,
} from '../services/adventureRestoreEffectContracts.ts';
import {
  readAdventureRestoreActivationReview,
  readAdventureRestoreMediaStatus,
  readAdventureRestoreArchiveStatus,
} from '../services/adventureRestoreFinalizationViews.ts';
import { requestHash } from '../../../../functions/src/adventureRestoreContracts.mjs';
import { archiveFingerprint } from '../../../../functions/src/adventureRestoreArchiveContracts.mjs';
const identity = {
  ownerId: 'author',
  restoreId: 'adventure-effect-0001',
  adventureId: 'restore-a-' + 'a'.repeat(64),
  jobToken: 'b'.repeat(64),
  reviewHash: 'c'.repeat(64),
};
const intent = (action = 'activateAdventureRestore') => ({
  schemaVersion: 1,
  ...identity,
  action,
  operationId: 'adventure-effect-operation-0001',
  expectedCheckpoint: 8,
  reviewToken: action === 'activateAdventureRestore' ? 'd'.repeat(64) : null,
});
const stamp = '12345678-1234-4123-8123-123456789abc';
it.each(ADVENTURE_RESTORE_EFFECT_ACTIONS)(
  '%s input and fingerprint match actual adventure server',
  (action) => {
    const i = readAdventureRestoreEffectIntent(intent(action), identity),
      r = adventureRestoreEffectInput(i);
    expect(Object.isFrozen(i)).toBe(true);
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.keys(r).sort()).toEqual(
      [
        'restoreId',
        'jobToken',
        'operationId',
        'expectedCheckpoint',
        ...(action === 'activateAdventureRestore' ? ['reviewToken'] : []),
        ...(action === 'advanceAdventureRestoreCleanup' ? ['limit'] : []),
      ].sort(),
    );
    expect(adventureRestoreEffectFingerprint(i)).toBe(
      action === 'advanceAdventureRestoreArchiveCleanup'
        ? archiveFingerprint(r)
        : requestHash(action, r),
    );
    expect(JSON.stringify(i)).not.toMatch(/keyId|keyBase64|title|text|url/);
  },
);
it.each([
  { privateText: 'NO' },
  { keyId: 'f'.repeat(64) },
  { action: 'activateBookRestore' },
  { expectedCheckpoint: -1 },
  { expectedCheckpoint: Number.MAX_SAFE_INTEGER },
  { expectedCheckpoint: 1.5 },
  { operationId: '../bad' },
  { reviewToken: null },
  { ownerId: 'other' },
  { jobToken: 'f'.repeat(64) },
])('closed intent refuses incompatible data %j', (delta) => {
  expect(() => readAdventureRestoreEffectIntent({ ...intent(), ...delta }, identity)).toThrow();
});
it('nonactivation forbids review token; record stamp/account/key/extras are closed', () => {
  expect(() =>
    readAdventureRestoreEffectIntent(
      { ...intent('cancelAdventureRestore'), reviewToken: 'd'.repeat(64) },
      identity,
    ),
  ).toThrow();
  const r = { schemaVersion: 1, stamp, intent: intent() };
  expect(Object.isFrozen(readAdventureRestoreEffectRecord(r, 'author', identity.restoreId))).toBe(
    true,
  );
  for (const bad of [
    { ...r, stamp: 'bad' },
    { ...r, secret: 'NO' },
    { ...r, intent: { ...r.intent, text: 'NO' } },
  ])
    expect(() => readAdventureRestoreEffectRecord(bad, 'author', identity.restoreId)).toThrow();
  expect(() => readAdventureRestoreEffectRecord(r, 'other')).toThrow();
  expect(() => readAdventureRestoreEffectRecord(r, 'author', 'other-restore-0001')).toThrow();
});
const review = () => ({
  schemaVersion: 1,
  restoreId: identity.restoreId,
  adventureId: identity.adventureId,
  checkpoint: 8,
  reviewToken: 'd'.repeat(64),
  summary: {
    titlePreview: 'Private title',
    titleTruncated: false,
    visibility: 'private',
    counts: {
      parts: 0,
      scenes: 1,
      blocks: 0,
      words: 2,
      lore: 0,
      versions: 0,
      profiles: 0,
      images: 0,
    },
    warnings: {
      missingDates: 0,
      danglingLocalReferences: 0,
      externalReferences: 0,
      orphanGroups: 0,
      unknownOverrides: 0,
      historicalOnlyResources: 0,
    },
    universe: { originKind: 'none', observed: 'none', universeId: null },
    mediaState: 'none',
    draftOutcome: 'none',
  },
});
it('review clones and freezes consent without retaining caller summary', () => {
  const raw = review(),
    r = readAdventureRestoreActivationReview(raw, identity);
  raw.summary.titlePreview = 'Changed';
  expect(r.summary.titlePreview).toBe('Private title');
  expect(Object.isFrozen(r.summary.counts)).toBe(true);
  expect(Object.isFrozen(r.summary.warnings)).toBe(true);
});
it.each([
  (r) => {
    r.bookId = 'wrong';
  },
  (r) => {
    r.restoreId = 'other-restore-0001';
  },
  (r) => {
    r.summary.visibility = 'public';
  },
  (r) => {
    r.summary.mediaState = 'pending';
  },
  (r) => {
    r.summary.warnings.externalReferences = -1;
  },
  (r) => {
    r.summary.counts.images = 0.1;
  },
  (r) => {
    r.summary.titlePreview = 'x'.repeat(301);
  },
  (r) => {
    r.summary.universe = { originKind: 'none', observed: 'available', universeId: 'some' };
  },
  (r) => {
    r.summary.universe = { originKind: 'reference', observed: 'available', universeId: null };
  },
  (r) => {
    r.summary.draftOutcome = 'apply';
  },
  (r) => {
    r.checkpoint = Number.MAX_SAFE_INTEGER;
  },
])('review rejects malformed/foreign consent %#', (change) => {
  const raw = review();
  change(raw);
  expect(() => readAdventureRestoreActivationReview(raw, identity)).toThrow();
});
const media = () => ({
  checkpoint: 1,
  total: 2,
  processed: 1,
  ready: 1,
  unavailable: 0,
  complete: false,
});
it('media binds counters and completion checkpoint, without book single-cover fields', () => {
  expect(readAdventureRestoreMediaStatus(media())).toEqual(media());
  for (const delta of [
    { checkpoint: 2 },
    { processed: 2 },
    { unavailable: 1 },
    { total: 0 },
    { complete: true },
    { imageAvailable: true },
  ])
    expect(() => readAdventureRestoreMediaStatus({ ...media(), ...delta })).toThrow();
  expect(
    readAdventureRestoreMediaStatus({
      checkpoint: 1,
      total: 0,
      processed: 0,
      ready: 0,
      unavailable: 0,
      complete: true,
    }).complete,
  ).toBe(true);
});
const removed = {
  journals: 0,
  privateArtifacts: 0,
  chunks: 0,
  bytes: 0,
  proofs: 0,
  integrityStates: 0,
  index: 0,
  items: 0,
  validationStates: 0,
};
const archive = () => ({
  schemaVersion: 1,
  ownerId: identity.ownerId,
  restoreId: identity.restoreId,
  jobToken: identity.jobToken,
  adventureId: identity.adventureId,
  activationOperationId: 'adventure-activation-0001',
  mediaOperationId: 'adventure-media-op-0001',
  mediaToken: 'a'.repeat(64),
  contextToken: 'b'.repeat(64),
  checkpoint: 1,
  phase: 'journals',
  after: null,
  removed: { ...removed },
  firstOperationId: 'adventure-archive-op-0001',
  lastOperationId: 'adventure-archive-op-0001',
  updatedAt: 2001,
  completedAt: null,
});
it('archive projects adventure checkpoint/counters and refuses book revision/foreign native context', () => {
  const r = readAdventureRestoreArchiveStatus(archive(), identity);
  expect(r.checkpoint).toBe(1);
  expect(Object.isFrozen(r.removed)).toBe(true);
  for (const delta of [
    { ownerId: 'other' },
    { jobToken: 'f'.repeat(64) },
    { checkpoint: 0 },
    { revision: 1 },
    { phase: 'artifacts' },
    { completedAt: 2001 },
    { after: '../bad' },
    { removed: { ...removed, proofs: 1 } },
    { removed: { ...removed, privateArtifacts: 1 } },
  ])
    expect(() => readAdventureRestoreArchiveStatus({ ...archive(), ...delta }, identity)).toThrow();
  for (const phase of ['not-started', 'waiting-for-media']) {
    const initial = { checkpoint: 0, phase, after: null, removed, completedAt: null };
    expect(readAdventureRestoreArchiveStatus(initial, identity).phase).toBe(phase);
    expect(() =>
      readAdventureRestoreArchiveStatus({ ...initial, checkpoint: 1 }, identity),
    ).toThrow();
  }
});
