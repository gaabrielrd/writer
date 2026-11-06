import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBookBackupStage } from '../services/bookBackupStage';
import { BackupDirectoryHandle } from './helpers/backupFileSystem';
let root: BackupDirectoryHandle;
let current: boolean;
const guard = () => {
  if (!current) throw new DOMException('session changed', 'AbortError');
};
const namespace = () => root.getDirectoryHandle('writer-book-backup-stage-v1');
async function directory() {
  return [...(await namespace()).directories.values()][0]!;
}
beforeEach(() => {
  root = new BackupDirectoryHandle();
  current = true;
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve(root) } });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('stores authenticated ciphertext in bounded files and reads exact ranges across part boundaries', async () => {
  const stage = await createBookBackupStage(guard);
  const input = new TextEncoder().encode('PRIVATE_STAGE_TEXT'.repeat(10000));
  await stage.write(input.subarray(0, 123));
  await stage.write(input.subarray(123));
  const source = await stage.finish(),
    files = [...(await directory()).files.values()];
  expect(source.size).toBe(input.length);
  expect(files.length).toBe(Math.ceil(input.length / 65536));
  expect(Math.max(...files.map((file) => file.bytes.length))).toBeLessThanOrEqual(65536 + 28);
  expect(
    files.some((file) => new TextDecoder().decode(file.bytes).includes('PRIVATE_STAGE_TEXT')),
  ).toBe(false);
  expect(await source.read(65520, 100000)).toEqual(new Uint8Array(input.slice(65520, 165520)));
  expect(await source.read(source.size, 0)).toEqual(new Uint8Array());
  await expect(stage.write(new Uint8Array([1]))).rejects.toThrow();
  await stage.dispose();
  expect((await namespace()).directories.size).toBe(0);
  await expect(source.read(0, 1)).rejects.toThrow();
});
it('binds each part to its operation and position instead of accepting swapped ciphertext', async () => {
  const first = await createBookBackupStage(guard),
    second = await createBookBackupStage(guard);
  await first.write(new Uint8Array(131072).fill(7));
  const source = await first.finish();
  await second.write(new Uint8Array(65536).fill(7));
  await second.finish();
  const dirs = [...(await namespace()).directories.values()],
    files = dirs[0]!.files;
  const original = files.get('0')!.bytes;
  files.get('0')!.bytes = files.get('1')!.bytes;
  await expect(source.read(0, 10)).rejects.toThrow();
  files.get('0')!.bytes = dirs[1]!.files.get('0')!.bytes;
  await expect(source.read(0, 10)).rejects.toThrow();
  files.get('0')!.bytes = original;
  expect((await source.read(0, 1))[0]).toBe(7);
  await first.dispose();
  expect((await namespace()).directories.size).toBe(1);
  await second.dispose();
});
it('rejects modified or truncated ciphertext and missing pages without returning partial ranges', async () => {
  const stage = await createBookBackupStage(guard);
  await stage.write(new Uint8Array(70000).fill(9));
  const source = await stage.finish(),
    files = (await directory()).files,
    last = files.get('1')!;
  const saved = last.bytes;
  last.bytes = saved.slice(0, -1);
  await expect(source.read(65000, 1000)).rejects.toThrow();
  last.bytes = new Uint8Array(saved);
  last.bytes[20] = last.bytes[20]! ^ 1;
  await expect(source.read(65000, 1000)).rejects.toThrow();
  files.delete('1');
  await expect(source.read(65000, 1000)).rejects.toThrow();
  await stage.dispose();
});
it('checks the session after pending I/O and permits keyless cleanup after revocation', async () => {
  const stage = await createBookBackupStage(guard);
  root.faults.beforeWrite = () => {
    current = false;
    return Promise.resolve();
  };
  await expect(stage.write(new Uint8Array(65536))).rejects.toMatchObject({ name: 'AbortError' });
  await stage.dispose();
  expect((await namespace()).directories.size).toBe(0);
});
it('keeps failed cleanup retryable and removes only its own operation', async () => {
  const first = await createBookBackupStage(guard),
    second = await createBookBackupStage(guard);
  root.faults.remove = new Error('remove failed');
  await expect(first.dispose()).rejects.toThrow('remove failed');
  expect((await namespace()).directories.size).toBe(2);
  delete root.faults.remove;
  await Promise.all([first.dispose(), first.dispose()]);
  expect((await namespace()).directories.size).toBe(1);
  await second.dispose();
});
it('freezes write bytes before awaiting storage and refuses concurrent finish or cleanup', async () => {
  let resume!: () => void;
  const pending = new Promise<void>((resolve) => {
    resume = resolve;
  });
  root.faults.beforeWrite = () => pending;
  const stage = await createBookBackupStage(guard),
    bytes = new Uint8Array(70000).fill(3);
  const writing = stage.write(bytes);
  bytes.fill(4);
  await expect(stage.finish()).rejects.toThrow();
  await expect(stage.dispose()).rejects.toThrow();
  resume();
  await writing;
  const source = await stage.finish();
  expect(await source.read(65530, 20)).toEqual(new Uint8Array(20).fill(3));
  await stage.dispose();
});
it('refuses oversized, out-of-bounds or unsafe reads without allocating an entire archive', async () => {
  const stage = await createBookBackupStage(guard);
  await expect(stage.finish()).rejects.toThrow();
  await stage.write(new Uint8Array(12));
  const source = await stage.finish();
  for (const [offset, length] of [
    [-1, 1],
    [0, -1],
    [0, 13],
    [0, 1048577],
    [Number.MAX_SAFE_INTEGER, 1],
    [0.5, 1],
  ])
    await expect(source.read(offset!, length!)).rejects.toThrow();
  await stage.dispose();
});
it('aborts a failed physical write and never offers a readable staged source', async () => {
  const stage = await createBookBackupStage(guard);
  root.faults.write = new Error('quota');
  await expect(stage.write(new Uint8Array(65536))).rejects.toThrow('quota');
  expect((await directory()).files.get('0')!.aborted).toBe(1);
  await expect(stage.finish()).rejects.toThrow();
  await stage.dispose();
});

it('rejects non-byte views without poisoning a valid open stage', async () => {
  const stage = await createBookBackupStage(guard);
  for (const value of [
    new Int8Array(1),
    new Uint8ClampedArray(1),
    new Uint16Array(1),
    new DataView(new ArrayBuffer(1)),
    [1],
    { length: 1 },
  ])
    await expect(stage.write(value as unknown as Uint8Array)).rejects.toThrow();
  await stage.write(new Uint8Array([42]));
  const source = await stage.finish();
  expect(await source.read(0, 1)).toEqual(new Uint8Array([42]));
  await stage.dispose();
});
