import { prepareLiteraryImpactCaptureFixture } from '../../functions/test/helpers/literaryImpactCaptureFixture.mjs';
import { createLiteraryWorkflowService } from '../../functions/src/literaryWorkflow.mjs';
import { createLiterarySequenceService } from '../../functions/src/literarySequence.mjs';
import { prepareLiteraryCheckpointFixture } from '../../functions/test/helpers/literaryCheckpointCaptureFixture.mjs';
import { createLiteraryPublicationService } from '../../functions/src/literaryPublication.mjs';
import { createLiteraryPublicationGuideService } from '../../functions/src/literaryPublicationGuide.mjs';
import { literaryPublicationEntryId } from '../../functions/src/literaryPublicationContracts.mjs';
import { createLiteraryIntegrationService } from '../../functions/src/literaryIntegration.mjs';
import { createLiteraryReviewService } from '../../functions/src/literaryReview.mjs';
import { createLiteraryAIService } from '../../functions/src/literaryAI.mjs';
import { createLiteraryProseService } from '../../functions/src/literaryProse.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createLiteraryPreparationService } from '../../functions/src/literaryPreparation.mjs';
import { createLiteraryProgressService } from '../../functions/src/literaryProgress.mjs';
import { LITERARY_GATE_CRITERIA } from '../../functions/src/literaryGateProtocol.mjs';
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { createBookEditorialCaptureService } from '../../functions/src/bookEditorialCapture.mjs';
import { createLiteraryProductionService } from '../../functions/src/literaryProduction.mjs';
import { createLiteraryPlanningService } from '../../functions/src/literaryPlanning.mjs';
import { emptyEditorialContract } from '../../functions/src/literaryContracts.mjs';
import { LITERARY_PLAN_SCHEMA } from '../../functions/src/literaryPlanFields.mjs';
const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-editorial-capture',
  target = { kind: 'book', id: 'book' };
let environment, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use somente o emulador demo local.');
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin.doc('books/book').create({
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 1,
    updatedAt: 10,
    wordCount: 0,
  });
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
});
async function fixture() {
  const production = createLiteraryProductionService({ db: admin, now: () => 100 }),
    planning = createLiteraryPlanningService({ db: admin, now: () => 200 }),
    api = createBookEditorialCaptureService({ db: admin });
  await production.saveLiteraryContract('author', {
    target,
    operationId: 'capture-sdk-contract-0001',
    expectedRevision: 0,
    contract: emptyEditorialContract(),
  });
  let sequence = 0;
  const save = (
    id,
    plan = {
      kind: 'chapterBrief',
      title: 'Minha ficha',
      status: 'working',
      fields: { function: 'Texto próprio.' },
      references: [],
    },
  ) =>
    planning.saveLiteraryPlan('author', {
      target,
      id,
      operationId: 'capture-sdk-plan-' + String(++sequence).padStart(5, '0'),
      expectedRevision: 0,
      plan,
    });
  return { api, planning, save };
}
async function source(f) {
  const value = await f.api.getBookEditorialCaptureSource('author', { bookId: 'book' });
  return {
    bookId: 'book',
    bookSourceToken: value.bookSourceToken,
    editorialSourceToken: value.editorialSourceToken,
  };
}
const list = (f, wire, family, cursor = null) =>
  f.api.listBookEditorialCaptureRecords('author', { ...wire, family, cursor, limit: 1 });
test('native metadata-only pages bind the current record and immutable alias to one portable logical identity', async () => {
  const f = await fixture();
  await f.save('plan');
  const wire = await source(f),
    current = (await list(f, wire, 'plan-current')).items[0],
    version = (await list(f, wire, 'plan-version')).items[0];
  const body = await f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      family: 'plan-current',
      ...current,
      index: 0,
    }),
    alias = await f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      family: 'plan-version',
      ...version,
      index: 0,
    });
  assert.equal(alias.state, 'current-alias');
  assert.equal(alias.artifactId, body.artifactId);
  assert.equal(alias.contentHash, body.contentHash);
  assert.equal(Object.hasOwn(alias, 'chunkBase64'), false);
  assert.equal(JSON.stringify(current).includes('Minha ficha'), false);
  assert.equal(
    JSON.parse(Buffer.from(body.chunkBase64, 'base64').toString('utf8')).lineage.role,
    'current',
  );
  await f.api.verifyBookEditorialCaptureRecord('author', {
    ...wire,
    family: 'plan-current',
    ...current,
    projectionToken: body.projectionToken,
  });
});
test('native name ordering resumes bounded pages and never accepts another family cursor', async () => {
  const f = await fixture();
  for (const id of ['a', 'z', '🌙']) await f.save(id);
  const wire = await source(f);
  let cursor = null;
  const ids = [];
  do {
    const page = await list(f, wire, 'plan-current', cursor);
    assert.ok(page.items.length <= 1);
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
    if (cursor) await assert.rejects(list(f, wire, 'plan-version', cursor));
  } while (cursor);
  assert.deepEqual(ids, ['a', 'z', '🌙']);
});
test('native global revocation between bounded parts rejects the pinned projection without changing saved own content', async () => {
  const f = await fixture();
  await admin.doc('books/book').update({ universeId: 'world' });
  await admin.doc('universes/world').create({ authorId: 'author' });
  await admin
    .doc('universes/world/lore/entity')
    .create({ name: 'External', details: 'PRIVATE_EXTERNAL_BODY', revision: 1 });
  const { items } = await f.planning.listLiteraryReferences('author', {
      target,
      kind: 'globalLore',
    }),
    fields = Object.fromEntries(
      Object.keys(LITERARY_PLAN_SCHEMA.chapterBrief.fields).map((key) => [key, 'x'.repeat(3000)]),
    );
  await f.save('linked', {
    kind: 'chapterBrief',
    title: 'Minha ficha',
    status: 'working',
    fields,
    references: [items[0].reference],
  });
  const wire = await source(f),
    item = (await list(f, wire, 'plan-current')).items[0],
    record = { ...wire, family: 'plan-current', ...item },
    part = await f.api.readBookEditorialCaptureRecord('author', { ...record, index: 0 });
  assert.ok(part.chunkCount > 1);
  await admin.doc('universes/world').update({ authorId: 'other' });
  await assert.rejects(
    f.api.readBookEditorialCaptureRecord('author', {
      ...record,
      index: 1,
      projectionToken: part.projectionToken,
    }),
    (error) => error.details?.reason === 'book-backup-item-changed',
  );
  await assert.rejects(
    f.api.verifyBookEditorialCaptureRecord('author', {
      ...record,
      projectionToken: part.projectionToken,
    }),
  );
  assert.equal(
    (await admin.doc('books/book/literaryPlans/linked').get()).data().plan.fields.function,
    fields.function,
  );
});

