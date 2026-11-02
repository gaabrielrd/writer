// @vitest-environment node
import { beforeEach, it, expect, vi } from 'vitest';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
const mocks = vi.hoisted(() => ({ factory: vi.fn(), indexes: [] }));
vi.mock('../services/bookValidationIndex', () => ({
  createBookValidationIndex: (...a) => mocks.factory(...a),
}));
import { inspectBookRestoreFile } from '../services/inspectBookRestoreFile.ts';
import { bookRestoreMetadataHash } from '../services/bookRestoreTransferContracts.ts';
import { bookLegacyFixture } from '../../../../functions/test/helpers/bookLegacyFixture.mjs';
import { coverRestoreFixture } from '../../../../functions/test/helpers/bookRestoreCoverFixture.mjs';
import {
  source,
  indexFixture,
  record,
} from '../../../../functions/test/helpers/bookContentFixture.mjs';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.indexes = [];
  mocks.factory.mockImplementation(async () => {
    const index = { ...indexFixture(), dispose: vi.fn(async () => {}) };
    mocks.indexes.push(index);
    return index;
  });
});
const check = () => {};
async function nativeBytes() {
  const records = coverRestoreFixture({ kind: 'none' }),
    at = records.findIndex((r) => r.kind === 'book-metadata'),
    data = JSON.parse(new TextDecoder().decode(records[at].payload));
  data.book.title = 'PRIVATE_TITLE_MUST_NOT_RETURN';
  data.book.synopsis = 'PRIVATE_SYNOPSIS_MUST_NOT_RETURN';
  records[at] = record('book-metadata', 'book', data);
  const src = await source(records);
  return new Uint8Array(await src.read(0, src.size));
}
it('native header selects current validation regardless of filename or MIME, with metadata-only frozen review', async () => {
  const bytes = await nativeBytes(),
    stages = [],
    file = new File([bytes], 'PRIVATE_FILENAME.json', { type: 'text/plain' }),
    got = await inspectBookRestoreFile(file, { check, onStage: (s) => stages.push(s) });
  expect(stages).toEqual(['inspect', 'hash']);
  expect(got.review.source).toEqual({
    format: 'writer-book-archive',
    version: 1,
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  expect(got.review.legacy).toBeNull();
  expect(got.reviewHash).toBe(bookRestoreMetadataHash(got.review));
  expect(Object.isFrozen(got)).toBe(true);
  expect(Object.isFrozen(got.review.totals)).toBe(true);
  expect(JSON.stringify(got)).not.toContain('PRIVATE_');
  expect(got.review.policies.destination).toBe('new-private-copy');
  expect(mocks.indexes.every((i) => i.dispose.mock.calls.length === 1)).toBe(true);
});
for (const version of [1, 6])
  it(
    'legacy v' +
      version +
      ' preserves explicit absences and drops original/private/global prose from the local review',
    async () => {
      const value = bookLegacyFixture(version);
      value.book.title = 'PRIVATE_TITLE_MUST_NOT_RETURN';
      value.lore[0].details = 'PRIVATE_LORE_MUST_NOT_RETURN';
      const bytes = Buffer.from('\ufeff' + JSON.stringify(value)),
        got = await inspectBookRestoreFile(new File([bytes], 'renamed.writer'), { check });
      expect(got.review.source.format).toBe('writer-book-backup');
      expect(got.review.source.version).toBe(version);
      expect(got.review.legacy.availability.history).toBe('not-recorded');
      expect(got.review.sourceBookId).toBe(value.book.id);
      expect(JSON.stringify(got)).not.toContain('PRIVATE_');
      expect(JSON.stringify(got)).not.toContain('GLOBAL PROSE');
      expect(got.review.legacy.publicationDiscarded).toBe(true);
      expect(mocks.indexes.every((i) => i.dispose.mock.calls.length === 1)).toBe(true);
    },
  );
it('renaming the same bytes cannot change source identity or the confirmed review hash', async () => {
  const bytes = await nativeBytes(),
    a = await inspectBookRestoreFile(new File([bytes], 'one.json'), { check }),
    b = await inspectBookRestoreFile(
      new File([bytes], 'two.binary', { type: 'application/octet-stream' }),
      { check },
    );
  expect(a).toEqual(b);
});
it('large legacy content is inspected and fingerprinted through bounded Blob intervals without returning prose', async () => {
  const value = bookLegacyFixture(1);
  value.chapters[0].content = '🌙'.repeat(220000);
  const bytes = Buffer.from(JSON.stringify(value)),
    ranges = [];
  class TrackedFile extends File {
    slice(start, end, type) {
      ranges.push([start, end]);
      return super.slice(start, end, type);
    }
  }
  const got = await inspectBookRestoreFile(new TrackedFile([bytes], 'large.json'), { check });
  expect(got.review.source.byteLength).toBe(bytes.length);
  expect(bytes.length).toBeGreaterThan(65536);
  expect(ranges.every(([a, b]) => b - a <= 65536)).toBe(true);
  expect(JSON.stringify(got).length).toBeLessThan(16384);
});
it('empty, invalid and corrupted backups never reach the hash/confirmation stage and release temporary indexes', async () => {
  const native = await nativeBytes();
  native[native.length - 1] ^= 1;
  for (const bytes of [new Uint8Array(), Buffer.from('not a backup'), native]) {
    const stages = [];
    await expect(
      inspectBookRestoreFile(new File([bytes], 'backup.json'), {
        check,
        onStage: (s) => stages.push(s),
      }),
    ).rejects.toThrow();
    expect(stages).not.toContain('hash');
  }
  expect(mocks.indexes.every((i) => i.dispose.mock.calls.length === 1)).toBe(true);
});
it('invalidation between inspection and hashing rejects a completed report instead of publishing it', async () => {
  let alive = true;
  const bytes = await nativeBytes();
  await expect(
    inspectBookRestoreFile(new File([bytes], 'backup.writer'), {
      check() {
        if (!alive) throw Error('Inactive scope');
      },
      onStage(stage) {
        if (stage === 'hash') alive = false;
      },
    }),
  ).rejects.toThrow('Inactive scope');
  expect(mocks.indexes.every((i) => i.dispose.mock.calls.length === 1)).toBe(true);
});
it('abort or account change during a Blob read never returns review metadata', async () => {
  const bytes = await nativeBytes(),
    controller = new AbortController();
  controller.abort();
  await expect(
    inspectBookRestoreFile(new File([bytes], 'backup.writer'), {
      check,
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  let alive = true;
  class InvalidatedFile extends File {
    slice(...args) {
      const part = super.slice(...args),
        read = part.arrayBuffer.bind(part);
      part.arrayBuffer = async () => {
        const data = await read();
        alive = false;
        return data;
      };
      return part;
    }
  }
  await expect(
    inspectBookRestoreFile(new InvalidatedFile([bytes], 'backup.writer'), {
      check() {
        if (!alive) throw Error('Account changed');
      },
    }),
  ).rejects.toThrow('Account changed');
});

it('mutating the options object during inspection cannot replace the captured account guard or abort signal', async () => {
  const bytes = await nativeBytes();
  for (const mode of ['account', 'signal']) {
    const controller = new AbortController();
    let alive = true;
    const options = {
      check() {
        if (!alive) throw Error('Inactive captured guard');
      },
      signal: controller.signal,
      onStage(stage) {
        if (stage !== 'hash') return;
        if (mode === 'account') {
          alive = false;
          options.check = () => {};
        } else {
          controller.abort();
          options.signal = new AbortController().signal;
        }
      },
    };
    await expect(
      inspectBookRestoreFile(new File([bytes], 'backup.writer'), options),
    ).rejects.toThrow();
  }
});
