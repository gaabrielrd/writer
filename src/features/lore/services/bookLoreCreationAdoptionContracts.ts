import { readObject, readId, readHash, readCount } from './bookLoreReadContracts';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { creationCheckpointJob } from './bookLoreCreationCheckpointContracts';
import { creationProgress, type LoreCreationProgress } from './bookLoreCreationProgress';
import { bookLoreCreationIdentity } from './bookLoreCreationPlan';
import { readLoreControlStoredProgress } from './bookLoreControlContracts';
import { journalFail } from './bookLoreJournalContracts';
import type { LoreEditProgress } from './bookLoreWriteProgress';
import type { CreationTicket } from './bookLoreCreationTicketContracts';

export interface CreationApplyIntent {
  editId: string;
  startHash: string;
  jobToken: string;
  expectedRevision: number;
  operationId: string;
}
export interface CreationAdoptionState {
  intent: CreationApplyIntent;
  phase: 'pending' | 'confirmed' | 'conflict';
  request: 'parent' | 'edit' | null;
  parent: LoreCreationProgress | null;
  edit: LoreEditProgress | null;
}
export function readCreationApplyIntent(value: unknown, t: CreationTicket): CreationApplyIntent {
  const v = readObject(freezeLoreEditValue(value), [
    'editId',
    'startHash',
    'jobToken',
    'expectedRevision',
    'operationId',
  ]);
  const revision = readCount(v.expectedRevision),
    id = creationCheckpointJob(t, 'lore-edit');
  if (
    v.editId !== id ||
    !t.identity ||
    t.intentHash === null ||
    revision < 1 ||
    v.operationId !==
      hash({
        domain: 'writer-book-lore-client-unit',
        uid: t.uid,
        writeId: t.writeId,
        bookId: t.bookId,
        loreId: t.loreId,
        method: 'adoptBookLoreEditGeneration',
        id,
        revision,
      })
  )
    journalFail();
  readHash(v.startHash);
  readHash(v.jobToken);
  readId(v.operationId);
  return v as unknown as CreationApplyIntent;
}
export function creationParentAdoptionMatches(
  p: LoreCreationProgress,
  intent: CreationApplyIntent,
) {
  return (
    p.phase === 'adopted' &&
    p.adoption?.editId === intent.editId &&
    p.adoption.operationId === intent.operationId &&
    p.adoption.generationId ===
      hash({ domain: 'writer-lore-edit-generation', editToken: intent.jobToken })
  );
}
export function creationAdoptionPair(
  p: LoreCreationProgress,
  e: LoreEditProgress,
  intent: CreationApplyIntent,
) {
  return (
    creationParentAdoptionMatches(p, intent) &&
    e.id === intent.editId &&
    e.startHash === intent.startHash &&
    e.jobToken === intent.jobToken &&
    e.phase === 'adopted' &&
    e.revision === intent.expectedRevision + 1 &&
    e.adoption?.operationId === intent.operationId &&
    e.adoption.timestamp === p.adoption!.timestamp &&
    e.adoption.localLoreVersion === p.adoption!.localLoreVersion
  );
}
export function readCreationAdoptionState(
  value: unknown,
  t: CreationTicket,
): CreationAdoptionState {
  const v = readObject(freezeLoreEditValue(value), [
      'intent',
      'phase',
      'request',
      'parent',
      'edit',
    ]),
    intent = readCreationApplyIntent(v.intent, t),
    parent =
      v.parent === null
        ? null
        : creationProgress(v.parent, {
            ...bookLoreCreationIdentity(t.uid, t.writeId, t.bookId),
            token: t.parent?.jobToken,
          });
  let edit: LoreEditProgress | null = null;
  if (v.edit !== null)
    edit = readLoreControlStoredProgress(v.edit, 'edit', {
      id: intent.editId,
      startHash: intent.startHash,
    }) as LoreEditProgress;
  if (
    !['pending', 'confirmed', 'conflict'].includes(v.phase as string) ||
    !['parent', 'edit', null].includes(v.request as string | null) ||
    (v.phase === 'pending' && v.request === null) ||
    (v.phase !== 'pending' && v.request !== null) ||
    (v.request === 'edit' && (!parent || !creationParentAdoptionMatches(parent, intent))) ||
    (v.phase === 'confirmed' &&
      (!parent ||
        !edit ||
        !creationAdoptionPair(parent, edit, intent) ||
        hash(t.parent) !== hash(parent))) ||
    (v.phase === 'conflict' && parent?.phase !== 'adopted') ||
    (v.phase !== 'confirmed' && edit !== null)
  )
    journalFail();
  return v as unknown as CreationAdoptionState;
}
export function creationAdoptionTransition(a: CreationTicket, b: CreationTicket) {
  const old = a.ownApply,
    next = b.ownApply;
  if (!old) {
    if (
      next &&
      (next.phase !== 'pending' ||
        next.request !== 'parent' ||
        next.parent !== null ||
        next.edit !== null)
    )
      journalFail();
    return;
  }
  if (
    !next ||
    hash(old.intent) !== hash(next.intent) ||
    (next.phase === 'confirmed' && old.phase === 'pending' && old.request !== 'edit') ||
    (old.phase !== 'pending' && hash(old) !== hash(next)) ||
    (old.parent?.phase === 'adopted' && hash(old.parent) !== hash(next.parent))
  )
    journalFail();
}
