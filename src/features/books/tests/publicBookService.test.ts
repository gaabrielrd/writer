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
    expect(subscribePublicBook('book', changed, failed)).toBe(unsubscribe);
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
