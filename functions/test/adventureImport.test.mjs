import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { createAdventureImportService } from '../src/adventureImport.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createWorkHistoryService } from '../src/workHistory.mjs';
import {
  adventureImportSeed,
  adventureImportSection,
  adventureImportChain,
  adventureImportReviewHash,
  adventureImportRequestHash,
  adventureImportIds,
} from '../src/adventureImportContracts.mjs';
const uid = 'author';
const reason = (r) => (e) => e.details?.reason === r;
const operation = (n) => 'ImportOperation-' + String(n).padStart(5, '0');
const parts = (n) =>
  Array.from({ length: n }, (_, index) => ({
    title: 'Parte ' + index,
    content: ` \n<p>Texto 🐉 da parte ${index}</p>\n `,
  }));
function fixture() {
  const f = adventureImportDb();
  return { ...f, api: createAdventureImportService({ db: f.db, now: () => 100 }) };
}
function input(sections = parts(2), n = 1, universeId = null) {
  const project = {
      title: 'Aventura',
      synopsis: 'Sinopse própria secreta\nParágrafo 🐉 com  espaços internos.',
      universeId,
    },
    source = { mediaType: 'text/markdown', sha256: 'a'.repeat(64), byteLength: 100 };
  let chain = adventureImportSeed,
    totalBodyBytes = 0;
  sections.forEach((section, index) => {
    const t = adventureImportSection(section);
    totalBodyBytes += t.bodyBytes;
    chain = adventureImportChain(chain, index, t);
  });
  const base = {
    operationId: operation(n),
    project,
    source,
    sectionCount: sections.length,
    totalBodyBytes,
  };
  return { ...base, reviewHash: adventureImportReviewHash(base, chain) };
}
const mutation = (progress, n) => ({
  importId: progress.importId,
  jobToken: progress.jobToken,
  operationId: operation(n),
  expectedCheckpoint: progress.checkpoint,
});
async function start(f, sections = parts(2), n = 1, universeId = null) {
  const request = input(sections, n, universeId),
    result = await f.api.startAdventureImport(uid, request),
    progress = result.progress;
  await f.api.getAdventureImportRecoveryKey(uid, {
    importId: progress.importId,
    jobToken: progress.jobToken,
    reviewHash: progress.reviewHash,
  });
  return {
    request,
    progress: await f.api.getAdventureImport(uid, { importId: progress.importId }),
    sections,
  };
}
async function upload(f, setup, n = 10) {
  let progress = setup.progress;
  for (let index = 0; index < setup.sections.length; index++)
    progress = (
      await f.api.appendAdventureImportSection(uid, {
        ...mutation(progress, n + index),
        index,
        section: setup.sections[index],
      })
    ).progress;
  return progress;
}
async function ready(f, setup, n = 10) {
  let progress = await upload(f, setup, n);
  for (let index = 0; index < setup.sections.length; index++)
    progress = (await f.api.advanceAdventureImport(uid, mutation(progress, n + 100 + index)))
      .progress;
  return progress;
}
async function clean(f, progress, n = 200) {
  for (let i = 0; i < 20 && progress.state !== 'deleted'; i++)
    progress = (await f.api.advanceAdventureImport(uid, mutation(progress, n + i))).progress;
  assert.equal(progress.state, 'deleted');
  return progress;
}

