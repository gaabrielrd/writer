import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatConversationFixture } from './helpers/editorChatConversationFixture.mjs';
import { uid, reason } from './helpers/editorChatFixture.mjs';
import { readEditorChatConversation } from '../src/editorChatConversations.mjs';
import {
  selectEditorChatModelHistory,
  editorChatModelAnswer,
} from '../src/editorChatHistoryRead.mjs';
import { DEFAULT_PERSONAS } from '../src/personaProfile.mjs';
import { editorChatHash, mergeEditorChatClosures } from '../src/editorChatContracts.mjs';
const bodyReads = (f) =>
  f.events.filter((e) => e.method === 'get' && e.path?.includes('/turnBodies/'));
const convPath = (f) => `users/${uid}/editorChats/${f.conversation.conversationId}`;
const history = (f) =>
  f.db.runTransaction(async (tx) =>
    selectEditorChatModelHistory(
      tx,
      f.db,
      uid,
      await readEditorChatConversation(
        tx,
        f.db,
        uid,
        f.conversation.conversationId,
        f.conversation.conversationToken,
        f.resourceScope,
      ),
    ),
  );

test('getTurn returns own question and frozen answer, ordinary lore edits only mark stale', async () => {
  const f = await editorChatConversationFixture({ world: true });
  await f.seedTurn('t');
  const first = await f.get('t');
  assert.equal(first.presentation, 'available');
  assert.equal(first.answer.freshness, 'current');
  f.records.get('universes/world/lore/aria').details = 'Outra versão';
  f.records.get('universes/world').loreVersion = 1;
  const stale = await f.get('t');
  assert.equal(stale.answer.freshness, 'stale');
  assert.deepEqual(stale.answer.context, first.answer.context);
  assert.equal(stale.answer.context.lore[0].detailsExcerpt, 'Fato secreto');
});

test('revoked/recreated source hides all derived prose but preserves own question without a body read', async () => {
  for (const kind of ['lore-revoked', 'lore-recreated', 'target-missing', 'target-recreated']) {
    const f = await editorChatConversationFixture({ world: true });
    await f.seedTurn('t');
    if (kind === 'lore-revoked') f.records.get('universes/world').deleting = true;
    if (kind === 'lore-recreated')
      f.metadata.set('universes/world/lore/aria', { createdAtNanoseconds: 222 });
    if (kind === 'target-missing') f.records.delete(f.path);
    if (kind === 'target-recreated') f.metadata.set(f.path, { createdAtNanoseconds: 222 });
    f.events.length = 0;
    const read = await f.get('t');
    assert.equal(read.question, 'Pergunta t');
    assert.equal(read.presentation, 'blocked');
    assert.equal(read.answer, null);
    assert.equal(bodyReads(f).length, 0);
  }
});

test('the SAME reauthorized origin can show an old answer again', async () => {
  const f = await editorChatConversationFixture({ world: true });
  await f.seedTurn('t');
  f.records.get('universes/world').deleting = true;
  assert.equal((await f.get('t')).presentation, 'blocked');
  f.records.get('universes/world').deleting = false;
  assert.equal((await f.get('t')).presentation, 'available');
});

test('own question corruption fails independently; manifest corruption never opens a derived body', async () => {
  const f = await editorChatConversationFixture();
  await f.seedTurn('t');
  const q = f.records.get(`${convPath(f)}/turnQuestions/t`);
  q.question = 'forged';
  await assert.rejects(f.get('t'), reason('inconsistent'));
  assert.equal(bodyReads(f).length, 0);
  q.question = 'Pergunta t';
  f.records.get(`${convPath(f)}/turns/t`).closureHash = '0'.repeat(64);
  f.events.length = 0;
  await assert.rejects(f.get('t'), reason('inconsistent'));
  assert.equal(bodyReads(f).length, 0);
});

test('model history is bounded, newest pairs selected but chronological input and markers counted exactly', async () => {
  const f = await editorChatConversationFixture();
  for (let i = 0; i < 11; i++)
    await f.seedTurn('t' + String(i).padStart(2, '0'), {
      createdAt: 3000 + i,
      answer: { text: 'Resposta', suggestion: 'Prosa' },
    });
  const selected = await history(f);
  assert.equal(selected.history.recordCount, 20);
  assert.equal(selected.messages.length, 20);
  assert.equal(selected.messages[0].text, 'Pergunta t01');
  assert.equal(selected.messages[18].text, 'Pergunta t10');
  assert.equal(selected.messages[1].text, 'Resposta\n\n[[SUGESTAO]]Prosa[[/SUGESTAO]]');
  assert.equal(
    selected.history.characterCount,
    selected.messages.reduce((n, m) => n + m.text.length, 0),
  );
  assert.equal(selected.history.omittedCharacterCount, null);
  assert.equal(selected.history.hasOlderHistory, true);
  assert.equal(editorChatModelAnswer({ text: 'x', suggestion: null }), 'x');
});

