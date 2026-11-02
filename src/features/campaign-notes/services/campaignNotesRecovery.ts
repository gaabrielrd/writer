import type { PendingCampaignNoteOperation } from '../model/campaignNote';
const prefix = 'writer:campaign-notes:';
export const campaignNoteJournalKey = (uid: string, campaignId: string) =>
  prefix + JSON.stringify([uid, campaignId]);
const closed = (value: object, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
function valid(value: unknown, campaignId: string): value is PendingCampaignNoteOperation {
  if (!value || typeof value !== 'object' || !closed(value, ['method', 'input'])) return false;
  const operation = value as PendingCampaignNoteOperation,
    input = operation.input;
  if (
    !input ||
    typeof input !== 'object' ||
    !['saveCampaignNote', 'deleteCampaignNote'].includes(operation.method) ||
    input.campaignId !== campaignId ||
    !['noteId', 'operationId'].every(
      (field) =>
        typeof input[field as 'noteId' | 'operationId'] === 'string' &&
        Boolean(input[field as 'noteId' | 'operationId']) &&
        !input[field as 'noteId' | 'operationId'].includes('/'),
    ) ||
    !/^[a-f0-9]{64}$/.test(input.campaignToken) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  )
    return false;
  if (operation.method === 'saveCampaignNote')
    return (
      closed(input, [
        'campaignId',
        'campaignToken',
        'noteId',
        'operationId',
        'expectedRevision',
        'title',
        'content',
      ]) &&
      typeof operation.input.title === 'string' &&
      typeof operation.input.content === 'string' &&
      (input.expectedRevision > 0 || input.noteId === input.operationId)
    );
  return (
    closed(input, ['campaignId', 'campaignToken', 'noteId', 'operationId', 'expectedRevision']) &&
    input.expectedRevision > 0
  );
}
export function readPendingCampaignNote(
  uid: string,
  campaignId: string,
): PendingCampaignNoteOperation | null {
  const stored = localStorage.getItem(campaignNoteJournalKey(uid, campaignId));
  if (stored === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    throw new Error('O pedido preservado não pôde ser lido. Nenhuma nova alteração será enviada.');
  }
  if (!valid(value, campaignId))
    throw new Error(
      'O pedido preservado não corresponde à campanha. Nenhuma nova alteração será enviada.',
    );
  return value;
}
export function noteLocksAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';
}
async function withNoteLock<T>(
  uid: string,
  campaignId: string,
  isCurrent: () => boolean,
  work: () => T,
): Promise<T> {
  if (!noteLocksAvailable())
    throw new Error(
      'Este navegador não permite reservar o pedido com segurança. Seus campos foram mantidos; a leitura continua disponível.',
    );
  return navigator.locks.request(campaignNoteJournalKey(uid, campaignId), () => {
    if (!isCurrent()) throw new Error('A conta ou a campanha mudou. O pedido foi preservado.');
    return work();
  });
}
export function reserveCampaignNote(
  uid: string,
  operation: PendingCampaignNoteOperation,
  isCurrent: () => boolean,
): Promise<{ reserved: boolean; pending: PendingCampaignNoteOperation }> {
  if (!valid(operation, operation.input.campaignId))
    return Promise.reject(new Error('O pedido não pôde ser preservado.'));
  return withNoteLock(uid, operation.input.campaignId, isCurrent, () => {
    const pending = readPendingCampaignNote(uid, operation.input.campaignId);
    if (pending && JSON.stringify(pending) !== JSON.stringify(operation))
      return { reserved: false, pending };
    localStorage.setItem(
      campaignNoteJournalKey(uid, operation.input.campaignId),
      JSON.stringify(operation),
    );
    return { reserved: true, pending: operation };
  });
}
export function clearPendingCampaignNote(
  uid: string,
  campaignId: string,
  operationId: string,
  isCurrent: () => boolean,
): Promise<PendingCampaignNoteOperation | null> {
  return withNoteLock(uid, campaignId, isCurrent, () => {
    const pending = readPendingCampaignNote(uid, campaignId);
    if (pending?.input.operationId === operationId) {
      localStorage.removeItem(campaignNoteJournalKey(uid, campaignId));
      return null;
    }
    return pending;
  });
}
export function observePendingCampaignNotes(
  uid: string,
  campaignId: string,
  listener: () => void,
): () => void {
  const key = campaignNoteJournalKey(uid, campaignId),
    onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) listener();
    };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

export function forgetCampaignNoteRecovery(
  uid: string,
  expected: PendingCampaignNoteOperation,
  check: () => void,
): Promise<void> {
  return withNoteLock(
    uid,
    expected.input.campaignId,
    () => {
      check();
      return true;
    },
    () => {
      const actual = readPendingCampaignNote(uid, expected.input.campaignId);
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error('O pedido da nota mudou em outra aba e foi preservado.');
      localStorage.removeItem(campaignNoteJournalKey(uid, expected.input.campaignId));
    },
  );
}
