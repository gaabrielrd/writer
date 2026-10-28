import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { createAdventureDeletionService } from '../../functions/src/adventureDeletion.mjs';
import { createAdventureRestoreTransferService } from '../../functions/src/adventureRestoreTransfer.mjs';
import { createAdventureImportService } from '../../functions/src/adventureImport.mjs';
import {
  prepareAdventureImages,
  finishImages,
  imageAdventureArchive,
} from '../../functions/test/helpers/adventureRestoreImageFixture.mjs';
import {
  createAdventureStoragePNG,
  finishImageStorage,
} from '../../functions/test/helpers/adventureRestoreImageStorageFixture.mjs';
import { finishCounts } from '../../functions/test/helpers/adventureRestoreCountsFixture.mjs';
import { finishAudit } from '../../functions/test/helpers/adventureRestoreAuditFixture.mjs';
import { finishImageLibrary } from '../../functions/test/helpers/adventureRestoreImageLibraryFixture.mjs';
import { activationRequest } from '../../functions/test/helpers/adventureRestoreActivationFixture.mjs';
import { bookRestoreStorageWire } from '../../functions/test/helpers/bookRestoreStorageWire.mjs';
import { ARCHIVE_NAMES } from '../../functions/src/adventureRestoreArchiveContracts.mjs';
import {
  adventureImportSeed,
  adventureImportSection,
  adventureImportChain,
  adventureImportReviewHash,
} from '../../functions/src/adventureImportContracts.mjs';
const require = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = require('firebase-admin/firestore');
const projectId = 'demo-writer-deletion-sources',
  uid = 'author';
let db, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? '')) throw Error('Local demo emulator only');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  db = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await db?.terminate();
  await env?.cleanup();
});
const step = (p) => ({
  deletionId: p.deletionId,
  deletionToken: p.deletionToken,
  expectedCheckpoint: p.checkpoint,
  operationId: 'native-source-deletion-step-' + String(p.checkpoint).padStart(8, '0'),
});
async function begin(api, adventureId) {
  const s = await api.getAdventureDeletionSource(uid, { adventureId });
  let p = (
    await api.startAdventureDeletion(uid, {
      adventureId,
      adventureToken: s.adventureToken,
      sourceToken: s.sourceToken,
      expectedRevision: s.revision,
      operationId: 'native-source-deletion-start-0001',
    })
  ).progress;
  for (let n = 0; n < 2; n++) p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  return p;
}

test(
  'native deletion retires pending Storage through the real client wire and composes source and deletion receipts in one commit',
  { timeout: 900000 },
  async (t) => {
    const wire = await bookRestoreStorageWire(t),
      assets = wire.api,
      restore = createAdventureRestoreTransferService({ db, assets }),
      f = { api: restore, uid };
    process.stdout.write('# source SDK: preparing original adventure\n');
    let source = await prepareAdventureImages(
      restore,
      uid,
      await imageAdventureArchive({ image: await createAdventureStoragePNG() }),
    );
    process.stdout.write('# source SDK: personas ready\n');
    source = await finishImages(f, source);
    process.stdout.write('# source SDK: image bytes ready\n');
    source = await finishImageStorage(f, source);
    process.stdout.write('# source SDK: storage prepared\n');
    source = await finishCounts(f, source);
    process.stdout.write('# source SDK: counts ready\n');
    source = await finishAudit(f, source);
    process.stdout.write('# source SDK: first audit ready\n');
    source = await finishImageLibrary(f, source);
    process.stdout.write('# source SDK: image library ready\n');
    source = await finishAudit(f, source);
    process.stdout.write('# source SDK: final audit ready\n');
    source = (
      await restore.activateAdventureRestore(uid, (await activationRequest(f, source)).request)
    ).progress;
    process.stdout.write('# source SDK: activated\n');
    const parentRef = db.doc('users/' + uid + '/adventureRestores/' + source.restoreId),
      parent = await parentRef.get(),
      image = (await db.collection('users/' + uid + '/imageLibrary').get()).docs[0],
      deletion = createAdventureDeletionService({ db, assets });
    let p = await begin(deletion, source.adventureId);
    const marked = await db.doc('adventures/' + source.adventureId).get(),
      firstRequest = step(p);
    process.stdout.write('# source SDK: retiring pending media\n');
    const [first, same] = await Promise.all([
      deletion.advanceAdventureDeletion(uid, firstRequest),
      deletion.advanceAdventureDeletion(uid, firstRequest),
    ]);
    process.stdout.write('# source SDK: retirement confirmed\n');
    assert.deepEqual(first, same);
    p = first.progress;
    const media = await db.doc(parentRef.path + '/activationMedia/current').get(),
      retired = await image.ref.get(),
      outer = await db
        .doc('users/' + uid + '/adventureDeletionOperations/' + firstRequest.operationId)
        .get();
    assert.equal(retired.data().state, 'deleted');
    assert.equal(retired.data().url, null);
    assert.equal(retired.data().useCount, 0);
    assert.equal((await image.ref.collection('uses').get()).empty, true);
    assert.ok(retired.updateTime.isEqual(media.createTime));
    assert.ok(outer.createTime.isEqual(media.createTime));
    assert.equal(
      wire.requests.some((r) => r.method === 'PATCH'),
      false,
    );
    let compared = false;
    for (let n = 0; p.phase === 'quiescence'; n++) {
      assert.ok(n < 300);
      const r = step(p);
      if (n % 10 === 0)
        process.stdout.write('# source SDK: collection checkpoint ' + p.checkpoint + '\n');
      p = (await deletion.advanceAdventureDeletion(uid, r)).progress;
      const archive = await db.doc(parentRef.path + '/archiveCleanup/current').get();
      if (!compared && archive.exists) {
        const receipt = await db
          .doc('users/' + uid + '/adventureDeletionOperations/' + r.operationId)
          .get();
        assert.ok(archive.createTime.isEqual(receipt.createTime));
        assert.equal(
          (await db.doc('users/' + uid + '/adventureRestoreRecoveryKeys/' + source.restoreId).get())
            .exists,
          false,
        );
        compared = true;
      }
    }
    assert.ok(compared);
    for (const name of ARCHIVE_NAMES)
      assert.equal((await parentRef.collection(name).select().limit(1).get()).empty, true, name);
    assert.equal(
      (await db.doc(parentRef.path + '/archiveCleanup/current').get()).data().phase,
      'done',
    );
    assert.ok((await parentRef.get()).updateTime.isEqual(parent.updateTime));
    assert.deepEqual((await parentRef.get()).data(), parent.data());
    assert.ok((await marked.ref.get()).updateTime.isEqual(marked.updateTime));
    const bytes = [...wire.versions.values()].flatMap((versions) =>
      [...versions.values()].map((v) => v.bytes?.length ?? 0),
    );
    assert.ok(
      bytes.every((n) => n === 0),
      'no private image generation remains',
    );
  },
);

