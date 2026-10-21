import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoreAnalysisService, validateDetectedLore } from '../src/loreAnalysis.mjs';

const detected = {
  name: 'Arthur',
  category: 'character',
  summary: 'Rei de Avalon',
  details: 'Arthur chegou ao porto.',
  aliases: [],
  evidence: 'Arthur chegou ao porto.',
};

test('evidence tolerates whitespace only and returns the exact original chapter excerpt', () => {
  const source = 'Arthur (rei)\u00a0chegou\r\n\r\nao porto.';
  const [item] = validateDetectedLore(
    [{ ...detected, evidence: ' Arthur (rei) chegou ao porto. ' }],
    source,
  );
  assert.equal(item.evidence, source);
  for (const evidence of [
    'Arthur rei chegou ao porto.',
    'Arthur (rei) foi ao porto.',
    'Arthur (rei).*porto.',
    'Arthur (rei) chegou... ao porto.',
  ])
    assert.throws(() => validateDetectedLore([{ ...detected, evidence }], source), {
      code: 'invalid-argument',
    });
});

test('consolidation can retain valid evidence from an earlier chapter chunk', async () => {
  const { service, records } = fixture();
  const source = detected.evidence + 'x'.repeat(13000);
  const result = await service.analyzeChapterLore('author', { ...request, text: source });
  assert.equal(result.entities[0].evidence, detected.evidence);
  assert.equal(records.get('users/author').credits, 5);
});

test('invalid AI evidence is repaired once without extra quota or credit debit', async () => {
  const calls = [];
  const { service, records } = fixture(async (context) => {
    calls.push(context);
    return JSON.stringify({
      entities: [{ ...detected, evidence: calls.length === 1 ? 'inventado' : detected.evidence }],
    });
  });
  const result = await service.analyzeChapterLore('author', request);
  assert.equal(result.entities[0].evidence, detected.evidence);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].validationFeedback);
  assert.equal(records.get('users/author/loreAnalysisLimits/current').count, 1);
  assert.equal(records.get('users/author').credits, 5);
});

