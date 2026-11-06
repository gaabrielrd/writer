import { getFunctions, httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import {
  normalizeLiteraryWritingSnapshot,
  type LiteraryWritingSnapshot,
} from '../../../../functions/src/literaryWritingProtocol.mjs';
export type { LiteraryWritingSnapshot } from '../../../../functions/src/literaryWritingProtocol.mjs';
export async function getLiteraryWritingContext(input: {
  target: { kind: 'book'; id: string };
  resource: { kind: 'chapter' | 'scene'; id: string };
  planIds?: string[];
  mode?: 'chat' | 'autocomplete';
}): Promise<LiteraryWritingSnapshot | null> {
  const result = (
    await httpsCallable<unknown, unknown>(
      getFunctions(getFirebaseApp(), 'us-central1'),
      'getLiteraryWritingContext',
    )(input)
  ).data;
  return result === null ? null : normalizeLiteraryWritingSnapshot(result);
}
