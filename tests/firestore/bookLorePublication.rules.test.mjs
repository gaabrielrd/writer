import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { seedBookLoreRead } from '../../functions/test/helpers/bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from '../../functions/test/helpers/bookLoreGenerationFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from '../../functions/test/helpers/bookLoreCreationAdoptionFixture.mjs';
import { createBookPublicationService } from '../../functions/src/bookLorePublication.mjs';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';
import { createBookLoreEditTransportService } from '../../functions/src/bookLoreEditTransport.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';
import { inspectionStartHash } from '../../functions/src/bookLoreSourceInspectionContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore, FieldValue } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-native-publication';
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated demo loopback emulator required');
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
beforeEach(async () => {
  await env.clearFirestore();
  await admin.doc('books/book').create({
    authorId: 'author',
    title: 'Book',
    status: 'draft',
    createdAt: 1,
    updatedAt: 100,
    hasLoreResources: true,
    localLoreVersion: 0,
  });
  await admin.doc('users/author').create({ credits: 5 });
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const client = (uid) =>
  uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
async function fixture({
  mode = 'v2',
  large = false,
  world = false,
  missingFlag = false,
  publicName = ' Name 🌙 ',
} = {}) {
  const data = {
    name: publicName,
    category: 'character',
    aliases: ['A', 'A'],
    summary: 'Public 🌙',
    isPublic: true,
    details: large ? '🌙'.repeat(2300000) : 'PRIVATE_DETAILS',
    structuredDetails: { notes: 'PRIVATE_NOTES' },
  };
  let seed,
    id = 'aria';
  if (mode === 'created') {
    const creation = await creationAdoptionFixture(admin, {
      changes: Object.entries(data).map(([field, value]) => ({ target: { field }, value })),
    });
    await adoptCreation(creation);
    id = creation.loreId;
    seed = creation.source.seed;
  } else if (mode === 'v1') seed = await seedBookLoreRead(admin, { id, data });
  else seed = await seedBookLoreGeneration(admin, { id, noBase: true, fields: data });
  if (world) {
    await admin
      .doc('universes/world')
      .create({ authorId: 'author', loreVersion: 0, privacyVersion: 0 });
    await admin.doc('publicUniversePrivacy/world').create({ active: true, version: 0 });
    await admin.doc('books/book').update({ universeId: 'world' });
  }
  if (missingFlag)
    await admin.doc('books/book/lore/' + id).update({ isPublic: FieldValue.delete() });
  const api = createBookPublicationService({ db: admin }),
    proof = await api.getBookPublicationSource('author', { bookId: 'book' }),
    head = await createBookLoreReadService({ db: admin }).getBookLoreRead('author', {
      bookId: 'book',
      id,
      tokenVersion: 2,
    }),
    control = { bookId: 'book', revisionId: 'revision-first', ...proof },
    stage = { ...control, loreId: id, readToken: head.readToken, aliases: ['A', 'A'] },
    revision = 'publicBooks/book/revisions/revision-first',
    header = {
      createdAt: Math.max(Date.now(), proof.source.updatedAt + 1),
      chapterCount: 1,
      loreCount: 1,
      privacyVersion: proof.source.privacyVersion,
      sourceLoreToken: proof.source.listToken,
      sourcePublicationToken: proof.sourceToken,
      ...(proof.source.hasScenes ? { sourceSceneRevision: proof.source.sceneRevision } : {}),
      ...(world ? { universeId: 'world', universePrivacyVersion: 0 } : {}),
    };
  await assertSucceeds(setDoc(doc(client('author'), revision), header));
  await assertSucceeds(
    setDoc(doc(client('author'), revision + '/chapters/chapter'), {
      title: 'Chapter',
      order: 1,
      content: '<p>Public chapter</p>',
    }),
  );
  return {
    api,
    proof,
    control,
    stage,
    id,
    seed,
    revision,
    header,
    copy: () => api.stageBookPublicationLore('author', stage),
    finish: () =>
      api.finalizeBookPublication('author', { ...control, authorName: 'Public Author' }),
  };
}
test('SDK native publication: 8 MiB/128 parts, invisible staging, explicit fields and atomic public activation', async () => {
  const f = await fixture({ mode: 'v1', large: true });
  assert.ok(f.seed.base.prepared.manifest.chunkCount > 128);
  await f.copy();
  await assertFails(getDoc(doc(client(null), f.revision + '/lore/' + f.id)));
  await f.finish();
  const value = (
    await assertSucceeds(getDoc(doc(client(null), f.revision + '/lore/' + f.id)))
  ).data();
  assert.deepEqual(value, {
    name: 'Name 🌙',
    aliases: ['A', 'A'],
    category: 'character',
    summary: 'Public 🌙',
  });
  assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
  assert.equal(
    (await assertSucceeds(getDoc(doc(client(null), 'publicBooks/book')))).data().authorName,
    'Public Author',
  );
  assert.equal((await admin.doc('users/author').get()).data().credits, 5);
});
test('SDK native publication: local copy and SDK activation cannot bypass the permanent native guard', async () => {
  const f = await fixture(),
    owner = client('author');
  await assertFails(
    setDoc(doc(owner, f.revision + '/lore/' + f.id), {
      name: 'Forged',
      aliases: [],
      category: 'other',
      summary: 'Private source bypass',
    }),
  );
  await assertFails(updateDoc(doc(owner, 'books/book'), { hasLoreResources: false }));
  const batch = writeBatch(owner);
  batch.set(doc(owner, 'publicBooks/book'), {
    schemaVersion: 1,
    title: 'Book',
    authorName: 'A',
    revisionId: 'revision-first',
    publishedAt: f.header.createdAt,
  });
  batch.update(doc(owner, 'books/book'), { status: 'published', updatedAt: f.header.createdAt });
  await assertFails(batch.commit());
  assert.equal((await admin.doc('books/book').get()).data().status, 'draft');
  await f.copy();
  await f.finish();
  await assertSucceeds(getDoc(doc(client(null), f.revision + '/chapters/chapter')));
  const revoke = writeBatch(owner);
  revoke.update(doc(owner, 'books/book'), { status: 'draft', updatedAt: f.header.createdAt + 1 });
  revoke.delete(doc(owner, 'publicBooks/book'));
  await assertSucceeds(revoke.commit());
  await assert.rejects(f.finish(), { code: 'failed-precondition' });
  assert.equal((await admin.doc('publicBooks/book').get()).exists, false);
  await assertFails(getDoc(doc(client(null), f.revision + '/lore/' + f.id)));
});
test('SDK native publication: logical consent is resolved even when the native base head omits the flag', async () => {
  const f = await fixture({ mode: 'v1', missingFlag: true });
  assert.equal(
    Object.hasOwn((await admin.doc('books/book/lore/' + f.id).get()).data(), 'isPublic'),
    false,
  );
  await f.copy();
  await f.finish();
  await assertSucceeds(getDoc(doc(client(null), f.revision + '/lore/' + f.id)));
});
test('SDK native publication: recreated universe or revoked public privacy blocks activation under the original proof', async () => {
  const f = await fixture({ world: true });
  await f.copy();
  const root = await admin.doc('universes/world').get();
  await root.ref.delete();
  await root.ref.create(root.data());
  await assert.rejects(f.finish(), { code: 'failed-precondition' });
  assert.equal((await admin.doc('publicBooks/book').get()).exists, false);
  await admin.doc('publicUniversePrivacy/world').update({ active: false });
  await assert.rejects(f.api.getBookPublicationSource('author', { bookId: 'book' }));
});
test('SDK native publication: failed last book update rolls back pointer and source; concurrent exact retry confirms once', async () => {
  const f = await fixture({ mode: 'created' });
  await f.copy();
  const book = await admin.doc('books/book').get();
  const db = new Proxy(admin, {
    get(object, key) {
      if (key === 'runTransaction')
        return (fn) =>
          object.runTransaction((tx) =>
            fn(
              new Proxy(tx, {
                get(target, member) {
                  const method = target[member];
                  if (typeof method !== 'function') return method;
                  return (...args) => {
                    if (member === 'update' && args[0]?.path === 'books/book') {
                      target.update(admin.doc('rollback/missing'), { fail: true });
                      return target;
                    }
                    return method.apply(target, args);
                  };
                },
              }),
            ),
          );
      const value = object[key];
      return typeof value === 'function' ? value.bind(object) : value;
    },
  });
  await assert.rejects(
    createBookPublicationService({ db }).finalizeBookPublication('author', {
      ...f.control,
      authorName: 'Public Author',
    }),
  );
  assert.equal((await book.ref.get()).updateTime.isEqual(book.updateTime), true);
  assert.equal((await admin.doc('publicBooks/book').get()).exists, false);
  const results = await Promise.all([f.finish(), f.finish()]);
  assert.deepEqual(results.map((v) => v.status).sort(), ['already-published', 'published']);
  assert.equal((await admin.doc(f.revision + '/lore/' + f.id).get()).exists, true);
});
test('SDK native publication: malformed native header and intrusive public body fields are denied directly', async () => {
  const f = await fixture(),
    owner = client('author');
  const { sourceLoreToken, sourcePublicationToken, ...legacy } = f.header;
  await assertFails(setDoc(doc(owner, 'publicBooks/book/revisions/no-proof'), legacy));
  await assertFails(
    setDoc(doc(owner, 'publicBooks/book/revisions/half-proof'), { ...legacy, sourceLoreToken }),
  );
  await assertFails(
    setDoc(doc(owner, 'publicBooks/book/revisions/bad-proof'), {
      ...legacy,
      sourceLoreToken,
      sourcePublicationToken: 'invalid',
    }),
  );
  await assertFails(
    setDoc(doc(owner, f.revision + '/chapters/private'), {
      title: 'Chapter',
      order: 2,
      content: 'Public',
      notes: 'PRIVATE',
    }),
  );
  assert.equal(sourcePublicationToken, f.proof.sourceToken);
  await assertFails(deleteDoc(doc(client('other'), f.revision)));
});

async function certifiedFixture(options) {
  const f = await fixture(options),
    publication = {
      name: (options?.publicName ?? ' Name 🌙 ').trim(),
      aliases: ['A', 'A'],
      category: 'character',
      summary: 'Public 🌙',
    },
    intent = {
      bookId: 'book',
      loreId: f.id,
      sourceToken: f.stage.readToken,
      inspectionId: 'lore-source-' + digest({ source: f.stage.readToken, publication }),
      publicationHash: digest(publication),
    },
    startHash = inspectionStartHash(intent),
    api = createBookLoreEditTransportService({ db: admin }),
    call = (method, input) => api.bookLoreEdit('author', { method, input });
  let p = await call('startBookLoreSourceInspection', intent);
  const initial = p;
  const request = () => ({
    inspectionId: intent.inspectionId,
    startHash,
    jobToken: p.jobToken,
    expectedRevision: p.revision,
    operationId: 'publication-' + p.revision,
    publication,
  });
  return {
    ...f,
    intent,
    initial,
    publication,
    call,
    request,
    async prepare() {
      while (!p.ready) p = (await call('advanceBookLoreSourceInspection', request())).progress;
      return {
        ...f.stage,
        publication,
        inspection: { inspectionId: intent.inspectionId, startHash, jobToken: p.jobToken },
      };
    },
  };
}
test('SDK incremental publication: source above 32 MiB, native certificate, lost reply and private checkpoint', async () => {
  const publicName = ' '.repeat(17 * 1024 * 1024) + 'Name 🌙' + '\n'.repeat(9 * 1024 * 1024),
    f = await certifiedFixture({ mode: 'v1', publicName });
  assert.ok(f.seed.base.prepared.manifest.byteLength > 32 * 1024 * 1024);
  const request = f.request(),
    first = await f.call('advanceBookLoreSourceInspection', request);
  assert.deepEqual(await f.call('advanceBookLoreSourceInspection', request), first);
  const statePath =
    'users/author/bookLoreSourceInspections/' + f.intent.inspectionId + '/state/current';
  await assertFails(getDoc(doc(client('author'), statePath)));
  await assertFails(setDoc(doc(client('author'), statePath), { forged: true }));
  const stage = await f.prepare();
  assert.equal((await admin.doc(statePath).get()).exists, false);
  await f.api.stageBookPublicationLore('author', stage);
  await assertFails(getDoc(doc(client(null), f.revision + '/lore/' + f.id)));
  await f.finish();
  assert.deepEqual(
    (await assertSucceeds(getDoc(doc(client(null), f.revision + '/lore/' + f.id)))).data(),
    {
      name: 'Name 🌙',
      aliases: ['A', 'A'],
      category: 'character',
      summary: 'Public 🌙',
    },
  );
});
for (const mode of ['v2', 'created'])
  test(
    'SDK incremental publication: ' + mode + ' native field proofs and certificate replay',
    async () => {
      const f = await certifiedFixture({ mode }),
        stage = await f.prepare();
      assert.equal(f.initial.phase, 'publication');
      assert.equal((await f.api.stageBookPublicationLore('author', stage)).status, 'staged');
      assert.equal(
        (await f.api.stageBookPublicationLore('author', stage)).status,
        'already-staged',
      );
      await f.finish();
      assert.equal(
        (await assertSucceeds(getDoc(doc(client(null), f.revision + '/lore/' + f.id)))).data().name,
        'Name 🌙',
      );
    },
  );
test('SDK incremental publication: cancellation fences native field validation and removes the checkpoint', async () => {
  const f = await certifiedFixture(),
    request = f.request();
  const result = await f.call('cancelBookLoreSourceInspection', {
    inspectionId: request.inspectionId,
    startHash: request.startHash,
    jobToken: request.jobToken,
    operationId: 'cancel-publication',
  });
  assert.equal(result.progress.phase, 'cancelled');
  assert.equal(
    (
      await admin
        .doc('users/author/bookLoreSourceInspections/' + f.intent.inspectionId + '/state/current')
        .get()
    ).exists,
    false,
  );
  await assert.rejects(f.call('advanceBookLoreSourceInspection', request), {
    code: 'failed-precondition',
  });
  assert.equal((await admin.doc('publicBooks/book').get()).exists, false);
});
test('SDK incremental publication: a recreated certificate or revoked source cannot authorize the copy', async () => {
  const f = await certifiedFixture(),
    stage = await f.prepare(),
    path =
      'users/author/bookLoreSourceInspections/' + f.intent.inspectionId + '/certificate/current',
    cert = (await admin.doc(path).get()).data();
  await admin.doc(path).delete();
  await admin.doc(path).create(cert);
  await assert.rejects(f.api.stageBookPublicationLore('author', stage), {
    code: 'failed-precondition',
  });
  assert.equal((await admin.doc(f.revision + '/lore/' + f.id).get()).exists, false);
  await admin.doc('books/book').update({ localLoreVersion: 1 });
  await assert.rejects(f.api.stageBookPublicationLore('author', stage), {
    code: 'failed-precondition',
  });
});
