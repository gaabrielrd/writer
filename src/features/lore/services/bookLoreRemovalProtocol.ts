import { readObject, readId, readHash, readCount } from './bookLoreReadContracts';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { inspectionProgress, type LoreInspectionProgress } from './bookLoreWriteProgress';

export function removalFail(): never {
  throw Error(
    'Não foi possível conferir a retirada de lore. Preserve a recuperação e tente novamente.',
  );
}
export interface LoreRemovalIdentity {
  readonly uid: string;
  readonly writeId: string;
  readonly bookId: string;
  readonly loreId: string;
  readonly sourceToken: string;
}
export type RemovalInspection = Omit<LoreInspectionProgress, 'id'> & {
  readonly inspectionId: string;
};
export interface LoreRemovalIntent {
  readonly bookId: string;
  readonly loreId: string;
  readonly removalId: string;
  readonly sourceToken: string;
  readonly inspection: {
    readonly inspectionId: string;
    readonly startHash: string;
    readonly jobToken: string;
  };
}
export interface LoreRemovalProgress {
  readonly removalId: string;
  readonly startHash: string;
  readonly jobToken: string;
  readonly removed: true;
  readonly revision: number;
  readonly phase: string;
  readonly complete: boolean;
  readonly processed: number;
  readonly coordinatedUnits: number;
}
export type RemovalWireKind =
  'inspect-start' | 'inspect-advance' | 'inspect-cancel' | 'remove-start' | 'remove-advance';
export interface LoreRemovalWire {
  readonly method: string;
  readonly input: Readonly<Record<string, unknown>>;
}
export const removalEqual = (a: unknown, b: unknown) => hash(a) === hash(b);
export function removalIdentity(value: unknown, uid?: string): LoreRemovalIdentity {
  const v = readObject(freezeLoreEditValue(value), [
    'uid',
    'writeId',
    'bookId',
    'loreId',
    'sourceToken',
  ]);
  const i = {
    uid: readId(v.uid),
    writeId: readId(v.writeId),
    bookId: readId(v.bookId),
    loreId: readId(v.loreId),
    sourceToken: readHash(v.sourceToken),
  };
  if (uid !== undefined && i.uid !== uid) removalFail();
  return Object.freeze(i);
}
export function removalIds(i: LoreRemovalIdentity) {
  const suffix = hash({ domain: 'writer-book-lore-removal-client', schemaVersion: 1, identity: i });
  return { inspectionId: 'lore-removal-source-' + suffix, removalId: 'lore-removal-' + suffix };
}
export function removalInspectionIntent(i: LoreRemovalIdentity) {
  return {
    bookId: i.bookId,
    loreId: i.loreId,
    inspectionId: removalIds(i).inspectionId,
    sourceToken: i.sourceToken,
  };
}
export const removalInspectionHash = (i: LoreRemovalIdentity) =>
  hash({
    domain: 'writer-lore-source-inspection',
    schemaVersion: 1,
    intent: removalInspectionIntent(i),
  });
export const removalIntentHash = (intent: LoreRemovalIntent) =>
  hash({ domain: 'writer-book-lore-removal', schemaVersion: 1, intent });
