// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { prepareBookLoreCreationOperation } from '../services/bookLoreCreationOperation.ts';
import { creationFixture } from '../../../../functions/test/helpers/bookLoreCreationFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from '../../../../functions/test/helpers/bookLoreCreationAdoptionFixture.mjs';
import {
  creationClientFixture,
  creationReady,
  creationCancelled,
  creationRecovery,
  restoreCreation,
  creationData,
} from './bookLoreCreationHarness.mjs';

it('creates literal native lore only after explicit apply and leaves existing lore intact', async () => {
  const f = await creationClientFixture(),
    original = structuredClone(f.records.get('books/book/lore/original'));
  expect(f.calls).toHaveLength(0);
  await creationReady(f);
  const id = f.operation.snapshot().loreId;
  expect(f.records.has('books/book/lore/' + id)).toBe(false);
  expect(f.records.get('books/book').localLoreVersion).toBe(0);
  expect(JSON.stringify(f.operation.snapshot())).not.toContain('Literal');
  expect((await f.operation.apply()).phase).toBe('applied');
  const created = await f.client.get('book', id);
  expect(created.data).toEqual({ ...creationData(), createdAt: 8000, updatedAt: 8000 });
  expect(f.records.get('books/book').localLoreVersion).toBe(1);
  expect(f.records.get('books/book/lore/original')).toEqual(original);
  const before = structuredClone([...f.records]),
    calls = f.calls.length;
  await f.operation.apply();
  await f.operation.advance();
  f.operation.requestCancel();
  expect([...f.records]).toEqual(before);
  expect(f.calls).toHaveLength(calls);
});

it('restores a ready checkpoint without RPC and waits for explicit apply', async () => {
  const f = await creationClientFixture();
  await creationReady(f);
  const recovery = creationRecovery(f.operation),
    before = f.calls.length,
    s = f.operation.snapshot();
  await restoreCreation(f, recovery);
  expect(f.operation.snapshot()).toEqual(s);
  await f.operation.advance();
  expect(f.calls).toHaveLength(before);
  expect((await f.operation.apply()).phase).toBe('applied');
});

it('cancel before reservation creates a permanent fence without a head or clock mutation', async () => {
  const f = await creationClientFixture();
  expect((await creationCancelled(f)).phase).toBe('cancelled');
  expect(f.records.has('books/book/lore/' + f.operation.snapshot().loreId)).toBe(false);
  expect(f.records.get('books/book').localLoreVersion).toBe(0);
  const snapshot = f.operation.snapshot(),
    before = f.calls.length;
  await restoreCreation(f);
  expect(f.operation.snapshot()).toEqual(snapshot);
  await f.operation.advance();
  expect(f.calls).toHaveLength(before);
});

it.each([
  'startBookLoreCreationReservation',
  'appendBookLoreFieldUpload',
  'reserveBookLoreEditUpload',
  'advanceBookLoreEditCompilation',
])(
  'replays exact uncertain wire after a fresh coordinator: %s',
  async (method) => {
    const f = await creationClientFixture({
      data: { ...creationData(), details: '\ufeff' + 'literal 🌙\r\n'.repeat(7000) },
    });
    let dropped = false,
      saved;
    f.intercept(async (name, input, invoke) => {
      if (name === method && !dropped) {
        dropped = true;
        saved = creationRecovery(f.operation);
        await invoke();
        throw Error('Lost reply');
      }
      return invoke();
    });
    while (!dropped) {
      try {
        await f.operation.advance();
      } catch (e) {
        expect(e.message).toBe('Lost reply');
      }
    }
    const wire = structuredClone(f.calls.at(-1)),
      before = f.calls.length;
    await restoreCreation(f, saved);
    expect(f.calls).toHaveLength(before);
    await f.operation.advance();
    expect(f.calls.at(-1)).toEqual(wire);
    await creationReady(f);
    expect((await f.operation.apply()).phase).toBe('applied');
    expect(f.records.get('books/book').localLoreVersion).toBe(1);
  },
  30000,
);

it('uncertain apply restores ready without automatic resend; explicit apply confirms exactly once', async () => {
  const f = await creationClientFixture();
  await creationReady(f);
  let saved;
  f.intercept(async (method, input, invoke) => {
    const result = await invoke();
    if (method === 'adoptBookLoreEditGeneration' && !saved) {
      saved = creationRecovery(f.operation);
      throw Error('Lost apply');
    }
    return result;
  });
  await expect(f.operation.apply()).rejects.toThrow('Lost apply');
  const wire = structuredClone(f.calls.at(-1));
  await restoreCreation(f, saved);
  const count = f.calls.length;
  await f.operation.advance();
  expect(f.calls).toHaveLength(count);
  expect((await f.operation.apply()).phase).toBe('applied');
  expect(f.calls.at(-1)).toEqual(wire);
  expect(f.records.get('books/book').localLoreVersion).toBe(1);
});

