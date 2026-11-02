import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniverseLoreImportService } from '../src/universeLoreImport.mjs';
import { studioDb } from './helpers/studioDb.mjs';

const item = {
  name: 'Arthur',
  category: 'character',
  aliases: ['Rei'],
  summary: 'O rei voltou.',
  details: 'Arthur voltou ao reino.',
  evidence: 'Arthur voltou ao reino.',
};
const source = item.evidence;
const input = {
  id: 'import-test',
  universeId: null,
  files: [{ name: 'lore.txt', size: Buffer.byteLength(source), parts: 1 }],
};
function fixture() {
  const f = studioDb();
  let clock = 100;
  let calls = 0;
  let response = { entities: [item] };
  const api = createUniverseLoreImportService({
    db: f.db,
    now: () => clock,
    generator: async () => {
      calls++;
      return JSON.stringify(response);
    },
  });
  f.records.set('users/author', { credits: 10 });
  return {
    ...f,
    api,
    calls: () => calls,
    response: (value) => {
      response = value;
    },
    expire: () => {
      clock += 86400001;
    },
  };
}
async function ready(f, options = {}) {
  const start = { ...input, ...options };
  await f.api.startUniverseLoreImport('author', start);
  const bytes = {
    id: start.id,
    kind: 'bytes',
    file: 0,
    index: 0,
    payload: Buffer.from(source).toString('base64'),
  };
  const part = { id: start.id, kind: 'source', file: 0, index: 0, payload: source, page: null };
  await f.api.appendUniverseLoreImport('author', bytes);
  await f.api.appendUniverseLoreImport('author', part);
  await f.api.sealUniverseLoreImport('author', { id: start.id });
  return f.api.advanceUniverseLoreImport('author', { id: start.id, cursor: 0 });
}
function submission(review, targetId = null) {
  const candidate = review.candidates[0];
  const { name, category, aliases, summary, details } = candidate;
  return {
    id: review.id,
    operationId: 'confirm-test',
    name: 'Atlas',
    description: 'Um mundo',
    changes: [
      { candidateId: candidate.id, targetId, input: { name, category, aliases, summary, details } },
    ],
  };
}
test('no universe or debit before explicit review; new private entries and one atomic receipt', async () => {
  const f = fixture();
  const review = await ready(f);
  assert.equal(review.state, 'ready');
  assert.equal(review.candidates[0].fileName, 'lore.txt');
  assert.equal(review.candidates[0].evidence, source);
  assert.equal(f.records.get('users/author').credits, 10);
  assert.ok(!f.records.has('universes/import-import-test'));
  const apply = submission(review);
  await assert.rejects(f.api.applyUniverseLoreImport('author', apply), {
    code: 'failed-precondition',
  });
  await f.api.saveUniverseLoreImportReview('author', apply);
  const recovered = await f.api.getUniverseLoreImport('author', { id: review.id });
  assert.deepEqual(recovered.pendingReview.changes, apply.changes);
  const result = await f.api.applyUniverseLoreImport('author', apply);
  assert.deepEqual(result, { universeId: 'import-import-test', created: 1, updated: 0 });
  assert.equal(f.records.get('users/author').credits, 9);
  const entity = [...f.records.entries()].find(([path]) =>
    path.startsWith('universes/import-import-test/lore/'),
  )[1];
  assert.equal(entity.isPublic, false);
  assert.deepEqual(entity.relations, []);
  await f.api.saveUniverseLoreImportReview('author', apply);
  assert.deepEqual(await f.api.applyUniverseLoreImport('author', apply), result);
  assert.equal(f.records.get('users/author').credits, 9);
  f.records.delete('universes/import-import-test');
  assert.deepEqual(await f.api.applyUniverseLoreImport('author', apply), result);
  assert.ok(!f.records.has('universes/import-import-test'));
});
test('updates only reviewed fields, preserving privacy, notes, relations and creation date', async () => {
  const f = fixture();
  f.records.set('universes/world', { authorId: 'author', loreVersion: 4, privacyVersion: 2 });
  const before = {
    ...item,
    details: 'Texto antigo.',
    isPublic: true,
    relations: [{ targetEntityId: 'universe:world:other', relationType: 'amigo' }],
    structuredDetails: { notes: 'Segredo' },
    createdAt: 7,
    updatedAt: 9,
  };
  f.records.set('universes/world/lore/arthur', before);
  f.records.set('universes/world/lore/untouched', { ...before, name: 'Merlin' });
  const review = await ready(f, { universeId: 'world' });
  const target = await f.api.getUniverseLoreImportTarget('author', {
    id: review.id,
    targetId: 'arthur',
  });
  assert.equal(target.details, before.details);
  const apply = submission(review, 'arthur');
  apply.changes[0].input.details = '';
  apply.changes[0].input.aliases = [];
  await f.api.saveUniverseLoreImportReview('author', apply);
  assert.deepEqual(await f.api.applyUniverseLoreImport('author', apply), {
    universeId: 'world',
    created: 0,
    updated: 1,
  });
  const after = f.records.get('universes/world/lore/arthur');
  assert.equal(after.details, '');
  assert.deepEqual(after.aliases, []);
  for (const key of ['isPublic', 'relations', 'structuredDetails', 'createdAt'])
    assert.deepEqual(after[key], before[key]);
  assert.equal(f.records.get('universes/world').loreVersion, 5);
  assert.equal(f.records.get('universes/world').privacyVersion, 2);
  assert.equal(f.records.get('users/author/campaignAuthorization/current').epoch, 1);
  assert.equal(f.records.get('universes/world/lore/untouched').name, 'Merlin');
});
test('server rejects oversized manifests, wrong real bytes, altered retries, incomplete uploads and foreign accounts', async () => {
  const f = fixture();
  await assert.rejects(f.api.startUniverseLoreImport(null, input), { code: 'unauthenticated' });
  await assert.rejects(
    f.api.startUniverseLoreImport('author', {
      ...input,
      files: [{ name: 'lore.pdf', size: 10000001, parts: 1 }],
    }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    f.api.startUniverseLoreImport('author', {
      ...input,
      files: [{ name: 'lore.exe', size: 2, parts: 1 }],
    }),
    { code: 'invalid-argument' },
  );
  await f.api.startUniverseLoreImport('author', input);
  await assert.rejects(f.api.getUniverseLoreImport('other', { id: input.id }), {
    code: 'not-found',
  });
  await assert.rejects(f.api.sealUniverseLoreImport('author', { id: input.id }), {
    code: 'failed-precondition',
  });
  const request = {
    id: input.id,
    kind: 'bytes',
    file: 0,
    index: 0,
    payload: Buffer.from('wrong').toString('base64'),
  };
  await assert.rejects(f.api.appendUniverseLoreImport('author', request), {
    code: 'invalid-argument',
  });
  request.payload = Buffer.from(source).toString('base64');
  await f.api.appendUniverseLoreImport('author', request);
  assert.deepEqual(await f.api.appendUniverseLoreImport('author', request), { accepted: true });
  await assert.rejects(
    f.api.appendUniverseLoreImport('author', {
      ...request,
      payload: Buffer.alloc(Buffer.byteLength(source), 65).toString('base64'),
    }),
    { code: 'failed-precondition' },
  );
});
test('concurrent universe changes and insufficient balance abort every write', async () => {
  const f = fixture();
  f.records.set('universes/world', { authorId: 'author', loreVersion: 0 });
  const review = await ready(f, { universeId: 'world' });
  const apply = submission(review);
  await f.api.saveUniverseLoreImportReview('author', apply);
  f.records.set('users/author', { credits: 0 });
  await assert.rejects(f.api.applyUniverseLoreImport('author', apply), {
    code: 'resource-exhausted',
  });
  assert.ok(![...f.records.keys()].some((path) => path.startsWith('universes/world/lore/')));
  f.records.set('users/author', { credits: 10 });
  f.records.set('universes/world', { authorId: 'author', loreVersion: 1 });
  await assert.rejects(f.api.applyUniverseLoreImport('author', apply), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.get('users/author').credits, 10);
});
test('invalid AI evidence fails without partial application or debit; retry continues same cursor', async () => {
  const f = fixture();
  f.response({ entities: [{ ...item, evidence: 'Inventado' }] });
  await assert.rejects(ready(f), { code: 'unavailable' });
  assert.equal(f.calls(), 2);
  assert.equal(f.records.get('users/author').credits, 10);
  f.response({ entities: [item] });
  const review = await f.api.advanceUniverseLoreImport('author', { id: input.id, cursor: 0 });
  assert.equal(review.candidates.length, 1);
});
test('cancel fences late confirmations, and expiry rejects further content', async () => {
  const f = fixture();
  const review = await ready(f);
  const apply = submission(review);
  await f.api.saveUniverseLoreImportReview('author', apply);
  await f.api.cancelUniverseLoreImport('author', { id: review.id });
  await assert.rejects(f.api.applyUniverseLoreImport('author', apply), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.get('users/author').credits, 10);
  const g = fixture();
  await ready(g);
  g.expire();
  await assert.rejects(g.api.getUniverseLoreImport('author', { id: input.id }), {
    code: 'failed-precondition',
  });
});
test('saved confirmation rejects edited payload without debit', async () => {
  const f = fixture();
  const review = await ready(f);
  const apply = submission(review);
  await f.api.saveUniverseLoreImportReview('author', apply);
  await assert.rejects(f.api.applyUniverseLoreImport('author', { ...apply, name: 'Outro' }), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.get('users/author').credits, 10);
});
