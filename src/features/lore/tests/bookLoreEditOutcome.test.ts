// @vitest-environment node
import { expect, it, vi } from 'vitest';
import {
  createBookLoreEditOutcomeClient,
  type BookLoreEditOutcomeRequest,
} from '../services/bookLoreEditOutcome';
import { loreControlJobId } from '../services/bookLoreControlContracts';
import { nativeEditOutcomeFixture } from './bookLoreEditOutcomeHarness.mjs';

function request(): BookLoreEditOutcomeRequest {
  const i = { writeId: 'manual-write', bookId: 'book', loreId: 'entity' };
  return {
    ...i,
    editId: loreControlJobId({ uid: 'author', ...i }, 'lore-edit'),
    startHash: 'a'.repeat(64),
    sourceToken: 'b'.repeat(64),
  };
}
function result(r = request()) {
  return {
    schemaVersion: 1,
    ...r,
    jobToken: 'c'.repeat(64),
    phase: 'adopted',
    applied: true,
    changedFields: ['isPublic'],
    relationsChanged: false,
    adoption: {
      operationId: 'original-apply',
      timestamp: 1000,
      localLoreVersion: 1,
      publicationPrivacyVersion: 1,
      revoked: true,
      storageHash: 'd'.repeat(64),
      privacy: { before: { present: true, value: true }, after: { present: true, value: false } },
    },
    outcomeToken: 'e'.repeat(64),
  };
}
it('checks real native original adoption with the same client identity and exact read-only request', async () => {
  const f = await nativeEditOutcomeFixture(request()),
    call = vi.fn(f.call),
    client = createBookLoreEditOutcomeClient('author', call),
    input = f.input,
    first = await client(input);
  expect(first?.applied).toBe(true);
  expect(first?.changedFields).toEqual(['isPublic']);
  expect(call).toHaveBeenCalledExactlyOnceWith('bookLoreEditOutcome', input);
  expect(f.writes()).toEqual([]);
  expect(
    await client({ ...input, jobToken: first!.jobToken!, outcomeToken: first!.outcomeToken! }),
  ).toEqual(first);
});
it('returns unpinned absence without retry or fabricated success', async () => {
  const call = vi.fn(() => Promise.resolve(null));
  expect(await createBookLoreEditOutcomeClient('author', call)(request())).toBeNull();
  expect(call).toHaveBeenCalledTimes(1);
});
it.each(['jobToken', 'outcomeToken'] as const)('refuses absence after pinning %s', async (key) => {
  const call = vi.fn(() => Promise.resolve(null));
  await expect(
    createBookLoreEditOutcomeClient(
      'author',
      call,
    )({
      ...request(),
      [key]: 'f'.repeat(64),
    }),
  ).rejects.toThrow();
  expect(call).toHaveBeenCalledTimes(1);
});
const corruptions: [string, (v: ReturnType<typeof result>) => void][] = [
  [
    'scope',
    (v) => {
      v.bookId = 'other';
    },
  ],
  [
    'source',
    (v) => {
      v.sourceToken = 'f'.repeat(64);
    },
  ],
  [
    'edit',
    (v) => {
      v.editId = 'other';
    },
  ],
  [
    'unknown field',
    (v) => {
      v.changedFields = ['bodyId'];
    },
  ],
  [
    'duplicate field',
    (v) => {
      v.changedFields = ['isPublic', 'isPublic'];
    },
  ],
  [
    'false phase',
    (v) => {
      v.phase = 'preparing';
    },
  ],
  [
    'missing token',
    (v) => {
      v.outcomeToken = '';
    },
  ],
  [
    'wrong job',
    (v) => {
      v.jobToken = 'f'.repeat(64);
    },
  ],
  [
    'malformed hash',
    (v) => {
      v.adoption.storageHash = 'private';
    },
  ],
  [
    'invalid consent',
    (v) => {
      v.adoption.privacy.before.value = false;
    },
  ],
  [
    'unexpected private field',
    (v) => {
      Object.assign(v, { text: 'PRIVATE' });
    },
  ],
  [
    'unexpected storage pointer',
    (v) => {
      Object.assign(v.adoption, { storage: {} });
    },
  ],
  [
    'empty adoption',
    (v) => {
      v.changedFields = [];
    },
  ],
  [
    'invalid timestamp',
    (v) => {
      v.adoption.timestamp = Number.MAX_SAFE_INTEGER;
    },
  ],
  [
    'invalid local version',
    (v) => {
      v.adoption.localLoreVersion = 0;
    },
  ],
];
it.each(corruptions)('refuses malformed or mismatched metadata: %s', async (_label, change) => {
  const value = result();
  change(value);
  await expect(
    createBookLoreEditOutcomeClient('author', () => Promise.resolve(value))({
      ...request(),
      jobToken: 'c'.repeat(64),
    }),
  ).rejects.toThrow();
});
it('compares a pinned outcome token rather than accepting a newer acknowledgement', async () => {
  await expect(
    createBookLoreEditOutcomeClient('author', () => Promise.resolve(result()))({
      ...request(),
      outcomeToken: 'f'.repeat(64),
    }),
  ).rejects.toThrow();
});
it('rejects request spoofing before I/O', async () => {
  const call = vi.fn(() => Promise.resolve(result())),
    client = createBookLoreEditOutcomeClient('author', call);
  await expect(client({ ...request(), bookId: 'other' })).rejects.toThrow();
  await expect(client(Object.assign(request(), { uid: 'other' }))).rejects.toThrow();
  expect(call).not.toHaveBeenCalled();
});
it('freezes the original request while an answer is pending', async () => {
  const r = request();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    call = vi.fn(async (_method: string, wire: unknown) => {
      await held;
      return result(wire as BookLoreEditOutcomeRequest);
    }),
    client = createBookLoreEditOutcomeClient('author', call),
    pending = client(r);
  r.sourceToken = 'f'.repeat(64);
  release();
  expect((await pending)?.sourceToken).toBe('b'.repeat(64));
  expect(Object.isFrozen(call.mock.calls[0]![1])).toBe(true);
});
it('guard before/after and errors do not trigger fallback or another call', async () => {
  const call = vi.fn(() => Promise.resolve(result())),
    guard = vi.fn<() => void>(() => {
      throw Error('changed');
    });
  await expect(createBookLoreEditOutcomeClient('author', call, guard)(request())).rejects.toThrow(
    'changed',
  );
  expect(call).not.toHaveBeenCalled();
  guard
    .mockImplementationOnce(() => {})
    .mockImplementation(() => {
      throw Error('changed after');
    });
  await expect(createBookLoreEditOutcomeClient('author', call, guard)(request())).rejects.toThrow(
    'changed after',
  );
  expect(call).toHaveBeenCalledTimes(1);
  call.mockRejectedValueOnce(Error('lost reply'));
  await expect(createBookLoreEditOutcomeClient('author', call)(request())).rejects.toThrow(
    'lost reply',
  );
  expect(call).toHaveBeenCalledTimes(2);
});
it.each(['preparing', 'cancelling', 'cancelled'])(
  'pending %s is never a success',
  async (phase) => {
    const value = { ...result(), phase, applied: false, outcomeToken: null, adoption: null };
    const outcome = await createBookLoreEditOutcomeClient('author', () => Promise.resolve(value))(
      request(),
    );
    expect(outcome?.applied).toBe(false);
    expect(outcome?.outcomeToken).toBeNull();
  },
);
