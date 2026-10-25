import { readObject, readCount, readHash } from './bookLoreReadContracts';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import {
  removalIdentity,
  removalEqual,
  removalFail,
  makeRemovalIntent,
  parseRemovalInspection,
  parseRemovalProgress,
  parseRemovalWire,
  type LoreRemovalIdentity,
  type RemovalInspection,
  type LoreRemovalIntent,
  type LoreRemovalProgress,
  type LoreRemovalWire,
} from './bookLoreRemovalProtocol';

export interface LoreRemovalJournal {
  readonly schemaVersion: 1;
  readonly identity: LoreRemovalIdentity;
  readonly revision: number;
  readonly stamp: string;
  readonly inspection: RemovalInspection | null;
  readonly intent: LoreRemovalIntent | null;
  readonly removal: LoreRemovalProgress | null;
  readonly pending: LoreRemovalWire | null;
  readonly cancelRequested: boolean;
  readonly inspectionClosed: boolean;
  readonly cancellationChecked: boolean;
}
type State = Omit<LoreRemovalJournal, 'stamp'>;
const stamp = (state: State) => hash({ domain: 'writer-book-lore-removal-journal', state });
export function sealRemovalJournal(state: State): LoreRemovalJournal {
  return readRemovalJournal(
    { ...state, stamp: stamp(state) },
    state.identity.uid,
    state.identity.writeId,
  );
}
export function initialRemovalJournal(identity: LoreRemovalIdentity): LoreRemovalJournal {
  return sealRemovalJournal({
    schemaVersion: 1,
    identity: removalIdentity(identity),
    revision: 0,
    inspection: null,
    intent: null,
    removal: null,
    pending: null,
    cancelRequested: false,
    inspectionClosed: false,
    cancellationChecked: false,
  });
}
export function readRemovalJournal(
  value: unknown,
  uid: string,
  writeId: string,
): LoreRemovalJournal {
  const v = readObject(freezeLoreEditValue(value), [
    'schemaVersion',
    'identity',
    'revision',
    'stamp',
    'inspection',
    'intent',
    'removal',
    'pending',
    'cancelRequested',
    'inspectionClosed',
    'cancellationChecked',
  ]);
  const identity = removalIdentity(v.identity, uid);
  if (
    identity.writeId !== writeId ||
    v.schemaVersion !== 1 ||
    typeof v.cancelRequested !== 'boolean' ||
    typeof v.inspectionClosed !== 'boolean' ||
    typeof v.cancellationChecked !== 'boolean'
  )
    removalFail();
  const inspection = v.inspection === null ? null : parseRemovalInspection(v.inspection, identity);
  let intent: LoreRemovalIntent | null = null;
  if (v.intent !== null) {
    if (!inspection?.jobToken) removalFail();
    intent = makeRemovalIntent(identity, inspection);
    if (!removalEqual(intent, v.intent)) removalFail();
  }
  const removal =
    v.removal === null ? null : intent ? parseRemovalProgress(v.removal, intent) : removalFail();
  const context = { identity, inspection, intent, removal };
  const pending = v.pending === null ? null : parseRemovalWire(v.pending, context);
  if (
    (v.inspectionClosed && (!v.cancelRequested || inspection?.phase !== 'cancelled')) ||
    (v.cancellationChecked && !v.inspectionClosed) ||
    (v.cancelRequested &&
      !removal &&
      pending &&
      pending.method !== 'cancelBookLoreSourceInspection') ||
    (!v.cancelRequested && intent && !removal && pending?.method !== 'startBookLoreRemoval') ||
    (removal && pending && pending.method !== 'advanceBookLoreRemoval')
  )
    removalFail();
  const state: State = {
    schemaVersion: 1,
    identity,
    revision: readCount(v.revision),
    inspection,
    intent,
    removal,
    pending,
    cancelRequested: v.cancelRequested,
    inspectionClosed: v.inspectionClosed,
    cancellationChecked: v.cancellationChecked,
  };
  if (readHash(v.stamp) !== stamp(state)) removalFail();
  return freezeLoreEditValue({ ...state, stamp: v.stamp }) as LoreRemovalJournal;
}
export class LoreRemovalJournalConflict extends Error {
  constructor() {
    super('A retirada mudou em outra aba. Confira a recuperação.');
  }
}
export function removalJournalTransition(
  a: LoreRemovalJournal,
  b: LoreRemovalJournal,
  consecutive = true,
) {
  if (
    !removalEqual(a.identity, b.identity) ||
    (consecutive ? b.revision !== a.revision + 1 : b.revision < a.revision) ||
    (b.revision === a.revision && !removalEqual(a, b)) ||
    (a.cancelRequested && !b.cancelRequested) ||
    (a.inspectionClosed && !b.inspectionClosed) ||
    (a.cancellationChecked && !b.cancellationChecked) ||
    (a.intent && !removalEqual(a.intent, b.intent)) ||
    (a.inspection &&
      (!b.inspection ||
        b.inspection.jobToken !== a.inspection.jobToken ||
        b.inspection.revision < a.inspection.revision ||
        (a.inspection.phase === 'cancelled' && b.inspection.phase !== 'cancelled'))) ||
    (a.removal &&
      (!b.removal ||
        b.removal.jobToken !== a.removal.jobToken ||
        b.removal.revision < a.removal.revision ||
        b.removal.processed < a.removal.processed ||
        b.removal.coordinatedUnits < a.removal.coordinatedUnits ||
        (a.removal.complete && !b.removal.complete) ||
        (a.removal.phase === 'handed-off' && b.removal.phase !== 'handed-off')))
  )
    removalFail();
}
export function patchRemovalJournal(
  head: LoreRemovalJournal,
  patch: Partial<Omit<State, 'schemaVersion' | 'identity' | 'revision'>>,
) {
  const next = sealRemovalJournal({
    schemaVersion: 1,
    identity: head.identity,
    revision: head.revision + 1,
    inspection: head.inspection,
    intent: head.intent,
    removal: head.removal,
    pending: head.pending,
    cancelRequested: head.cancelRequested,
    inspectionClosed: head.inspectionClosed,
    cancellationChecked: head.cancellationChecked,
    ...patch,
  });
  removalJournalTransition(head, next);
  return next;
}
