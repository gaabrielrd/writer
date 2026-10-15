export function sceneErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Não foi possível concluir a operação. Tente novamente.';
}
export function sceneErrorReason(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('details' in error)) return '';
  const details = error.details;
  return typeof details === 'object' && details !== null && 'reason' in details
    ? String(details.reason)
    : '';
}
export function isSceneConflict(error: unknown): boolean {
  return sceneErrorReason(error) === 'revision-conflict';
}
export function isSceneFailureDefinitive(error: unknown): boolean {
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
