import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture as workflowFixture, target } from './helpers/literaryWorkflowFixtures.mjs';
import { createBookEditorialCaptureService } from '../src/bookEditorialCapture.mjs';
import { createLiteraryProgressService } from '../src/literaryProgress.mjs';
import { createLiteraryPreparationService } from '../src/literaryPreparation.mjs';
import { LITERARY_GATE_CRITERIA } from '../src/literaryGateProtocol.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex'),
  notes = { blockers: ['PRIVATE_OWN_BLOCKER 🕯️'], nextStep: 'Conferir\r\nsem redefinir.' };
async function fixture() {
  const f = await workflowFixture(),
    reads = [],
    db = {
      ...f.db,
      runTransaction(callback) {
        return f.db.runTransaction((tx) =>
          callback({
            ...tx,
            get: async (ref) => {
              if (ref.path) reads.push(ref.path);
              return tx.get(ref);
            },
          }),
        );
      },
    };
  return {
    ...f,
    reads,
    capture: createBookEditorialCaptureService({ db }),
    progress: createLiteraryProgressService({ db: f.db, now: () => 800 }),
    preparation: createLiteraryPreparationService({ db: f.db, now: () => 900 }),
  };
}
async function wire(f) {
  const value = await f.capture.getBookEditorialCaptureSource('author', { bookId: 'book' });
  return {
    bookId: 'book',
    bookSourceToken: value.bookSourceToken,
    editorialSourceToken: value.editorialSourceToken,
  };
}
const list = (f, source, family, cursor = null) =>
  f.capture.listBookEditorialCaptureRecords('author', { ...source, family, cursor, limit: 50 });
const item = async (f, source, family) => ({
  ...source,
  family,
  ...(await list(f, source, family)).items[0],
});
async function read(f, request) {
  const first = await f.capture.readBookEditorialCaptureRecord('author', { ...request, index: 0 });
  if (first.state === 'current-alias') return { first, value: null };
  const chunks = [Buffer.from(first.chunkBase64, 'base64')];
  for (let index = 1; index < first.chunkCount; index++) {
    const part = await f.capture.readBookEditorialCaptureRecord('author', {
        ...request,
        index,
        projectionToken: first.projectionToken,
      }),
      bytes = Buffer.from(part.chunkBase64, 'base64');
    assert.equal(hash(bytes), part.chunkHash);
    chunks.push(bytes);
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(hash(bytes), first.contentHash);
  return { first, value: JSON.parse(bytes.toString('utf8')) };
}
async function note(
  f,
  { stage = 'planning', id = 'brief', value = notes, operation = 'annotations-note-0001' } = {},
) {
  const detail = await f.progress.getLiteraryProgressArtifact('author', { target, stage, id });
  await f.progress.saveLiteraryProgressNote('author', {
    target,
    stage,
    id,
    sourceToken: detail.artifact.sourceToken,
    expectedRevision: detail.note.revision,
    operationId: operation,
    notes: value,
  });
  return detail;
}
async function updatePreparation(f, { long = false, notes = 'Nova conferência.' } = {}) {
  const planIds = ['brief', 'scenes', 'world'],
    context = await f.preparation.getLiteraryPreparationContext('author', {
      target,
      chapterId: f.chapterId,
      planIds,
    }),
    saved = f.records.get('books/book/literaryPreparationGates/' + f.chapterId),
    gate = structuredClone(saved.gate);
  gate.notes = notes;
  if (long) {
    const quote = context.snapshot.documents
      .find((document) => document.id === 'plan:brief')
      .text.slice(0, 500);
    gate.criteria = Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
      id,
      result: 'pass',
      rationale: 'r'.repeat(2000),
      evidence: Array.from({ length: 3 }, () => ({ documentId: 'plan:brief', quote })),
    }));
  }
  return f.preparation.saveLiteraryPreparationGate('author', {
    target,
    chapterId: f.chapterId,
    planIds,
    operationId: 'annotations-preparation-0002',
    expectedRevision: saved.revision,
    stateToken: context.snapshot.stateToken,
    gate,
  });
}

