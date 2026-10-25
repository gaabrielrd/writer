import { readObject as object, readId, readHash, readCount } from './bookLoreReadContracts';
import { freezeLoreEditValue as freeze } from './bookLoreWritePlan';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { loreControlJobId, loreInspectionControl } from './bookLoreControlContracts';
export const VISIBILITY_PAGE_SIZE = 50;
export const visibilityEqual = (a: unknown, b: unknown) => hash(a) === hash(b);
export function visibilityFail(): never {
  throw Error('Não foi possível conferir a seleção de visibilidade. Preserve a recuperação.');
}
export class VisibilityConflict extends Error {
  constructor() {
    super('A seleção mudou em outra aba. Confira novamente.');
  }
}
export interface VisibilityIdentity {
  uid: string;
  bookId: string;
  selectionId: string;
}
export interface VisibilityMember {
  index: number;
  loreId: string;
  sourceToken: string;
  writeId: string;
}
export interface VisibilityPage {
  schemaVersion: 1;
  identity: VisibilityIdentity;
  page: number;
  items: VisibilityMember[];
}
export interface VisibilityManifest {
  schemaVersion: 1;
  identity: VisibilityIdentity;
  action: 'visibility';
  value: boolean;
  count: number;
  pageHashes: string[];
  manifestHash: string;
}
export interface VisibilityHead {
  manifestHash: string;
  revision: number;
  cursor: number;
  cancelCursor: number;
  cancelRequested: boolean;
  applied: number;
  unchanged: number;
  conflicts: number;
  cancelled: number;
  stamp: string;
}
export interface VisibilityRoot {
  manifest: VisibilityManifest;
  head: VisibilityHead;
}
export interface VisibilityRef {
  id: string;
  startHash: string;
  seen: boolean;
  jobToken: string | null;
}
export type VisibilityResult = 'applied' | 'unchanged' | 'conflict' | 'cancelled';
export interface VisibilityOutcome {
  kind: VisibilityResult;
  jobToken: string | null;
  outcomeToken: string | null;
}
export interface VisibilityState {
  schemaVersion: 1;
  manifestHash: string;
  index: number;
  memberHash: string;
  revision: number;
  intentHash: string | null;
  unchanged: boolean | null;
  inspection: VisibilityRef;
  upload: VisibilityRef | null;
  edit: VisibilityRef | null;
  inspectionClosed: boolean;
  uploadClosed: boolean;
  editClosed: boolean;
  applyRequested: boolean;
  closing: Exclude<VisibilityResult, 'applied'> | null;
  outcome: VisibilityOutcome | null;
}
export type VisibilityInput = VisibilityIdentity & {
  value: boolean;
  members: { loreId: string; sourceToken: string }[];
};
export function visibilityIdentity(raw: unknown): VisibilityIdentity {
  const v = object(freeze(raw), ['uid', 'bookId', 'selectionId']);
  return Object.freeze({
    uid: readId(v.uid),
    bookId: readId(v.bookId),
    selectionId: readId(v.selectionId),
  });
}
const memberId = (
  identity: VisibilityIdentity,
  value: boolean,
  index: number,
  loreId: string,
  sourceToken: string,
) =>
  'lore-selection-visibility-' +
  hash({ domain: 'writer-lore-visibility-member', identity, value, index, loreId, sourceToken });
const pageHash = (page: VisibilityPage) => hash({ domain: 'writer-lore-visibility-page', page });
const manifestHash = (manifest: Omit<VisibilityManifest, 'manifestHash'>) =>
  hash({ domain: 'writer-lore-visibility-manifest', manifest });