test('complete import is invisible until atomic activation; exact private main, part order, ledger and manual history work', async () => {
  const f = fixture(),
    setup = await start(f, parts(3)),
    A = setup.progress.adventureId,
    target = { kind: 'adventure', id: A },
    root = 'adventures/' + A;
  assert.equal(f.records.has(root), false);
  const uploaded = await upload(f, setup);
  assert.equal(uploaded.state, 'preparing');
  assert.equal(f.records.has(root), false);
  const scenes = createScenesService({ db: f.db, now: () => 300 });
  await assert.rejects(scenes.listSceneGroups(uid, { target }), { code: 'not-found' });
  let progress = uploaded;
  for (let i = 0; i < 3; i++) {
    progress = (await f.api.advanceAdventureImport(uid, mutation(progress, 100 + i))).progress;
    assert.equal(progress.preparedSections, i + 1);
    assert.equal(f.records.has(root), false);
  }
  assert.equal(progress.state, 'ready');
  const activationRequest = mutation(progress, 150);
  const activated = await f.api.activateAdventureImport(uid, activationRequest);
  assert.equal(activated.progress.state, 'activated');
  const project = f.records.get(root);
  assert.deepEqual(project.origin, {
    kind: 'imported',
    importId: setup.progress.importId,
    sourceMediaType: 'text/markdown',
    sourceHash: 'a'.repeat(64),
    reviewHash: setup.progress.reviewHash,
  });
  assert.equal(project.hasProgressResources, true);
  assert.equal(project.revision, 1);
  assert.equal(project.synopsis, setup.request.project.synopsis);
  const terminal = f.records.get(`users/${uid}/adventureImports/${setup.progress.importId}`);
  assert.deepEqual(terminal.project, {
    title: setup.request.project.title,
    universeId: setup.request.project.universeId,
  });
  assert.equal(JSON.stringify(terminal).includes('Sinopse própria secreta'), false);
  assert.deepEqual(await f.api.activateAdventureImport(uid, activationRequest), activated);
  const historicalStart = await f.api.startAdventureImport(uid, setup.request);
  assert.equal(historicalStart.receipt.action, 'startAdventureImport');
  assert.equal(historicalStart.progress.state, 'activated');
  assert.equal(historicalStart.progress.reviewHash, setup.progress.reviewHash);
  const historicalAppend = await f.api.appendAdventureImportSection(uid, {
    ...mutation(setup.progress, 10),
    index: 0,
    section: setup.sections[0],
  });
  assert.equal(historicalAppend.receipt.checkpoint, 1);
  assert.equal(historicalAppend.progress.state, 'activated');
  assert.equal(f.records.get(root).synopsis, setup.request.project.synopsis);
  for (let i = 0; i < 3; i++) {
    const ids = adventureImportIds(uid, setup.progress.importId, i),
      s = f.records.get(`${root}/scenes/${ids.sceneId}`),
      p = f.records.get(`${root}/parts/${ids.partId}`);
    assert.equal(p.order, i + 1);
    assert.equal(p.sceneCount, 1);
    assert.equal(p.wordCount, s.wordCount);
    assert.equal(s.mainBlockAudience, 'creator');
    assert.equal(s.mainBlockType, 'scene');
    assert.equal(s.blockCount, 0);
    assert.equal(s.hasBlocks, true);
    assert.equal(
      f.records.get(`${root}/scenes/${ids.sceneId}/body/current`).content,
      setup.sections[i].content,
    );
    assert.deepEqual(f.records.get(`${root}/scenes/${ids.sceneId}/planning/current`), {
      objective: '',
      conflict: '',
      pointOfView: '',
    });
  }
  const work = f.records.get(root + '/workProgress/current');
  assert.equal(work.wordCount, progress.wordCount);
  assert.equal(work.countReady, true);
  assert.equal(work.phase, 'done');
  assert.equal(
    [...f.records.keys()].some(
      (p) => p.includes('/sceneBlocks/') || p.includes('/workVersions/') || p.startsWith('books/'),
    ),
    false,
  );
  assert.equal(
    f.records.has(`users/${uid}/adventureImportRecoveryKeys/${setup.progress.importId}`),
    false,
  );
  const groups = await scenes.listSceneGroups(uid, { target });
  assert.equal(groups.items.length, 3);
  const history = createWorkHistoryService({ db: f.db, now: () => 400 });
  assert.equal(typeof history.getWorkVersionSource, 'function');
  const read = await f.api.getAdventureImport(uid, { importId: progress.importId });
  assert.equal(read.result.adventureId, A);
  await assert.rejects(
    f.api.cancelAdventureImport(uid, mutation(read, 151)),
    reason('state-conflict'),
  );
  await assert.rejects(
    f.api.getAdventureImportRecoveryKey(uid, {
      importId: read.importId,
      jobToken: read.jobToken,
      reviewHash: read.reviewHash,
    }),
    reason('state-conflict'),
  );
});

