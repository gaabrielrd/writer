// @vitest-environment node
import { it, expect, vi } from 'vitest';
import { createBookLoreReadClient } from '../services/bookLoreReadClient';
import {
  saveBookBackup,
  captureBookBackupResources,
  verifyBookBackupResources,
} from '@/features/book-portability';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { seedBookLoreRead } from '../../../../functions/test/helpers/bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from '../../../../functions/test/helpers/bookLoreGenerationFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from '../../../../functions/test/helpers/bookLoreCreationAdoptionFixture.mjs';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import {
  bookArchiveReadApi,
  bookArchiveCapturePorts,
} from '../../../../functions/test/helpers/bookArchiveCaptureFixture.mjs';
import { indexedLoreData } from '../../../../functions/test/helpers/bookLoreContentFixture.mjs';
import { validateBookBackupContent } from '../../../../functions/src/bookBackupContent.mjs';
import { indexFixture, hashPort } from '../../../../functions/test/helpers/bookContentFixture.mjs';
import { decodeBookBackup } from '../../../../functions/src/bookBackupContainer.mjs';
import { createBookRestoreUploadService } from '../../../../functions/src/bookRestoreUpload.mjs';
import { uploadSealedArchiveRestore } from '../../../../functions/test/helpers/bookRestoreContentFixture.mjs';
import { finishLegacyRestore } from '../../../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
async function fixture(mode = 'v2', { large = false, base = false } = {}) {
  const f = adventureImportDb({ nativeUpdates: true }),
    data = indexedLoreData({ large });
  await f.db.runTransaction(async (tx) =>
    tx.create(f.db.doc('books/book'), {
      authorId: 'author',
      title: 'Book',
      status: 'draft',
      localLoreVersion: 0,
      createdAt: 1,
      updatedAt: 2,
    }),
  );
  let id = 'entity',
    expected;
  if (mode === 'v2') {
    const { relations, createdAt, updatedAt, ...fields } = data;
    if (base) {
      fields.summary = null;
      fields.aliases = null;
    }
    const seed = await seedBookLoreGeneration(f.db, {
      id,
      noBase: !base,
      ...(base
        ? {
            baseData: {
              name: 'Old',
              category: 'other',
              summary: 'C3_SHADOWED_PRIVATE_PROSE',
              details: 'C3_SHADOWED_PRIVATE_PROSE',
            },
          }
        : {}),
      fields,
      relations,
      dates: base ? { updatedAt } : { createdAt, updatedAt },
    });
    expected = { ...data, ...seed.storage.dates };
    if (base) {
      delete expected.summary;
      delete expected.aliases;
      delete expected.createdAt;
    }
  } else if (mode === 'created') {
    const { relations, createdAt, updatedAt, ...fields } = data;
    const seeded = await creationAdoptionFixture(f.db, {
      changes: Object.entries(fields).map(([field, value]) => ({ target: { field }, value })),
    });
    await adoptCreation(seeded);
    id = seeded.loreId;
    expected = { ...fields, ...f.records.get(seeded.source.seed.path).payloadStorage.dates };
  } else {
    await seedBookLoreRead(f.db, { id, inline: mode === 'inline', data });
    expected = mode === 'inline' ? data : { ...data, createdAt: 1000, updatedAt: 1000 };
  }
  const api = bookArchiveReadApi(f.db),
    c1 = createBookLoreReadService({ db: f.db }),
    actor = { uid: 'author' };
  let current = actor;
  const guard = () => {
      if (current !== actor) throw Error('Actor changed');
    },
    call = vi.fn((method, input) => api[method]('author', input)),
    native = vi.fn((method, input) => c1[method]('author', input)),
    lore = { ...createBookLoreReadClient(native, guard, { tokenVersion: 2 }), guard },
    options = bookArchiveCapturePorts(call, lore),
    parts = [],
    sink = {
      write: vi.fn(async (bytes) => {
        parts.push(Buffer.from(bytes));
      }),
      close: vi.fn(async () => {}),
      abort: vi.fn(async () => {}),
    };
  return {
    ...f,
    id,
    data,
    expected,
    call,
    native,
    lore,
    options,
    parts,
    sink,
    replaceActor: () => {
      current = { uid: 'author' };
    },
  };
}
function source(parts) {
  const bytes = Buffer.concat(parts);
  return {
    bytes,
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, offset + length),
  };
}
async function values(src) {
  const parts = [];
  for await (const record of decodeBookBackup(src))
    if (record.kind === 'book-lore') parts.push(Buffer.from(record.payload));
  return JSON.parse(Buffer.concat(parts).toString()).data;
}
it.each(['inline', 'v1', 'v2', 'created'])(
  'C1 %s → real archive → content validation preserves logical lore and closes only after seal',
  async (mode) => {
    const f = await fixture(mode),
      seal = await saveBookBackup('book', f.options, f.sink),
      src = source(f.parts),
      report = await validateBookBackupContent(src, { index: indexFixture(), hash: hashPort });
    expect(await values(src)).toEqual(f.expected);
    expect(report.envelope.seal).toMatchObject(seal);
    expect(report.totals.resources.lore).toBe(1);
    expect(
      f.call.mock.calls.some(
        ([method, input]) => method === 'readBookBackupResource' && input.kind === 'lore',
      ),
    ).toBe(false);
    expect(f.sink.close).toHaveBeenCalledOnce();
    expect(f.sink.abort).not.toHaveBeenCalled();
    const first = f.native.mock.calls[0];
    expect(first[1].tokenVersion).toBe(1);
    expect(
      f.native.mock.calls.filter(([m]) => m === 'getBookLoreRead').at(-1)[1].tokenVersion,
    ).toBe(1);
    for (const [, input] of f.native.mock.calls)
      if (input.readToken) expect(src.bytes.toString()).not.toContain(input.readToken);
  },
);
it('full archive above 8 MiB uses each native body unit once and final metadata never downloads prose', async () => {
  const f = await fixture('v2', { large: true });
  await saveBookBackup('book', f.options, f.sink);
  const src = source(f.parts),
    report = await validateBookBackupContent(src, { index: indexFixture(), hash: hashPort }),
    reads = f.native.mock.calls.filter(([m]) => m === 'readBookLorePart'),
    units = reads.map(([, i]) => JSON.stringify([i.section, i.field, i.page, i.index]));
  expect(src.size).toBeGreaterThan(8 * 1024 * 1024);
  expect(new Set(units).size).toBe(units.length);
  expect(await values(src)).toEqual(f.expected);
  expect(report.totals.resources.lore).toBe(1);
});
it('a changed C1 metadata token is detected even when resource head tokens remain unchanged', async () => {
  const f = await fixture(),
    read = f.lore.portableMetadata;
  f.lore.portableMetadata = async (...args) => ({
    ...(await read(...args)),
    readToken: 'f'.repeat(64),
  });
  await expect(saveBookBackup('book', f.options, f.sink)).rejects.toThrow('estrutura completa');
  expect(f.sink.abort).toHaveBeenCalledOnce();
  expect(f.sink.close).not.toHaveBeenCalled();
  await expect(
    validateBookBackupContent(source(f.parts), { index: indexFixture(), hash: hashPort }),
  ).rejects.toThrow();
  const factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 }),
    id = 'archive-failed-capture01',
    progress = await uploadSealedArchiveRestore(factory(), 'author', id, source(f.parts).bytes),
    done = await finishLegacyRestore(factory, 'author', id, progress);
  expect(done.state).toBe('content-rejected');
  expect(f.records.has('books/' + done.bookId)).toBe(false);
});
it('same-UID actor replacement after lore capture prevents the final seal and closes the sink by abort', async () => {
  const f = await fixture(),
    verify = f.options.history.verify;
  f.options.history.verify = async (...args) => {
    await verify(...args);
    f.replaceActor();
  };
  await expect(saveBookBackup('book', f.options, f.sink)).rejects.toThrow('Actor changed');
  expect(f.sink.close).not.toHaveBeenCalled();
  expect(f.sink.abort).toHaveBeenCalledOnce();
});
it('standalone proof retains its original actor guard without a fresh replacement port', async () => {
  const f = await fixture(),
    records = [],
    proof = await captureBookBackupResources({
      bookId: 'book',
      api: f.options.apis.resources,
      lore: f.lore,
      write: async (record) => {
        records.push(record);
      },
    });
  const before = f.call.mock.calls.length;
  f.replaceActor();
  await expect(verifyBookBackupResources(proof, { api: f.options.apis.resources })).rejects.toThrow(
    'Actor changed',
  );
  expect(f.call.mock.calls.length).toBe(before);
  expect(JSON.stringify(proof).length).toBeLessThan(1600);
});
it('sink pressure holds C1 reads and abort during that write cannot produce a seal', async () => {
  const f = await fixture('v2', { large: true }),
    controller = new AbortController();
  let release, entered;
  const gate = new Promise((r) => {
      release = r;
    }),
    writing = new Promise((r) => {
      entered = r;
    }),
    original = f.sink.write;
  let stalled = false;
  f.sink.write = vi.fn(async (bytes) => {
    await original(bytes);
    if (!stalled && f.native.mock.calls.some(([m]) => m === 'readBookLorePart')) {
      stalled = true;
      entered();
      await gate;
    }
  });
  const pending = saveBookBackup('book', { ...f.options, signal: controller.signal }, f.sink),
    outcome = pending.then(
      () => ({ success: true }),
      (error) => ({ error }),
    );
  await Promise.race([
    writing,
    outcome.then((result) => {
      throw result.error ?? Error('Capture ended before the stalled write');
    }),
  ]);
  const before = f.native.mock.calls.length;
  await new Promise((r) => setTimeout(r, 0));
  expect(f.native.mock.calls.length).toBe(before);
  controller.abort();
  release();
  expect((await outcome).error).toMatchObject({ name: 'AbortError' });
  expect(f.sink.close).not.toHaveBeenCalled();
  expect(f.sink.abort).toHaveBeenCalledOnce();
});

