import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationService, generationPrompt } from '../src/generation.mjs';

function fixture(options = {}) {
  const records = new Map([
    ['users/author', { credits: 20 }],
    ['users/other', { credits: 20 }],
  ]);
  let queue = Promise.resolve();
  const db = {
    doc(path) {
      return { path, update: async (data) => records.set(path, { ...records.get(path), ...data }) };
    },
    runTransaction(operation) {
      const run = queue.then(async () => {
        const writes = [];
        const tx = {
          get: async (ref) => ({
            exists: records.has(ref.path),
            data: () => structuredClone(records.get(ref.path)),
          }),
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
  await assert.rejects(f.service.createWithCover('author', input), { code: 'failed-precondition' });
  await f.service.accept('author', { id: cover.id });
  const results = await Promise.all([
    f.service.createWithCover('author', input),
    f.service.createWithCover('author', input),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].status, 'draft');
  assert.equal([...f.records.keys()].filter((path) => path.startsWith('books/')).length, 1);
  assert.equal(f.records.get(`users/author/bookGenerations/${cover.id}`).state, 'attached');
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
