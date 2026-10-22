import type { BookBackupSeal } from '../model/backupContainer';
import { BookBackupFormatError } from '../model/backupContainer';
import { streamBookBackup, type BookBackupOptions } from './streamBookBackup';
import { closed, validHash } from './bookSnapshotCapture';
export interface BookBackupSink {
  write(this: void, bytes: Uint8Array): Promise<void>;
  close(this: void): Promise<void>;
  abort(this: void, reason: unknown): Promise<void>;
}
function check(options: Pick<BookBackupOptions, 'signal' | 'isCurrent'>) {
  options.signal?.throwIfAborted();
  if (options.isCurrent && !options.isCurrent())
    throw new DOMException('A captura não pertence mais à sessão atual.', 'AbortError');
}
export async function createBookBackupFileSink(
  handle: Pick<FileSystemFileHandle, 'createWritable'>,
): Promise<BookBackupSink> {
  const file = await handle.createWritable({ keepExistingData: false });
  let state: 'open' | 'closing' | 'closed' | 'failed' | 'aborted' = 'open';
  return {
    async write(bytes) {
      if (state !== 'open') throw new Error('Arquivo de backup não está aberto.');
      await file.write(new Uint8Array(bytes));
    },
    async close() {
      if (state !== 'open') throw new Error('Arquivo de backup não está aberto.');
      state = 'closing';
      try {
        await file.close();
        state = 'closed';
      } catch (error) {
        state = 'failed';
        throw error;
      }
    },
    async abort(reason) {
      if (state === 'closed' || state === 'aborted') return;
      state = 'aborted';
      await file.abort(reason);
    },
  };
}
/** Freezes the draft before awaiting a sink (which may include a file picker). */
export function saveBookBackup(
  bookId: string,
  options: BookBackupOptions,
  destination: BookBackupSink | PromiseLike<BookBackupSink>,
): Promise<BookBackupSeal> {
  const settings = { ...options };
  const stream = streamBookBackup(bookId, settings);
  return write();
  async function write(): Promise<BookBackupSeal> {
    let sink: BookBackupSink | undefined,
      complete = false;
    try {
      sink = await destination;
      check(settings);
      for (;;) {
        const next = await stream.next();
        check(settings);
        if (next.done) {
          complete = true;
          const seal = next.value;
          if (
            !closed(seal, ['records', 'payloadBytes', 'chainHash']) ||
            !Number.isSafeInteger(seal.records) ||
            Number(seal.records) < 1 ||
            !Number.isSafeInteger(seal.payloadBytes) ||
            Number(seal.payloadBytes) < 1 ||
            !validHash(seal.chainHash)
          )
            throw new BookBackupFormatError(
              'incomplete-archive',
              'O backup não retornou seu selo completo.',
            );
          await sink.close();
          return seal;
        }
        await sink.write(next.value);
        check(settings);
      }
    } catch (error) {
      const failures: unknown[] = [error];
      if (!complete) {
        try {
          await stream.return(undefined);
        } catch (cleanup) {
          failures.push(cleanup);
        }
      }
      if (sink) {
        try {
          await sink.abort(error);
        } catch (cleanup) {
          failures.push(cleanup);
        }
      }
      if (failures.length > 1)
        throw new AggregateError(
          failures,
          'A gravação falhou e seu encerramento não foi confirmado.',
          { cause: error },
        );
      throw error;
    }
  }
}
