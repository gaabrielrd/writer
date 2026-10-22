import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  validateBookBackupContent,
  type BookContentReport,
  type BookValidationHash,
} from '../../../../functions/src/bookBackupContent.mjs';
import type { BookBackupByteSource } from '../model/backupContainer';
import { createBookValidationIndex } from './bookValidationIndex';
const hash: BookValidationHash = {
  create() {
    const state = sha256.create();
    return {
      update: (bytes) => {
        state.update(bytes);
      },
      digest: () => bytesToHex(state.digest()),
      destroy: () => {
        state.destroy();
      },
    };
  },
};
/** Reads inert data locally. A positive report never authorizes server restoration. */
export async function inspectBookBackupContent(
  source: BookBackupByteSource,
  options: { signal?: AbortSignal } = {},
): Promise<BookContentReport> {
  const settings = { ...options };
  const index = await createBookValidationIndex(settings.signal);
  let failed = false,
    primary: unknown,
    result: BookContentReport | undefined;
  try {
    result = await validateBookBackupContent(source, { index, hash, signal: settings.signal });
  } catch (error) {
    failed = true;
    primary = error;
  }
  try {
    await index.dispose();
  } catch (cleanup) {
    if (failed)
      throw new AggregateError(
        [primary, cleanup],
        'A validação falhou e a limpeza não foi confirmada.',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (failed) throw primary;
  settings.signal?.throwIfAborted();
  if (!result) throw new Error('A validação não retornou um resultado.');
  return result;
}