it.each(['uploading', 'ready'])(
  'native parent cleanup cancels %s and survives a fresh coordinator',
  async (stage) => {
    const f = await creationClientFixture();
    if (stage === 'ready') await creationReady(f);
    else {
      await f.operation.advance();
      await f.operation.advance();
      await f.operation.advance();
    }
    f.operation.requestCancel();
    await f.operation.advance();
    const saved = creationRecovery(f.operation);
    await restoreCreation(f, saved, { signal: AbortSignal.abort() });
    expect((await creationCancelled(f)).phase).toBe('cancelled');
    expect(f.records.has('books/book/lore/' + f.operation.snapshot().loreId)).toBe(false);
    expect(f.records.get('books/book').localLoreVersion).toBe(0);
    const bodies = [...f.records].filter(([path]) => /\/bookResource(Bodies|Chunks)\//.test(path));
    expect(bodies).toEqual([]);
  },
);

it('cancel does not wait for a held reserve and ignores its late producer response', async () => {
  const f = await creationClientFixture();
  let release, entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  f.intercept(async (method, input, invoke) => {
    if (method === 'startBookLoreCreationReservation') {
      const result = await invoke();
      entered();
      return new Promise((resolve) => {
        release = () => resolve(result);
      });
    }
    return invoke();
  });
  const pending = f.operation.advance();
  await started;
  expect((await creationCancelled(f)).phase).toBe('cancelled');
  const before = f.operation.snapshot();
  release();
  await pending;
  expect(f.operation.snapshot()).toEqual(before);
});

it('cancel reconciles its own adoption after apply reply is lost without resending prose', async () => {
  const f = await creationClientFixture();
  await creationReady(f);
  f.intercept(async (method, input, invoke) => {
    const result = await invoke();
    if (method === 'adoptBookLoreEditGeneration') throw Error('Lost reply');
    return result;
  });
  await expect(f.operation.apply()).rejects.toThrow('Lost reply');
  const count = f.calls.length;
  expect((await creationCancelled(f)).phase).toBe('applied');
  expect(
    f.calls
      .slice(count)
      .every(
        (c) => !['appendBookLoreFieldUpload', 'adoptBookLoreEditGeneration'].includes(c.method),
      ),
  ).toBe(true);
  expect(f.records.get('books/book').localLoreVersion).toBe(1);
});

it('requires literal required fields even when empty/default, preserving optional absence and empty values', async () => {
  const data = {
    name: '',
    category: 'other',
    summary: '',
    aliases: [],
    relations: [],
    isPublic: false,
  };
  const f = await creationClientFixture({ data });
  await creationReady(f);
  await f.operation.apply();
  expect((await f.client.get('book', f.operation.snapshot().loreId)).data).toEqual({
    ...data,
    createdAt: 8000,
    updatedAt: 8000,
  });
});

it('restores an applied event without any RPC or duplicate creation', async () => {
  const f = await creationClientFixture();
  await creationReady(f);
  await f.operation.apply();
  const before = structuredClone([...f.records]),
    count = f.calls.length;
  await restoreCreation(f);
  await f.operation.apply();
  await f.operation.advance();
  expect(f.calls).toHaveLength(count);
  expect([...f.records]).toEqual(before);
});

it('supports a field above 8 MiB and 128 parts, with no legacy summary cap', async () => {
  const data = {
    name: 'Large',
    category: 'other',
    summary: '  ' + 's'.repeat(500) + '\r\n',
    details: '\ufeff' + 'x'.repeat(8 * 1024 * 1024 + 100) + ' 🌙\r\n  ',
  };
  const f = await creationClientFixture({ data });
  await creationReady(f);
  expect(f.calls.filter((c) => c.method === 'appendBookLoreFieldUpload').length).toBeGreaterThan(
    128,
  );
  await f.operation.apply();
  expect((await f.client.get('book', f.operation.snapshot().loreId)).data.details).toBe(
    data.details,
  );
  expect((await f.client.get('book', f.operation.snapshot().loreId)).data.summary).toBe(
    data.summary,
  );
}, 30000);

it('uses bounded control pages with more than 50 uploads and preserves relation item shape', async () => {
  const relations = Array.from({ length: 64 * 51 + 1 }, (_, index) => ({
    targetEntityId: 'universe:gone:target-' + index,
    relationType: '  Knows\r\n',
    ...(index % 2 ? { description: '' } : {}),
  }));
  const f = await creationClientFixture({ data: { name: 'Paged', category: 'other', relations } });
  const first = f.operation.controlsPage();
  expect(first.items).toHaveLength(50);
  expect(first.nextOffset).toBe(50);
  expect(f.operation.controlsPage(50).items).toHaveLength(4);
  expect(() => f.operation.controlsPage(0, 51)).toThrow();
  const start = creationRecovery(f.operation),
    count = f.calls.length;
  await restoreCreation(f, start);
  expect(f.calls).toHaveLength(count);
  await creationReady(f);
  expect(JSON.stringify(f.operation.snapshot()).length).toBeLessThan(6000);
  await f.operation.apply();
  expect((await f.client.get('book', f.operation.snapshot().loreId)).data.relations).toEqual(
    relations,
  );
}, 30000);

it('freezes caller values before the first yield while leaving the caller mutable', async () => {
  const input = { uid: 'author', bookId: 'book', writeId: 'freeze-new', data: creationData() };
  const before = structuredClone(input);
  const port = { call: vi.fn() };
  const pending = prepareBookLoreCreationOperation(input, port, { yieldControl: async () => {} });
  input.data.name = 'Mutated';
  input.data.aliases.push('extra');
  const operation = await pending;
  const expected = await prepareBookLoreCreationOperation(before, port);
  expect(operation.snapshot().intentHash).toBe(expected.snapshot().intentHash);
  expect(input.data.name).toBe('Mutated');
  expect(port.call).not.toHaveBeenCalled();
});

it.each([
  {},
  { name: 'No category' },
  { name: 'Date', category: 'other', createdAt: 1 },
  { name: 'Date', category: 'other', updatedAt: 1 },
  { name: 'Bad', category: 'other', aliases: [null] },
  { name: 'Bad', category: 'other', details: '\ud800' },
])('rejects invalid creation data before any RPC (%j)', async (data) => {
  const port = { call: vi.fn() };
  await expect(
    prepareBookLoreCreationOperation(
      { uid: 'author', writeId: 'invalid', bookId: 'book', data },
      port,
    ),
  ).rejects.toThrow();
  expect(port.call).not.toHaveBeenCalled();
});

it('leaves a foreign native adoption in conflict without deleting it or claiming own success', async () => {
  const f = await creationClientFixture();
  await f.operation.advance();
  const s = f.operation.snapshot();
  const parent = creationFixture(f.db, { creationId: s.creationId });
  const foreign = await creationAdoptionFixture(f.db, {
    parent,
    editId: 'different-native-attempt',
    changes: [
      { target: { field: 'name' }, value: 'Other outcome' },
      { target: { field: 'category' }, value: 'other' },
    ],
  });
  await adoptCreation(foreign);
  expect((await creationCancelled(f)).phase).toBe('conflict');
  expect((await f.client.get('book', s.loreId)).data.name).toBe('Other outcome');
  const before = structuredClone([...f.records]),
    count = f.calls.length;
  await restoreCreation(f);
  await f.operation.advance();
  await expect(f.operation.apply()).rejects.toThrow();
  expect(f.calls).toHaveLength(count);
  expect([...f.records]).toEqual(before);
});

it.each([
  ['uid', 'other'],
  ['bookId', 'other'],
  ['writeId', 'other'],
  ['kind', 'edit'],
  ['intentHash', 'a'.repeat(64)],
  ['controlsHash', 'a'.repeat(64)],
  ['uploadIndex', 1],
  ['reserved', 999],
  ['phase', 'applied'],
  ['initialized', true],
])('rejects incoherent checkpoint %s without RPC', async (field, value) => {
  const f = await creationClientFixture(),
    saved = creationRecovery(f.operation),
    count = f.calls.length;
  saved.checkpoint[field] = value;
  await expect(restoreCreation(f, saved)).rejects.toThrow();
  expect(f.calls).toHaveLength(count);
});

it('rejects altered pending bytes, extra arguments and pages from another checkpoint', async () => {
  const f = await creationClientFixture();
  let saved;
  f.intercept(async (method, input, invoke) => {
    if (method === 'appendBookLoreFieldUpload') {
      saved = creationRecovery(f.operation);
      throw Error('offline');
    }
    return invoke();
  });
  while (!saved) {
    try {
      await f.operation.advance();
    } catch (e) {
      expect(e.message).toBe('offline');
    }
  }
  const count = f.calls.length;
  const bytes = structuredClone(saved.checkpoint);
  bytes.pending.production.input.chunkBase64 = Buffer.from('"Different"').toString('base64');
  await expect(restoreCreation(f, { ...saved, checkpoint: bytes })).rejects.toThrow();
  const extra = structuredClone(saved.checkpoint);
  extra.pending.production.input.uid = 'other';
  await expect(restoreCreation(f, { ...saved, checkpoint: extra })).rejects.toThrow();
  await expect(
    restoreCreation(f, {
      ...saved,
      controlsPage: async () => ({
        intentHash: 'a'.repeat(64),
        items: [],
        nextOffset: null,
      }),
    }),
  ).rejects.toThrow();
  expect(f.calls).toHaveLength(count);
});

it.each([
  ['bookId', 'other'],
  ['loreId', 'other'],
  ['creationId', 'other'],
  ['startHash', 'e'.repeat(64)],
  ['jobToken', 'invalid'],
  ['schemaVersion', 2],
  ['phase', 'adopted'],
  ['cancellationOperationId', 'unexpected'],
  ['privateText', 'PRIVATE'],
])(
  'rejects malformed creator response %s while retaining the exact reservation request',
  async (field, value) => {
    const f = await creationClientFixture();
    let altered = false;
    f.intercept(async (method, input, invoke) => {
      const result = await invoke();
      if (!altered) {
        altered = true;
        return { ...result, [field]: value };
      }
      return result;
    });
    await expect(f.operation.advance()).rejects.toThrow();
    const wire = structuredClone(f.calls.at(-1));
    expect(f.operation.snapshot().parent).toBeNull();
    await restoreCreation(f);
    await f.operation.advance();
    expect(f.calls.at(-1)).toEqual(wire);
    expect(f.operation.snapshot().parent.phase).toBe('preparing');
  },
);

it('rejects adoption for a different unit and confirms the original event on exact apply retry', async () => {
  const f = await creationClientFixture();
  await creationReady(f);
  let altered = false;
  f.intercept(async (method, input, invoke) => {
    const result = await invoke();
    if (method === 'adoptBookLoreEditGeneration' && !altered) {
      altered = true;
      return {
        ...result,
        progress: {
          ...result.progress,
          adoption: {
            ...result.progress.adoption,
            operationId: 'e'.repeat(64),
          },
        },
      };
    }
    return result;
  });
  await expect(f.operation.apply()).rejects.toThrow();
  const wire = structuredClone(f.calls.at(-1));
  expect(f.operation.snapshot().phase).toBe('ready');
  expect((await f.operation.apply()).phase).toBe('applied');
  expect(f.calls.at(-1)).toEqual(wire);
  expect(f.records.get('books/book').localLoreVersion).toBe(1);
});

it('cancel cleans a held append before its producer response returns', async () => {
  const f = await creationClientFixture();
  let release, entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  f.intercept(async (method, input, invoke) => {
    const result = await invoke();
    if (method === 'appendBookLoreFieldUpload' && !release) {
      entered();
      return new Promise((resolve) => {
        release = () => resolve(result);
      });
    }
    return result;
  });
  await f.operation.advance();
  await f.operation.advance();
  const pending = f.operation.advance();
  await started;
  expect((await creationCancelled(f)).phase).toBe('cancelled');
  const before = f.operation.snapshot();
  release();
  await pending;
  expect(f.operation.snapshot()).toEqual(before);
  expect([...f.records].filter(([path]) => /\/bookResource(Bodies|Chunks)\//.test(path))).toEqual(
    [],
  );
});

it('reconciles rejected cleanup CAS after another cleanup unit and a fresh coordinator', async () => {
  const f = await creationClientFixture();
  await creationReady(f);
  let moved = false,
    saved;
  f.intercept(async (method, input, invoke) => {
    if (method === 'advanceBookLoreCreationCleanup' && !moved) {
      moved = true;
      const { createBookLoreEditTransportService } =
        await import('../../../../functions/src/bookLoreEditTransport.mjs');
      await createBookLoreEditTransportService({ db: f.db }).bookLoreEdit('author', {
        method,
        input: { ...input, operationId: 'another-native-cleanup-step' },
      });
    }
    return invoke();
  });
  f.operation.requestCancel();
  while (!saved) {
    try {
      await f.operation.advance();
    } catch (e) {
      expect(String(e.code)).toContain('failed-precondition');
      saved = creationRecovery(f.operation);
    }
  }
  const count = f.calls.length;
  await restoreCreation(f, saved);
  expect(f.calls).toHaveLength(count);
  expect((await creationCancelled(f)).phase).toBe('cancelled');
  expect(f.records.get('books/book').localLoreVersion).toBe(0);
});

it('denied source authorization cannot adopt and preserves the original apply for retry', async () => {
  const f = await creationClientFixture();
  await creationReady(f);
  await f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { authorId: 'other' }));
  const before = structuredClone([...f.records]);
  await expect(f.operation.apply()).rejects.toMatchObject({ code: 'failed-precondition' });
  const wire = structuredClone(f.calls.at(-1));
  expect([...f.records]).toEqual(before);
  await f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { authorId: 'author' }));
  expect((await f.operation.apply()).phase).toBe('applied');
  expect(f.calls.at(-1)).toEqual(wire);
  expect(f.records.get('books/book').localLoreVersion).toBe(1);
});
