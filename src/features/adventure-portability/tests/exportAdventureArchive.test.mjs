// @vitest-environment node
import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: { currentUser: { uid: 'author' } } }));
vi.mock('@/shared/lib', () => ({ auth: m.auth }));
import {
  exportAdventureArchive,
  adventureArchiveFileName,
} from '../services/exportAdventureArchive.ts';
const input = () => ({
  ownerId: 'author',
  adventureId: 'export-native-adventure-0001',
  title: 'Crônicas ação & memória',
});
function ports() {
  const events = [],
    file = {
      write: vi.fn(async () => {
        events.push('write');
      }),
      close: vi.fn(async () => {
        events.push('close');
      }),
      abort: vi.fn(async () => {
        events.push('abort');
      }),
    };
  const handle = {
    createWritable: vi.fn(async () => {
      events.push('open');
      return file;
    }),
  };
  const picker = {
    supported: () => true,
    pick: vi.fn(async () => {
      events.push('pick');
      return handle;
    }),
  };
  const save = vi.fn((id, api, options, destination) => {
    events.push('construct');
    return (async () => {
      const sink = await destination;
      options.guard();
      await sink.write(new Uint8Array([1]));
      await sink.close();
      options.guard();
      return {};
    })();
  });
  return { events, file, handle, picker, save };
}
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.currentUser = { uid: 'author' };
});
it('starts producer before chooser and confirms success only after the native sink closes', async () => {
  const p = ports();
  expect(await exportAdventureArchive(input(), p)).toEqual({ kind: 'saved' });
  expect(p.events).toEqual(['construct', 'pick', 'open', 'write', 'close']);
  expect(p.picker.pick).toHaveBeenCalledWith('Aventura - Crônicas ação & memória.writer');
  expect(p.save.mock.calls[0][2].draft).toBeNull();
  expect(p.file.abort).not.toHaveBeenCalled();
});
it('normalizes safe Unicode names without a Windows reserved basename or split surrogate', () => {
  expect(adventureArchiveFileName('CON')).toBe('Aventura - CON.writer');
  expect(adventureArchiveFileName(' a/b:*?"<>|. ')).toBe('Aventura - a b.writer');
  expect(adventureArchiveFileName('🐉'.repeat(101))).toBe(
    'Aventura - ' + '🐉'.repeat(100) + '.writer',
  );
  expect(adventureArchiveFileName('')).toBe('Aventura - sem título.writer');
});
it('native chooser cancellation is separate from disk or close failure', async () => {
  const p = ports();
  p.picker.pick.mockRejectedValueOnce(new DOMException('User canceled', 'AbortError'));
  expect(await exportAdventureArchive(input(), p)).toEqual({ kind: 'cancelled' });
  expect(p.handle.createWritable).not.toHaveBeenCalled();
  expect(p.file.write).not.toHaveBeenCalled();
  const disk = ports(),
    failure = Error('Disk');
  disk.handle.createWritable.mockRejectedValueOnce(failure);
  await expect(exportAdventureArchive(input(), disk)).rejects.toBe(failure);
  const close = ports();
  close.file.close.mockRejectedValueOnce(failure);
  await expect(exportAdventureArchive(input(), close)).rejects.toBe(failure);
});
it('unsupported or foreign account never starts producer or chooser', async () => {
  const p = ports();
  p.picker.supported = () => false;
  await expect(exportAdventureArchive(input(), p)).rejects.toThrow();
  expect(p.save).not.toHaveBeenCalled();
  m.auth.currentUser = { uid: 'other' };
  await expect(exportAdventureArchive(input(), ports())).rejects.toThrow();
});
it('scope loss while choosing or while opening aborts without file writes', async () => {
  const p = ports();
  p.picker.pick.mockImplementation(async () => {
    m.auth.currentUser = { uid: 'other' };
    return p.handle;
  });
  await expect(exportAdventureArchive(input(), p)).rejects.toThrow();
  expect(p.handle.createWritable).not.toHaveBeenCalled();
  m.auth.currentUser = { uid: 'author' };
  const q = ports();
  q.handle.createWritable.mockImplementation(async () => {
    m.auth.currentUser = { uid: 'other' };
    return q.file;
  });
  await expect(exportAdventureArchive(input(), q)).rejects.toThrow();
  expect(q.file.abort).toHaveBeenCalledTimes(1);
  expect(q.file.write).not.toHaveBeenCalled();
});
it('chooser abort is not reported as cancellation after account retirement', async () => {
  const p = ports();
  p.picker.pick.mockImplementation(async () => {
    m.auth.currentUser = { uid: 'other' };
    throw new DOMException('Canceled', 'AbortError');
  });
  await expect(exportAdventureArchive(input(), p)).rejects.toThrow();
});
it('captures guard and signal before waiting for chooser and does not adopt a replacement scope', async () => {
  const p = ports(),
    c = new AbortController(),
    value = { ...input(), signal: c.signal, check: vi.fn() };
  let release;
  p.picker.pick.mockImplementation(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const result = exportAdventureArchive(value, p);
  value.check = () => {};
  value.signal = undefined;
  c.abort();
  release(p.handle);
  await expect(result).rejects.toThrow();
  expect(p.file.write).not.toHaveBeenCalled();
});
it('opening cancellation after a sink exists preserves a cleanup failure rather than faking success', async () => {
  const p = ports(),
    failure = Error('Abort failed');
  p.file.abort.mockRejectedValue(failure);
  p.handle.createWritable.mockImplementation(async () => {
    m.auth.currentUser = { uid: 'other' };
    return p.file;
  });
  await expect(exportAdventureArchive(input(), p)).rejects.toBeInstanceOf(AggregateError);
  expect(p.file.close).not.toHaveBeenCalled();
});
