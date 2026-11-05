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
    id: path.split('/').at(-1),
    createTime: { seconds: 1, nanoseconds: 0 },
    data: () => structuredClone(records.get(path)),
  });
  const db = {
    collection: (path) => ({
      path,
      isCollection: true,
      orderBy() {
        return this;
      },
      limit() {
        return this;
      },
      select() {
        return this;
      },
    }),
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
            return ref.isCollection
              ? {
                  docs: [...records.keys()]
                    .filter((path) => path.startsWith(ref.path + '/'))
                    .sort()
                    .slice(0, 12)
                    .map(snap),
                }
              : snap(ref.path);
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
  const start = async (setup = {}) =>
    (session = await call({
      action: 'start',
      sessionId: randomUUID(),
      idea: 'Uma viajante entre ilhas.',
      ...setup,
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

test('assisted creation never overwrites an existing native-managed book or its inline lore', async () => {
  const f = fixture();
  await f.ready();
  const id = f.session().id;
  f.records.set('books/' + id, {
    authorId: 'author',
    hasLoreResources: true,
    localLoreVersion: 7,
    title: '\ufeff  Existing\r\n',
    status: 'draft',
  });
  f.records.set('books/' + id + '/lore/' + f.session().proposal.entities[0].id, {
    name: 'Original',
    details: '\ufeff  Literal\r\n',
    summary: 'Preserved',
  });
  const before = structuredClone([...f.records]);
  await assert.rejects(f.commit(), { code: 'failed-precondition' });
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.get('users/author').credits, 20);
});

test('criação assistida congela parâmetros e retry não troca o modelo nem debita', async () => {
  const inputs = [];
  const f = fixture({
    generator: async (context) => {
      inputs.push(context);
      if (inputs.length === 1) throw new Error('offline');
      return proposal();
    },
  });
  const session = await f.start();
  const data = {
    action: 'generate',
    sessionId: session.id,
    revision: session.revision,
    requestId: randomUUID(),
    brief: 'Viagem.',
    generation: { version: 1, provider: 'platform', model: 'gemini-4-argon', reasoning: 'high' },
  };
  await assert.rejects(f.call(data), { code: 'unavailable' });
  await f.call(data);
  assert.deepEqual(inputs[0].generation, inputs[1].generation);
  assert.equal(inputs[1].generation.effective.model, 'gemini-4-argon');
  assert.equal(f.records.get('users/author').credits, 20);
  await assert.rejects(f.call({ ...data, generation: { ...data.generation, model: 'unknown' } }), {
    code: 'invalid-argument',
  });
});

for (const kind of ['book', 'adventure', 'campaign']) {
  for (const method of ['manual', 'assisted']) {
    test(`new creation ${kind}/${method} activates once with the selected persona and correct debit`, async () => {
      const f = fixture({ generator: async () => ({ ...proposal(), entities: [] }) });
      let session = await f.start({ flowVersion: 2, kind, method, personaId: 'preset-epic' });
      if (method === 'assisted')
        session = await f.op('generate', { brief: 'Uma premissa revisada.' });
      const input = {
        action: 'commit',
        flowVersion: 2,
        sessionId: session.id,
        revision: session.revision,
        proposal: { ...proposal(), entities: [] },
        expectedCost: method === 'manual' ? 0 : 2,
      };
      const result = await f.call(input);
      f.records.delete(`users/author/assistedSessions/${session.id}`);
      const replay = await f.call(input);
      assert.equal(result.project.kind, kind);
      assert.equal(replay.project.id, result.project.id);
      assert.equal(result.book.personaId, 'preset-epic');
      assert.equal(f.records.get('users/author').credits, method === 'manual' ? 20 : 18);
      const collection = { book: 'books', adventure: 'adventures', campaign: 'campaigns' }[kind];
      assert.equal(f.records.get(`${collection}/${session.id}`).title, 'Atlas');
      if (kind === 'campaign') assert.deepEqual(result.book.provenance, { kind: 'independent' });
    });
  }
}
test('manual sessions cannot generate AI text and avoid its debit', async () => {
  const f = fixture();
  await f.start({ flowVersion: 2, kind: 'book', method: 'manual' });
  await assert.rejects(f.op('generate', { brief: 'Bypass' }), { code: 'failed-precondition' });
  assert.equal(f.calls(), 0);
});

test('manual book cover is generated once and charged only on atomic confirmation', async () => {
  const f = fixture();
  await f.start({ flowVersion: 2, kind: 'book', method: 'manual' });
  const draft = { ...proposal(), entities: [] };
  const request = {
    action: 'cover',
    sessionId: f.session().id,
    revision: f.session().revision,
    requestId: randomUUID(),
    proposal: draft,
  };
  await f.op('cover', { proposal: draft }, request.requestId);
  await f.call(request);
  const coverId = f.session().cover.id;
  assert.equal(f.calls(), 1);
  assert.equal(f.records.get('users/author').credits, 20);
  assert.equal(f.records.get('users/author/assistedLimits/current').count, 1);
  await assert.rejects(f.commit({ coverId, expectedCost: 0 }), { code: 'failed-precondition' });
  assert.equal(f.records.has(`books/${f.session().id}`), false);
  const result = await f.commit({ coverId, expectedCost: 5 });
  const replay = await f.commit({ coverId, expectedCost: 5 });
  assert.equal(result.credits, 15);
  assert.equal(replay.credits, 15);
  assert.equal(f.records.get(`users/author/imageLibrary/${coverId}`).useCount, 1);
  assert.equal(f.records.get(`users/author/bookGenerations/${coverId}`).state, 'attached');
});

test('manual cover respects the AI quota while manual draft saves remain available', async () => {
  const f = fixture();
  await f.start({ flowVersion: 2, kind: 'book', method: 'manual' });
  f.records.set('users/author/assistedLimits/current', { windowStart: 0, count: 60 });
  await assert.rejects(f.op('cover', { proposal: { ...proposal(), entities: [] } }), {
    code: 'resource-exhausted',
  });
  await f.op('save', { proposal: { ...proposal(), entities: [] } });
  assert.equal(f.calls(), 0);
  assert.equal(f.records.get('users/author/assistedLimits/current').count, 60);
});

for (const kind of ['adventure', 'campaign'])
  test(`manual ${kind} cannot generate a book cover`, async () => {
    const f = fixture();
    await f.start({ flowVersion: 2, kind, method: 'manual' });
    await assert.rejects(f.op('cover', { proposal: { ...proposal(), entities: [] } }), {
      code: 'failed-precondition',
    });
    assert.equal(f.calls(), 0);
  });

for (const invalid of ['changed', 'expired', 'insufficient-credits'])
  test(`manual cover cannot be accepted when ${invalid}`, async () => {
    const f = fixture();
    await f.start({ flowVersion: 2, kind: 'book', method: 'manual' });
    await f.op('cover', { proposal: { ...proposal(), entities: [] } });
    if (invalid === 'expired') f.advance(3600001);
    if (invalid === 'insufficient-credits') f.records.set('users/author', { credits: 4 });
    await assert.rejects(
      f.commit({
        coverId: f.session().cover.id,
        expectedCost: 5,
        ...(invalid === 'changed'
          ? { proposal: { ...f.session().proposal, title: 'Outro título' } }
          : {}),
      }),
      { code: invalid === 'insufficient-credits' ? 'resource-exhausted' : 'failed-precondition' },
    );
    assert.equal(f.records.has(`books/${f.session().id}`), false);
    assert.equal(
      f.records.get('users/author').credits,
      invalid === 'insufficient-credits' ? 4 : 20,
    );
  });

test('discarding a generated manual cover keeps the project free', async () => {
  const f = fixture();
  await f.start({ flowVersion: 2, kind: 'book', method: 'manual' });
  await f.op('cover', { proposal: { ...proposal(), entities: [] } });
  const result = await f.commit({ expectedCost: 0 });
  assert.equal(result.credits, 20);
  assert.equal(f.records.get(`books/${f.session().id}`).coverImageId, null);
});
test('new creation binds universe usage atomically and rejects a revoked source before commit', async () => {
  const f = fixture({ generator: async () => ({ ...proposal(), entities: [] }) });
  f.records.set('universes/world', {
    authorId: 'author',
    name: 'Ilhas',
    description: 'O mar desaparece.',
    loreVersion: 0,
    privacyVersion: 0,
    campaignCount: 0,
  });
  const session = await f.start({
    flowVersion: 2,
    kind: 'campaign',
    method: 'manual',
    universeId: 'world',
  });
  f.records.get('universes/world').deleting = true;
  await assert.rejects(
    f.call({
      action: 'commit',
      flowVersion: 2,
      sessionId: session.id,
      revision: 0,
      proposal: { ...proposal(), entities: [] },
      expectedCost: 0,
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.has(`campaigns/${session.id}`), false);
  f.records.get('universes/world').deleting = false;
  await f.call({
    action: 'commit',
    flowVersion: 2,
    sessionId: session.id,
    revision: 0,
    proposal: { ...proposal(), entities: [] },
    expectedCost: 0,
  });
  assert.equal(f.records.get('universes/world').campaignCount, 1);
  assert.deepEqual(f.records.get(`universes/world/campaigns/${session.id}`), {
    campaignId: session.id,
  });
});
test('provider output is rejected when the selected universe changes during generation', async () => {
  const f = fixture({
    generator: async () => {
      records.get('universes/world').loreVersion++;
      return { ...proposal(), entities: [] };
    },
  });
  const records = f.records;
  records.set('universes/world', { authorId: 'author', name: 'Ilhas', loreVersion: 0 });
  await f.start({ flowVersion: 2, kind: 'adventure', method: 'assisted', universeId: 'world' });
  await assert.rejects(f.op('generate', { brief: 'Uma abertura.' }), {
    code: 'failed-precondition',
  });
  const loaded = await f.call({ action: 'load' });
  assert.equal(loaded.session.contextUnavailable, true);
  assert.equal(loaded.session.proposal, null);
  assert.equal(loaded.session.messages[0].role, 'user');
});

test('new proposal cannot hide unreviewed lore behind initial metadata', async () => {
  const f = fixture();
  await f.start({ flowVersion: 2, kind: 'book', method: 'assisted' });
  await assert.rejects(f.op('generate', { brief: 'Somente a premissa.' }), { code: 'unavailable' });
  assert.equal(f.records.get('users/author').credits, 20);
});

test('manual creation and draft saves do not consume or depend on AI quotas', async () => {
  const f = fixture();
  f.records.set('users/author/assistedLimits/starts', { windowStart: 0, count: 10 });
  f.records.set('users/author/assistedLimits/current', { windowStart: 0, count: 60 });
  await f.start({ flowVersion: 2, kind: 'book', method: 'manual' });
  await f.op('save', { proposal: { ...proposal(), entities: [] } });
  assert.equal(f.records.get('users/author/assistedLimits/current').count, 60);
  assert.equal(f.records.get('users/author/assistedLimits/starts').count, 10);
});

test('conception chat proposes a bound UI action without executing it or replacing the reviewed proposal', async () => {
  let captured;
  const f = fixture({
    generator: async (context) => {
      if (context.mode === 'project-interview') {
        captured = context;
        return {
          question: 'Confira o ajuste sugerido.',
          brief: 'Uma viagem entre ilhas.',
          ready: true,
          action: { id: 'control-title', value: 'Novo título' },
        };
      }
      return { ...proposal(), entities: [] };
    },
  });
  await f.start({ flowVersion: 2, kind: 'book', method: 'assisted' });
  const generated = await f.op('generate', { brief: 'Uma viagem entre ilhas.' });
  const original = structuredClone(generated.proposal);
  const requestId = randomUUID();
  const result = await f.op(
    'interview',
    {
      message: 'Ajuste o título',
      proposal: { ...original, title: 'Rascunho próprio' },
      capabilities: [{ id: 'control-title', label: 'Título do projeto', kind: 'field' }],
    },
    requestId,
  );
  assert.deepEqual(result.suggestedAction, { id: 'control-title', value: 'Novo título' });
  assert.equal(result.suggestedActionRequestId, requestId);
  assert.deepEqual(result.proposal, original);
  assert.equal(captured.currentProposal.title, 'Rascunho próprio');
  assert.equal(f.records.has(`books/${result.id}`), false);
  assert.equal(f.records.get('users/author').credits, 20);
});
test('conception chat rejects invented action IDs and supports actions beyond eight interview turns', async () => {
  let invalid = false;
  const f = fixture({
    generator: async () => ({
      question: 'Qual é sua próxima decisão?',
      brief: 'Concepção.',
      ready: true,
      action: invalid ? { id: 'unregistered' } : null,
    }),
  });
  await f.start({ flowVersion: 2, kind: 'campaign', method: 'assisted' });
  for (let i = 0; i < 10; i++)
    await f.op('interview', { message: 'Decisão ' + i, capabilities: [] });
  invalid = true;
  await assert.rejects(f.op('interview', { message: 'Continue', capabilities: [] }), {
    code: 'failed-precondition',
  });
});
