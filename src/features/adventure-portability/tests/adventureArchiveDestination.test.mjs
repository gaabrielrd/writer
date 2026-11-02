// @vitest-environment node
import { it, expect, vi, afterEach } from 'vitest';
import {
  adventureArchivePicker,
  openAdventureArchiveSink,
} from '../services/adventureArchiveDestination.ts';
afterEach(() => vi.unstubAllGlobals());
it('native chooser is secure-context only, keeps the .writer type and calls its window receiver', async () => {
  const handle = { createWritable: vi.fn() },
    pick = vi.fn(function (options) {
      expect(this).toBe(window);
      return Promise.resolve(handle);
    });
  vi.stubGlobal('window', { isSecureContext: true, showSaveFilePicker: pick });
  expect(adventureArchivePicker.supported()).toBe(true);
  expect(await adventureArchivePicker.pick('Aventura.writer')).toBe(handle);
  expect(pick).toHaveBeenCalledWith({
    suggestedName: 'Aventura.writer',
    types: [
      {
        description: 'Backup privado de aventura do Writer',
        accept: { 'application/octet-stream': ['.writer'] },
      },
    ],
  });
});
it.each([
  undefined,
  { isSecureContext: false, showSaveFilePicker: vi.fn() },
  { isSecureContext: true },
])('unsupported context never opens chooser %#', async (value) => {
  vi.stubGlobal('window', value);
  expect(adventureArchivePicker.supported()).toBe(false);
  await expect(async () => adventureArchivePicker.pick('a.writer')).rejects.toThrow();
});
it('write clones its bounded input, close confirms once and later abort does not undo a completed file', async () => {
  let release;
  const file = {
    write: vi.fn(async (b) => {
      await new Promise((r) => {
        release = r;
      });
      return b;
    }),
    close: vi.fn(),
    abort: vi.fn(),
  };
  const handle = { createWritable: vi.fn(async () => file) },
    sink = await openAdventureArchiveSink(handle),
    bytes = new Uint8Array([1, 2, 3]),
    writing = sink.write(bytes);
  bytes.fill(0);
  expect(file.write.mock.calls[0][0]).toEqual(new Uint8Array([1, 2, 3]));
  release();
  await writing;
  expect(handle.createWritable).toHaveBeenCalledExactlyOnceWith({ keepExistingData: false });
  await sink.close();
  await sink.abort(Error('Late'));
  expect(file.close).toHaveBeenCalledTimes(1);
  expect(file.abort).not.toHaveBeenCalled();
  await expect(sink.write(bytes)).rejects.toThrow();
  await expect(sink.close()).rejects.toThrow();
});
it('close failure permits abort, repeated abort is idempotent and aborted file cannot be reused', async () => {
  const error = Error('Disk failure'),
    file = {
      write: vi.fn(),
      close: vi.fn(async () => {
        throw error;
      }),
      abort: vi.fn(),
    };
  const sink = await openAdventureArchiveSink({ createWritable: async () => file });
  await expect(sink.close()).rejects.toBe(error);
  await sink.abort(error);
  await sink.abort(error);
  expect(file.abort).toHaveBeenCalledExactlyOnceWith(error);
  await expect(sink.write(new Uint8Array())).rejects.toThrow();
  await expect(sink.close()).rejects.toThrow();
});
it('opening failure propagates without creating a usable sink', async () => {
  const error = Error('Permission lost');
  await expect(
    openAdventureArchiveSink({
      createWritable: async () => {
        throw error;
      },
    }),
  ).rejects.toBe(error);
});
