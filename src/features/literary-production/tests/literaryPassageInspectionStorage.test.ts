import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  readPassageInspectionIntent,
  reservePassageInspectionIntent,
  releasePassageInspectionIntent,
  markPassageInspectionCancellation,
} from '../services/literaryPassageInspectionStorage';

beforeEach(() => {
  localStorage.clear();
  let queue = Promise.resolve<unknown>(undefined);
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn((_name: string, action: () => unknown) => {
        const result = queue.then(action);
        queue = result.catch(() => undefined);
        return result;
      }),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

it('reserves only scoped IDs before any request, without a cursor, prose, key or approval', async () => {
  const intent = await reservePassageInspectionIntent(
    'author',
    'book',
    'chapter',
    'edition-1',
    'c'.repeat(64),
  );
  expect(readPassageInspectionIntent('author', 'book', 'chapter')).toEqual(intent);
  expect(Object.keys(intent).sort()).toEqual([
    'actorId',
    'bookId',
    'cancelRequested',
    'chapterId',
    'expectedScopeToken',
    'inspectionId',
    'publicationId',
    'version',
  ]);
  expect(readPassageInspectionIntent('other', 'book', 'chapter')).toBeNull();
  expect(readPassageInspectionIntent('author', 'other', 'chapter')).toBeNull();
  expect(readPassageInspectionIntent('author', 'book', 'other')).toBeNull();
});

it('a competing reservation cannot overwrite the uncertain original intent', async () => {
  const original = await reservePassageInspectionIntent(
    'author',
    'book',
    'chapter',
    null,
    'c'.repeat(64),
  );
  await expect(
    reservePassageInspectionIntent('author', 'book', 'chapter', 'other-edition', 'c'.repeat(64)),
  ).rejects.toThrow(/Consulte ou encerre/);
  expect(readPassageInspectionIntent('author', 'book', 'chapter')).toEqual(original);
});

it('removing an acknowledged intent compares the complete original and preserves a replacement', async () => {
  const original = await reservePassageInspectionIntent(
    'author',
    'book',
    'chapter',
    null,
    'c'.repeat(64),
  );
  const replacement = { ...original, inspectionId: 'other-inspection' };
  const key = localStorage.key(0)!;
  localStorage.setItem(key, JSON.stringify(replacement));
  await expect(releasePassageInspectionIntent(original)).rejects.toThrow(/mudou em outra janela/);
  expect(readPassageInspectionIntent('author', 'book', 'chapter')).toEqual(replacement);
  await releasePassageInspectionIntent(replacement);
  expect(readPassageInspectionIntent('author', 'book', 'chapter')).toBeNull();
});

it('malformed metadata and missing Web Locks cannot overwrite recovery state', async () => {
  await reservePassageInspectionIntent('author', 'book', 'chapter', null, 'c'.repeat(64));
  const key = localStorage.key(0)!;
  const broken = JSON.stringify({ version: 1, actorId: 'author', privateText: 'not allowed' });
  localStorage.setItem(key, broken);
  expect(() => readPassageInspectionIntent('author', 'book', 'chapter')).toThrow(/inválido/);
  await expect(
    reservePassageInspectionIntent('author', 'book', 'chapter', null, 'c'.repeat(64)),
  ).rejects.toThrow();
  expect(localStorage.getItem(key)).toBe(broken);
  vi.stubGlobal('navigator', {});
  await expect(
    reservePassageInspectionIntent('author', 'book', 'other', null, 'c'.repeat(64)),
  ).rejects.toThrow(/Web Locks/);
  expect(localStorage.length).toBe(1);
});

it('legacy ID-only metadata is preserved for observation and cannot be overwritten by a new scope', async () => {
  const original = await reservePassageInspectionIntent(
    'author',
    'book',
    'chapter',
    null,
    'c'.repeat(64),
  );
  const legacy: { version: number; expectedScopeToken?: string } = { ...original, version: 1 };
  delete legacy.expectedScopeToken;
  const key = localStorage.key(0)!;
  localStorage.setItem(key, JSON.stringify(legacy));
  expect(readPassageInspectionIntent('author', 'book', 'chapter')).toEqual(legacy);
  await expect(
    reservePassageInspectionIntent('author', 'book', 'chapter', null, 'd'.repeat(64)),
  ).rejects.toThrow(/Consulte ou encerre/);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(legacy);
});

it('cancellation is durable and monotonic and cannot be removed with the original pre-cancel intent', async () => {
  const original = await reservePassageInspectionIntent(
    'author',
    'book',
    'chapter',
    null,
    'c'.repeat(64),
  );
  const closing = await markPassageInspectionCancellation(original);
  expect(closing.cancelRequested).toBe(true);
  expect(readPassageInspectionIntent('author', 'book', 'chapter')?.cancelRequested).toBe(true);
  expect(await markPassageInspectionCancellation(original)).toEqual(closing);
  await expect(releasePassageInspectionIntent(original)).rejects.toThrow(/mudou em outra janela/);
  await expect(
    markPassageInspectionCancellation({ ...original, publicationId: 'other' }),
  ).rejects.toThrow(/mudou/);
  expect(readPassageInspectionIntent('author', 'book', 'chapter')).toEqual(closing);
});
