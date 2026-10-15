import { GenerationError, validateId } from './generation.mjs';
import { digest } from './sceneContracts.mjs';

export { digest };
export function workFail(code, message, reason) {
  const error = new GenerationError(code, message);
  if (reason) error.details = { reason };
  throw error;
}
export const workConflict = () =>
  workFail(
    'failed-precondition',
    'O recurso mudou. Atualize e compare antes de tentar novamente.',
    'revision-conflict',
  );
export function workClosed(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    workFail('invalid-argument', 'Dados de trabalho inválidos.');
  return value;
}
export function workId(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('/') ||
    ['.', '..'].includes(value) ||
    Buffer.byteLength(value) > 1500
  )
    workFail('invalid-argument', 'Identificador inválido.');
  return value;
}
export function workTarget(value) {
  workClosed(value, ['kind', 'id']);
  if (!['book', 'adventure', 'campaign'].includes(value.kind))
    workFail('invalid-argument', 'Projeto inválido.');
  return { kind: value.kind, id: workId(value.id) };
}
export const workPath = (target) =>
  ({ book: 'books', adventure: 'adventures', campaign: 'campaigns' })[target.kind] +
  '/' +
  target.id;
export function workRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) workFail('invalid-argument', 'Revisão inválida.');
  return value;
}
export function workLimit(value = 25) {
  if (!Number.isInteger(value) || value < 1 || value > 50)
    workFail('invalid-argument', 'A página deve ter entre 1 e 50 itens.');
  return value;
}
export function workTitle(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 300)
    workFail('invalid-argument', 'Informe um título de até 300 caracteres.');
  return value.trim();
}
export function workDate(now, previous = 0) {
  const value = Math.max(now(), previous + 1);
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(new Date(value).getTime()))
    workFail('failed-precondition', 'Data inválida.');
  return value;
}
export function workScope(db, uid, data, keys) {
  if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
  workClosed(data, ['target', ...keys]);
  const target = workTarget(data.target);
  return { uid, target, path: workPath(target), ref: db.doc(workPath(target)) };
}
export async function workProject(tx, context) {
  const snapshot = await tx.get(context.ref),
    root = snapshot.data();
  if (
    !root ||
    root[context.target.kind === 'book' ? 'authorId' : 'ownerId'] !== context.uid ||
    root.deleting
  )
    workFail('not-found', 'Projeto indisponível.');
  return root;
}
export function initialWorkControl(target, root) {
  return {
    schemaVersion: 1,
    revision: 0,
    editorialState:
      target.kind === 'campaign'
        ? null
        : (root.editorialState ??
          (target.kind === 'adventure' && root.status === 'ready' ? 'ready' : 'draft')),
    wordGoal: null,
    checklistRevision: 0,
    checklistTotal: 0,
    checklistCompleted: 0,
    countVersion: 1,
    countReady: target.kind === 'campaign',
    wordCount: 0,
    countRevision: 0,
    processed: 0,
    phase: target.kind === 'book' ? 'chapters' : 'scenes',
    cursor: null,
  };
}
export async function readWorkControl(tx, db, context, root) {
  const ref = db.doc(context.path + '/workProgress/current'),
    snapshot = await tx.get(ref);
  return {
    ref,
    exists: snapshot.exists,
    value: snapshot.data() ?? initialWorkControl(context.target, root),
  };
}
export function workOperation(db, uid, method, data, payload) {
  const id = validateId(data.operationId);
  return {
    id,
    ref: db.doc('users/' + uid + '/workOperations/' + id),
    fingerprint: digest({ method, payload }),
  };
}
export async function readWorkReceipt(tx, op) {
  const value = (await tx.get(op.ref)).data();
  if (value && value.fingerprint !== op.fingerprint)
    workFail('invalid-argument', 'O identificador já foi usado com outro pedido.');
  return value;
}
export function writeWorkReceipt(tx, op, value) {
  tx.set(op.ref, { fingerprint: op.fingerprint, ...value });
}
export function workCursor(value, scope, revision) {
  if (value == null) return null;
  let parsed;
  if (typeof value !== 'string' || value.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(value))
    workFail('invalid-argument', 'Página inválida.');
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    workFail('invalid-argument', 'Página inválida.');
  }
  workClosed(parsed, ['version', 'scope', 'revision', 'id', 'date']);
  if (parsed.version !== 1 || digest(parsed.scope) !== digest(scope))
    workFail('invalid-argument', 'Página pertence a outro escopo ou filtro.');
  if (workRevision(parsed.revision) !== revision) workConflict();
  workId(parsed.id);
  if (
    'date' in parsed &&
    (!Number.isFinite(parsed.date) || parsed.date < 0 || parsed.date > 8640000000000000)
  )
    workFail('invalid-argument', 'Data inválida.');
  return parsed;
}
export const encodeWorkCursor = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
export function workItem(value) {
  return {
    id: value.id,
    title: value.title,
    completed: value.completed,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export async function readWorkMetadata(tx, ref, fields) {
  if (typeof tx.getAll === 'function') return (await tx.getAll(ref, { fieldMask: fields }))[0];
  return tx.get(ref);
}
