import {
  normalizeLiteraryImpactNode,
  literaryImpactNodeKey,
} from '../../../../functions/src/literaryImpactProtocol.mjs';
import type {
  ImpactStart,
  ImpactAdvance,
  ImpactResolve,
  ImpactCancel,
  ImpactFrame,
  ImpactMethod,
} from '../model/impact';
import { impactClosed } from '../model/impact';
/** No rationale, evidence, labels, prose, credentials or observed result is stored. */
export type ImpactPending =
  | { kind: 'start'; operationId: string; requestHash: string; closeRequested: false }
  | { kind: 'advance'; wire: ImpactAdvance; closeRequested: boolean }
  | {
      kind: 'resolve';
      wire: Pick<
        ImpactResolve,
        | 'target'
        | 'jobId'
        | 'operationId'
        | 'expectedOriginToken'
        | 'expectedRevision'
        | 'requestHash'
        | 'checkId'
        | 'observationToken'
        | 'expectedDecisionRevision'
      >;
      closeRequested: boolean;
    };
export interface ImpactJournal {
  version: 1;
  actorId: string;
  bookId: string;
  sessionId: string;
  jobId: string;
  bookToken: string;
  originToken: string | null;
  start: ImpactStart | null;
  pending: ImpactPending | null;
  cancelRequested: boolean;
  cancel: ImpactCancel | null;
  revision: number;
}
const key = (actorId: string, bookId: string) =>
  'writer:literary-impact:' + [actorId, bookId].map(encodeURIComponent).join(':');
