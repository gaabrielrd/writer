// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  readBookRestoreEffectIntent as read,
  readBookRestoreEffectRecord as record,
  createBookRestoreEffectRecord as create,
  bookRestoreEffectInput as input,
  bookRestoreEffectFingerprint as fingerprint,
} from '../services/bookRestoreEffectContracts.ts';
import { requestHash } from '../../../../functions/src/bookRestoreUploadContracts.mjs';
import { BOOK_RESTORE_EFFECT_ACTIONS } from '../model/bookRestoreEffects.ts';
const identity = {
  ownerId: 'author',
  restoreId: 'effect-restore-0001',
  bookId: 'book',
  jobToken: 'a'.repeat(64),
};
const make = (action) => ({
  schemaVersion: 1,
  ...identity,
  action,
  operationId: 'effect-operation-0001',
  expectedCheckpoint: [
    'activateBookRestore',
    'cancelBookRestore',
    'advanceBookRestoreCleanup',
  ].includes(action)
    ? 5
    : null,
  expectedRevision: action === 'advanceBookRestoreArchiveCleanup' ? 3 : null,
  reviewToken: action === 'activateBookRestore' ? 'b'.repeat(64) : null,
});
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
for (const action of BOOK_RESTORE_EFFECT_ACTIONS)
  it(
    'closed operational intent ' + action + ' persists only its original applicable metadata',
    () => {
      const i = read(make(action), identity),
        r = create(i);
      expect(record(r, 'author', identity.restoreId)).toEqual(r);
      expect(Object.isFrozen(r.intent)).toBe(true);
      const body = input(i);
      expect(body.restoreId).toBe(identity.restoreId);
      expect(body).not.toHaveProperty('ownerId');
      expect(body).not.toHaveProperty('bookId');
      expect(body).not.toHaveProperty('action');
      expect(body).not.toHaveProperty('schemaVersion');
      if (i.expectedCheckpoint === null) expect(body).not.toHaveProperty('expectedCheckpoint');
      else expect(body.expectedCheckpoint).toBe(i.expectedCheckpoint);
      if (i.expectedRevision === null) expect(body).not.toHaveProperty('expectedRevision');
      else expect(body.expectedRevision).toBe(i.expectedRevision);
      if (i.reviewToken === null) expect(body).not.toHaveProperty('reviewToken');
      else expect(body.reviewToken).toBe(i.reviewToken);
    },
  );
it('standard activation and cancellation fingerprints match the actual receipt resolver contract', () => {
  for (const action of ['activateBookRestore', 'cancelBookRestore', 'advanceBookRestoreCleanup']) {
    const intent = make(action);
    expect(fingerprint(intent)).toBe(requestHash(action, input(intent)));
  }
  expect(() => fingerprint(make('finalizeBookRestoreMedia'))).toThrow();
  expect(() => fingerprint(make('advanceBookRestoreArchiveCleanup'))).toThrow();
});
it('secret/prose/foreign data cannot be persisted in an operational intent or record', () => {
  const i = make('activateBookRestore'),
    r = create(i);
  for (const extra of [
    { privateText: 'NEVER_STORE' },
    { title: 'NEVER_STORE' },
    { keyBase64: 'NEVER_STORE' },
    { authToken: 'NEVER_STORE' },
    { url: 'NEVER_STORE' },
    { ownerId: 'other' },
    { bookId: 'other' },
    { restoreId: 'other-restore-0001' },
    { jobToken: 'c'.repeat(64) },
    { operationId: 'short' },
    { action: 'openPreparedBookRestoreLore' },
    { schemaVersion: 2 },
  ])
    expect(() => read({ ...i, ...extra }, identity)).toThrow();
  expect(() =>
    record({ ...r, privateText: 'NEVER_STORE' }, 'author', identity.restoreId),
  ).toThrow();
  expect(() => record(r, 'other', identity.restoreId)).toThrow();
  expect(() => record(r, 'author', 'other-restore-0001')).toThrow();
});
it('wrong checkpoints/revisions/tokens cannot change the action of an already recorded intent', () => {
  for (const action of BOOK_RESTORE_EFFECT_ACTIONS)
    for (const extra of [
      { expectedCheckpoint: -1 },
      { expectedCheckpoint: Number.MAX_SAFE_INTEGER },
      { expectedRevision: -1 },
      { expectedRevision: Number.MAX_SAFE_INTEGER },
      { reviewToken: 'bad' },
    ])
      expect(() => read({ ...make(action), ...extra }, identity)).toThrow();
  for (const extra of [
    { expectedRevision: 1 },
    { expectedCheckpoint: null },
    { reviewToken: null },
  ])
    expect(() => read({ ...make('activateBookRestore'), ...extra }, identity)).toThrow();
  expect(() =>
    read({ ...make('finalizeBookRestoreMedia'), expectedCheckpoint: 1 }, identity),
  ).toThrow();
});
