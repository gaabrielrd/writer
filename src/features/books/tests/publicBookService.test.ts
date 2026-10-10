import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from 'firebase/firestore';
import {
  copyPublicReadingLink,
  getPublicBook,
  getPublicBookContent,
  isPublicBookUnavailable,
  publicReadingPath,
  publicReadingUrl,
  subscribePublicBook,
} from '../services/publicBookService';

vi.mock('@/shared/lib', async () => ({
  ...(await vi.importActual<typeof import('@/shared/lib/sanitizeRichText')>(
    '@/shared/lib/sanitizeRichText',
  )),
  firestore: {},
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
  getDocFromServer: vi.fn(),
  getDocsFromServer: vi.fn(),
  onSnapshot: vi.fn(),
}));
const book = {
  id: 'book',
  title: 'Obra',
  authorName: 'Autora',
  revisionId: 'rev1',
  publishedAt: 100,
};
const snapshot = (data: Record<string, unknown>, id = 'book') =>
  ({
    id,
    exists: () => true,
    data: () => data,
    metadata: { fromCache: false },
  }) as unknown as db.DocumentSnapshot;
const querySnapshot = (docs: Array<{ id: string; data: () => Record<string, unknown> }>) =>
  ({ docs }) as unknown as db.QuerySnapshot;

