import { createTemporaryValidationIndex } from '@/shared/validation';
import {
  validateAdventureBackupContent,
  type AdventureContentReport,
} from '../../../../functions/src/adventureBackupContent.mjs';
import { createAdventureContentHash } from '../../../../functions/src/adventureContentHash.mjs';
import type { AdventureBackupByteSource } from '../../../../functions/src/adventureBackupContainer.mjs';
/** Inspects inert local bytes only; the result never authorizes remote restoration. */
export async function inspectAdventureBackupContent(
  source: AdventureBackupByteSource,
  options: { signal?: AbortSignal } = {},
): Promise<AdventureContentReport> {
  const signal = options.signal,
    input = { size: source.size, read: source.read.bind(source) };
  signal?.throwIfAborted();
  const index = await createTemporaryValidationIndex('writer-adventure-validation-v1', signal);
  let failed = false,
    primary: unknown,
    result: AdventureContentReport | undefined;
  try {
    const hash = await createAdventureContentHash();
    signal?.throwIfAborted();
    result = await validateAdventureBackupContent(input, { index, hash, signal });
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
  signal?.throwIfAborted();
  if (!result) throw new Error('A validação não retornou um resultado.');
  return result;
}
