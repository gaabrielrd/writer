import { readObject, readCount, readId, readHash } from './bookLoreReadContracts';
import { freezeLoreEditValue, invalidLoreEdit } from './bookLoreWritePlan';

export interface LoreCreationProgress {
  readonly schemaVersion: 1;
  readonly creationId: string;
  readonly bookId: string;
  readonly loreId: string;
  readonly startHash: string;
  readonly jobToken: string | null;
  readonly phase: 'preparing' | 'cancelling' | 'cancelled' | 'adopted';
  readonly cancellationOperationId: string | null;
  readonly cleanupRevision?: number;
  readonly cleanupPhase?: string;
  readonly coordinatedUnits?: number;
  readonly completedUploads?: number;
  readonly adoption?: {
    readonly operationId: string;
    readonly editId: string;
    readonly generationId: string;
    readonly timestamp: number;
    readonly localLoreVersion: number;
  };
}
export function creationProgress(
  value: unknown,
  expected: {
    creationId: string;
    bookId: string;
    loreId: string;
    startHash: string;
    token?: string | null;
  },
): LoreCreationProgress {
  const v = readObject(
    freezeLoreEditValue(value),
    [
      'schemaVersion',
      'creationId',
      'bookId',
      'loreId',
      'startHash',
      'jobToken',
      'phase',
      'cancellationOperationId',
    ],
    ['adoption', 'cleanupRevision', 'cleanupPhase', 'coordinatedUnits', 'completedUploads'],
  );
  if (
    v.schemaVersion !== 1 ||
    v.creationId !== expected.creationId ||
    v.bookId !== expected.bookId ||
    v.loreId !== expected.loreId ||
    v.startHash !== expected.startHash ||
    !['preparing', 'cancelling', 'cancelled', 'adopted'].includes(v.phase as string)
  )
    invalidLoreEdit();
  const token = v.jobToken === null ? null : readHash(v.jobToken);
  if (
    (expected.token !== undefined && token !== expected.token) ||
    (token === null && v.phase !== 'cancelled')
  )
    invalidLoreEdit();
  if (v.cancellationOperationId !== null) readId(v.cancellationOperationId);
  if ((v.phase === 'cancelled') !== (v.cancellationOperationId !== null)) invalidLoreEdit();
  const cleanup = ['cleanupRevision', 'cleanupPhase', 'coordinatedUnits', 'completedUploads'];
  if (cleanup.some((key) => Object.hasOwn(v, key))) {
    if (
      !cleanup.every((key) => Object.hasOwn(v, key)) ||
      !['cancelling', 'cancelled'].includes(v.phase as string) ||
      ![
        'attempts',
        'uploads',
        'leases',
        'jobs',
        'edits',
        'generations',
        'bodies',
        'finish',
        'complete',
      ].includes(v.cleanupPhase as string)
    )
      invalidLoreEdit();
    for (const key of ['cleanupRevision', 'coordinatedUnits', 'completedUploads'])
      readCount(v[key]);
  } else if (v.phase === 'cancelling') invalidLoreEdit();
  if (Object.hasOwn(v, 'adoption')) {
    const a = readObject(v.adoption, [
      'operationId',
      'editId',
      'generationId',
      'timestamp',
      'localLoreVersion',
    ]);
    readId(a.operationId);
    readId(a.editId);
    readHash(a.generationId);
    if (
      v.phase !== 'adopted' ||
      !Number.isFinite(new Date(readCount(a.timestamp)).getTime()) ||
      readCount(a.localLoreVersion) < 1
    )
      invalidLoreEdit();
  }
  if ((v.phase === 'adopted') !== Object.hasOwn(v, 'adoption')) invalidLoreEdit();
  return v as unknown as LoreCreationProgress;
}
