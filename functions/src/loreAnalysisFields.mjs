import { GenerationError } from './generation.mjs';
const fail = (code, message) => {
  throw new GenerationError(code, message);
};
export const categories = ['character', 'location', 'concept', 'other'];
export function text(value, max, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    fail('invalid-argument', 'Texto ou ficha inválida.');
  return value;
}
export function aliases(value) {
  if (!Array.isArray(value) || value.length > 20) fail('invalid-argument', 'Apelidos inválidos.');
  return value.map((item) => text(item, 200));
}
export function patch(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).length === 0 ||
    Object.keys(input).some(
      (key) => !['name', 'category', 'summary', 'details', 'aliases'].includes(key),
    )
  )
    fail('invalid-argument', 'Campos inválidos para atualização.');
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'category') {
      if (!categories.includes(value)) fail('invalid-argument', 'Categoria inválida.');
      result[key] = value;
    } else if (key === 'aliases') result[key] = aliases(value);
    else
      result[key] = text(value, { name: 200, summary: 140, details: 8000 }[key], key !== 'details');
  }
  return result;
}
