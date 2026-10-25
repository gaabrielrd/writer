// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { visibilityFixture, finishVisibility } from './bookLoreVisibilitySelectionHarness.mjs';
import { bookLoreVisibilitySelectionSession } from '../services/bookLoreVisibilitySelectionService.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { createBookLoreEditTransportService } from '../../../../functions/src/bookLoreEditTransport.mjs';
import { createBookLoreEditOutcomeService } from '../../../../functions/src/bookLoreEditOutcome.mjs';
import { createBookLoreWriteRecoveryService } from '../../../../functions/src/bookLoreWriteRecovery.mjs';
const s = vi.hoisted(() => ({
  auth: { currentUser: null },
  callable: vi.fn(),
  calls: [],
  recovery: null,
}));
vi.mock('@/shared/lib', () => ({
  auth: s.auth,
  getFirebaseApp: () => ({ app: 'writer-fixture' }),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({ region: 'us-central1' }),
  httpsCallable: s.callable,
}));
vi.mock('../services/bookLoreRecoveryKeyClient', () => ({
  bookLoreRecoveryKeySession(identity, isCurrent) {
    const actor = s.auth.currentUser;
    const guard = () => {
      if (s.auth.currentUser !== actor || !isCurrent()) throw Error('key actor changed');
    };
    return {
      identity,
      guard,
      async getKey() {
        guard();
        const data = await s.recovery.getBookLoreEditRecoveryKey(identity.uid, {
            writeId: identity.writeId,
            requestHash: identity.requestHash,
            jobToken: identity.jobToken,
          }),
          raw = Uint8Array.from(Buffer.from(data.keyBase64, 'base64')),
          key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
        raw.fill(0);
        guard();
        return { identity, key };
      },
    };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  s.auth.currentUser = { uid: 'author' };
  s.calls = [];
});
afterEach(() => vi.unstubAllGlobals());
async function setup(options) {
  const f = await visibilityFixture(options),
    read = createBookLoreReadService({ db: f.db }),
    edit = createBookLoreEditTransportService({ db: f.db, now: () => 8000 }),
    proof = createBookLoreEditOutcomeService({ db: f.db });
  s.recovery = createBookLoreWriteRecoveryService({ db: f.db, now: () => 8000 });
  s.callable.mockImplementation((_functions, method) => async (data) => {
    s.calls.push({ method, data: structuredClone(data) });
    let result;
    if (method === 'bookLoreEdit') result = await edit.bookLoreEdit(s.auth.currentUser.uid, data);
    else if (method === 'bookLoreEditOutcome')
      result = await proof.bookLoreEditOutcome(s.auth.currentUser.uid, data);
    else if (method in read) result = await read[method](s.auth.currentUser.uid, data);
    else result = await s.recovery[method](s.auth.currentUser.uid, data);
    return { data: result };
  });
  return f;
}
it('Auth forces UID and persists/discovers/resumes a selection without SDK calls or prose', async () => {
  const f = await setup({ count: 2 }),
    session = bookLoreVisibilitySelectionSession(),
    op = await session.createSelection({ ...f.input, uid: 'other' });
  expect(op.snapshot().identity.uid).toBe('author');
  expect((await session.recoveries()).items).toHaveLength(1);
  expect((await session.resumeSelection('book', f.input.selectionId)).snapshot().count).toBe(2);
  expect(s.calls).toHaveLength(0);
  expect(JSON.stringify(f.parent.rows())).not.toContain('NATIVE_PRIVATE');
});
it('actual session composes the v2 reader, protected manual child, metadata gates and original outcome callable', async () => {
  const f = await setup({ count: 2, publics: [false, true] }),
    session = bookLoreVisibilitySelectionSession(),
    op = await session.createSelection(f.input);
  await finishVisibility(op);
  expect(op.snapshot()).toMatchObject({
    phase: 'complete',
    recordedApplied: 1,
    recordedUnchanged: 1,
  });
  expect(s.calls.some((c) => c.method === 'getBookLoreRead' && c.data.tokenVersion === 2)).toBe(
    true,
  );
  expect(
    s.calls.some(
      (c) => c.method === 'bookLoreEdit' && c.data.method === 'adoptBookLoreEditGeneration',
    ),
  ).toBe(true);
  expect(s.calls.some((c) => c.method === 'bookLoreEditOutcome')).toBe(true);
  expect(s.calls.filter((c) => c.method === 'bookLoreEdit').every((c) => !('uid' in c.data))).toBe(
    true,
  );
});
it('different book and account cannot adopt another durable selection', async () => {
  const f = await setup({ count: 1 }),
    session = bookLoreVisibilitySelectionSession();
  await session.createSelection(f.input);
  await expect(session.resumeSelection('other', f.input.selectionId)).rejects.toThrow();
  s.auth.currentUser = { uid: 'other' };
  const other = bookLoreVisibilitySelectionSession();
  expect((await other.recoveries()).items).toHaveLength(0);
  await expect(other.resumeSelection('book', f.input.selectionId)).rejects.toThrow();
  expect(s.calls).toHaveLength(0);
});
it('profile updates preserve actor while same-UID replacement and host revocation stop old handles', async () => {
  const f = await setup({ count: 1 });
  let current = true;
  const session = bookLoreVisibilitySelectionSession(() => current),
    op = await session.createSelection(f.input);
  s.auth.currentUser.displayName = 'Profile';
  expect((await session.recoveries()).items).toHaveLength(1);
  s.auth.currentUser = { uid: 'author' };
  await expect(op.advance()).rejects.toThrow('contexto mudou');
  const fresh = bookLoreVisibilitySelectionSession(() => current);
  current = false;
  await expect(fresh.resumeSelection('book', f.input.selectionId)).rejects.toThrow(
    'contexto mudou',
  );
  expect(s.calls).toHaveLength(0);
});
it('storage failure blocks all readers, recovery grants and child production without an unprotected fallback', async () => {
  const f = await setup({ count: 1 });
  f.parent.abortNext();
  await expect(bookLoreVisibilitySelectionSession().createSelection(f.input)).rejects.toThrow();
  expect(s.calls).toHaveLength(0);
  expect(f.parent.rows()).toHaveLength(0);
});

it('review uses the actor-bound v2 reader and full literal sources without child or key production', async () => {
  const f = await setup({ count: 2, publics: [false, true] }),
    session = bookLoreVisibilitySelectionSession(),
    op = await session.createSelection(f.input);
  const result = await session.review(op);
  expect(result.members.map((m) => [m.name, m.currentValue])).toEqual([
    ['Literal 🌙 0', false],
    ['Literal 🌙 1', true],
  ]);
  expect(
    s.calls
      .filter((c) => c.method === 'getBookLoreRead')
      .every(
        (c) =>
          c.data.tokenVersion === 2 ||
          c.data.readToken === f.input.members.find((m) => m.loreId === c.data.id)?.sourceToken,
      ),
  ).toBe(true);
  expect(
    s.calls.every((c) =>
      [
        'getBookLoreRead',
        'readBookLoreFieldPage',
        'readBookLorePart',
        'readBookLoreRelationPage',
      ].includes(c.method),
    ),
  ).toBe(true);
  expect(JSON.stringify(f.parent.rows())).not.toContain('Literal');
});