describe('publicBookService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('reads the public root from the server and allowlists metadata, never author UIDs or private keys', async () => {
    vi.mocked(db.getDocFromServer).mockResolvedValue(
      snapshot({
        ...book,
        schemaVersion: 1,
        authorId: 'private-user',
        apiKey: 'secret',
        details: 'secret',
      }),
    );
    expect(await getPublicBook('book')).toEqual(book);
    expect(db.doc).toHaveBeenCalledWith({}, 'publicBooks', 'book');
  });
  it('makes missing, revoked and malformed publications uniformly unavailable', async () => {
    vi.mocked(db.getDocFromServer)
      .mockResolvedValueOnce({ exists: () => false } as db.DocumentSnapshot)
      .mockRejectedValueOnce({ code: 'permission-denied' })
      .mockResolvedValueOnce(snapshot({ title: 'draft' }))
      .mockResolvedValueOnce(snapshot({ ...book, schemaVersion: 1, revisionId: 'bad/path' }));
    for (let index = 0; index < 4; index += 1) expect(await getPublicBook('book')).toBeNull();
    expect(isPublicBookUnavailable({ code: 'firestore/not-found' })).toBe(true);
    expect(isPublicBookUnavailable(new Error('offline'))).toBe(false);
    vi.mocked(db.getDocFromServer).mockRejectedValueOnce(new Error('offline'));
    await expect(getPublicBook('book')).rejects.toThrow('offline');
  });
  it('reads only the active revision and strips unknown fields while sorting and sanitizing chapters', async () => {
    vi.mocked(db.getDocsFromServer)
      .mockResolvedValueOnce(
        querySnapshot([
          {
            id: 'two',
            data: () => ({
              title: 'Second',
              order: 2,
              content: '<p data-lore-id="private">Hero<img src="tracker"></p>',
              authorId: 'secret',
            }),
          },
          {
            id: 'one',
            data: () => ({ title: 'First', order: 1, content: '**Start**', details: 'secret' }),
          },
        ]),
      )
      .mockResolvedValueOnce(
        querySnapshot([
          {
            id: 'hero',
            data: () => ({
              name: 'Hero',
              aliases: ['H', 42],
              category: 'character',
              summary: 'Safe',
              details: 'SECRET',
              relations: ['secret'],
              authorId: 'UID',
            }),
          },
          {
            id: 'private',
            data: () => ({
              name: 'Spoiler',
              category: 'other',
              summary: 'hidden',
              isPublic: false,
            }),
          },
          {
            id: 'invalid',
            data: () => ({ name: 'Invalid', category: 'alien', summary: 'hidden' }),
          },
        ]),
      );
    expect(await getPublicBookContent(book)).toEqual({
      chapters: [
        { id: 'one', title: 'First', order: 1, content: '<p><strong>Start</strong></p>' },
        { id: 'two', title: 'Second', order: 2, content: '<p>Hero</p>' },
      ],
      lore: [
        {
          id: 'hero',
          name: 'Hero',
          aliases: ['H'],
          category: 'character',
          summary: 'Safe',
          isPublic: true,
        },
      ],
    });
    expect(db.collection).toHaveBeenCalledWith(
      {},
      'publicBooks',
      'book',
      'revisions',
      'rev1',
      'chapters',
    );
    expect(db.collection).toHaveBeenCalledWith(
      {},
      'publicBooks',
      'book',
      'revisions',
      'rev1',
      'lore',
    );
  });
  it('rejects malformed chapter data rather than displaying an incomplete publication', async () => {
    vi.mocked(db.getDocsFromServer)
      .mockResolvedValueOnce(
        querySnapshot([
          { id: 'bad', data: () => ({ title: 'Bad', order: 'wrong', content: 'text' }) },
        ]),
      )
      .mockResolvedValueOnce(querySnapshot([]));
    await expect(getPublicBookContent(book)).rejects.toThrow('Publicação inválida');
  });
  it('observes revocation, ignores cache and forwards recoverable errors', () => {
    const changed = vi.fn();
    const failed = vi.fn();
    const unsubscribe = vi.fn();
    vi.mocked(db.onSnapshot).mockReturnValue(unsubscribe);
    const stop = subscribePublicBook('book', changed, failed);
    const args = vi.mocked(db.onSnapshot).mock.calls[0] as unknown as [
      unknown,
      unknown,
      (doc: db.DocumentSnapshot) => void,
      (error: unknown) => void,
    ];
    args[2]({
      ...snapshot({ ...book, schemaVersion: 1 }),
      metadata: { fromCache: true },
    } as db.DocumentSnapshot);
    expect(changed).not.toHaveBeenCalled();
    args[2](snapshot({ ...book, schemaVersion: 1 }));
    expect(changed).toHaveBeenLastCalledWith(book);
    args[3]({ code: 'permission-denied' });
    expect(changed).toHaveBeenLastCalledWith(null);
    args[3]({ code: 'unavailable' });
    expect(failed).toHaveBeenCalledWith({ code: 'unavailable' });
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('creates encoded chapter links and exposes clipboard failures', async () => {
    expect(publicReadingPath('a b', 'c d')).toBe('/read/a%20b?chapter=c%20d');
    expect(publicReadingPath('a')).toBe('/read/a');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await copyPublicReadingLink('book', 'chapter');
    expect(writeText).toHaveBeenCalledWith(publicReadingUrl('book', 'chapter'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    await expect(copyPublicReadingLink('book')).rejects.toThrow('Clipboard indisponível');
  });
});

it('verifica a versão pública do universo mesmo em uma leitura autenticada', async () => {
  const globalRoot = { ...book, schemaVersion: 2, universeId: 'world', universePrivacyVersion: 2 };
  vi.mocked(db.getDocFromServer)
    .mockResolvedValueOnce(snapshot(globalRoot))
    .mockResolvedValueOnce(snapshot({ version: 2, active: true }));
  expect(await getPublicBook('book')).toEqual({
    ...book,
    universeId: 'world',
    universePrivacyVersion: 2,
  });
  vi.mocked(db.getDocFromServer)
    .mockResolvedValueOnce(snapshot(globalRoot))
    .mockResolvedValueOnce(snapshot({ version: 3, active: true }));
  expect(await getPublicBook('book')).toBeNull();
  vi.mocked(db.getDocFromServer).mockResolvedValueOnce(
    snapshot({ ...globalRoot, universeId: 'bad/id' }),
  );
  expect(await getPublicBook('book')).toBeNull();
});
it('retira conteúdo exibido quando o universo é revogado e limpa ambas as assinaturas', () => {
  vi.clearAllMocks();
  const changed = vi.fn();
  const failed = vi.fn();
  const rootStop = vi.fn();
  const privacyStop = vi.fn();
  vi.mocked(db.onSnapshot).mockReturnValueOnce(rootStop).mockReturnValueOnce(privacyStop);
  const stop = subscribePublicBook('book', changed, failed);
  type Listener = [
    unknown,
    unknown,
    (snapshot: db.DocumentSnapshot) => void,
    (error: unknown) => void,
  ];
  const rootArgs = vi.mocked(db.onSnapshot).mock.calls[0] as unknown as Listener;
  const globalRoot = { ...book, schemaVersion: 2, universeId: 'world', universePrivacyVersion: 2 };
  rootArgs[2](snapshot(globalRoot));
  const privacyArgs = vi.mocked(db.onSnapshot).mock.calls[1] as unknown as Listener;
  privacyArgs[2]({
    ...snapshot({ version: 2, active: true }),
    metadata: { fromCache: true },
  } as db.DocumentSnapshot);
  expect(changed).not.toHaveBeenCalled();
  privacyArgs[2](snapshot({ version: 2, active: true }));
  expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ universeId: 'world' }));
  privacyArgs[2](snapshot({ version: 3, active: true }));
  expect(changed).toHaveBeenLastCalledWith(null);
  privacyArgs[3]({ code: 'unavailable' });
  expect(failed).toHaveBeenCalled();
  stop();
  expect(rootStop).toHaveBeenCalledOnce();
  expect(privacyStop).toHaveBeenCalledOnce();
  const calls = changed.mock.calls.length;
  privacyArgs[2](snapshot({ version: 2, active: true }));
  rootArgs[2](snapshot(globalRoot));
  expect(changed).toHaveBeenCalledTimes(calls);
});
it('ignora sinal de privacidade atrasado de uma revisão substituída', () => {
  vi.clearAllMocks();
  const changed = vi.fn();
  const failed = vi.fn();
  const stopped = vi.fn();
  vi.mocked(db.onSnapshot).mockReturnValue(stopped);
  const stop = subscribePublicBook('book', changed, failed);
  type Listener = [
    unknown,
    unknown,
    (snapshot: db.DocumentSnapshot) => void,
    (error: unknown) => void,
  ];
  const rootArgs = vi.mocked(db.onSnapshot).mock.calls[0] as unknown as Listener;
  rootArgs[2](
    snapshot({ ...book, schemaVersion: 2, universeId: 'old', universePrivacyVersion: 0 }),
  );
  const oldArgs = vi.mocked(db.onSnapshot).mock.calls[1] as unknown as Listener;
  rootArgs[2](
    snapshot({
      ...book,
      revisionId: 'new',
      schemaVersion: 2,
      universeId: 'new',
      universePrivacyVersion: 1,
    }),
  );
  const newArgs = vi.mocked(db.onSnapshot).mock.calls[2] as unknown as Listener;
  oldArgs[2](snapshot({ version: 0, active: true }));
  expect(changed).not.toHaveBeenCalled();
  newArgs[2](snapshot({ version: 1, active: true }));
  expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ universeId: 'new' }));
  newArgs[3]({ code: 'permission-denied' });
  expect(changed).toHaveBeenLastCalledWith(null);
  rootArgs[2]({ exists: () => false, metadata: { fromCache: false } } as db.DocumentSnapshot);
  stop();
});
