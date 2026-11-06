import { literaryArchitectureTargetId } from '../src/literaryArchitectureProtocol.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { studioDb } from './helpers/studioDb.mjs';
import { createBookEditorialCaptureService } from '../src/bookEditorialCapture.mjs';
import { digest, workScope, workProject } from '../src/workProgressContracts.mjs';
import { readLiteraryFindingTarget } from '../src/literaryFindingTargets.mjs';
import { createLiteraryReferenceReader } from '../src/literaryReferences.mjs';
const target = { kind: 'book', id: 'book' },
  h = 'a'.repeat(64),
  h2 = 'b'.repeat(64),
  h3 = 'c'.repeat(64),
  hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const f = studioDb(),
    fullReads = [];
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 1,
    updatedAt: 10,
    wordCount: 0,
  });
  const db = {
    ...f.db,
    runTransaction: (callback) =>
      f.db.runTransaction((tx) =>
        callback({
          ...tx,
          get: async (ref) => {
            if (ref.path) fullReads.push(ref.path);
            return tx.get(ref);
          },
        }),
      ),
  };
  return { ...f, fullReads, api: createBookEditorialCaptureService({ db }) };
}
function finding(f, patch = {}, suffix = 'one') {
  const source = {
      jobId: 'decision-job-' + suffix,
      requestId: 'decision-request-' + suffix,
      index: 0,
      fingerprint: h,
      severity: 'blocking',
    },
    id = digest({ jobId: source.jobId, requestId: source.requestId, index: source.index }),
    value = {
      schemaVersion: 1,
      id,
      revision: 1,
      source,
      action: 'retain',
      state: 'retained',
      rationale: 'OWN_FINDING_RATIONALE\r\n🕯️',
      target: null,
      baseline: null,
      correction: null,
      boundFence: h2,
      boundEpoch: 7,
      createdAt: 20,
      updatedAt: 20,
      ...patch,
    },
    path = 'books/book/literaryFindingDecisions/' + id,
    version =
      'books/book/literaryFindingDecisionVersions/' + digest({ id, revision: value.revision });
  f.records.set(path, structuredClone(value));
  f.records.set(version, structuredClone(value));
  f.records.set('books/book/literaryIntegrationResults/' + source.requestId, {
    result: { findings: [{ problem: 'PRIVATE_FINDING_BODY' }] },
  });
  return { id, path, version, value };
}
function impact(f, patch = {}, suffix = 'one') {
  const value = {
      uid: 'author',
      jobId: 'decision-impact-' + suffix,
      checkId: h,
      controlBirth: [10, 1],
      observationToken: h2,
      proofHash: h3,
      revision: 1,
      status: 'reviewed',
      rationale: 'OWN_IMPACT_RATIONALE',
      evidence: [{ note: 'Minha observação.' }],
      updatedAt: 30,
      publicationReady: false,
      ...patch,
    },
    id = digest({ jobId: value.jobId, checkId: value.checkId }),
    path = 'books/book/literaryImpactDecisions/' + id,
    version =
      'books/book/literaryImpactDecisionVersions/' +
      digest({ jobId: value.jobId, checkId: value.checkId, revision: value.revision });
  f.records.set(path, structuredClone(value));
  f.records.set(version, structuredClone(value));
  f.records.set('books/book/literaryImpactChecks/' + value.checkId, {
    privateCache: 'PRIVATE_CHECK_BODY',
  });
  return { id, path, version, value };
}
async function source(f) {
  const value = await f.api.getBookEditorialCaptureSource('author', { bookId: 'book' });
  return {
    bookId: 'book',
    bookSourceToken: value.bookSourceToken,
    editorialSourceToken: value.editorialSourceToken,
  };
}
const list = (f, wire, family, extra = {}) =>
  f.api.listBookEditorialCaptureRecords('author', { ...wire, family, limit: 50, ...extra });
const first = async (f, wire, family) => ({
  ...wire,
  family,
  ...(await list(f, wire, family)).items[0],
});
async function read(f, wire) {
  const first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  if (first.state === 'current-alias') return { first, value: null };
  const chunks = [Buffer.from(first.chunkBase64, 'base64')];
  for (let index = 1; index < first.chunkCount; index++) {
    const part = await f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      index,
      projectionToken: first.projectionToken,
    });
    chunks.push(Buffer.from(part.chunkBase64, 'base64'));
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(hash(bytes), first.contentHash);
  return { first, value: JSON.parse(bytes.toString('utf8')) };
}

