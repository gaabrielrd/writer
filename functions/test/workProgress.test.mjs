import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../src/workProgressContracts.mjs';
import { workSourceKey, workGroupKey } from '../src/workProgressLedger.mjs';
import {
  workFixture,
  operation,
  book,
  adventure,
  campaign,
  activate,
  prepare,
} from './workProgressFixtures.mjs';
const error = (code, reason) => (value) =>
  value.code === code && (!reason || value.details?.reason === reason);
test('editorial state and total goals are separate from publication; invalid inputs do not block or mutate prose', async () => {
  const f = workFixture();
  f.records.set('books/book/chapters/ch', {
    content: 'Texto próprio',
    wordCount: 2,
    updatedAt: 100,
  });
  const before = structuredClone(f.records.get('books/book/chapters/ch'));
  assert.deepEqual(
    await f.api.updateWorkProgress('author', {
      target: book,
      operationId: operation(1),
      expectedRevision: 0,
      patch: { editorialState: 'ready', wordGoal: 1 },
    }),
    { revision: 1, editorialState: 'ready', wordGoal: 1 },
  );
  assert.equal(f.records.get('books/book').status, 'published');
  assert.equal(f.records.has('publicBooks/book'), false);
  assert.deepEqual(f.records.get('books/book/chapters/ch'), before);
  const pending = await f.api.getWorkProgress('author', { target: book });
  assert.equal(pending.manuscript.wordCount, null);
  assert.equal(pending.manuscript.ready, false);
  await assert.rejects(
    f.api.updateWorkProgress('author', {
      target: book,
      operationId: operation(3),
      expectedRevision: 1,
      patch: { wordGoal: 0 },
    }),
    error('invalid-argument'),
  );
  await assert.rejects(
    f.api.updateWorkProgress('author', {
      target: campaign,
      operationId: operation(4),
      expectedRevision: 0,
      patch: { editorialState: 'ready' },
    }),
    error('invalid-argument'),
  );
  assert.equal(
    (await f.api.getWorkProgress('author', { target: adventure })).editorialState,
    'ready',
  );
  assert.equal((await f.api.getWorkProgress('author', { target: campaign })).manuscript, null);
  assert.equal(await f.api.getWorkProgress('stranger', { target: book }), null);
});
test('bootstrap counts canonical legacy and composed scenes once, excludes preserved/planning/archived/unassigned content and never rewrites prose', async () => {
  const f = workFixture();
  f.records.set('books/book/chapters/legacy', {
    content: '<p>Ar<strong>th</strong>ur voltou.</p>',
    wordCount: 123,
    updatedAt: 100,
  });
  f.records.set('books/book/chapters/composed', {
    contentMode: 'scenes',
    content: 'FONTE ORIGINAL NÃO CANÔNICA',
    wordCount: 222,
  });
  for (const [id, parentId, archived, content] of [
    ['s1', 'composed', false, '<p>A noite caiu.</p>'],
    ['s2', 'composed', true, 'Texto arquivado ainda preservado'],
    ['s3', null, false, 'Texto sem capítulo'],
    ['s4', 'missing', false, 'Texto com grupo removido'],
  ]) {
    f.records.set('books/book/scenes/' + id, {
      ownerId: 'author',
      parentId,
      archived,
      wordCount: 999,
      revision: 1,
    });
    f.records.set('books/book/scenes/' + id + '/body/current', { content });
  }
  f.records.set('books/book/sceneSources/composed', {
    original: { content: 'Original preservado' },
  });
  await activate(f);
  const preserved = structuredClone(f.records.get('books/book/chapters/legacy'));
  const result = await prepare(f);
  assert.equal(result.wordCount, 5);
  assert.equal(f.records.get('books/book').wordCount, 5);
  assert.deepEqual(f.records.get('books/book/chapters/legacy'), preserved);
  assert.equal(
    f.records.get('books/book/sceneSources/composed').original.content,
    'Original preservado',
  );
  assert.equal((await f.api.getWorkProgress('author', { target: book })).manuscript.wordCount, 5);
  assert.ok(
    f.metadataReads.some(
      (read) => read.path.endsWith('/chapters') && !read.fields.includes('content'),
    ),
  );
  const stored = JSON.stringify([...f.records].filter(([path]) => path.includes('/workWord')));
  assert.ok(!stored.includes('Texto') && !stored.includes('Arthur') && !stored.includes('FONTE'));
});
test('writing/importing during preparation contributes before cursor, preserves checkpoint and retries safely; saves require the observed content', async () => {
  const f = workFixture();
  f.records.set('books/book/chapters/z-existing', {
    title: 'Legado',
    content: 'Um texto.',
    order: 1,
    wordCount: 2,
    updatedAt: 100,
  });
  await activate(f);
  const input = {
    bookId: 'book',
    operationId: operation(20),
    input: { title: 'Importado', content: 'Novo texto importado.' },
  };
  const created = await f.api.createLegacyChapter('author', input);
  assert.deepEqual(await f.api.createLegacyChapter('author', input), created);
  const partial = await f.api.prepareWorkWordCount('author', {
    target: book,
    operationId: operation(2),
    limit: 1,
  });
  assert.equal(partial.complete, false);
  assert.equal(partial.wordCount, null);
  const save = {
    bookId: 'book',
    chapterId: created.id,
    operationId: operation(21),
    expectedContentHash: digest(created.content),
    content: 'Novo texto.',
  };
  const saved = await f.api.saveLegacyChapter('author', save);
  assert.deepEqual(await f.api.saveLegacyChapter('author', save), saved);
  await assert.rejects(
    f.api.saveLegacyChapter('author', {
      ...save,
      operationId: operation(22),
      content: 'Outra aba',
    }),
    error('failed-precondition', 'revision-conflict'),
  );
  assert.equal((await prepare(f)).wordCount, 4);
  await assert.rejects(
    f.api.createLegacyChapter('author', {
      ...input,
      input: { ...input.input, content: 'Payload alterado' },
    }),
    error('invalid-argument'),
  );
  const receipt = f.records.get('users/author/workOperations/' + operation(21));
  assert.equal('content' in receipt, false);
  assert.equal('expectedContentHash' in receipt, false);
});
test('group exclusion subtracts once, bounded cleanup and bootstrap do not double-subtract; restoration to unassigned stays excluded', async () => {
  const f = workFixture(),
    path = 'adventures/adventure';
  f.records.set(path + '/parts/part', { contentMode: 'scenes', wordCount: 3 });
  for (const id of ['a', 'b']) {
    f.records.set(path + '/scenes/' + id, {
      ownerId: 'author',
      parentId: 'part',
      archived: false,
      revision: 1,
    });
    f.records.set(path + '/scenes/' + id + '/body/current', { content: 'Duas palavras' });
  }
  await activate(f, adventure);
  assert.equal((await prepare(f, adventure)).wordCount, 4);
  await f.db.runTransaction(async (tx) => {
    const root = (await tx.get(f.db.doc(path))).data();
    const plan = await f.ledger.prepareChanges(tx, {
      target: adventure,
      root,
      disableGroups: ['part'],
    });
    tx.update(f.db.doc(path + '/parts/part'), { deleting: true });
    plan.commit();
  });
  assert.equal(
    (await f.api.getWorkProgress('author', { target: adventure })).manuscript.wordCount,
    0,
  );
  for (const id of ['a', 'b'])
    await f.db.runTransaction(async (tx) => {
      const root = (await tx.get(f.db.doc(path))).data();
      const plan = await f.ledger.prepareChanges(tx, {
        target: adventure,
        root,
        changes: [{ kind: 'scene', id, parentId: null, removed: true }],
      });
      tx.update(f.db.doc(path + '/scenes/' + id), { parentId: null });
      plan.commit();
    });
  assert.equal(
    (await f.api.getWorkProgress('author', { target: adventure })).manuscript.wordCount,
    0,
  );
  const group = f.records.get(path + '/workWordGroups/' + workGroupKey(adventure, 'part'));
  assert.deepEqual(group, { words: 0, enabled: false });
  assert.equal(f.records.get(path + '/scenes/a/body/current').content, 'Duas palavras');
});
test('conversion swaps the legacy source and new scene in one transaction and keeps original content intact', async () => {
  const f = workFixture();
  f.records.set('books/book/chapters/ch', { content: 'Texto original', wordCount: 2 });
  await activate(f);
  await prepare(f);
  await f.db.runTransaction(async (tx) => {
    const root = (await tx.get(f.db.doc('books/book'))).data();
    const plan = await f.ledger.prepareChanges(tx, {
      target: book,
      root,
      changes: [
        { kind: 'chapter', id: 'ch', removed: true },
        { kind: 'scene', id: 'scene', content: 'Texto original', parentId: 'ch' },
      ],
      groupStates: [{ id: 'ch', contentMode: 'scenes' }],
    });
    tx.update(f.db.doc('books/book/chapters/ch'), { contentMode: 'scenes' });
    tx.create(f.db.doc('books/book/scenes/scene'), {
      ownerId: 'author',
      parentId: 'ch',
      archived: false,
      revision: 1,
    });
    tx.set(f.db.doc('books/book/scenes/scene/body/current'), { content: 'Texto original' });
    plan.commit();
  });
  assert.equal((await f.api.getWorkProgress('author', { target: book })).manuscript.wordCount, 2);
  assert.equal(f.records.get('books/book').wordCount, 2);
  assert.equal(f.records.get('books/book/chapters/ch').content, 'Texto original');
  assert.equal(
    f.records.get('books/book/workWordSources/' + workSourceKey('chapter', 'ch')).words,
    0,
  );
  assert.equal(
    f.records.get('books/book/workWordSources/' + workSourceKey('scene', 'scene')).words,
    2,
  );
});
test('archive/edit/restore/move follow current canonical size and never count planning or lost parents', async () => {
  const f = workFixture(),
    path = 'adventures/adventure';
  f.records.set(path + '/parts/part', { contentMode: 'scenes' });
  f.records.set(path + '/scenes/scene', {
    ownerId: 'author',
    parentId: 'part',
    archived: false,
    revision: 1,
  });
  f.records.set(path + '/scenes/scene/body/current', { content: 'Três palavras aqui' });
  await activate(f, adventure);
  await prepare(f, adventure);
  async function change(patch, content) {
    await f.db.runTransaction(async (tx) => {
      const root = (await tx.get(f.db.doc(path))).data(),
        plan = await f.ledger.prepareChanges(tx, {
          target: adventure,
          root,
          changes: [{ kind: 'scene', id: 'scene', ...patch, ...(content ? { content } : {}) }],
        });
      tx.update(f.db.doc(path + '/scenes/scene'), patch);
      if (content) tx.set(f.db.doc(path + '/scenes/scene/body/current'), { content });
      plan.commit();
    });
    return (await f.api.getWorkProgress('author', { target: adventure })).manuscript.wordCount;
  }
  assert.equal(await change({ archived: true }), 0);
  assert.equal(await change({}, 'Reescrita curta'), 0);
  assert.equal(await change({ archived: false }), 2);
  assert.equal(await change({ parentId: null }), 0);
  assert.equal(await change({ parentId: 'part' }), 2);
});
test('checklist mutations paginate/filter with real totals, item CAS, idempotent receipts and private ownership', async () => {
  const f = workFixture();
  for (let n = 30; n < 33; n++)
    await f.api.createWorkChecklistItem('author', {
      target: campaign,
      operationId: operation(n),
      title: 'Preparação ' + n,
    });
  const first = await f.api.listWorkChecklist('author', { target: campaign, limit: 1 });
  assert.equal(first.items.length, 1);
  assert.equal(first.total, 3);
  assert.equal(first.completed, 0);
  const second = await f.api.listWorkChecklist('author', {
    target: campaign,
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.equal(second.items.length, 1);
  await assert.rejects(
    f.api.listWorkChecklist('stranger', { target: campaign, limit: 1, cursor: first.nextCursor }),
    error('not-found'),
  );
  const edit = {
    target: campaign,
    id: first.items[0].id,
    operationId: operation(33),
    expectedRevision: 1,
    patch: { completed: true, title: 'Já preparado' },
  };
  const edited = await f.api.updateWorkChecklistItem('author', edit);
  assert.equal(edited.completed, 1);
  assert.deepEqual(await f.api.updateWorkChecklistItem('author', edit), edited);
  await assert.rejects(
    f.api.listWorkChecklist('author', { target: campaign, limit: 1, cursor: first.nextCursor }),
    error('failed-precondition', 'revision-conflict'),
  );
  const pending = await f.api.listWorkChecklist('author', { target: campaign, filter: 'pending' });
  assert.equal(pending.items.length, 2);
  assert.equal(pending.total, 3);
  await assert.rejects(
    f.api.deleteWorkChecklistItem('author', {
      target: campaign,
      id: edit.id,
      operationId: operation(34),
      expectedRevision: 1,
    }),
    error('failed-precondition'),
  );
  const removed = await f.api.deleteWorkChecklistItem('author', {
    target: campaign,
    id: edit.id,
    operationId: operation(35),
    expectedRevision: 2,
  });
  assert.deepEqual(removed, { checklistRevision: 5, total: 2, completed: 0 });
  await assert.rejects(
    f.api.createWorkChecklistItem('author', {
      target: book,
      operationId: operation(36),
      title: 'Não aplicável',
    }),
    error('invalid-argument'),
  );
  await assert.rejects(
    f.api.createWorkChecklistItem('author', {
      target: adventure,
      operationId: operation(37),
      title: 'x'.repeat(301),
    }),
    error('invalid-argument'),
  );
});
test('activity is private, globally CAS across projects, server dated and never touches manuscript; resume reauthorizes current labels and falls back', async () => {
  const f = workFixture();
  f.records.set('books/book/chapters/ch', { content: 'Texto próprio' });
  const before = structuredClone(f.records.get('books/book'));
  const input = {
    target: book,
    resource: { kind: 'chapter', id: 'ch' },
    operationId: operation(40),
    expectedActivityRevision: 0,
  };
  const recorded = await f.api.recordWorkActivity('author', input);
  assert.deepEqual(await f.api.recordWorkActivity('author', input), recorded);
  assert.deepEqual(f.records.get('books/book'), before);
  await assert.rejects(
    f.api.recordWorkActivity('author', {
      target: adventure,
      resource: { kind: 'project' },
      operationId: operation(41),
      expectedActivityRevision: 0,
    }),
    error('failed-precondition', 'revision-conflict'),
  );
  f.records.get('books/book').title = 'Nome atual';
  assert.equal((await f.api.listWorkResume('author', {})).items[0].title, 'Nome atual');
  assert.equal((await f.api.getWorkProgress('author', { target: campaign })).activityRevision, 1);
  const row = f.records.get('users/author/workActivity/' + digest(book));
  assert.deepEqual(Object.keys(row).sort(), ['accessedAt', 'kind', 'resource', 'target']);
  f.records.delete('books/book/chapters/ch');
  const resolved = await f.api.resolveWorkResume('author', { target: book });
  assert.equal(resolved.fallback, true);
  assert.deepEqual(resolved.resource, { kind: 'project' });
  f.records.get('books/book').authorId = 'other';
  assert.equal(await f.api.resolveWorkResume('author', { target: book }), null);
  assert.equal((await f.api.listWorkResume('author', {})).items.length, 0);
  await assert.rejects(f.api.recordWorkActivity('author', input), error('not-found'));
});
test('preferences initialize once via CAS, accept IANA and do not affect total goal or another user', async () => {
  const f = workFixture();
  assert.deepEqual(await f.api.getWorkPreferences('author', {}), { revision: 0, timeZone: null });
  const input = { operationId: operation(50), expectedRevision: 0, timeZone: 'America/Sao_Paulo' };
  const saved = await f.api.saveWorkPreferences('author', input);
  assert.equal(saved.timeZone, 'America/Sao_Paulo');
  assert.deepEqual(await f.api.saveWorkPreferences('author', input), saved);
  await assert.rejects(
    f.api.saveWorkPreferences('author', {
      ...input,
      operationId: operation(51),
      timeZone: 'Europe/Lisbon',
    }),
    error('failed-precondition', 'revision-conflict'),
  );
  await assert.rejects(
    f.api.saveWorkPreferences('author', { ...input, timeZone: 'UTC' }),
    error('invalid-argument'),
  );
  await assert.rejects(
    f.api.saveWorkPreferences('author', {
      operationId: operation(52),
      expectedRevision: 1,
      timeZone: '+01:00',
    }),
    error('invalid-argument'),
  );
  assert.deepEqual(await f.api.getWorkPreferences('other', {}), { revision: 0, timeZone: null });
  await assert.rejects(f.api.getWorkPreferences(null, {}), error('unauthenticated'));
});
test('large legacy text is counted in bounded work, not truncated or rejected by scene quotas', async () => {
  const f = workFixture(),
    content = 'a'.repeat(900000);
  for (const id of ['a', 'b', 'c'])
    f.records.set('books/book/chapters/' + id, { content, wordCount: 0, updatedAt: 100 });
  await activate(f);
  const first = await f.api.prepareWorkWordCount('author', {
    target: book,
    operationId: operation(2),
    limit: 50,
  });
  assert.equal(first.complete, false);
  assert.equal(first.processed, 2);
  assert.equal(first.wordCount, null);
  assert.equal((await prepare(f, book, 50)).wordCount, 3);
  assert.equal(f.records.get('books/book/chapters/a').content.length, 900000);
});
test('legacy writers preserve act-local order, metadata/persona atomicity, observed hashes and deletion dates', async () => {
  const f = workFixture();
  f.records.set('books/book/acts/a', { order: 1 });
  f.records.set('books/book/acts/b', { order: 2 });
  f.records.set('books/book/chapters/a-ch', {
    order: 3,
    actId: 'a',
    content: 'Ato primeiro',
    updatedAt: 100,
    wordCount: 2,
  });
  await activate(f);
  const created = await f.api.createLegacyChapter('author', {
    bookId: 'book',
    operationId: operation(60),
    input: { actId: 'b', content: 'Outra parte' },
  });
  assert.equal(created.order, 1);
  assert.equal(created.title, 'Capítulo 1');
  const saved = await f.api.saveLegacyChapter('author', {
    bookId: 'book',
    chapterId: created.id,
    operationId: operation(61),
    expectedContentHash: digest(created.content),
    content: 'Texto novo agora',
    patch: {
      title: 'Título novo',
      personaComplement: { personaId: 'preset-intimate', overrides: [] },
    },
  });
  assert.equal(saved.wordCount, 3);
  assert.equal(f.records.get('books/book/chapters/' + created.id).title, 'Título novo');
  await assert.rejects(
    f.api.saveLegacyChapter('author', {
      bookId: 'book',
      chapterId: created.id,
      operationId: operation(62),
      expectedContentHash: digest(saved.content),
      content: 'Ataque',
      patch: { personaComplement: { personaId: 'custom-foreign', overrides: [] } },
    }),
    error('invalid-argument'),
  );
  assert.equal(f.records.get('books/book/chapters/' + created.id).content, saved.content);
  await prepare(f);
  await assert.rejects(
    f.api.deleteLegacyChapters('author', {
      bookId: 'book',
      operationId: operation(63),
      chapters: [{ id: created.id, expectedUpdatedAt: 100 }],
    }),
    error('failed-precondition', 'revision-conflict'),
  );
  const remove = {
    bookId: 'book',
    operationId: operation(64),
    chapters: [{ id: created.id, expectedUpdatedAt: saved.updatedAt }],
  };
  assert.deepEqual(await f.api.deleteLegacyChapters('author', remove), { deleted: 1 });
  assert.deepEqual(await f.api.deleteLegacyChapters('author', remove), { deleted: 1 });
  assert.equal((await f.api.getWorkProgress('author', { target: book })).manuscript.wordCount, 2);
});

test('simultaneous bootstrap calls and a newer legacy save cannot double-count or reset contributions', async () => {
  const f = workFixture();
  f.records.set('books/book/chapters/ch', {
    content: 'Primeiro texto',
    wordCount: 999,
    order: 1,
    updatedAt: 100,
  });
  await activate(f);
  await Promise.all([
    f.api.prepareWorkWordCount('author', { target: book, operationId: operation(2), limit: 1 }),
    f.api.prepareWorkWordCount('author', { target: book, operationId: operation(3), limit: 1 }),
    f.api.saveLegacyChapter('author', {
      bookId: 'book',
      chapterId: 'ch',
      operationId: operation(70),
      expectedContentHash: digest('Primeiro texto'),
      content: 'Texto posterior mais longo',
    }),
  ]);
  assert.equal((await prepare(f)).wordCount, 4);
  assert.equal(f.records.get('books/book/workProgress/current').processed, 1);
  assert.equal(
    f.records.get('books/book/workWordSources/' + workSourceKey('chapter', 'ch')).words,
    4,
  );
});
test('deleting a partially verified group and creating a source before its cursor still yields the exact total', async () => {
  const f = workFixture(),
    path = 'adventures/adventure';
  f.records.set(path + '/parts/old', { contentMode: 'scenes' });
  f.records.set(path + '/parts/new', { contentMode: 'scenes' });
  for (const id of ['a', 'z']) {
    f.records.set(path + '/scenes/' + id, { ownerId: 'author', parentId: 'old', archived: false });
    f.records.set(path + '/scenes/' + id + '/body/current', { content: 'Duas palavras' });
  }
  await activate(f, adventure);
  assert.equal(
    (
      await f.api.prepareWorkWordCount('author', {
        target: adventure,
        operationId: operation(2),
        limit: 1,
      })
    ).processed,
    1,
  );
  await f.db.runTransaction(async (tx) => {
    const root = (await tx.get(f.db.doc(path))).data(),
      plan = await f.ledger.prepareChanges(tx, { target: adventure, root, disableGroups: ['old'] });
    tx.update(f.db.doc(path + '/parts/old'), { deleting: true });
    plan.commit();
  });
  await f.db.runTransaction(async (tx) => {
    const root = (await tx.get(f.db.doc(path))).data(),
      plan = await f.ledger.prepareChanges(tx, {
        target: adventure,
        root,
        changes: [{ kind: 'scene', id: '0-new', parentId: 'new', content: 'Agora há luz' }],
      });
    tx.create(f.db.doc(path + '/scenes/0-new'), {
      ownerId: 'author',
      parentId: 'new',
      archived: false,
    });
    tx.set(f.db.doc(path + '/scenes/0-new/body/current'), { content: 'Agora há luz' });
    plan.commit();
  });
  assert.equal((await prepare(f, adventure)).wordCount, 3);
  assert.equal(f.records.get(path + '/scenes/z/body/current').content, 'Duas palavras');
});
test('resume validates scene ownership, current group and body, pagination scope and current project authorization', async () => {
  const f = workFixture();
  f.records.set('books/book/chapters/group', { contentMode: 'scenes' });
  f.records.set('books/book/scenes/scene', {
    ownerId: 'author',
    parentId: 'group',
    archived: false,
  });
  f.records.set('books/book/scenes/scene/body/current', { content: 'Texto', revision: 1 });
  await f.api.recordWorkActivity('author', {
    target: book,
    resource: { kind: 'scene', id: 'scene' },
    operationId: operation(80),
    expectedActivityRevision: 0,
  });
  await f.api.recordWorkActivity('author', {
    target: adventure,
    resource: { kind: 'project' },
    operationId: operation(81),
    expectedActivityRevision: 1,
  });
  const page = await f.api.listWorkResume('author', { limit: 1 });
  assert.ok(page.nextCursor);
  await assert.rejects(
    f.api.listWorkResume('other', { limit: 1, cursor: page.nextCursor }),
    error('invalid-argument'),
  );
  await assert.rejects(
    f.api.listWorkResume('author', { limit: 1, cursor: page.nextCursor, kind: 'book' }),
    error('invalid-argument'),
  );
  f.records.get('books/book/chapters/group').deleting = true;
  assert.equal((await f.api.resolveWorkResume('author', { target: book })).fallback, true);
  await assert.rejects(
    f.api.recordWorkActivity('author', {
      target: book,
      resource: { kind: 'scene', id: 'scene' },
      operationId: operation(82),
      expectedActivityRevision: 2,
    }),
    error('not-found'),
  );
  f.records.get('books/book/scenes/scene').archived = true;
  assert.equal((await f.api.resolveWorkResume('author', { target: book })).fallback, false);
  f.records.delete('books/book/scenes/scene/body/current');
  assert.equal((await f.api.resolveWorkResume('author', { target: book })).fallback, true);
  f.records.get('books/book').deleting = true;
  assert.equal(await f.api.getWorkProgress('author', { target: book }), null);
  assert.equal(await f.api.resolveWorkResume('author', { target: book }), null);
});

test('missing active scene body fails before processing, preserves checkpoint and resumes after repair without a false zero', async () => {
  const f = workFixture(),
    path = 'adventures/adventure';
  f.records.set(path + '/parts/part', { contentMode: 'scenes' });
  f.records.set(path + '/scenes/scene', { ownerId: 'author', parentId: 'part', archived: false });
  await activate(f, adventure);
  await assert.rejects(
    f.api.prepareWorkWordCount('author', {
      target: adventure,
      operationId: operation(2),
      limit: 1,
    }),
    error('failed-precondition'),
  );
  const control = f.records.get(path + '/workProgress/current');
  assert.equal(control.processed, 0);
  assert.equal(control.cursor, null);
  assert.equal(control.wordCount, 0);
  assert.equal(control.countReady, false);
  assert.equal(f.records.has(path + '/workWordSources/' + workSourceKey('scene', 'scene')), false);
  assert.equal(
    (await f.api.getWorkProgress('author', { target: adventure })).manuscript.wordCount,
    null,
  );
  f.records.set(path + '/scenes/scene/body/current', { content: 'O corpo voltou' });
  assert.equal((await prepare(f, adventure)).wordCount, 3);
});