test('persistent fabricated AI evidence rejects the whole batch as a provider failure', async () => {
  let calls = 0;
  const { service, records } = fixture(async () => {
    calls++;
    return JSON.stringify({ entities: [{ ...detected, evidence: 'inventado' }] });
  });
  await assert.rejects(service.analyzeChapterLore('author', request), { code: 'unavailable' });
  assert.equal(calls, 2);
  assert.equal(records.get('users/author').credits, 5);
  assert.equal(records.get(`users/author/loreAnalyses/${request.requestId}`).state, 'failed');
  await assert.rejects(apply(service), { code: 'failed-precondition' });
});
const input = {
  name: detected.name,
  category: detected.category,
  summary: detected.summary,
  details: detected.details,
  aliases: [],
};
const request = {
  bookId: 'book',
  chapterId: 'chapter',
  requestId: 'analysis-000000000001',
  text: detected.evidence,
  content: `<p>${detected.evidence}</p>`,
  loreVersions: [],
};
const local = [{ scope: 'local', input }];
function fixture(generator = async () => JSON.stringify({ entities: [detected] })) {
  const records = new Map([
    ['books/book', { authorId: 'author', universeId: 'world', publicationPrivacyVersion: 2 }],
    ['books/book/chapters/chapter', { content: 'Anterior' }],
    ['universes/world', { authorId: 'author', loreVersion: 3, privacyVersion: 4 }],
    ['publicUniversePrivacy/world', { version: 4, active: true }],
    ['users/author', { credits: 5 }],
  ]);
  let queue = Promise.resolve();
  let time = 100;
  const doc = (path) => ({ path, id: path.split('/').at(-1) });
  const snap = (ref) => ({
    ref,
    id: ref.id,
    exists: records.has(ref.path),
    data: () => structuredClone(records.get(ref.path)),
  });
  const db = {
    doc,
    collection: (path) => ({ path, query: true }),
    runTransaction(operation) {
      const result = queue.then(async () => {
        const writes = [];
        const tx = {
          get: async (ref) => {
            assert.equal(writes.length, 0);
            return ref.query
              ? {
                  docs: [...records.keys()]
                    .filter(
                      (path) =>
                        path.startsWith(ref.path + '/') &&
                        !path.slice(ref.path.length + 1).includes('/'),
                    )
                    .map((path) => snap(doc(path))),
                }
              : snap(ref);
          },
          set: (ref, value) => writes.push(() => records.set(ref.path, structuredClone(value))),
          create: (ref, value) =>
            writes.push(() => {
              assert.equal(records.has(ref.path), false);
              records.set(ref.path, structuredClone(value));
            }),
          update: (ref, value) =>
            writes.push(() => {
              assert.ok(records.has(ref.path));
              records.set(ref.path, { ...records.get(ref.path), ...structuredClone(value) });
            }),
        };
        const value = await operation(tx);
        writes.forEach((write) => write());
        return value;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  return {
    records,
    service: createLoreAnalysisService({ db, generator, now: () => time }),
    advance: () => {
      time += 3600001;
    },
  };
}
const apply = (service, changes = local, extra = {}) =>
  service.applyLoreAnalysis('author', {
    id: request.requestId,
    text: request.text,
    changes,
    ...extra,
  });

test('analysis does not write lore or debit; apply debits once for an entire batch, privately', async () => {
  const { service, records } = fixture();
  await service.analyzeChapterLore('author', request);
  assert.equal(records.get('users/author').credits, 5);
  assert.equal([...records.keys()].filter((key) => key.includes('/lore/')).length, 0);
  const changes = [...local, { scope: 'global', input: { ...input, name: 'Porto' } }];
  const result = await apply(service, changes);
  assert.deepEqual(result, { applied: 2, credits: 4 });
  assert.equal(records.get(`books/book/lore/${request.requestId}-0`).isPublic, false);
  assert.equal(records.get(`universes/world/lore/${request.requestId}-1`).isPublic, false);
  assert.equal(records.get('books/book').localLoreVersion, 1);
  assert.equal(records.get('universes/world').loreVersion, 4);
  assert.equal(records.get('universes/world').privacyVersion, 4);
  assert.equal(records.get('publicUniversePrivacy/world').version, 4);
  const clock = structuredClone(records.get('users/author/campaignAuthorization/current'));
  assert.equal(clock.epoch, 1);
  assert.match(clock.token, /^[a-f0-9]{64}$/);
  assert.deepEqual(await apply(service, changes), result);
  assert.deepEqual(records.get('users/author/campaignAuthorization/current'), clock);
  assert.equal(records.get('books/book').localLoreVersion, 1);
});
test('concurrent retries are idempotent and reject a different payload after apply', async () => {
  const { service, records } = fixture();
  await service.analyzeChapterLore('author', request);
  const results = await Promise.all([apply(service), apply(service)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(records.get('users/author').credits, 4);
  assert.equal(records.has('users/author/campaignAuthorization/current'), false);
  await assert.rejects(apply(service, [{ scope: 'local', input: { ...input, name: 'Outro' } }]), {
    code: 'failed-precondition',
  });
});
test('BYOK works with zero credits; clients cannot change a platform ticket provider', async () => {
  const { service, records } = fixture();
  records.get('users/author').credits = 0;
  await service.prepareBYOKLore('author', { ...request, entities: [detected] });
  assert.deepEqual(await apply(service), { applied: 1, credits: 0 });
  const next = fixture();
  await next.service.analyzeChapterLore('author', request);
  await apply(next.service, local, { provider: 'byok' });
  assert.equal(next.records.get('users/author').credits, 4);
});
test('owner and destination checks prevent unauthorized writes', async () => {
  const { service, records } = fixture();
  await assert.rejects(service.analyzeChapterLore(null, request), { code: 'unauthenticated' });
  await assert.rejects(service.analyzeChapterLore('other', request), { code: 'permission-denied' });
  await service.analyzeChapterLore('author', request);
  await assert.rejects(
    service.applyLoreAnalysis('other', {
      id: request.requestId,
      text: request.text,
      changes: local,
    }),
    { code: 'not-found' },
  );
  await assert.rejects(apply(service, [{ scope: 'foreign', input }]), { code: 'invalid-argument' });
  await assert.rejects(apply(service, [{ scope: 'global', entityId: 'foreign', input }]), {
    code: 'invalid-argument',
  });
  assert.equal(records.get('users/author').credits, 5);
});
test('updates preserve visibility, private notes and relations, and only selected fields change', async () => {
  const { service, records } = fixture();
  const previous = {
    ...input,
    summary: 'Antes',
    isPublic: true,
    relations: [{ targetEntityId: 'someone', relationType: 'aliado' }],
    structuredDetails: { notes: 'segredo' },
    updatedAt: 1,
  };
  records.set('books/book/lore/arthur', previous);
  await service.analyzeChapterLore('author', { ...request, loreVersions: [['arthur', 1]] });
  await apply(service, [{ scope: 'local', entityId: 'arthur', input: { summary: 'Depois' } }]);
  assert.deepEqual(records.get('books/book/lore/arthur'), {
    ...previous,
    summary: 'Depois',
    updatedAt: 100,
  });
});
test('visibility, notes and relation mutations are rejected atomically', async () => {
  const { service, records } = fixture();
  await service.analyzeChapterLore('author', request);
  for (const key of ['isPublic', 'relations', 'structuredDetails', 'unknown'])
    await assert.rejects(
      apply(service, [...local, { scope: 'global', input: { ...input, [key]: true } }]),
      { code: 'invalid-argument' },
    );
  assert.equal(records.get('users/author').credits, 5);
  assert.equal(records.has(`books/book/lore/${request.requestId}-0`), false);
});
test('a batch can update several existing records with only selected summary fields', async () => {
  const { service, records } = fixture();
  records.set('books/book/lore/arthur', { ...input, updatedAt: 1 });
  records.set('books/book/lore/port', { ...input, name: 'Porto', updatedAt: 1 });
  await service.analyzeChapterLore('author', {
    ...request,
    loreVersions: [
      ['arthur', 1],
      ['port', 1],
    ],
  });
  await apply(service, [
    { scope: 'local', entityId: 'arthur', input: { summary: 'Depois' } },
    { scope: 'local', entityId: 'port', input: { summary: 'Atualizado' } },
  ]);
  assert.equal(records.get('books/book/lore/arthur').summary, 'Depois');
  assert.equal(records.get('books/book/lore/port').summary, 'Atualizado');
  assert.equal(records.get('books/book').localLoreVersion, 1);
  assert.equal(records.get('users/author').credits, 4);
});
test('stale text, lore, universe linkage, persisted chapter and expiration refuse writes', async () => {
  for (const mutate of [
    (records) => records.set('books/book/lore/new', { name: 'Nova', updatedAt: 1 }),
    (records) => {
      records.get('universes/world').loreVersion++;
    },
    (records) => {
      records.get('books/book').universeId = null;
    },
    (records) => {
      records.get('books/book/chapters/chapter').content = 'Outra aba';
    },
  ]) {
    const { service, records } = fixture();
    await service.analyzeChapterLore('author', request);
    mutate(records);
    await assert.rejects(apply(service), { code: 'failed-precondition' });
    assert.equal(records.get('users/author').credits, 5);
  }
  const { service, advance } = fixture();
  await service.analyzeChapterLore('author', request);
  await assert.rejects(apply(service, local, { text: 'Mudou' }), { code: 'failed-precondition' });
  advance();
  await assert.rejects(apply(service), { code: 'failed-precondition' });
});
test('autosave of the analyzed unsaved snapshot remains applicable', async () => {
  const { service, records } = fixture();
  await service.analyzeChapterLore('author', request);
  records.get('books/book/chapters/chapter').content = request.content;
  await apply(service);
});
test('insufficient credits and invalid/no-op/duplicate fields leave all records intact', async () => {
  const { service, records } = fixture();
  await service.analyzeChapterLore('author', request);
  records.get('users/author').credits = 0;
  await assert.rejects(apply(service), { code: 'resource-exhausted' });
  records.get('users/author').credits = 5;
  for (const changes of [
    [],
    [{ scope: 'local', input: { name: 'X' } }],
    [{ scope: 'local', input: { ...input, summary: 'x'.repeat(141) } }],
    [local[0], local[0]],
  ])
    await assert.rejects(apply(service, changes));
  assert.equal(records.get('users/author').credits, 5);
});
test('stale client context and malformed evidence are rejected without generation or charge', async () => {
  const { service, records } = fixture();
  await assert.rejects(
    service.analyzeChapterLore('author', { ...request, loreVersions: [['gone', 1]] }),
    { code: 'failed-precondition' },
  );
  await assert.rejects(
    service.prepareBYOKLore('author', {
      ...request,
      entities: [{ ...detected, evidence: 'inventado' }],
    }),
    { code: 'invalid-argument' },
  );
  assert.equal(records.get('users/author').credits, 5);
});
test('failed or truncated provider response never allows partial changes', async () => {
  for (const generator of [
    async () => '{',
    async () => {
      throw new Error('timeout');
    },
    async () => JSON.stringify({ entities: [{ ...detected, category: 'bad' }] }),
  ]) {
    const { service, records } = fixture(generator);
    await assert.rejects(service.analyzeChapterLore('author', request));
    await assert.rejects(apply(service), { code: 'failed-precondition' });
    assert.equal(records.get('users/author').credits, 5);
  }
});
test('long chapters are covered through the last chunk and a failed chunk discards the batch', async () => {
  const calls = [];
  const { service } = fixture(async (context) => {
    calls.push(context.text);
    return JSON.stringify({ entities: [] });
  });
  const source = 'x'.repeat(24000) + 'fim';
  await service.analyzeChapterLore('author', { ...request, text: source });
  assert.equal(calls.length, 3);
  assert.ok(calls.at(-1).endsWith('fim'));
});
test('free analyses are limited per hour and can be retrieved idempotently', async () => {
  const { service, records } = fixture();
  await service.analyzeChapterLore('author', request);
  await service.analyzeChapterLore('author', request);
  assert.equal(records.get('users/author/loreAnalysisLimits/current').count, 1);
  for (let index = 2; index <= 10; index++)
    await service.analyzeChapterLore('author', {
      ...request,
      requestId: `analysis-0000000000${index.toString().padStart(2, '0')}`,
    });
  await assert.rejects(
    service.analyzeChapterLore('author', { ...request, requestId: 'analysis-000000000099' }),
    { code: 'resource-exhausted' },
  );
});

test('global-only analysis preserves the absent local baseline and local epoch changes stale a ticket', async () => {
  const global = fixture();
  await global.service.analyzeChapterLore('author', request);
  await apply(global.service, [{ scope: 'global', input }]);
  assert.equal(Object.hasOwn(global.records.get('books/book'), 'localLoreVersion'), false);
  const local = fixture();
  await local.service.analyzeChapterLore('author', request);
  local.records.get('books/book').localLoreVersion = 1;
  const before = structuredClone([...local.records]);
  await assert.rejects(apply(local.service), { code: 'failed-precondition' });
  assert.deepEqual([...local.records], before);
});

test('malformed local epochs fail closed and exhausted epochs cannot charge or write lore', async () => {
  for (const value of [null, undefined, -1, 0.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
    const f = fixture();
    f.records.get('books/book').localLoreVersion = value;
    const before = structuredClone([...f.records]);
    await assert.rejects(f.service.analyzeChapterLore('author', request), {
      code: 'failed-precondition',
    });
    assert.deepEqual([...f.records], before);
  }
  const f = fixture();
  f.records.get('books/book').localLoreVersion = Number.MAX_SAFE_INTEGER;
  await f.service.analyzeChapterLore('author', request);
  const before = structuredClone([...f.records]);
  await assert.rejects(apply(f.service), { code: 'failed-precondition' });
  assert.deepEqual([...f.records], before);
});