test('finding rationale survives without its source report and never copies cached labels or effective grants', async () => {
  const f = fixture();
  finding(f, {
    baseline: {
      label: 'PRIVATE_DERIVED_LABEL',
      identityToken: h,
      versionToken: h2,
      proofKind: 'reference',
      contentHash: h2,
      revision: 1,
    },
  });
  const wire = await source(f),
    page = await list(f, wire, 'finding-current');
  assert.equal(JSON.stringify(page).includes('OWN_FINDING_RATIONALE'), false);
  f.fullReads.length = 0;
  const result = await read(f, { ...wire, family: 'finding-current', ...page.items[0] }),
    record = result.value.artifacts[0];
  assert.equal(record.content.rationale, 'OWN_FINDING_RATIONALE\r\n🕯️');
  assert.equal(record.content.status, 'retained');
  assert.equal(record.content.annotation.action, 'retain');
  assert.equal(record.content.references[0].state, 'unavailable');
  for (const text of [
    'PRIVATE_FINDING_BODY',
    'PRIVATE_DERIVED_LABEL',
    'effectiveRetention',
    'confirmationCurrent',
    'boundFence',
    'boundEpoch',
  ])
    assert.equal(JSON.stringify(result.value).includes(text), false, text);
  assert.equal(
    f.fullReads.some((path) => path.includes('/literaryIntegrationResults/')),
    false,
  );
  assert.ok(
    f.metadataReads
      .filter((read) => read.path.includes('/literaryFindingDecisions/'))
      .every((read) => !read.fields.includes('baseline.label')),
  );
});
test('matching current/immutable finding decisions alias while earlier choices keep their own revision and rationale', async () => {
  const f = fixture(),
    old = finding(f),
    head = {
      ...old.value,
      revision: 2,
      action: 'defer',
      state: 'deferred',
      rationale: 'Escolha posterior.',
      updatedAt: 40,
    };
  f.records.set(old.path, head);
  f.records.set(
    'books/book/literaryFindingDecisionVersions/' + digest({ id: old.id, revision: 2 }),
    head,
  );
  const wire = await source(f),
    current = await read(f, await first(f, wire, 'finding-current')),
    page = await list(f, wire, 'finding-version');
  let prior, alias;
  for (const item of page.items) {
    const value = await read(f, { ...wire, family: 'finding-version', ...item });
    if (value.value) prior = value.value.artifacts[0];
    else alias = value.first;
  }
  assert.equal(prior.content.status, 'retained');
  assert.equal(prior.lineage.id, current.value.artifacts[0].lineage.id);
  assert.notEqual(prior.id, current.value.artifacts[0].id);
  assert.equal(alias.contentHash, current.first.contentHash);
});
test('native nontext reference tokens are never relabeled as portable content hashes', async () => {
  const f = fixture();
  f.records.set('books/book/arcs/arc', {
    ownerId: 'author',
    bookId: 'book',
    revision: 2,
    updatedAt: 100,
  });
  const c = workScope(f.db, 'author', { target }, []),
    observed = await f.db.runTransaction(async (tx) => {
      const root = await workProject(tx, c),
        read = await createLiteraryReferenceReader(tx, c, root);
      return read({ kind: 'arc', id: 'arc', scopeId: 'book', purpose: 'source' });
    });
  finding(f, {
    action: 'correct',
    state: 'planned',
    target: { kind: 'arc', id: 'arc', scopeId: 'book' },
    baseline: {
      identityToken: observed.identityToken,
      versionToken: observed.versionToken,
      contentHash: observed.versionToken,
      revision: 2,
      proofKind: 'reference',
      label: 'PRIVATE_LABEL',
    },
  });
  const wire = await source(f),
    result = await read(f, await first(f, wire, 'finding-current')),
    reference = result.value.artifacts[0].content.references[1];
  assert.equal(reference.kind, 'arc');
  assert.equal(reference.state, 'recorded');
  assert.equal(reference.contentHash, null);
  assert.equal(reference.revision, 2);
});
test('text target references require the original native incarnation and version, without reading its body', async () => {
  const f = fixture();
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    ownerId: 'author',
    title: 'Capítulo privado',
    content: '<p>Original.</p>',
    wordCount: 1,
    updatedAt: 100,
    createdAt: 1,
  });
  const c = workScope(f.db, 'author', { target }, []),
    targetValue = { kind: 'chapter', id: 'chapter', scopeId: 'book' },
    baseline = await f.db.runTransaction((tx) => readLiteraryFindingTarget(tx, c, targetValue));
  finding(f, { action: 'correct', state: 'planned', target: targetValue, baseline });
  const wire = await source(f);
  f.fullReads.length = 0;
  const value = await read(f, await first(f, wire, 'finding-current')),
    reference = value.value.artifacts[0].content.references[1];
  assert.equal(reference.state, 'recorded');
  assert.equal(reference.contentHash, baseline.contentHash);
  assert.equal(f.fullReads.includes('books/book/chapters/chapter'), false);
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book/chapters/chapter');
    await tx.get(ref);
    tx.update(ref, { updatedAt: 101 });
  });
  const stale = await read(f, await first(f, wire, 'finding-current'));
  assert.equal(stale.value.artifacts[0].content.references[1].state, 'unavailable');
});
test('correction notes/dates and owned history pointers remain historical without successor jobs or private storage fields', async () => {
  const f = fixture();
  finding(f, {
    action: 'correct',
    state: 'correctionConfirmed',
    target: { kind: 'chapter', id: 'chapter', scopeId: 'book' },
    baseline: {
      identityToken: h,
      versionToken: h2,
      revision: 1,
      proofKind: 'text',
      contentHash: h,
      label: 'PRIVATE_LABEL',
    },
    correction: {
      note: 'Minha confirmação.',
      confirmedAt: 50,
      successorJobId: 'PRIVATE_SUCCESSOR',
      sourceFence: h,
      targetRevision: 2,
      versionId: 'saved-version',
      contentHash: h3,
      versionToken: h2,
      proofKind: 'text',
    },
  });
  f.records.set('books/book/workVersions/saved-version', {
    id: 'saved-version',
    target: { kind: 'book', id: 'book' },
    resource: { kind: 'chapter', id: 'chapter' },
    contentHash: h3,
    privateStoragePath: 'PRIVATE_STORAGE',
  });
  const wire = await source(f),
    result = await read(f, await first(f, wire, 'finding-current')),
    record = result.value.artifacts[0];
  assert.deepEqual(record.content.annotation.correction, {
    note: 'Minha confirmação.',
    confirmedAt: 50,
  });
  assert.equal(record.content.references.at(-1).kind, 'historyVersion');
  assert.equal(record.content.references.at(-1).state, 'recorded');
  for (const text of [
    'PRIVATE_LABEL',
    'PRIVATE_SUCCESSOR',
    'PRIVATE_STORAGE',
    'sourceFence',
    'versionToken',
  ])
    assert.equal(JSON.stringify(result.value).includes(text), false, text);
});
test('unknown global target scope remains explicit and does not discard the own decision', async () => {
  const f = fixture();
  finding(f, {
    action: 'correct',
    state: 'planned',
    target: { kind: 'globalLore', id: 'entity', scopeId: null },
    baseline: {
      identityToken: h,
      versionToken: h2,
      revision: 1,
      proofKind: 'reference',
      contentHash: h2,
    },
  });
  const wire = await source(f),
    result = await read(f, await first(f, wire, 'finding-current')),
    reference = result.value.artifacts[0].content.references[1];
  assert.equal(reference.scope.kind, 'universe');
  assert.equal(reference.scope.id, null);
  assert.equal(reference.state, 'unavailable');
  assert.equal(result.value.artifacts[0].content.rationale.startsWith('OWN_FINDING'), true);
});
test('impact evidence remains own interpretation notes and never reads revoked check bodies', async () => {
  const f = fixture();
  impact(f, { evidence: [{ note: 'Primeira nota.' }, { note: 'Outra observação.' }] });
  const wire = await source(f);
  f.fullReads.length = 0;
  const result = await read(f, await first(f, wire, 'impact-current')),
    [decision, ...evidence] = result.value.artifacts;
  assert.equal(evidence.length, 2);
  assert.equal(decision.content.annotation.family, 'impact');
  assert.equal(evidence[0].content.quote, '');
  assert.equal(evidence[0].content.classification, 'interpretation');
  assert.equal(evidence[1].content.rationale, 'Outra observação.');
  assert.equal(decision.content.evidenceIds[0], evidence[0].id);
  assert.equal(
    f.fullReads.some((path) => path.includes('/literaryImpactChecks/')),
    false,
  );
  assert.equal(
    f.metadataReads.some((read) => read.path.includes('/literaryImpactChecks/')),
    false,
  );
  assert.equal(JSON.stringify(result.value).includes('PRIVATE_CHECK_BODY'), false);
});
test('impact UID filtering advances past foreign metadata and never exposes its rationale', async () => {
  const f = fixture(),
    own = impact(f);
  f.records.set('books/book/literaryImpactDecisions/00-foreign', {
    uid: 'other',
    rationale: 'PRIVATE_FOREIGN',
  });
  const wire = await source(f),
    page = await list(f, wire, 'impact-current', { limit: 1 });
  assert.deepEqual(page.items, []);
  assert.ok(page.nextCursor);
  const next = await list(f, wire, 'impact-current', { limit: 1, cursor: page.nextCursor });
  assert.equal(next.items[0].id, own.id);
  assert.equal(JSON.stringify([page, next]).includes('PRIVATE_FOREIGN'), false);
});
test('an actor mismatch is checked before any impact rationale/evidence fields are read', async () => {
  const f = fixture(),
    own = impact(f),
    wire = await source(f),
    request = await first(f, wire, 'impact-current');
  f.records.set(own.path, { ...own.value, uid: 'other' });
  f.metadataReads.length = 0;
  await assert.rejects(read(f, request), (error) => error.code === 'permission-denied');
  assert.ok(
    f.metadataReads
      .filter((read) => read.path === own.path)
      .every((read) => !read.fields.includes('rationale') && !read.fields.includes('evidence')),
  );
});
test('an owned old impact version does not read or adopt a foreign current head', async () => {
  const f = fixture(),
    own = impact(f);
  f.records.set(own.path, { ...own.value, uid: 'other', rationale: 'PRIVATE_FOREIGN' });
  const wire = await source(f);
  f.metadataReads.length = 0;
  const result = await read(f, await first(f, wire, 'impact-version'));
  assert.equal(result.value.artifacts[0].lineage.role, 'version');
  assert.equal(result.value.artifacts[0].content.rationale, 'OWN_IMPACT_RATIONALE');
  assert.ok(
    f.metadataReads
      .filter((read) => read.path === own.path)
      .every((read) => !read.fields.includes('rationale')),
  );
});
test('root revocation and final record changes reject previously observed decision proofs', async () => {
  const f = fixture(),
    own = finding(f),
    wire = await source(f),
    request = await first(f, wire, 'finding-current'),
    result = await read(f, request);
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc(own.path);
    await tx.get(ref);
    tx.update(ref, { updatedAt: 99 });
  });
  await assert.rejects(
    f.api.verifyBookEditorialCaptureRecord('author', {
      ...request,
      projectionToken: result.first.projectionToken,
    }),
  );
  const fresh = await first(f, wire, 'finding-current');
  f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'other' });
  f.metadataReads.length = 0;
  await assert.rejects(read(f, fresh));
  assert.equal(
    f.metadataReads.some((read) => read.path === own.path),
    false,
  );
});
test('a conflicting immutable decision cannot be hidden as an alias', async () => {
  const f = fixture(),
    own = finding(f);
  f.records.set(own.version, { ...own.value, rationale: 'Divergente.' });
  const wire = await source(f);
  await assert.rejects(read(f, await first(f, wire, 'finding-version')));
});

test('structural target descriptors keep their exact original type and ID while remaining unavailable for adoption', async () => {
  const f = fixture();
  finding(f, {
    action: 'correct',
    state: 'planned',
    target: {
      kind: 'architecture',
      id: literaryArchitectureTargetId({ kind: 'sceneLink', arcId: null, id: 'original-link' }),
      scopeId: 'book',
    },
    baseline: {
      identityToken: h,
      versionToken: h2,
      revision: 1,
      proofKind: 'reference',
      contentHash: h2,
      label: 'PRIVATE_LABEL',
    },
  });
  const wire = await source(f),
    value = await read(f, await first(f, wire, 'finding-current')),
    reference = value.value.artifacts[0].content.references[1];
  assert.equal(reference.kind, 'sceneLink');
  assert.equal(reference.id, 'original-link');
  assert.equal(reference.state, 'unavailable');
  assert.equal(reference.contentHash, null);
  assert.equal(value.value.artifacts[0].content.annotation.targetType, 'architecture:sceneLink');
});
