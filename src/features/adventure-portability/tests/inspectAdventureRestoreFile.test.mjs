// @vitest-environment node
import { beforeEach, it, expect, vi } from 'vitest';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
const m = vi.hoisted(() => ({ create: vi.fn(), dispose: vi.fn() }));
vi.mock('@/shared/validation', () => ({ createTemporaryValidationIndex: m.create }));
import { inspectAdventureRestoreFile } from '../services/inspectAdventureRestoreFile.ts';
import { adventureRestoreMetadataHash } from '../services/adventureRestoreTransferContracts.ts';
import { sceneAdventureArchive } from '../../../../functions/test/helpers/adventureRestoreSceneArchiveFixture.mjs';
beforeEach(() => {
  vi.clearAllMocks();
  m.dispose.mockResolvedValue(undefined);
  m.create.mockImplementation(async () => {
    const values = new Map();
    return {
      async add(k, v) {
        const id = JSON.stringify(k);
        if (values.has(id)) throw Error('duplicate');
        values.set(id, structuredClone(v));
      },
      async get(k) {
        return structuredClone(values.get(JSON.stringify(k)));
      },
      dispose: m.dispose,
    };
  });
});
it('native content is inspected independently of name/MIME and returns only frozen metadata with exact whole-file SHA', async () => {
  const bytes = await sceneAdventureArchive({ content: '<p>PRIVATE_SCENE_BODY</p>' }),
    stages = [];
  const r = await inspectAdventureRestoreFile(
    new File([bytes], 'PRIVATE_FILE.json', { type: 'text/plain' }),
    { check: () => {}, onStage: (s) => stages.push(s) },
  );
  expect(stages).toEqual(['inspect', 'hash']);
  expect(r.review.source).toEqual({
    format: 'writer-adventure-archive',
    version: 1,
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  expect(r.review.totals.resources.scene).toBe(1);
  expect(r.reviewHash).toBe(adventureRestoreMetadataHash(r.review));
  expect(r.review.policies).toMatchObject({
    destination: 'new-private-copy',
    draft: 'saved-text-with-draft-version',
    history: 'all-recorded',
  });
  expect(Object.isFrozen(r.review.totals.resources)).toBe(true);
  expect(Object.isFrozen(r.review.warnings)).toBe(true);
  expect(JSON.stringify(r)).not.toContain('PRIVATE_');
  expect(m.dispose).toHaveBeenCalledTimes(1);
});
it.each([
  Buffer.from('WRITER-BOOK\n1234567890'),
  Buffer.from('{"schemaVersion":6,"book":{}}'),
  Buffer.alloc(0),
  Buffer.alloc(30),
])('book/legacy/invalid bytes are not interpreted as adventure %#', async (bytes) => {
  await expect(
    inspectAdventureRestoreFile(new File([bytes], 'renamed.writer'), { check: () => {} }),
  ).rejects.toThrow();
});
it('snapshot ignores overridden Blob slice/size on the selected file', async () => {
  const bytes = await sceneAdventureArchive(),
    file = new File([bytes], 'safe.writer');
  Object.defineProperties(file, {
    size: { value: 1 },
    slice: {
      value: () => {
        throw Error('Overridden');
      },
    },
  });
  const r = await inspectAdventureRestoreFile(file, { check: () => {} });
  expect(r.review.source.byteLength).toBe(bytes.length);
});
it('guard loss while hashing and abort between inspection stages prevent adopting metadata and dispose validation index', async () => {
  const bytes = await sceneAdventureArchive(),
    file = new File([bytes], 'safe.writer');
  let active = true;
  await expect(
    inspectAdventureRestoreFile(file, {
      check() {
        if (!active) throw Error('Expired');
      },
      onStage(s) {
        if (s === 'hash') active = false;
      },
    }),
  ).rejects.toThrow('Expired');
  const c = new AbortController();
  await expect(
    inspectAdventureRestoreFile(file, {
      check: () => {},
      signal: c.signal,
      onStage(s) {
        if (s === 'hash') c.abort();
      },
    }),
  ).rejects.toThrow();
  expect(m.dispose).toHaveBeenCalledTimes(2);
});
it('cleanup failure refuses to produce a successful review', async () => {
  m.dispose.mockRejectedValue(Error('Cleanup failed'));
  await expect(
    inspectAdventureRestoreFile(new File([await sceneAdventureArchive()], 'safe.writer'), {
      check: () => {},
    }),
  ).rejects.toThrow('Cleanup failed');
});
