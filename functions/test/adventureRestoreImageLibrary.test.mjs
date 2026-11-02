import assert from 'node:assert/strict';
import test from 'node:test';
import {
  libraryFixture,
  libraryStep,
  finishImageLibrary,
  libraryRequest,
} from './helpers/adventureRestoreImageLibraryFixture.mjs';
import { finishAudit } from './helpers/adventureRestoreAuditFixture.mjs';
import { cleanup } from './helpers/adventureRestoreTransferFixture.mjs';
import { emptyAdventureArchive } from './helpers/adventureRestoreArchiveFixture.mjs';
import { createImageLibraryService, readActiveLibraryImage } from '../src/imageLibrary.mjs';
import { adventureImageUseKey } from '../src/adventureBlockImages.mjs';
test('a private library image and its canonical use are installed together and invalidate the previous audit', async () => {
  const { f, p } = await libraryFixture(),
    next = await libraryStep(f, p),
    rows = [...f.records].filter(([k]) => k.startsWith('users/' + f.uid + '/imageLibrary/')),
    image = rows.find(([k]) => !k.includes('/uses/')),
    use = rows.find(([k]) => k.includes('/uses/'));
  assert.equal(next.staging.libraryImages, 1);
  assert.equal(next.staging.libraryUses, 1);
  assert.equal(next.staging.artifactCount, p.staging.artifactCount + 2);
  assert.equal(next.staging.auditJournals, undefined);
  assert.equal(f.records.get(f.path).staging.auditSealOperationId, undefined);
  assert.equal(image[1].state, 'preparing');
  assert.equal(image[1].url, null);
  assert.equal(image[1].useCount, 1);
  assert.equal(image[1].restoreOrigin.schemaVersion, 2);
  assert.deepEqual(image[1].restoreOrigin.target, { kind: 'adventure', id: p.adventureId });
  assert.equal(Object.hasOwn(image[1].restoreOrigin, 'bookId'), false);
  assert.ok(use[0].endsWith('/uses/' + adventureImageUseKey(p.adventureId, use[1].resource)));
  assert.deepEqual(use[1], {
    kind: 'adventure-block',
    adventureId: p.adventureId,
    resource: use[1].resource,
  });
  assert.deepEqual(f.metadata.get(image[0]), f.metadata.get(use[0]));
  await assert.rejects(() =>
    f.db.runTransaction((tx) => readActiveLibraryImage(tx, f.db, f.uid, image[1].id)),
  );
  const library = createImageLibraryService({ db: f.db, assets: f.assets });
  await assert.rejects(() => library.rename(f.uid, { id: image[1].id, name: 'rename' }));
  await assert.rejects(() => library.remove(f.uid, { id: image[1].id }));
  assert.equal(f.records.get(image[0]).state, 'preparing');
});
test('a complete library requires a fresh physical audit including both image and use before cleanup', async () => {
  const { f, p } = await libraryFixture(),
    installed = await finishImageLibrary(f, p),
    ready = await finishAudit(f, installed);
  assert.equal(installed.staging.phase, 'image-library-ready');
  assert.equal(ready.staging.libraryImages, 1);
  assert.equal(ready.staging.auditJournals, p.staging.artifactCount + 2);
  assert.equal(ready.staging.auditPhysical, p.staging.artifactCount + 2);
  assert.notEqual(
    f.records.get(f.path).staging.auditContext,
    f.records.get(f.path).staging.librarySourceAudit.contextToken,
  );
  assert.equal(f.records.get('adventures/' + p.adventureId).ownerId, undefined);
  const cancelled = await cleanup(f, ready, 20);
  assert.equal(cancelled.staging.cleanedArtifacts, ready.staging.artifactCount);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('users/' + f.uid + '/imageLibrary/')),
    false,
  );
});
test('zero images preserve the source seal as history and still require the final audit', async () => {
  const { f, p } = await libraryFixture(await emptyAdventureArchive()),
    ready = await finishImageLibrary(f, p);
  assert.equal(ready.staging.libraryImages, 0);
  assert.equal(ready.staging.libraryUses, 0);
  assert.equal(ready.staging.auditJournals, undefined);
  const audited = await finishAudit(f, ready);
  assert.equal(audited.staging.auditMedia, 0);
  assert.equal(audited.staging.auditPhysical, p.staging.artifactCount);
});
test('the exact operation replays and competing stale requests never duplicate native uses', async () => {
  const { f, p } = await libraryFixture(),
    request = libraryRequest(p),
    first = await f.api.advanceAdventureRestoreImageLibrary(f.uid, request),
    before = structuredClone([...f.records]);
  assert.deepEqual(await f.api.advanceAdventureRestoreImageLibrary(f.uid, request), first);
  await assert.rejects(() =>
    f.api.advanceAdventureRestoreImageLibrary(f.uid, {
      ...request,
      operationId: 'competing-image-library-0001',
    }),
  );
  assert.deepEqual([...f.records], before);
});