test('native activated import proves activation birth, removes 8/3/0 manifests and preserves its frozen job', async () => {
  const imports = createAdventureImportService({ db }),
    sections = Array.from({ length: 11 }, (_, n) => ({
      title: 'Private ' + n,
      content: '<p>Own text ' + n + '</p>',
    }));
  let hash = adventureImportSeed,
    totalBodyBytes = 0;
  for (let n = 0; n < sections.length; n++) {
    const text = adventureImportSection(sections[n]);
    hash = adventureImportChain(hash, n, text);
    totalBodyBytes += text.bodyBytes;
  }
  const request = {
    operationId: 'native-source-import-start-0001',
    project: { title: 'Own import', synopsis: 'Private synopsis', universeId: null },
    source: { mediaType: 'text/markdown', sha256: 'a'.repeat(64), byteLength: 100 },
    sectionCount: sections.length,
    totalBodyBytes,
  };
  let source = (
    await imports.startAdventureImport(uid, {
      ...request,
      reviewHash: adventureImportReviewHash(request, hash),
    })
  ).progress;
  await imports.getAdventureImportRecoveryKey(uid, {
    importId: source.importId,
    jobToken: source.jobToken,
    reviewHash: source.reviewHash,
  });
  const r = (name) => ({
    importId: source.importId,
    jobToken: source.jobToken,
    expectedCheckpoint: source.checkpoint,
    operationId: name,
  });
  for (let n = 0; n < sections.length; n++)
    source = (
      await imports.appendAdventureImportSection(uid, {
        ...r('native-source-import-append-' + n),
        index: n,
        section: sections[n],
      })
    ).progress;
  for (let n = 0; n < sections.length; n++)
    source = (await imports.advanceAdventureImport(uid, r('native-source-import-prepare-' + n)))
      .progress;
  source = (await imports.activateAdventureImport(uid, r('native-source-import-activate-0001')))
    .progress;
  const api = createAdventureDeletionService({ db }),
    parent = await db.doc('users/' + uid + '/adventureImports/' + source.importId).get();
  let p = await begin(api, source.adventureId);
  p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  const sizes = [];
  for (let n = 0; n < 3; n++) {
    const before = p.deletedDocuments;
    p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
    sizes.push(p.deletedDocuments - before);
  }
  assert.deepEqual(sizes, [8, 3, 0]);
  p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal(p.phase, 'media');
  assert.ok((await parent.ref.get()).updateTime.isEqual(parent.updateTime));
  assert.equal((await parent.ref.collection('sections').get()).empty, true);
});
