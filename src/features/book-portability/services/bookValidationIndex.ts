import type { BookValidationIndex } from '../../../../functions/src/bookBackupContent.mjs';
const MAX_BYTES = 16384,
  ROOT = 'writer-book-validation-v1';
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === 'object' && !Array.isArray(v));
function validateKey(key: readonly string[]) {
  if (
    !Array.isArray(key) ||
    key.length < 1 ||
    key.length > 8 ||
    key.some((part: unknown) => typeof part !== 'string')
  )
    throw new TypeError('Índice temporário inválido.');
  const bytes = encoder.encode(JSON.stringify(key));
  if (bytes.length > 8192) throw new RangeError('Chave do índice temporário excedida.');
  return bytes;
}
/** Only encrypted identity metadata survives a crash; neither key is persisted. */
export async function createBookValidationIndex(
  signal?: AbortSignal,
): Promise<BookValidationIndex & { dispose(): Promise<void> }> {
  signal?.throwIfAborted();
  const root = await navigator.storage.getDirectory(),
    parent = await root.getDirectoryHandle(ROOT, { create: true }),
    name = crypto.randomUUID();
  const directory = await parent.getDirectoryHandle(name, { create: true });
  let disposed = false;
  const check = () => {
    signal?.throwIfAborted();
    if (disposed) throw new Error('Índice temporário encerrado.');
  };
  try {
    const encryption = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const naming = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
    ]);
    check();
    const filename = async (key: readonly string[]) => {
      const signed = await crypto.subtle.sign('HMAC', naming, validateKey(key));
      check();
      return Array.from(new Uint8Array(signed), (v) => v.toString(16).padStart(2, '0')).join('');
    };
    async function lookup(fileName: string) {
      try {
        return await directory.getFileHandle(fileName);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') return undefined;
        throw error;
      }
    }
    return {
      async add(key, value) {
        check();
        const fileName = await filename(key);
        if (await lookup(fileName)) throw new Error('Identidade duplicada no backup.');
        const payload = encoder.encode(JSON.stringify({ key, value }));
        if (payload.length > MAX_BYTES)
          throw new RangeError('Entrada do índice temporário excedida.');
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = new Uint8Array(
          await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv, additionalData: encoder.encode(fileName) },
            encryption,
            payload,
          ),
        );
        check();
        const bytes = new Uint8Array(12 + ciphertext.length);
        bytes.set(iv);
        bytes.set(ciphertext, 12);
        const file = await (
          await directory.getFileHandle(fileName, { create: true })
        ).createWritable();
        try {
          check();
          await file.write(bytes);
          check();
          await file.close();
          check();
        } catch (error) {
          try {
            await file.abort(error);
          } catch (cleanup) {
            throw new AggregateError([error, cleanup], 'Falha ao encerrar índice temporário.', {
              cause: cleanup,
            });
          }
          throw error;
        }
      },
      async get(key) {
        check();
        const fileName = await filename(key),
          handle = await lookup(fileName);
        check();
        if (!handle) return undefined;
        const file = await handle.getFile();
        if (file.size < 28 || file.size > MAX_BYTES + 28)
          throw new Error('Índice temporário corrompido.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        check();
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode(fileName) },
          encryption,
          bytes.slice(12),
        );
        check();
        const decoded: unknown = JSON.parse(decoder.decode(plaintext));
        if (
          !object(decoded) ||
          Object.keys(decoded).length !== 2 ||
          JSON.stringify(decoded.key) !== JSON.stringify(key) ||
          !object(decoded.value)
        )
          throw new Error('Índice temporário corrompido.');
        return decoded.value;
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        await parent.removeEntry(name, { recursive: true });
      },
    };
  } catch (error) {
    try {
      await parent.removeEntry(name, { recursive: true });
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'Falha ao limpar índice temporário.', {
        cause: cleanup,
      });
    }
    throw error;
  }
}