async function preparationFixture() {
  const f = await fixture(),
    scenes = createScenesService({ db: admin, now: () => 220 }),
    chapter = await scenes.createSceneGroup('author', {
      target,
      operationId: 'capture-sdk-chapter-0001',
      title: 'Capítulo',
    });
  await scenes.createScene('author', {
    target,
    parentId: chapter.id,
    operationId: 'capture-sdk-scene-0001',
    title: 'Cena',
    content: '',
    planning: { objective: 'Uma decisão.' },
  });
  const options = await f.planning.listLiteraryReferences('author', {
      target,
      kind: 'chapter',
      purpose: 'subject',
    }),
    reference = options.items.find((item) => item.reference.id === chapter.id).reference,
    planIds = ['brief', 'scenes', 'world'];
  for (const [index, kind] of ['chapterBrief', 'scenePreparation', 'localWorldbuilding'].entries())
    await f.save(planIds[index], {
      kind,
      title: kind,
      status: 'working',
      fields: kind === 'chapterBrief' ? { function: 'Uma decisão muda o vínculo.' } : {},
      references: [reference],
    });
  const preparation = createLiteraryPreparationService({ db: admin, now: () => 350 }),
    context = await preparation.getLiteraryPreparationContext('author', {
      target,
      chapterId: chapter.id,
      planIds,
    });
  await preparation.saveLiteraryPreparationGate('author', {
    target,
    chapterId: chapter.id,
    planIds,
    operationId: 'capture-sdk-preparation-0001',
    expectedRevision: 0,
    stateToken: context.snapshot.stateToken,
    gate: {
      authorAccepted: true,
      notes: 'Aceite histórico.',
      criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
        id,
        result: 'pass',
        rationale: 'Uma razão.',
        evidence: [{ documentId: 'plan:brief', quote: 'Uma decisão muda o vínculo.' }],
      })),
    },
  });
  return { ...f, chapterId: chapter.id };
}
test('native preparation snapshots export a bounded historical bundle and a coherent immutable alias', async () => {
  const f = await preparationFixture(),
    wire = await source(f),
    item = (await list(f, wire, 'preparation-current')).items[0],
    version = (await list(f, wire, 'preparation-version')).items[0],
    body = await f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      family: 'preparation-current',
      ...item,
      index: 0,
    }),
    alias = await f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      family: 'preparation-version',
      ...version,
      index: 0,
    });
  assert.equal(body.payload, 'editorial-bundle');
  assert.equal(body.recordCount, 15);
  assert.equal(body.chunkCount, 1);
  const bundle = JSON.parse(Buffer.from(body.chunkBase64, 'base64').toString('utf8'));
  assert.equal(bundle.artifacts[0].content.preparation.historicalAcceptance, true);
  assert.equal(bundle.artifacts[1].content.quote, 'Uma decisão muda o vínculo.');
  assert.equal(alias.state, 'current-alias');
  assert.equal(alias.contentHash, body.contentHash);
});
test('native revoked preparation uses masked metadata and never reads the protected body', async () => {
  await preparationFixture();
  await admin.doc('books/book/literaryPlans/brief').delete();
  const fullReads = [],
    watched = {
      doc: admin.doc.bind(admin),
      collection: admin.collection.bind(admin),
      runTransaction: (callback) =>
        admin.runTransaction((tx) =>
          callback({
            get(...args) {
              if (args[0].path) fullReads.push(args[0].path);
              return tx.get(...args);
            },
            getAll(...args) {
              return tx.getAll(...args);
            },
          }),
        ),
    },
    api = createBookEditorialCaptureService({ db: watched }),
    sourceValue = await api.getBookEditorialCaptureSource('author', { bookId: 'book' }),
    wire = {
      bookId: 'book',
      bookSourceToken: sourceValue.bookSourceToken,
      editorialSourceToken: sourceValue.editorialSourceToken,
    },
    page = await api.listBookEditorialCaptureRecords('author', {
      ...wire,
      family: 'preparation-current',
      limit: 1,
    }),
    body = await api.readBookEditorialCaptureRecord('author', {
      ...wire,
      family: 'preparation-current',
      ...page.items[0],
      index: 0,
    }),
    bundle = JSON.parse(Buffer.from(body.chunkBase64, 'base64').toString('utf8'));
  assert.equal(bundle.artifacts[0].content, null);
  assert.equal(bundle.artifacts[0].availability.reason, 'source-revoked');
  assert.equal(
    fullReads.some((path) => path.includes('/literaryPreparationGates/')),
    false,
  );
  assert.equal(
    fullReads.some((path) => path.includes('/literaryPreparationGateVersions/')),
    false,
  );
});
test('native own progress annotations survive a removed source without adopting a recreated artifact', async () => {
  const f = await fixture();
  await f.save('plan');
  const progress = createLiteraryProgressService({ db: admin, now: () => 500 }),
    detail = await progress.getLiteraryProgressArtifact('author', {
      target,
      stage: 'planning',
      id: 'plan',
    });
  await progress.saveLiteraryProgressNote('author', {
    target,
    stage: 'planning',
    id: 'plan',
    sourceToken: detail.artifact.sourceToken,
    expectedRevision: 0,
    operationId: 'capture-sdk-note-0001',
    notes: { blockers: ['Minha pendência.'], nextStep: 'Conferir\r\nsem substituir.' },
  });
  await admin.doc('books/book/literaryPlans/plan').delete();
  const wire = await source(f),
    item = (await list(f, wire, 'progress-current')).items[0],
    body = await f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      family: 'progress-current',
      ...item,
      index: 0,
    }),
    document = JSON.parse(Buffer.from(body.chunkBase64, 'base64').toString('utf8'));
  assert.equal(document.content.sections.at(-1).text, 'Conferir\r\nsem substituir.');
  assert.equal(document.content.references[0].state, 'unavailable');
});

