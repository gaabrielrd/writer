// @vitest-environment node
import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'author' } },
  app: vi.fn(),
  functions: vi.fn(),
  callable: vi.fn(),
  invoke: vi.fn(),
  fixture: null,
  used: new Set(),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: m.functions,
  httpsCallable: (_f, name, settings) => {
    m.callable(name, settings);
    return async (input) => ({ data: await m.invoke(name, input) });
  },
}));
vi.mock('@/shared/lib', () => ({ auth: m.auth, getFirebaseApp: m.app }));
import {
  createAdventureArchiveApi,
  ADVENTURE_ARCHIVE_METHODS,
} from '../services/adventureArchiveCallables.ts';
import {
  ADVENTURE_BACKUP_METHODS,
  invokeAdventureBackupCallable,
} from '../../../../functions/src/adventureBackupCallable.mjs';
import { adventureBackupExportFixture } from '../../../../functions/test/helpers/adventureBackupExportFixture.mjs';
import { saveAdventureBackup } from '../services/saveAdventureBackup.ts';
const id = 'native-adventure-0001',
  h = 'a'.repeat(64),
  anchor = { adventureId: id, sourceToken: h },
  page = { cursor: null, limit: 25 },
  unit = { id: 'native-resource-0001', itemToken: h, index: 0 };
const inputs = {
  getAdventureBackupSource: { adventureId: id },
  listAdventureBackupStructure: { ...anchor, kind: 'part', ...page },
  readAdventureBackupStructure: { ...anchor, kind: 'adventure', ...unit },
  listAdventureBackupResources: { ...anchor, kind: 'scene', parentId: null, ...page },
  readAdventureBackupResource: { ...anchor, kind: 'scene', parentId: null, ...unit },
  listAdventureBackupLore: { ...anchor, kind: 'lore', ...page },
  readAdventureBackupLore: { ...anchor, kind: 'lore', ...unit },
  listAdventureBackupPersonaBindings: { ...anchor, scope: 'scene', ...page },
  readAdventureBackupPersona: { ...anchor, scope: 'scene', ...unit },
  listAdventureBackupHistory: {
    ...anchor,
    kind: 'version',
    parentId: 'native-parent-0001',
    parentToken: h,
    ...page,
  },
  readAdventureBackupHistory: {
    ...anchor,
    kind: 'version',
    parentId: 'native-parent-0001',
    parentToken: h,
    ...unit,
  },
  readAdventureBackupHistoryText: {
    ...anchor,
    kind: 'version-chunk',
    parentId: 'native-parent-0001',
    parentToken: h,
    ordinal: 0,
  },
  listAdventureBackupImageBindings: { ...anchor, kind: 'scene', ...page },
  getAdventureBackupImage: { ...anchor, kind: 'scene', id: unit.id, bindingToken: h },
  readAdventureBackupImageChunk: {
    ...anchor,
    kind: 'scene',
    id: unit.id,
    bindingToken: h,
    imageToken: h,
    index: 0,
  },
  verifyAdventureBackupImage: {
    ...anchor,
    kind: 'scene',
    id: unit.id,
    bindingToken: h,
    imageToken: h,
  },
  getAdventureBackupUniverse: anchor,
};
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.currentUser = { uid: 'author' };
  m.app.mockReturnValue('app');
  m.functions.mockReturnValue('functions');
  m.invoke.mockResolvedValue({ sentinel: true });
  m.used.clear();
});
it('factory is lazy and exact 17-method client schema matches the public server', () => {
  createAdventureArchiveApi('author', id, () => {});
  expect(m.app).not.toHaveBeenCalled();
  expect([...ADVENTURE_ARCHIVE_METHODS].sort()).toEqual([...ADVENTURE_BACKUP_METHODS].sort());
  expect(Object.isFrozen(ADVENTURE_ARCHIVE_METHODS)).toBe(true);
});
it.each(Object.entries(inputs))(
  '%s sends only normalized original metadata through correct SDK endpoint',
  async (name, input) => {
    expect(await createAdventureArchiveApi('author', id, () => {}).call(name, input)).toEqual({
      sentinel: true,
    });
    expect(m.callable).toHaveBeenCalledExactlyOnceWith(name, { timeout: 180000 });
    expect(m.invoke).toHaveBeenCalledExactlyOnceWith(name, input);
    expect(m.functions).toHaveBeenCalledExactlyOnceWith('app', 'us-central1');
  },
);
it.each(Object.entries(inputs))(
  '%s rejects unknown private fields before SDK initialization',
  async (name, input) => {
    await expect(
      createAdventureArchiveApi('author', id, () => {}).call(name, {
        ...input,
        method: 'read-secret',
        privateText: 'NO',
      }),
    ).rejects.toThrow();
    expect(m.app).not.toHaveBeenCalled();
  },
);
it.each([
  'constructor',
  '__proto__',
  'getAdventureRestoreRecoveryKey',
  'readAdventureBackupSource',
])('forbids helper %s before SDK', async (name) => {
  await expect(
    createAdventureArchiveApi('author', id, () => {}).call(name, { adventureId: id }),
  ).rejects.toThrow();
  expect(m.app).not.toHaveBeenCalled();
});
it.each([null, { uid: 'other' }])('foreign account %j sends nothing', async (user) => {
  m.auth.currentUser = user;
  await expect(
    createAdventureArchiveApi('author', id, () => {}).call('getAdventureBackupSource', {
      adventureId: id,
    }),
  ).rejects.toThrow();
  expect(m.invoke).not.toHaveBeenCalled();
});
it('captures metadata before await and rejects late account/guard, without automatic retry', async () => {
  const api = createAdventureArchiveApi('author', id, () => {}),
    value = { adventureId: id },
    p = api.call('getAdventureBackupSource', value);
  value.adventureId = 'other-adventure-0001';
  await p;
  expect(m.invoke).toHaveBeenCalledWith('getAdventureBackupSource', { adventureId: id });
  m.invoke.mockImplementation(async () => {
    m.auth.currentUser = { uid: 'other' };
    return { private: 'NO' };
  });
  await expect(api.call('getAdventureBackupSource', { adventureId: id })).rejects.toThrow();
  let active = false;
  await expect(
    createAdventureArchiveApi('author', id, () => {
      if (!active) throw Error('Expired');
    }).call('getAdventureBackupSource', { adventureId: id }),
  ).rejects.toThrow('Expired');
});
it.each([
  ['listAdventureBackupResources', { ...inputs.listAdventureBackupResources, parentId: '../bad' }],
  ['listAdventureBackupHistory', { ...inputs.listAdventureBackupHistory, parentToken: 'bad' }],
  ['readAdventureBackupResource', { ...inputs.readAdventureBackupResource, index: -1 }],
  ['listAdventureBackupLore', { ...inputs.listAdventureBackupLore, limit: 51 }],
  ['listAdventureBackupLore', { ...inputs.listAdventureBackupLore, cursor: 'bad/cursor' }],
  ['getAdventureBackupSource', { adventureId: 'other-adventure-0001' }],
])('invalid scope/counter/input is rejected for %s', async (name, input) => {
  await expect(
    createAdventureArchiveApi('author', id, () => {}).call(name, input),
  ).rejects.toThrow();
  expect(m.app).not.toHaveBeenCalled();
});
it('actual rich stream uses every SDK schema and readonly server composition, including history text and images', async () => {
  const f = await adventureBackupExportFixture(),
    before = structuredClone(f.records),
    chunks = [];
  m.invoke.mockImplementation(async (name, input) => {
    m.used.add(name);
    return invokeAdventureBackupCallable(f.api, name, f.uid, input);
  });
  const raw = createAdventureArchiveApi(f.uid, f.id, () => {});
  const api = {
    async call(name, input) {
      try {
        return await raw.call(name, input);
      } catch (cause) {
        throw Error(name + ' fields ' + Object.keys(input).join(','), { cause });
      }
    },
  };
  const proof = await saveAdventureBackup(
    f.id,
    api,
    { guard: () => {} },
    {
      write: async (b) => chunks.push(Buffer.from(b)),
      close: async () => {},
      abort: async () => {},
    },
  );
  expect(proof.validation).toBe('captured-data-only');
  expect(proof.capture.history.versions).toBe(2);
  expect(proof.capture.images.assets).toBe(2);
  expect([...m.used].sort()).toEqual([...ADVENTURE_BACKUP_METHODS].sort());
  expect(f.records).toEqual(before);
  const bytes = Buffer.concat(chunks);
  expect(bytes.length).toBeGreaterThan(65536);
  expect(bytes.includes(Buffer.from('DO_NOT_COPY_TOKEN_URL'))).toBe(false);
});

