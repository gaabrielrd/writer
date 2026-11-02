import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { exportBookArchive } from '../services/exportBookArchive';
import { exportBook, exportChapter } from './exportFixtures';
import type { BookArchivePicker } from '../services/bookArchiveDestination';
import type { saveEditorBookBackup } from '../services/bookBackup';
const account = vi.hoisted(() => ({ uid: 'private-user-id' }));
vi.mock('@/shared/lib', () => ({
  auth: {
    get currentUser() {
      return { uid: account.uid };
    },
  },
  firestore: {},
  storage: {},
  getFirebaseApp: () => ({}),
}));
vi.mock('../services/bookBackup', () => ({ saveEditorBookBackup: vi.fn() }));
beforeEach(() => {
  account.uid = exportBook.authorId;
});
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const file = {
      write: vi.fn(() => Promise.resolve()),
      close: vi.fn(() => Promise.resolve()),
      abort: vi.fn(() => Promise.resolve()),
    },
    handle = {
      createWritable: vi.fn(() => Promise.resolve(file as unknown as FileSystemWritableFileStream)),
    },
    picker: BookArchivePicker = {
      supported: vi.fn(() => true),
      pick: vi.fn(() => Promise.resolve(handle)),
    };
  const save = vi.fn<typeof saveEditorBookBackup>(async (_id, options, destination) => {
    const sink = await destination;
    try {
      options.isCurrent?.();
      await sink.write(new Uint8Array([1, 2, 3]));
      options.isCurrent?.();
      await sink.close();
      return { records: 1, payloadBytes: 3, chainHash: 'a'.repeat(64) };
    } catch (error) {
      await sink.abort(error);
      throw error;
    }
  });
  return { file, handle, picker, save, ports: { picker, save } };
}
it('starts the bounded producer before the native picker and closes only the selected destination', async () => {
  const f = fixture(),
    order: string[] = [],
    saved = f.save;
  f.ports.save = ((...args) => {
    order.push('producer');
    return saved(...args);
  }) as typeof saved;
  vi.mocked(f.picker.pick).mockImplementation((name) => {
    order.push('picker');
    expect(name).toBe('Crônicas ação & memória.writer');
    return Promise.resolve(f.handle);
  });
  expect(
    await exportBookArchive(
      { book: exportBook, currentChapter: exportChapter, currentContent: '' },
      f.ports,
    ),
  ).toEqual({ kind: 'saved' });
  expect(order).toEqual(['producer', 'picker']);
  expect(f.save).toHaveBeenCalledWith(
    exportBook.id,
    expect.objectContaining({
      draft: { chapter: exportChapter, content: '' },
    }),
    expect.any(Promise),
  );
  expect(f.handle.createWritable).toHaveBeenCalledWith({ keepExistingData: false });
  expect(f.file.write).toHaveBeenCalledOnce();
  expect(f.file.close).toHaveBeenCalledOnce();
  expect(f.file.abort).not.toHaveBeenCalled();
});
it('composed chapter exports saved scenes without declaring its composition as an unsaved draft', async () => {
  const f = fixture();
  await exportBookArchive(
    {
      book: exportBook,
      currentChapter: { ...exportChapter, contentMode: 'scenes' },
      currentContent: 'Composition',
    },
    f.ports,
  );
  expect(f.save).toHaveBeenCalledWith(
    exportBook.id,
    expect.objectContaining({ draft: null }),
    expect.any(Promise),
  );
});
it('cancelled native selection is neutral and does not open a writable file', async () => {
  const f = fixture();
  vi.mocked(f.picker.pick).mockRejectedValue(new DOMException('User cancelled', 'AbortError'));
  expect(await exportBookArchive({ book: exportBook }, f.ports)).toEqual({ kind: 'cancelled' });
  expect(f.handle.createWritable).not.toHaveBeenCalled();
  expect(f.file.close).not.toHaveBeenCalled();
});
it('unavailable platform wrong owner and wrong chapter fail before producer or file picker', async () => {
  const f = fixture();
  vi.mocked(f.picker.supported).mockReturnValue(false);
  await expect(exportBookArchive({ book: exportBook }, f.ports)).rejects.toThrow('não oferece');
  vi.mocked(f.picker.supported).mockReturnValue(true);
  await expect(
    exportBookArchive(
      { book: exportBook, currentChapter: { ...exportChapter, bookId: 'other' } },
      f.ports,
    ),
  ).rejects.toThrow('não pertence');
  account.uid = 'other';
  await expect(exportBookArchive({ book: exportBook }, f.ports)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(f.save).not.toHaveBeenCalled();
  expect(f.picker.pick).not.toHaveBeenCalled();
});
it('account change while choosing never opens a writable destination', async () => {
  const f = fixture();
  vi.mocked(f.picker.pick).mockImplementation(() => {
    account.uid = 'other';
    return Promise.resolve(f.handle);
  });
  await expect(exportBookArchive({ book: exportBook }, f.ports)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(f.handle.createWritable).not.toHaveBeenCalled();
});
it('abort after opening the temporary writable aborts it without writing or closing', async () => {
  const f = fixture(),
    controller = new AbortController();
  f.handle.createWritable.mockImplementation(() => {
    controller.abort();
    return Promise.resolve(f.file as unknown as FileSystemWritableFileStream);
  });
  await expect(
    exportBookArchive({ book: exportBook, signal: controller.signal }, f.ports),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.file.abort).toHaveBeenCalledOnce();
  expect(f.file.write).not.toHaveBeenCalled();
  expect(f.file.close).not.toHaveBeenCalled();
});
it('a sink close failure propagates without reporting a saved backup', async () => {
  const f = fixture(),
    error = new Error('Disk close failed');
  f.file.close.mockRejectedValueOnce(error);
  await expect(exportBookArchive({ book: exportBook }, f.ports)).rejects.toBe(error);
  expect(f.file.abort).toHaveBeenCalledOnce();
});
it('picker failure preserves its error and abort cleanup failure is not hidden', async () => {
  const f = fixture(),
    error = new Error('Permission unavailable');
  vi.mocked(f.picker.pick).mockRejectedValueOnce(error);
  await expect(exportBookArchive({ book: exportBook }, f.ports)).rejects.toBe(error);
  const g = fixture(),
    controller = new AbortController();
  g.handle.createWritable.mockImplementation(() => {
    controller.abort();
    return Promise.resolve(g.file as unknown as FileSystemWritableFileStream);
  });
  g.file.abort.mockRejectedValueOnce(new Error('Abort failed'));
  await expect(
    exportBookArchive({ book: exportBook, signal: controller.signal }, g.ports),
  ).rejects.toBeInstanceOf(AggregateError);
  expect(g.file.close).not.toHaveBeenCalled();
});