test('native finding capture uses own-field masks and aliases without loading result caches or baseline labels', async () => {
  await fixture();
  const subject = { jobId: 'sdk-decision-job', requestId: 'sdk-decision-request', index: 0 },
    id = digest(subject),
    value = {
      schemaVersion: 1,
      id,
      revision: 1,
      source: { ...subject, fingerprint: 'a'.repeat(64) },
      action: 'retain',
      state: 'retained',
      rationale: 'Minha decisão histórica.',
      target: null,
      baseline: {
        label: 'PRIVATE_DERIVED_LABEL',
        identityToken: 'a'.repeat(64),
        versionToken: 'b'.repeat(64),
        revision: 1,
        proofKind: 'reference',
        contentHash: 'b'.repeat(64),
      },
      correction: null,
      createdAt: 20,
      updatedAt: 20,
    };
  await admin.doc('books/book/literaryFindingDecisions/' + id).create(value);
  await admin
    .doc('books/book/literaryFindingDecisionVersions/' + digest({ id, revision: 1 }))
    .create(value);
  await admin
    .doc('books/book/literaryIntegrationResults/' + subject.requestId)
    .create({ privateCache: 'PRIVATE_RESULT' });
  const masks = [],
    fullReads = [],
    watched = {
      doc: admin.doc.bind(admin),
      collection: admin.collection.bind(admin),
      runTransaction: (callback) =>
        admin.runTransaction((tx) =>
          callback({
            get(...args) {
              if (args[0].path) fullReads.push(args[0].path);
              return tx.get(...args);
            },
            getAll(...args) {
              masks.push({ path: args[0].path, fields: args.at(-1).fieldMask });
              return tx.getAll(...args);
            },
          }),
        ),
    },
    api = createBookEditorialCaptureService({ db: watched }),
    capture = await api.getBookEditorialCaptureSource('author', { bookId: 'book' }),
    wire = {
      bookId: 'book',
      bookSourceToken: capture.bookSourceToken,
      editorialSourceToken: capture.editorialSourceToken,
    },
    page = await api.listBookEditorialCaptureRecords('author', {
      ...wire,
      family: 'finding-current',
      limit: 1,
    }),
    record = await api.readBookEditorialCaptureRecord('author', {
      ...wire,
      family: 'finding-current',
      ...page.items[0],
      index: 0,
    }),
    version = (
      await api.listBookEditorialCaptureRecords('author', {
        ...wire,
        family: 'finding-version',
        limit: 1,
      })
    ).items[0],
    alias = await api.readBookEditorialCaptureRecord('author', {
      ...wire,
      family: 'finding-version',
      ...version,
      index: 0,
    }),
    bundle = JSON.parse(Buffer.from(record.chunkBase64, 'base64').toString('utf8'));
  assert.equal(bundle.artifacts[0].content.rationale, 'Minha decisão histórica.');
  assert.equal(bundle.artifacts[0].content.status, 'retained');
  assert.equal(alias.state, 'current-alias');
  assert.equal(alias.contentHash, record.contentHash);
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_'), false);
  assert.equal(
    fullReads.some((path) => path.includes('/literaryIntegrationResults/')),
    false,
  );
  assert.ok(
    masks
      .filter((mask) => mask.path.includes('/literaryFindingDecisions/'))
      .every((mask) => !mask.fields.includes('baseline.label')),
  );
});
test('native impact UID metadata filtering preserves bounded pagination and never exposes a foreign annotation', async () => {
  const f = await fixture(),
    value = {
      uid: 'author',
      jobId: 'sdk-own-impact',
      checkId: 'a'.repeat(64),
      controlBirth: [10, 1],
      observationToken: 'b'.repeat(64),
      proofHash: 'c'.repeat(64),
      revision: 1,
      status: 'reviewed',
      rationale: 'Minha resolução.',
      evidence: [{ note: 'Nota própria.' }],
      updatedAt: 20,
    },
    id = digest({ jobId: value.jobId, checkId: value.checkId });
  await admin
    .doc('books/book/literaryImpactDecisions/00-foreign')
    .create({ uid: 'other', rationale: 'PRIVATE_FOREIGN' });
  await admin.doc('books/book/literaryImpactDecisions/' + id).create(value);
  await admin
    .doc(
      'books/book/literaryImpactDecisionVersions/' +
        digest({ jobId: value.jobId, checkId: value.checkId, revision: 1 }),
    )
    .create(value);
  const wire = await source(f),
    page = await list(f, wire, 'impact-current');
  assert.deepEqual(page.items, []);
  assert.ok(page.nextCursor);
  const next = await list(f, wire, 'impact-current', page.nextCursor);
  assert.equal(next.items[0].id, id);
  const record = await f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      family: 'impact-current',
      ...next.items[0],
      index: 0,
    }),
    bundle = JSON.parse(Buffer.from(record.chunkBase64, 'base64').toString('utf8'));
  assert.equal(bundle.artifacts.length, 2);
  assert.equal(bundle.artifacts[1].content.classification, 'interpretation');
  assert.equal(bundle.artifacts[1].content.quote, '');
  assert.equal(JSON.stringify(bundle).includes('PRIVATE_FOREIGN'), false);
});

async function nativeProseCaptureFixture(content = '<p>Uma carta muda a casa. 🌙</p>') {
  await admin.doc('books/book').set({
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 1,
    updatedAt: 10,
    wordCount: 0,
  });
  await admin.doc('users/author').set({ credits: 10 });
  const scenes = createScenesService({ db: admin, now: () => 100 });
  const chapter = await scenes.createSceneGroup('author', {
    target,
    operationId: 'capture-native-prose-chapter',
    title: 'Carta',
  });
  const created = await scenes.createScene('author', {
    target,
    parentId: chapter.id,
    operationId: 'capture-native-prose-scene',
    title: 'Cena',
    content,
    planning: {},
  });
  const prose = createLiteraryProseService({
    db: admin,
    now: () => 200,
    generator: (context) => {
      const manuscript = context.documents.find((document) => document.id === 'manuscript');
      return Promise.resolve({
        text: 'Ela abriu a carta.',
        complete: true,
        rationale: 'PRIVATE_NATIVE_REASON',
        findings: [
          {
            sourceId: 'manuscript',
            quote: manuscript.text.slice(0, 12),
            problem: 'Conferir a reação.',
            severity: 'warning',
            action: 'Rever intenção.',
          },
        ],
      });
    },
  });
  const info = await prose.getLiteraryProseSourceInfo('author', {
    target,
    chapterId: chapter.id,
    sceneId: created.scene.id,
  });
  const requestId = 'capture-native-prose-request';
  await prose.startLiteraryProse('author', {
    target,
    requestId,
    chapterId: chapter.id,
    sceneId: created.scene.id,
    expectedSourceToken: info.sourceToken,
    mode: 'reviseScene',
    segment: 0,
    instruction: 'PRIVATE_NATIVE_INSTRUCTION',
  });
  const fullReads = [],
    db = {
      doc: admin.doc.bind(admin),
      collection: admin.collection.bind(admin),
      runTransaction: (callback) =>
        admin.runTransaction((tx) =>
          callback({
            get(...args) {
              if (args[0].path) fullReads.push(args[0].path);
              return tx.get(...args);
            },
            getAll(...args) {
              return tx.getAll(...args);
            },
          }),
        ),
    };
  const api = createBookEditorialCaptureService({ db });
  async function wire() {
    const value = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    const source = {
      bookId: 'book',
      bookSourceToken: value.bookSourceToken,
      editorialSourceToken: value.editorialSourceToken,
    };
    const page = await api.listBookEditorialCaptureRecords('author', {
      ...source,
      family: 'prose',
      limit: 1,
    });
    assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
    return { ...source, family: 'prose', ...page.items[0] };
  }
  return {
    api,
    wire,
    fullReads,
    sceneId: created.scene.id,
    path: 'books/book/literaryProseRequests/' + requestId,
  };
}
test('native prose capture preserves typed results and own instructions while revoked origins never open the request body', async () => {
  const f = await nativeProseCaptureFixture(),
    wire = await f.wire();
  const first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  const bundle = JSON.parse(Buffer.from(first.chunkBase64, 'base64').toString('utf8'));
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'prose' && item.content.role === 'proposal')
      .content.text,
    'Ela abriu a carta.',
  );
  assert.equal(
    bundle.artifacts.find((item) => item.kind === 'report').content.reading.completeScene,
    true,
  );
  await admin.doc('books/book/scenes/' + f.sceneId).delete();
  const revokedWire = await f.wire();
  f.fullReads.length = 0;
  const hidden = await f.api.readBookEditorialCaptureRecord('author', { ...revokedWire, index: 0 });
  const archived = JSON.parse(Buffer.from(hidden.chunkBase64, 'base64').toString('utf8'));
  assert.equal(f.fullReads.includes(f.path), false);
  assert.equal(JSON.stringify(archived).includes('PRIVATE_NATIVE_INSTRUCTION'), true);
  assert.equal(JSON.stringify(archived).includes('PRIVATE_NATIVE_REASON'), false);
  assert.equal(
    archived.artifacts.find((item) => item.kind === 'report').availability.reason,
    'source-revoked',
  );
});
test('native prose parts and final verification reauthorize the source after a valid first transfer', async () => {
  const f = await nativeProseCaptureFixture('<p>' + 'Literal 🌙 '.repeat(5000) + '</p>');
  const wire = await f.wire(),
    first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  assert.ok(first.chunkCount > 1);
  await admin.doc('books/book/scenes/' + f.sceneId).delete();
  f.fullReads.length = 0;
  await assert.rejects(
    f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      index: 1,
      projectionToken: first.projectionToken,
    }),
  );
  await assert.rejects(
    f.api.verifyBookEditorialCaptureRecord('author', {
      ...wire,
      projectionToken: first.projectionToken,
    }),
  );
  assert.equal(f.fullReads.includes(f.path), false);
});

