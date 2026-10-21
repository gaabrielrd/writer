import { GenerationError } from './generation.mjs';

// Absence is a legacy baseline, never evidence that the lore collection is empty.
export function readBookLocalLoreVersion(book) {
  const value = Object.hasOwn(book, 'localLoreVersion') ? book.localLoreVersion : 0;
  if (!Number.isSafeInteger(value) || value < 0)
    throw new GenerationError('failed-precondition', 'Versão do lore local inconsistente.');
  return value;
}

export function nextBookLocalLoreVersion(book) {
  const value = readBookLocalLoreVersion(book);
  if (value === Number.MAX_SAFE_INTEGER)
    throw new GenerationError('failed-precondition', 'Versão do lore local esgotada.');
  return value + 1;
}
