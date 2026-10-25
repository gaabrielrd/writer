import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { inspectionProgress } from './bookLoreWriteProgress';
import { readObject } from './bookLoreReadContracts';
import { invalidLoreEdit } from './bookLoreWritePlan';
interface Input {
  uid: string;
  bookId: string;
  loreId: string;
  sourceToken: string;
  data: Readonly<Record<string, unknown>>;
}
type Call = (method: string, input: unknown) => Promise<unknown>;
const wellFormed = (value: string) =>
  !/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/u.test(value);
/** Resumes the same source/candidate after a lost reply. No browser persistence. */
export async function verifyBookLorePublicationCandidate(
  input: Input,
  call: Call,
  guard: () => void,
) {
  guard();
  const d = input.data;
  if (
    typeof d.name !== 'string' ||
    typeof d.summary !== 'string' ||
    typeof d.category !== 'string' ||
    !Array.isArray(d.aliases) ||
    d.aliases.some((a) => typeof a !== 'string')
  )
    invalidLoreEdit();
  const publication = {
    name: d.name.trim(),
    aliases: [...(d.aliases as string[])],
    category: d.category,
    summary: d.summary,
  };
  if (
    !publication.name ||
    !wellFormed(publication.name) ||
    publication.name.length > 200 ||
    !wellFormed(publication.summary) ||
    publication.summary.length > 140 ||
    !['character', 'location', 'concept', 'other'].includes(publication.category) ||
    publication.aliases.length > 20 ||
    publication.aliases.some((a) => !wellFormed(a) || a.length > 200)
  )
    invalidLoreEdit();
  const publicationHash = hash(publication),
    inspectionId =
      'lore-source-' +
      hash({
        domain: 'writer-publication-inspection',
        uid: input.uid,
        bookId: input.bookId,
        loreId: input.loreId,
        sourceToken: input.sourceToken,
        publicationHash,
      }),
    intent = {
      bookId: input.bookId,
      loreId: input.loreId,
      inspectionId,
      sourceToken: input.sourceToken,
      publicationHash,
    },
    startHash = hash({ domain: 'writer-lore-source-inspection', schemaVersion: 1, intent }),
    rpc = async (method: string, data: unknown) => {
      guard();
      const result = await call(method, data);
      guard();
      return result;
    };
  let p = inspectionProgress(await rpc('startBookLoreSourceInspection', intent), {
    id: inspectionId,
    startHash,
  });
  while (!p.ready) {
    if (p.phase === 'cancelled' || !p.jobToken) invalidLoreEdit();
    const request = {
      inspectionId,
      startHash,
      jobToken: p.jobToken,
      expectedRevision: p.revision,
      operationId:
        'publication-' + hash({ inspectionId, jobToken: p.jobToken, revision: p.revision }),
      publication,
    };
    const result = readObject(await rpc('advanceBookLoreSourceInspection', request), [
      'receipt',
      'progress',
    ]);
    const expected = { id: inspectionId, startHash, token: p.jobToken },
      receipt = inspectionProgress(result.receipt, expected),
      next = inspectionProgress(result.progress, expected);
    if (receipt.revision !== p.revision + 1 || next.revision < receipt.revision) invalidLoreEdit();
    p = next;
  }
  guard();
  if (!p.jobToken) invalidLoreEdit();
  return { inspection: { inspectionId, startHash, jobToken: p.jobToken }, publication };
}