async function nativeGenerationCaptureFixture({ chapter = false } = {}) {
  const planning = createLiteraryPlanningService({ db: admin, now: () => 100 }),
    references = [];
  if (chapter) {
    await admin.doc('books/book/chapters/selected').create({
      bookId: 'book',
      title: 'A carta',
      content: '<p>PRIVATE_NATIVE_SOURCE mudou a casa.</p>',
      wordCount: 5,
      createdAt: 1,
      updatedAt: 10,
      order: 0,
    });
    const page = await planning.listLiteraryReferences('author', { target, kind: 'chapter' });
    references.push(page.items.find((item) => item.reference.id === 'selected').reference);
  }
  const ai = createLiteraryAIService({
    db: admin,
    now: () => 200,
    generator: () =>
      Promise.resolve({
        plan: { title: 'PRIVATE_NATIVE_PROPOSAL', fields: { question: 'A decisão tem custo?' } },
        rationale: 'PRIVATE_NATIVE_GENERATION_REASON',
        findings: [
          {
            sourceId: 'draft',
            quote: 'A carta',
            problem: 'Conferir a intenção.',
            severity: 'suggestion',
            action: 'Rever custo.',
          },
        ],
      }),
  });
  const operationId = 'capture-native-generation-request';
  await ai.startLiteraryProposal('author', {
    target,
    operationId,
    mode: 'propose',
    expectedRevision: 0,
    instruction: 'PRIVATE_NATIVE_GENERATION_INSTRUCTION',
    sourcePlanIds: [],
    plan: {
      kind: 'bookOverview',
      title: 'A carta',
      status: 'working',
      fields: { question: 'PRIVATE_NATIVE_OWN_PLAN' },
      references,
    },
  });
  const fullReads = [],
    db = {
      doc: admin.doc.bind(admin),
      collection: admin.collection.bind(admin),
      runTransaction: (callback) =>
        admin.runTransaction((tx) =>
          callback({
            get(...args) {
              if (args[0].path) fullReads.push(args[0].path);
              return tx.get(...args);
            },
            getAll(...args) {
              return tx.getAll(...args);
            },
          }),
        ),
    };
  const api = createBookEditorialCaptureService({ db });
  async function wire(id = operationId) {
    const value = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    const source = {
      bookId: 'book',
      bookSourceToken: value.bookSourceToken,
      editorialSourceToken: value.editorialSourceToken,
    };
    const page = await api.listBookEditorialCaptureRecords('author', {
      ...source,
      family: 'generation',
      limit: 20,
    });
    assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
    return { ...source, family: 'generation', ...page.items.find((item) => item.id === id) };
  }
  return {
    ai,
    api,
    wire,
    fullReads,
    path: 'books/book/literaryGenerations/' + operationId,
    operationId,
  };
}
test('native generation projection preserves an unadopted proposal and selected-source coverage without inventing quotation offsets', async () => {
  const f = await nativeGenerationCaptureFixture(),
    wire = await f.wire();
  const first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  const { artifacts } = JSON.parse(Buffer.from(first.chunkBase64, 'base64').toString('utf8'));
  const proposal = artifacts.find((item) => item.kind === 'plan' && item.provenance === 'ai');
  const report = artifacts.find((item) => item.kind === 'report'),
    evidence = artifacts.find((item) => item.kind === 'evidence');
  assert.equal(proposal.content.status, 'proposal');
  assert.equal(proposal.lineage, undefined);
  assert.equal(proposal.revision, null);
  assert.equal(report.content.claimedCoverage.scope, 'selected-sources');
  assert.equal(report.content.claimedCoverage.total, 2);
  assert.equal(evidence.content.start, null);
  assert.equal(evidence.content.context.offsetBase, null);
  assert.equal((await admin.doc('users/author').get()).exists, false);
});
test('native generation retrieval and capture both hide a result after its original selected prose changes', async () => {
  const f = await nativeGenerationCaptureFixture({ chapter: true }),
    wire = await f.wire();
  const first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  await admin
    .doc('books/book/chapters/selected')
    .update({ content: '<p>Outra prosa.</p>', updatedAt: 11 });
  const native = await f.ai.getLiteraryProposal('author', { target, operationId: f.operationId });
  assert.equal(native.state, 'stale');
  f.fullReads.length = 0;
  await assert.rejects(
    f.api.verifyBookEditorialCaptureRecord('author', {
      ...wire,
      projectionToken: first.projectionToken,
    }),
  );
  const next = await f.api.readBookEditorialCaptureRecord('author', {
    ...(await f.wire()),
    index: 0,
  });
  const { artifacts } = JSON.parse(Buffer.from(next.chunkBase64, 'base64').toString('utf8'));
  assert.equal(f.fullReads.includes(f.path), false);
  assert.equal(artifacts.find((item) => item.kind === 'report').availability.state, 'unavailable');
  assert.equal(JSON.stringify(artifacts).includes('PRIVATE_NATIVE_OWN_PLAN'), true);
  assert.equal(JSON.stringify(artifacts).includes('PRIVATE_NATIVE_GENERATION_REASON'), false);
});
test('native generation cancel-before-start remains a checkpoint without fabricated input or target', async () => {
  const f = await nativeGenerationCaptureFixture(),
    id = 'capture-native-generation-cancel';
  await f.ai.cancelLiteraryProposal('author', { target, operationId: id });
  const first = await f.api.readBookEditorialCaptureRecord('author', {
    ...(await f.wire(id)),
    index: 0,
  });
  const { artifacts } = JSON.parse(Buffer.from(first.chunkBase64, 'base64').toString('utf8'));
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].content.process, 'planning');
  assert.equal(artifacts[0].content.phase, 'canceled');
  assert.equal(artifacts[0].content.currentUnit, null);
  assert.deepEqual(artifacts[0].content.references, []);
  assert.equal(artifacts[0].content.controlsDisabled, true);
});

