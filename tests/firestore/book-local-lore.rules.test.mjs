import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const owner = 'local-lore-author';
const maxVersion = Number.MAX_SAFE_INTEGER;
const bookData = (extra = {}) => ({
  authorId: owner,
  title: 'Livro particular',
  status: 'draft',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const entityData = (extra = {}) => ({
  name: 'Cartógrafa',
  aliases: ['Vigia'],
  category: 'character',
  summary: 'Ficha própria',
  details: 'Texto particular preservado.',
  isPublic: false,
  ...extra,
});
let environment;
const db = (actor = owner) =>
  actor === null
    ? environment.unauthenticatedContext().firestore()
    : environment.authenticatedContext(actor).firestore();
const bookRef = (database, id) => doc(database, 'books', id);
const loreRef = (database, id, entityId = 'existing') =>
  doc(database, 'books', id, 'lore', entityId);

before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!address) throw Error('Use somente emulador demo.');
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId: 'demo-writer-book-local-lore-tests',
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});
beforeEach(() => environment.clearFirestore());
after(async () => environment?.cleanup());

async function seed(id, extra = {}, entities = [['existing', entityData()]]) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    const batch = writeBatch(database);
    batch.set(bookRef(database, id), bookData(extra));
    for (const [entityId, entity] of entities) batch.set(loreRef(database, id, entityId), entity);
    await batch.commit();
  });
}
async function observe(id) {
  let snapshot;
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    const root = await getDoc(bookRef(database, id));
    const lore = await getDocs(collection(database, 'books', id, 'lore'));
    snapshot = {
      book: root.data(),
      lore: Object.fromEntries(lore.docs.map((snapshot) => [snapshot.id, snapshot.data()])),
    };
  });
  return snapshot;
}
function mutation(database, id, nextVersion, change) {
  const batch = writeBatch(database);
  batch.update(bookRef(database, id), { localLoreVersion: nextVersion });
  change(batch);
  return batch.commit();
}

test('SDK clock de lore local: criação em zero e acesso somente do autor', async () => {
  const database = db();
  const root = bookRef(database, 'new');
  await assertSucceeds(setDoc(root, bookData({ localLoreVersion: 0 })));
  for (const [index, invalid] of [
    undefined,
    null,
    -1,
    1,
    0.5,
    '0',
    false,
    maxVersion + 1,
  ].entries()) {
    const input = bookData(invalid === undefined ? {} : { localLoreVersion: invalid });
    await assertFails(setDoc(bookRef(database, 'invalid-' + index), input));
  }
  await seed('private', { localLoreVersion: 0 });
  await assertSucceeds(getDoc(bookRef(database, 'private')));
  await assertSucceeds(getDoc(loreRef(database, 'private')));
  const ownList = await assertSucceeds(getDocs(collection(database, 'books', 'private', 'lore')));
  assert.equal(ownList.size, 1);
  const before = await observe('private');
  for (const actor of ['intruder', null]) {
    const outsider = db(actor);
    await assertFails(getDoc(bookRef(outsider, 'private')));
    await assertFails(getDoc(loreRef(outsider, 'private')));
    await assertFails(getDocs(collection(outsider, 'books', 'private', 'lore')));
    await assertFails(
      setDoc(
        bookRef(outsider, 'forged-' + (actor ?? 'anonymous')),
        bookData({ localLoreVersion: 0 }),
      ),
    );
    await assertFails(
      mutation(outsider, 'private', 1, (batch) =>
        batch.set(loreRef(outsider, 'private', 'new'), entityData()),
      ),
    );
    await assertFails(
      mutation(outsider, 'private', 1, (batch) =>
        batch.update(loreRef(outsider, 'private'), { summary: 'Outro ator' }),
      ),
    );
    await assertFails(
      mutation(outsider, 'private', 1, (batch) => batch.delete(loreRef(outsider, 'private'))),
    );
  }
  assert.deepEqual(await observe('private'), before);
});