test('append CAS/index/hash receipts are historical and metadata-only; stale replies cannot resurrect deleted jobs', async () => {
  const f = fixture(),
    setup = await start(f),
    r = { ...mutation(setup.progress, 10), index: 0, section: setup.sections[0] },
    first = await f.api.appendAdventureImportSection(uid, r);
  assert.deepEqual(await f.api.appendAdventureImportSection(uid, r), first);
  await assert.rejects(
    f.api.appendAdventureImportSection(uid, { ...r, section: { ...r.section, content: 'outro' } }),
    reason('operation-mismatch'),
  );
  await assert.rejects(
    f.api.appendAdventureImportSection(uid, { ...r, operationId: operation(11) }),
    reason('checkpoint-conflict'),
  );
  await assert.rejects(
    f.api.appendAdventureImportSection(uid, {
      ...mutation(first.progress, 12),
      index: 0,
      section: setup.sections[1],
    }),
    reason('checkpoint-conflict'),
  );
  const canceled = await f.api.cancelAdventureImport(uid, mutation(first.progress, 50));
  const deleted = await clean(f, canceled.progress),
    retry = await f.api.appendAdventureImportSection(uid, r);
  assert.deepEqual(retry.receipt, first.receipt);
  assert.equal(retry.progress.state, 'deleted');
  assert.equal(retry.progress.checkpoint, deleted.checkpoint);
  assert.equal(f.records.has('adventures/' + deleted.adventureId), false);
  for (const [path, value] of f.records)
    if (path.includes('adventureImportOperations') || path.includes('adventureImportStartFences')) {
      assert.equal(JSON.stringify(value).includes('Texto'), false);
      assert.equal(JSON.stringify(value).includes('Sinopse'), false);
      assert.equal('keyBase64' in value, false);
    }
  await assert.rejects(
    f.api.appendAdventureImportSection(uid, {
      ...mutation(deleted, 60),
      index: 1,
      section: setup.sections[1],
    }),
    reason('state-conflict'),
  );
});

test('start resolver can fence with only request hash before seal; known start resolves without cancel and IDs stay consumed', async () => {
  const f = fixture(),
    request = input(),
    hash = adventureImportRequestHash('startAdventureImport', request),
    resolved = await f.api.resolveAdventureImportStart(uid, {
      operationId: request.operationId,
      requestHash: hash,
      intent: 'cancel',
    });
  assert.equal(resolved.kind, 'canceled');
  assert.equal('jobToken' in resolved, false);
  assert.deepEqual(await f.api.startAdventureImport(uid, request), resolved);
  await assert.rejects(
    f.api.startAdventureImport(uid, {
      ...request,
      project: { ...request.project, title: 'Outra' },
    }),
    reason('operation-mismatch'),
  );
  await assert.rejects(
    createStudioService({ db: f.db }).createAdventure(uid, {
      operationId: resolved.adventureId,
      title: 'Colisão',
    }),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.has('adventures/' + resolved.adventureId), false);
  const request2 = input(parts(1), 2),
    started = await f.api.startAdventureImport(uid, request2),
    known = await f.api.resolveAdventureImportStart(uid, {
      operationId: request2.operationId,
      requestHash: adventureImportRequestHash('startAdventureImport', request2),
      intent: 'cancel',
    });
  assert.deepEqual(known, started);
  assert.equal(known.progress.state, 'uploading');
  assert.equal(known.progress.jobToken.length, 64);
  await assert.rejects(
    f.api.resolveAdventureImportStart(uid, {
      operationId: request2.operationId,
      requestHash: 'b'.repeat(64),
      intent: 'cancel',
    }),
    reason('operation-mismatch'),
  );
});

test('cancel fences partial preparation, cleans at most50 writes per call and preserves every unrelated resource', async () => {
  const f = fixture(),
    setup = await start(f, parts(9)),
    root = 'adventures/' + setup.progress.adventureId;
  let progress = await upload(f, setup);
  for (let i = 0; i < 3; i++)
    progress = (await f.api.advanceAdventureImport(uid, mutation(progress, 100 + i))).progress;
  f.records.set('adventures/unrelated/scenes/protected/body/current', { content: 'nunca apagar' });
  progress = (await f.api.cancelAdventureImport(uid, mutation(progress, 150))).progress;
  const before = f.commits.length;
  progress = await clean(f, progress);
  assert.ok(f.commits.slice(before).every((writes) => writes.length <= 50));
  assert.equal(
    [...f.records.keys()].some((p) => p.startsWith(root + '/')),
    false,
  );
  assert.deepEqual(f.records.get('adventures/unrelated/scenes/protected/body/current'), {
    content: 'nunca apagar',
  });
  assert.ok(f.records.has('adventureImportReservations/' + progress.adventureId));
  const terminal = f.records.get(`users/${uid}/adventureImports/${setup.progress.importId}`);
  assert.deepEqual(terminal.project, {
    title: setup.request.project.title,
    universeId: setup.request.project.universeId,
  });
  assert.equal(JSON.stringify(terminal).includes('Sinopse própria secreta'), false);
  assert.equal(
    f.records.has(`users/${uid}/adventureImportRecoveryKeys/${setup.progress.importId}`),
    false,
  );
  assert.equal((await f.api.startAdventureImport(uid, setup.request)).progress.state, 'deleted');
  await assert.rejects(
    createStudioService({ db: f.db }).createAdventure(uid, {
      operationId: progress.adventureId,
      title: 'Reuso',
    }),
    { code: 'failed-precondition' },
  );
});