async function nativeReviewCaptureFixture() {
  const scenes = createScenesService({ db: admin, now: () => 100 });
  const chapter = await scenes.createSceneGroup('author', {
    target,
    operationId: 'capture-native-review-chapter',
    title: 'Carta',
  });
  const created = await scenes.createScene('author', {
    target,
    parentId: chapter.id,
    operationId: 'capture-native-review-scene',
    title: 'Cena',
    content: '<p>Ela recebeu a carta.</p>',
  });
  const review = createLiteraryReviewService({
    db: admin,
    now: () => 200,
    generator: (context) => {
      const document = context.documents.find((item) => item.id === 'manuscript');
      return Promise.resolve({
        complete: true,
        text: '',
        rationale: 'PRIVATE_NATIVE_REVIEW_REASON',
        findings: [
          {
            sourceId: document.id,
            quote: document.text.slice(0, 5),
            problem: 'PRIVATE_NATIVE_REVIEW_FINDING',
            severity: 'warning',
            action: 'Conferir intenção.',
          },
        ],
      });
    },
  });
  const jobId = 'capture-native-review-job';
  await review.startLiteraryReview('author', {
    target,
    jobId,
    chapterId: chapter.id,
    instruction: 'PRIVATE_NATIVE_REVIEW_INSTRUCTION',
  });
  let finished = false;
  for (let step = 0; step < 30; step++) {
    const value = await review.advanceLiteraryReview('author', { target, jobId });
    if (value.state === 'done') {
      finished = true;
      break;
    }
  }
  assert.equal(finished, true);
  const api = createBookEditorialCaptureService({ db: admin });
  async function wire(family, id) {
    const source = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    const value = {
      bookId: 'book',
      bookSourceToken: source.bookSourceToken,
      editorialSourceToken: source.editorialSourceToken,
    };
    const page = await api.listBookEditorialCaptureRecords('author', {
      ...value,
      family,
      limit: 20,
    });
    assert.equal(JSON.stringify(page).includes('PRIVATE'), false);
    return { ...value, family, ...page.items.find((item) => item.id === id) };
  }
  const records = await admin
    .collection('books/book/literaryReviewAnalyses')
    .where('jobId', '==', jobId)
    .get();
  return {
    api,
    wire,
    review,
    scenes,
    chapterId: chapter.id,
    sceneId: created.scene.id,
    jobId,
    analysis: records.docs[0],
  };
}
async function nativeReviewArtifact(f, family, id) {
  const wire = await f.wire(family, id),
    first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  return {
    wire,
    first,
    artifacts: JSON.parse(Buffer.from(first.chunkBase64, 'base64').toString('utf8')).artifacts,
  };
}
test('native review records exact birth associations and captures coverage without duplicating or exposing source reports', async () => {
  const f = await nativeReviewCaptureFixture(),
    data = f.analysis.data();
  assert.ok(data.captureBinding.jobBirth);
  assert.ok(data.captureBinding.unitBirth);
  assert.ok(data.captureBinding.requestBirth);
  const root = await nativeReviewArtifact(f, 'review-job', f.jobId),
    marker = await nativeReviewArtifact(f, 'review-analysis', f.analysis.id);
  const source = await nativeReviewArtifact(f, 'prose', data.requestId),
    report = source.artifacts.find((item) => item.kind === 'report');
  assert.equal(
    root.artifacts.find((item) => item.kind === 'report').content.claimedCoverage.scope,
    'chapter-scenes',
  );
  assert.ok(
    marker.artifacts[0].content.references.some(
      (ref) => ref.id === report.id && ref.state === 'recorded',
    ),
  );
  assert.equal(JSON.stringify(marker.artifacts).includes('PRIVATE_NATIVE_REVIEW_FINDING'), false);
  const publicRows = await f.review.listLiteraryReviewAnalyses('author', {
    target,
    jobId: f.jobId,
  });
  assert.equal(Object.hasOwn(publicRows.items[0], 'captureBinding'), false);
});
test('native backup does not retire a stale review and never rebinds its old metadata to a recreated prose request', async () => {
  const f = await nativeReviewCaptureFixture(),
    data = f.analysis.data();
  const prior = await nativeReviewArtifact(f, 'review-analysis', f.analysis.id),
    pointer = prior.artifacts[0].content.references.at(-1).id;
  const request = admin.doc('books/book/literaryProseRequests/' + data.requestId),
    body = (await request.get()).data();
  await request.delete();
  await request.create(body);
  const current = await nativeReviewArtifact(f, 'review-analysis', f.analysis.id);
  assert.equal(current.artifacts[0].content.references.at(-1).id, pointer);
  assert.equal(current.artifacts[0].content.references.at(-1).state, 'unavailable');
  await admin.doc('books/book/chapters/' + f.chapterId).update({ assemblyRevision: 99 });
  const before = (await admin.doc('books/book/literaryReviewJobs/' + f.jobId).get()).data();
  const root = await nativeReviewArtifact(f, 'review-job', f.jobId);
  assert.equal(
    root.artifacts.find((item) => item.kind === 'report').availability.state,
    'unavailable',
  );
  assert.deepEqual(
    (await admin.doc('books/book/literaryReviewJobs/' + f.jobId).get()).data(),
    before,
  );
});

async function nativeIntegrationCaptureFixture() {
  await admin.doc('users/author').set({ credits: 10 });
  for (let index = 0; index < 2; index++)
    await admin.doc('books/book/chapters/integration-' + index).create({
      bookId: 'book',
      title: 'Capítulo ' + index,
      order: index,
      content: '<p>Ela recebeu a carta.</p>',
      updatedAt: 100,
    });
  const jobId = 'capture-sdk-integration',
    integration = createLiteraryIntegrationService({
      db: admin,
      now: () => 400,
      generator: async (input) => {
        if (input.scope.phase === 'synthesis')
          return {
            complete: true,
            report: 'PRIVATE_SDK_INTEGRATION_SYNTHESIS',
            findings: [],
            conclusions: [
              {
                axis: 'causality',
                observation: 'As ações têm consequências.',
                evidenceIds: input.documents.map((item) => item.id),
              },
            ],
          };
        const source = input.documents[0];
        return {
          complete: true,
          report: 'PRIVATE_SDK_INTEGRATION_READING',
          findings: [
            {
              severity: 'warning',
              problem: 'Conferir a reação.',
              action: 'Conferir a carta.',
              evidence: [{ sourceId: source.id, quote: source.text.slice(0, 5) }],
            },
          ],
          matrix: [],
        };
      },
    });
  await integration.startLiteraryIntegration('author', {
    target,
    jobId,
    level: 'book',
    instruction: 'PRIVATE_SDK_INTEGRATION_OWN',
  });
  let done = false;
  for (let step = 0; step < 200; step++) {
    const value = await integration.advanceLiteraryIntegration('author', { target, jobId });
    if (value.state === 'done') {
      done = true;
      break;
    }
  }
  assert.equal(done, true);
  const requests = (await admin.collection('books/book/literaryIntegrationRequests').get()).docs;
  const api = createBookEditorialCaptureService({ db: admin }),
    fullReads = [];
  const watched = {
    doc: (path) => admin.doc(path),
    collection: (path) => admin.collection(path),
    runTransaction: (callback) =>
      admin.runTransaction((tx) =>
        callback({
          get: (resource) => {
            if (resource.path) fullReads.push(resource.path);
            return tx.get(resource);
          },
          getAll: (...args) => tx.getAll(...args),
        }),
      ),
  };
  const capture = createBookEditorialCaptureService({ db: watched });
  async function wire(family, id) {
    const source = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    const base = {
      bookId: 'book',
      bookSourceToken: source.bookSourceToken,
      editorialSourceToken: source.editorialSourceToken,
    };
    const page = await api.listBookEditorialCaptureRecords('author', {
      ...base,
      family,
      limit: 50,
    });
    return { ...base, family, ...page.items.find((item) => item.id === id) };
  }
  async function read(family, id) {
    const request = await wire(family, id),
      first = await capture.readBookEditorialCaptureRecord('author', { ...request, index: 0 });
    assert.equal(first.chunkCount, 1);
    await capture.verifyBookEditorialCaptureRecord('author', {
      ...request,
      projectionToken: first.projectionToken,
    });
    return {
      artifacts: JSON.parse(Buffer.from(first.chunkBase64, 'base64').toString('utf8')).artifacts,
    };
  }
  return { jobId, requests, read, fullReads, integration };
}

test('native integration captures exact report associations and frozen generation without duplicating synthesis quotes', async () => {
  const f = await nativeIntegrationCaptureFixture(),
    synth = f.requests.find((row) => row.data().kind === 'synthesis');
  const result = (await f.read('integration-request', synth.id)).artifacts;
  assert.equal(
    result.some((item) => item.kind === 'evidence'),
    false,
  );
  const report = result.find((item) => item.kind === 'report'),
    dependencies = report.content.observations[0].reportSources;
  assert.equal(report.content.claimedCoverage.scope, 'evidence-synthesis');
  assert.equal(report.generation.snapshot, 'historical');
  const original = synth.data();
  assert.ok(original.captureBinding.jobBirth);
  assert.equal(original.captureBinding.reportSources.length, dependencies.length);
  for (const [index, sourceId] of original.evidenceIds.entries()) {
    const source = (await f.read('integration-request', sourceId)).artifacts.find(
      (item) => item.kind === 'report',
    );
    assert.equal(dependencies[index].id, source.id);
    assert.equal(dependencies[index].state, 'recorded');
  }
});

