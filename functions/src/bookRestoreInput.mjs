import { GenerationError } from './generationError.mjs';
/** Pure public failures; the upload contract preserves these historical exports. */
export function restoreFail(code, reason) {
  const error = new GenerationError(
    code,
    'Não foi possível concluir a preparação da cópia do livro.',
  );
  error.details = { reason };
  throw error;
}
export const invalid = (reason = 'invalid-input') => restoreFail('invalid-argument', reason);
export const inconsistent = () => restoreFail('failed-precondition', 'identity-conflict');
export function closed(value, required, optional = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    required.some((k) => !Object.hasOwn(value, k)) ||
    Object.keys(value).some((k) => ![...required, ...optional].includes(k))
  )
    invalid();
  return value;
}
