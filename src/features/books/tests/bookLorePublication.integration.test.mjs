// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { publishBook } from '../services/publicationService';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { seedBookLoreRead } from '../../../../functions/test/helpers/bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from '../../../../functions/test/helpers/bookLoreGenerationFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from '../../../../functions/test/helpers/bookLoreCreationAdoptionFixture.mjs';
import { createBookPublicationService } from '../../../../functions/src/bookLorePublication.mjs';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { createBookLoreEditTransportService } from '../../../../functions/src/bookLoreEditTransport.mjs';
const state = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'author' } },
  get: vi.fn(),
  list: vi.fn(),
  commit: vi.fn(),
  rpc: vi.fn(),
  writes: [],
}));
vi.mock('@/features/scenes', () => ({ deleteSceneBook: vi.fn() }));
vi.mock('../services/chapterCompositionService', () => ({
  resolveChapterContent: async (_id, chapter) => ({ id: chapter.id, content: chapter.content }),
}));
vi.mock('@/shared/lib', () => ({
  auth: state.auth,
  getFirebaseApp: () => ({ app: 'writer' }),
  firestore: {},
  renderRichText: (html) => html,
}));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({ region: 'us-central1' }),
  httpsCallable: (_functions, method) => async (data) => ({ data: await state.rpc(method, data) }),
}));
vi.mock('firebase/firestore', () => {
  const ref = (parent, parts, random = false) => {
    const path = [parent.path, ...parts, ...(random ? ['revision-integration'] : [])]
      .filter(Boolean)
      .join('/');
    return { path, id: path.split('/').at(-1) };
  };
  return {
    collection: (parent, ...parts) => ref(parent, parts),
    doc: (parent, ...parts) => ref(parent, parts, !parts.length),
    getDocFromServer: state.get,
    getDocsFromServer: state.list,
    serverTimestamp: () => 0,
    runTransaction: () => {
      throw new Error('Native flow cannot use client activation');
    },
    writeBatch: () => {
      const writes = [];
      return {
        set: (ref, data) => writes.push({ ref, data }),
        commit: () => state.commit(writes),
        update: () => {
          throw new Error('Client cannot activate native publication');
        },
      };
    },
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  state.auth.currentUser = { uid: 'author' };
  state.writes.length = 0;
});
async function fixture(mode = 'v2', { world = false } = {}) {
  const f = adventureImportDb({ nativeUpdates: true }),
    value = {
      name: 'Public 🌙',
      category: 'character',
      summary: 'Public summary',
      aliases: ['A', 'A'],
      isPublic: true,
      details: 'PRIVATE_DETAILS',
      structuredDetails: { notes: 'PRIVATE_NOTES' },
    };
  let id = 'aria',
    seed;
  if (mode === 'created') {
    const creation = await creationAdoptionFixture(f.db, {
      changes: Object.entries(value).map(([field, value]) => ({ target: { field }, value })),
    });
    await adoptCreation(creation);
    id = creation.loreId;
    seed = creation.source.seed;
  } else if (mode === 'v2')
    seed = await seedBookLoreGeneration(f.db, { id, noBase: true, fields: value });
  else seed = await seedBookLoreRead(f.db, { id, inline: mode === 'inline', data: value });
  await f.db.runTransaction(async (tx) => {
    const root = f.db.doc('books/book'),
      before = (await tx.get(root)).data();
    tx.update(root, {
      title: 'Book',
      status: 'draft',
      updatedAt: 500,
      hasLoreResources: true,
      localLoreVersion: before.localLoreVersion ?? 0,
    });
    tx.create(f.db.doc('books/book/chapters/chapter'), {
      title: 'Chapter',
      content: '<p>Public chapter</p>',
      order: 1,
    });
  });
  if (world) {
    await f.db.runTransaction((tx) => {
      tx.create(f.db.doc('universes/world'), {
        authorId: 'author',
        privacyVersion: 0,
        loreVersion: 0,
      });
      tx.create(f.db.doc('publicUniversePrivacy/world'), { active: true, version: 0 });
      tx.create(f.db.doc('universes/world/lore/global'), {
        name: 'Hidden',
        category: 'other',
        summary: 'Global',
        aliases: [],
        isPublic: true,
      });
      tx.update(f.db.doc('books/book'), { universeId: 'world' });
    });
    await seedBookLoreGeneration(f.db, {
      id: 'private',
      noBase: true,
      fields: { name: 'Local private', category: 'other', aliases: ['Hidden'], isPublic: false },
    });
  }
  const publication = createBookPublicationService({ db: f.db }),
    reader = createBookLoreReadService({ db: f.db });
  const handle = async (method, data) => {
    const api =
      method === 'bookLoreEdit'
        ? createBookLoreEditTransportService({ db: f.db })
        : publication[method]
          ? publication
          : reader;
    const result = await api[method](state.auth.currentUser.uid, JSON.parse(JSON.stringify(data)));
    return JSON.parse(JSON.stringify(result));
  };
  state.rpc.mockImplementation(handle);
  const snapshot = (s) => ({
    id: s.id,
    ref: { path: s.ref.path, id: s.id },
    exists: () => s.exists,
    data: () => s.data(),
  });
  state.get.mockImplementation(async (ref) =>
    snapshot(await f.db.runTransaction((tx) => tx.get(f.db.doc(ref.path)))),
  );
  state.list.mockImplementation(async (ref) => {
    const rows = await f.db.runTransaction((tx) =>
      tx.get(f.db.collection(ref.path).orderBy('__name__').limit(10000)),
    );
    return { docs: rows.docs.map(snapshot), size: rows.docs.length };
  });
  state.commit.mockImplementation(async (writes) => {
    state.writes.push(...writes);
    await f.db.runTransaction((tx) => {
      for (const write of writes) tx.create(f.db.doc(write.ref.path), write.data);
    });
  });
  return { ...f, id, seed, publication, handle };
}
it.each(['inline', 'v1', 'v2', 'created'])(
  'real C1/client/publication service roundtrip for %s exposes only the approved projection',
  async (mode) => {
    const f = await fixture(mode);
    await publishBook('book', 'Explicit Author');
    expect(f.records.get('publicBooks/book')).toMatchObject({
      authorName: 'Explicit Author',
      revisionId: 'revision-integration',
    });
    expect(f.records.get('publicBooks/book/revisions/revision-integration/lore/' + f.id)).toEqual({
      name: 'Public 🌙',
      aliases: ['A', 'A'],
      category: 'character',
      summary: 'Public summary',
    });
    expect(JSON.stringify(state.writes)).not.toContain('PRIVATE_');
    const stage = state.rpc.mock.calls.find(([method]) => method === 'stageBookPublicationLore')[1];
    expect(JSON.stringify(stage)).not.toContain('PRIVATE_');
    expect(stage).not.toHaveProperty('details');
    expect(
      state.rpc.mock.calls.filter(([method]) => method === 'finalizeBookPublication'),
    ).toHaveLength(1);
  },
);
it('native world proof survives the complete bridge and private local terms shadow a global public name', async () => {
  const f = await fixture('v2', { world: true });
  await publishBook('book', 'Author');
  expect(f.records.get('publicBooks/book').schemaVersion).toBe(2);
  expect(
    [...f.records.keys()].some(
      (path) =>
        path === 'publicBooks/book/revisions/revision-integration/lore/universe:world:global',
    ),
  ).toBe(false);
});
it('a malformed world proof fails before staging and cannot fall back to raw heads', async () => {
  const f = await fixture('v2', { world: true });
  state.rpc.mockImplementation(async (method, data) => {
    const result = await f.handle(method, data);
    if (method === 'getBookPublicationSource') result.source.universeStamp = null;
    return result;
  });
  await expect(publishBook('book', 'Author')).rejects.toThrow();
  expect(state.writes).toEqual([]);
  expect(f.records.has('publicBooks/book')).toBe(false);
});
it('same UID in a different Auth object discards the first late publication response', async () => {
  const f = await fixture();
  state.rpc.mockImplementation(async (method, data) => {
    const result = await f.handle(method, data);
    state.auth.currentUser = { uid: 'author' };
    return result;
  });
  await expect(publishBook('book', 'Author')).rejects.toThrow('contexto mudou');
  expect(state.rpc.mock.calls).toHaveLength(1);
  expect(state.writes).toEqual([]);
});
it('a changed native clock after staging leaves it invisible and never calls final activation', async () => {
  const f = await fixture(),
    commit = state.commit.getMockImplementation();
  state.commit.mockImplementation(async (writes) => {
    await commit(writes);
    await f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { localLoreVersion: 1 }));
  });
  await expect(publishBook('book', 'Author')).rejects.toThrow();
  expect(f.records.has('publicBooks/book')).toBe(false);
  expect(f.records.has('publicBooks/book/revisions/revision-integration')).toBe(true);
  expect(state.rpc.mock.calls.some(([method]) => method === 'finalizeBookPublication')).toBe(false);
});
it('lost final response has one committed effect and explicit native retry confirms the same event', async () => {
  const f = await fixture();
  state.rpc.mockImplementation(async (method, data) => {
    const result = await f.handle(method, data);
    if (method === 'finalizeBookPublication') throw new Error('Lost response');
    return result;
  });
  await expect(publishBook('book', 'Author')).rejects.toThrow('Lost response');
  const before = structuredClone([...f.records]),
    request = state.rpc.mock.calls.find(([method]) => method === 'finalizeBookPublication')[1];
  expect((await f.publication.finalizeBookPublication('author', request)).status).toBe(
    'already-published',
  );
  expect([...f.records]).toEqual(before);
  expect(
    state.rpc.mock.calls.filter(([method]) => method === 'finalizeBookPublication'),
  ).toHaveLength(1);
});