export const visibilityScope = (root: VisibilityRoot, member: VisibilityMember) => ({
  uid: root.manifest.identity.uid,
  bookId: root.manifest.identity.bookId,
  writeId: member.writeId,
  loreId: member.loreId,
  sourceToken: member.sourceToken,
});
export function visibilityHead(input: Omit<VisibilityHead, 'stamp'>): VisibilityHead {
  const {
    manifestHash,
    revision,
    cursor,
    cancelCursor,
    cancelRequested,
    applied,
    unchanged,
    conflicts,
    cancelled,
  } = input;
  const value = {
    manifestHash,
    revision,
    cursor,
    cancelCursor,
    cancelRequested,
    applied,
    unchanged,
    conflicts,
    cancelled,
  };
  return Object.freeze({ ...value, stamp: hash({ domain: 'writer-lore-visibility-head', value }) });
}
export function createVisibilitySelection(raw: unknown) {
  const v = object(freeze(raw), ['uid', 'bookId', 'selectionId', 'value', 'members']),
    identity = visibilityIdentity({ uid: v.uid, bookId: v.bookId, selectionId: v.selectionId });
  if (typeof v.value !== 'boolean' || !Array.isArray(v.members) || !v.members.length)
    visibilityFail();
  const value = v.value,
    ids = new Set<string>();
  const members = (v.members as unknown[]).map((raw, index) => {
    const m = object(raw, ['loreId', 'sourceToken']),
      loreId = readId(m.loreId),
      sourceToken = readHash(m.sourceToken);
    if (ids.has(loreId)) visibilityFail();
    ids.add(loreId);
    return {
      index,
      loreId,
      sourceToken,
      writeId: memberId(identity, value, index, loreId, sourceToken),
    };
  });
  const pages: VisibilityPage[] = [];
  for (let index = 0; index < members.length; index += VISIBILITY_PAGE_SIZE)
    pages.push({
      schemaVersion: 1,
      identity,
      page: pages.length,
      items: members.slice(index, index + VISIBILITY_PAGE_SIZE),
    });
  const base = {
      schemaVersion: 1 as const,
      identity,
      action: 'visibility' as const,
      value,
      count: members.length,
      pageHashes: pages.map(pageHash),
    },
    root: VisibilityRoot = {
      manifest: { ...base, manifestHash: manifestHash(base) },
      head: visibilityHead({
        manifestHash: manifestHash(base),
        revision: 0,
        cursor: 0,
        cancelCursor: 0,
        cancelRequested: false,
        applied: 0,
        unchanged: 0,
        conflicts: 0,
        cancelled: 0,
      }),
    };
  return freeze({ root, pages }) as { root: VisibilityRoot; pages: VisibilityPage[] };
}
export function readVisibilityRoot(raw: unknown, expected: VisibilityIdentity): VisibilityRoot {
  const v = object(freeze(raw), ['manifest', 'head']),
    m = object(v.manifest, [
      'schemaVersion',
      'identity',
      'action',
      'value',
      'count',
      'pageHashes',
      'manifestHash',
    ]),
    identity = visibilityIdentity(m.identity),
    count = readCount(m.count);
  if (
    !visibilityEqual(identity, expected) ||
    m.schemaVersion !== 1 ||
    m.action !== 'visibility' ||
    typeof m.value !== 'boolean' ||
    !count ||
    !Array.isArray(m.pageHashes) ||
    m.pageHashes.length !== Math.ceil(count / VISIBILITY_PAGE_SIZE)
  )
    visibilityFail();
  const base = {
    schemaVersion: 1 as const,
    identity,
    action: 'visibility' as const,
    value: m.value,
    count,
    pageHashes: (m.pageHashes as unknown[]).map(readHash),
  };
  if (readHash(m.manifestHash) !== manifestHash(base)) visibilityFail();
  const h = object(v.head, [
    'manifestHash',
    'revision',
    'cursor',
    'cancelCursor',
    'cancelRequested',
    'applied',
    'unchanged',
    'conflicts',
    'cancelled',
    'stamp',
  ]);
  for (const key of [
    'revision',
    'cursor',
    'cancelCursor',
    'applied',
    'unchanged',
    'conflicts',
    'cancelled',
  ])
    readCount(h[key]);
  if (typeof h.cancelRequested !== 'boolean') visibilityFail();
  const head = h as unknown as VisibilityHead,
    total = head.applied + head.unchanged + head.conflicts + head.cancelled;
  if (
    head.manifestHash !== m.manifestHash ||
    !Number.isSafeInteger(total) ||
    total > count ||
    head.cursor > total ||
    head.cancelCursor > total ||
    (!head.cancelRequested && (head.cancelCursor || head.cancelled || head.cursor !== total)) ||
    head.stamp !== visibilityHead(head).stamp
  )
    visibilityFail();
  return v as unknown as VisibilityRoot;
}
export function readVisibilityPage(
  raw: unknown,
  root: VisibilityRoot,
  index: number,
): VisibilityPage {
  const v = object(freeze(raw), ['schemaVersion', 'identity', 'page', 'items']);
  if (
    v.schemaVersion !== 1 ||
    v.page !== index ||
    index < 0 ||
    !Number.isSafeInteger(index) ||
    !visibilityEqual(v.identity, root.manifest.identity) ||
    !Array.isArray(v.items) ||
    v.items.length !== Math.min(50, root.manifest.count - index * 50) ||
    !v.items.length
  )
    visibilityFail();
  (v.items as unknown[]).forEach((raw, offset) => {
    const m = object(raw, ['index', 'loreId', 'sourceToken', 'writeId']),
      i = index * 50 + offset,
      loreId = readId(m.loreId),
      sourceToken = readHash(m.sourceToken);
    if (
      m.index !== i ||
      m.writeId !== memberId(root.manifest.identity, root.manifest.value, i, loreId, sourceToken)
    )
      visibilityFail();
  });
  const page = v as unknown as VisibilityPage;
  if (pageHash(page) !== root.manifest.pageHashes[index]) visibilityFail();
  return page;
}
export function initialVisibilityState(
  root: VisibilityRoot,
  member: VisibilityMember,
): VisibilityState {
  return {
    schemaVersion: 1,
    manifestHash: root.manifest.manifestHash,
    index: member.index,
    memberHash: hash(member),
    revision: 0,
    intentHash: null,
    unchanged: null,
    inspection: {
      ...loreInspectionControl(visibilityScope(root, member)),
      seen: false,
      jobToken: null,
    },
    upload: null,
    edit: null,
    inspectionClosed: false,
    uploadClosed: false,
    editClosed: false,
    applyRequested: false,
    closing: null,
    outcome: null,
  };
}
function ref(raw: unknown, expectedId: string, expectedHash?: string): VisibilityRef {
  const v = object(raw, ['id', 'startHash', 'seen', 'jobToken']);
  if (
    v.id !== expectedId ||
    typeof v.seen !== 'boolean' ||
    (!v.seen && v.jobToken !== null) ||
    (expectedHash !== undefined && v.startHash !== expectedHash)
  )
    visibilityFail();
  readHash(v.startHash);
  if (v.jobToken !== null) readHash(v.jobToken);
  return v as unknown as VisibilityRef;
}
export function readVisibilityState(
  raw: unknown,
  root: VisibilityRoot,
  member: VisibilityMember,
): VisibilityState {
  const v = object(freeze(raw), [
      'schemaVersion',
      'manifestHash',
      'index',
      'memberHash',
      'revision',
      'intentHash',
      'unchanged',
      'inspection',
      'upload',
      'edit',
      'inspectionClosed',
      'uploadClosed',
      'editClosed',
      'applyRequested',
      'closing',
      'outcome',
    ]),
    scope = visibilityScope(root, member),
    expected = loreInspectionControl(scope);
  if (
    v.schemaVersion !== 1 ||
    v.manifestHash !== root.manifest.manifestHash ||
    v.index !== member.index ||
    v.memberHash !== hash(member)
  )
    visibilityFail();
  readCount(v.revision);
  if (v.intentHash !== null) readHash(v.intentHash);
  if (
    (v.intentHash === null) !== (v.unchanged === null) ||
    (v.unchanged !== null && typeof v.unchanged !== 'boolean')
  )
    visibilityFail();
  ref(v.inspection, expected.id, expected.startHash);
  for (const key of ['upload', 'edit'])
    if (v[key] !== null)
      ref(v[key], loreControlJobId(scope, key === 'edit' ? 'lore-edit' : 'lore-field'));
  for (const key of ['inspectionClosed', 'uploadClosed', 'editClosed', 'applyRequested'])
    if (typeof v[key] !== 'boolean') visibilityFail();
  const state = v as unknown as VisibilityState;
  for (const [kind, closed] of [
    ['inspection', 'inspectionClosed'],
    ['upload', 'uploadClosed'],
    ['edit', 'editClosed'],
  ] as const) {
    const control = state[kind];
    if (state[closed] && control && !control.seen) visibilityFail();
  }
  if (
    (state.upload || state.edit || state.applyRequested) &&
    (state.intentHash === null || state.unchanged !== false)
  )
    visibilityFail();
  if (state.applyRequested && !state.edit) visibilityFail();
  if (state.closing !== null && !['unchanged', 'conflict', 'cancelled'].includes(state.closing))
    visibilityFail();
  if (state.closing === 'unchanged' && !state.unchanged) visibilityFail();
  if (state.outcome !== null) {
    const o = object(state.outcome, ['kind', 'jobToken', 'outcomeToken']);
    if (o.kind === 'applied') {
      readHash(o.jobToken);
      readHash(o.outcomeToken);
      if (!state.applyRequested || !state.edit?.seen || state.edit.jobToken !== o.jobToken)
        visibilityFail();
    } else if (
      !['unchanged', 'conflict', 'cancelled'].includes(String(o.kind)) ||
      o.kind !== state.closing ||
      o.jobToken !== null ||
      o.outcomeToken !== null ||
      !state.inspectionClosed ||
      (state.upload && !state.uploadClosed) ||
      (state.edit && !state.editClosed)
    )
      visibilityFail();
  }
  return state;
}
export function visibilityTransition(old: VisibilityState, next: VisibilityState) {
  if (next.revision !== old.revision + 1) visibilityFail();
  for (const k of ['inspection', 'upload', 'edit'] as const) {
    const a = old[k],
      b = next[k];
    if (
      a &&
      (!b ||
        a.id !== b.id ||
        a.startHash !== b.startHash ||
        (a.seen && (!b.seen || a.jobToken !== b.jobToken)))
    )
      visibilityFail();
  }
  if (
    old.intentHash !== null &&
    (old.intentHash !== next.intentHash || old.unchanged !== next.unchanged)
  )
    visibilityFail();
  for (const k of ['inspectionClosed', 'uploadClosed', 'editClosed', 'applyRequested'] as const)
    if (old[k] && !next[k]) visibilityFail();
  if (
    (old.closing && old.closing !== next.closing) ||
    (old.outcome && !visibilityEqual(old.outcome, next.outcome))
  )
    visibilityFail();
}