it('the exact captured large archive passes server upload/integrity/content validation without activating a restored book', async () => {
  const f = await fixture('v2', { large: true }),
    before = structuredClone(f.records.get('books/book/lore/' + f.id));
  await saveBookBackup('book', f.options, f.sink);
  const factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 }),
    id = 'archive-c1-server-copy01',
    bytes = source(f.parts).bytes,
    progress = await uploadSealedArchiveRestore(factory(), 'author', id, bytes),
    done = await finishLegacyRestore(factory, 'author', id, progress);
  expect(done.state).toBe('content-verified');
  expect(done.validation.summary.totals.resources.lore).toBe(1);
  expect(f.records.has('books/' + done.bookId)).toBe(false);
  expect(f.records.get('books/book/lore/' + f.id)).toEqual(before);
});

it('actor replacement during the final seal write still aborts before the destination close', async () => {
  const f = await fixture(),
    write = f.sink.write;
  let changed = false;
  f.sink.write = vi.fn(async (bytes) => {
    await write(bytes);
    if (Buffer.from(bytes).includes(Buffer.from('"type":"end"'))) {
      changed = true;
      f.replaceActor();
    }
  });
  await expect(saveBookBackup('book', f.options, f.sink)).rejects.toThrow('Actor changed');
  expect(changed).toBe(true);
  expect(f.sink.abort).toHaveBeenCalledOnce();
  expect(f.sink.close).not.toHaveBeenCalled();
});
it('actor replacement during destination close cannot return a positive capture result', async () => {
  const f = await fixture();
  f.sink.close = vi.fn(async () => {
    f.replaceActor();
  });
  await expect(saveBookBackup('book', f.options, f.sink)).rejects.toThrow('Actor changed');
  expect(f.sink.close).toHaveBeenCalledOnce();
});

it('a large v2 base with overrides and deleted optionals reaches the archive without shadowed prose or invented dates', async () => {
  const f = await fixture('v2', { base: true, large: true });
  await saveBookBackup('book', f.options, f.sink);
  const src = source(f.parts),
    data = await values(src),
    report = await validateBookBackupContent(src, { index: indexFixture(), hash: hashPort });
  expect(data).toEqual(f.expected);
  expect(data).not.toHaveProperty('summary');
  expect(data).not.toHaveProperty('aliases');
  expect(data).not.toHaveProperty('createdAt');
  expect(src.bytes.includes(Buffer.from('C3_SHADOWED_PRIVATE_PROSE'))).toBe(false);
  expect(report.warnings.missingDates).toBe(1);
});
