import type {
  CampaignNote,
  CampaignNotesEnvelope,
  CampaignNoteMutationResult,
  PendingCampaignNoteOperation,
  CampaignNoteSummary,
} from '../model/campaignNote';
export * from './campaignNotesCallables';
const uncertain = (message: string): never => {
  throw Object.assign(new Error(message), { code: 'functions/unavailable' });
};
export function validateNoteEnvelope(
  value: CampaignNotesEnvelope,
  uid: string,
  campaignId: string,
  token?: string,
): void {
  if (
    !value ||
    value.ownerId !== uid ||
    value.campaignId !== campaignId ||
    value.schemaVersion !== 1 ||
    typeof value.campaignToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.campaignToken) ||
    (token !== undefined && value.campaignToken !== token) ||
    !Number.isSafeInteger(value.collectionRevision) ||
    value.collectionRevision < 0
  )
    uncertain('A identidade das notas não pôde ser confirmada.');
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 4 * 1024 * 1024)
    uncertain('A resposta das notas ultrapassa o orçamento de leitura.');
}
export function validateNoteSummary(note: CampaignNoteSummary): void {
  if (
    !note ||
    typeof note.id !== 'string' ||
    !note.id ||
    typeof note.title !== 'string' ||
    !note.title.trim() ||
    note.title.length > 300 ||
    !Number.isSafeInteger(note.revision) ||
    note.revision < 1 ||
    ![note.createdAt, note.updatedAt].every((date) => Number.isSafeInteger(date) && date >= 0) ||
    note.updatedAt < note.createdAt
  )
    uncertain('A nota recebida não pôde ser confirmada.');
}
export function validateCampaignNote(
  note: CampaignNote,
  uid: string,
  campaignId: string,
  noteId: string,
): void {
  validateNoteSummary(note);
  if (
    note.id !== noteId ||
    note.ownerId !== uid ||
    note.campaignId !== campaignId ||
    note.schemaVersion !== 1 ||
    typeof note.content !== 'string' ||
    note.content.length > 150000 ||
    new TextEncoder().encode(note.content).byteLength > 512 * 1024
  )
    uncertain('O conteúdo da nota não pôde ser confirmado.');
}
export function validateNoteMutation(
  value: CampaignNoteMutationResult,
  uid: string,
  operation: PendingCampaignNoteOperation,
): void {
  const input = operation.input;
  validateNoteEnvelope(value, uid, input.campaignId, input.campaignToken);
  if (operation.method === 'saveCampaignNote') {
    if (!('note' in value) || !value.note)
      return uncertain('O salvamento ainda não pôde ser confirmado.');
    validateCampaignNote(value.note, uid, input.campaignId, input.noteId);
    if (
      value.note.revision !== input.expectedRevision + 1 ||
      value.note.title !== operation.input.title.trim() ||
      value.note.content !== operation.input.content
    )
      uncertain('O texto confirmado não corresponde ao pedido preservado.');
  } else if (
    !('deleted' in value) ||
    value.deleted !== true ||
    value.noteId !== input.noteId ||
    value.revision !== input.expectedRevision + 1
  )
    uncertain('A exclusão ainda não pôde ser confirmada.');
}
export const notesMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Não foi possível acessar suas notas. Tente novamente.';
export function noteErrorReason(cause: unknown): string | undefined {
  if (
    !cause ||
    typeof cause !== 'object' ||
    !('details' in cause) ||
    !cause.details ||
    typeof cause.details !== 'object' ||
    !('reason' in cause.details)
  )
    return;
  return String(cause.details.reason);
}
export function definitiveNoteFailure(cause: unknown): boolean {
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? String(cause.code).replace(/^functions\//, '')
      : '';
  return [
    'invalid-argument',
    'failed-precondition',
    'permission-denied',
    'unauthenticated',
    'not-found',
    'already-exists',
    'resource-exhausted',
  ].includes(code);
}
const queues = new Map<string, Promise<unknown>>();
export function runNoteOperation<T>(
  uid: string,
  campaignId: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = JSON.stringify([uid, campaignId]),
    previous = queues.get(key);
  const result = (async () => {
    if (previous) await previous.catch(() => undefined);
    return work();
  })();
  queues.set(key, result);
  void result
    .finally(() => {
      if (queues.get(key) === result) queues.delete(key);
    })
    .catch(() => undefined);
  return result;
}
