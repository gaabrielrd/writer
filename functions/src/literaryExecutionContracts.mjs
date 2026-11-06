import { workClosed, workFail } from './workProgressContracts.mjs';
export const WORKFLOW_PHASES = ['firstVersion', 'review', 'revisedVersion'];
export function workflowLimits(value) {
  workClosed(value, ['maxApplications', 'maxCredits', 'maxSteps']);
  if (
    ![value.maxApplications, value.maxCredits, value.maxSteps].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1000000,
    ) ||
    value.maxSteps < 1
  )
    workFail('invalid-argument', 'Defina limites inteiros para aplicações, créditos e passos.');
  return {
    maxApplications: value.maxApplications,
    maxCredits: value.maxCredits,
    maxSteps: value.maxSteps,
  };
}
export function workflowPhases(value) {
  if (
    !Array.isArray(value) ||
    new Set(value).size !== value.length ||
    value.some((p) => !WORKFLOW_PHASES.includes(p))
  )
    workFail('invalid-argument', 'Escolha as fases autorizadas deste ciclo.');
  return WORKFLOW_PHASES.filter((p) => value.includes(p));
}