test('keys are idempotent and secret-only; missing/corrupt key never rotates; wrong identity/hash/keyId and terminal access fail', async () => {
  const f = fixture(),
    request = input(),
    started = await f.api.startAdventureImport(uid, request),
    p = started.progress;
  const keyInput = { importId: p.importId, jobToken: p.jobToken, reviewHash: p.reviewHash },
    key = await f.api.getAdventureImportRecoveryKey(uid, keyInput);
  assert.equal(Buffer.from(key.keyBase64, 'base64').length, 32);
  assert.deepEqual(
    await f.api.getAdventureImportRecoveryKey(uid, { ...keyInput, expectedKeyId: key.keyId }),
    key,
  );
  assert.equal((await f.api.getAdventureImport(uid, { importId: p.importId })).checkpoint, 0);
  const listed = await f.api.listAdventureImports(uid, {});
  assert.equal(JSON.stringify(listed).includes(key.keyBase64), false);
  assert.equal(JSON.stringify(listed).includes('Sinopse'), false);
  assert.equal(JSON.stringify(started).includes('keyBase64'), false);
  await assert.rejects(
    f.api.getAdventureImportRecoveryKey(uid, { ...keyInput, jobToken: '0'.repeat(64) }),
    reason('identity-mismatch'),
  );
  await assert.rejects(
    f.api.getAdventureImportRecoveryKey(uid, { ...keyInput, reviewHash: '0'.repeat(64) }),
    reason('review-mismatch'),
  );
  await assert.rejects(
    f.api.getAdventureImportRecoveryKey(uid, { ...keyInput, expectedKeyId: '0'.repeat(64) }),
    reason('key-mismatch'),
  );
  f.records.delete(`users/${uid}/adventureImportRecoveryKeys/${p.importId}`);
  await assert.rejects(f.api.getAdventureImportRecoveryKey(uid, keyInput), reason('inconsistent'));
  assert.equal(f.records.has(`users/${uid}/adventureImportRecoveryKeys/${p.importId}`), false);
});

test('root recreation gate uses native born stamps, not persisted/client tokens; invalid or other-owner jobs remain unavailable', async () => {
  const f = fixture(),
    setup = await start(f),
    I = setup.progress.importId,
    path = `users/${uid}/adventureImports/${I}`;
  await assert.rejects(f.api.getAdventureImport(null, { importId: I }), reason('auth-required'));
  await assert.rejects(
    f.api.getAdventureImport('intruder', { importId: I }),
    reason('import-unavailable'),
  );
  await assert.rejects(
    f.api.listAdventureImports(uid, { ownerId: 'intruder' }),
    reason('invalid-input'),
  );
  await assert.rejects(
    f.api.getAdventureImport(uid, { importId: I, jobToken: '0'.repeat(64) }),
    reason('identity-mismatch'),
  );
  const original = f.metadata.get(path);
  f.metadata.set(path, { createdAt: 1000, createdAtNanoseconds: 9999 });
  await assert.rejects(f.api.getAdventureImport(uid, { importId: I }), reason('inconsistent'));
  await assert.rejects(
    f.api.cancelAdventureImport(uid, mutation(setup.progress, 100)),
    reason('identity-mismatch'),
  );
  f.metadata.set(path, original);
  f.records.get(path).schemaVersion = 2;
  await assert.rejects(f.api.getAdventureImport(uid, { importId: I }), reason('inconsistent'));
});

