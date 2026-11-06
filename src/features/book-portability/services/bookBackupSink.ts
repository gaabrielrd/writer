import { createBookBackupStage, type BookBackupStage } from './bookBackupStage';
import { inspectBookBackupContent } from './inspectBookBackupContent';
import type { BookBackupSeal } from '../model/backupContainer';
import { BookBackupFormatError } from '../model/backupContainer';
import { streamBookBackup, type BookBackupOptions } from './streamBookBackup';
import { closed, validHash } from './bookSnapshotCapture';
import { createBookBackupLorePort } from './bookBackupLorePort';
export interface BookBackupSink {
  write(this: void, bytes: Uint8Array): Promise<void>;
  close(this: void): Promise<void>;
  abort(this: void, reason: unknown): Promise<void>;
}
function check(options: Pick<BookBackupOptions, 'signal' | 'isCurrent' | 'apis'>) {
  options.apis?.lore?.guard();
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
  const settings = {
    ...options,
    apis: { ...options.apis, lore: { ...(options.apis?.lore ?? createBookBackupLorePort()) } },
  };
  const stream = streamBookBackup(bookId, settings);
  return write();
  async function write(): Promise<BookBackupSeal> {
    let sink: BookBackupSink | undefined,
      stage: BookBackupStage | undefined,
      complete = false;
    try {
      sink = await destination;
      check(settings);
      if (settings.apis.editorial) stage = await createBookBackupStage(() => check(settings));
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
          if (stage) {
            const source = await stage.finish();
            check(settings);
            const report = await inspectBookBackupContent(source, { signal: settings.signal });
            check(settings);
            if (
              report.validation !== 'content-only' ||
              report.envelope.manifest.version !== 2 ||
              report.envelope.manifest.bookId !== bookId ||
              report.envelope.seal.archiveBytes !== source.size ||
              report.envelope.seal.records !== seal.records ||
              report.envelope.seal.payloadBytes !== seal.payloadBytes ||
              report.envelope.seal.chainHash !== seal.chainHash
            )
              throw new BookBackupFormatError(
                'integrity-mismatch',
                'A validação não corresponde ao arquivo editorial produzido.',
              );
            // Remove encrypted staging before committing the destination. Failure stays provisional.
            await stage.dispose();
            stage = undefined;
            check(settings);
          }
          await sink.close();
          check(settings);
          return seal;
        }
        if (stage) {
          await stage.write(next.value);
          check(settings);
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
      if (stage) {
        try {
          await stage.dispose();
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