test('own progress notes preserve literal text and exact source association without exposing text in metadata pages', async () => {
  const f = await fixture();
  await note(f);
  const source = await wire(f),
    page = await list(f, source, 'progress-current');
  assert.equal(JSON.stringify(page).includes('PRIVATE_OWN_BLOCKER'), false);
  const request = { ...source, family: 'progress-current', ...page.items[0] },
    result = await read(f, request);
  assert.equal(result.value.content.role, 'progress');
  assert.equal(result.value.content.sections.at(-1).text, notes.nextStep);
  assert.equal(result.value.content.references[0].state, 'recorded');
  assert.equal(result.value.lineage.role, 'current');
  const sourcePlan = await read(f, await item(f, source, 'plan-current'));
  assert.equal(result.value.content.references[0].id, sourcePlan.value.id);
  assert.equal(JSON.stringify(result.value).includes('nativeOrigin'), false);
  const version = await read(f, await item(f, source, 'progress-version'));
  assert.equal(version.first.state, 'current-alias');
  assert.equal(version.first.contentHash, result.first.contentHash);
});
test('older own notes keep their text and lineage when the latest annotation is changed', async () => {
  const f = await fixture();
  await note(f);
  await note(f, {
    value: { blockers: [], nextStep: 'Outra decisão.' },
    operation: 'annotations-note-0002',
  });
  const source = await wire(f),
    current = await read(f, await item(f, source, 'progress-current')),
    page = await list(f, source, 'progress-version');
  let old;
  for (const entry of page.items) {
    const result = await read(f, { ...source, family: 'progress-version', ...entry });
    if (result.value) old = result.value;
  }
  assert.equal(old.revision, 1);
  assert.equal(old.content.sections.at(-1).text, notes.nextStep);
  assert.equal(old.lineage.id, current.value.lineage.id);
  assert.notEqual(old.id, current.value.id);
});
test('removing an associated artifact preserves own annotations with an unavailable historical descriptor', async () => {
  const f = await fixture();
  await note(f);
  f.records.delete('books/book/literaryPlans/brief');
  const source = await wire(f);
  f.reads.length = 0;
  const result = await read(f, await item(f, source, 'progress-current'));
  assert.equal(result.value.content.references[0].state, 'unavailable');
  assert.equal(result.value.content.sections.at(-1).text, notes.nextStep);
  assert.equal(
    f.reads.some((path) => path.includes('/literaryPlans/')),
    false,
  );
});
test('removed manuscript units do not discard own notes or fabricate replacement resources', async () => {
  const f = await fixture();
  await note(f, { stage: 'preparation', id: f.chapterId });
  f.records.delete('books/book/chapters/' + f.chapterId);
  const source = await wire(f),
    result = await read(f, await item(f, source, 'progress-current'));
  assert.equal(result.value.content.references[1].id, f.chapterId);
  assert.equal(result.value.content.references[1].state, 'unavailable');
  assert.equal(result.value.content.sections.at(-1).text, notes.nextStep);
});
test('progress-note capture reauthorizes the root before any private note body read', async () => {
  const f = await fixture();
  await note(f);
  const source = await wire(f),
    request = await item(f, source, 'progress-current');
  f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'other' });
  f.reads.length = 0;
  await assert.rejects(read(f, request));
  assert.equal(
    f.reads.some((path) => path.includes('/literaryProgressNotes/')),
    false,
  );
});
test('a progress head cannot use a different native origin under a previously reserved ID', async () => {
  const f = await fixture();
  await note(f);
  const path = [...f.records.keys()].find((path) =>
    path.startsWith('books/book/literaryProgressNotes/'),
  );
  f.records.set(path, { ...f.records.get(path), nativeOrigin: 'd'.repeat(64) });
  const source = await wire(f);
  await assert.rejects(read(f, await item(f, source, 'progress-current')));
});
test('preparation is a closed historical document with typed evidence and no active execution authorizations', async () => {
  const f = await fixture(),
    source = await wire(f),
    result = await read(f, await item(f, source, 'preparation-current'));
  assert.equal(result.first.payload, 'editorial-bundle');
  const [document, ...evidence] = result.value.artifacts;
  assert.equal(evidence.length, 14);
  assert.equal(document.content.preparation.historicalAcceptance, true);
  assert.equal(document.content.preparation.historicalReady, true);
  assert.equal(document.content.preparation.criteria.length, 14);
  assert.equal(document.content.preparation.criteria[0].evidenceIds[0], evidence[0].id);
  assert.equal(evidence[0].content.quote, 'A carta muda a confiança.');
  assert.equal(evidence[0].content.classification, 'unclassified');
  const text = JSON.stringify(result.value);
  for (const field of [
    'stateToken',
    'bookToken',
    'sourceToken',
    'authorizedPhases',
    'gateDigest',
    'authorAccepted',
  ])
    assert.equal(text.includes('"' + field + '"'), false, field);
});
test('the matching immutable preparation version aliases the whole bundle without duplicating quotes', async () => {
  const f = await fixture(),
    source = await wire(f),
    current = await read(f, await item(f, source, 'preparation-current')),
    version = await read(f, await item(f, source, 'preparation-version'));
  assert.equal(version.first.state, 'current-alias');
  assert.equal(version.first.contentHash, current.first.contentHash);
  assert.equal(version.value, null);
});
test('revoked preparation origins produce a placeholder without reading the protected gate body', async () => {
  const f = await fixture();
  f.records.delete('books/book/literaryPlans/brief');
  const source = await wire(f);
  f.reads.length = 0;
  const result = await read(f, await item(f, source, 'preparation-current'));
  assert.equal(result.value.artifacts.length, 1);
  assert.deepEqual(result.value.artifacts[0].availability, {
    state: 'unavailable',
    reason: 'source-revoked',
  });
  assert.equal(result.value.artifacts[0].content, null);
  assert.equal(
    f.reads.some((path) => path.includes('/literaryPreparationGates/')),
    false,
  );
  assert.equal(JSON.stringify(result.value).includes('Intenção sustentada.'), false);
});
test('revocation after a successful read rejects its pinned final recheck instead of accepting cached quotations', async () => {
  const f = await fixture(),
    source = await wire(f),
    request = await item(f, source, 'preparation-current'),
    result = await read(f, request);
  f.records.delete('books/book/literaryPlans/brief');
  f.reads.length = 0;
  await assert.rejects(
    f.capture.verifyBookEditorialCaptureRecord('author', {
      ...request,
      projectionToken: result.first.projectionToken,
    }),
  );
  assert.equal(
    f.reads.some((path) => path.includes('/literaryPreparationGates/')),
    false,
  );
});
test('an unknown preparation manifest schema stays explicitly unsupported without opening its body', async () => {
  const f = await fixture(),
    path = 'books/book/literaryPreparationGates/' + f.chapterId;
  f.records.set(path, { ...f.records.get(path), manifest: { version: 999 } });
  const source = await wire(f);
  f.reads.length = 0;
  const result = await read(f, await item(f, source, 'preparation-current'));
  assert.equal(result.value.artifacts[0].availability.reason, 'unsupported-legacy-schema');
  assert.equal(f.reads.includes(path), false);
});
test('a forged gate body cannot hide behind the original native gate digest', async () => {
  const f = await fixture(),
    path = 'books/book/literaryPreparationGates/' + f.chapterId,
    value = structuredClone(f.records.get(path));
  value.gate.notes = 'Forged';
  f.records.set(path, value);
  const source = await wire(f);
  await assert.rejects(read(f, await item(f, source, 'preparation-current')));
});
test('old preparation versions preserve their own criteria/evidence IDs under the same document lineage', async () => {
  const f = await fixture();
  await updatePreparation(f);
  const source = await wire(f),
    current = await read(f, await item(f, source, 'preparation-current')),
    page = await list(f, source, 'preparation-version');
  let old;
  for (const entry of page.items) {
    const result = await read(f, { ...source, family: 'preparation-version', ...entry });
    if (result.value) old = result.value;
  }
  assert.equal(old.artifacts[0].content.preparation.notes, 'Preparação aceita.');
  assert.equal(old.artifacts[0].lineage.id, current.value.artifacts[0].lineage.id);
  assert.notEqual(old.artifacts[1].id, current.value.artifacts[1].id);
});
test('bounded preparation parts require one original grant projection and abort after an origin is withdrawn', async () => {
  const f = await fixture();
  await updatePreparation(f, { long: true });
  const source = await wire(f),
    request = await item(f, source, 'preparation-current'),
    first = await f.capture.readBookEditorialCaptureRecord('author', { ...request, index: 0 });
  assert.ok(first.chunkCount > 1);
  assert.equal(first.recordCount, 43);
  const part = await f.capture.readBookEditorialCaptureRecord('author', {
    ...request,
    index: 1,
    projectionToken: first.projectionToken,
  });
  assert.equal(Buffer.from(part.chunkBase64, 'base64').length <= 65536, true);
  f.records.delete('books/book/literaryPlans/brief');
  await assert.rejects(
    f.capture.readBookEditorialCaptureRecord('author', {
      ...request,
      index: 1,
      projectionToken: first.projectionToken,
    }),
  );
});