test('every historical closure is authorized before the first body and revoked ancestors are never skipped', async () => {
  const f = await editorChatConversationFixture({ world: true });
  await f.seedTurn('a', { createdAt: 3000 });
  const direct = structuredClone(f.inspection.frozen);
  direct.lore = [];
  direct.includedEntityCount = 0;
  const targetLeaves = direct.closure.leaves.filter((l) => l.kind !== 'lore');
  const { normalizeEditorChatClosure } = await import('../src/editorChatContracts.mjs');
  direct.closure = await normalizeEditorChatClosure(targetLeaves);
  delete direct.contextHash;
  direct.contextHash = await editorChatHash(direct);
  const transitive = await mergeEditorChatClosures(direct.closure, f.inspection.frozen.closure);
  await f.seedTurn('b', { createdAt: 4000, context: direct, closure: transitive });
  f.records.get('universes/world').deleting = true;
  f.events.length = 0;
  await assert.rejects(history(f), reason('history-revoked'));
  assert.equal(bodyReads(f).length, 0);
  assert.equal((await f.get('b')).presentation, 'blocked');
});

test('preset base changes on book and adventure are stale, not access revocation', async () => {
  for (const kind of ['book', 'adventure']) {
    const f = await editorChatConversationFixture({
      kind,
      setup(f) {
        f.records.get(f.path).personaId = DEFAULT_PERSONAS[0].id;
      },
    });
    await f.seedTurn('t');
    f.records.get(f.path).personaId = DEFAULT_PERSONAS[1].id;
    const read = await f.get('t');
    assert.equal(read.presentation, 'available');
    assert.equal(read.answer.freshness, 'stale');
    assert.equal(read.answer.context.persona.base.id, DEFAULT_PERSONAS[0].id);
  }
});

test('chapter complement changes and newly unavailable persona leave the captured origin visible', async () => {
  const f = await editorChatConversationFixture({
    setup(f) {
      f.records.get(f.path).personaId = DEFAULT_PERSONAS[0].id;
      f.records.get(`${f.path}/scenes/${f.resource.id}`).parentId = 'chapter';
      f.records.set(`${f.path}/chapters/chapter`, {
        ownerId: uid,
        contentMode: 'scenes',
        personaComplement: { personaId: DEFAULT_PERSONAS[1].id, overrides: [] },
      });
    },
  });
  await f.seedTurn('t');
  f.records.get(`${f.path}/chapters/chapter`).personaComplement = {
    personaId: DEFAULT_PERSONAS[2].id,
    overrides: [],
  };
  assert.equal((await f.get('t')).answer.freshness, 'stale');
  f.records.get(f.path).personaId = 'new-unavailable';
  f.events.length = 0;
  const read = await f.get('t');
  assert.equal(read.presentation, 'available');
  assert.equal(read.answer.freshness, 'stale');
  assert.equal(read.answer.context.persona.base.id, DEFAULT_PERSONAS[0].id);
  assert.equal(
    f.events.some(
      (e) => e.path === `users/${uid}/aiPersonas/new-unavailable` && e.method === 'get',
    ),
    false,
  );
});

test('model metadata counters are checked against real authorized prose before returning input', async () => {
  const f = await editorChatConversationFixture();
  await f.seedTurn('t');
  f.records.get(`${convPath(f)}/turns/t`).modelAnswerChars++;
  await assert.rejects(history(f), reason('inconsistent'));
});

test('running turn exposes only its own question and metadata, never frozen input', async () => {
  const f = await editorChatConversationFixture();
  await f.seedTurn('running', { state: 'running' });
  f.events.length = 0;
  const read = await f.get('running');
  assert.equal(read.presentation, 'available');
  assert.equal(read.answer, null);
  assert.equal(read.question, 'Pergunta running');
  assert.equal(bodyReads(f).length, 0);
  f.events.length = 0;
  await assert.rejects(
    f.call({ action: 'getTurn', ...f.scope, turnId: 'running' }, 'other'),
    reason('conversation-unavailable'),
  );
  assert.equal(
    f.events.some((e) => e.path?.includes('/turnQuestions/')),
    false,
  );
});

test('metadata source anchor corruption is rejected before own or derived bodies', async () => {
  const f = await editorChatConversationFixture();
  await f.seedTurn('t');
  f.records.get(`${convPath(f)}/turns/t`).proofCoverage.source.sourceToken = '0'.repeat(64);
  f.events.length = 0;
  await assert.rejects(f.get('t'), reason('inconsistent'));
  assert.equal(
    f.events.some((e) => /\/(turnQuestions|turnBodies)\//.test(e.path ?? '')),
    false,
  );
});
