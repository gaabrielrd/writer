// Pure standing authorization for the first-version stage of one fixed chapter.
export const SUPERVISED_DRAFT_EXECUTION = Object.freeze({
  version: 1,
  mode: 'supervised',
  maxApplications: null,
  maxCredits: null,
});
export function normalizeLiteraryDraftExecution(value) {
  if (value === undefined) return { ...SUPERVISED_DRAFT_EXECUTION };
  const keys = ['version', 'mode', 'maxApplications', 'maxCredits'];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key)) ||
    value.version !== 1 ||
    !['supervised', 'continuous'].includes(value.mode)
  )
    throw new TypeError('Autorização de redação inválida.');
  if (value.mode === 'supervised') {
    if (value.maxApplications !== null || value.maxCredits !== null)
      throw new TypeError('O modo supervisionado pede aceite por cena.');
  } else if (
    [value.maxApplications, value.maxCredits].some(
      (limit) => !Number.isSafeInteger(limit) || limit < 1 || limit > 1000000,
    )
  )
    throw new TypeError('Defina limites positivos de aplicações e créditos para esta execução.');
  return {
    version: 1,
    mode: value.mode,
    maxApplications: value.maxApplications,
    maxCredits: value.maxCredits,
  };
}
export function literaryDraftBudgetReached(execution, applications, credits, cost = 1) {
  if (![applications, credits, cost].every((value) => Number.isSafeInteger(value) && value >= 0))
    throw new TypeError('Contadores da redação inválidos.');
  return (
    execution.mode === 'continuous' &&
    (applications >= execution.maxApplications || credits + cost > execution.maxCredits)
  );
}
