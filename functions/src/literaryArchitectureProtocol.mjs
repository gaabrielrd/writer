// Pure composite identities keep structural metadata distinct from manuscript text.
export const LITERARY_ARCHITECTURE_TARGET_KINDS = Object.freeze([
  'act',
  'chapter',
  'scene',
  'arc',
  'event',
  'arcMilestone',
  'sceneLink',
  'narrativeLink',
  'narrativeControl',
]);
const id = (value) => {
  if (
    typeof value !== 'string' ||
    !value ||
    !value.isWellFormed() ||
    value.includes('/') ||
    ['.', '..'].includes(value) ||
    new TextEncoder().encode(value).length > 1500
  )
    throw new TypeError('Identidade arquitetural inválida.');
  return value;
};
export function literaryArchitectureTargetId(source) {
  if (
    !source ||
    !LITERARY_ARCHITECTURE_TARGET_KINDS.includes(source.kind) ||
    (source.kind === 'arcMilestone') !== (source.arcId != null)
  )
    throw new TypeError('Origem arquitetural inválida.');
  return JSON.stringify([
    source.kind,
    source.arcId == null ? null : id(source.arcId),
    id(source.id),
  ]);
}
export function readLiteraryArchitectureTargetId(value) {
  if (typeof value !== 'string' || value.length > 20000)
    throw new TypeError('Identidade arquitetural inválida.');
  let parts;
  try {
    parts = JSON.parse(value);
  } catch {
    throw new TypeError('Identidade arquitetural inválida.');
  }
  if (!Array.isArray(parts) || parts.length !== 3)
    throw new TypeError('Identidade arquitetural inválida.');
  const source = { kind: parts[0], arcId: parts[1], id: parts[2] };
  if (literaryArchitectureTargetId(source) !== value)
    throw new TypeError('Identidade arquitetural inválida.');
  return source;
}
