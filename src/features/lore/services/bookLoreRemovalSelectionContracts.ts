import { readObject, readId, readHash, readCount } from './bookLoreReadContracts';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import type { LoreRemovalIdentity } from './bookLoreRemovalProtocol';

export const REMOVAL_SELECTION_PAGE_SIZE = 50;
export function selectionFail(): never {
  throw Error('Não foi possível conferir a seleção de lore. Preserve a recuperação.');
}
export class LoreSelectionConflict extends Error {
  constructor() {
    super('A seleção mudou em outra aba. Confira a recuperação.');
  }
}
export interface RemovalSelectionIdentity {
  readonly uid: string;
  readonly bookId: string;
  readonly selectionId: string;
}
export interface RemovalSelectionMember {
  readonly index: number;
  readonly loreId: string;
  readonly sourceToken: string;
  readonly writeId: string;
}
export interface RemovalSelectionManifest {
  readonly schemaVersion: 1;
  readonly identity: RemovalSelectionIdentity;
  readonly action: 'remove';
  readonly count: number;
  readonly pageHashes: readonly string[];
  readonly manifestHash: string;
}
export interface RemovalSelectionPage {
  readonly schemaVersion: 1;
  readonly identity: RemovalSelectionIdentity;
  readonly page: number;
  readonly items: readonly RemovalSelectionMember[];
}
export interface RemovalSelectionHead {
  readonly manifestHash: string;
  readonly revision: number;
  readonly cursor: number;
  readonly removed: number;
  readonly conflicts: number;
  readonly cancelled: number;
  readonly cancelRequested: boolean;
  readonly cancelCursor: number;
  readonly faultIndex: number | null;
  readonly stamp: string;
}
export interface RemovalSelectionRoot {
  readonly manifest: RemovalSelectionManifest;
  readonly head: RemovalSelectionHead;
}
export interface RemovalSelectionOutcome {
  readonly schemaVersion: 1;
  readonly manifestHash: string;
  readonly index: number;
  readonly memberHash: string;
  readonly kind: 'removed' | 'conflict' | 'cancelled';
  readonly jobToken: string | null;
}
export type RemovalSelectionInput = RemovalSelectionIdentity & {
  readonly members: readonly { readonly loreId: string; readonly sourceToken: string }[];
};
export function selectionIdentity(raw: unknown): RemovalSelectionIdentity {
  const v = readObject(freezeLoreEditValue(raw), ['uid', 'bookId', 'selectionId']);
  return Object.freeze({
    uid: readId(v.uid),
    bookId: readId(v.bookId),
    selectionId: readId(v.selectionId),
  });
}
const writeId = (
  identity: RemovalSelectionIdentity,
  index: number,
  loreId: string,
  sourceToken: string,
) =>
  'lore-selection-remove-' +
  hash({ domain: 'writer-lore-removal-selection-member', identity, index, loreId, sourceToken });
const pageHash = (page: RemovalSelectionPage) =>
  hash({ domain: 'writer-lore-removal-selection-page', page });
const manifestHash = (value: Omit<RemovalSelectionManifest, 'manifestHash'>) =>
  hash({ domain: 'writer-lore-removal-selection', value });