test('universe reauthorization gates activation but never private recovery/cancel; no partial universe link exists', async () => {
  const f = fixture();
  f.records.set('universes/world', { authorId: uid, updatedAt: 1, adventureCount: 0 });
  const setup = await start(f, parts(1), 1, 'world'),
    progress = await ready(f, setup);
  f.records.get('universes/world').deleting = true;
  const key = await f.api.getAdventureImportRecoveryKey(uid, {
    importId: progress.importId,
    jobToken: progress.jobToken,
    reviewHash: progress.reviewHash,
    expectedKeyId: progress.keyId,
  });
  assert.equal(key.algorithm, 'AES-GCM');
  await assert.rejects(
    f.api.activateAdventureImport(uid, mutation(progress, 150)),
    reason('universe-unavailable'),
  );
  assert.equal(f.records.has('adventures/' + progress.adventureId), false);
  assert.equal(f.records.has(`universes/world/adventures/${progress.adventureId}`), false);
  await clean(f, (await f.api.cancelAdventureImport(uid, mutation(progress, 151))).progress);
  assert.equal(f.records.get('universes/world').adventureCount, 0);
});

test('last-section review mismatch is atomic; bad manifest cannot materialize or activate', async () => {
  const f = fixture(),
    setup = await start(f),
    first = await f.api.appendAdventureImportSection(uid, {
      ...mutation(setup.progress, 10),
      index: 0,
      section: setup.sections[0],
    });
  await assert.rejects(
    f.api.appendAdventureImportSection(uid, {
      ...mutation(first.progress, 11),
      index: 1,
      section: { ...setup.sections[1], content: 'corrompido' },
    }),
    reason('review-mismatch'),
  );
  assert.equal(
    (await f.api.getAdventureImport(uid, { importId: first.progress.importId })).uploadedSections,
    1,
  );
  const second = await f.api.appendAdventureImportSection(uid, {
    ...mutation(first.progress, 12),
    index: 1,
    section: setup.sections[1],
  });
  f.records.get(
    `users/${uid}/adventureImports/${setup.progress.importId}/sections/0000000000000000`,
  ).bodyHash = 'b'.repeat(64);
  await assert.rejects(
    f.api.advanceAdventureImport(uid, mutation(second.progress, 20)),
    reason('inconsistent'),
  );
  assert.equal(
    (await f.api.getAdventureImport(uid, { importId: setup.progress.importId })).preparedSections,
    0,
  );
  await assert.rejects(
    f.api.activateAdventureImport(uid, mutation(second.progress, 21)),
    reason('state-conflict'),
  );
});

test('metadata pagination scans bounded complete windows including empty pending pages, with filter/UID-bound cursors', async () => {
  const f = fixture();
  for (let i = 0; i < 30; i++) {
    const p = (await f.api.startAdventureImport(uid, input(parts(1), i + 1))).progress;
    if (i >= 5)
      await clean(
        f,
        (await f.api.cancelAdventureImport(uid, mutation(p, 1000 + i))).progress,
        2000 + i * 2,
      );
  }
  const first = await f.api.listAdventureImports(uid, { view: 'pending' });
  assert.deepEqual(first.items, []);
  assert.ok(first.nextCursor);
  const second = await f.api.listAdventureImports(uid, {
    view: 'pending',
    cursor: first.nextCursor,
  });
  assert.equal(second.items.length, 5);
  assert.equal(second.nextCursor, null);
  assert.ok(
    f.reads
      .filter((x) => x.collectionPath.endsWith('/adventureImports'))
      .every((x) => x.maximum === 26),
  );
  assert.ok(
    f.reads.some((x) => x.fields?.includes('project.title') && !x.fields.includes('project')),
  );
  await assert.rejects(
    f.api.listAdventureImports(uid, { view: 'all', cursor: first.nextCursor }),
    reason('invalid-cursor'),
  );
  await assert.rejects(
    f.api.listAdventureImports('intruder', { cursor: first.nextCursor }),
    reason('invalid-cursor'),
  );
  await assert.rejects(f.api.listAdventureImports(uid, { limit: 51 }), reason('invalid-input'));
});