test('the normal library listing hides preparing copies while preserving existing active images', async () => {
  const { f, p } = await libraryFixture();
  await finishImageLibrary(f, p);
  f.records.set('users/' + f.uid + '/imageLibraryMigration/current', { complete: true });
  f.records.set('users/' + f.uid + '/imageLibrary/legacy-active-image', {
    id: 'legacy-active-image',
    name: 'Existing',
    state: 'active',
    url: 'existing-url',
    createdAt: 50,
    useCount: 0,
  });
  const library = createImageLibraryService({ db: f.db, assets: f.assets }),
    page = await library.list(f.uid, {});
  assert.deepEqual(
    page.images.map((v) => v.id),
    ['legacy-active-image'],
  );
});
test('an existing image or orphan use blocks installation without overwriting either namespace', async () => {
  for (const child of [false, true]) {
    const { f, p } = await libraryFixture(),
      intent = [...f.records].find(
        ([k, v]) =>
          k.startsWith(f.path + '/preparedRoot/') && v.kind === 'adventure-restore-image-storage',
      )[1],
      imagePath = 'users/' + f.uid + '/imageLibrary/' + intent.asset.imageId,
      path = child ? imagePath + '/uses/foreign-use' : imagePath;
    f.records.set(path, { foreign: true });
    const before = structuredClone([...f.records]);
    await assert.rejects(() => libraryStep(f, p));
    assert.deepEqual([...f.records], before);
  }
});
test('rollback of receipt creation leaves neither a library image nor a use and retry installs exactly once', async () => {
  const { f, p } = await libraryFixture(),
    request = libraryRequest(p),
    before = structuredClone([...f.records]),
    run = f.db.runTransaction;
  f.db.runTransaction = (cb) =>
    run((tx) =>
      cb(
        new Proxy(tx, {
          get(object, key) {
            if (key === 'create')
              return (ref, value) => {
                if (
                  ref.path ===
                  'users/' + f.uid + '/adventureRestoreOperations/' + request.operationId
                )
                  throw Error('library receipt rollback');
                return object.create(ref, value);
              };
            return typeof object[key] === 'function' ? object[key].bind(object) : object[key];
          },
        }),
      ),
    );
  await assert.rejects(
    () => f.api.advanceAdventureRestoreImageLibrary(f.uid, request),
    /library receipt rollback/,
  );
  assert.deepEqual([...f.records], before);
  f.db.runTransaction = run;
  assert.equal((await libraryStep(f, p)).staging.libraryImages, 1);
});
test('a lost commit response replays the original library and use without duplicate counters', async () => {
  const { f, p } = await libraryFixture(),
    request = libraryRequest(p),
    run = f.db.runTransaction;
  let once = true;
  f.db.runTransaction = async (cb) => {
    const result = await run(cb);
    if (once && result?.receipt?.operationId === request.operationId) {
      once = false;
      throw Error('lost library ACK');
    }
    return result;
  };
  await assert.rejects(
    () => f.api.advanceAdventureRestoreImageLibrary(f.uid, request),
    /lost library ACK/,
  );
  const before = structuredClone([...f.records]),
    replay = await f.api.advanceAdventureRestoreImageLibrary(f.uid, request);
  assert.equal(replay.progress.staging.libraryImages, 1);
  assert.deepEqual([...f.records], before);
});
test('a recreated library image is preserved and cannot pass the final audit or be deleted by cleanup', async () => {
  const { f, p } = await libraryFixture(),
    installed = await finishImageLibrary(f, p),
    imagePath = [...f.records.keys()].find(
      (k) => k.startsWith('users/' + f.uid + '/imageLibrary/') && !k.includes('/uses/'),
    ),
    value = structuredClone(f.records.get(imagePath));
  f.metadata.set(imagePath, { createdAt: 3333, createdAtNanoseconds: 72 });
  await assert.rejects(() => finishAudit(f, installed));
  const job = f.records.get(f.path);
  await assert.rejects(() => cleanup(f, { ...installed, checkpoint: job.checkpoint }, 20));
  assert.deepEqual(f.records.get(imagePath), value);
});
test('cancellation after partial installation or completion removes uses before images and keeps permanent fences', async () => {
  for (const complete of [false, true]) {
    const { f, p } = await libraryFixture(),
      installed = complete ? await finishImageLibrary(f, p) : await libraryStep(f, p),
      paths = [...f.storage.current.keys()],
      cancelled = await cleanup(f, installed, 2);
    assert.equal(cancelled.state, 'cancelled');
    assert.equal(cancelled.staging.cleanedArtifacts, installed.staging.artifactCount);
    assert.equal(
      [...f.records.keys()].some((k) => k.startsWith('users/' + f.uid + '/imageLibrary/')),
      false,
    );
    for (const path of paths) assert.equal(f.storage.version(path).bytes.length, 0);
  }
});

test('the earlier audit seal remains historically resolvable after the final audit restarts its counters', async () => {
  const { f, p } = await libraryFixture(),
    installed = await finishImageLibrary(f, p),
    source = f.records.get(f.path).staging.librarySourceAudit;
  await f.api.advanceAdventureRestoreAudit(f.uid, {
    restoreId: p.restoreId,
    jobToken: p.jobToken,
    operationId: 'final-audit-first-page-0001',
    expectedCheckpoint: installed.checkpoint,
  });
  const before = structuredClone([...f.records]),
    replay = await f.api.advanceAdventureRestoreAudit(f.uid, {
      restoreId: p.restoreId,
      jobToken: p.jobToken,
      operationId: source.operationId,
      expectedCheckpoint: source.checkpoint - 1,
    });
  assert.equal(replay.receipt.operationId, source.operationId);
  assert.deepEqual([...f.records], before);
});
