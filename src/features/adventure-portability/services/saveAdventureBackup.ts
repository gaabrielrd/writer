import {
  streamAdventureArchive,
  type AdventureArchiveApi,
  type AdventureArchiveOptions,
  type AdventureArchiveByteProof,
} from './streamAdventureArchive';
import { closed, validCount, validHash } from './adventureInventoryContracts';
import { recoveryCheck as check } from './adventureRestoreRecoveryContracts';
import type { AdventureArchiveSink } from './adventureArchiveDestination';
/** Constructing the stream freezes an explicit draft before the destination/chooser resolves. */
export function saveAdventureBackup(
  adventureId: string,
  api: AdventureArchiveApi,
  options: AdventureArchiveOptions,
  destination: AdventureArchiveSink | PromiseLike<AdventureArchiveSink>,
): Promise<AdventureArchiveByteProof> {
  const settings = { ...options };
  const stream = streamAdventureArchive(adventureId, api, settings),
    guard = () => {
      settings.guard();
      settings.signal?.throwIfAborted();
    };
  return write();
  async function write() {
    let sink: AdventureArchiveSink | undefined,
      complete = false;
    try {
      sink = await destination;
      guard();
      for (;;) {
        const next = await stream.next();
        guard();
        if (next.done) {
          complete = true;
          const proof = next.value;
          check(
            closed(proof, ['validation', 'capture', 'seal']) &&
              proof.validation === 'captured-data-only' &&
              closed(proof.seal, ['records', 'payloadBytes', 'chainHash']) &&
              validCount(proof.seal.records) &&
              proof.seal.records > 0 &&
              validCount(proof.seal.payloadBytes) &&
              proof.seal.payloadBytes > 0 &&
              validHash(proof.seal.chainHash) &&
              proof.capture?.validation === 'captured-data-only',
          );
          await sink.close();
          guard();
          return proof;
        }
        await sink.write(next.value);
        guard();
      }
    } catch (error) {
      const failures: unknown[] = [error];
      if (!complete)
        try {
          await stream.return(undefined);
        } catch (cleanup) {
          failures.push(cleanup);
        }
      if (sink)
        try {
          await sink.abort(error);
        } catch (cleanup) {
          failures.push(cleanup);
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
