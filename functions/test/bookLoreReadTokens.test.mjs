import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../src/workProgressContracts.mjs';
import { bookBackupIdentity } from '../src/bookBackupContext.mjs';
import { createBookLoreReadService } from '../src/bookLoreRead.mjs';
import { createBookLoreWriteRecoveryService } from '../src/bookLoreWriteRecovery.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { seedBookLoreRead } from './helpers/bookLoreReadFixture.mjs';
import {
  sourceInspectionFixture,
  finishSourceInspection,
  sourceInspectionMetadata,
} from './helpers/bookLoreSourceInspectionFixture.mjs';
import { fieldUploadFixture, uploadAll, sealAll } from './helpers/bookLoreFieldUploadFixture.mjs';
import { adoptionFixture, adoptFixture } from './helpers/bookLoreEditAdoptionFixture.mjs';
import {
  resourceInventoryFixture,
  registerInventorySource,
} from './helpers/bookLoreResourceInventoryFixture.mjs';
import { tokenSelectionFixture } from './helpers/bookLoreReadTokensFixture.mjs';

const setup = () => {
  const f = adventureImportDb({ nativeUpdates: true });
  return { ...f, api: createBookLoreReadService({ db: f.db }) };
};
const scope = (f) => ({ bookId: f.bookId, id: f.id });
const part = (v) => ({
  bookId: v.bookId,
  id: v.id,
  readToken: v.readToken,
  section: 'base',
  page: 0,
  index: 0,
});
const changeClock = (f, value = 1) =>
  f.db.runTransaction(async (tx) => tx.update(f.db.doc('books/book'), { localLoreVersion: value }));
async function recreate(db, path) {
  const value = (await db.doc(path).get()).data();
  await db.runTransaction(async (tx) => tx.delete(db.doc(path)));
  await db.runTransaction(async (tx) => tx.create(db.doc(path), value));
}

test('default v1 is byte-for-byte the original token and explicit v1 preserves cursor encoding', async () => {
  const f = setup(),
    seed = await seedBookLoreRead(f.db, { inline: true });
  await seedBookLoreRead(f.db, { id: 'sibling', inline: true });
  const book = await f.db.doc(seed.bookPath).get(),
    head = await f.db.doc(seed.path).get(),
    listToken = digest({
      schemaVersion: 1,
      domain: 'book-lore-list',
      uid: seed.uid,
      bookId: seed.bookId,
      birth: bookBackupIdentity(book).created,
      version: 0,
    }),
    expected = digest({
      schemaVersion: 1,
      domain: 'book-lore-read',
      uid: seed.uid,
      bookId: seed.bookId,
      listToken,
      id: seed.id,
      native: bookBackupIdentity(head),
    }),
    initial = await f.api.getBookLoreRead(seed.uid, scope(seed));
  assert.equal(initial.readToken, expected);
  assert.deepEqual(
    await f.api.getBookLoreRead(seed.uid, { ...scope(seed), tokenVersion: 1 }),
    initial,
  );
  const a = await f.api.listBookLoreRead(seed.uid, { bookId: seed.bookId, limit: 1 });
  assert.deepEqual(
    await f.api.listBookLoreRead(seed.uid, { bookId: seed.bookId, limit: 1, tokenVersion: 1 }),
    a,
  );
  assert.equal(a.listToken, listToken);
  assert.equal(JSON.parse(Buffer.from(a.nextCursor, 'base64url')).schemaVersion, 1);
  assert.equal(
    Object.hasOwn(JSON.parse(Buffer.from(a.nextCursor, 'base64url')), 'tokenVersion'),
    false,
  );
});