it('an empty native collection still uses certified server activation without recreating local lore', async () => {
  const f = await fixture();
  await f.db.runTransaction((tx) => {
    tx.delete(f.db.doc('books/book/lore/' + f.id));
    tx.update(f.db.doc('books/book'), { localLoreVersion: 1 });
  });
  await publishBook('book', 'Author');
  expect(f.records.get('publicBooks/book').revisionId).toBe('revision-integration');
  expect(f.records.get('publicBooks/book/revisions/revision-integration').loreCount).toBe(0);
  expect(state.rpc.mock.calls.some(([method]) => method === 'stageBookPublicationLore')).toBe(
    false,
  );
});

it('legacy missing book dates use the source baseline without inventing a creation date', async () => {
  const f = await fixture();
  delete f.records.get('books/book').updatedAt;
  const createdAt = f.records.get('books/book').createdAt;
  await publishBook('book', 'Author');
  expect(f.records.get('publicBooks/book').revisionId).toBe('revision-integration');
  expect(f.records.get('books/book').createdAt).toBe(createdAt);
});

it('resumes an inspection whose advance committed but its reply was lost, then stages through the real bridge', async () => {
  const f = await fixture('v2');
  let lost = false;
  state.rpc.mockImplementation(async (method, data) => {
    const result = await f.handle(method, data);
    if (!lost && method === 'bookLoreEdit' && data.method === 'advanceBookLoreSourceInspection') {
      lost = true;
      throw new Error('Lost inspection reply');
    }
    return result;
  });
  await expect(publishBook('book', 'Author')).rejects.toThrow('Lost inspection reply');
  expect(f.records.has('publicBooks/book')).toBe(false);
  const { bookPublicationSession } = await import('../services/bookLorePublicationClient'),
    session = bookPublicationSession('book', 'author'),
    capture = await session.capture();
  await session.stage(capture, 'revision-integration', f.id, ['A']);
  await session.finalize(capture, 'revision-integration', 'Author');
  expect(
    f.records.get('publicBooks/book/revisions/revision-integration/lore/' + f.id).aliases,
  ).toEqual(['A']);
  expect(f.records.get('publicBooks/book').revisionId).toBe('revision-integration');
  const starts = state.rpc.mock.calls.filter(
    ([method, data]) =>
      method === 'bookLoreEdit' && data.method === 'startBookLoreSourceInspection',
  );
  expect(starts).toHaveLength(2);
  expect(starts[0][1].input).toEqual(starts[1][1].input);
});
it('discards a late inspection reply after the Auth object changes, before staging a public fiche', async () => {
  const f = await fixture('v2');
  state.rpc.mockImplementation(async (method, data) => {
    const result = await f.handle(method, data);
    if (method === 'bookLoreEdit') state.auth.currentUser = { uid: 'author' };
    return result;
  });
  await expect(publishBook('book', 'Author')).rejects.toThrow('contexto mudou');
  expect(state.rpc.mock.calls.some(([method]) => method === 'stageBookPublicationLore')).toBe(
    false,
  );
  expect(f.records.has('publicBooks/book')).toBe(false);
});
