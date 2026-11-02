import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, getFirebaseApp } from '@/shared/lib';
import { chatDocumentHash } from '@/features/ai-assistant';
import type { Chapter, CreateChapterInput } from '../model/chapter';

// An uncertain transport result keeps the same receipt on the next attempt.
// Keys contain hashes and identities, never manuscript text.
const uncertainOperations = new Map<string, string>();
const uncertainCodes = new Set(['internal', 'unavailable', 'deadline-exceeded', 'cancelled']);
function isUncertain(cause: unknown): boolean {
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? String(cause.code).replace(/^functions\//, '')
      : '';
  return uncertainCodes.has(code);
}
type SaveResult = { content: string; wordCount: number; updatedAt: number };
type SaveRequest = {
  bookId: string;
  chapterId: string;
  content: string;
  expectedContentHash: string;
  patch?: { title?: string; order?: number; personaComplement?: Chapter['personaComplement'] };
};
type PendingSave = { request: SaveRequest; operationId: string; observedBaseHash: string };
// Only unresolved writes retain their exact payload in memory, scoped to the account/chapter.
const pendingSaves = new Map<string, PendingSave>();
async function mutate<T>(name: string, input: object, operationId?: string): Promise<T> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Entre na sua conta para alterar o manuscrito.');
  const key = `${uid}:${name}:${await chatDocumentHash(JSON.stringify(input))}`;
  const id = operationId ?? uncertainOperations.get(key) ?? crypto.randomUUID();
  uncertainOperations.set(key, id);
  try {
    if (auth.currentUser?.uid !== uid)
      throw new Error('A conta mudou. Reabra o projeto antes de tentar novamente.');
    const result = (
      await httpsCallable<unknown, T>(
        getFunctions(getFirebaseApp(), 'us-central1'),
        name,
      )({
        ...input,
        operationId: id,
      })
    ).data;
    uncertainOperations.delete(key);
    return result;
  } catch (cause) {
    if (!isUncertain(cause)) uncertainOperations.delete(key);
    if (cause instanceof Error) throw cause;
    throw new Error('Não foi possível confirmar a alteração. Tente novamente.', { cause });
  }
}

export function createServerLegacyChapter(
  bookId: string,
  input: CreateChapterInput,
): Promise<Chapter> {
  const { creationId, ...chapter } = input;
  return mutate('createLegacyChapter', { bookId, input: chapter }, creationId);
}

export async function saveServerLegacyChapter(input: {
  bookId: string;
  chapterId: string;
  content: string;
  expectedContent: string;
  operationId?: string;
  expectedOwnerId?: string;
  patch?: { title?: string; order?: number; personaComplement?: Chapter['personaComplement'] };
}): Promise<SaveResult> {
  const { expectedContent, operationId, expectedOwnerId, ...request } = input;
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Entre na sua conta para alterar o manuscrito.');
  const assertOwner = () => {
    if (auth.currentUser?.uid !== uid || (expectedOwnerId && uid !== expectedOwnerId))
      throw new Error('A conta mudou. Reabra o capítulo antes de salvar.');
  };
  assertOwner();
  const observedBaseHash = await chatDocumentHash(expectedContent);
  assertOwner();
  const key = JSON.stringify([uid, request.bookId, request.chapterId]);
  const confirm = async (pending: PendingSave): Promise<SaveResult> => {
    try {
      assertOwner();
      const result = await mutate<SaveResult>(
        'saveLegacyChapter',
        pending.request,
        pending.operationId,
      );
      assertOwner();
      if (
        result.content !== pending.request.content ||
        !Number.isSafeInteger(result.wordCount) ||
        result.wordCount < 0 ||
        !Number.isFinite(result.updatedAt)
      )
        throw Object.assign(
          new Error('Não foi possível confirmar o texto salvo. Tente novamente.'),
          { code: 'functions/unavailable' },
        );
      pendingSaves.delete(key);
      return result;
    } catch (cause) {
      if (!isUncertain(cause)) pendingSaves.delete(key);
      throw cause;
    }
  };
  let expectedContentHash = observedBaseHash;
  const previous = pendingSaves.get(key);
  if (previous) {
    // Confirm our original write, rather than reading/rebasing onto someone else's text.
    const confirmed = await confirm(previous);
    const confirmedHash = await chatDocumentHash(confirmed.content);
    assertOwner();
    const followsOwnWrite =
      observedBaseHash === previous.observedBaseHash ||
      observedBaseHash === previous.request.expectedContentHash ||
      observedBaseHash === confirmedHash;
    if (followsOwnWrite) {
      if (
        request.content === confirmed.content &&
        JSON.stringify(request.patch) === JSON.stringify(previous.request.patch)
      )
        return confirmed;
      expectedContentHash = confirmedHash;
    }
  }
  const pending = {
    request: { ...request, expectedContentHash },
    operationId: operationId ?? crypto.randomUUID(),
    observedBaseHash,
  };
  pendingSaves.set(key, pending);
  return confirm(pending);
}

export function deleteServerLegacyChapters(
  bookId: string,
  chapters: { id: string; expectedUpdatedAt: number }[],
): Promise<{ deleted: number }> {
  return mutate('deleteLegacyChapters', { bookId, chapters });
}

/** Reuses the server's bounded checkpoint; no client-side scan of prose. */
export async function prepareServerBookWordCount(bookId: string): Promise<number> {
  const operationId = crypto.randomUUID();
  const prepare = httpsCallable<unknown, { complete: boolean; wordCount: number | null }>(
    getFunctions(getFirebaseApp(), 'us-central1'),
    'prepareWorkWordCount',
  );
  while (true) {
    const { data } = await prepare({
      target: { kind: 'book', id: bookId },
      operationId,
      limit: 25,
    });
    if (data.complete) {
      if (!Number.isSafeInteger(data.wordCount) || data.wordCount === null || data.wordCount < 0)
        throw new Error('Não foi possível confirmar a contagem do manuscrito.');
      return data.wordCount;
    }
  }
}
