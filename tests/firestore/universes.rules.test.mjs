import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createUniverseLoreImportService } from '../../functions/src/universeLoreImport.mjs';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
let environment;
const root = {
  schemaVersion: 2,
  title: 'Atlas',
  authorName: 'Autora',
  revisionId: 'rev',
  publishedAt: 1,
  universeId: 'world',
  universePrivacyVersion: 0,
};
const revision = {
  createdAt: 1,
  chapterCount: 1,
  loreCount: 1,
  privacyVersion: 0,
  universeId: 'world',
  universePrivacyVersion: 0,
};
const lore = { name: 'Arthur', aliases: ['Rei'], category: 'character', summary: 'O rei' };
const revisionPath = 'publicBooks/book/revisions/rev';
const client = (uid) =>
  uid
    ? environment.authenticatedContext(uid).firestore()
    : environment.unauthenticatedContext().firestore();
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Use somente o emulador demo.');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  environment = await initializeTestEnvironment({
    projectId: 'demo-writer-universes',
    firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') },
  });
});
after(async () => environment?.cleanup());
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'universes/world'), {
        authorId: 'author',
        name: 'Atlas',
        description: 'SEGREDO',
        privacyVersion: 0,
        bookCount: 1,
      }),
      setDoc(doc(db, 'universes/world/lore/arthur'), {
        ...lore,
        isPublic: true,
        details: 'SEGREDO',
      }),
      setDoc(doc(db, 'universes/world/lore/private'), {
        ...lore,
        isPublic: false,
        notes: 'SEGREDO',
      }),
      setDoc(doc(db, 'publicUniversePrivacy/world'), { version: 0, active: true }),
      setDoc(doc(db, 'books/book'), {
        authorId: 'author',
        universeId: 'world',
        status: 'published',
        updatedAt: 1,
      }),
      setDoc(doc(db, 'books/book/lore/local'), { ...lore, isPublic: true }),
    ]);
  });
});
async function publish() {
  const db = client('author');
  await assertSucceeds(setDoc(doc(db, revisionPath), revision));
  await assertSucceeds(
    setDoc(doc(db, `${revisionPath}/chapters/ch`), {
      title: 'Um',
      order: 1,
      content: '<p>Arthur</p>',
    }),
  );
  await assertSucceeds(
    setDoc(doc(db, `${revisionPath}/lore/universe:world:arthur`), {
      ...lore,
      sourceEntityId: 'arthur',
    }),
  );
  await assertSucceeds(setDoc(doc(db, 'publicBooks/book'), root));
}

test('isolates universe originals by author and makes management and relationships server-only', async () => {
  for (const path of [
    'universes/world',
    'universes/world/lore/arthur',
    'universes/world/lore/private',
  ]) {
    await assertSucceeds(getDoc(doc(client('author'), path)));
    for (const uid of [null, 'other']) await assertFails(getDoc(doc(client(uid), path)));
    await assertFails(updateDoc(doc(client('author'), path), { name: 'Takeover' }));
    await assertFails(deleteDoc(doc(client('author'), path)));
  }
  await assertSucceeds(
    getDocs(query(collection(client('author'), 'universes'), where('authorId', '==', 'author'))),
  );
  await assertFails(getDocs(collection(client('author'), 'universes')));
  await assertFails(setDoc(doc(client('author'), 'universes/new'), { authorId: 'author' }));
  await assertFails(
    setDoc(doc(client('author'), 'universes/world/books/book'), { bookId: 'book' }),
  );
  await assertFails(updateDoc(doc(client('author'), 'books/book'), { universeId: null }));
  await assertFails(
    setDoc(doc(client('author'), 'books/new'), {
      authorId: 'author',
      status: 'draft',
      universeId: 'world',
    }),
  );
});
test('exposes only the minimal revocation signal, without allowing callers to forge it', async () => {
  await assertSucceeds(getDoc(doc(client(), 'publicUniversePrivacy/world')));
  await assertFails(getDocs(collection(client(), 'publicUniversePrivacy')));
  await assertFails(
    updateDoc(doc(client('author'), 'publicUniversePrivacy/world'), { version: 0 }),
  );
});
test('publishes authorized global projections and immediately blocks all stale direct reads on revocation', async () => {
  await publish();
  for (const path of [
    'publicBooks/book',
    revisionPath,
    `${revisionPath}/chapters/ch`,
    `${revisionPath}/lore/universe:world:arthur`,
  ])
    await assertSucceeds(getDoc(doc(client(), path)));
  await environment.withSecurityRulesDisabled((context) =>
    updateDoc(doc(context.firestore(), 'publicUniversePrivacy/world'), { version: 1 }),
  );
  for (const path of [
    'publicBooks/book',
    revisionPath,
    `${revisionPath}/chapters/ch`,
    `${revisionPath}/lore/universe:world:arthur`,
  ])
    await assertFails(getDoc(doc(client(), path)));
  await assertFails(getDocs(collection(client(), `${revisionPath}/chapters`)));
  await assertFails(setDoc(doc(client('author'), 'publicBooks/book'), root));
  await assertFails(setDoc(doc(client('author'), 'publicBooks/book/revisions/replay'), revision));
});
test('rejects private global lore, forged provenance, private fields and omitted universe versions', async () => {
  const db = client('author');
  await assertFails(
    setDoc(doc(db, revisionPath), {
      createdAt: 1,
      chapterCount: 1,
      loreCount: 1,
      privacyVersion: 0,
    }),
  );
  await assertSucceeds(setDoc(doc(db, revisionPath), revision));
  await assertFails(
    setDoc(doc(db, `${revisionPath}/lore/universe:world:private`), {
      ...lore,
      sourceEntityId: 'private',
    }),
  );
  await assertFails(
    setDoc(doc(db, `${revisionPath}/lore/fake`), { ...lore, sourceEntityId: 'arthur' }),
  );
  await assertFails(
    setDoc(doc(db, `${revisionPath}/lore/universe:world:arthur`), {
      ...lore,
      sourceEntityId: 'arthur',
      details: 'SEGREDO',
    }),
  );
  await assertFails(setDoc(doc(db, 'publicBooks/book'), { ...root, schemaVersion: 1 }));
  await assertFails(setDoc(doc(db, 'publicBooks/book'), { ...root, universeId: 'foreign' }));
});
test('deleting a universe revokes snapshots without exposing its private document to readers', async () => {
  await publish();
  await environment.withSecurityRulesDisabled((context) =>
    updateDoc(doc(context.firestore(), 'publicUniversePrivacy/world'), { active: false }),
  );
  await assertFails(getDoc(doc(client(), 'publicBooks/book')));
  await assertFails(getDoc(doc(client(), `${revisionPath}/chapters/ch`)));
});

