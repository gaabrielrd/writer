import { digest, workFail, workProject } from './workProgressContracts.mjs';

// Absence is the legacy baseline, not a statement that no versions exist.
export function readWorkHistoryRevision(root) {
  const value = Object.hasOwn(root, 'historyRevision') ? root.historyRevision : 0;
  if (!Number.isSafeInteger(value) || value < 0)
    workFail('failed-precondition', 'A revisão do histórico está inconsistente.');
  return value;
}
export function nextWorkHistoryRevision(root) {
  const value = readWorkHistoryRevision(root);
  if (value === Number.MAX_SAFE_INTEGER)
    workFail('failed-precondition', 'A revisão do histórico atingiu seu limite.');
  return value + 1;
}
function stamp(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.seconds) ||
    value.seconds < 0 ||
    !Number.isInteger(value.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    workFail('failed-precondition', 'Não foi possível conferir a origem do histórico.');
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
export function historyBackupToken(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'A captura do histórico é inválida.');
  return value;
}
export async function readHistoryBackupSource(tx, context) {
  const root = await workProject(tx, context),
    snapshot = await tx.get(context.ref),
    historyRevision = readWorkHistoryRevision(root);
  return {
    schemaVersion: 1,
    historyRevision,
    sourceToken: digest({
      version: 1,
      uid: context.uid,
      target: context.target,
      created: stamp(snapshot.createTime),
      updated: stamp(snapshot.updateTime),
      historyRevision,
    }),
  };
}
export async function assertHistoryBackupSource(tx, context, expected) {
  const current = await readHistoryBackupSource(tx, context);
  if (current.sourceToken !== expected)
    workFail(
      'failed-precondition',
      'O histórico mudou durante a captura. Faça um novo backup.',
      'history-snapshot-changed',
    );
}
