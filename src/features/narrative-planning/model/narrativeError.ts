export function narrativeErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Não foi possível concluir a operação. Tente novamente.';
}
export function narrativeErrorReason(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('details' in error)) return '';
  const details = error.details;
  return typeof details === 'object' && details !== null && 'reason' in details
    ? String(details.reason)
    : '';
}
export function isNarrativeConflict(error: unknown): boolean {
  return narrativeErrorReason(error) === 'revision-conflict';
}
export function isNarrativeFailureDefinitive(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code).replace(/^functions\//, '')
      : '';
  return [
    'invalid-argument',
    'permission-denied',
    'unauthenticated',
    'not-found',
    'failed-precondition',
    'resource-exhausted',
  ].includes(code);
}
