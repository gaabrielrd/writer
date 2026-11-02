import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  compilationFixture,
  advanceCompilation,
  finishCompilation,
  openCompilation,
} from '../../functions/test/helpers/bookLoreEditCompilationFixture.mjs';
import {
  editControl,
  cancelEditReservation,
  drainEditReservation,
} from '../../functions/test/helpers/bookLoreEditReservationFixture.mjs';
import {
  compilationSegmentPath,
  compilationSegmentJournal,
} from '../../functions/src/bookLoreEditCompilationStore.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-edit-compilation';
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated loopback emulator required');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const parent = async (f) => ({ c: f.c, job: (await admin.doc(f.c.path).get()).data() });
test('SDK compilation binds a flat generation and native page diff, keeps source intact and cleans after revocation', async () => {
  const relations = Array.from({ length: 65 }, (_, i) => ({
      targetEntityId: 't' + i,
      relationType: 'r',
    })),
    f = await compilationFixture(admin, {
      mode: 'v2',
      sourceOptions: { relations },
      changes: [
        { target: { field: 'details' }, value: 'PRIVATE_AUDIT_TEXT_' + 'x'.repeat(100000) },
        {
          target: { field: 'relations', page: 1, count: 1 },
          value: [{ targetEntityId: 'changed', relationType: 'r' }],
        },
      ],
      relations: { present: true, count: 65 },
    }),
    source = await admin.doc(f.source.seed.path).get(),
    book = await admin.doc(f.source.seed.bookPath).get(),
    r = editControl(f, f.progress, 'concurrent-start'),
    repeated = await Promise.all([
      f.factory().advanceBookLoreEditCompilation(f.uid, r),
      f.factory().advanceBookLoreEditCompilation(f.uid, r),
    ]);
  assert.deepEqual(repeated[0], repeated[1]);
  let progress = repeated[0].progress;
  while (progress.compilation?.phase !== 'ready') {
    progress = (await advanceCompilation(f, progress)).progress;
    const current = await parent(f);
    assert.equal(JSON.stringify(current.job).includes('PRIVATE_AUDIT_TEXT_'), false);
    if (current.job.compilation.auditHash) {
      const client = env.authenticatedContext(f.uid).firestore(),
        path = f.c.path + '/compilationState/current';
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { forged: true }));
    }
  }
  const compiled = await openCompilation(f),
    p = await parent(f),
    first = compilationSegmentPath(p, 0),
    second = compilationSegmentPath(p, 1);
  assert.equal(compiled.storage.schemaVersion, 2);
  assert.equal(compiled.storage.relations.pages, 2);
  assert.equal((await admin.doc(first).get()).exists, true);
  assert.equal((await admin.doc(second).get()).exists, true);
  assert.equal(
    (await admin.doc(f.source.seed.path).get()).updateTime.isEqual(source.updateTime),
    true,
  );
  assert.equal(
    (await admin.doc(f.source.seed.bookPath).get()).updateTime.isEqual(book.updateTime),
    true,
  );
  assert.equal((await admin.doc(f.c.path + '/compilationState/current').get()).exists, false);
  const client = env.authenticatedContext(f.uid).firestore();
  for (const path of [
    f.c.path + '/compilationCertificate/current',
    compilationSegmentJournal(p, 0),
  ]) {
    await assertFails(getDoc(doc(client, path)));
    await assertFails(setDoc(doc(client, path), { forged: true }));
  }
  await admin.doc(f.source.seed.bookPath).update({ authorId: 'other' });
  await assert.rejects(() => openCompilation(f));
  const done = await drainEditReservation(f, (await cancelEditReservation(f, progress)).progress);
  assert.equal(done.phase, 'cancelled');
  assert.equal(done.compilation.cleanupPage, 2);
  assert.equal((await admin.doc(first).get()).exists, false);
  assert.equal((await admin.doc(second).get()).exists, false);
  assert.equal(
    (
      await admin
        .doc(
          'books/' + f.bookId + '/bookResourceBodies/' + f.source.seed.storage.base.manifest.bodyId,
        )
        .get()
    ).exists,
    true,
  );
});
test('SDK recreated checkpoint, segment and certificate do not reuse the original native proof', async () => {
  for (const artifact of ['state', 'segment', 'certificate']) {
    const f = await compilationFixture(admin, {
      bookId: 'native-' + artifact,
      editId: 'edit-' + artifact,
      changes: [{ target: { field: 'details' }, value: 'x'.repeat(100000) }],
      sourceOptions: {
        data: {
          name: 'N',
          category: 'other',
          relations: [{ targetEntityId: 't', relationType: 'r' }],
        },
      },
      relations: { present: true, count: 1 },
    });
    let progress = f.progress,
      path;
    if (artifact === 'state') {
      while (!(await parent(f)).job.compilation?.auditHash)
        progress = (await advanceCompilation(f, progress)).progress;
      path = f.c.path + '/compilationState/current';
    } else {
      progress = await finishCompilation(f);
      await openCompilation(f);
      path =
        artifact === 'segment'
          ? compilationSegmentPath(await parent(f), 0)
          : f.c.path + '/compilationCertificate/current';
    }
    const ref = admin.doc(path),
      value = (await ref.get()).data();
    await ref.delete();
    await ref.create(value);
    if (artifact === 'state') await assert.rejects(() => advanceCompilation(f, progress));
    else if (artifact === 'certificate') await assert.rejects(() => openCompilation(f));
    else {
      const cancelled = (await cancelEditReservation(f, progress)).progress;
      await assert.rejects(() => drainEditReservation(f, cancelled));
    }
    assert.equal((await ref.get()).exists, true);
  }
});
test('SDK parent failure rolls back reference initialization and permits the original compilation unit to retry', async () => {
  const f = await compilationFixture(admin),
    before = await admin.doc(f.c.path).get(),
    bodyId = f.source.seed.storage.base.manifest.bodyId,
    control = admin.doc('books/' + f.bookId + '/bookResourceInventory/' + bodyId),
    run = admin.runTransaction.bind(admin);
  assert.equal((await control.get()).exists, false);
  admin.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'update')
              return (ref, ...args) => {
                target.update(ref, ...args);
                if (ref.path === f.c.path) throw Error('injected compiler rollback');
                return target;
              };
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
      ),
    );
  try {
    await assert.rejects(() => advanceCompilation(f, f.progress), /injected compiler rollback/);
  } finally {
    admin.runTransaction = run;
  }
  const unchanged = await admin.doc(f.c.path).get();
  assert.equal(unchanged.updateTime.isEqual(before.updateTime), true);
  assert.equal((await control.get()).exists, false);
  assert.ok((await advanceCompilation(f, f.progress)).progress.revision > f.progress.revision);
});
