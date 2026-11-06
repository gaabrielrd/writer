import { workFail } from './workProgressContracts.mjs';
export function workflowBirth(snapshot) {
  const t = snapshot.createTime;
  if (!Number.isSafeInteger(t?.seconds) || !Number.isSafeInteger(t?.nanoseconds))
    workFail('failed-precondition', 'Origem do ciclo indisponível.');
  return [t.seconds, t.nanoseconds];
}
