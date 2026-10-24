import { readObject, readId, readHash, readCount } from './bookLoreReadContracts';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { journalIdentity, journalFail, type LoreJournalIdentity } from './bookLoreJournalContracts';
export interface LorePreparationIntent {
  writeId: string;
  bookId: string;
  loreId: string;
  sourceToken: string;
  intentHash: string;
}
export interface LoreRecoveryControl {
  writeId: string;
  requestHash: string;
  jobToken?: string;
}
export interface LoreRecoveryView {
  schemaVersion: 1;
  writeId: string;
  requestHash: string;
  jobToken: string;
  phase: 'reserved' | 'revoked';
  keyId: string | null;
  bookId: string | null;
  loreId: string | null;
  sourceToken: string | null;
  intentHash: string | null;
}
export interface LorePreparationHead {
  schemaVersion: 1;
  uid: string;
  stamp: string;
  intent: LorePreparationIntent;
  requestHash: string;
  cancelRequested: boolean;
  releaseRequested: boolean;
  reserveState: 'pending' | 'confirmed';
  identity: LoreJournalIdentity | null;
  jobsClosed: 'none' | 'cancelled' | 'applied' | null;
  revoke: { wire: LoreRecoveryControl; state: 'pending' | 'confirmed' } | null;
  closed: LoreRecoveryView | null;
  discard: { phase: 'requested' | 'purging' | 'complete'; deleted: number } | null;
}
export function preparationIntent(value: unknown): LorePreparationIntent {
  const v = readObject(freezeLoreEditValue(value), [
    'writeId',
    'bookId',
    'loreId',
    'sourceToken',
    'intentHash',
  ]);
  for (const k of ['writeId', 'bookId', 'loreId']) readId(v[k]);
  for (const k of ['sourceToken', 'intentHash']) readHash(v[k]);
  return v as unknown as LorePreparationIntent;
}
export const preparationRequestHash = (uid: string, intent: LorePreparationIntent) =>
  hash({ domain: 'writer-lore-edit-recovery', schemaVersion: 1, uid, intent });
