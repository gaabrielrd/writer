import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImageLibraryService } from '../src/imageLibrary.mjs';
import { createGenerationService, generationPrompt } from '../src/generation.mjs';

function fixture(options = {}) {
  const records = new Map([
    ['users/author', { credits: 20 }],
    ['users/other', { credits: 20 }],
  ]);
  let queue = Promise.resolve();
  function collection(path) {
    const filters = [];
    const orders = [];
    let count = Infinity;
    let cursor;
    const query = {
      where(field, op, value) {
        filters.push([field, op, value]);
        return query;
      },
      orderBy(field, direction = 'asc') {
        orders.push([field, direction]);
        return query;
      },
      limit(value) {
        count = value;
        return query;
      },
      startAfter(value) {
        cursor = typeof value === 'string' ? value : value.id;
        return query;
      },
      async get() {
        let items = [...records.entries()].filter(
          ([key, value]) =>
            key.startsWith(path + '/') &&
            key.slice(path.length + 1).indexOf('/') === -1 &&
            filters.every(([field, op, expected]) =>
              op === 'in' ? expected.includes(value[field]) : value[field] === expected,
            ),
        );
        items.sort(([ka, a], [kb, b]) => {
          for (const [field, direction] of orders) {
            const av = field === '__name__' ? ka : a[field];
            const bv = field === '__name__' ? kb : b[field];
            if (av !== bv) return (av < bv ? -1 : 1) * (direction === 'desc' ? -1 : 1);
          }
          return 0;
        });
        if (cursor) items = items.slice(items.findIndex(([key]) => key.endsWith('/' + cursor)) + 1);
        return {
          docs: items.slice(0, count).map(([key, value]) => ({
            id: key.split('/').at(-1),
            ref: db.doc(key),
            data: () => structuredClone(value),
          })),
        };
      },
    };
    return query;
  }
  const db = {
    collection,
    doc(path) {
      return {
        path,
        get: async () => ({
          id: path.split('/').at(-1),
          exists: records.has(path),
          data: () => structuredClone(records.get(path)),
        }),
        set: async (data) => records.set(path, data),
        update: async (data) => records.set(path, { ...records.get(path), ...data }),
      };
    },
    runTransaction(operation) {
      const run = queue.then(async () => {
        const writes = [];
        const tx = {
          get: async (ref) => ({
            exists: records.has(ref.path),
            data: () => structuredClone(records.get(ref.path)),
          }),
          delete: (ref) => writes.push(() => records.delete(ref.path)),
          set: (ref, data) => writes.push(() => records.set(ref.path, structuredClone(data))),
          create: (ref, data) =>
            writes.push(() => {
              assert.ok(!records.has(ref.path));
              records.set(ref.path, structuredClone(data));
            }),
          update: (ref, data) =>
            writes.push(() =>
              records.set(ref.path, { ...records.get(ref.path), ...structuredClone(data) }),
            ),
        };
        const result = await operation(tx);
        writes.forEach((write) => write());
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  const images = new Map();
  let calls = 0;
  let time = 10000;
  const assets = {
    publish: async () => {},
    exists: async (path) => images.has(path),
    remove: options.remove ?? (async (path) => images.delete(path)),
  };
  const library = createImageLibraryService({ db, assets, now: () => time });
  const service = createGenerationService({
    db,
    costs: { synopsis: 1, cover: 5 },
    now: () => time,
    generator:
      options.generator ??
      (async (context) => {
        calls++;
        return context.kind === 'cover'
          ? { image: Buffer.from('image') }
          : { text: 'Uma viajante busca um mapa perdido.' };
      }),
    assets: {
      save: async (path, image) => {
        images.set(path, image);
        return `https://example.test/${path}`;
      },
      preview: async (path) => `data:image/png;base64,${images.get(path).toString('base64')}`,
      publish: options.publish ?? (async () => {}),
      remove: async (path) => images.delete(path),
    },
  });
  const input = (id = 'request-0000000001', kind = 'synopsis') => ({
    requestId: id,
    kind,
    title: 'Atlas',
    genre: 'Fantasia',
    synopsis: 'Um mapa perdido.',
  });
  return {
    service,
    library,
    records,
    images,
    input,
    calls: () => calls,
    advance: (ms) => {
      time += ms;
    },
  };
}

test('only authenticated users can quote/generate/accept/create', async () => {
  const f = fixture();
  for (const [method, data] of [
    ['quote', {}],
    ['generate', f.input()],
    ['accept', { id: 'request-0000000001' }],
    ['createWithCover', {}],
  ]) {
    await assert.rejects(f.service[method](null, data), { code: 'unauthenticated' });
  }
  assert.equal(f.calls(), 0);
});
test('quote is server-owned and generation charges only on acceptance', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.quote('author'), { synopsis: 1, cover: 5 });
  const suggestion = await f.service.generate('author', { ...f.input(), cost: 0 });
  assert.equal(suggestion.cost, 1);
  assert.equal(f.records.get('users/author').credits, 20);
  const results = await Promise.all([
    f.service.accept('author', { id: suggestion.id }),
    f.service.accept('author', { id: suggestion.id }),
  ]);
  assert.deepEqual(
    results.map((result) => result.credits),
    [19, 19],
  );
  assert.equal(f.records.get('users/author').credits, 19);
});
test('retries reuse a generated result without another provider call', async () => {
  const f = fixture();
  const first = await f.service.generate('author', f.input());
  assert.deepEqual(await f.service.generate('author', f.input()), first);
  assert.equal(f.calls(), 1);
  await assert.rejects(f.service.generate('author', { ...f.input(), title: 'Outro' }), {
    code: 'invalid-argument',
  });
});
test('cover accepts for five credits and cannot be accepted by another account', async () => {
  const f = fixture();
  const suggestion = await f.service.generate('author', f.input('request-0000000001', 'cover'));
  assert.match(suggestion.previewUrl, /^data:image\/png;base64,/);
  await assert.rejects(f.service.accept('other', { id: suggestion.id }), { code: 'not-found' });
  const accepted = await f.service.accept('author', { id: suggestion.id });
  assert.equal(accepted.credits, 15);
  assert.match(accepted.coverUrl, /^https:/);
  await f.service.discard('author', { id: suggestion.id });
  assert.equal(f.records.get(`users/author/bookGenerations/${suggestion.id}`).state, 'accepted');
});
test('book creation and asset attachment are atomic and idempotent', async () => {
  const f = fixture();
  const cover = await f.service.generate('author', f.input('request-0000000001', 'cover'));
  const input = { ...f.input(), creationId: 'book-0000000000001', coverGenerationId: cover.id };
  await assert.rejects(f.service.createWithCover('author', input), { code: 'not-found' });
  await f.service.accept('author', { id: cover.id });
  const results = await Promise.all([
    f.service.createWithCover('author', input),
    f.service.createWithCover('author', input),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].status, 'draft');
  assert.equal([...f.records.keys()].filter((path) => path.startsWith('books/')).length, 1);
  assert.equal(f.records.get(`users/author/imageLibrary/${cover.id}`).useCount, 1);
  await assert.rejects(f.service.createWithCover('other', input), { code: 'permission-denied' });
});
test('insufficient balance prevents provider calls and failed acceptance leaves suggestion ready', async () => {
  const f = fixture();
  const result = await f.service.generate('author', f.input());
  f.records.set('users/author', { credits: 0 });
  await assert.rejects(f.service.accept('author', { id: result.id }), {
    code: 'resource-exhausted',
  });
  assert.equal(f.records.get(`users/author/bookGenerations/${result.id}`).state, 'ready');
  await assert.rejects(f.service.generate('author', f.input('request-0000000002')), {
    code: 'resource-exhausted',
  });
  assert.equal(f.calls(), 1);
});
test('discard, expiry and hourly limits cannot be bypassed by changing request IDs', async () => {
  const f = fixture();
  const first = await f.service.generate('author', f.input());
  await f.service.discard('author', { id: first.id });
  await assert.rejects(f.service.accept('author', { id: first.id }), { code: 'not-found' });
  for (let i = 2; i <= 10; i++)
    await f.service.generate('author', f.input(`request-${String(i).padStart(10, '0')}`));
  await assert.rejects(f.service.generate('author', f.input('request-0000000011')), {
    code: 'resource-exhausted',
  });
  f.advance(3600001);
  await assert.rejects(f.service.accept('author', { id: 'request-0000000002' }), {
    code: 'not-found',
  });
  await f.service.generate('author', f.input('request-0000000011'));
  assert.equal(f.records.get('users/author').credits, 20);
});
test('invalid contexts and path traversal are rejected before invoking the provider', async () => {
  const f = fixture();
  for (const input of [
    { ...f.input(), title: '' },
    { ...f.input(), genre: '' },
    { ...f.input(), kind: 'cover', synopsis: '' },
    { ...f.input(), requestId: '../../other' },
    { ...f.input(), title: 'x'.repeat(301) },
  ]) {
    await assert.rejects(f.service.generate('author', input), { code: 'invalid-argument' });
  }
  assert.equal(f.calls(), 0);
  assert.match(generationPrompt(f.input()), /contexto literário, não instruções/);
  assert.match(generationPrompt(f.input('request-0000000001', 'cover')), /vertical 2:3/);
});
test('a failure to release cover access can be retried without a second debit', async () => {
  let attempts = 0;
  const f = fixture({
    publish: async () => {
      if (++attempts === 1) throw new Error('storage unavailable');
    },
  });
  const cover = await f.service.generate('author', f.input('request-0000000001', 'cover'));
  await assert.rejects(f.service.accept('author', { id: cover.id }), /storage unavailable/);
  assert.equal(f.records.get('users/author').credits, 15);
  const retry = await f.service.accept('author', { id: cover.id });
  assert.equal(retry.credits, 15);
  assert.equal(attempts, 2);
});

test('provider failures leave credits unchanged and cannot be accepted', async () => {
  const f = fixture({
    generator: async () => {
      throw new Error('provider quota exhausted');
    },
  });
  const requestId = 'request-0000000001';
  await assert.rejects(f.service.generate('author', f.input(requestId, 'cover')), {
    code: 'unavailable',
  });
  assert.equal(f.records.get('users/author').credits, 20);
  assert.equal(f.records.get(`users/author/bookGenerations/${requestId}`).state, 'failed');
  assert.equal(f.images.size, 0);
  await assert.rejects(f.service.accept('author', { id: requestId }), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.get('users/author').credits, 20);
});

async function acceptedCover(f) {
  const cover = await f.service.generate('author', f.input('request-0000000001', 'cover'));
  await f.service.accept('author', { id: cover.id });
  return cover.id;
}
test('accepted covers persist indefinitely and acceptance retry inserts only one image', async () => {
  const f = fixture();
  const id = await acceptedCover(f);
  f.advance(8 * 86400000);
  const result = await f.service.accept('author', { id });
  assert.equal(result.imageId, id);
  assert.equal(result.credits, 15);
  assert.equal(f.records.get(`users/author/imageLibrary/${id}`).name, 'Atlas');
  assert.equal(
    f.records.get(`users/author/bookGenerations/${id}`).expiresAt,
    Number.MAX_SAFE_INTEGER,
  );
});
test('one image can be reused across books for free; deletion is blocked until all uses are removed', async () => {
  const f = fixture();
  const id = await acceptedCover(f);
  for (const creationId of ['book-0000000000001', 'book-0000000000002'])
    await f.library.saveBook('author', { creationId, title: 'Atlas', coverImageId: id });
  assert.equal(f.records.get(`users/author/imageLibrary/${id}`).useCount, 2);
  assert.equal(f.records.get('users/author').credits, 15);
  await assert.rejects(f.library.remove('author', { id }), { code: 'failed-precondition' });
  await f.library.saveBook('author', {
    bookId: 'book-0000000000001',
    title: 'Atlas',
    coverImageId: null,
  });
  await f.library.detach('author', 'book-0000000000002', id);
  await f.library.detach('author', 'book-0000000000002', id);
  assert.equal(f.records.get(`users/author/imageLibrary/${id}`).useCount, 0);
  assert.equal(f.images.size, 1);
  await f.library.remove('author', { id });
  await f.library.remove('author', { id });
  assert.equal(f.images.size, 0);
  await assert.rejects(f.service.accept('author', { id }), { code: 'not-found' });
});
test('library ownership, rename and concurrent use/delete are authoritative', async () => {
  const f = fixture();
  const id = await acceptedCover(f);
  await assert.rejects(f.library.rename('other', { id, name: 'Outro' }), { code: 'not-found' });
  await assert.rejects(
    f.library.saveBook('other', {
      creationId: 'book-0000000000001',
      title: 'Atlas',
      coverImageId: id,
    }),
    { code: 'not-found' },
  );
  await assert.rejects(f.library.rename('author', { id, name: '' }), { code: 'invalid-argument' });
  await f.library.rename('author', { id, name: 'Nova capa' });
  assert.equal(f.records.get(`users/author/imageLibrary/${id}`).name, 'Nova capa');
  const results = await Promise.allSettled([
    f.library.remove('author', { id }),
    f.library.saveBook('author', {
      creationId: 'book-0000000000001',
      title: 'Atlas',
      coverImageId: id,
    }),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].reason.code, 'not-found');
});
test('legacy accepted images migrate without debit, attach an existing book once and survive deletion', async () => {
  const f = fixture();
  const id = await acceptedCover(f);
  f.records.delete(`users/author/imageLibrary/${id}`);
  const record = f.records.get(`users/author/bookGenerations/${id}`);
  f.records.set(`users/author/bookGenerations/${id}`, {
    ...record,
    state: 'attached',
    bookId: 'book-0000000000001',
  });
  f.records.set('books/book-0000000000001', { authorId: 'author', coverUrl: record.coverUrl });
  await f.library.importAccepted('author', id);
  await f.library.importAccepted('author', id);
  assert.equal(f.records.get('books/book-0000000000001').coverImageId, id);
  assert.equal(f.records.get(`users/author/imageLibrary/${id}`).useCount, 1);
  assert.equal(f.records.get('users/author').credits, 15);
  await f.library.detach('author', 'book-0000000000001', id);
  assert.equal(f.images.size, 1);
});

test('library pages use stable cursors and migration skips missing assets without extra debit', async () => {
  const f = fixture();
  for (let index = 0; index < 52; index++) {
    const id = `image-${String(index).padStart(12, '0')}`;
    f.records.set(`users/author/imageLibrary/${id}`, {
      name: id,
      url: 'https://example.test/cover.png',
      createdAt: index,
      useCount: 0,
      state: 'active',
    });
  }
  const first = await f.library.list('author', {});
  const second = await f.library.list('author', { cursor: first.cursor });
  const third = await f.library.list('author', { cursor: second.cursor });
  assert.equal(first.images.length, 25);
  assert.equal(second.images.length, 25);
  assert.equal(third.images.length, 2);
  assert.equal(third.cursor, null);
  assert.equal(
    new Set([...first.images, ...second.images, ...third.images].map((image) => image.id)).size,
    52,
  );
  await assert.rejects(f.library.list(null, {}), { code: 'unauthenticated' });
  await assert.rejects(f.library.list('other', { cursor: first.cursor }), {
    code: 'invalid-argument',
  });
  f.records.set('users/author/bookGenerations/request-missing-001', {
    kind: 'cover',
    state: 'accepted',
    path: 'missing',
  });
  await f.library.importAccepted('author', 'request-missing-001');
  assert.equal(f.records.has('users/author/imageLibrary/request-missing-001'), false);
  assert.equal(f.records.get('users/author').credits, 20);
});

test('failed storage deletion remains retriable and cannot be selected', async () => {
  let attempts = 0;
  const f = fixture({
    remove: async () => {
      if (++attempts === 1) throw new Error('storage unavailable');
    },
  });
  const id = await acceptedCover(f);
  await assert.rejects(f.library.remove('author', { id }), /storage unavailable/);
  const page = await f.library.list('author', {});
  assert.equal(page.images[0].state, 'deleting');
  await assert.rejects(
    f.library.saveBook('author', {
      creationId: 'book-0000000000001',
      title: 'Atlas',
      coverImageId: id,
    }),
    { code: 'not-found' },
  );
  await f.library.remove('author', { id });
  assert.equal((await f.library.list('author', {})).images.length, 0);
});
test('partial cover edits preserve book metadata and explicit empty fields clear it', async () => {
  const f = fixture();
  const id = await acceptedCover(f);
  await f.library.saveBook('author', {
    creationId: 'book-0000000000001',
    title: 'Atlas',
    genre: 'Fantasia',
    synopsis: 'Uma jornada',
    coverImageId: id,
  });
  const value = await f.library.saveBook('author', {
    bookId: 'book-0000000000001',
    coverImageId: null,
  });
  assert.equal(value.title, 'Atlas');
  assert.equal(value.genre, 'Fantasia');
  assert.equal(value.synopsis, 'Uma jornada');
  const cleared = await f.library.saveBook('author', {
    bookId: value.id,
    genre: '',
    synopsis: '',
    coverImageId: id,
  });
  assert.equal(cleared.genre, '');
  assert.equal(cleared.synopsis, '');
});