test('SDK clock de lore local: legado não vazio e CRUD atômico avançam uma vez por lote', async () => {
  const database = db();
  await seed('legacy', {}, [
    ['existing', entityData()],
    ['remove', entityData({ name: 'Antiga' })],
  ]);
  const before = await observe('legacy');
  assert.equal(Object.hasOwn(before.book, 'localLoreVersion'), false);
  assert.equal(Object.keys(before.lore).length, 2);
  await assertFails(setDoc(loreRef(database, 'legacy', 'new'), entityData()));
  await assertFails(updateDoc(loreRef(database, 'legacy'), { summary: 'Sem clock' }));
  await assertFails(deleteDoc(loreRef(database, 'legacy', 'remove')));
  await assertFails(
    mutation(database, 'legacy', 0, (batch) =>
      batch.set(loreRef(database, 'legacy', 'new'), entityData()),
    ),
  );
  assert.deepEqual(await observe('legacy'), before);

  await assertSucceeds(
    runTransaction(database, async (transaction) => {
      const root = await transaction.get(bookRef(database, 'legacy'));
      assert.equal(root.data().localLoreVersion, undefined);
      transaction.update(root.ref, { localLoreVersion: 1 });
      transaction.set(loreRef(database, 'legacy', 'new'), entityData({ name: 'Nova' }));
      transaction.update(loreRef(database, 'legacy'), { summary: 'Revisada na transação' });
      transaction.delete(loreRef(database, 'legacy', 'remove'));
    }),
  );
  const first = await observe('legacy');
  assert.equal(first.book.localLoreVersion, 1);
  assert.deepEqual(Object.keys(first.lore).sort(), ['existing', 'new']);
  assert.equal(first.lore.existing.summary, 'Revisada na transação');
  assert.equal(first.lore.existing.details, before.lore.existing.details);
  await assertSucceeds(
    mutation(database, 'legacy', 2, (batch) => {
      batch.set(loreRef(database, 'legacy', 'third'), entityData({ name: 'Terceira' }));
      batch.update(loreRef(database, 'legacy', 'new'), { summary: 'Segunda revisão' });
      batch.delete(loreRef(database, 'legacy', 'existing'));
    }),
  );
  const second = await observe('legacy');
  assert.equal(second.book.localLoreVersion, 2);
  assert.deepEqual(Object.keys(second.lore).sort(), ['new', 'third']);
  assert.equal(second.lore.new.summary, 'Segunda revisão');
  await assertFails(
    updateDoc(loreRef(database, 'legacy', 'new'), { summary: 'Isolada depois do clock' }),
  );
  await assertFails(deleteDoc(loreRef(database, 'legacy', 'third')));
  assert.deepEqual(await observe('legacy'), second);
});

test('SDK clock de lore local: preserva monotonicidade e rejeita ausência, corrupção e overflow', async () => {
  const database = db();
  await seed('monotonic', { localLoreVersion: 2 });
  await assertSucceeds(updateDoc(bookRef(database, 'monotonic'), { title: 'Título alterado' }));
  const before = await observe('monotonic');
  for (const nextVersion of [0, 1, 4, null, -1, 2.5, '3', maxVersion + 1, deleteField()]) {
    await assertFails(updateDoc(bookRef(database, 'monotonic'), { localLoreVersion: nextVersion }));
  }
  assert.deepEqual(await observe('monotonic'), before);
  await assertSucceeds(updateDoc(bookRef(database, 'monotonic'), { localLoreVersion: 3 }));
  assert.equal((await observe('monotonic')).book.localLoreVersion, 3);

  for (const [index, invalid] of [null, -1, 1.5, '1', maxVersion + 1].entries()) {
    const id = 'corrupt-' + index;
    await seed(id, { localLoreVersion: invalid });
    const snapshot = await observe(id);
    await assertFails(updateDoc(bookRef(database, id), { title: 'Não recupera clock inválido' }));
    await assertFails(
      mutation(database, id, 1, (batch) =>
        batch.update(loreRef(database, id), { summary: 'Clock inválido' }),
      ),
    );
    assert.deepEqual(await observe(id), snapshot);
  }
  await seed('ceiling', { localLoreVersion: maxVersion - 1 });
  await assertSucceeds(
    mutation(database, 'ceiling', maxVersion, (batch) =>
      batch.update(loreRef(database, 'ceiling'), { summary: 'Última revisão segura' }),
    ),
  );
  const ceiling = await observe('ceiling');
  assert.equal(ceiling.book.localLoreVersion, maxVersion);
  await assertFails(
    mutation(database, 'ceiling', maxVersion + 1, (batch) =>
      batch.update(loreRef(database, 'ceiling'), { summary: 'Overflow' }),
    ),
  );
  await assertFails(deleteDoc(loreRef(database, 'ceiling')));
  assert.deepEqual(await observe('ceiling'), ceiling);
});