export function recoveryControl(
  value: unknown,
  intent: LorePreparationIntent,
  requestHash: string,
): LoreRecoveryControl {
  const v = readObject(freezeLoreEditValue(value), ['writeId', 'requestHash'], ['jobToken']);
  if (v.writeId !== intent.writeId || v.requestHash !== requestHash) journalFail();
  if (v.jobToken !== undefined) readHash(v.jobToken);
  return v as unknown as LoreRecoveryControl;
}
export function readLoreRecoveryView(
  value: unknown,
  uid: string,
  intent: LorePreparationIntent,
  pinned?: LoreJournalIdentity | null,
): LoreRecoveryView {
  const v = readObject(freezeLoreEditValue(value), [
    'schemaVersion',
    'writeId',
    'requestHash',
    'jobToken',
    'phase',
    'keyId',
    'bookId',
    'loreId',
    'sourceToken',
    'intentHash',
  ]);
  if (
    v.schemaVersion !== 1 ||
    v.writeId !== intent.writeId ||
    v.requestHash !== preparationRequestHash(uid, intent) ||
    !['reserved', 'revoked'].includes(v.phase as string)
  )
    journalFail();
  readHash(v.jobToken);
  const keys = ['keyId', 'bookId', 'loreId', 'sourceToken', 'intentHash'],
    empty = keys.every((k) => v[k] === null);
  if (empty) {
    if (v.phase !== 'revoked' || pinned) journalFail();
  } else {
    for (const k of ['keyId', 'sourceToken', 'intentHash']) readHash(v[k]);
    for (const k of ['bookId', 'loreId']) readId(v[k]);
    if (
      ['bookId', 'loreId', 'sourceToken', 'intentHash'].some(
        (k) => v[k] !== intent[k as keyof LorePreparationIntent],
      )
    )
      journalFail();
  }
  if (
    pinned &&
    ['jobToken', 'keyId', 'bookId', 'loreId', 'sourceToken', 'intentHash'].some(
      (k) => v[k] !== pinned[k as keyof LoreJournalIdentity],
    )
  )
    journalFail();
  return v as unknown as LoreRecoveryView;
}
export function identityFromRecovery(v: LoreRecoveryView, uid: string): LoreJournalIdentity | null {
  if (v.keyId === null) return null;
  const { phase: _phase, ...metadata } = v;
  void _phase;
  return journalIdentity({ uid, ...metadata });
}
export function preparationHead(value: unknown, uid: string, writeId: string): LorePreparationHead {
  const v = readObject(
      freezeLoreEditValue(value),
      [
        'schemaVersion',
        'uid',
        'stamp',
        'intent',
        'requestHash',
        'cancelRequested',
        'releaseRequested',
        'reserveState',
        'identity',
        'jobsClosed',
        'revoke',
        'closed',
      ],
      ['discard'],
    ),
    intent = preparationIntent(v.intent);
  readId(uid);
  readId(v.stamp);
  if (
    v.schemaVersion !== 1 ||
    v.uid !== uid ||
    uid.length > 128 ||
    intent.writeId !== writeId ||
    v.requestHash !== preparationRequestHash(uid, intent) ||
    typeof v.cancelRequested !== 'boolean' ||
    typeof v.releaseRequested !== 'boolean' ||
    (v.releaseRequested && !v.cancelRequested) ||
    !['pending', 'confirmed'].includes(v.reserveState as string) ||
    ![null, 'none', 'cancelled', 'applied'].includes(v.jobsClosed as null | string)
  )
    journalFail();
  const identity = v.identity === null ? null : journalIdentity(v.identity);
  if (
    identity &&
    (identity.uid !== uid ||
      identity.writeId !== writeId ||
      identity.requestHash !== v.requestHash ||
      ['bookId', 'loreId', 'sourceToken', 'intentHash'].some(
        (k) =>
          identity[k as keyof LoreJournalIdentity] !== intent[k as keyof LorePreparationIntent],
      ))
  )
    journalFail();
  if (v.revoke !== null) {
    const r = readObject(v.revoke, ['wire', 'state']),
      wire = recoveryControl(r.wire, intent, v.requestHash);
    if (
      !['pending', 'confirmed'].includes(r.state as string) ||
      !v.cancelRequested ||
      !v.releaseRequested ||
      v.jobsClosed === null ||
      (wire.jobToken !== undefined && identity && wire.jobToken !== identity.jobToken)
    )
      journalFail();
  }
  let closed: LoreRecoveryView | null = null;
  if (v.closed !== null) {
    closed = readLoreRecoveryView(v.closed, uid, intent, identity);
    if (
      closed.phase !== 'revoked' ||
      (closed.keyId !== null && !identity) ||
      !v.cancelRequested ||
      !v.releaseRequested ||
      v.jobsClosed === null ||
      (v.revoke as { state?: string } | null)?.state !== 'confirmed'
    )
      journalFail();
  }
  if (
    (v.jobsClosed !== null && !v.cancelRequested) ||
    (v.reserveState === 'confirmed' && !identity && !v.cancelRequested) ||
    ((v.revoke as { state?: string } | null)?.state === 'confirmed' && !closed)
  )
    journalFail();
  const discard =
    v.discard === undefined || v.discard === null
      ? null
      : readObject(v.discard, ['phase', 'deleted']);
  if (
    discard &&
    (!['requested', 'purging', 'complete'].includes(discard.phase as string) ||
      readCount(discard.deleted) < 0 ||
      !v.cancelRequested ||
      !v.releaseRequested ||
      (discard.phase !== 'requested' && !closed))
  )
    journalFail();
  return freezeLoreEditValue({ ...v, discard }) as LorePreparationHead;
}