for (const mode of ['inline', 'v1', 'v2'])
  test(
    'independent token preserves the original ' +
      mode +
      ' fiche and inspection after a sibling changes',
    async () => {
      const f = setup(),
        s = await sourceInspectionFixture(f.db, { mode, tokenVersion: 2 }),
        legacy = await f.api.getBookLoreRead(s.uid, scope(s));
      await seedBookLoreRead(f.db, {
        id: 'sibling',
        inline: true,
        data: { name: 'B', category: 'other' },
      });
      const p = await s.factory().startBookLoreSourceInspection(s.uid, s.intent);
      await f.db.runTransaction(async (tx) => {
        tx.update(f.db.doc('books/book/lore/sibling'), { name: 'Changed' });
        tx.update(f.db.doc('books/book'), {
          localLoreVersion: 1,
          publicationPrivacyVersion: 4,
          status: 'draft',
        });
      });
      assert.notEqual(s.view.readToken, legacy.readToken);
      assert.deepEqual(
        await f.api.getBookLoreRead(s.uid, { ...scope(s), readToken: s.view.readToken }),
        s.view,
      );
      assert.equal((await f.api.readBookLorePart(s.uid, part(s.view))).readToken, s.view.readToken);
      await assert.rejects(f.api.readBookLorePart(s.uid, part(legacy)), {
        code: 'failed-precondition',
      });
      const ready = await finishSourceInspection(s, p);
      assert.equal(ready.ready, true);
      assert.equal((await sourceInspectionMetadata(s, ready)).isPublic.value, mode !== 'v2');
      assert.equal(f.records.get(s.c.path).context.sourceToken, s.view.readToken);
    },
  );

for (const kind of [
  'head',
  'same-logical-data',
  'fiche-recreated',
  'book-recreated',
  'owner',
  'deleting',
  'invalid-clock',
])
  test(
    'v2 refuses original access after ' +
      kind +
      ' without emitting bytes or changing its expected token',
    async () => {
      const f = setup(),
        s = await sourceInspectionFixture(f.db, { mode: 'inline', tokenVersion: 2 });
      if (kind === 'fiche-recreated' || kind === 'book-recreated')
        await recreate(f.db, kind === 'fiche-recreated' ? s.seed.path : s.seed.bookPath);
      else
        await f.db.runTransaction(async (tx) => {
          if (kind === 'head') tx.update(f.db.doc(s.seed.path), { name: 'Changed' });
          if (kind === 'same-logical-data')
            tx.set(f.db.doc(s.seed.path), structuredClone(f.records.get(s.seed.path)));
          if (kind === 'owner') tx.update(f.db.doc(s.seed.bookPath), { authorId: 'other' });
          if (kind === 'deleting') tx.update(f.db.doc(s.seed.bookPath), { deleting: true });
          if (kind === 'invalid-clock')
            tx.update(f.db.doc(s.seed.bookPath), { localLoreVersion: -1 });
        });
      await assert.rejects(
        f.api.getBookLoreRead(s.uid, { ...scope(s), readToken: s.view.readToken }),
      );
      await assert.rejects(f.api.readBookLorePart(s.uid, part(s.view)));
      await assert.rejects(s.factory().startBookLoreSourceInspection(s.uid, s.intent));
      assert.equal(f.records.has(s.c.path), false);
    },
  );

test('v2 never grants access across accounts, books or fiche IDs', async () => {
  const f = setup(),
    a = await seedBookLoreRead(f.db, { inline: true }),
    b = await seedBookLoreRead(f.db, { id: 'sibling', inline: true }),
    c = await seedBookLoreRead(f.db, { bookId: 'other-book', inline: true }),
    v = await f.api.getBookLoreRead(a.uid, { ...scope(a), tokenVersion: 2 });
  for (const input of [scope(b), scope(c)])
    await assert.rejects(f.api.getBookLoreRead(a.uid, { ...input, readToken: v.readToken }));
  await assert.rejects(f.api.getBookLoreRead('other', { ...scope(a), readToken: v.readToken }));
});

test('the unchanged v1 inspection still conflicts on a later clock and is never promoted', async () => {
  const f = setup(),
    s = await sourceInspectionFixture(f.db, { mode: 'inline' }),
    p = await s.factory().startBookLoreSourceInspection(s.uid, s.intent);
  await changeClock(f);
  await assert.rejects(finishSourceInspection(s, p), { code: 'failed-precondition' });
  const v2 = await f.api.getBookLoreRead(s.uid, { ...scope(s), tokenVersion: 2 });
  assert.notEqual(v2.readToken, s.intent.sourceToken);
  assert.equal(f.records.get(s.c.path).context.sourceToken, s.intent.sourceToken);
});

