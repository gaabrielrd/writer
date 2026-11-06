// Pure policy: this records the collaboration choice, never a write/debit grant.
export const LITERARY_COLLABORATION_MODES = Object.freeze(['guidance', 'supervised', 'continuous']);
export function normalizeLiteraryCollaboration(value) {
  if (value === undefined) return { version: 1, mode: 'supervised' };
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'version') ||
    !Object.hasOwn(value, 'mode') ||
    value.version !== 1 ||
    !LITERARY_COLLABORATION_MODES.includes(value.mode)
  )
    throw new TypeError('Modo de colaboração inválido.');
  return { version: 1, mode: value.mode };
}
export function literaryCollaborationAllowsDraft(policy, execution) {
  return (
    policy.mode !== 'guidance' && (execution.mode !== 'continuous' || policy.mode === 'continuous')
  );
}