test('native integration capture does not write stale state or read the result after its book source changes', async () => {
  const f = await nativeIntegrationCaptureFixture(),
    reading = f.requests.find((row) => row.data().kind === 'reading');
  await admin.doc('books/book').update({ updatedAt: 999 });
  const before = (await admin.doc('books/book/literaryIntegrationJobs/' + f.jobId).get()).data();
  f.fullReads.length = 0;
  const result = (await f.read('integration-request', reading.id)).artifacts;
  assert.equal(result.find((item) => item.kind === 'report').availability.state, 'unavailable');
  assert.equal(
    f.fullReads.some((path) => path.includes('/literaryIntegrationResults/')),
    false,
  );
  assert.deepEqual(
    (await admin.doc('books/book/literaryIntegrationJobs/' + f.jobId).get()).data(),
    before,
  );
  const root = (await f.read('integration-job', f.jobId)).artifacts;
  assert.equal(JSON.stringify(root).includes('PRIVATE_SDK_INTEGRATION_OWN'), true);
});

test('native synthesis source recreation preserves the original unavailable reference', async () => {
  const f = await nativeIntegrationCaptureFixture(),
    synth = f.requests.find((row) => row.data().kind === 'synthesis');
  const original = (await f.read('integration-request', synth.id)).artifacts.find(
    (item) => item.kind === 'report',
  );
  const sourceId = synth.data().evidenceIds[0],
    ref = admin.doc('books/book/literaryIntegrationRequests/' + sourceId),
    saved = (await ref.get()).data();
  await ref.delete();
  await ref.create(saved);
  const after = (await f.read('integration-request', synth.id)).artifacts.find(
    (item) => item.kind === 'report',
  );
  assert.equal(
    after.content.observations[0].reportSources[0].id,
    original.content.observations[0].reportSources[0].id,
  );
  assert.equal(after.content.observations[0].reportSources[0].state, 'unavailable');
});

async function nativePublicationCaptureFixture() {
  await admin.doc('users/author').set({ credits: 10 });
  await admin.doc('books/book/chapters/guide-chapter').create({
    bookId: 'book',
    title: 'Capítulo',
    order: 1,
    updatedAt: 100,
    content: '<p>Ela recebeu a carta.</p>',
  });
  const integrationId = 'capture-sdk-guide-integration',
    jobId = 'capture-sdk-publication';
  const integration = createLiteraryIntegrationService({
    db: admin,
    now: () => 200,
    generator: async (input) =>
      input.scope.phase === 'synthesis'
        ? { complete: true, report: 'Síntese.', findings: [], conclusions: [] }
        : { complete: true, report: 'Leitura.', findings: [], matrix: [] },
  });
  await integration.startLiteraryIntegration('author', {
    target,
    jobId: integrationId,
    level: 'book',
  });
  let complete;
  for (let step = 0; step < 200; step++) {
    const value = await integration.advanceLiteraryIntegration('author', {
      target,
      jobId: integrationId,
    });
    if (value.state === 'done') {
      complete = value;
      break;
    }
  }
  assert.ok(complete);
  await integration.acceptLiteraryIntegration('author', {
    target,
    jobId: integrationId,
    expectedSourceToken: complete.sourceToken,
  });
  const publication = createLiteraryPublicationService({ db: admin, now: () => 300 });
  await publication.startLiteraryPublication('author', {
    target,
    jobId,
    integrationId,
    expectedIntegrationToken: complete.sourceToken,
    policy: 'book',
    unitId: null,
    authorName: 'PRIVATE_SDK_GUIDE_AUTHOR',
    checks: { finalTextReviewed: true, navigationReviewed: true, publicationAuthorized: true },
  });
  let prepared;
  for (let step = 0; step < 250; step++) {
    const value = await publication.advanceLiteraryPublication('author', { target, jobId });
    if (value.state === 'prepared') {
      prepared = value;
      break;
    }
  }
  assert.ok(prepared);
  const guides = createLiteraryPublicationGuideService({ db: admin, now: () => 400 }),
    id = 'sdk-guide-entry';
  const guide = {
    name: 'Carta',
    aliases: ['A carta'],
    category: 'concept',
    summary: 'Uma carta recebida.',
    certainty: 'uncertain',
    disambiguation: '',
    revealAfterChapterId: 'guide-chapter',
    evidence: [{ chapterId: 'guide-chapter', quote: 'Ela recebeu a carta.' }],
    facts: [
      {
        text: 'A carta chegou.',
        certainty: 'fact',
        chapterId: 'guide-chapter',
        quote: 'Ela recebeu a carta.',
      },
    ],
    relationships: [],
    appearances: [],
  };
  let sequence = 0;
  const save = (expectedRevision, value) =>
    guides.saveLiteraryPublicationGuideEntry('author', {
      target,
      jobId,
      id,
      operationId: 'capture-sdk-guide-save-' + ++sequence,
      expectedRevision,
      expectedManifestHash: prepared.manifestHash,
      guide: value,
    });
  await save(0, guide);
  const fullReads = [],
    db = {
      doc: (path) => admin.doc(path),
      collection: (path) => admin.collection(path),
      runTransaction: (callback) =>
        admin.runTransaction((tx) =>
          callback({
            get: (resource) => {
              if (resource.path) fullReads.push(resource.path);
              return tx.get(resource);
            },
            getAll: (...args) => tx.getAll(...args),
          }),
        ),
    };
  const api = createBookEditorialCaptureService({ db });
  async function read(family, sourceId) {
    const source = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    const base = {
      bookId: 'book',
      bookSourceToken: source.bookSourceToken,
      editorialSourceToken: source.editorialSourceToken,
    };
    const page = await api.listBookEditorialCaptureRecords('author', {
      ...base,
      family,
      limit: 50,
    });
    const wire = { ...base, family, ...page.items.find((item) => item.id === sourceId) };
    const first = await api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
    if (first.state === 'current-alias') {
      await api.verifyBookEditorialCaptureRecord('author', {
        ...wire,
        projectionToken: first.projectionToken,
      });
      return { first, artifacts: [] };
    }
    assert.equal(first.chunkCount, 1);
    await api.verifyBookEditorialCaptureRecord('author', {
      ...wire,
      projectionToken: first.projectionToken,
    });
    return {
      first,
      artifacts: JSON.parse(Buffer.from(first.chunkBase64, 'base64').toString('utf8')).artifacts,
    };
  }
  return {
    jobId,
    id,
    save,
    guide,
    guides,
    read,
    fullReads,
    guideId: literaryPublicationEntryId(jobId, id),
  };
}

test('native guide current/version aliases preserve reveal and citation structure under the same archival identity', async () => {
  const f = await nativePublicationCaptureFixture(),
    current = await f.read('reader-guide-current', f.guideId),
    version = await f.read(
      'reader-guide-version',
      digest({ jobId: f.jobId, id: f.id, revision: 1 }),
    );
  assert.equal(version.first.state, 'current-alias');
  assert.equal(version.first.artifactId, current.artifacts[0].id);
  assert.equal(version.first.recordCount, current.artifacts.length);
  assert.equal(version.artifacts.length, 0);
  const doc = current.artifacts[0];
  assert.equal(doc.content.readerGuide.entry.revealAfter.id, 'guide-chapter');
  assert.equal(doc.content.readerGuide.entry.facts[0].certainty, 'fact');
  assert.equal(current.artifacts[1].content.offsetUnit, 'not-recorded');
  const manifest = (await f.read('publication-job', f.jobId)).artifacts.find(
    (item) => item.kind === 'document',
  );
  assert.equal(manifest.content.editionKey, doc.content.editionKey);
  assert.equal((await admin.doc('publicBooks/book').get()).exists, false);
});