test('v2 list cursor pins its scheme, maintains the global clock and lists beyond fifty', async () => {
  const f = setup();
  for (let i = 0; i < 53; i++)
    await seedBookLoreRead(f.db, {
      id: 'id-' + String(i).padStart(3, '0'),
      inline: true,
      data: { name: 'A', category: 'other' },
    });
  const first = await f.api.listBookLoreRead('author', {
      bookId: 'book',
      limit: 17,
      tokenVersion: 2,
    }),
    old = await f.api.listBookLoreRead('author', { bookId: 'book', limit: 17 });
  assert.equal(first.listToken, old.listToken);
  assert.notEqual(first.items[0].readToken, old.items[0].readToken);
  const next = { bookId: 'book', limit: 17, listToken: first.listToken, cursor: first.nextCursor };
  await assert.rejects(f.api.listBookLoreRead('author', next), { code: 'invalid-argument' });
  await assert.rejects(
    f.api.listBookLoreRead('author', { ...next, cursor: old.nextCursor, tokenVersion: 2 }),
    { code: 'invalid-argument' },
  );
  const ids = first.items.map((i) => i.id);
  let p = first;
  while (p.nextCursor) {
    p = await f.api.listBookLoreRead('author', {
      bookId: 'book',
      limit: 17,
      listToken: first.listToken,
      cursor: p.nextCursor,
      tokenVersion: 2,
    });
    ids.push(...p.items.map((i) => i.id));
  }
  assert.equal(new Set(ids).size, 53);
  await changeClock(f);
  await assert.rejects(f.api.listBookLoreRead('author', { ...next, tokenVersion: 2 }), {
    code: 'failed-precondition',
  });
  assert.equal(
    (
      await f.api.getBookLoreRead('author', {
        bookId: 'book',
        id: first.items[0].id,
        readToken: first.items[0].readToken,
      })
    ).readToken,
    first.items[0].readToken,
  );
});

test('invalid token negotiation is rejected before any data reads and never rebases an expected token', async () => {
  const f = setup();
  for (const tokenVersion of [0, 3, '2', null, false, {}, []]) {
    await assert.rejects(f.api.listBookLoreRead('author', { bookId: 'book', tokenVersion }), {
      code: 'invalid-argument',
    });
    await assert.rejects(
      f.api.getBookLoreRead('author', { bookId: 'book', id: 'entity', tokenVersion }),
      { code: 'invalid-argument' },
    );
  }
  for (const tokenVersion of [1, 2])
    await assert.rejects(
      f.api.getBookLoreRead('author', {
        bookId: 'book',
        id: 'entity',
        readToken: 'a'.repeat(64),
        tokenVersion,
      }),
      { code: 'invalid-argument' },
    );
  assert.equal(f.reads.length, 0);
  assert.equal(f.metadataReads.length, 0);
});

test('all fifty-three original selected sources survive sequential native withdrawals without rereading or capping the selection', async () => {
  const f = setup(),
    selected = await tokenSelectionFixture(f.db, { count: 53 }),
    original = selected.members.map((m) => m.intent.sourceToken);
  for (const m of selected.members) assert.equal((await m.start()).removed, true);
  assert.equal(f.records.get('books/book').localLoreVersion, 53);
  assert.equal(f.records.get('books/book').publicationPrivacyVersion, 1);
  assert.deepEqual(
    selected.members.map((m) => m.intent.sourceToken),
    original,
  );
  for (const m of selected.members) assert.equal(f.records.has(m.source.seed.path), false);
});

test('a changed selected member conflicts while previous progress and other original sources remain distinct', async () => {
  const f = setup(),
    { members } = await tokenSelectionFixture(f.db),
    original = members.map((m) => m.intent.sourceToken);
  await members[0].start();
  await f.db.runTransaction(async (tx) => {
    tx.update(f.db.doc(members[1].source.seed.path), { name: 'Changed externally' });
    tx.update(f.db.doc('books/book'), { localLoreVersion: 2 });
  });
  await assert.rejects(members[1].start(), { code: 'failed-precondition' });
  assert.equal((await members[0].get()).removed, true);
  assert.equal(f.records.has(members[1].source.seed.path), true);
  assert.equal((await members[2].start()).removed, true);
  assert.deepEqual(
    members.map((m) => m.intent.sourceToken),
    original,
  );
  assert.equal(f.records.get('books/book').localLoreVersion, 3);
});

