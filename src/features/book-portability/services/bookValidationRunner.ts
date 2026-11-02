import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {
  BookValidationHash,
  BookValidationIndex,
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
export async function runBookValidation<T>(
  source: BookBackupByteSource,
  options: { signal?: AbortSignal },
  validate: (
    source: BookBackupByteSource,
    options: { index: BookValidationIndex; hash: BookValidationHash; signal?: AbortSignal },
  ) => Promise<T>,
): Promise<T> {
  const settings = { ...options },
    index = await createBookValidationIndex(settings.signal);
  let failed = false,
    primary: unknown,
    result: T | undefined;
  try {
    result = await validate(source, { index, hash, signal: settings.signal });
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
  if (result === undefined) throw new Error('A validação não retornou um resultado.');
  return result;
}