test('SDK clock de lore local: cleanup deleting e revogação pública preservam seus gates', async () => {
  const database = db();
  await seed('deleting', { localLoreVersion: 7, deleting: true }, [
    ['private', entityData()],
    ['public', entityData({ isPublic: true })],
  ]);
  for (const actor of ['intruder', null]) {
    await assertFails(deleteDoc(loreRef(db(actor), 'deleting', 'private')));
  }
  const deleting = await observe('deleting');
  await assertFails(
    mutation(database, 'deleting', 8, (batch) =>
      batch.set(loreRef(database, 'deleting', 'new'), entityData()),
    ),
  );
  await assertFails(
    mutation(database, 'deleting', 8, (batch) =>
      batch.update(loreRef(database, 'deleting', 'private'), { summary: 'Não editar em cleanup' }),
    ),
  );
  assert.deepEqual(await observe('deleting'), deleting);
  await assertSucceeds(deleteDoc(loreRef(database, 'deleting', 'private')));
  await assertSucceeds(deleteDoc(loreRef(database, 'deleting', 'public')));
  const cleaned = await observe('deleting');
  assert.equal(cleaned.book.localLoreVersion, 7);
  assert.deepEqual(cleaned.lore, {});

  await seed(
    'published',
    { localLoreVersion: 5, status: 'published', publicationPrivacyVersion: 0 },
    [['public', entityData({ isPublic: true })]],
  );
  await environment.withSecurityRulesDisabled((context) =>
    setDoc(doc(context.firestore(), 'publicBooks', 'published'), {
      schemaVersion: 1,
      title: 'Publicado',
      authorName: 'Autor',
      revisionId: 'revision',
      publishedAt: 1,
    }),
  );
  const published = await observe('published');
  await assertFails(
    mutation(database, 'published', 6, (batch) =>
      batch.update(loreRef(database, 'published', 'public'), { isPublic: false }),
    ),
  );
  await assertFails(
    mutation(database, 'published', 6, (batch) =>
      batch.delete(loreRef(database, 'published', 'public')),
    ),
  );
  assert.deepEqual(await observe('published'), published);
  const revoke = writeBatch(database);
  revoke.update(bookRef(database, 'published'), {
    status: 'draft',
    publicationPrivacyVersion: 1,
    localLoreVersion: 6,
  });
  revoke.delete(doc(database, 'publicBooks', 'published'));
  revoke.update(loreRef(database, 'published', 'public'), { isPublic: false });
  await assertSucceeds(revoke.commit());
  const revoked = await observe('published');
  assert.equal(revoked.book.localLoreVersion, 6);
  assert.equal(revoked.book.publicationPrivacyVersion, 1);
  assert.equal(revoked.lore.public.isPublic, false);
  assert.equal(revoked.lore.public.details, published.lore.public.details);
  assert.equal((await getDoc(doc(database, 'publicBooks', 'published'))).exists(), false);
});
