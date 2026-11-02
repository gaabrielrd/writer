import { GenerationError } from './generation.mjs';
const failureCodes = new Set([
  'cancelled',
  'unknown',
  'invalid-argument',
  'deadline-exceeded',
  'not-found',
  'already-exists',
  'permission-denied',
  'resource-exhausted',
  'failed-precondition',
  'aborted',
  'out-of-range',
  'unimplemented',
  'internal',
  'unavailable',
  'data-loss',
  'unauthenticated',
]);

/** Closed, versioned transport; all business authorization remains in the selected service. */
export function createDomainHandler({ domain, name, invoke, observe = () => {} }) {
  return async (request) => {
    const started = Date.now();
    let action = null,
      outcome = 'internal';
    try {
      if (typeof request.auth?.uid !== 'string' || !request.auth.uid)
        throw new GenerationError('unauthenticated', 'Entre na sua conta.');
      const input = request.data;
      if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        Object.keys(input).length !== 3 ||
        !['version', 'action', 'payload'].every((key) => Object.hasOwn(input, key)) ||
        input.version !== 1 ||
        typeof input.action !== 'string' ||
        !Object.hasOwn(domain.actions, input.action)
      )
        throw new GenerationError('invalid-argument', 'Ação indisponível neste setor.');
      action = input.action;
      const result = await invoke(domain.actions[action], { ...request, data: input.payload });
      outcome = 'ok';
      return result;
    } catch (error) {
      if (failureCodes.has(error?.code)) outcome = error.code;
      throw error;
    } finally {
      try {
        observe({ domain: name, action, outcome, durationMs: Date.now() - started });
      } catch {
        /* Logging must not change the result of an accepted mutation. */
      }
    }
  };
}