export function selectionHead(input: Omit<RemovalSelectionHead, 'stamp'>): RemovalSelectionHead {
  const value = {
    manifestHash: input.manifestHash,
    revision: input.revision,
    cursor: input.cursor,
    removed: input.removed,
    conflicts: input.conflicts,
    cancelled: input.cancelled,
    cancelRequested: input.cancelRequested,
    cancelCursor: input.cancelCursor,
    faultIndex: input.faultIndex,
  };
  return Object.freeze({
    ...value,
    stamp: hash({ domain: 'writer-lore-removal-selection-state', value }),
  });
}
export function createRemovalSelection(raw: unknown) {
  const v = readObject(freezeLoreEditValue(raw), ['uid', 'bookId', 'selectionId', 'members']),
    identity = selectionIdentity({ uid: v.uid, bookId: v.bookId, selectionId: v.selectionId });
  if (!Array.isArray(v.members) || !v.members.length) selectionFail();
  const ids = new Set<string>();
  const members = (v.members as unknown[]).map((value, index) => {
    const m = readObject(value, ['loreId', 'sourceToken']),
      loreId = readId(m.loreId),
      sourceToken = readHash(m.sourceToken);
    if (ids.has(loreId)) selectionFail();
    ids.add(loreId);
    return { index, loreId, sourceToken, writeId: writeId(identity, index, loreId, sourceToken) };
  });
  const pages: RemovalSelectionPage[] = [];
  for (let index = 0; index < members.length; index += REMOVAL_SELECTION_PAGE_SIZE)
    pages.push({
      schemaVersion: 1,
      identity,
      page: pages.length,
      items: members.slice(index, index + REMOVAL_SELECTION_PAGE_SIZE),
    });
  const base = {
      schemaVersion: 1 as const,
      identity,
      action: 'remove' as const,
      count: members.length,
      pageHashes: pages.map(pageHash),
    },
    manifest = { ...base, manifestHash: manifestHash(base) },
    head = selectionHead({
      manifestHash: manifest.manifestHash,
      revision: 0,
      cursor: 0,
      removed: 0,
      conflicts: 0,
      cancelled: 0,
      cancelRequested: false,
      cancelCursor: 0,
      faultIndex: null,
    });
  return freezeLoreEditValue({ root: { manifest, head }, pages }) as {
    root: RemovalSelectionRoot;
    pages: readonly RemovalSelectionPage[];
  };
}
export function readSelectionRoot(
  raw: unknown,
  expected: RemovalSelectionIdentity,
): RemovalSelectionRoot {
  const v = readObject(freezeLoreEditValue(raw), ['manifest', 'head']),
    m = readObject(v.manifest, [
      'schemaVersion',
      'identity',
      'action',
      'count',
      'pageHashes',
      'manifestHash',
    ]),
    identity = selectionIdentity(m.identity);
  if (hash(identity) !== hash(expected) || m.schemaVersion !== 1 || m.action !== 'remove')
    selectionFail();
  const count = readCount(m.count);
  if (
    !count ||
    !Array.isArray(m.pageHashes) ||
    m.pageHashes.length !== Math.ceil(count / REMOVAL_SELECTION_PAGE_SIZE)
  )
    selectionFail();
  const base = {
    schemaVersion: 1 as const,
    identity,
    action: 'remove' as const,
    count,
    pageHashes: (m.pageHashes as unknown[]).map(readHash),
  };
  if (readHash(m.manifestHash) !== manifestHash(base)) selectionFail();
  const h = readObject(v.head, [
    'manifestHash',
    'revision',
    'cursor',
    'removed',
    'conflicts',
    'cancelled',
    'cancelRequested',
    'cancelCursor',
    'faultIndex',
    'stamp',
  ]);
  const state = {
      manifestHash: readHash(h.manifestHash),
      revision: readCount(h.revision),
      cursor: readCount(h.cursor),
      removed: readCount(h.removed),
      conflicts: readCount(h.conflicts),
      cancelled: readCount(h.cancelled),
      cancelRequested: h.cancelRequested as boolean,
      cancelCursor: readCount(h.cancelCursor),
      faultIndex: h.faultIndex === null ? null : readCount(h.faultIndex),
    },
    total = state.removed + state.conflicts + state.cancelled;
  if (
    typeof state.cancelRequested !== 'boolean' ||
    state.manifestHash !== m.manifestHash ||
    state.cursor > count ||
    state.cancelCursor > count ||
    total > count ||
    total < state.cursor ||
    total > state.cursor + state.cancelCursor ||
    (!state.cancelRequested && (state.cancelCursor || state.cancelled || total !== state.cursor)) ||
    (state.faultIndex !== null && (state.faultIndex !== state.cursor || state.cursor === count)) ||
    readHash(h.stamp) !== selectionHead(state).stamp
  )
    selectionFail();
  return freezeLoreEditValue({
    manifest: { ...base, manifestHash: m.manifestHash },
    head: { ...state, stamp: h.stamp },
  }) as RemovalSelectionRoot;
}
export function readSelectionPage(
  raw: unknown,
  root: RemovalSelectionRoot,
  index: number,
): RemovalSelectionPage {
  const v = readObject(freezeLoreEditValue(raw), ['schemaVersion', 'identity', 'page', 'items']),
    identity = selectionIdentity(v.identity);
  if (
    v.schemaVersion !== 1 ||
    v.page !== index ||
    hash(identity) !== hash(root.manifest.identity) ||
    !Array.isArray(v.items) ||
    v.items.length !==
      Math.min(
        REMOVAL_SELECTION_PAGE_SIZE,
        root.manifest.count - index * REMOVAL_SELECTION_PAGE_SIZE,
      ) ||
    index < 0 ||
    !Number.isSafeInteger(index) ||
    index >= root.manifest.pageHashes.length
  )
    selectionFail();
  const ids = new Set<string>(),
    items = (v.items as unknown[]).map((raw, offset) => {
      const m = readObject(raw, ['index', 'loreId', 'sourceToken', 'writeId']),
        position = index * REMOVAL_SELECTION_PAGE_SIZE + offset,
        loreId = readId(m.loreId),
        sourceToken = readHash(m.sourceToken);
      if (
        m.index !== position ||
        ids.has(loreId) ||
        m.writeId !== writeId(identity, position, loreId, sourceToken)
      )
        selectionFail();
      ids.add(loreId);
      return { index: position, loreId, sourceToken, writeId: m.writeId };
    });
  const page = { schemaVersion: 1 as const, identity, page: index, items };
  if (pageHash(page) !== root.manifest.pageHashes[index]) selectionFail();
  return freezeLoreEditValue(page) as RemovalSelectionPage;
}
export function memberIdentity(
  root: RemovalSelectionRoot,
  m: RemovalSelectionMember,
): LoreRemovalIdentity {
  return Object.freeze({
    uid: root.manifest.identity.uid,
    bookId: root.manifest.identity.bookId,
    writeId: m.writeId,
    loreId: m.loreId,
    sourceToken: m.sourceToken,
  });
}
export function makeSelectionOutcome(
  root: RemovalSelectionRoot,
  m: RemovalSelectionMember,
  kind: RemovalSelectionOutcome['kind'],
  jobToken: string | null,
): RemovalSelectionOutcome {
  if (
    !['removed', 'conflict', 'cancelled'].includes(kind) ||
    (kind === 'removed' ? !jobToken : jobToken !== null)
  )
    selectionFail();
  if (jobToken !== null) readHash(jobToken);
  return Object.freeze({
    schemaVersion: 1,
    manifestHash: root.manifest.manifestHash,
    index: m.index,
    memberHash: hash(memberIdentity(root, m)),
    kind,
    jobToken,
  });
}
export function readSelectionOutcome(
  raw: unknown,
  root: RemovalSelectionRoot,
  member: RemovalSelectionMember,
) {
  const v = readObject(freezeLoreEditValue(raw), [
    'schemaVersion',
    'manifestHash',
    'index',
    'memberHash',
    'kind',
    'jobToken',
  ]);
  const expected = makeSelectionOutcome(
    root,
    member,
    v.kind as RemovalSelectionOutcome['kind'],
    v.jobToken as string | null,
  );
  if (hash(v) !== hash(expected)) selectionFail();
  return expected;
}
export const selectionEqual = (a: unknown, b: unknown) => hash(a) === hash(b);
