import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreWriteHash as hash, type BookLoreWriteOptions } from './bookLoreWritePayload';
import { prepareBookLoreCreationOperation } from './bookLoreCreationOperation';
import type { BookLoreCreationInput } from './bookLoreCreationPlan';
import { journalFail } from './bookLoreJournalContracts';
import {
  readCreationCheckpointBundle,
  readCreationCheckpointOutcome,
  type CreationCheckpointScope,
  type CreationCheckpointBundle,
  type CreationCheckpointOutcome,
} from './bookLoreCreationCheckpointContracts';

type Operation = Awaited<ReturnType<typeof prepareBookLoreCreationOperation>>;
export function captureCreationCheckpoint(
  op: Pick<Operation, 'checkpoint' | 'controlsPage'>,
): CreationCheckpointBundle {
  const checkpoint = op.checkpoint(),
    pages = [];
  for (let offset = 0; offset < checkpoint.uploadCount; offset += 50)
    pages.push(op.controlsPage(offset, Math.min(50, checkpoint.uploadCount - offset)));
  return freezeLoreEditValue({ schemaVersion: 1, checkpoint, pages }) as CreationCheckpointBundle;
}
export function creationCheckpointRecovery(bundle: CreationCheckpointBundle) {
  return {
    checkpoint: bundle.checkpoint,
    controlsPage: (offset: number, limit: number) => {
      if (offset % 50 !== 0 || limit !== Math.min(50, bundle.checkpoint.uploadCount - offset))
        journalFail();
      return Promise.resolve(bundle.pages[offset / 50]);
    },
  };
}
export async function validateCreationCheckpoint(
  value: unknown,
  input: BookLoreCreationInput,
  i: CreationCheckpointScope,
  options: BookLoreWriteOptions = {},
) {
  const b = readCreationCheckpointBundle(value, i);
  await prepareBookLoreCreationOperation(
    input,
    {
      call() {
        throw Error('Checkpoint validation never sends.');
      },
    },
    options,
    creationCheckpointRecovery(b),
  );
  options.guard?.();
  options.signal?.throwIfAborted();
  return b;
}
export function makeCreationCheckpointOutcome(
  before: CreationCheckpointBundle,
  after: CreationCheckpointBundle,
  baseGeneration: string,
): CreationCheckpointOutcome {
  const wire = before.checkpoint.pending.production;
  if (!wire || after.checkpoint.completedCalls !== before.checkpoint.completedCalls + 1)
    journalFail();
  let patch: CreationCheckpointOutcome['patch'] = null;
  if (before.pages.length !== after.pages.length) journalFail();
  after.pages.forEach((p, n) => {
    if (hash(p) !== hash(before.pages[n])) {
      if (patch) journalFail();
      patch = { offset: n * 50, page: p };
    }
  });
  return readCreationCheckpointOutcome(
    {
      id: crypto.randomUUID(),
      baseGeneration,
      requestHash: hash(wire),
      checkpoint: after.checkpoint,
      patch,
    },
    { ...after.checkpoint, uploadCount: after.checkpoint.uploadCount },
  );
}
export function mergeCreationCheckpointOutcome(
  base: CreationCheckpointBundle,
  outcome: CreationCheckpointOutcome,
  generation: string,
) {
  if (
    outcome.baseGeneration !== generation ||
    !base.checkpoint.pending.production ||
    hash(base.checkpoint.pending.production) !== outcome.requestHash ||
    outcome.checkpoint.completedCalls !== base.checkpoint.completedCalls + 1
  )
    journalFail();
  const pages = base.pages.slice();
  if (outcome.patch) pages[outcome.patch.offset / 50] = outcome.patch.page;
  return { schemaVersion: 1 as const, checkpoint: outcome.checkpoint, pages };
}
