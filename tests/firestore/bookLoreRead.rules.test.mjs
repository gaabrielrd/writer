import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';
import {
  seedBookLoreRead,
  loreReadData,
  readLoreSection,
} from '../../functions/test/helpers/bookLoreReadFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-book-lore-read',
  sha = (value) => createHash('sha256').update(value).digest('hex');
let admin, env, api;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
    throw new Error('Dedicated loopback emulator required');
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
  api = createBookLoreReadService({ db: admin });
});
beforeEach(async () => {
  await env.clearFirestore();
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const scope = (s) => ({ bookId: s.bookId, id: s.id });
const request = (v, section = 'base') => ({
  bookId: v.bookId,
  id: v.id,
  readToken: v.readToken,
  section,
  page: 0,
  index: 0,
});
test('SDK privately reads more than 8 MiB/128 parts, mixed legacy/payload list and relations with an older lore birthday', async (t) => {
  const data = {
      ...loreReadData(),
      details: '\ufeff' + String.fromCodePoint(0x1f319).repeat(2300000),
    },
    seed = await seedBookLoreRead(admin, { data, olderLore: true }),
    legacy = await seedBookLoreRead(admin, {
      id: 'legacy',
      inline: true,
      data: { name: 'Old', category: 'other' },
    }),
    first = await api.listBookLoreRead(seed.uid, { bookId: seed.bookId, limit: 1 }),
    second = await api.listBookLoreRead(seed.uid, {
      bookId: seed.bookId,
      limit: 1,
      listToken: first.listToken,
      cursor: first.nextCursor,
    });
  assert.equal(first.items.length, 1);
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
  const view = await api.getBookLoreRead(seed.uid, {
    ...scope(seed),
    readToken: first.items[0].readToken,
  });
  assert.ok(view.base.chunkCount > 128);
  const base = await readLoreSection(api, seed.uid, view);
  assert.equal(sha(base.details), sha(data.details));
  assert.deepEqual(base.aliases, data.aliases);
  const relations = [];
  for (let page = 0; page < view.relations.pages; page++)
    relations.push(...(await readLoreSection(api, seed.uid, view, 'relations', page)));
  assert.deepEqual(relations, data.relations);
  const old = await api.getBookLoreRead(seed.uid, scope(legacy)),
    oldValue = await readLoreSection(api, seed.uid, old);
  assert.equal(old.mode, 'inline');
  assert.equal(Object.hasOwn(oldValue, 'createdAt'), false);
  const loreSnapshot = await admin.doc(seed.path).get(),
    segment = await admin.doc(seed.segments[0].path).get();
  assert.ok(loreSnapshot.createTime.toMillis() < segment.createTime.toMillis());
  const client = env.authenticatedContext(seed.uid).firestore();
  await assertFails(getDoc(doc(client, seed.base.path)));
  await assertFails(getDoc(doc(client, seed.segments[0].path)));
  await assertFails(setDoc(doc(client, seed.base.path), {}));
  t.diagnostic(
    view.base.chunkCount +
      ' base parts; 3 relation pages; physical root harness only, not an activation',
  );
});
test('SDK native recreations of project/lore/body/part/segment invalidate the old read token or physical proof', async () => {
  for (const target of ['book', 'lore', 'body', 'part', 'segment']) {
    const seed = await seedBookLoreRead(admin, {
        id: 'entity-' + target,
        data: { ...loreReadData(), details: 'small' },
      }),
      view = await api.getBookLoreRead(seed.uid, scope(seed)),
      path =
        target === 'book'
          ? seed.bookPath
          : target === 'lore'
            ? seed.path
            : target === 'body'
              ? seed.base.path
              : target === 'part'
                ? seed.bookPath +
                  '/bookResourceChunks/' +
                  seed.base.prepared.manifest.bodyId +
                  ':000000000000000'
                : seed.segments[0].path,
      ref = admin.doc(path),
      before = await ref.get();
    await ref.delete();
    await ref.create(before.data());
    const after = await ref.get();
    assert.equal(before.createTime.isEqual(after.createTime), false);
    await assert.rejects(() =>
      api.readBookLorePart(seed.uid, request(view, target === 'segment' ? 'relations' : 'base')),
    );
    assert.equal((await ref.get()).createTime.isEqual(after.createTime), true);
  }
});
test('SDK owner, missing project, deletion and collection-version checks reauthorize every unit', async () => {
  const seed = await seedBookLoreRead(admin, {
    root: false,
    data: { name: 'A', category: 'other' },
  });
  await assert.rejects(() => api.getBookLoreRead(seed.uid, scope(seed)));
  assert.equal((await admin.doc(seed.bookPath).get()).exists, false);
  await admin
    .doc(seed.bookPath)
    .create({ authorId: 'other', deleting: false, localLoreVersion: 0 });
  await assert.rejects(() => api.listBookLoreRead(seed.uid, { bookId: seed.bookId }));
  await admin.doc(seed.bookPath).update({ authorId: seed.uid });
  const view = await api.getBookLoreRead(seed.uid, scope(seed)),
    list = await api.listBookLoreRead(seed.uid, { bookId: seed.bookId });
  await admin.doc(seed.bookPath).update({ localLoreVersion: 1 });
  await assert.rejects(() =>
    api.listBookLoreRead(seed.uid, { bookId: seed.bookId, listToken: list.listToken }),
  );
  await assert.rejects(() => api.readBookLorePart(seed.uid, request(view)));
  const current = await api.getBookLoreRead(seed.uid, scope(seed));
  await admin.doc(seed.bookPath).update({ deleting: true });
  await assert.rejects(() => api.readBookLorePart(seed.uid, request(current)));
});
