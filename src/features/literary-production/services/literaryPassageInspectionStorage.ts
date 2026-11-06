export interface PassageInspectionIntent {
  version: 1 | 2;
  expectedScopeToken?: string;
  cancelRequested?: boolean;
  actorId: string;
  bookId: string;
  chapterId: string;
  inspectionId: string;
  publicationId: string | null;
}
const key = (actorId: string, bookId: string, chapterId: string) =>
  'writer:passage-inspection:' + [actorId, bookId, chapterId].map(encodeURIComponent).join(':');
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/');
export function readPassageInspectionIntent(
  actorId: string,
  bookId: string,
  chapterId: string,
): PassageInspectionIntent | null {
  const raw = localStorage.getItem(key(actorId, bookId, chapterId));
  if (raw === null) return null;
  try {
    if (raw.length > 16000) throw new Error();
    const value = JSON.parse(raw) as PassageInspectionIntent;
    const fields = [
      'actorId',
      'bookId',
      'chapterId',
      'inspectionId',
      'publicationId',
      'version',
      ...(value.version === 2 ? ['expectedScopeToken'] : []),
      ...(Object.hasOwn(value, 'cancelRequested') ? ['cancelRequested'] : []),
    ]
      .sort()
      .join(',');
    if (
      Object.keys(value).sort().join(',') !== fields ||
      (Object.hasOwn(value, 'cancelRequested') && typeof value.cancelRequested !== 'boolean') ||
      ![1, 2].includes(value.version) ||
      (value.version === 2 &&
        (typeof value.expectedScopeToken !== 'string' ||
          !/^[a-f0-9]{64}$/.test(value.expectedScopeToken))) ||
      value.actorId !== actorId ||
      value.bookId !== bookId ||
      value.chapterId !== chapterId ||
      ![value.actorId, value.bookId, value.chapterId, value.inspectionId].every(identifier) ||
      (value.publicationId !== null && !identifier(value.publicationId))
    )
      throw new Error();
    return value;
  } catch {
    throw new Error(
      'O acompanhamento da inspeção está inválido. Preserve os dados para recuperação.',
    );
  }
}
async function locked<T>(
  actorId: string,
  bookId: string,
  chapterId: string,
  action: () => T,
): Promise<T> {
  if (!navigator.locks?.request)
    throw new Error('Este navegador precisa oferecer Web Locks para acompanhar a inspeção.');
  return navigator.locks.request(key(actorId, bookId, chapterId), action);
}
/** ID-only write-ahead. Locks never span HTTP; no cursor or approval is persisted. */
export async function reservePassageInspectionIntent(
  actorId: string,
  bookId: string,
  chapterId: string,
  publicationId: string | null,
  expectedScopeToken: string,
) {
  if (
    !/^[a-f0-9]{64}$/.test(expectedScopeToken) ||
    ![actorId, bookId, chapterId].every(identifier) ||
    (publicationId !== null && !identifier(publicationId))
  )
    throw new Error('Confira a origem da inspeção.');
  return locked(actorId, bookId, chapterId, () => {
    if (readPassageInspectionIntent(actorId, bookId, chapterId))
      throw new Error('Consulte ou encerre a inspeção acompanhada antes de iniciar outra.');
    const value: PassageInspectionIntent = {
      version: 2,
      actorId,
      bookId,
      chapterId,
      inspectionId: crypto.randomUUID(),
      publicationId,
      expectedScopeToken,
      cancelRequested: false,
    };
    localStorage.setItem(key(actorId, bookId, chapterId), JSON.stringify(value));
    return value;
  });
}
/** Caller first confirms the server inspection is closed. Compare the entire intent. */
export async function releasePassageInspectionIntent(expected: PassageInspectionIntent) {
  return locked(expected.actorId, expected.bookId, expected.chapterId, () => {
    const actual = readPassageInspectionIntent(
      expected.actorId,
      expected.bookId,
      expected.chapterId,
    );
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error('O acompanhamento local mudou em outra janela. Consulte antes de continuar.');
    localStorage.removeItem(key(expected.actorId, expected.bookId, expected.chapterId));
  });
}

/** Cancellation is monotonic and durable before HTTP, even for legacy observation. */
export async function markPassageInspectionCancellation(expected: PassageInspectionIntent) {
  return locked(expected.actorId, expected.bookId, expected.chapterId, () => {
    const actual = readPassageInspectionIntent(
      expected.actorId,
      expected.bookId,
      expected.chapterId,
    );
    if (
      !actual ||
      JSON.stringify({ ...actual, cancelRequested: false }) !==
        JSON.stringify({ ...expected, cancelRequested: false })
    )
      throw new Error('O acompanhamento local mudou. Consulte antes de encerrar.');
    if (actual.cancelRequested === true) return actual;
    const next = { ...actual, cancelRequested: true };
    localStorage.setItem(
      key(expected.actorId, expected.bookId, expected.chapterId),
      JSON.stringify(next),
    );
    return next;
  });
}
