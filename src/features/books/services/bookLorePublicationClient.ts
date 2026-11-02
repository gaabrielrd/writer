import { getFunctions } from 'firebase/functions';
import { httpsDomainCallable as httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import {
  bookLoreReadSession,
  verifyBookLorePublicationCandidate,
  type BookLoreCollectionCapture,
} from '@/features/lore';
interface Stamp {
  seconds: number;
  nanoseconds: number;
}
export interface BookPublicationSource {
  schemaVersion: 1;
  bookId: string;
  bookToken: string;
  listToken: string;
  bookStamp: Stamp;
  updatedAt: number;
  status: 'draft' | 'published';
  privacyVersion: number;
  hasScenes: boolean;
  sceneRevision: number;
  universeId: string | null;
  universeToken: string | null;
  universeStamp: Stamp | null;
  universePublicationToken: string | null;
  universeLoreVersion: number | null;
  universePrivacyVersion: number | null;
}
interface SourceRead {
  source: Readonly<BookPublicationSource>;
  sourceToken: string;
}
export interface BookPublicationCapture extends SourceRead {
  collection: BookLoreCollectionCapture;
}
function invalid(): never {
  throw new Error('A origem da publicação está inválida ou mudou. Atualize e tente novamente.');
}
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    invalid();
  return value as Record<string, unknown>;
}
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uint = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function stamp(value: unknown): Stamp {
  const v = object(value, ['seconds', 'nanoseconds']);
  if (!uint(v.seconds) || !uint(v.nanoseconds) || v.nanoseconds >= 1e9) invalid();
  return Object.freeze({ seconds: v.seconds, nanoseconds: v.nanoseconds });
}
function sourceRead(value: unknown, bookId: string): SourceRead {
  const envelope = object(value, ['source', 'sourceToken']),
    s = object(envelope.source, [
      'schemaVersion',
      'bookId',
      'bookToken',
      'listToken',
      'bookStamp',
      'updatedAt',
      'status',
      'privacyVersion',
      'hasScenes',
      'sceneRevision',
      'universeId',
      'universeToken',
      'universeStamp',
      'universePublicationToken',
      'universeLoreVersion',
      'universePrivacyVersion',
    ]);
  if (
    s.schemaVersion !== 1 ||
    s.bookId !== bookId ||
    !hash(s.bookToken) ||
    !hash(s.listToken) ||
    !hash(envelope.sourceToken) ||
    !uint(s.updatedAt) ||
    !uint(s.privacyVersion) ||
    !uint(s.sceneRevision) ||
    !['draft', 'published'].includes(s.status as string) ||
    typeof s.hasScenes !== 'boolean'
  )
    invalid();
  if (s.universeId === null) {
    if (
      [
        'universeToken',
        'universeStamp',
        'universePublicationToken',
        'universeLoreVersion',
        'universePrivacyVersion',
      ].some((key) => s[key] !== null)
    )
      invalid();
  } else if (
    typeof s.universeId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(s.universeId) ||
    s.universeStamp === null ||
    !hash(s.universeToken) ||
    !hash(s.universePublicationToken) ||
    !uint(s.universeLoreVersion) ||
    !uint(s.universePrivacyVersion)
  )
    invalid();
  const source = {
    ...s,
    bookStamp: stamp(s.bookStamp),
    universeStamp: s.universeStamp === null ? null : stamp(s.universeStamp),
  } as unknown as BookPublicationSource;
  return Object.freeze({ source: Object.freeze(source), sourceToken: envelope.sourceToken });
}
/** One exact Auth object; C1 data and publication proof remain private in RAM. */
export function bookPublicationSession(bookId: string, expectedOwner: unknown) {
  const reader = bookLoreReadSession(() => true, { tokenVersion: 2 });
  if (typeof expectedOwner !== 'string' || reader.actor.uid !== expectedOwner) invalid();
  const rpc = async (name: string, data: unknown): Promise<unknown> => {
    reader.guard();
    const result = (
      await httpsCallable<unknown, unknown>(
        getFunctions(getFirebaseApp(), 'us-central1'),
        name,
      )(data)
    ).data;
    reader.guard();
    return result;
  };
  const read = async () => sourceRead(await rpc('getBookPublicationSource', { bookId }), bookId);
  const control = (capture: BookPublicationCapture, revisionId: string) => {
    reader.guard();
    if (capture.source.bookId !== bookId || capture.collection.bookId !== bookId) invalid();
    return { bookId, revisionId, source: capture.source, sourceToken: capture.sourceToken };
  };
  return {
    guard: reader.guard,
    async capture(): Promise<BookPublicationCapture> {
      const source = await read(),
        collection = await reader.captureCollection(bookId);
      if (collection.listToken !== source.source.listToken) invalid();
      return Object.freeze({ ...source, collection });
    },
    async verify(capture: BookPublicationCapture): Promise<void> {
      reader.guard();
      if (capture.collection.bookId !== bookId || capture.source.bookId !== bookId) invalid();
      await reader.verifyCollection(capture.collection);
      const latest = await read();
      if (latest.sourceToken !== capture.sourceToken) invalid();
      reader.guard();
    },
    async stage(
      capture: BookPublicationCapture,
      revisionId: string,
      loreId: string,
      aliases: readonly string[],
    ): Promise<void> {
      const entity = capture.collection.sources.find((source) => source.id === loreId);
      if (!entity) invalid();
      const { inspection, publication } = await verifyBookLorePublicationCandidate(
        {
          uid: reader.actor.uid,
          bookId,
          loreId,
          sourceToken: entity.sourceToken,
          data: entity.data,
        },
        (method, input) => rpc('bookLoreEdit', { method, input }),
        reader.guard,
      );
      const result = object(
        await rpc('stageBookPublicationLore', {
          inspection,
          publication,
          ...control(capture, revisionId),
          loreId,
          readToken: entity.sourceToken,
          aliases: [...aliases],
        }),
        ['bookId', 'revisionId', 'loreId', 'status'],
      );
      if (
        result.bookId !== bookId ||
        result.revisionId !== revisionId ||
        result.loreId !== loreId ||
        !['staged', 'already-staged'].includes(result.status as string)
      )
        invalid();
    },
    async finalize(
      capture: BookPublicationCapture,
      revisionId: string,
      authorName: string,
    ): Promise<void> {
      const result = object(
        await rpc('finalizeBookPublication', { ...control(capture, revisionId), authorName }),
        ['bookId', 'revisionId', 'publishedAt', 'status'],
      );
      if (
        result.bookId !== bookId ||
        result.revisionId !== revisionId ||
        !uint(result.publishedAt) ||
        !['published', 'already-published'].includes(result.status as string)
      )
        invalid();
    },
  };
}
