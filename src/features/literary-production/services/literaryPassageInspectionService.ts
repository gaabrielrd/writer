import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';

export interface PassageInspectionChapter {
  id: string;
  title: string;
  order: number;
  actId: string | null;
  actOrder: number | null;
  identityToken: string;
  token: string;
}
export interface LiteraryPassageInspection {
  inspectionId: string;
  originToken: string;
  chapterId: string;
  expectedScopeToken: string | null;
  chapterActId: string | null;
  state: 'scanning' | 'verifying' | 'publication' | 'ready' | 'stale' | 'canceled';
  revision: number;
  scanned: number;
  verified: number;
  previous: PassageInspectionChapter | null;
  previousActTail: PassageInspectionChapter | null;
  firstInAct: boolean | null;
  inventoryHash: string | null;
  publicationId: string | null;
  publicationMode: 'chapter' | 'act' | null;
  publicationChecked: number;
  publication: {
    mode: 'chapter' | 'act';
    scope: { kind: 'chapter' | 'act'; id: string };
    count: number;
    hash: string;
  } | null;
}
export interface PassageInspectionCommand {
  target: { kind: 'book'; id: string };
  inspectionId: string;
  expectedOriginToken: string;
  expectedRevision: number;
}
async function call<T>(method: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), method, {
      timeout: 120000,
    })(input)
  ).data;
}
/** Caller owns the ID before starting; an uncertain response is resolved by get.
 * Neither reconstruction nor get advances the cursor or retries a mutation.
 */
export interface StartPassageInspection {
  target: { kind: 'book'; id: string };
  inspectionId: string;
  chapterId: string;
  publicationId?: string;
  expectedScopeToken: string;
}
export const getLiteraryPassageInspectionScope = (bookId: string, chapterId: string) =>
  call<{ chapterId: string; scopeToken: string }>('getLiteraryPassageInspectionScope', {
    target: { kind: 'book', id: bookId },
    chapterId,
  });
export const cancelLiteraryPassageInspectionStart = (input: StartPassageInspection) =>
  call<
    | LiteraryPassageInspection
    | { inspectionId: string; state: 'canceled'; chapterId: string; expectedScopeToken: string }
  >('cancelLiteraryPassageInspection', input);
export const startLiteraryPassageInspection = (input: StartPassageInspection) =>
  call<LiteraryPassageInspection | { inspectionId: string; state: 'scanning'; revision: 0 }>(
    'startLiteraryPassageInspection',
    input,
  );
export const getLiteraryPassageInspection = (bookId: string, inspectionId: string) =>
  call<LiteraryPassageInspection>('getLiteraryPassageInspection', {
    target: { kind: 'book', id: bookId },
    inspectionId,
  });
export const advanceLiteraryPassageInspection = (input: PassageInspectionCommand) =>
  call<LiteraryPassageInspection>('advanceLiteraryPassageInspection', input);
export const cancelLiteraryPassageInspection = (input: PassageInspectionCommand) =>
  call<LiteraryPassageInspection>('cancelLiteraryPassageInspection', input);
