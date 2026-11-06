// Pure scoped identities: chapter numbers and titles never identify another volume.
export const LITERARY_VOLUME_UNIT_KINDS = Object.freeze([
  'act',
  'chapter',
  'scene',
  'arc',
  'event',
]);
const encoder = new TextEncoder();
const invalid = () => {
  throw new TypeError('Origem de volume inválida.');
};
const id = (value) => {
  if (
    typeof value !== 'string' ||
    !value ||
    !value.isWellFormed() ||
    value.includes('/') ||
    ['.', '..'].includes(value) ||
    encoder.encode(value).length > 1500
  )
    invalid();
  return value;
};
export function literaryVolumeUnitId(value) {
  if (!value || !LITERARY_VOLUME_UNIT_KINDS.includes(value.kind)) invalid();
  return JSON.stringify([id(value.bookId), value.kind, id(value.id)]);
}
export function readLiteraryVolumeUnitId(value) {
  if (typeof value !== 'string' || value.length > 20000) invalid();
  let parts;
  try {
    parts = JSON.parse(value);
  } catch {
    invalid();
  }
  if (!Array.isArray(parts) || parts.length !== 3) invalid();
  const source = { bookId: parts[0], kind: parts[1], id: parts[2] };
  if (literaryVolumeUnitId(source) !== value) invalid();
  return source;
}
export function validateLiteraryVolumeReference(value) {
  const source = readLiteraryVolumeUnitId(value.id);
  if (value.scopeId !== source.bookId || (value.purpose ?? 'source') !== 'source') invalid();
  return source;
}