test('concurrent duplicate/cancel versus late append/activate never exposes or deletes the wrong root', async () => {
  const f = fixture(),
    setup = await start(f, parts(1)),
    request = { ...mutation(setup.progress, 10), index: 0, section: setup.sections[0] };
  const [one, two] = await Promise.all([
    f.api.appendAdventureImportSection(uid, request),
    f.api.appendAdventureImportSection(uid, request),
  ]);
  assert.deepEqual(one, two);
  const p = (await f.api.advanceAdventureImport(uid, mutation(one.progress, 20))).progress;
  const outcomes = await Promise.allSettled([
    f.api.activateAdventureImport(uid, mutation(p, 30)),
    f.api.cancelAdventureImport(uid, mutation(p, 31)),
  ]);
  assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
  const current = await f.api.getAdventureImport(uid, { importId: p.importId });
  assert.equal(current.state, 'activated');
  assert.ok(f.records.has('adventures/' + p.adventureId));
  assert.equal(JSON.stringify(outcomes[0].value).includes('Texto'), false);
});

test('coherently changed manifest/body with equal word count cannot escape the frozen upload chain', async () => {
  const f = fixture(),
    setup = await start(f, parts(1)),
    progress = await upload(f, setup),
    ids = adventureImportIds(uid, progress.importId, 0);
  const text = adventureImportSection({
    title: setup.sections[0].title,
    content: setup.sections[0].content.replace('Texto', 'Outro'),
  });
  assert.equal(text.wordCount, progress.wordCount);
  f.records.set(`adventures/${progress.adventureId}/scenes/${ids.sceneId}/body/current`, text.body);
  f.records.set(`users/${uid}/adventureImports/${progress.importId}/sections/0000000000000000`, {
    index: 0,
    title: text.section.title,
    bodyHash: text.bodyHash,
    bodyBytes: text.bodyBytes,
    wordCount: text.wordCount,
    chainHash: adventureImportChain(adventureImportSeed, 0, text),
  });
  await assert.rejects(
    f.api.advanceAdventureImport(uid, mutation(progress, 100)),
    reason('inconsistent'),
  );
  const current = await f.api.getAdventureImport(uid, { importId: progress.importId });
  assert.equal(current.state, 'preparing');
  assert.equal(current.preparedSections, 0);
  assert.equal(f.records.has(`adventures/${progress.adventureId}/parts/${ids.partId}`), false);
});

test('corrupt operation receipts fail closed rather than echoing prose or newer/fake metadata', async () => {
  const f = fixture(),
    setup = await start(f, parts(1)),
    request = { ...mutation(setup.progress, 10), index: 0, section: setup.sections[0] };
  const confirmed = await f.api.appendAdventureImportSection(uid, request),
    path = `users/${uid}/adventureImportOperations/${request.operationId}`,
    original = structuredClone(f.records.get(path));
  const corruptions = [
    { content: 'private prose must never leave receipt' },
    { operationId: operation(999) },
    { action: 'unrecognized' },
    { checkpoint: confirmed.progress.checkpoint + 1 },
    { expectedCheckpoint: null },
    { checkpoint: -1 },
    { expectedCheckpoint: 1.5 },
    { index: null },
    { index: -1 },
    { index: setup.progress.sectionCount },
    { phase: 'deleted' },
    { state: 'activated', phase: 'complete' },
  ];
  for (const patch of corruptions) {
    f.records.set(path, { ...original, receipt: { ...original.receipt, ...patch } });
    await assert.rejects(f.api.appendAdventureImportSection(uid, request), reason('inconsistent'));
  }
  f.records.set(path, original);
  assert.deepEqual(
    (await f.api.appendAdventureImportSection(uid, request)).receipt,
    confirmed.receipt,
  );
  const startPath = `users/${uid}/adventureImportOperations/${setup.progress.importId}`,
    startOriginal = structuredClone(f.records.get(startPath));
  for (const patch of [
    { expectedCheckpoint: 0 },
    { checkpoint: 1 },
    { index: 0 },
    { operationId: operation(998) },
  ]) {
    f.records.set(startPath, { ...startOriginal, receipt: { ...startOriginal.receipt, ...patch } });
    await assert.rejects(f.api.startAdventureImport(uid, setup.request), reason('inconsistent'));
  }
  f.records.set(startPath, startOriginal);
  assert.equal(
    (await f.api.startAdventureImport(uid, setup.request)).progress.checkpoint,
    confirmed.progress.checkpoint,
  );
});
