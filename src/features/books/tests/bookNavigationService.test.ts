import { describe, expect, it, vi } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import { watchBookTitle } from '../services/bookNavigationService';
vi.mock('@/shared/lib', () => ({ firestore: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), onSnapshot: vi.fn() }));
describe('book title subscription', () => {
  it('reveals only the current author title and clears errors, missing and deleting books', () => {
    const notify = vi.fn();
    const stop = vi.fn();
    let success!: (snapshot: { data: () => object | undefined }) => void;
    let failure!: () => void;
    vi.mocked(onSnapshot).mockImplementation(((
      _ref: unknown,
      next: typeof success,
      error: () => void,
    ) => {
      success = next;
      failure = error;
      return stop;
    }) as unknown as typeof onSnapshot);
    expect(watchBookTitle('book', 'author', notify)).toBe(stop);
    for (const data of [
      undefined,
      { authorId: 'other', title: 'Privado' },
      { authorId: 'author', title: 'Excluindo', deleting: true },
      { authorId: 'author', title: 'Atlas' },
      { authorId: 'author' },
    ])
      success({ data: () => data });
    failure();
    expect(notify.mock.calls).toEqual([[''], [''], [''], ['Atlas'], [''], ['']]);
  });
});