const fail = (): never => {
  throw new Error('O acompanhamento do mapa está inválido. Preserve os dados para recuperação.');
};
const id = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  new TextEncoder().encode(value).length <= 1500 &&
  !value.includes('/') &&
  value !== '.' &&
  value !== '..' &&
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const token = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const revision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function closed(value: unknown, fields: string[]) {
  const row = object(value);
  if (Object.keys(row).sort().join(',') !== [...fields].sort().join(',')) fail();
  return row;
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => same(item, b[i]))
    );
  const left = object(a),
    right = object(b),
    keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((field) => Object.hasOwn(right, field) && same(left[field], right[field]))
  );
}
function target(value: unknown, bookId: string) {
  const row = closed(value, ['kind', 'id']);
  if (row.kind !== 'book' || row.id !== bookId) fail();
}
function start(value: unknown, bookId: string, jobId: string, bookToken: string) {
  const row = closed(value, [
    'target',
    'jobId',
    'bookIds',
    'sources',
    'prepareIndices',
    'expectedBookToken',
    'expectedScopeToken',
    'requestHash',
  ]);
  target(row.target, bookId);
  if (
    row.jobId !== jobId ||
    row.expectedBookToken !== bookToken ||
    !token(row.expectedScopeToken) ||
    !token(row.requestHash) ||
    typeof row.prepareIndices !== 'boolean'
  )
    fail();
  if (
    !Array.isArray(row.bookIds) ||
    !row.bookIds.length ||
    row.bookIds.length > 64 ||
    !row.bookIds.every(id) ||
    new Set(row.bookIds).size !== row.bookIds.length ||
    !row.bookIds.includes(bookId)
  )
    fail();
  if (!Array.isArray(row.sources) || !row.sources.length || row.sources.length > 16) return fail();
  const keys = row.sources.map((source) =>
    literaryImpactNodeKey(normalizeLiteraryImpactNode(source)),
  );
  if (new Set(keys).size !== keys.length) fail();
}
function wire(value: unknown, journal: ImpactJournal, resolving: boolean) {
  const fields = [
    'target',
    'jobId',
    'operationId',
    'expectedOriginToken',
    'expectedRevision',
    'requestHash',
  ];
  if (resolving) fields.push('checkId', 'observationToken', 'expectedDecisionRevision');
  const row = closed(value, fields);
  target(row.target, journal.bookId);
  if (
    row.jobId !== journal.jobId ||
    !id(row.operationId) ||
    row.operationId === journal.jobId ||
    row.expectedOriginToken !== journal.originToken ||
    !token(row.expectedOriginToken) ||
    !revision(row.expectedRevision) ||
    !token(row.requestHash)
  )
    fail();
  if (
    resolving &&
    (!id(row.checkId) || !token(row.observationToken) || !revision(row.expectedDecisionRevision))
  )
    fail();
}
export function parseImpactJournal(value: unknown, actorId: string, bookId: string): ImpactJournal {
  const row = closed(value, [
    'version',
    'actorId',
    'bookId',
    'sessionId',
    'jobId',
    'bookToken',
    'originToken',
    'start',
    'pending',
    'cancelRequested',
    'cancel',
    'revision',
  ]);
  if (
    row.version !== 1 ||
    row.actorId !== actorId ||
    row.bookId !== bookId ||
    ![actorId, bookId, row.sessionId, row.jobId].every(id) ||
    !token(row.bookToken) ||
    (row.originToken !== null && !token(row.originToken)) ||
    !revision(row.revision) ||
    typeof row.cancelRequested !== 'boolean'
  )
    fail();
  const result = row as unknown as ImpactJournal;
  if (row.start !== null) start(row.start, bookId, result.jobId, result.bookToken);
  else if (row.originToken === null) fail();
  if (row.pending !== null) {
    const pending = object(row.pending);
    if (pending.kind === 'start') {
      closed(pending, ['kind', 'operationId', 'requestHash', 'closeRequested']);
      if (
        !result.start ||
        pending.operationId !== result.jobId ||
        pending.requestHash !== result.start.requestHash ||
        pending.closeRequested !== false
      )
        fail();
    } else {
      closed(pending, ['kind', 'wire', 'closeRequested']);
      if (
        !['advance', 'resolve'].includes(String(pending.kind)) ||
        typeof pending.closeRequested !== 'boolean'
      )
        fail();
      wire(pending.wire, result, pending.kind === 'resolve');
    }
  }
  if (row.cancel !== null) {
    const cancel = object(row.cancel);
    closed(cancel, [
      'target',
      'jobId',
      'operationId',
      'requestHash',
      ...(Object.hasOwn(cancel, 'expectedOriginToken') ? ['expectedOriginToken'] : []),
      ...(Object.hasOwn(cancel, 'start') ? ['start'] : []),
    ]);
    target(cancel.target, bookId);
    if (
      !row.cancelRequested ||
      cancel.jobId !== row.jobId ||
      !id(cancel.operationId) ||
      cancel.operationId === row.jobId ||
      !token(cancel.requestHash) ||
      (cancel.expectedOriginToken !== undefined &&
        (!token(cancel.expectedOriginToken) || cancel.expectedOriginToken !== row.originToken)) ||
      (cancel.start === undefined && cancel.expectedOriginToken === undefined)
    )
      fail();
    if (cancel.start !== undefined && (!same(cancel.start, row.start) || row.start === null))
      fail();
    const pending = result.pending;
    if (
      pending &&
      cancel.operationId ===
        (pending.kind === 'start' ? pending.operationId : pending.wire.operationId)
    )
      fail();
  } else if (row.cancelRequested) fail();
  return result;
}
export function readImpactJournal(actorId: string, bookId: string): ImpactJournal | null {
  const raw = localStorage.getItem(key(actorId, bookId));
  if (raw === null) return null;
  try {
    if (raw.length > 900000) fail();
    return parseImpactJournal(JSON.parse(raw), actorId, bookId);
  } catch {
    return fail();
  }
}
async function locked<T>(actorId: string, bookId: string, action: () => T): Promise<T> {
  if (!navigator.locks?.request)
    throw new Error('Este navegador precisa oferecer Web Locks para acompanhar o mapa.');
  return navigator.locks.request(key(actorId, bookId), action);
}
function write(value: ImpactJournal) {
  parseImpactJournal(value, value.actorId, value.bookId);
  const raw = JSON.stringify(value);
  if (raw.length > 900000)
    throw new Error('O acompanhamento excedeu o limite local. Reduza o escopo antes de iniciar.');
  localStorage.setItem(key(value.actorId, value.bookId), raw);
  return structuredClone(value);
}
function compare(expected: ImpactJournal) {
  const actual = readImpactJournal(expected.actorId, expected.bookId);
  if (!same(actual, expected))
    throw new Error('O acompanhamento mudou em outra janela. Consulte antes de continuar.');
  return actual!;
}
async function update(expected: ImpactJournal, change: (actual: ImpactJournal) => ImpactJournal) {
  return locked(expected.actorId, expected.bookId, () => {
    const actual = compare(expected),
      next = change(actual);
    return write({ ...next, revision: actual.revision + 1 });
  });
}
export async function reserveImpactJournal(
  actorId: string,
  input: ImpactStart,
): Promise<ImpactJournal> {
  return locked(actorId, input.target.id, () => {
    if (readImpactJournal(actorId, input.target.id))
      throw new Error('Consulte ou encerre o mapa acompanhado antes de iniciar outro.');
    return write({
      version: 1,
      actorId,
      bookId: input.target.id,
      sessionId: crypto.randomUUID(),
      jobId: input.jobId,
      bookToken: input.expectedBookToken,
      originToken: null,
      start: structuredClone(input),
      pending: {
        kind: 'start',
        operationId: input.jobId,
        requestHash: input.requestHash,
        closeRequested: false,
      },
      cancelRequested: false,
      cancel: null,
      revision: 0,
    });
  });
}
/** Adoption is explicit, only after a fresh authorized get, and never sends a producer. */
export async function adoptImpactJournal(actorId: string, bookId: string, frame: ImpactFrame) {
  return locked(actorId, bookId, () => {
    if (readImpactJournal(actorId, bookId)) throw new Error('Já existe um mapa acompanhado.');
    return write({
      version: 1,
      actorId,
      bookId,
      sessionId: crypto.randomUUID(),
      jobId: frame.jobId,
      bookToken: frame.bookToken,
      originToken: frame.originToken,
      start: null,
      pending: null,
      cancelRequested: false,
      cancel: null,
      revision: 0,
    });
  });
}
export async function stageImpactOperation(
  expected: ImpactJournal,
  pending: Exclude<ImpactPending, { kind: 'start' }>,
) {
  return update(expected, (actual) => {
    if (actual.pending || actual.cancelRequested || !actual.originToken || pending.closeRequested)
      throw new Error('Reconcilie o pedido acompanhado antes de enviar outro.');
    return { ...actual, pending: structuredClone(pending) };
  });
}
/** The caller confirms the original receipt and obtains a fresh frame. A receipt is not current state. */
export async function acknowledgeImpactOperation(
  expected: ImpactJournal,
  frame: ImpactFrame,
  isCurrent: () => boolean = () => true,
) {
  return update(expected, (actual) => {
    if (!isCurrent()) throw new Error('A sessão do mapa mudou.');
    if (
      !actual.pending ||
      actual.cancelRequested ||
      actual.pending.closeRequested ||
      frame.jobId !== actual.jobId ||
      frame.bookToken !== actual.bookToken ||
      !token(frame.originToken) ||
      (actual.originToken !== null && actual.originToken !== frame.originToken)
    )
      throw new Error('A confirmação não corresponde ao pedido acompanhado.');
    return { ...actual, originToken: frame.originToken, pending: null };
  });
}
export async function requestImpactOperationClose(expected: ImpactJournal) {
  return update(expected, (actual) => {
    if (!actual.pending || actual.pending.kind === 'start' || actual.cancelRequested)
      throw new Error('O início pendente deve ser encerrado com o mapa inteiro.');
    return { ...actual, pending: { ...actual.pending, closeRequested: true } };
  });
}
export async function confirmImpactOperationClose(
  expected: ImpactJournal,
  originToken: string,
  isCurrent: () => boolean = () => true,
) {
  return update(expected, (actual) => {
    if (!isCurrent()) throw new Error('A sessão do mapa mudou.');
    if (
      !actual.pending?.closeRequested ||
      actual.cancelRequested ||
      originToken !== actual.originToken
    )
      throw new Error('Confira o encerramento do pedido original.');
    return { ...actual, pending: null };
  });
}
export async function requestImpactCancellation(expected: ImpactJournal, cancel: ImpactCancel) {
  return update(expected, (actual) => {
    if (actual.cancelRequested && !same(actual.cancel, cancel))
      throw new Error('Preserve o encerramento original.');
    return { ...actual, cancelRequested: true, cancel: structuredClone(cancel) };
  });
}
/** Only a confirmed server cancellation may close local debts without their individual ACKs. */
export async function confirmImpactCancellation(
  expected: ImpactJournal,
  proof: { jobId: string; phase: string; originToken: string | null },
  isCurrent: () => boolean = () => true,
) {
  return locked(expected.actorId, expected.bookId, () => {
    if (!isCurrent()) throw new Error('A sessão do mapa mudou.');
    const actual = compare(expected);
    if (
      !actual.cancelRequested ||
      !actual.cancel ||
      proof.jobId !== actual.jobId ||
      proof.phase !== 'canceled' ||
      (actual.originToken !== null && proof.originToken !== actual.originToken)
    )
      throw new Error('Confira o encerramento original no servidor.');
    localStorage.removeItem(key(actual.actorId, actual.bookId));
  });
}
export async function releaseImpactJournal(
  expected: ImpactJournal,
  frame: ImpactFrame,
  isCurrent: () => boolean = () => true,
) {
  return locked(expected.actorId, expected.bookId, () => {
    if (!isCurrent()) throw new Error('A sessão do mapa mudou.');
    const actual = compare(expected);
    if (
      actual.pending ||
      actual.cancelRequested ||
      !impactClosed(frame.phase) ||
      frame.jobId !== actual.jobId ||
      frame.originToken !== actual.originToken ||
      frame.bookToken !== actual.bookToken
    )
      throw new Error(
        'Confirme um mapa encerrado e todos os pedidos antes de liberar o acompanhamento.',
      );
    localStorage.removeItem(key(actual.actorId, actual.bookId));
  });
}
export function impactPendingIdentity(pending: ImpactPending): {
  operationId: string;
  requestHash: string;
  method: 'startLiteraryImpact' | ImpactMethod;
} {
  return pending.kind === 'start'
    ? {
        operationId: pending.operationId,
        requestHash: pending.requestHash,
        method: 'startLiteraryImpact',
      }
    : {
        operationId: pending.wire.operationId,
        requestHash: pending.wire.requestHash,
        method: pending.kind === 'advance' ? 'advanceLiteraryImpact' : 'resolveLiteraryImpact',
      };
}
/** Deliberately projects the private resolution to correlation/CAS metadata. */
export function impactResolutionPending(
  input: ImpactResolve,
): Extract<ImpactPending, { kind: 'resolve' }> {
  const {
    target,
    jobId,
    operationId,
    expectedOriginToken,
    expectedRevision,
    requestHash,
    checkId,
    observationToken,
    expectedDecisionRevision,
  } = input;
  return {
    kind: 'resolve',
    closeRequested: false,
    wire: {
      target,
      jobId,
      operationId,
      expectedOriginToken,
      expectedRevision,
      requestHash,
      checkId,
      observationToken,
      expectedDecisionRevision,
    },
  };
}