it('explicit draft is frozen before awaiting a destination, including resource and text', async () => {
  const f = await adventureBackupExportFixture(),
    chunks = [],
    draft = {
      adventureId: f.id,
      resource: { kind: 'scene', id: f.sceneId },
      content: 'Rascunho congelado 🐉',
      baseRevision: f.records.get(f.path + '/scenes/' + f.sceneId).revision,
      savedAt: 1000,
    };
  m.invoke.mockImplementation((name, input) =>
    invokeAdventureBackupCallable(f.api, name, f.uid, input),
  );
  let release;
  const saving = saveAdventureBackup(
    f.id,
    createAdventureArchiveApi(f.uid, f.id, () => {}),
    { guard: () => {}, draft },
    new Promise((r) => {
      release = r;
    }),
  );
  draft.content = 'NEVER_CAPTURE_LATER_TEXT';
  draft.resource.id = f.blockId;
  release({
    write: async (b) => chunks.push(Buffer.from(b)),
    close: async () => {},
    abort: async () => {},
  });
  const proof = await saving,
    bytes = Buffer.concat(chunks);
  expect(proof.capture.draft.count).toBe(1);
  expect(bytes.includes(Buffer.from('Rascunho congelado 🐉'))).toBe(true);
  expect(bytes.includes(Buffer.from('NEVER_CAPTURE_LATER_TEXT'))).toBe(false);
});
it('concurrent source change aborts the partial destination instead of confirming a mixed archive', async () => {
  const f = await adventureBackupExportFixture(),
    sink = {
      write: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      abort: vi.fn(async () => {}),
    };
  let changed = false;
  m.invoke.mockImplementation(async (name, input) => {
    const result = await invokeAdventureBackupCallable(f.api, name, f.uid, input);
    if (!changed && name === 'listAdventureBackupResources') {
      changed = true;
      await f.db.runTransaction((tx) =>
        tx.update(f.db.doc(f.path), {
          synopsis: 'Concorrente',
          revision: f.records.get(f.path).revision + 1,
        }),
      );
    }
    return result;
  });
  await expect(
    saveAdventureBackup(
      f.id,
      createAdventureArchiveApi(f.uid, f.id, () => {}),
      { guard: () => {} },
      sink,
    ),
  ).rejects.toThrow();
  expect(sink.write).toHaveBeenCalled();
  expect(sink.close).not.toHaveBeenCalled();
  expect(sink.abort).toHaveBeenCalledTimes(1);
});
