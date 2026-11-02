export const BOOK_COVER_LIMITS = Object.freeze({ imageBytes: 16 * 1024 * 1024, chunkBytes: 65536 });
export const BOOK_COVER_PNG_SIGNATURE = '89504e470d0a1a0a';
export const validBookCoverId = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value);
export function validateBookBackupCover(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Capa inválida.');
  if (
    Object.hasOwn(value, 'kind') &&
    ['none', 'legacy-unavailable'].includes(value.kind) &&
    Object.keys(value).length === 1
  )
    return { kind: value.kind };
  const required = ['kind', 'imageId', 'contentType', 'byteLength', 'chunkCount', 'contentHash'],
    optional = ['name', 'createdAt', 'updatedAt'];
  if (
    value.kind !== 'library' ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => ![...required, ...optional].includes(key)) ||
    !validBookCoverId(value.imageId) ||
    value.contentType !== 'image/png' ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 8 ||
    value.byteLength > BOOK_COVER_LIMITS.imageBytes ||
    value.chunkCount !== Math.ceil(value.byteLength / BOOK_COVER_LIMITS.chunkBytes) ||
    typeof value.contentHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.contentHash)
  )
    throw new TypeError('Manifesto de capa inválido.');
  if (
    Object.hasOwn(value, 'name') &&
    (typeof value.name !== 'string' || !value.name.isWellFormed() || value.name.length > 300)
  )
    throw new TypeError('Nome de capa inválido.');
  for (const key of ['createdAt', 'updatedAt'])
    if (Object.hasOwn(value, key) && (!Number.isSafeInteger(value[key]) || value[key] < 0))
      throw new TypeError('Data de capa inválida.');
  return Object.fromEntries(
    [...required, ...optional]
      .filter((key) => Object.hasOwn(value, key))
      .map((key) => [key, value[key]]),
  );
}
