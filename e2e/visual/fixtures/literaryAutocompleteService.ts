/** In-memory, authorized fictional autocomplete; no Firebase or provider I/O. */
import type {
  AutocompleteApplication,
  AutocompleteOffer,
  AutocompleteScope,
} from '../../../src/features/ai-assistant/model/atomicAutocomplete';
import type { BYOKConfig } from '../../../src/features/ai-assistant/model/byokConfig';
import { chatDocumentHash } from '../../../src/features/ai-assistant/model/chapterChat';
import { countWords } from '../../../src/features/books/model/chapter';
import { auth } from './firebase';
import { getBook, getChapter, fixtureWriteChapter } from './bookService';
import { generateAIResponse, deductCredit, getUserCredits } from './aiService';
import { getLiteraryWritingContext } from './literaryWritingService';
import {
  DEFAULT_PERSONAS,
  resolveWritingPersona,
} from '../../../src/features/ai-assistant/model/persona';
import { buildAutocompletePrompt } from '../../../src/features/ai-assistant/model/aiPrompt';
import { listPersonas } from './personaService';

const offers = new Map<string, AutocompleteOffer>();
const receipts = new Map<string, AutocompleteApplication>();
const canceled = new Set<string>();
async function authorize(scope: AutocompleteScope) {
  const book = await getBook(scope.bookId);
  const chapter = await getChapter(scope.bookId, scope.chapterId);
  if (!book || book.deleting || book.authorId !== auth.currentUser?.uid || !chapter)
    throw new Error('Origem fictícia indisponível.');
  return chapter;
}
export async function generateLiteraryAutocomplete(
  input: AutocompleteScope & { before: string; textBeforeCursor: string; planIds?: string[] },
  config: BYOKConfig,
  signal: AbortSignal,
): Promise<AutocompleteOffer> {
  const chapter = await authorize(input);
  const book = await getBook(input.bookId);
  signal.throwIfAborted();
  await getLiteraryWritingContext({
    target: { kind: 'book', id: input.bookId },
    resource: { kind: 'chapter', id: input.chapterId },
    planIds: input.planIds,
    mode: 'autocomplete',
  });
  const writingPersona = resolveWritingPersona(
    [...DEFAULT_PERSONAS, ...(await listPersonas(auth.currentUser!.uid))],
    book?.personaId,
    chapter.personaComplement,
  );
  const text = await generateAIResponse(
    buildAutocompletePrompt({ textBeforeCursor: input.textBeforeCursor, writingPersona }),
  );
  if (!text) throw new Error('Autocomplete fictício desativado.');
  const offer: AutocompleteOffer = {
    ...input,
    requestId: crypto.randomUUID(),
    beforeHash: await chatDocumentHash(input.before),
    text,
    expiresAt: Date.now() + 60000,
    applyCost: config.provider === 'firebase_ai' ? 1 : 0,
    editorial: null,
  };
  signal.throwIfAborted();
  offers.set(offer.requestId, offer);
  return offer;
}
export async function applyLiteraryAutocomplete(
  scope: AutocompleteScope,
  requestId: string,
  operationId: string,
  after: string,
): Promise<AutocompleteApplication> {
  const chapter = await authorize(scope);
  const previous = receipts.get(operationId);
  if (previous) return previous;
  const offer = offers.get(requestId);
  if (
    !offer ||
    canceled.has(requestId) ||
    offer.bookId !== scope.bookId ||
    offer.chapterId !== scope.chapterId ||
    offer.expiresAt <= Date.now() ||
    offer.beforeHash !== (await chatDocumentHash(chapter.content))
  )
    throw new Error('A oferta fictícia mudou ou expirou.');
  const receipt: AutocompleteApplication = {
    state: 'confirmed',
    requestId,
    operationId,
    fingerprint: await chatDocumentHash(operationId + after),
    chapterId: scope.chapterId,
    beforeHash: offer.beforeHash,
    afterHash: await chatDocumentHash(after),
    credits: offer.applyCost
      ? await deductCredit(auth.currentUser!.uid, offer.applyCost)
      : await getUserCredits(),
    chargedCredits: offer.applyCost,
    wordCount: countWords(after),
    updatedAt: Date.now(),
  };
  fixtureWriteChapter({
    ...chapter,
    content: after,
    wordCount: receipt.wordCount,
    updatedAt: receipt.updatedAt,
  });
  receipts.set(operationId, receipt);
  return receipt;
}
export async function cancelLiteraryAutocomplete(scope: AutocompleteScope, requestId: string) {
  await authorize(scope);
  canceled.add(requestId);
  return { state: 'canceled' as const, requestId };
}
export async function getLiteraryAutocompleteApplication(
  scope: AutocompleteScope,
  operationId: string,
) {
  await authorize(scope);
  const receipt = receipts.get(operationId);
  return receipt ? { state: 'confirmed' as const, receipt } : { state: 'unconfirmed' as const };
}
export async function abandonLiteraryAutocompleteApplication(
  scope: AutocompleteScope,
  requestId: string,
  operationId: string,
) {
  const outcome = await getLiteraryAutocompleteApplication(scope, operationId);
  if (outcome.state === 'confirmed') return outcome;
  await cancelLiteraryAutocomplete(scope, requestId);
  return { state: 'canceled' as const };
}
export const isDefinitiveAutocompleteFailure = () => true;
