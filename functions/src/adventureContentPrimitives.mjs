export const ADVENTURE_CONTENT_LIMITS = Object.freeze({
  itemBytes: 8 * 1024 * 1024,
  checkpointBytes: 16384,
  stepItems: 64,
});
export class AdventureContentError extends Error {
  constructor() {
    super('O arquivo da aventura possui dados incompletos ou inconsistentes.');
    this.name = 'AdventureContentError';
    this.code = 'adventure-backup-invalid-content';
  }
}
export function contentInvalid() {
  throw new AdventureContentError();
}
export const contentObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
export function contentClosed(value, required, optional = []) {
  return (
    contentObject(value) &&
    required.every((k) => Object.hasOwn(value, k)) &&
    Object.keys(value).every((k) => required.includes(k) || optional.includes(k))
  );
}
export const contentCount = (v) => Number.isSafeInteger(v) && v >= 0;
export const contentHash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const contentText = (v, max = Infinity) =>
  typeof v === 'string' && v.length <= max && v.isWellFormed();
export const contentDate = (v) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 8640000000000000;
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export function contentId(value) {
  return (
    contentText(value) &&
    value.length > 0 &&
    !['.', '..'].includes(value) &&
    !Array.from(value).some(
      (c) => c === '/' || c === '\\' || c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    ) &&
    encoder.encode(value).length <= 1500
  );
}
function jsonValue(value, depth = 0) {
  if (depth > 24) contentInvalid();
  if (typeof value === 'string' && !contentText(value)) contentInvalid();
  if (typeof value === 'number' && !Number.isFinite(value)) contentInvalid();
  if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      if (key === '__proto__' || !contentText(key)) contentInvalid();
      jsonValue(item, depth + 1);
    }
}
/** One bounded canonical JSON unit; a positive decode says nothing about its domain or source. */
export function decodeAdventureContentJSON(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    !bytes.length ||
    bytes.length > ADVENTURE_CONTENT_LIMITS.itemBytes
  )
    contentInvalid();
  let text, value;
  try {
    text = decoder.decode(bytes);
    value = JSON.parse(text);
  } catch {
    contentInvalid();
  }
  if (JSON.stringify(value) !== text) contentInvalid();
  jsonValue(value);
  return value;
}
export const createAdventureUtf8State = () => ({ needed: 0, minimum: 128, maximum: 191 });
/** Serializable RFC 3629 continuation state; fixed byte parts may split a code point. */
export function advanceAdventureUtf8(input, bytes, final = false) {
  if (
    !contentClosed(input, ['needed', 'minimum', 'maximum']) ||
    !Number.isInteger(input.needed) ||
    input.needed < 0 ||
    input.needed > 3 ||
    !(bytes instanceof Uint8Array) ||
    bytes.length > 65536 ||
    typeof final !== 'boolean'
  )
    contentInvalid();
  let { needed, minimum, maximum } = input;
  if (!(
    (minimum === 128 && maximum === 191) ||
    (needed === 2 &&
      ((minimum === 160 && maximum === 191) || (minimum === 128 && maximum === 159))) ||
    (needed === 3 && ((minimum === 144 && maximum === 191) || (minimum === 128 && maximum === 143)))
  ))
    contentInvalid();
  for (const byte of bytes) {
    if (needed) {
      if (byte < minimum || byte > maximum) contentInvalid();
      needed--;
      minimum = 128;
      maximum = 191;
    } else if (byte <= 127) continue;
    else if (byte >= 194 && byte <= 223) needed = 1;
    else if (byte >= 224 && byte <= 239) {
      needed = 2;
      if (byte === 224) minimum = 160;
      else if (byte === 237) maximum = 159;
    } else if (byte >= 240 && byte <= 244) {
      needed = 3;
      if (byte === 240) minimum = 144;
      else if (byte === 244) maximum = 143;
    } else contentInvalid();
  }
  if (final && needed) contentInvalid();
  return Object.freeze({ needed, minimum, maximum });
}