test('native withdrawn guide remains historical and its previous text survives manuscript drift without a publication grant', async () => {
  const f = await nativePublicationCaptureFixture();
  await f.save(1, null);
  const current = (await f.read('reader-guide-current', f.guideId)).artifacts[0];
  assert.equal(current.content.readerGuide.entry, null);
  await admin.doc('books/book/chapters/guide-chapter').update({ content: '<p>Outro texto.</p>' });
  const before = (await admin.doc('books/book/literaryPublications/' + f.jobId).get()).data();
  const history = await f.read(
    'reader-guide-version',
    digest({ jobId: f.jobId, id: f.id, revision: 1 }),
  );
  assert.equal(history.artifacts[0].content.readerGuide.entry.name, 'Carta');
  assert.equal(history.artifacts[1].content.quote, 'Ela recebeu a carta.');
  assert.deepEqual(
    (await admin.doc('books/book/literaryPublications/' + f.jobId).get()).data(),
    before,
  );
});

test('native recreated book does not open guide history from the previous book incarnation', async () => {
  const f = await nativePublicationCaptureFixture(),
    root = admin.doc('books/book'),
    saved = (await root.get()).data();
  await root.delete();
  await root.create(saved);
  f.fullReads.length = 0;
  const value = await f.read('reader-guide-current', f.guideId);
  assert.equal(value.artifacts[0].availability.state, 'unavailable');
  assert.equal(f.fullReads.includes('books/book/literaryPublicationGuide/' + f.guideId), false);
});

async function nativeProcessCheckpointFixture(options) {
  await admin.doc('users/author').set({ credits: 10 });
  const native = await prepareLiteraryCheckpointFixture(admin, options),
    fullReads = [];
  const db = {
    doc: (path) => admin.doc(path),
    collection: (path) => admin.collection(path),
    runTransaction: (callback) =>
      admin.runTransaction((tx) =>
        callback({
          get: (resource) => {
            if (resource.path) fullReads.push(resource.path);
            return tx.get(resource);
          },
          getAll: (...args) => tx.getAll(...args),
        }),
      ),
  };
  const api = createBookEditorialCaptureService({ db });
  async function read(family, id) {
    const source = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    const base = {
      bookId: 'book',
      bookSourceToken: source.bookSourceToken,
      editorialSourceToken: source.editorialSourceToken,
    };
    const page = await api.listBookEditorialCaptureRecords('author', {
      ...base,
      family,
      limit: 50,
    });
    const wire = { ...base, family, ...page.items.find((item) => item.id === id) };
    const first = await api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
    assert.equal(first.chunkCount, 1);
    await api.verifyBookEditorialCaptureRecord('author', {
      ...wire,
      projectionToken: first.projectionToken,
    });
    return JSON.parse(Buffer.from(first.chunkBase64, 'base64').toString('utf8')).artifacts;
  }
  return { ...native, fullReads, read };
}

test('native draft and preservation checkpoint births commit with their original proposals and versions', async () => {
  const f = await nativeProcessCheckpointFixture(),
    draftId = digest({ jobId: f.jobId, index: 0 }),
    milestoneId = digest({ jobId: f.milestoneId, index: 0 });
  const unit = (await admin.doc('books/book/literaryDraftUnits/' + draftId).get()).data();
  const preserved = (
    await admin.doc('books/book/literaryMilestoneUnits/' + milestoneId).get()
  ).data();
  assert.ok(unit.captureBinding.jobBirth);
  assert.ok(unit.captureBinding.request.birth);
  assert.ok(preserved.captureBinding.history.birth);
  const before = (await admin.doc('users/author').get()).data();
  const root = await f.read('draft-job', f.jobId);
  assert.equal(root[0].content.controlsDisabled, true);
  assert.equal(root[0].content.counters.applications, 1);
  const preservation = await f.read('milestone-job', f.milestoneId);
  assert.equal(preservation[0].content.process, 'preservation');
  assert.equal(preservation[0].content.counters.verifiedUnits, 1);
  f.fullReads.length = 0;
  const history = await f.read('milestone-unit', milestoneId);
  assert.equal(
    history[0].content.references.find((ref) => ref.kind === 'historyVersion').state,
    'recorded',
  );
  assert.equal(
    f.fullReads.some((path) => /workVersions|workVersionBodies|literaryProseRequests/.test(path)),
    false,
  );
  assert.deepEqual((await admin.doc('users/author').get()).data(), before);
  const publicView = await f.draft.getLiteraryDraft('author', { target, jobId: f.jobId });
  assert.equal(JSON.stringify(publicView).includes('captureBinding'), false);
});

test('native adopted history does not bind to a recreated version with identical fields', async () => {
  const f = await nativeProcessCheckpointFixture({ existing: true }),
    id = digest({ jobId: f.jobId, index: 0 });
  const native = (await admin.doc('books/book/literaryDraftUnits/' + id).get()).data();
  assert.ok(native.captureBinding.history.birth);
  const before = await f.read('draft-unit', id);
  assert.equal(
    before[0].content.references.find((ref) => ref.kind === 'historyVersion').state,
    'recorded',
  );
  const ref = admin.doc('books/book/workVersions/' + native.versionId),
    saved = (await ref.get()).data();
  await ref.delete();
  await ref.create(saved);
  const after = await f.read('draft-unit', id);
  assert.equal(
    after[0].content.references.find((ref) => ref.kind === 'historyVersion').id,
    native.versionId,
  );
  assert.equal(
    after[0].content.references.find((ref) => ref.kind === 'historyVersion').state,
    'unavailable',
  );
  const root = await f.read('draft-job', f.jobId);
  assert.equal(root[0].content.counters.adoptedUnits, 1);
  assert.equal(root[0].content.counters.creditsSpent, 0);
});