export function parseRemovalInspection(
  value: unknown,
  i: LoreRemovalIdentity,
  token?: string | null,
): RemovalInspection {
  const p = inspectionProgress(value, {
    id: removalIds(i).inspectionId,
    startHash: removalInspectionHash(i),
    ...(token === undefined ? {} : { token }),
  });
  const { id, ...rest } = p;
  return Object.freeze({ inspectionId: id, ...rest });
}
export function makeRemovalIntent(i: LoreRemovalIdentity, p: RemovalInspection): LoreRemovalIntent {
  if (!p.jobToken) removalFail();
  return freezeLoreEditValue({
    bookId: i.bookId,
    loreId: i.loreId,
    removalId: removalIds(i).removalId,
    sourceToken: i.sourceToken,
    inspection: {
      inspectionId: p.inspectionId,
      startHash: p.startHash,
      jobToken: p.jobToken,
    },
  }) as LoreRemovalIntent;
}
export function parseRemovalProgress(
  value: unknown,
  intent: LoreRemovalIntent,
  token?: string,
): LoreRemovalProgress {
  const v = readObject(freezeLoreEditValue(value), [
    'removalId',
    'startHash',
    'jobToken',
    'removed',
    'revision',
    'phase',
    'complete',
    'processed',
    'coordinatedUnits',
  ]);
  if (
    v.removalId !== intent.removalId ||
    v.startHash !== removalIntentHash(intent) ||
    v.removed !== true ||
    typeof v.phase !== 'string' ||
    ![
      'edits',
      'fields',
      'inspections',
      'heads',
      'generations',
      'segments',
      'bodies',
      'finish',
      'handed-off',
    ].includes(v.phase) ||
    typeof v.complete !== 'boolean' ||
    (v.complete && !['finish', 'handed-off'].includes(v.phase))
  )
    removalFail();
  const jobToken = readHash(v.jobToken),
    processed = readCount(v.processed);
  if ((token !== undefined && jobToken !== token) || processed < 1) removalFail();
  return Object.freeze({
    removalId: intent.removalId,
    startHash: removalIntentHash(intent),
    jobToken,
    removed: true,
    revision: readCount(v.revision),
    phase: v.phase,
    complete: v.complete,
    processed,
    coordinatedUnits: readCount(v.coordinatedUnits),
  });
}
export interface RemovalWireContext {
  readonly identity: LoreRemovalIdentity;
  readonly inspection: RemovalInspection | null;
  readonly intent: LoreRemovalIntent | null;
  readonly removal: LoreRemovalProgress | null;
}
const methods: Record<RemovalWireKind, string> = {
  'inspect-start': 'startBookLoreSourceInspection',
  'inspect-advance': 'advanceBookLoreSourceInspection',
  'inspect-cancel': 'cancelBookLoreSourceInspection',
  'remove-start': 'startBookLoreRemoval',
  'remove-advance': 'advanceBookLoreRemoval',
};
export function removalWire(kind: RemovalWireKind, c: RemovalWireContext): LoreRemovalWire {
  const i = c.identity,
    ids = removalIds(i);
  const operationId = (revision: number) =>
    'lore-removal-step-' +
    hash({
      domain: 'writer-book-lore-removal-step',
      identity: i,
      kind,
      revision,
    });
  let input: unknown;
  if (kind === 'inspect-start') {
    if (c.inspection || c.intent || c.removal) removalFail();
    input = removalInspectionIntent(i);
  } else if (kind === 'inspect-cancel')
    input = {
      inspectionId: ids.inspectionId,
      startHash: removalInspectionHash(i),
      operationId: operationId(0),
    };
  else if (kind === 'inspect-advance') {
    const p = c.inspection;
    if (!p?.jobToken || p.ready || p.phase === 'cancelled') removalFail();
    input = {
      inspectionId: ids.inspectionId,
      startHash: p.startHash,
      jobToken: p.jobToken,
      expectedRevision: p.revision,
      operationId: operationId(p.revision),
    };
  } else if (kind === 'remove-start') {
    if (!c.intent || c.removal) removalFail();
    input = c.intent;
  } else {
    const p = c.removal;
    if (!p || p.complete || p.phase === 'handed-off') removalFail();
    input = {
      removalId: p.removalId,
      startHash: p.startHash,
      jobToken: p.jobToken,
      expectedRevision: p.revision,
      operationId: operationId(p.revision),
    };
  }
  return freezeLoreEditValue({ method: methods[kind], input }) as LoreRemovalWire;
}
export function parseRemovalWire(value: unknown, c: RemovalWireContext): LoreRemovalWire {
  const v = readObject(freezeLoreEditValue(value), ['method', 'input']);
  const kind = (Object.keys(methods) as RemovalWireKind[]).find((k) => methods[k] === v.method);
  if (!kind) removalFail();
  const expected = removalWire(kind, c);
  if (!removalEqual(v, expected)) removalFail();
  return expected;
}
