import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAssistedBookService, validateProposal } from '../src/assistedBook.mjs';

const proposal = () => ({
  title: 'Atlas',
  genre: 'Fantasia',
  synopsis: 'Uma viagem entre ilhas.',
  coverDirection: 'Mar e bronze.',
  entities: Array.from({ length: 12 }, (_, index) => ({
    id: `entity-${String(index).padStart(12, '0')}`,
    name: `Ficha ${index}`,
    category: index < 4 ? 'character' : 'location',
    aliases: [],
    summary: 'Uma ficha útil.',
    details: 'História original.',
    structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
    relations:
      index === 0
        ? [{ targetEntityId: 'entity-000000000001', relationType: 'Conhece', description: '' }]
        : [],
  })),
});
function fixture(overrides = {}) {
  const records = new Map([['users/author', { credits: 20 }]]);
  const images = new Map();
  let time = 10000,
    calls = 0,
    queue = Promise.resolve();
  const snap = (path) => ({
    exists: records.has(path),
    data: () => structuredClone(records.get(path)),
  });
  const db = {
    doc: (path) => ({
      path,
      get: async () => snap(path),
      set: async (value) => records.set(path, structuredClone(value)),
      update: async (value) =>
        records.set(path, { ...records.get(path), ...structuredClone(value) }),
    }),
    runTransaction(work) {
      const result = queue.then(async () => {
        let writing = false;
        const writes = [];
        const tx = {
          get: async (ref) => {
            assert.equal(writing, false, 'Firestore reads must precede writes');
            return snap(ref.path);
          },
          set: (ref, value) => {
            writing = true;
            writes.push(() => records.set(ref.path, structuredClone(value)));
          },
          create: (ref, value) => {
            assert.equal(records.has(ref.path), false);
            tx.set(ref, value);
          },
          update: (ref, value) => {
            assert.ok(records.has(ref.path));
            tx.set(ref, { ...records.get(ref.path), ...value });
          },
        };
        const value = await work(tx);
        writes.forEach((write) => write());
        return value;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  const service = createAssistedBookService({
    db,
    now: () => time,
    generator: async (context) => {
      calls++;
      if (overrides.generator) return overrides.generator(context);
      return context.mode === 'interview'
        ? {
            question: 'Qual é o conflito?',
            brief: 'Viagem entre ilhas; conflito a definir.',
            ready: false,
          }
        : context.mode === 'cover'
          ? { image: Buffer.from('image') }
          : context.mode === 'entity'
            ? {
                ...context.entity,
                details: 'Nova história.',
                structuredDetails: { ...context.entity.structuredDetails, notes: 'Nova nota.' },
              }
            : proposal();
    },
    assets: {
      save: async (path, bytes) => {
        images.set(path, bytes);
        return `https://example.test/${path}`;
      },
      preview: async (path) => `data:image/png;base64,${images.get(path).toString('base64')}`,
      publish: overrides.publish ?? (async () => {}),
      remove: async (path) => images.delete(path),
    },
  });
  const call = (data, uid = 'author') => service.assistedBook(uid, data);
  let session;
  const start = async () =>
    (session = await call({
      action: 'start',
      sessionId: randomUUID(),
      idea: 'Uma viajante entre ilhas.',
    }));
  const op = async (action, extra = {}, requestId = randomUUID()) =>
    (session = await call({
      action,
      sessionId: session.id,
      revision: session.revision,
      requestId,
      ...extra,
    }));
  const ready = async () => {
    await start();
    return op('generate', { brief: session.brief });
  };
  const commit = (extra) =>
    call({
      action: 'commit',
      sessionId: session.id,
      revision: session.revision,
      proposal: session.proposal,
      coverId: null,
      imageId: null,
      expectedCost: 2,
      ...extra,
    });
  return {
    call,
    start,
    op,
    ready,
    commit,
    records,
    images,
    calls: () => calls,
    session: () => session,
    advance: (ms) => {
      time += ms;
    },
  };
}
test('sessions are private, resumable and expire after seven days; start is idempotent', async () => {
  const f = fixture();
  const session = await f.start();
  assert.equal((await f.call({ action: 'load' })).session.id, session.id);
  assert.equal((await f.call({ action: 'load' }, 'other')).session, null);
  assert.equal(
    (await f.call({ action: 'start', sessionId: session.id, idea: session.idea })).revision,
    0,
  );
  await assert.rejects(f.call({ action: 'load' }, null), { code: 'unauthenticated' });
  f.advance(7 * 86400000);
  assert.equal((await f.call({ action: 'load' })).session, null);
});
test('interview preserves history and supports suggestions and early generation without debit', async () => {
  const f = fixture();
  await f.start();
  await f.op('interview');
  await f.op('interview', { message: 'Sugira para mim.' });
  assert.equal(f.session().messages.length, 4);
  await f.op('generate', { brief: 'Respeitar a ideia: sem magia.' });
  assert.equal(f.session().proposal.entities.length, 12);
  assert.equal(f.records.get('users/author').credits, 20);
});
test('eight questions allow their last answer but never a ninth question', async () => {
  const f = fixture();
  await f.start();
  await f.op('interview');
  for (let n = 0; n < 8; n++) await f.op('interview', { message: 'Resposta.' });
  assert.equal(f.session().messages.filter((item) => item.role === 'assistant').length, 8);
  assert.equal(f.session().ready, true);
  await assert.rejects(f.op('interview', { message: 'Mais.' }), { code: 'failed-precondition' });
});
test('completed generation request can be recovered without another provider call', async () => {
  const f = fixture();
  const session = await f.start();
  const id = randomUUID();
  const input = {
    action: 'generate',
    sessionId: session.id,
    revision: 0,
    requestId: id,
    brief: session.brief,
  };
  const a = await f.call(input),
    b = await f.call(input);
  assert.deepEqual(a, b);
  assert.equal(f.calls(), 1);
  await assert.rejects(f.call({ ...input, brief: 'Outra ideia.' }), { code: 'invalid-argument' });
});
test('commit creates one private draft and all local lore with resolved relations for two credits', async () => {
  const f = fixture();
  const session = await f.ready();
  const [a, b] = await Promise.all([f.commit(), f.commit()]);
  assert.equal([...f.records].find(([path]) => /^books\/[^/]+$/.test(path))[1].localLoreVersion, 0);
  assert.equal(a.book.id, b.book.id);
  assert.equal(b.credits, 18);
  assert.equal(a.book.status, 'draft');
  const entities = [...f.records]
    .filter(([path]) => path.startsWith(`books/${session.id}/lore/`))
    .map(([, entity]) => entity);
  assert.equal(entities.length, 12);
  assert.ok(entities.every((entity) => !entity.isPublic && entity.bookId === session.id));
  assert.ok(entities.some((entity) => entity.relations.length === 1));
  assert.equal((await f.call({ action: 'load' })).bookId, session.id);
});
test('cover and text acceptance are atomic, costing seven credits with one library use', async () => {
  const f = fixture();
  await f.ready();
  await f.op('cover', { proposal: f.session().proposal });
  const id = f.session().cover.id;
  assert.equal(f.records.get('users/author').credits, 20);
  const a = await f.commit({ coverId: id, expectedCost: 7 });
  await f.commit({ coverId: id, expectedCost: 7 });
  assert.equal(a.credits, 13);
  assert.equal(f.records.get(`users/author/imageLibrary/${id}`).useCount, 1);
  assert.equal(f.records.get(`users/author/bookGenerations/${id}`).state, 'attached');
});
test('a failed post-commit storage publication is recoverable without another debit', async () => {
  let fail = true;
  const f = fixture({
    publish: async () => {
      if (fail) {
        fail = false;
        throw new Error('storage unavailable');
      }
    },
  });
  await f.ready();
  await f.op('cover', { proposal: f.session().proposal });
  const coverId = f.session().cover.id;
  await assert.rejects(f.commit({ coverId, expectedCost: 7 }));
  assert.equal((await f.commit({ coverId, expectedCost: 7 })).credits, 13);
});
test('library reuse is free and checks image ownership and active state', async () => {
  const f = fixture();
  await f.ready();
  const id = randomUUID();
  f.records.set(`users/author/imageLibrary/${id}`, {
    state: 'active',
    url: 'https://example.test/cover.png',
    useCount: 2,
  });
  const result = await f.commit({ imageId: id });
  assert.equal(result.credits, 18);
  assert.equal(f.records.get(`users/author/imageLibrary/${id}`).useCount, 3);
  const g = fixture();
  await g.ready();
  await assert.rejects(g.commit({ imageId: id }), { code: 'not-found' });
});
test('insufficient balance, price changes, invalid relations and expired proposals write nothing', async () => {
  const f = fixture();
  await f.ready();
  await assert.rejects(f.commit({ expectedCost: 1 }), { code: 'failed-precondition' });
  f.records.set('users/author', { credits: 1 });
  await assert.rejects(f.commit(), { code: 'resource-exhausted' });
  const bad = structuredClone(f.session().proposal);
  bad.entities.pop();
  bad.entities[0].relations[0].targetEntityId = randomUUID();
  await assert.rejects(f.commit({ proposal: bad }), { code: 'invalid-argument' });
  f.advance(3600000);
  await assert.rejects(f.commit(), { code: 'failed-precondition' });
  assert.equal(
    [...f.records.keys()].some((key) => key.startsWith('books/')),
    false,
  );
});
test('cover based on obsolete context cannot be accepted', async () => {
  const f = fixture();
  await f.ready();
  await f.op('cover', { proposal: f.session().proposal });
  await assert.rejects(
    f.commit({
      coverId: f.session().cover.id,
      expectedCost: 7,
      proposal: { ...f.session().proposal, title: 'Novo título' },
    }),
    { code: 'failed-precondition' },
  );
});

test('a cover request cannot overwrite an existing generated or library image', async () => {
  const f = fixture();
  await f.ready();
  const id = randomUUID();
  const path = `users/author/bookGenerations/${id}`;
  const original = { kind: 'cover', state: 'attached', title: 'Capa antiga' };
  f.records.set(path, original);
  await assert.rejects(f.op('cover', { proposal: f.session().proposal }, id), {
    code: 'failed-precondition',
  });
  assert.deepEqual(f.records.get(path), original);
  const otherId = randomUUID();
  f.records.set(`users/author/imageLibrary/${otherId}`, { state: 'active', useCount: 2 });
  await assert.rejects(f.op('cover', { proposal: f.session().proposal }, otherId), {
    code: 'failed-precondition',
  });
  assert.equal(f.calls(), 1);
});
test('regeneration preserves manually edited fields even after saving the review', async () => {
  const f = fixture();
  await f.ready();
  const p = structuredClone(f.session().proposal);
  const entity = p.entities[0];
  entity.details = 'Minha história.';
  entity.structuredDetails.notes = 'Minha nota.';
  await f.op('save', { proposal: p });
  await f.op('entity', { proposal: p, entityId: entity.id });
  assert.equal(f.session().proposal.entities[0].details, 'Minha história.');
  assert.equal(f.session().proposal.entities[0].structuredDetails.notes, 'Minha nota.');
});
test('provider failure leaves the briefing and balance intact; retry can succeed', async () => {
  let failed = true;
  const f = fixture({
    generator: async () => {
      if (failed) {
        failed = false;
        throw new Error('offline');
      }
      return proposal();
    },
  });
  await f.start();
  const id = randomUUID();
  await assert.rejects(f.op('generate', { brief: f.session().brief }, id), { code: 'unavailable' });
  await f.op('generate', { brief: f.session().brief }, id);
  assert.equal(f.records.get('users/author').credits, 20);
});
test('stale revisions and another account cannot modify a session', async () => {
  const f = fixture();
  await f.ready();
  await assert.rejects(
    f.call({
      action: 'brief',
      requestId: randomUUID(),
      sessionId: f.session().id,
      revision: 0,
      brief: 'Changed',
    }),
    { code: 'failed-precondition' },
  );
  await assert.rejects(
    f.call(
      {
        action: 'generate',
        requestId: randomUUID(),
        sessionId: f.session().id,
        revision: 1,
        brief: 'Changed',
      },
      'other',
    ),
    { code: 'not-found' },
  );
});
test('deleted books are never recreated and changed retries cannot debit twice', async () => {
  const f = fixture();
  await f.ready();
  await f.commit();
  await assert.rejects(f.commit({ proposal: { ...f.session().proposal, title: 'Changed' } }), {
    code: 'failed-precondition',
  });
  f.records.delete(`books/${f.session().id}`);
  await assert.rejects(f.commit(), { code: 'failed-precondition' });
});
test('hourly session and operation limits count failures and do not debit credits', async () => {
  const f = fixture();
  await f.start();
  f.records.set('users/author/assistedLimits/current', { windowStart: 0, count: 60 });
  await assert.rejects(f.op('interview'), { code: 'resource-exhausted' });
  f.records.set('users/author/assistedLimits/starts', { windowStart: 0, count: 10 });
  await assert.rejects(f.start(), { code: 'resource-exhausted' });
});
test('proposal validation rejects duplicate names, malformed fields and self relations', () => {
  const a = proposal();
  a.entities[1].name = a.entities[0].name;
  assert.throws(() => validateProposal(a));
  const b = proposal();
  b.entities[0].relations[0].targetEntityId = b.entities[0].id;
  assert.throws(() => validateProposal(b));
  const c = proposal();
  c.entities[0].summary = 'x'.repeat(141);
  assert.throws(() => validateProposal(c));
});
