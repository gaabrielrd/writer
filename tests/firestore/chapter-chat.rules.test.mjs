import { after, before, beforeEach, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createChapterChatService } from '../../functions/src/chapterChat.mjs';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
let environment;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Use somente o emulador demo.');
  environment = await initializeTestEnvironment({
    projectId: 'demo-writer-chapter-chat-tests',
    firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') },
  });
});
beforeEach(async () => environment.clearFirestore());
after(async () => environment?.cleanup());
it('conversas, mensagens e recibos são exclusivos do servidor mesmo para o dono', async () => {
  const paths = [
    'users/author/chapterChats/book/chapters/chapter/conversations/chat',
    'users/author/chapterChats/book/chapters/chapter/conversations/chat/messages/message',
    'users/author/chapterChats/book/chapters/chapter/receipts/receipt',
    'users/author/chapterChatLimits/current',
  ];
  await environment.withSecurityRulesDisabled(async (context) => {
    for (const path of paths) await setDoc(doc(context.firestore(), path), { text: 'Privado' });
  });
  for (const uid of ['author', 'intruder', null]) {
    const db = uid
      ? environment.authenticatedContext(uid).firestore()
      : environment.unauthenticatedContext().firestore();
    for (const path of paths) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, path), { provider: 'byok' }));
      await assertFails(updateDoc(doc(db, path), { paid: true }));
      await assertFails(deleteDoc(doc(db, path)));
    }
  }
});
it('transação real grava manuscrito e debita uma vez, com recuperação e conflito', async () => {
  const app = initializeApp(
    { projectId: 'demo-writer-chapter-chat-admin-tests' },
    'chapter-chat-test',
  );
  const db = getFirestore(app);
  const sha = (text) => createHash('sha256').update(text).digest('hex');
  const identity = { bookId: 'book', chapterId: 'chapter', conversationId: 'conversation' };
  const context = {
    source: 'selection',
    text: 'Texto',
    surrounding: '',
    title: '',
    bookTitle: '',
    truncated: false,
    persona: { instruction: '', version: '' },
    lore: [],
    target: { hash: sha('<p>Texto</p>'), from: 1, to: 6 },
  };
  try {
    await Promise.all([
      db.doc('books/book').set({ authorId: 'author', wordCount: 1, updatedAt: 1 }),
      db
        .doc('books/book/chapters/chapter')
        .set({ content: '<p>Texto</p>', wordCount: 1, updatedAt: 1 }),
      db.doc('users/author').set({ credits: 1 }),
    ]);
    const service = createChapterChatService({
      db,
      generator: () => Promise.resolve('[[SUGESTAO]]Novo texto[[/SUGESTAO]]'),
    });
    const call = (data) => service.chapterChat('author', { ...identity, ...data });
    await call({ action: 'create' });
    await call({ action: 'send', requestId: 'request', text: '/reescrever', context });
    assert.equal((await db.doc('users/author').get()).data().credits, 1);
    const operation = {
      action: 'apply',
      requestId: 'accept',
      messageId: 'request',
      expectedHash: context.target.hash,
      sourceHash: context.target.hash,
      after: '<p>Novo texto</p>',
    };
    const results = await Promise.all([call(operation), call(operation)]);
    assert.deepEqual(results[0], results[1]);
    assert.equal(results[0].credits, 0);
    assert.equal(
      (await db.doc('books/book/chapters/chapter').get()).data().content,
      '<p>Novo texto</p>',
    );
    assert.deepEqual(await call(operation), results[0]);
    await assert.rejects(call({ ...operation, requestId: 'another' }), {
      code: 'failed-precondition',
    });
    await call({ action: 'delete' });
    assert.equal((await call({ action: 'load' })).conversation, null);
  } finally {
    await db.terminate();
    await deleteApp(app);
  }
});