test('v2 uploads continue original bounded units after another fiche changes the clock', async () => {
  const f = setup(),
    u = await fieldUploadFixture(f.db, { tokenVersion: 2, value: 'x'.repeat(90000) }),
    p = await u.factory().startBookLoreFieldUpload(u.uid, u.intent);
  await changeClock(f);
  const done = await sealAll(u, await uploadAll(u, p));
  assert.equal(done.phase, 'sealed');
  assert.equal(f.records.get(u.c.path).context.sourceToken, u.intent.sourceToken);
});

test('two prepared v2 edits can be adopted successively without recapturing their original sources', async () => {
  const f = setup(),
    members = [];
  for (let i = 0; i < 2; i++)
    members.push(
      await adoptionFixture(f.db, {
        mode: 'inline',
        loreId: 'entity-' + i,
        editId: 'edit-' + i,
        sourceOptions: { tokenVersion: 2 },
        changes: [{ target: { field: 'summary' }, value: 'Revised ' + i }],
      }),
    );
  const original = members.map((m) => m.intent.sourceToken);
  for (const m of members) await adoptFixture(m);
  assert.equal(f.records.get('books/book').localLoreVersion, 2);
  assert.deepEqual(
    members.map((m) => m.intent.sourceToken),
    original,
  );
  for (const m of members)
    assert.equal(
      (await f.api.getBookLoreRead(m.uid, { bookId: m.bookId, id: m.loreId, tokenVersion: 2 }))
        .schemaVersion,
      2,
    );
});

test('source inventory registers the original v2 payload after unrelated clock changes', async () => {
  const f = setup(),
    i = await resourceInventoryFixture(f.db),
    v = await f.api.getBookLoreRead(i.uid, { bookId: i.bookId, id: i.id, tokenVersion: 2 });
  await changeClock(f);
  assert.equal(
    (await registerInventorySource(i, { ...i.request, sourceToken: v.readToken })).registered,
    true,
  );
  assert.equal(f.records.get('books/book').localLoreVersion, 1);
});

test('recovery reservation accepts the exact v2 origin after a clock change and preserves old v1 rejection', async () => {
  const f = setup(),
    s = await seedBookLoreRead(f.db, { inline: true }),
    old = await f.api.getBookLoreRead(s.uid, scope(s)),
    v = await f.api.getBookLoreRead(s.uid, { ...scope(s), tokenVersion: 2 }),
    api = createBookLoreWriteRecoveryService({ db: f.db, now: () => 9000 }),
    intent = {
      writeId: 'recovery-v2',
      bookId: s.bookId,
      loreId: s.id,
      sourceToken: v.readToken,
      intentHash: 'a'.repeat(64),
    };
  await changeClock(f);
  await assert.rejects(
    api.reserveBookLoreEditRecovery(s.uid, {
      ...intent,
      writeId: 'old',
      sourceToken: old.readToken,
    }),
    { code: 'failed-precondition' },
  );
  const p = await api.reserveBookLoreEditRecovery(s.uid, intent);
  assert.equal(p.sourceToken, v.readToken);
  assert.equal(
    f.records.get('users/author/bookLoreWriteRecoveries/recovery-v2').intent.sourceToken,
    v.readToken,
  );
});

for (const mode of ['v1', 'v2'])
  test(
    'v2 token still checks native payload proofs for a recreated ' + mode + ' base body',
    async () => {
      const f = setup(),
        s = await sourceInspectionFixture(f.db, { mode, tokenVersion: 2 });
      await recreate(f.db, s.seed.base.path);
      await assert.rejects(f.api.readBookLorePart(s.uid, part(s.view)), {
        code: 'failed-precondition',
      });
    },
  );
