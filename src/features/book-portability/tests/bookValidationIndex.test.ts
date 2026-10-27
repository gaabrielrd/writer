import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBookValidationIndex } from '../services/bookValidationIndex';
class FileHandle {
  bytes = new Uint8Array(0);
  aborted = 0;
  readonly faults: { write?: Error; remove?: Error };
  constructor(faults: { write?: Error; remove?: Error }) {
    this.faults = faults;
  }
  getFile() {
    return Promise.resolve(new NodeBlob([this.bytes]));
  }
  createWritable() {
    let pending = new Uint8Array(0);
    return Promise.resolve({
      write: (value: Uint8Array) => {
        if (this.faults.write) return Promise.reject(this.faults.write);
        pending = new Uint8Array(value);
        return Promise.resolve();
      },
      close: () => {
        this.bytes = pending;
        return Promise.resolve();
      },
      abort: () => {
        this.aborted++;
        return Promise.resolve();
      },
    });
  }
}
class DirectoryHandle {
  directories = new Map<string, DirectoryHandle>();
  files = new Map<string, FileHandle>();
  readonly faults: { write?: Error; remove?: Error };
  constructor(faults: { write?: Error; remove?: Error }) {
    this.faults = faults;
  }
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle> {
    let value = this.directories.get(name);
    if (!value && options?.create) {
      value = new DirectoryHandle(this.faults);
      this.directories.set(name, value);
    }
    return value
      ? Promise.resolve(value)
      : Promise.reject(new DOMException('missing', 'NotFoundError'));
  }
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle> {
    let value = this.files.get(name);
    if (!value && options?.create) {
      value = new FileHandle(this.faults);
      this.files.set(name, value);
    }
    return value
      ? Promise.resolve(value)
      : Promise.reject(new DOMException('missing', 'NotFoundError'));
  }
  removeEntry(name: string) {
    if (this.faults.remove) return Promise.reject(this.faults.remove);
    this.directories.delete(name);
    this.files.delete(name);
    return Promise.resolve();
  }
}
let root: DirectoryHandle;
const parent = () => root.getDirectoryHandle('writer-book-validation-v1');
async function file() {
  const directory = [...(await parent()).directories.values()][0]!;
  return [...directory.files.values()][0]!;
}
beforeEach(() => {
  root = new DirectoryHandle({});
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve(root) } });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('stores only authenticated ciphertext under opaque names and preserves independent operations', async () => {
  const first = await createBookValidationIndex(),
    second = await createBookValidationIndex();
  await first.add(['private-id'], { target: 'private-reference' });
  await second.add(['private-id'], { target: 'second' });
  const namespace = await parent(),
    directory = [...namespace.directories.values()][0]!;
  expect([...directory.files.keys()]).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/)]);
  expect(new TextDecoder().decode((await file()).bytes)).not.toContain('private');
  expect(await first.get(['private-id'])).toEqual({ target: 'private-reference' });
  expect(await first.get(['missing'])).toBeUndefined();
  await expect(first.add(['private-id'], {})).rejects.toThrow('duplicada');
  await first.dispose();
  expect(await second.get(['private-id'])).toEqual({ target: 'second' });
  await expect(first.get(['private-id'])).rejects.toThrow('encerrado');
  await second.dispose();
  await second.dispose();
  expect(namespace.directories.size).toBe(0);
});
it('rejects truncation and tampering instead of trusting altered metadata', async () => {
  const index = await createBookValidationIndex();
  await index.add(['id'], { target: 'own' });
  const stored = await file(),
    original = stored.bytes.slice();
  stored.bytes = new Uint8Array([0]);
  await expect(index.get(['id'])).rejects.toThrow('corrompido');
  stored.bytes = original;
  stored.bytes[stored.bytes.length - 1]! ^= 1;
  await expect(index.get(['id'])).rejects.toThrow();
  await index.dispose();
});
it('bounds keys and encrypted entries before committing an oversized value', async () => {
  const index = await createBookValidationIndex();
  await expect(index.add(Array<string>(9).fill('id'), {})).rejects.toThrow('inválido');
  await expect(index.add(['x'.repeat(9000)], {})).rejects.toThrow('excedida');
  await expect(index.add(['id'], { target: 'x'.repeat(17000) })).rejects.toThrow('excedida');
  expect(await index.get(['id'])).toBeUndefined();
  await index.dispose();
});
it('aborts a failed write and allows caller cleanup after quota errors', async () => {
  const index = await createBookValidationIndex(),
    error = new Error('quota');
  root.faults.write = error;
  await expect(index.add(['id'], { target: 'own' })).rejects.toBe(error);
  expect((await file()).aborted).toBe(1);
  await index.dispose();
  expect((await parent()).directories.size).toBe(0);
});
it('cleans failed initialization and preserves both initialization and cleanup errors', async () => {
  const initial = new Error('crypto unavailable'),
    cleanup = new Error('remove denied');
  vi.spyOn(webcrypto.subtle, 'generateKey').mockRejectedValueOnce(initial);
  await expect(createBookValidationIndex()).rejects.toBe(initial);
  expect((await parent()).directories.size).toBe(0);
  root.faults.remove = cleanup;
  vi.spyOn(webcrypto.subtle, 'generateKey').mockRejectedValueOnce(initial);
  await expect(createBookValidationIndex()).rejects.toMatchObject({ errors: [initial, cleanup] });
});
it('checks cancellation before storage and during access, while allowing cleanup', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(createBookValidationIndex(controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(root.directories.size).toBe(0);
  const active = new AbortController(),
    index = await createBookValidationIndex(active.signal);
  active.abort();
  await expect(index.get(['id'])).rejects.toMatchObject({ name: 'AbortError' });
  await index.dispose();
  expect((await parent()).directories.size).toBe(0);
});

it('keeps validation namespaces independent while preserving the original book prefix', async () => {
  const { createTemporaryValidationIndex } = await import('@/shared/validation');
  const adventure = await createTemporaryValidationIndex('writer-adventure-validation-v1'),
    book = await createBookValidationIndex();
  await adventure.add(['same-id'], { kind: 'adventure' });
  await book.add(['same-id'], { kind: 'book' });
  expect([...root.directories.keys()].sort()).toEqual([
    'writer-adventure-validation-v1',
    'writer-book-validation-v1',
  ]);
  expect(await adventure.get(['same-id'])).toEqual({ kind: 'adventure' });
  await adventure.dispose();
  expect(await book.get(['same-id'])).toEqual({ kind: 'book' });
  await book.dispose();
});
it('rejects unsafe namespaces before opening browser storage', async () => {
  const { createTemporaryValidationIndex } = await import('@/shared/validation');
  for (const name of ['../private', '', 'UPPER', 'with/slash', 'x'.repeat(101)])
    await expect(createTemporaryValidationIndex(name)).rejects.toThrow('Namespace');
  expect(root.directories.size).toBe(0);
});
