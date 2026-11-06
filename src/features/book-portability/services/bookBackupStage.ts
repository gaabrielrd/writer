import { BookBackupFormatError, type BookBackupByteSource } from '../model/backupContainer';

const PART_BYTES = 65536;
const MAX_IO_BYTES = 1048576;
const encoder = new TextEncoder();
export interface BookBackupStage {
  write(this: void, bytes: Uint8Array): Promise<void>;
  finish(this: void): Promise<BookBackupByteSource>;
  dispose(this: void): Promise<void>;
}
function invalid(): never {
  throw new BookBackupFormatError(
    'integrity-mismatch',
    'O arquivo provisório do backup não pôde ser conferido.',
  );
}
/** Only ciphertext and anonymous part positions touch OPFS; the key and total stay in RAM. */
export async function createBookBackupStage(guard: () => void): Promise<BookBackupStage> {
  guard();
  const root = await navigator.storage.getDirectory();
  guard();
  const parent = await root.getDirectoryHandle('writer-book-backup-stage-v1', { create: true });
  guard();
  const operation = crypto.randomUUID();
  const directory = await parent.getDirectoryHandle(operation, { create: true });
  let state: 'open' | 'busy' | 'sealed' | 'failed' | 'disposed' = 'open';
  let size = 0,
    parts = 0,
    used = 0;
  let buffer = new Uint8Array(PART_BYTES);
  let key: CryptoKey | null = null;
  let disposal: Promise<void> | null = null;
  const check = () => {
    guard();
    if (state === 'disposed') throw new Error('Arquivo provisório encerrado.');
  };
  const aad = (index: number, length: number) =>
    encoder.encode(
      JSON.stringify({
        domain: 'writer-book-backup-stage-v1',
        operation,
        index,
        length,
      }),
    );
  async function flush() {
    if (!used || !key) invalid();
    check();
    const index = parts,
      length = used;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: aad(index, length) },
        key,
        buffer.slice(0, length),
      ),
    );
    check();
    const frame = new Uint8Array(12 + cipher.length);
    frame.set(iv);
    frame.set(cipher, 12);
    const handle = await directory.getFileHandle(String(index), { create: true });
    check();
    const file = await handle.createWritable({ keepExistingData: false });
    try {
      check();
      await file.write(frame);
      check();
      await file.close();
      check();
    } catch (error) {
      try {
        await file.abort(error);
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], 'Falha ao encerrar arquivo provisório.', {
          cause: cleanup,
        });
      }
      throw error;
    }
    parts++;
    used = 0;
    buffer.fill(0);
  }
  async function readPart(index: number): Promise<Uint8Array> {
    check();
    if (state !== 'sealed' || !key || index < 0 || index >= parts) invalid();
    const length = Math.min(PART_BYTES, size - index * PART_BYTES);
    const handle = await directory.getFileHandle(String(index));
    check();
    const file = await handle.getFile();
    check();
    if (file.size !== length + 28) invalid();
    const frame = new Uint8Array(await file.arrayBuffer());
    check();
    if (frame.length !== length + 28) invalid();
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: frame.slice(0, 12), additionalData: aad(index, length) },
        key,
        frame.slice(12),
      ),
    );
    check();
    if (state !== 'sealed' || plaintext.length !== length) invalid();
    return plaintext;
  }
  async function dispose() {
    if (state === 'disposed') return;
    if (disposal) return disposal;
    if (state === 'busy') throw new Error('A gravação provisória ainda está em andamento.');
    // No session/key is needed for cleanup. Keep a failed removal retryable.
    state = 'failed';
    buffer.fill(0);
    disposal = (async () => {
      await parent.removeEntry(operation, { recursive: true });
      key = null;
      state = 'disposed';
      buffer = new Uint8Array(0);
    })();
    try {
      await disposal;
    } finally {
      disposal = null;
    }
  }
  try {
    check();
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    check();
    return {
      async write(bytes) {
        check();
        if (
          state !== 'open' ||
          !ArrayBuffer.isView(bytes) ||
          Object.prototype.toString.call(bytes) !== '[object Uint8Array]' ||
          bytes.length > MAX_IO_BYTES ||
          !Number.isSafeInteger(size + bytes.length)
        )
          invalid();
        const input = new Uint8Array(bytes);
        state = 'busy';
        try {
          for (let offset = 0; offset < input.length;) {
            check();
            const count = Math.min(PART_BYTES - used, input.length - offset);
            buffer.set(input.subarray(offset, offset + count), used);
            used += count;
            size += count;
            offset += count;
            if (used === PART_BYTES) await flush();
          }
          check();
          state = 'open';
        } catch (error) {
          state = 'failed';
          throw error;
        }
      },
      async finish() {
        check();
        if (state !== 'open' || size === 0) invalid();
        state = 'busy';
        try {
          if (used) await flush();
          check();
          state = 'sealed';
        } catch (error) {
          state = 'failed';
          throw error;
        }
        return Object.freeze({
          size,
          async read(offset: number, length: number) {
            check();
            if (
              state !== 'sealed' ||
              !Number.isSafeInteger(offset) ||
              offset < 0 ||
              !Number.isSafeInteger(length) ||
              length < 0 ||
              length > MAX_IO_BYTES ||
              !Number.isSafeInteger(offset + length) ||
              offset + length > size
            )
              invalid();
            const result = new Uint8Array(length);
            for (let at = 0; at < length;) {
              const index = Math.floor((offset + at) / PART_BYTES);
              const bytes = await readPart(index);
              const start = (offset + at) % PART_BYTES,
                count = Math.min(bytes.length - start, length - at);
              result.set(bytes.subarray(start, start + count), at);
              at += count;
            }
            check();
            if (state !== 'sealed') invalid();
            return result;
          },
        });
      },
      dispose,
    };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], 'Falha ao preparar e limpar arquivo provisório.', {
        cause: cleanup,
      });
    }
    throw error;
  }
}