test('universe import bytes, suggestions, review, quota and receipts are server-only', async () => {
  const paths = [
    'users/author/universeLoreImports/import',
    'users/author/universeLoreImports/import/importUploads/bytes-0-0',
    'users/author/universeLoreImports/import/importSources/000000',
    'users/author/universeLoreImports/import/importCandidates/candidate',
    'users/author/universeLoreImports/import/importReview/0',
    'users/author/universeLoreImportLimits/current',
    'users/author/universeLoreImportReceipts/operation',
  ];
  await environment.withSecurityRulesDisabled(async (context) => {
    for (const path of paths)
      await setDoc(doc(context.firestore(), path), { secret: 'PRIVATE SOURCE' });
  });
  for (const uid of ['author', 'other', null]) {
    const db = client(uid);
    for (const path of paths) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { secret: 'changed' }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  }
});

test('native Firestore atomically creates, replays and updates reviewed universe lore', async () => {
  const require = createRequire(new URL('../../functions/package.json', import.meta.url));
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: 'demo-writer-universes' }, 'universe-lore-import-native');
  try {
    const db = getFirestore(app);
    await db.doc('users/import-author').set({ credits: 3 });
    const entity = {
      name: 'Arthur',
      category: 'character',
      aliases: [],
      summary: 'O rei voltou.',
      details: 'Arthur voltou ao reino.',
      evidence: 'Arthur voltou ao reino.',
    };
    const api = createUniverseLoreImportService({
      db,
      generator: () => Promise.resolve(JSON.stringify({ entities: [entity] })),
    });
    async function prepare(session, universeId = null, version = 1) {
      const spans = [{ start: 0, end: entity.evidence.length, page: null }];
      const hash = createHash('sha256')
        .update(JSON.stringify({ text: entity.evidence, spans }))
        .digest('hex');
      const sourceHash = createHash('sha256').update(`:${hash}`).digest('hex');
      await api.startUniverseLoreImport('import-author', {
        id: session,
        version,
        universeId,
        files: [
          {
            name: 'lore.txt',
            size: Buffer.byteLength(entity.evidence),
            parts: 1,
            ...(version === 2
              ? { sourceBytes: Buffer.byteLength(entity.evidence), sourceHash }
              : {}),
          },
        ],
      });
      if (version === 1)
        await api.appendUniverseLoreImport('import-author', {
          id: session,
          kind: 'bytes',
          file: 0,
          index: 0,
          payload: Buffer.from(entity.evidence).toString('base64'),
        });
      await api.appendUniverseLoreImport('import-author', {
        id: session,
        kind: 'source',
        file: 0,
        index: 0,
        payload: entity.evidence,
        ...(version === 2 ? { spans, sha256: hash } : { page: null }),
      });
      await api.sealUniverseLoreImport('import-author', { id: session });
      return api.advanceUniverseLoreImport('import-author', { id: session, cursor: 0 });
    }
    const review = await prepare('native-import');
    const fields = {
      name: entity.name,
      category: entity.category,
      aliases: entity.aliases,
      summary: entity.summary,
      details: entity.details,
    };
    const request = {
      id: review.id,
      operationId: 'native-confirm',
      name: 'Atlas',
      description: '',
      changes: [{ candidateId: review.candidates[0].id, targetId: null, input: fields }],
    };
    await api.saveUniverseLoreImportReview('import-author', request);
    const result = await api.applyUniverseLoreImport('import-author', request);
    assert.deepEqual(await api.applyUniverseLoreImport('import-author', request), result);
    const rows = await db.collection(`universes/${result.universeId}/lore`).get();
    assert.equal(rows.size, 1);
    assert.equal(rows.docs[0].data().isPublic, false);
    const second = await prepare('native-update', result.universeId, 2);
    assert.equal(second.version, 2);
    assert.ok(
      (
        await db
          .doc('users/import-author/universeLoreImports/native-update/importSources/000000')
          .get()
      ).data().analysis.fingerprint,
    );
    const update = {
      ...request,
      id: second.id,
      operationId: 'native-update-confirm',
      changes: [
        {
          candidateId: second.candidates[0].id,
          targetId: rows.docs[0].id,
          input: { ...fields, details: '' },
        },
      ],
    };
    await api.saveUniverseLoreImportReview('import-author', update);
    await api.applyUniverseLoreImport('import-author', update);
    assert.equal((await rows.docs[0].ref.get()).data().details, '');
    assert.equal((await db.doc('users/import-author').get()).data().credits, 1);
    assert.equal((await db.doc(`universes/${result.universeId}`).get()).data().loreVersion, 2);
  } finally {
    await deleteApp(app);
  }
});