async function nativeOrchestrationCaptureFixture() {
  await admin.doc('users/author').set({ credits: 10 });
  const prepared = await prepareLiteraryCheckpointFixture(admin),
    workflow = createLiteraryWorkflowService({
      db: admin,
      now: () => 700,
      generator: async () => {
        throw Error('A captura não deve gerar texto.');
      },
    });
  const scope = await workflow.getLiteraryWorkflowScope('author', {
    target,
    chapterId: prepared.chapterId,
  });
  const workflowId = 'capture-sdk-workflow';
  await workflow.startLiteraryWorkflow('author', {
    target,
    jobId: workflowId,
    chapterId: prepared.chapterId,
    expectedScopeToken: scope.originToken,
    instruction: 'PRIVATE_SDK_WORKFLOW',
    limits: { maxApplications: 0, maxCredits: 0, maxSteps: 10 },
    authorizedPhases: [],
  });
  const sequence = createLiterarySequenceService({ db: admin, now: () => 800 }),
    sequenceId = 'capture-sdk-sequence';
  const selected = await sequence.getLiterarySequenceScope('author', {
    target,
    chapterIds: [prepared.chapterId],
  });
  await sequence.startLiterarySequence('author', {
    target,
    jobId: sequenceId,
    chapterIds: [prepared.chapterId],
    expectedScopeToken: selected.originToken,
    instruction: 'PRIVATE_SDK_SEQUENCE',
    limits: { maxApplications: 0, maxCredits: 0, maxSteps: 10 },
    authorizedPhases: [],
    continueBetweenChapters: false,
  });
  const masks = [],
    db = {
      doc: (path) => admin.doc(path),
      collection: (path) => admin.collection(path),
      runTransaction: (callback) =>
        admin.runTransaction((tx) =>
          callback({
            get: (resource) => tx.get(resource),
            getAll: (...args) => {
              for (const ref of args)
                if (ref.path) masks.push({ path: ref.path, fields: args.at(-1).fieldMask });
              return tx.getAll(...args);
            },
          }),
        ),
    };
  const api = createBookEditorialCaptureService({ db });
  async function read(family, id) {
    const source = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    const base = {
      bookId: 'book',
      bookSourceToken: source.bookSourceToken,
      editorialSourceToken: source.editorialSourceToken,
    };
    const page = await api.listBookEditorialCaptureRecords('author', {
      ...base,
      family,
      limit: 50,
    });
    const wire = { ...base, family, ...page.items.find((item) => item.id === id) };
    const first = await api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
    assert.equal(first.chunkCount, 1);
    await api.verifyBookEditorialCaptureRecord('author', {
      ...wire,
      projectionToken: first.projectionToken,
    });
    return JSON.parse(Buffer.from(first.chunkBase64, 'base64').toString('utf8')).artifacts;
  }
  return { workflowId, sequenceId, read, masks };
}

test('native workflow and sequence settings capture without advancing counters or granting execution', async () => {
  const f = await nativeOrchestrationCaptureFixture(),
    workflowPath = 'books/book/literaryWorkflowJobs/' + f.workflowId,
    sequencePath = 'books/book/literarySequenceJobs/' + f.sequenceId;
  const beforeWorkflow = (await admin.doc(workflowPath).get()).data(),
    beforeSequence = (await admin.doc(sequencePath).get()).data();
  const workflow = await f.read('workflow-job', f.workflowId),
    sequence = await f.read('sequence-job', f.sequenceId);
  assert.equal(workflow[0].content.controlsDisabled, true);
  assert.equal(sequence[0].content.controlsDisabled, true);
  assert.equal(sequence[0].content.counters.plannedUnits, 1);
  assert.equal(sequence[0].content.counters.completedUnits, 0);
  assert.equal(JSON.stringify(workflow).includes('PRIVATE_SDK_WORKFLOW'), true);
  assert.equal(JSON.stringify(sequence).includes('PRIVATE_SDK_SEQUENCE'), true);
  assert.deepEqual((await admin.doc(workflowPath).get()).data(), beforeWorkflow);
  assert.deepEqual((await admin.doc(sequencePath).get()).data(), beforeSequence);
});

test('native wrong actor closes orchestration settings before selecting instruction or frozen limits', async () => {
  const f = await nativeOrchestrationCaptureFixture(),
    path = 'books/book/literaryWorkflowJobs/' + f.workflowId;
  await admin.doc(path).update({ actorId: 'other' });
  f.masks.length = 0;
  const value = await f.read('workflow-job', f.workflowId);
  assert.equal(value.length, 1);
  assert.equal(value[0].availability.state, 'unavailable');
  const reads = f.masks.filter((row) => row.path === path);
  assert.ok(reads.length > 0);
  assert.equal(
    reads.some((row) => row.fields?.includes('instruction') || row.fields?.includes('limits')),
    false,
  );
});

async function nativeImpactArchiveFixture() {
  await admin.doc('users/author').set({ credits: 10 });
  await admin.doc('books/book/chapters/impact-chapter').create({
    bookId: 'book',
    ownerId: 'author',
    title: 'PRIVATE_SDK_IMPACT_LABEL',
    order: 0,
    contentMode: 'legacy',
    content: '<p>PRIVATE_SDK_IMPACT_BODY</p>',
    updatedAt: 10,
  });
  const native = await prepareLiteraryImpactCaptureFixture(admin, { finish: false }),
    masks = [];
  const db = {
    doc: (path) => admin.doc(path),
    collection: (path) => admin.collection(path),
    runTransaction: (callback) =>
      admin.runTransaction((tx) =>
        callback({
          get: (resource) => tx.get(resource),
          getAll: (...args) => {
            for (const ref of args)
              if (ref.path) masks.push({ path: ref.path, fields: args.at(-1).fieldMask });
            return tx.getAll(...args);
          },
        }),
      ),
  };
  const api = createBookEditorialCaptureService({ db });
  async function read(family, id) {
    const source = await api.getBookEditorialCaptureSource('author', { bookId: 'book' });
    const base = {
      bookId: 'book',
      bookSourceToken: source.bookSourceToken,
      editorialSourceToken: source.editorialSourceToken,
    };
    const page = await api.listBookEditorialCaptureRecords('author', {
        ...base,
        family,
        limit: 50,
      }),
      wire = { ...base, family, ...page.items.find((item) => item.id === id) };
    const first = await api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
    assert.equal(first.chunkCount, 1);
    await api.verifyBookEditorialCaptureRecord('author', {
      ...wire,
      projectionToken: first.projectionToken,
    });
    return JSON.parse(Buffer.from(first.chunkBase64, 'base64').toString('utf8')).artifacts;
  }
  const node = (await admin.collection('books/book/literaryImpactNodes').limit(1).get()).docs[0];
  assert.ok(node);
  return { ...native, masks, read, node };
}

test('native impact archive shares control identities with gated graph rows without reading private labels or changing state', async () => {
  const f = await nativeImpactArchiveFixture(),
    path = 'books/book/literaryImpactControls/' + f.jobId,
    before = (await admin.doc(path).get()).data();
  const control = await f.read('impact-control', f.jobId),
    node = await f.read('impact-node', f.node.id),
    graph = await f.read('impact-graph', f.jobId);
  assert.equal(control[0].content.controlsDisabled, true);
  assert.equal(node[0].availability.state, 'included');
  assert.ok(
    node[0].content.references.some((ref) => ref.id === control[0].id && ref.state === 'recorded'),
  );
  assert.ok(
    graph[0].content.references.some((ref) => ref.id === control[0].id && ref.state === 'recorded'),
  );
  assert.equal(
    JSON.stringify([...control, ...node, ...graph]).includes('PRIVATE_SDK_IMPACT'),
    false,
  );
  assert.deepEqual((await admin.doc(path).get()).data(), before);
});

test('native impact UID and registry gates precede selecting intent and derived node payload', async () => {
  const f = await nativeImpactArchiveFixture(),
    path = 'books/book/literaryImpactControls/' + f.jobId,
    before = (await admin.doc(path).get()).data();
  await admin.doc(path).update({ uid: 'other' });
  f.masks.length = 0;
  assert.equal((await f.read('impact-control', f.jobId))[0].availability.state, 'unavailable');
  assert.equal(
    f.masks
      .filter((row) => row.path === path)
      .some((row) => row.fields.includes('intent') || row.fields.includes('census')),
    false,
  );
  await admin.doc(path).update({ uid: before.uid, registryToken: 'f'.repeat(64) });
  f.masks.length = 0;
  assert.equal((await f.read('impact-node', f.node.id))[0].availability.state, 'unavailable');
  assert.equal(
    f.masks
      .filter((row) => row.path === f.node.ref.path)
      .some((row) => row.fields.includes('node')),
    false,
  );
});
